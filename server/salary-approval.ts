import { publicUser, type AuthenticatedUser } from "./auth.js";
import { isMainManager, isWithinScope, ownRecordsRequired } from "./permissions.js";
import { getCollection } from "./storage.js";
type Row=Record<string,any>;
export function canAuthorizeSalary(user:AuthenticatedUser,companyId:string){
 return isMainManager(user)||(user.roleId==="role-general-manager"&&!ownRecordsRequired(user)&&isWithinScope(user,{id:companyId,organizationId:companyId}));
}
export function salaryApprovalAuthorized(run:Row){
 const account=(getCollection("accessUsers") as Row[]).find(a=>a.id===run.approvedBy&&a.status==="active");
 return Boolean(account&&canAuthorizeSalary(publicUser(account as any),String(run.organizationId)));
}
