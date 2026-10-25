import {getCollection} from "./storage.js";
export const shopDefaults={version:0,paymentAccountId:"",requirePaymentBeforeCompletion:false,requireTracking:true,allowedPaymentMethods:["cash","bank","card","cheque","other"]};
export function shopSettings(companyId:string){return {...shopDefaults,...(getCollection("shopOperationalSettings") as Record<string,any>[]).find(row=>row.organizationId===companyId)};}
