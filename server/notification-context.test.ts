import {TEST_DATA_DIR} from './test-env.js';
import {after,beforeEach,it} from 'node:test';
import assert from 'node:assert/strict';
import {rmSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {getStore} from './storage.js';
import {notificationContext} from './notification-context.js';
import type {AuthenticatedUser} from './auth.js';
import type {Notification} from './types.js';
const user:AuthenticatedUser={id:'context-user',name:'Context User',email:'context@example.test',roleId:'context-role',employeeId:'context-employee',organizationIds:['company-primary'],locationIds:[],ownRecordsOnly:false,permissions:[]};
const rows=(name:string)=>getStore().collections[name] as Record<string,unknown>[];
const notice=(type:Notification['type'],target:string):Notification=>({id:'context-notice',userId:user.id,user:user.name,type,target,severity:'warning',message:'Context notice',createdAt:new Date().toISOString(),read:false});
beforeEach(()=>{
 const data=getStore();data.collections.accessRoles=[{id:user.roleId,permissions:['operations.view','inventory.view','hr.view']}];data.collections.accessUsers=[];
 for(const name of ['workItems','inventoryItems','inventoryMovements','attendance','approvalRequests','documents'])data.collections[name]=[];
});
after(()=>{assert.ok(resolve(TEST_DATA_DIR).startsWith(resolve(tmpdir())+sep));rmSync(TEST_DATA_DIR,{recursive:true,force:true});});
it('returns live task details only while record scope and current permissions allow it',()=>{
 const row={id:'task-context',organizationId:'company-primary',title:'Urgent delivery',dueDate:'2026-10-20',status:'Pending',description:'Call the supplier',privateToken:'SECRET'};getStore().collections.workItems=[row];
 const detail=notificationContext(user,notice('overdue_work',row.id));assert.equal(detail.details.title,row.title);assert.equal(detail.link?.to,'/operations/work/task-context');assert.ok(!JSON.stringify(detail).includes('SECRET'));
 row.organizationId='foreign-company';assert.deepEqual(notificationContext(user,notice('overdue_work',row.id)),{details:{}});row.organizationId='company-primary';rows('accessRoles')[0].permissions=[];assert.deepEqual(notificationContext(user,notice('overdue_work',row.id)),{details:{}});
});
it('uses real stock movements for current availability and excludes unrelated data',()=>{
 getStore().collections.inventoryItems=[{id:'stock-context',organizationId:'company-primary',name:'Packaging',sku:'BOX-1',openingStock:10,reorderPoint:5,unit:'box',supplierSecret:'SECRET'}];
 getStore().collections.inventoryMovements=[{id:'stock-movement',organizationId:'company-primary',inventoryItemId:'stock-context',type:'outgoing',quantity:7}];
 const detail=notificationContext(user,notice('low_stock','stock-context'));assert.equal(detail.details.available,3);assert.equal(detail.details.reorderPoint,5);assert.equal(detail.link?.to,'/warehouse');assert.ok(!JSON.stringify(detail).includes('SECRET'));
});
it('supports own attendance and missing-attendance context without granting another company access',()=>{
 const own={...user,ownRecordsOnly:true};getStore().collections.attendance=[{id:'attendance-context',organizationId:'company-primary',employeeId:user.employeeId,date:'2026-10-20',status:'missing-check-out',hours:6,salary:123456}];
 const detail=notificationContext(own,notice('message','attendance-missing:attendance-context'));assert.equal(detail.details.hours,6);assert.equal(detail.link?.to,'/me/attendance');assert.ok(!JSON.stringify(detail).includes('salary'));
 rows('attendance')[0].organizationId='foreign-company';assert.deepEqual(notificationContext(own,notice('message','attendance:attendance-context')),{details:{}});
});
it('allowlists administrator account and document details and omits deleted records',()=>{
 const main={...user,roleId:'role-main-manager'};getStore().collections.accessUsers=[{id:'applicant-context',name:'Applicant',email:'applicant@example.test',organizationIds:['company-primary'],passwordHash:'SECRET',resetToken:'SECRET',status:'pending'}];
 const account=notificationContext(main,notice('registration_request','applicant-context'));assert.equal(account.details.email,'applicant@example.test');assert.ok(!JSON.stringify(account).includes('SECRET'));assert.ok(account.link);
 getStore().collections.documents=[{id:'document-context',name:'Work permit',expiryDate:'2026-11-01',privateStoragePath:'SECRET'}];const doc=notificationContext(main,notice('document_expiry','document:document-context'));assert.equal(doc.details.expiryDate,'2026-11-01');assert.ok(!JSON.stringify(doc).includes('SECRET'));getStore().collections.documents=[];assert.deepEqual(notificationContext(main,notice('document_expiry','document:document-context')),{details:{}});
});
it('does not treat two absent employee IDs as ownership for unlinked accounts',()=>{
 rows('accessRoles')[0].permissions=[];
 getStore().collections.attendance=[{id:'account-attendance',organizationId:'company-primary',accountId:'someone-else',date:'2026-10-20',hours:8}];
 assert.deepEqual(notificationContext({...user,employeeId:undefined},notice('message','attendance:account-attendance')),{details:{}});
});
