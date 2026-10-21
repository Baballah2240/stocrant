import type { StoreData } from "./storage.js";
import { money, precision, scaled } from "./payroll-model.js";
type Row=Record<string,any>;
/** Commit-time constraints on new ledger records; legacy anomalies remain available for reconciliation. */
export function assertFinanceIntegrity(data: StoreData) {
 const rows=(name:string)=>(data.collections[name]||[]) as Row[];
 const transactions=rows("financeTransactions"),modern=transactions.filter(t=>t.ledgerVersion===1);
 const modernRuns=new Set(modern.map(t=>t.payrollRunId));
 const byId=new Map(transactions.map(t=>[t.id,t])),accounts=new Map(rows("financeAccounts").map(a=>[a.id,a])),runs=new Map(rows("payrollRuns").map(r=>[r.id,r])),entries=new Map(rows("payrollEntries").map(e=>[e.id,e]));
 const transfers=new Map<string,Row[]>(),references=new Map<string,Row[]>(),reversals=new Map<string,Row[]>(),paidByEntry=new Map<string,bigint>(),entriesByRun=new Map<string,Row[]>();
 for(const e of entries.values())entriesByRun.set(e.runId,[...(entriesByRun.get(e.runId)||[]),e]);
 for(const t of transactions){
   if(t.transferGroupId)transfers.set(t.transferGroupId,[...(transfers.get(t.transferGroupId)||[]),t]);
   if(t.reference){const key=String(t.organizationId)+":"+String(t.reference).trim().toLowerCase();references.set(key,[...(references.get(key)||[]),t]);}
   if(t.reversalOf)reversals.set(t.reversalOf,[...(reversals.get(t.reversalOf)||[]),t]);
   if(t.payrollRunId&&modernRuns.has(t.payrollRunId)&&t.status==="paid"){
     const allocations=t.allocations||(entriesByRun.get(t.payrollRunId)||[]).map(e=>({entryId:e.id,amount:e.netPay}));
     for(const a of allocations){const e=entries.get(a.entryId);if(e)paidByEntry.set(e.id,(paidByEntry.get(e.id)||0n)+(t.direction==="in"?-1n:1n)*scaled(a.amount,precision(e.currency)));}
   }
 }
 const unique=(values:string[],label:string)=>{if(new Set(values).size!==values.length)throw Error(`Financial integrity: duplicate ${label}.`);};
 unique(modern.map(t=>t.id),"transaction ID");
 unique(modern.filter(t=>t.idempotencyKey).map(t=>`${t.submittedBy||t.createdBy}:${t.idempotencyKey}`),"payment key");
 for(const t of modern){
   const account=accounts.get(t.accountId);
   if(!account||account.organizationId!==t.organizationId||account.currency!==t.currency)throw Error("Financial integrity: account company/currency mismatch.");
   const digits=precision(t.currency),amount=scaled(t.amount,digits);
   if(amount<=0n||money(amount,digits)!==t.amount||!["in","out"].includes(t.direction))throw Error("Financial integrity: invalid amount or direction.");
   if(t.reference&&(references.get(String(t.organizationId)+":"+String(t.reference).trim().toLowerCase())||[]).some(other=>other.id!==t.id&&!(t.transferGroupId&&t.transferGroupId===other.transferGroupId)))throw Error("Financial integrity: duplicate company payment reference.");
   if(t.transferGroupId){
     const pair=transfers.get(t.transferGroupId)||[];
     if(pair.length!==2||pair[0].direction===pair[1].direction||pair[0].amount!==pair[1].amount||pair[0].currency!==pair[1].currency||pair[0].accountId!==pair[1].destinationAccountId||pair[1].accountId!==pair[0].destinationAccountId||pair[0].status!==pair[1].status)throw Error("Financial integrity: unbalanced transfer pair.");
   }
   if(t.payrollRunId){
     const run=runs.get(t.payrollRunId);
     if(!run||!["Approved","Partially Paid","Paid"].includes(run.status)||run.currency!==t.currency||run.organizationId!==t.organizationId||!Array.isArray(t.allocations)||!t.allocations.length)throw Error("Financial integrity: unapproved or invalid payroll payment.");
     unique(t.allocations.map((a:Row)=>a.entryId),"payslip allocation");
     let allocated=0n;
     for(const a of t.allocations){
       const entry=entries.get(a.entryId);
       if(!entry||entry.runId!==run.id||entry.employeeId!==a.employeeId||entry.currency!==t.currency||scaled(a.amount,digits)<=0n)throw Error("Financial integrity: invalid payslip allocation.");
       allocated+=scaled(a.amount,digits);
       const paid=paidByEntry.get(a.entryId)||0n;
       if(paid<0n||paid>scaled(entry.netPay,digits))throw Error("Financial integrity: payslip overpayment.");
     }
     if(allocated!==amount)throw Error("Financial integrity: payment allocations do not balance.");
   }
   if(t.reversalOf){
     const original=byId.get(t.reversalOf);
     if(!original||original.status!=="paid"||scaled(original.amount,digits)!==amount||original.accountId!==t.accountId||(original.currency||account.currency)!==t.currency||original.direction===t.direction||original.reversalOf||(reversals.get(original.id)||[]).length!==1)throw Error("Financial integrity: invalid or duplicate reversal.");
   }
 }
}
