export const roles=['admin','coordinator','teacher'];
export const isAdmin=user=>user?.role==='admin';
export const canEdit=user=>isAdmin(user)||user?.role==='coordinator';
const selfPaths=new Set(['/api/state','/api/logout','/api/account']);
const editorPaths=new Set(['/api/draft','/api/classes','/api/sample','/api/special-days','/api/preview']);
export const canAccess=(user,path)=>isAdmin(user)||selfPaths.has(path)||canEdit(user)&&editorPaths.has(path);
export function assignments(body,classes){
 const role=body.role||'admin',classIds=body.classIds||[];
 if(!roles.includes(role)||!Array.isArray(classIds)||classIds.some(id=>!classes.some(c=>c.id===id))||role==='teacher'&&!classIds.length)throw Object.assign(Error('Choose a role and assign at least one class to a teacher.'),{status:400});
 return {role,classIds:role==='teacher'?[...new Set(classIds)]:[]};
}
export function requireAdmin(user){if(!isAdmin(user))throw Object.assign(Error('Administrator access is required.'),{status:403});}
