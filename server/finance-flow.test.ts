import { TEST_DATA_DIR } from "./test-env.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "./app.js";
import { getStore, saveStore, transaction } from "./storage.js";
import { cashAmount, companyFinanceDate, financialHistoryValid, ledgerSummary } from "./finance-ledger.js";
import { mutateCollection } from "./workspace.js";
import { migrateFinance } from "./finance-migration.js";
import { createPayrollSource, decidePayrollSource, revisePayrollSource, saveSalary } from "./payroll.js";
type Row=Record<string,any>;
let server:Server,base="",cookie="",run:Row,entry:Row;
const rows=(name:string)=>getStore().collections[name] as Row[];
const actor=()=>({...rows("accessUsers").find(a=>a.roleId==="role-main-manager"),organizationIds:[],locationIds:[],permissions:["*"],ownRecordsOnly:false}) as any;
async function req(path:string,body?:unknown,method=body===undefined?"GET":"POST") { return fetch(`${base}/api${path}`,{method,headers:{Cookie:cookie,...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)})}); }
async function expect(response:Response,code=200):Promise<Row>{assert.equal(response.status,code,await response.clone().text());return response.json() as Promise<Row>;}
const bank={id:"flow-bank",organizationId:"company-primary",name:"Flow bank",type:"bank",currency:"QAR",openingBalance:"10000.00"};
const movement=(extra:Row={})=>({accountId:bank.id,type:"expense",amount:"0.10",date:"2026-01-01",status:"paid",reference:"FLOW-EXPENSE",idempotencyKey:"flow-payment-key-1",...extra});
before(async()=>{
 server=createApp().listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const setup=await req("/auth/setup",{name:"Flow admin",email:"flow@example.test",password:randomBytes(24).toString("hex"),setupKey:"local-setup"});await expect(setup,201);cookie=setup.headers.get("set-cookie")!.split(";")[0];
 const data=getStore();data.collections.accessRoles.push({id:"role-flow-fixture",name:"Finance test submitter",permissions:["finance.*","payroll.*"],status:"active"});data.collections.financeAccounts.push(bank);data.collections.employees.push({id:"flow-worker",name:"Flow worker",employeeCode:"FLOW-1",organizationId:"company-primary",status:"active"});
 run={id:"flow-run",organizationId:"company-primary",companyId:"company-primary",start:"2026-01-01",end:"2026-01-31",currency:"QAR",status:"Approved",version:1,approvedBy:(data.collections.accessUsers as Row[]).find(a=>a.roleId==="role-main-manager")!.id,totals:{netPay:"100.30"}};
 entry={id:"flow-entry",runId:run.id,employeeId:"flow-worker",employee:"Flow worker",organizationId:"company-primary",currency:"QAR",netPay:"100.30",snapshot:{salary:{base:"100.30"},company:{name:"Company"}},components:[],sourceIds:[]};
 data.collections.payrollRuns.push(run);data.collections.payrollEntries.push(entry);saveStore(data);
});
after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));const target=resolve(TEST_DATA_DIR);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes("stocrant-test-data-"));fs.rmSync(target,{recursive:true,force:true});});
describe("Connected financial ledger",()=>{
 it("supports Sudanese pounds from company currency through payroll and exact ledger balances",async()=>{
   const org=(await expect(await req("/collections/organizations",{name:"Sudan currency organization",status:"active"}),201)).item;
   const company=(await expect(await req("/collections/companies",{name:"Sudan currency company",parentOrganizationId:org.id,status:"active",organizationType:"office",industry:"services",currency:"SDG"}),201)).item;
   assert.equal(company.currency,"SDG");
   const metadata=await expect(await req("/collections/meta/companies"));
   assert.ok(JSON.stringify(metadata).includes('"SDG"'));
   const initial=(await expect(await req(`/workspace/payroll/rules/${company.id}`))).rules;
   assert.equal(initial.currency,"SDG");
   const {organizationId:_organizationId,configured:_configured,...rules}=initial;
   assert.equal((await expect(await req(`/workspace/payroll/rules/${company.id}`,rules,"PUT"))).rules.currency,"SDG");
   const employee=(await expect(await req("/collections/employees",{name:"Sudan payroll employee",organizationId:company.id,status:"active",hireDate:"2026-01-01"}),201)).item;
   const salary=(await expect(await req(`/workspace/payroll/salaries/${employee.id}`,{currency:"SDG",frequency:"monthly",base:"1234.56",overtimeEligible:false,shiftId:"",allowances:[],effectiveFrom:"2026-01-01",reason:"Confirmed Sudanese pound salary"}),201)).item;
   assert.equal(salary.currency,"SDG");assert.equal(salary.base,"1234.56");
   const account=(await expect(await req("/workspace/finance/accounts",{name:"Sudan cash account",type:"cash",currency:"SDG",openingBalance:"1000.10",organizationId:company.id}),201)).item;
   const paid=(await expect(await req("/workspace/finance/transactions",movement({accountId:account.id,amount:"123.45",reference:"SDG-EXPENSE",idempotencyKey:"sdg-expense-key"})),201)).item;
   assert.equal(paid.currency,"SDG");
   const summary=ledgerSummary(actor());assert.equal(summary.accounts.find(row=>row.id===account.id)!.balance,"876.65");
   assert.equal(summary.totals.find(row=>row.currency==="SDG")!.expenses,"123.45");
   assert.equal(cashAmount("1.20","SDG"),"1.20");assert.throws(()=>cashAmount("1.001","SDG"));
 });
 it("validates exact currency units and additive migration without rewriting history",()=>{
   assert.equal(cashAmount("1.234","KWD"),"1.234");assert.equal(cashAmount("1","JPY"),"1");for(const v of ["1.001","1e5",Infinity,NaN])assert.throws(()=>cashAmount(v,"QAR"));assert.throws(()=>cashAmount("0","QAR",true));
   assert.equal(companyFinanceDate("company-primary",new Date("2026-01-01T22:30:00Z")),"2026-01-02");
   const data={stores:[],zones:[],people:[],collections:{financeTransactions:[{id:"legacy",amount:10}]}} as any;const original=JSON.stringify(data.collections.financeTransactions);assert.equal(migrateFinance(data),true);assert.equal(migrateFinance(data),false);assert.equal(JSON.stringify(data.collections.financeTransactions),original);
 });
 it("replays concurrent expense submissions and rejects changed payloads and duplicate references",async()=>{
   const replies=await Promise.all([req("/workspace/finance/transactions",movement()),req("/workspace/finance/transactions",movement())]);const values=await Promise.all(replies.map(r=>expect(r,201)));assert.equal(values[0].item.id,values[1].item.id);assert.equal(rows("financeTransactions").filter(t=>t.reference==="FLOW-EXPENSE").length,1);
   await expect(await req("/workspace/finance/transactions",movement({amount:"0.20"})),409);await expect(await req("/workspace/finance/transactions",movement({idempotencyKey:"different-key"})),409);
   await expect(await req("/workspace/finance/transactions",movement({amount:"0.001",reference:"PRECISION-FAIL",idempotencyKey:"precision-fail"})),400);
 });
 it("derives partial payroll liabilities from one cash posting and retries safely",async()=>{
   const input={version:1,accountId:bank.id,amount:"30.10",paymentDate:"2026-01-02",reference:"PAY-PART-1",method:"bank",reason:"Bank confirmation first installment",confirmed:true,idempotencyKey:"payroll-part-key"};
   const replies=await Promise.all([req(`/workspace/payroll/runs/${run.id}/payments`,input),req(`/workspace/payroll/runs/${run.id}/payments`,input)]);const values=await Promise.all(replies.map(r=>expect(r)));assert.equal(values[0].transaction.id,values[1].transaction.id);assert.equal(values[0].run.status,"Partially Paid");assert.equal(values[0].run.outstanding,"70.20");
   await expect(await req(`/workspace/payroll/runs/${run.id}/payments`,{...input,amount:"30.20"}),409);
   const dashboard=await expect(await req("/workspace/payroll"));const line=dashboard.entries.find((e:Row)=>e.id===entry.id);assert.equal(line.paidAmount,"30.10");assert.equal(line.outstanding,"70.20");assert.equal(line.payments.length,1);
   const report=ledgerSummary(actor());assert.equal(report.totals.find(t=>t.currency==="QAR")!.salaries,"30.10");assert.equal(report.accounts.find(a=>a.id===bank.id)!.balance,"9969.80");
   assert.equal(report.obligations.find(r=>r.organizationId==="company-primary"&&r.currency==="QAR")!.payroll,"70.20");
 });
 it("blocks overpayment, draft payment and forged financial writes without partial changes",async()=>{
   const input={version:2,accountId:bank.id,amount:"70.21",paymentDate:"2026-01-03",reference:"PAY-OVER",method:"bank",reason:"Overpayment must fail",confirmed:true,idempotencyKey:"payroll-over-key"};const before=JSON.stringify(rows("financeTransactions"));
   await expect(await req(`/workspace/payroll/runs/${run.id}/payments`,input),409);assert.equal(JSON.stringify(rows("financeTransactions")),before);
   getStore().collections.payrollRuns.push({...run,id:"flow-draft",status:"Draft",version:1});getStore().collections.payrollEntries.push({...entry,id:"flow-draft-entry",runId:"flow-draft"});saveStore(getStore());await expect(await req(`/workspace/payroll/runs/flow-draft/payments`,{...input,version:1,amount:"1"}),409);
   const paid=rows("financeTransactions").find(t=>t.payrollRunId===run.id)!;assert.throws(()=>mutateCollection(actor(),"financeTransactions","edit",{amount:1},paid.id),/immutable/);assert.throws(()=>mutateCollection(actor(),"financeAccounts","edit",{openingBalance:0},bank.id),/cannot be changed/);assert.throws(()=>mutateCollection(actor(),"financeHistory","delete",{},rows("financeHistory")[0].id),/immutable/);
 });
 it("finishes payroll, reverses a payment and restores the precise liability",async()=>{
   const result=await expect(await req(`/workspace/payroll/runs/${run.id}/payments`,{version:2,entryId:entry.id,accountId:bank.id,amount:"70.20",paymentDate:"2026-01-03",reference:"PAY-PART-2",method:"cash",reason:"Final salary installment confirmed",confirmed:true,idempotencyKey:"payroll-final-key"}));assert.equal(result.run.status,"Paid");assert.equal(result.run.outstanding,"0.00");
   const tx=result.transaction;const body={date:"2026-01-04",reference:"REVERSE-PAY-2",reason:"Cash payment returned by employee",idempotencyKey:"reverse-pay-key"};const reversed=await expect(await req(`/workspace/finance/transactions/${tx.id}/reverse`,body));assert.equal(reversed.item.reversalOf,tx.id);assert.equal((await expect(await req(`/workspace/finance/transactions/${tx.id}/reverse`,body))).item.id,reversed.item.id);
   await expect(await req(`/workspace/finance/transactions/${tx.id}/reverse`,{...body,idempotencyKey:"another-reversal-key"}),409);
   const current=rows("payrollRuns").find(r=>r.id===run.id)!;assert.equal(current.status,"Partially Paid");assert.equal(current.outstanding,"70.20");assert.equal(rows("payrollEntries").find(e=>e.id===entry.id)!.netPay,"100.30");
 });
 it("settles approved expenses without counting the source as another cash payment",async()=>{
   const data=getStore();data.collections.expenses.push({id:"flow-expense",title:"Expense source",organizationId:"company-primary",amount:"100.00",currency:"QAR",status:"approved",date:"2026-01-01"});saveStore(data);
   const input=movement({amount:"40",reference:"SOURCE-PAY-1",idempotencyKey:"source-payment-key",sourceCollection:"expenses",sourceId:"flow-expense"});await expect(await req("/workspace/finance/transactions",input),201);await expect(await req("/workspace/finance/transactions",input),201);
   let report=ledgerSummary(actor()),source=report.sources.find(s=>s.id==="flow-expense")!;assert.equal(source.paid,"40.00");assert.equal(source.outstanding,"60.00");assert.equal(report.totals.find(t=>t.currency==="QAR")!.expenses,"40.10");
   await expect(await req("/workspace/finance/transactions",{...input,amount:"60.01",reference:"SOURCE-OVER",idempotencyKey:"source-over-key"}),409);
   assert.throws(()=>mutateCollection(actor(),"expenses","edit",{amount:1},"flow-expense"),/cannot be rewritten/);
   const tx=rows("financeTransactions").find(t=>t.reference==="SOURCE-PAY-1")!;await expect(await req(`/workspace/finance/transactions/${tx.id}/reverse`,{date:"2026-01-05",reference:"SOURCE-REVERSE",reason:"Supplier returned the payment",idempotencyKey:"source-reverse-key"}));report=ledgerSummary(actor());source=report.sources.find(s=>s.id==="flow-expense")!;assert.equal(source.outstanding,"100.00");assert.equal(report.totals.find(t=>t.currency==="QAR")!.expenses,"0.10");
 });
 it("keeps currency totals separate and reconciles exact decimal sums",async()=>{
   await expect(await req("/workspace/finance/transactions",movement({type:"income",amount:"0.20",reference:"FLOW-INCOME",idempotencyKey:"income-flow-key"})),201);
   const report=ledgerSummary(actor());const qar=report.totals.find(t=>t.currency==="QAR")!;assert.equal(qar.net,"-30.00");assert.equal(report.accounts.find(a=>a.id===bank.id)!.balance,"9970.00");assert.equal(report.net,null);assert.ok(report.totals.length>1);
 });
 it("connects advance installments and cash repayments without over-recovering",async()=>{
   saveSalary(actor(),"flow-worker",{currency:"QAR",frequency:"monthly",base:"100",overtimeEligible:false,allowances:[],effectiveFrom:"2026-01-01",reason:"Confirmed contract for recovery"});
   const tx=(await expect(await req("/workspace/finance/transactions",movement({type:"advance",employeeId:"flow-worker",amount:"100",reference:"FLOW-ADVANCE",idempotencyKey:"advance-flow-key"})),201)).item;
   const input={employeeId:"flow-worker",date:"2026-02-01",type:"advance",amount:"30",reference:"ADVANCE-INSTALLMENT-1",reason:"Approved installment recovery",financeTransactionId:tx.id};
   const source=createPayrollSource({...actor(),id:"non-main-source",roleId:"role-flow-fixture",organizationIds:["company-primary"]},input);
   assert.throws(()=>createPayrollSource(actor(),{...input,amount:"71",reference:"ADVANCE-OVER"}),/exceed/);
   assert.throws(()=>revisePayrollSource(actor(),source.id,{amount:"101",minutes:0,reason:"Must refuse excessive revision"}),/exceed/);
   const reviewer={...actor(),id:"independent-reviewer"};decidePayrollSource(reviewer,source.id,true,"Confirmed repayment schedule");
   const repayment=movement({type:"repayment",direction:"in",employeeId:"flow-worker",recoversTransactionId:tx.id,amount:"70",reference:"ADVANCE-CASH-REPAY",idempotencyKey:"advance-cash-key"});await expect(await req("/workspace/finance/transactions",repayment),201);
   await expect(await req("/workspace/finance/transactions",{...repayment,amount:"0.01",reference:"ADVANCE-OVER-REPAY",idempotencyKey:"advance-over-cash-key"}),409);
   await expect(await req(`/workspace/finance/transactions/${tx.id}/reverse`,{date:"2026-01-06",reference:"REVERSE-ADVANCE",reason:"Cannot reverse allocated advance",idempotencyKey:"advance-reverse-key"}),409);
   assert.throws(()=>createPayrollSource(actor(),{...input,financeTransactionId:"missing",reference:"MISSING-DISBURSEMENT"}),/confirmed/);
 });
 it("revalidates pending source settlements on approval and preserves idempotent requests",async()=>{
   const data=getStore();data.collections.approvalRules.push({id:"flow-finance-approval",section:"finance",action:"create",active:true});data.collections.expenses.push({id:"flow-approval-expense",organizationId:"company-primary",currency:"QAR",amount:"10",status:"approved"});saveStore(data);
   const input=movement({sourceCollection:"expenses",sourceId:"flow-approval-expense",reference:"APPROVAL-PAY",amount:"10",idempotencyKey:"approval-replay-key"});
   const creator={...actor(),id:"finance-submitter",roleId:"role-flow-fixture",organizationIds:["company-primary"]};const submit=()=>mutateCollection(creator,"financeTransactions","create",{...input,organizationId:"company-primary",direction:"out"});
   const first=submit() as any,second=submit() as any;assert.equal(first.pending,true);assert.equal(first.request.id,second.request.id);
   // A source change before approval cannot authorize an excessive payment.
   rows("expenses").find(s=>s.id==="flow-approval-expense")!.amount="5";saveStore(getStore());
   const {approveRequest}=await import("./workspace.js");assert.throws(()=>approveRequest({...actor(),id:"separate-finance-approver"},first.request.id,true,"Independent review"),/exceeds/);
   assert.equal(rows("approvalRequests").find(r=>r.id===first.request.id)!.status,"pending");assert.equal(rows("financeTransactions").some(t=>t.reference==="APPROVAL-PAY"),false);
   rows("expenses").find(s=>s.id==="flow-approval-expense")!.amount="10";saveStore(getStore());approveRequest({...actor(),id:"separate-finance-approver"},first.request.id,true,"Independent review");
   const replay=submit() as any;assert.equal(replay.item.reference,"APPROVAL-PAY");
   getStore().collections.approvalRules=rows("approvalRules").filter(r=>r.id!=="flow-finance-approval");saveStore(getStore());
 });
 it("rolls back both memory and disk on persistence failure and detects history tampering",async()=>{
   const before=JSON.stringify(getStore()),diskBefore=fs.readFileSync(join(TEST_DATA_DIR,"data","stocrant.json"),"utf8"),rename=fs.renameSync;
   try{fs.renameSync=((from:fs.PathLike,to:fs.PathLike)=>{if(String(from).endsWith("stocrant.json.tmp"))throw Error("Injected disk failure");return rename(from,to);}) as typeof fs.renameSync;syncBuiltinESMExports();
     assert.throws(()=>transaction(()=>mutateCollection(actor(),"financeTransactions","create",{...movement({reference:"FAIL-DISK",idempotencyKey:"fail-disk-key"}),organizationId:"company-primary",direction:"out"})),/Injected disk failure/);
   }finally{fs.renameSync=rename;syncBuiltinESMExports();}
   assert.equal(JSON.stringify(getStore()),before);assert.equal(fs.readFileSync(join(TEST_DATA_DIR,"data","stocrant.json"),"utf8"),diskBefore);assert.equal(financialHistoryValid(),true);
   const history=rows("financeHistory")[0],original=history.reason;history.reason="tampered";assert.equal(financialHistoryValid(),false);history.reason=original;assert.equal(financialHistoryValid(),true);
 });
 it("allocates historical full-run reversals without rewriting the original cash record",async()=>{
   const data=getStore();data.collections.payrollRuns.push({...run,id:"legacy-flow-run",status:"Paid",version:1,totals:{netPay:"20.00"}});data.collections.payrollEntries.push({...entry,id:"legacy-flow-entry",runId:"legacy-flow-run",netPay:"20.00"});
   const original={id:"legacy-flow-payment",organizationId:"company-primary",accountId:bank.id,type:"payroll",direction:"out",amount:"20.00",currency:"QAR",date:"2026-01-01",status:"paid",reference:"LEGACY-PAY",payrollRunId:"legacy-flow-run"};data.collections.financeTransactions.push(original);saveStore(data);
   const before=JSON.stringify(original);await expect(await req("/workspace/finance/transactions/legacy-flow-payment/reverse",{date:"2026-01-07",reference:"LEGACY-REVERSED",reason:"Historical payment returned",idempotencyKey:"legacy-reversal-key"}));
   const dashboard=await expect(await req("/workspace/payroll")),line=dashboard.entries.find((e:Row)=>e.id==="legacy-flow-entry");assert.equal(line.paidAmount,"0.00");assert.equal(line.outstanding,"20.00");assert.equal(JSON.stringify(rows("financeTransactions").find(t=>t.id===original.id)),before);
 });
 it("enforces balanced transfers and payslip allocations at the persistence boundary",()=>{
   const before=JSON.stringify(getStore());
   assert.throws(()=>transaction(()=>{getStore().collections.financeTransactions.push({ledgerVersion:1,id:"unpaired-transfer",organizationId:"company-primary",accountId:bank.id,destinationAccountId:"missing",type:"transfer",transferGroupId:"bad-transfer",direction:"out",amount:"10.00",currency:"QAR",date:"2026-01-01",status:"paid"});saveStore(getStore());}),/unbalanced transfer/);
   assert.equal(JSON.stringify(getStore()),before);
   assert.throws(()=>transaction(()=>{const payment=rows("financeTransactions").find(t=>t.reference==="PAY-PART-1")!;payment.allocations[0].amount="31.00";saveStore(getStore());}),/allocations do not balance/);
   assert.equal(JSON.stringify(getStore()),before);
 });
 it("connects customer receipts, supplier payments and refunds to source balances",async()=>{
   for(const [collection,state,key,type,direction] of [["sales","completed","total","income","in"],["purchases","received","total","expense","out"],["returns","approved","refund","refund","out"]]){
     const id=`flow-${collection}`;getStore().collections[collection].push({id,organizationId:"company-primary",currency:"QAR",status:state,[key]:"10.00"});saveStore(getStore());
     await expect(await req("/workspace/finance/transactions",movement({type,direction,sourceCollection:collection,sourceId:id,amount:"4.25",reference:`SOURCE-${collection}`,idempotencyKey:`source-${collection}-key`})),201);
     const source=ledgerSummary(actor()).sources.find(s=>s.id===id)!;assert.equal(source.paid,"4.25");assert.equal(source.outstanding,"5.75");
     await expect(await req("/workspace/finance/transactions",movement({type,direction:direction==="in"?"out":"in",sourceCollection:collection,sourceId:id,amount:"6",reference:`SOURCE-${collection}-OVER`,idempotencyKey:`source-${collection}-over-key`})),collection==="returns"?400:409);
   }
 });
 it("uses one operating classification and exposes only eligible unpaid obligations, even without a bank account",async()=>{
   const data=getStore();data.collections.financeAccounts.push({id:"connected-kwd",organizationId:"company-primary",name:"Connected KWD",currency:"KWD",openingBalance:"0.000",type:"bank"});
   for(const [collection,id,status,key,amount] of [["sales","connected-sale","completed","total","100.000"],["purchases","connected-purchase","received","total","20.000"],["returns","connected-return","approved","refund","2.000"],["sales","connected-unpaid-sale","completed","total","4.000"],["purchases","connected-unpaid-bill","ordered","total","7.500"],["purchases","connected-draft","draft","total","99.000"],["purchases","connected-cancelled","cancelled","total","99.000"]])data.collections[collection].push({id,organizationId:"company-primary",currency:"KWD",status,[key]:amount});
   data.collections.purchases.push({id:"connected-no-bank",organizationId:"company-primary",currency:"BHD",status:"ordered",total:"9.000"});saveStore(data);
   const salaryCompany=rows("financeAccounts").find(a=>a.currency==="SDG")!.organizationId;
   data.collections.expenses.push({id:"connected-payroll-expense",organizationId:salaryCompany,currency:"SDG",status:"approved",category:"salaries",amount:"50.00"});saveStore(data);
   const payments=[{type:"income",amount:"100.000",sourceCollection:"sales",sourceId:"connected-sale"},{type:"expense",amount:"20.000",sourceCollection:"purchases",sourceId:"connected-purchase"},{type:"refund",direction:"out",amount:"2.000",sourceCollection:"returns",sourceId:"connected-return"},{type:"expense",amount:"5.125"},{type:"loan",direction:"in",amount:"50.000"},{type:"advance",amount:"10.000"},{type:"repayment",direction:"out",amount:"5.000"}];
   for(const [i,payment] of payments.entries())await expect(await req("/workspace/finance/transactions",movement({...payment,accountId:"connected-kwd",reference:`CONNECTED-${i}`,idempotencyKey:`connected-payment-${i}`})),201);
   const report=ledgerSummary(actor()),kwd=report.totals.find(r=>r.currency==="KWD")!;
   assert.equal(kwd.income,"98.000");assert.equal(kwd.expenses,"25.125");assert.equal(kwd.profit,"72.875");assert.equal(kwd.net,"107.875");assert.equal(kwd.otherCash,"35.000");
   const obligation=report.obligations.find(r=>r.currency==="KWD")!;assert.equal(obligation.receivable,"4.000");assert.equal(obligation.payable,"7.500");
   assert.equal(report.obligations.find(r=>r.currency==="BHD")!.payable,"9.000");
   assert.equal(report.sources.find(s=>s.id==="connected-draft")!.canSettle,false);assert.equal(report.sources.find(s=>s.id==="connected-unpaid-bill")!.canSettle,true);
   assert.equal(report.sources.find(s=>s.id==="connected-payroll-expense")!.canSettle,false);assert.ok(!report.obligations.some(r=>r.organizationId===salaryCompany&&Number(r.payable)>0));
   const restricted=ledgerSummary({...actor(),roleId:"role-finance-manager",permissions:["finance.view"],organizationIds:["company-primary"]});assert.ok(restricted.obligations.every(r=>Number(r.payroll)===0));
 });
 it("rejects orphaned source links and source overpayments at the storage boundary without partial writes",()=>{
   const before=JSON.stringify(getStore());
   assert.throws(()=>transaction(()=>{rows("sales").find(s=>s.id==="connected-sale")!.total="99.000";saveStore(getStore());}),/source settlement exceeds/);assert.equal(JSON.stringify(getStore()),before);
   assert.throws(()=>transaction(()=>{rows("financeTransactions").find(t=>t.reference==="CONNECTED-0")!.sourceId="missing-source";saveStore(getStore());}),/source company\/currency\/type mismatch/);assert.equal(JSON.stringify(getStore()),before);
 });
 it("posts Main Admin finance changes and attendance immediately under active approval rules",async()=>{
   const data=getStore();for(const section of ["finance","inventory","hr","locations","operations"])data.collections.approvalRules.push({id:`main-bypass-${section}`,section,action:"create",active:true});saveStore(data);
   const {requiresApproval}=await import("./workspace.js");for(const section of ["finance","inventory","hr","locations","operations"] as const){assert.equal(requiresApproval(section,"create",actor()),false);assert.equal(requiresApproval(section,"create"),true);}
   const result=await expect(await req("/workspace/finance/transactions",movement({reference:"MAIN-NO-APPROVAL",idempotencyKey:"main-no-approval-key"})),201);assert.equal(result.pending,false);assert.ok(result.item.id);
   const {createManualAttendance}=await import("./attendance.js");const attendance=createManualAttendance(actor(),{organizationId:"company-primary",employeeId:"flow-worker",date:"2026-01-05",checkIn:"08:00",checkOut:"17:00"});assert.equal(attendance.approvalStatus,"Approved");
   assert.ok(!rows("approvalRequests").some(r=>r.requestedBy===actor().id&&r.payload?.reference==="MAIN-NO-APPROVAL"));
 });
 it("requires Finance authorization for payment decisions and blocks generic salary bypasses",async()=>{
   const data=getStore();data.collections.accessRoles.push({id:"role-payment-submit",name:"Payment submitter",permissions:["finance.view","finance.create"]},{id:"role-payment-review",name:"Nonfinance reviewer",permissions:["approvals.view","approvals.approve"]});saveStore(data);
   const submitter={...actor(),id:"payment-submit-user",roleId:"role-payment-submit",organizationIds:["company-primary"]};
   const reviewer={...actor(),id:"payment-review-user",roleId:"role-payment-review",organizationIds:["company-primary"]};
   const result=mutateCollection(submitter,"financeTransactions","create",movement({reference:"MANDATORY-FINANCE-REVIEW",idempotencyKey:"mandatory-finance-review-key"}));
   assert.equal(result.pending,true);assert.ok(!rows("financeTransactions").some(t=>t.reference==="MANDATORY-FINANCE-REVIEW"));
   const {approveRequest}=await import("./workspace.js");
   assert.throws(()=>approveRequest(reviewer,(result as any).request.id,true,"Generic approval must not pay"),/Finance approval/);
   approveRequest(actor(),(result as any).request.id,true,"Finance authority confirms payment");
   assert.ok(rows("financeTransactions").some(t=>t.reference==="MANDATORY-FINANCE-REVIEW"));
   for(const payload of [movement({type:"payroll",reference:"BYPASS-SALARY-1",idempotencyKey:"bypass-salary-one"}),movement({category:"salary",reference:"BYPASS-SALARY-2",idempotencyKey:"bypass-salary-two"})])assert.throws(()=>mutateCollection(actor(),"financeTransactions","create",payload),/Payroll|payroll/);
 });


});
