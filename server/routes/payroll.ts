import { recordPayrollPayment } from "../payroll-payments.js";
import { Router } from "express";
import { z } from "zod";
import { dateSchema, amountSchema } from "../payroll-model.js";
import { createPayrollSource, decidePayrollSource, generatePayroll, endOfServiceReport, payrollBankFile, payrollCsv, payrollDashboard, payrollDetail, payrollRules, previewPayroll, recalculatePayroll, revisePayrollSource, salaryProfiles, savePayrollRules, saveSalary, transitionPayroll } from "../payroll.js";
const router=Router();
function endpoint(fn:(req:import("express").Request,res:import("express").Response)=>unknown){return (req:import("express").Request,res:import("express").Response)=>{try{return fn(req,res);}catch(error){if(error instanceof z.ZodError)return res.status(400).json({error:error.issues.map(i=>i.message).join("; ")});return res.status((error as {statusCode?:number}).statusCode??400).json({error:error instanceof Error?error.message:"Payroll request failed."});}};}
const reason=z.string().trim().min(5).max(1000);
router.get("/",endpoint((req,res)=>res.json(payrollDashboard(req.auth!))));
router.get("/end-of-service",endpoint((req,res)=>res.json(endOfServiceReport(req.auth!,typeof req.query.company==="string"?req.query.company:undefined))));
router.get("/rules/:companyId",endpoint((req,res)=>res.json({rules:payrollRules(req.auth!,String(req.params.companyId))})));
router.put("/rules/:companyId",endpoint((req,res)=>res.json({rules:savePayrollRules(req.auth!,String(req.params.companyId),req.body)})));
router.get("/salaries/:companyId",endpoint((req,res)=>res.json({items:salaryProfiles(req.auth!,String(req.params.companyId))})));
router.post("/salaries/:employeeId",endpoint((req,res)=>res.status(201).json({item:saveSalary(req.auth!,String(req.params.employeeId),req.body)})));
router.post("/sources",endpoint((req,res)=>res.status(201).json({item:createPayrollSource(req.auth!,req.body)})));
router.post("/sources/:id/review",endpoint((req,res)=>{const input=z.object({approve:z.boolean(),reason}).strict().parse(req.body);return res.json({item:decidePayrollSource(req.auth!,String(req.params.id),input.approve,input.reason)});}));
router.post("/sources/:id/revise",endpoint((req,res)=>{const input=z.object({amount:amountSchema,minutes:z.number().int().min(0).max(1440),reason}).strict().parse(req.body);return res.status(201).json({item:revisePayrollSource(req.auth!,String(req.params.id),input)});}));
router.post("/preview",endpoint((req,res)=>res.json(previewPayroll(req.auth!,req.body))));
router.post("/runs",endpoint((req,res)=>{const {period,previewToken}=z.object({period:z.unknown(),previewToken:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.body);return res.status(201).json({run:generatePayroll(req.auth!,period,previewToken)});}));
router.post("/runs/:id/recalculate",endpoint((req,res)=>{const input=z.object({version:z.number().int().positive(),reason}).strict().parse(req.body);return res.json({run:recalculatePayroll(req.auth!,String(req.params.id),input.version,input.reason)});}));
router.post("/runs/:id/transition",endpoint((req,res)=>{const input=z.object({action:z.enum(["submit","approve","reject","pay"]),version:z.number().int().positive(),reason,accountId:z.string().optional(),paymentDate:dateSchema.optional(),reference:z.string().trim().max(160).optional(),externalReference:z.string().trim().max(160).optional(),method:z.enum(["bank","cash","cheque","other"]).optional(),confirmed:z.boolean().optional()}).strict().parse(req.body);return res.json({run:transitionPayroll(req.auth!,String(req.params.id),input)});}));
router.post("/runs/:id/payments",endpoint((req,res)=>{
 const input=z.object({version:z.number().int().positive(),reason,accountId:z.string().min(1),paymentDate:dateSchema,reference:z.string().trim().max(160).optional(),externalReference:z.string().trim().max(160).optional(),method:z.enum(["bank","cash","cheque","other"]),confirmed:z.literal(true),amount:amountSchema,entryId:z.string().optional(),idempotencyKey:z.string().min(8).max(160)}).strict().parse(req.body);
 return res.json(recordPayrollPayment(req.auth!,String(req.params.id),input));
}));
router.get("/runs/:id/export",endpoint((req,res)=>res.type("text/csv").attachment("stocrant-payroll.csv").send(payrollCsv(req.auth!,String(req.params.id)))));
router.get("/runs/:id/bank-file",endpoint((req,res)=>res.type("text/csv").attachment("stocrant-salary-transfers.csv").send(payrollBankFile(req.auth!,String(req.params.id)))));
router.get("/entries/:id",endpoint((req,res)=>res.json(payrollDetail(req.auth!,String(req.params.id)))));
export default router;
