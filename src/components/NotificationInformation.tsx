import type { Notification } from "../types";
import { useLanguage } from "../language-context";

const labels:Record<string,string>={name:"Name",email:"Email",organizationIds:"Companies",companies:"Companies",company:"Company",type:"Type",from:"From",to:"To",days:"Days",reason:"Reason",status:"Status",section:"Section",action:"Action",collection:"Collection",requestedByName:"Requested by",createdAt:"Created at",requestedAt:"Requested at",decisionNote:"Decision note",title:"Title",priority:"Priority",dueDate:"Due date",assignee:"Assigned to",description:"Description",sku:"SKU",available:"Available stock",reorderPoint:"Reorder point",unit:"Unit",stockLocation:"Stock location",expiryDate:"Expiry date",employee:"Employee",date:"Date",attendanceDate:"Attendance date",checkIn:"Check in",checkOut:"Check out",hours:"Working hours",approvalStatus:"Approval status",lateMinutes:"Late arrival (minutes)",earlyDepartureMinutes:"Early departure (minutes)",requestedCheckIn:"Requested check-in",requestedCheckOut:"Requested check-out",period:"Payroll period",amount:"Amount"};

export function NotificationInformation({item,formatDate,compact=false}:{item:Notification;formatDate:(value:string)=>string;compact?:boolean}){
 const {t}=useLanguage();
 const priority=item.priority||(item.severity==="critical"?"Urgent":item.severity==="warning"?"Important":"Normal");
 if(compact)return <div className="notification-summary-facts"><span className={`notification-priority priority-${item.severity}`}>{t(priority)}</span><span>{t(item.read?"Read":"Unread")}</span>{item.senderName&&<span>{t("From")}: <bdi>{item.senderName}</bdi></span>}{item.decision&&<span>{t("Status")}: {t(item.decision)}</span>}{item.readAt&&<span>{t("Read at")}: {formatDate(item.readAt)}</span>}{item.acknowledgmentRequired&&<span>{t(item.acknowledgedAt?"Acknowledged":"Acknowledgment required")}</span>}{item.effectiveAt&&<span>{t("Effective date")}: {formatDate(item.effectiveAt)}</span>}{item.shiftTime&&<span>{t("Shift time")}: <bdi>{item.shiftTime}</bdi></span>}{item.location&&<span>{t("Location")}: <bdi>{item.location}</bdi></span>}</div>;
 return <dl className="notification-facts" aria-label={t("Notification information")}>
  <div><dt>{t("Message ID")}</dt><dd dir="ltr">{item.id}</dd></div>
  <div><dt>{t("Priority")}</dt><dd className={`notification-priority priority-${item.severity}`}>{t(priority)}</dd></div>
  <div><dt>{t("Status")}</dt><dd>{t(item.read?"Read":"Unread")}{item.decision&&<> · {t(item.decision)}</>}</dd></div>
  <div><dt>{t("Sender")}</dt><dd dir="auto">{item.senderName||t("System")}</dd></div>
  <div><dt>{t("Received at")}</dt><dd><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></dd></div>
  {item.effectiveAt&&<div><dt>{t("Effective date")}</dt><dd>{formatDate(item.effectiveAt)}</dd></div>}
  {item.shiftTime&&<div><dt>{t("Shift time")}</dt><dd dir="auto">{item.shiftTime}</dd></div>}
  {item.location&&<div><dt>{t("Location")}</dt><dd dir="auto">{item.location}</dd></div>}
  {item.acknowledgmentRequired&&<div><dt>{t("Status")}</dt><dd>{t(item.acknowledgedAt?"Acknowledged":"Acknowledgment required")}</dd></div>}
  {[["Delivered at",item.deliveredAt],["Read at",item.readAt],["Acknowledged at",item.acknowledgedAt]].map(([label,value])=>value&&<div key={label}><dt>{t(label!)}</dt><dd><time dateTime={value}>{formatDate(value)}</time></dd></div>)}
 </dl>;
}
export function NotificationRecordDetails({details,formatDate}:{details:Record<string,unknown>;formatDate:(value:string)=>string}){
 const {t,language}=useLanguage();
 const entries=Object.entries(details).filter(([key,value])=>!(key==="organizationIds"&&details.companies)&&value!==null&&value!==undefined&&value!==""&&!(Array.isArray(value)&&!value.length));
 if(!entries.length)return null;
 const display=(key:string,value:unknown):string=>Array.isArray(value)?value.map(item=>display(key,item)).join(language==="ar"?"، ":", "):typeof value==="object"?t("Details unavailable"):typeof value==="boolean"?t(value?"Yes":"No"):key.endsWith("At")&&typeof value==="string"?formatDate(value):["status","approvalStatus","priority","type","section","action","collection"].includes(key)?t(String(value)):String(value);
 return <section className="notification-record-details"><h4>{t("Related record details")}</h4><dl>{entries.map(([field,value])=><div key={field}><dt>{t(labels[field]||field.replace(/([a-z])([A-Z])/g,"$1 $2"))}</dt><dd dir="auto">{display(field,value)}</dd></div>)}</dl></section>;
}
