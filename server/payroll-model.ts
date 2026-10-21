import { z } from "zod";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Choose a valid date.");
export const amountSchema = z.union([z.string(), z.number()]).transform(String).refine(v => /^\d{1,12}(\.\d{1,4})?$/.test(v), "Use a nonnegative decimal amount with at most four decimal places.");
const currency = z.string().regex(/^[A-Z]{3}$/).refine(value => ["QAR","USD","EUR","GBP","AED","SAR","KWD","BHD","OMR","JPY","KRW","INR","PKR","BDT","PHP","EGP"].includes(value), "Select a supported currency.");
export function precision(code: string) { return ["KWD","BHD","OMR"].includes(code) ? 3 : ["JPY","KRW"].includes(code) ? 0 : 2; }
export const rulesSchema = z.object({
  currency, frequency: z.enum(["weekly","biweekly","monthly","custom"]).default("monthly"),
  timezone: z.string().refine(v => { try { new Intl.DateTimeFormat("en",{timeZone:v}); return true; } catch { return false; } }),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(v => new Set(v).size === v.length),
  standardMinutes: z.number().int().min(60).max(1440), breakMinutes: z.number().int().min(0).max(240),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), lateGraceMinutes: z.number().int().min(0).max(240),
  attendanceApprovalRequired: z.boolean().default(true), hourlyPaidLeave: z.boolean().default(false),
  overtimeEnabled: z.boolean(), overtimeApprovalRequired: z.boolean(),
  overtimeMode: z.enum(["multiplier","fixed"]), overtimeRate: amountSchema,
  restDayRate: amountSchema, holidayRate: amountSchema,
  overtimeIncrement: z.number().int().min(1).max(120), overtimeRounding: z.enum(["down","nearest","up"]),
  holidays: z.array(dateSchema).max(400).default([]),
  unpaidLeaveEnabled: z.boolean(), absenceEnabled: z.boolean(), lateEnabled: z.boolean(),
  deductionCapPercent: z.number().int().min(0).max(500), allowNegativeNet: z.boolean().default(false),
  approvalRequired: z.literal(true).default(true),
  allowanceTypes: z.array(z.string().trim().min(1).max(80)).max(30).default(["Housing","Transport","Other"]),
  policy: z.string().trim().min(5).max(4000),
}).strict().refine(v => v.breakMinutes < v.standardMinutes, "Break must be shorter than the working day.");
export type PayrollRules = z.infer<typeof rulesSchema>;
export const salarySchema = z.object({
  currency, frequency: z.enum(["monthly","weekly","hourly"]), base: amountSchema,
  overtimeEligible: z.boolean(), shiftId: z.string().max(160).default(""),
  allowances: z.array(z.object({ name: z.string().trim().min(1).max(80), amount: amountSchema }).strict()).max(30),
  effectiveFrom: dateSchema, reason: z.string().trim().min(5).max(1000),
}).strict();
export type SalaryProfile = z.infer<typeof salarySchema>;
export const sourceSchema = z.object({
  employeeId: z.string().min(1), date: dateSchema,
  type: z.enum(["bonus","commission","earning","advance","loan","statutory","deduction","overtime"]),
  amount: amountSchema, minutes: z.number().int().min(0).max(1440).default(0),
  attendanceId: z.string().max(160).default(""),
  reference: z.string().trim().min(1).max(160), reason: z.string().trim().min(5).max(1000),
  adjustsEntryId: z.string().max(160).default(""),
  financeTransactionId: z.string().max(160).default(""),
}).strict();
export const periodSchema = z.object({
  companyId: z.string().min(1), frequency: z.enum(["weekly","biweekly","monthly","custom"]),
  start: dateSchema, end: dateSchema, employeeIds: z.array(z.string().min(1)).min(1).max(1000),
}).strict().superRefine((p,ctx) => {
  const count = (Date.parse(p.end)-Date.parse(p.start))/86400000+1;
  if (count < 1 || count > 366) ctx.addIssue({code:"custom",message:"Choose a period between 1 and 366 days."});
  if (p.frequency === "weekly" && count !== 7 || p.frequency === "biweekly" && count !== 14) ctx.addIssue({code:"custom",message:"Weekly periods require 7 days; biweekly periods require 14 days."});
  if (p.frequency === "monthly" && (p.start.slice(0,7)!==p.end.slice(0,7) || !p.start.endsWith("-01") || new Date(Date.parse(p.end)+86400000).getUTCDate()!==1)) ctx.addIssue({code:"custom",message:"Monthly payroll must cover a complete calendar month."});
  if(new Set(p.employeeIds).size!==p.employeeIds.length) ctx.addIssue({code:"custom",message:"Select each employee once."});
});
export type PayrollPeriod = z.infer<typeof periodSchema>;

