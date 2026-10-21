import {TEST_DATA_DIR} from "./test-env.js";
import {before,beforeEach,after,describe,it} from "node:test";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {readFileSync,rmSync} from "node:fs";
import {resolve,sep,join} from "node:path";
import {tmpdir} from "node:os";
import type {Server} from "node:http";
import {createApp} from "./app.js";
import {getStore,saveStore} from "./storage.js";
import {publicUser} from "./auth.js";
import {personalAttendance,selfAttendanceQuery} from "./self-attendance.js";
type Row=Record<string,any>;
const rows=(name:string)=>getStore().collections[name] as Row[];
let server:Server,base="",owner="",staff="",other="",company:Row,employee:Row,foreign:Row;
async function req(path:string,method="GET",body?:unknown,cookie=staff){return fetch(base+"/api"+path,{method,headers:{Cookie:cookie,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});}
async function json(response:Response,status=200):Promise<Row>{assert.equal(response.status,status,await response.clone().text());return response.json() as Promise<Row>;}
async function create(collection:string,input:Row){return (await json(await req('/collections/'+collection,'POST',input,owner),201)).item;}
const identity=()=>publicUser(rows('accessUsers').find(row=>row.employeeId===employee.id)! as Parameters<typeof publicUser>[0]);
const record=(id:string,date:string,extra:Row={})=>({id,date,employeeId:employee.id,organizationId:company.id,status:'present',approvalStatus:'Draft',sessions:[],...extra});
before(async()=>{server=createApp().listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const response=await req('/auth/setup','POST',{name:'Attendance Owner',email:'owner@attendance.test',password:randomBytes(24).toString('hex'),setupKey:'local-setup'},'');await json(response,201);owner=response.headers.get('set-cookie')!.split(';')[0];
 const organization=await create('organizations',{name:'Attendance Organization',status:'active'});company=await create('companies',{name:'Attendance Company',parentOrganizationId:organization.id,status:'active',organizationType:'office',industry:'services',currency:'QAR'});
 const make=async(name:string,email:string)=>{const e=await create('employees',{name,email,organizationId:company.id,status:'active',hireDate:'2020-01-01'}),invite=await json(await req('/workspace/hr/communication/employees/'+e.id+'/invitation','POST',{},owner)),password=randomBytes(24).toString('hex');await json(await req('/auth/activate-employee','POST',{token:invite.token,email,password},''));const login=await req('/auth/login','POST',{email,password},'');await json(login);return {employee:e,cookie:login.headers.get('set-cookie')!.split(';')[0]};};
 const a=await make('Attendance Employee','employee@attendance.test'),b=await make('Other Employee','other@attendance.test');employee=a.employee;staff=a.cookie;foreign=b.employee;other=b.cookie;
 await create('shifts',{name:'Assigned day shift',organizationId:company.id,start:'08:00',end:'16:00',days:'Sun-Sat',breakMinutes:60,assignedTo:employee.id});
});
beforeEach(()=>{getStore().collections.attendance=[];getStore().collections.attendanceSettings=[{id:'test-attendance-policy',organizationId:company.id,timezone:'UTC',trackingEnabled:true,workingDays:[0,1,2,3,4,5,6],lateGraceMinutes:0,earlyDepartureGraceMinutes:0,breakMinutes:60}];saveStore(getStore());});
after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));assert.ok(resolve(TEST_DATA_DIR).startsWith(resolve(tmpdir())+sep));rmSync(TEST_DATA_DIR,{recursive:true,force:true});});
describe('Personal attendance clock, persistence and history',()=>{
 it('requires authentication, derives identity on the server and refuses edits or another employee history',async()=>{
  await json(await req('/workspace/attendance/self','GET',undefined,''),401);await json(await req('/workspace/attendance/self?employeeId='+foreign.id),400);
  await json(await req('/workspace/attendance/check-in','POST',{employeeId:foreign.id,checkInAt:'2000-01-01T00:00:00Z'}),400);
  const root=await json(await req('/workspace/attendance/self','GET',undefined,owner));assert.equal(root.enabled,false);assert.equal(root.total,0);
  const start=await json(await req('/workspace/attendance/check-in','POST'),201);await json(await req('/workspace/attendance/self/'+start.item.id,'GET',undefined,other),404);await json(await req('/collections/attendance/'+start.item.id,'PATCH',{hours:999}),403);
 });
 it('atomically saves exact UTC timestamps and replays uncertain network requests without extra sessions',async()=>{
  const id=randomUUID();const results=await Promise.all([req('/workspace/attendance/check-in','POST',{requestId:id}),req('/workspace/attendance/check-in','POST',{requestId:id})]);const a=await json(results[0],201),b=await json(results[1],201);assert.equal(a.item.id,b.item.id);assert.equal(rows('attendance').length,1);assert.equal(rows('attendance')[0].sessions.length,1);assert.match(a.item.sessions[0].checkIn,/^\d{4}-\d{2}-\d{2}T.*Z$/);
  await json(await req('/workspace/attendance/clock-in','POST'),409);
  const saved=rows('attendance')[0];saved.sessions[0].checkIn=new Date(Date.now()-90500).toISOString();saved.checkInAt=saved.sessions[0].checkIn;saveStore(getStore());
  const snapshot=await json(await req('/workspace/attendance/self'));assert.equal(snapshot.status,'checked-in');assert.ok(snapshot.current.recordedSeconds>=90);assert.equal(snapshot.canCheckIn,false);assert.equal(snapshot.canCheckOut,true);assert.ok(!JSON.stringify(snapshot).includes('salary'));assert.ok(!JSON.stringify(snapshot).includes('estimatedDeduction'));
  const disk=JSON.parse(readFileSync(join(TEST_DATA_DIR,'data','stocrant.json'),'utf8'));assert.equal(disk.collections.attendance[0].sessions[0].checkIn,saved.sessions[0].checkIn);
  const outId=randomUUID();const out=await json(await req('/workspace/attendance/check-out','POST',{requestId:outId}));assert.match(out.item.sessions[0].checkOut,/T.*Z$/);await json(await req('/workspace/attendance/check-out','POST',{requestId:outId}));await json(await req('/workspace/attendance/check-in','POST',{requestId:id}),201);assert.equal(rows('attendance')[0].sessions.length,1);assert.ok(rows('attendance')[0].sessions[0].checkOut);
  const later=personalAttendance(identity(),selfAttendanceQuery.parse({}),new Date(Date.now()+60000));assert.equal(later.status,'checked-out');assert.equal(later.current!.recordedSeconds,Math.floor((Date.parse(out.item.sessions[0].checkOut)-Date.parse(saved.sessions[0].checkIn))/1000));
 });
 it('enforces the same three-session limit across mobile and HR clock routes',async()=>{
  for(let index=0;index<3;index++){const start=await req(index%2?'/workspace/attendance/clock-in':'/workspace/attendance/check-in','POST');assert.ok([200,201].includes(start.status));await json(await req('/workspace/attendance/check-in','POST'),409);await json(await req('/workspace/attendance/clock-out','POST'));}
  assert.equal(rows('attendance').length,1);assert.equal(rows('attendance')[0].sessions.length,3);await json(await req('/workspace/attendance/check-in','POST'),409);await json(await req('/workspace/attendance/clock-in','POST'),409);const data=await json(await req('/workspace/attendance/self'));assert.equal(data.sessionCount,3);assert.equal(data.canCheckIn,false);
 });
 it('returns complete paginated own history beyond the old ninety-record cap and validates custom filters',async()=>{
  const today=new Date().toISOString().slice(0,10),day=new Date(today+'T12:00:00Z');for(let index=0;index<125;index++){const date=day.toISOString().slice(0,10);rows('attendance').push(record('history-'+index,date,{sessions:[{checkIn:date+'T08:00:00Z',checkOut:date+'T16:00:00Z'}],hours:7}));day.setUTCDate(day.getUTCDate()-1);}rows('attendance').push(record('foreign-record',today,{employeeId:foreign.id,sessions:[{checkIn:today+'T07:00:00Z'}]}));saveStore(getStore());
  const from=day.toISOString().slice(0,10),path='/workspace/attendance/self?range=custom&from='+from+'&to='+today;const data=await json(await req(path));assert.equal(data.total,125);assert.equal(data.records.length,10);const last=await json(await req(path+'&page=13'));assert.equal(last.records.length,5);assert.equal((await json(await req('/workspace/attendance/self/'+last.records[4].id))).item.recordedSeconds,28800);await json(await req('/workspace/attendance/self/foreign-record'),404);
  for(const query of ['range=custom','range=custom&from=2026-02-30&to=2026-03-01','page=0','range=custom&from=2026-10-22&to=2026-10-20','range=custom&from=2020-01-01&to=2026-10-21'])await json(await req('/workspace/attendance/self?'+query),400);
  assert.equal((await json(await req('/workspace/attendance/self?range=today'))).records.length,1);assert.ok((await json(await req('/workspace/attendance/self?range=week'))).total<=7);assert.ok((await json(await req('/workspace/attendance/self?range=month'))).total<=31);
 });
 it('normalizes legacy minute clocks without rewriting history and computes assigned-shift indicators',()=>{
  rows('attendanceSettings')[0].timezone='Asia/Kolkata';rows('attendance').push(record('legacy','2026-10-20',{sessions:[{checkIn:'08:10',checkOut:'15:45'}],hours:6.58}));saveStore(getStore());
  const data=personalAttendance(identity(),selfAttendanceQuery.parse({range:'custom',from:'2026-10-20',to:'2026-10-20'}),new Date('2026-10-20T12:00:00Z'));assert.equal(data.timezone,'Asia/Kolkata');assert.equal(data.records[0].checkInAt,'2026-10-20T02:40:00.000Z');assert.equal(data.records[0].recordedSeconds,27300);assert.equal(data.records[0].lateMinutes,10);assert.equal(data.records[0].earlyDepartureMinutes,15);assert.equal(data.records[0].precision,'minute');assert.equal(rows('attendance')[0].sessions[0].checkIn,'08:10');assert.equal(data.schedule!.expectedSeconds,25200);
 });
 it('handles overnight sessions and day clipping, refuses overlaps and closes the original daily record',async()=>{
  const today=new Date().toISOString().slice(0,10),day=new Date(today+'T12:00:00Z');day.setUTCDate(day.getUTCDate()-1);const yesterday=day.toISOString().slice(0,10);rows('attendance').push(record('overnight',yesterday,{sessions:[{checkIn:yesterday+'T23:55:00Z'}]}));saveStore(getStore());
  const data=await json(await req('/workspace/attendance/self'));assert.equal(data.current.id,'overnight');assert.equal(data.canCheckIn,false);assert.equal(data.canCheckOut,true);assert.equal(data.todayRecordedSeconds,Math.floor((Date.parse(data.serverNow)-Date.parse(today+'T00:00:00Z'))/1000));await json(await req('/workspace/attendance/check-in','POST'),409);const out=await json(await req('/workspace/attendance/check-out','POST'));assert.equal(out.item.date,yesterday);assert.equal(rows('attendance').length,1);
 });
 it('uses company calendar boundaries through short and long daylight-saving days',()=>{
  rows('attendanceSettings')[0].timezone='America/New_York';
  for(const [date,start,end,hours] of [['2026-03-08','2026-03-08T05:00:00Z','2026-03-09T04:00:00Z',23],['2026-11-01','2026-11-01T04:00:00Z','2026-11-02T05:00:00Z',25]] as const){
   getStore().collections.attendance=[record('dst-'+date,date,{sessions:[{checkIn:start,checkOut:end}]})];
   const data=personalAttendance(identity(),selfAttendanceQuery.parse({range:'today'}),new Date(Date.parse(end)-1000));
   assert.equal(data.today,date);assert.equal(Date.parse(data.dayEnd),Date.parse(end));assert.equal(data.todayRecordedSeconds,hours*3600);assert.equal(data.records[0].recordedSeconds,hours*3600);
  }
 });
 it('preserves final approval controls, company tracking settings and interval gaps',async()=>{
  const today=new Date().toISOString().slice(0,10);rows('attendance').push(record('final',today,{approvalStatus:'Approved',sessions:[{checkIn:today+'T08:00:00Z',checkOut:today+'T12:00:00Z'},{checkIn:today+'T13:00:00Z',checkOut:today+'T16:00:00Z'}],hours:7}));saveStore(getStore());await json(await req('/workspace/attendance/check-in','POST'),409);const detail=await json(await req('/workspace/attendance/self/final'));assert.equal(detail.item.recordedSeconds,25200);assert.equal(detail.item.policyHours,7);
  getStore().collections.attendance=[];rows('attendanceSettings')[0].trackingEnabled=false;saveStore(getStore());const disabled=await json(await req('/workspace/attendance/self'));assert.equal(disabled.canCheckIn,false);await json(await req('/workspace/attendance/check-in','POST'),409);
 });
});
