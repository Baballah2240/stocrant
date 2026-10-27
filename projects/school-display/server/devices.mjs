import {randomBytes} from 'node:crypto';
export function restoreDevices(input,classes,current=[]){
 const fail=()=>{throw Object.assign(Error('Check the screen assignments in this backup.'),{status:400});};
 if(!Array.isArray(input)||input.length>100)fail();const ids=new Set(),monitors=new Set();
 return input.map(row=>{
  if(!row||typeof row.id!=='string'||!/^[\w-]{1,80}$/.test(row.id)||ids.has(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>100||!classes.some(c=>c.id===row.classId)||typeof row.monitor!=='string'||!row.monitor||row.monitor.length>100||typeof row.enabled!=='boolean')fail();
  ids.add(row.id);if(row.enabled&&row.monitor!=='browser'){if(monitors.has(row.monitor))fail();monitors.add(row.monitor);}
  return {id:row.id,name:row.name.trim(),classId:row.classId,monitor:row.monitor,enabled:row.enabled,token:current.find(d=>d.id===row.id)?.token||randomBytes(32).toString('hex'),createdAt:new Date().toISOString()};
 });
}