/** Integer decimal arithmetic. Round half away from zero, once per component. */
export function roundDiv(n: bigint, d: bigint): bigint {
  if(d<=0n) throw new Error("Invalid calculation denominator.");
  const sign=n<0n?-1n:1n, a=n<0n?-n:n; return sign*((a+d/2n)/d);
}
export function scaled(value: string | number, digits=4): bigint {
  const v=String(value); if(!/^-?\d{1,12}(\.\d{1,4})?$/.test(v)) throw new Error("Invalid monetary source value.");
  const negative=v.startsWith("-"),[whole,part=""]=v.replace("-","").split(".");
  const units=BigInt(whole)*10000n+BigInt(part.padEnd(4,"0"));
  return (negative?-1n:1n)*roundDiv(units*10n**BigInt(digits),10000n);
}
export function money(value: bigint, digits: number) { const sign=value<0n?"-":"",v=value<0n?-value:value,s=10n**BigInt(digits); return `${sign}${v/s}${digits?"."+(v%s).toString().padStart(digits,"0"):""}`; }
export function dates(start:string,end:string) { const result:string[]=[]; for(let t=Date.parse(start);t<=Date.parse(end);t+=86400000) result.push(new Date(t).toISOString().slice(0,10)); return result; }
export const weekday=(date:string)=>new Date(`${date}T00:00:00Z`).getUTCDay();

function shiftWorkingDays(shift:InputRow|undefined,fallback:number[]) {
  if(!shift?.days)return fallback;
  if(Array.isArray(shift.days)&&shift.days.length&&shift.days.every((d:unknown)=>Number.isInteger(d)&&Number(d)>=0&&Number(d)<=6))return [...new Set(shift.days as number[])];
  const names=["sun","mon","tue","wed","thu","fri","sat"],text=String(shift.days).toLowerCase().replace(/[–—]/g,"-");
  const parts=text.split(/[,;\s]+/).filter(Boolean),result:number[]=[];
  for(const part of parts){const ends=part.split("-").map(v=>names.indexOf(v.slice(0,3)));if(ends.some(n=>n<0)||ends.length>2)throw new Error("Use explicit shift days, such as Mon-Fri or Sun,Mon,Tue.");if(ends.length===1)result.push(ends[0]);else{let d=ends[0];for(let count=0;count<7;count++,d=(d+1)%7){result.push(d);if(d===ends[1])break;}}}
  if(!result.length)throw new Error("The assigned shift has no working days.");return [...new Set(result)];
}

function localInstant(date:string,time:string,timeZone:string){
  const target=Date.parse(`${date}T${time}:00Z`);let instant=target;
  for(let i=0;i<3;i++){const p=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date(instant));const part=(name:string)=>p.find(x=>x.type===name)?.value;const local=Date.parse(`${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}Z`);instant+=target-local;}
  return instant;
}

export type InputRow = Record<string, any>;
interface CalculationInput { employee:InputRow; company:InputRow; salary:SalaryProfile; rules:PayrollRules; period:PayrollPeriod; attendance:InputRow[]; leave:InputRow[]; sources:InputRow[]; shift?:InputRow; }

export function calculatePayroll(input: CalculationInput) {
  if(new Set(input.sources.map(s=>s.id)).size!==input.sources.length)throw new Error("Duplicate payroll source identifiers must be corrected.");
  const {employee,company,salary,rules,period,shift}=input, digits=precision(salary.currency), warnings:string[]=[];
  const start=employee.hireDate && employee.hireDate>period.start?employee.hireDate:period.start;
  const end=employee.terminationDate && employee.terminationDate<period.end?employee.terminationDate:period.end;
  const workingDays=shiftWorkingDays(shift,rules.workingDays);
  const all=dates(start,end), workDates=all.filter(d=>workingDays.includes(weekday(d)) && !rules.holidays.includes(d));
  const hours=(text:string)=>{const [h,m]=text.split(":").map(Number);return h*60+m;};
  const scheduled=shift ? ((hours(shift.end)-hours(shift.start)+1440)%1440 || 1440)-Number(shift.breakMinutes??0) : rules.standardMinutes;
  if(!Number.isInteger(scheduled)||scheduled<1||scheduled>1440) throw new Error("The assigned shift has invalid working hours.");
  const breakMinutes=shift?Number(shift.breakMinutes??0):rules.breakMinutes;
  // Exact rational period factors, monthly denominators follow each calendar month's scheduled workdays.
  const factor=(value:bigint)=>{
    if(salary.frequency==="hourly") return value;
    if(salary.frequency==="weekly") return roundDiv(value*BigInt(workDates.length),BigInt(workingDays.length));
    let total=0n;
    for(const month of new Set(workDates.map(d=>d.slice(0,7)))) {
      const last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
      const denominator=dates(month+"-01",last).filter(d=>workingDays.includes(weekday(d))&&!rules.holidays.includes(d)).length;
      if(denominator) total+=roundDiv(value*BigInt(workDates.filter(d=>d.startsWith(month)).length),BigInt(denominator));
    }
    return total;
  };
  const unit=scaled(salary.base,digits);
  const minuteFraction=(date:string):[bigint,bigint]=>{
    if(salary.frequency==="hourly")return [scaled(salary.base,4),60n];
    const month=date.slice(0,7),last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
    const days=salary.frequency==="weekly"?workingDays.length:dates(month+"-01",last).filter(d=>workingDays.includes(weekday(d))&&!rules.holidays.includes(d)).length;
    return [scaled(salary.base,4),BigInt(Math.max(1,days)*scheduled)];
  };
  const baseHourly4=scaled(salary.base,4);
  const perMinutes=(date:string,mins:number)=>{const [n,d]=minuteFraction(date);return roundDiv(n*BigInt(mins)*10n**BigInt(digits),d*10000n);};
  const attendanceSummary:InputRow[]=[],components:InputRow[]=[],sourceIds:string[]=[];
  const accountedIntervals:Array<[number,number]>=[];
  let regularMinutes=0,overtimeMinutes=0,paidLeaveMinutes=0,ot=0n,absence=0n,late=0n;
  for(const date of all) {
    const daily=input.attendance.filter(a=>a.date===date), approved=daily.filter(a=>!rules.attendanceApprovalRequired||a.approvalStatus==="Approved");
    if(daily.some(a=>!approved.includes(a))) warnings.push(`${date}: unapproved attendance excluded.`);
    const leave=input.leave.filter(l=>l.status==="approved"&&l.from<=date&&l.to>=date);
    const paidLeave=leave.some(l=>l.type!=="unpaid"),unpaidLeave=leave.some(l=>l.type==="unpaid");
    if(paidLeave&&unpaidLeave) throw new Error(`${date}: conflicting paid and unpaid leave must be corrected.`);
    if(leave.some(l=>Number(l.days)>0&&!Number.isInteger(Number(l.days))&&l.from!==l.to))throw new Error(`${date}: split partial-day leave into separate approved daily requests.`);
    const leaveFraction=(paid:boolean)=>Math.min(1,leave.filter(l=>(l.type!=="unpaid")===paid).reduce((sum,l)=>sum+(l.from===l.to&&Number(l.days)>0?Math.min(1,Number(l.days)):1),0));
    const intervals:Array<[number,number]>=[];let incomplete=false;
    for(const a of approved) {
      const sessions=Array.isArray(a.sessions)?a.sessions:[{checkIn:a.checkInAt??a.checkIn,checkOut:a.checkOutAt??a.checkOut}];
      for(const s of sessions) {
        if(!s.checkIn||!s.checkOut){if(s.checkIn){incomplete=true;warnings.push(`${date}: incomplete attendance excluded.`);}continue;}
        const parse=(v:string)=>/^\d{2}:\d{2}$/.test(v)?localInstant(date,v,rules.timezone):Date.parse(v);
        let aTime=parse(s.checkIn),bTime=parse(s.checkOut);
        if(/^\d{2}:\d{2}$/.test(s.checkOut)&&bTime<aTime)bTime+=86400000;
        if(!Number.isFinite(aTime)||!Number.isFinite(bTime)||bTime<=aTime||bTime-aTime>86400000){warnings.push(`${date}: invalid attendance interval excluded.`);continue;}
        if(accountedIntervals.some(([a,b])=>aTime<b&&bTime>a))throw new Error(`${date}: attendance overlaps another payroll day. Correct the duplicate source.`);
        intervals.push([aTime,bTime]);
      }
    }
    intervals.sort((a,b)=>a[0]-b[0]);const merged:Array<[number,number]>=[];
    for(const interval of intervals){const last=merged.at(-1);if(last&&interval[0]<=last[1])last[1]=Math.max(last[1],interval[1]);else merged.push([...interval]);}
    accountedIntervals.push(...merged.map(([a,b]):[number,number]=>[a,b]));
    const worked=Math.max(0,Math.floor(merged.reduce((n,[a,b])=>n+b-a,0)/60000)-(merged.length===1?breakMinutes:0));
    const workday=workDates.includes(date),rest=!workday,regular=workday?Math.min(scheduled,worked):0;
    regularMinutes+=regular;
    if(paidLeave&&workday)paidLeaveMinutes+=Math.max(0,Math.min(Math.round(scheduled*leaveFraction(true)),scheduled-regular));
    let candidate=rest?worked:Math.max(0,worked-scheduled), payable=0;
    const requests=input.sources.filter(s=>s.type==="overtime"&&s.date===date&&s.status==="approved"&&approved.some(a=>a.id===s.attendanceId));
    if(rules.overtimeApprovalRequired)candidate=Math.min(candidate,requests.reduce((n,s)=>n+Number(s.minutes),0));
    if(rules.overtimeEnabled&&salary.overtimeEligible&&candidate>0){
      const round=rules.overtimeRounding==="up"?Math.ceil:rules.overtimeRounding==="nearest"?Math.round:Math.floor;
      payable=round(candidate/rules.overtimeIncrement)*rules.overtimeIncrement;
      // Rounding must never authorize time beyond an explicitly approved request.
      if(rules.overtimeApprovalRequired)payable=Math.min(payable,requests.reduce((n,s)=>n+Number(s.minutes),0));
      const rate=scaled(rules.holidays.includes(date)?rules.holidayRate:rest?rules.restDayRate:rules.overtimeRate,4);
      const amount=rules.overtimeMode==="fixed"?roundDiv(rate*BigInt(payable)*10n**BigInt(digits),600000n):(()=>{const [n,d]=minuteFraction(date);return roundDiv(n*BigInt(payable)*rate*10n**BigInt(digits),d*100000000n);})();
      ot+=amount;overtimeMinutes+=payable;components.push({type:"overtime",date,minutes:payable,amount:money(amount,digits),method:rules.overtimeMode,rate:money(rate,4),sourceIds:requests.map(s=>s.id)});
      sourceIds.push(...requests.map(s=>s.id));
    }
    const confirmedAbsent=approved.some(a=>a.status==="absent")&&!worked&&!incomplete&&!paidLeave&&!unpaidLeave;
    let deduction=0n,reason="";
    if(workday&&!paidLeave&&((unpaidLeave&&rules.unpaidLeaveEnabled)||(confirmedAbsent&&rules.absenceEnabled))&&salary.frequency!=="hourly") {deduction=perMinutes(date,Math.max(0,Math.min(unpaidLeave?Math.round(scheduled*leaveFraction(false)):scheduled,scheduled-regular)));reason=unpaidLeave?"unpaid leave":"approved absence";absence+=deduction;}
    if(deduction)components.push({type:reason,date,amount:money(deduction,digits),method:"scheduled salary minutes",sourceIds:unpaidLeave?leave.map(l=>l.id):approved.map(a=>a.id)});
    if(workday&&rules.lateEnabled&&!paidLeave&&!unpaidLeave&&merged.length&&salary.frequency!=="hourly") {
      const first=new Date(merged[0][0]); const parts=new Intl.DateTimeFormat("en-GB",{timeZone:rules.timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(first);
      const part=(type:string)=>parts.find(p=>p.type===type)?.value;
      const localDate=`${part("year")}-${part("month")}-${part("day")}`;
      const clock=(Date.parse(localDate)-Date.parse(date))/60000+Number(part("hour"))*60+Number(part("minute"));
      const lateMinutes=Math.min(scheduled,Math.max(0,clock-hours(shift?.start??rules.startTime)-rules.lateGraceMinutes));
      const amount=perMinutes(date,lateMinutes);late+=amount;
      if(amount)components.push({type:"late",date,minutes:lateMinutes,amount:money(amount,digits),method:"salary minutes after grace",sourceIds:approved.map(a=>a.id)});
    }
    attendanceSummary.push({date,workingDay:workday,workedMinutes:worked,regularMinutes:regular,overtimeMinutes:payable,leave:paidLeave?"paid":unpaidLeave?"unpaid":"",attendanceIds:approved.map(a=>a.id),intervals:merged.map(([a,b])=>({checkIn:new Date(a).toISOString(),checkOut:new Date(b).toISOString()}))});
  }
  const base=salary.frequency==="hourly"?roundDiv(baseHourly4*BigInt(regularMinutes+(rules.hourlyPaidLeave?paidLeaveMinutes:0))*10n**BigInt(digits),600000n):factor(unit);
  const allowances=salary.allowances.map(a=>({name:a.name,amount:money(salary.frequency==="hourly"?roundDiv(scaled(a.amount,4)*BigInt(regularMinutes)*10n**BigInt(digits),600000n):factor(scaled(a.amount,digits)),digits),method:salary.frequency}));
  const allowanceTotal=allowances.reduce((n,a)=>n+scaled(a.amount,digits),0n);
  let otherEarnings=0n,otherDeductions=late;
  for(const s of input.sources.filter(s=>s.status==="approved"&&s.type!=="overtime"&&s.date>=start&&s.date<=end)) {
    if(s.currency&&s.currency!==salary.currency)throw new Error("A payroll source currency differs from the salary currency. Correct it before generation.");
    const value=scaled(s.amount,digits),earning=["bonus","commission","earning"].includes(s.type);
    if(earning)otherEarnings+=value;else otherDeductions+=value;
    components.push({type:s.type,date:s.date,amount:money(value,digits),method:"approved fixed amount",sourceIds:[s.id],reference:s.reference,reason:s.reason,adjustsEntryId:s.adjustsEntryId});sourceIds.push(s.id);
  }
  const gross=base+allowanceTotal+ot+otherEarnings,deductions=absence+otherDeductions,net=gross-deductions;
  if(deductions*100n>gross*BigInt(rules.deductionCapPercent))throw new Error(`${employee.name}: deductions exceed the configured cap. Correct or defer the supporting deductions.`);
  if(net<0n&&!rules.allowNegativeNet)throw new Error(`${employee.name}: net pay cannot be negative.`);
  return {employeeId:employee.id,employee:String(employee.name),employeeCode:employee.employeeCode??"",department:employee.department??"",organizationId:company.id,locationId:employee.locationId??"",currency:salary.currency,precision:digits,
    basic:money(base,digits),allowances:money(allowanceTotal,digits),overtimeHours:(overtimeMinutes/60).toFixed(4),overtimeMinutes,overtimePay:money(ot,digits),otherEarnings:money(otherEarnings,digits),gross:money(gross,digits),absenceDeductions:money(absence,digits),otherDeductions:money(otherDeductions,digits),deductions:money(deductions,digits),netPay:money(net,digits),
    workingDays:workDates.length,regularMinutes,paidLeaveMinutes,allowanceBreakdown:allowances,components,attendanceSummary,warnings:[...new Set(warnings)],sourceIds:[...new Set(sourceIds)],
    snapshot:{employee:structuredClone(employee),company:structuredClone(company),salary:structuredClone(salary),rules:structuredClone(rules),shift:shift?structuredClone(shift):null,attendance:structuredClone(input.attendance),leave:structuredClone(input.leave),sources:structuredClone(input.sources)},
  };
}
