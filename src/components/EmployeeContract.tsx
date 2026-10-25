import {useEffect,useState} from "react";
import {downloadContract,getEmployeeContract,type ContractItem} from "../contract-api";
import {useLanguage} from "../language-context";
import "../contracts.css";
export function EmployeeContract({employeeId}:{employeeId?:string}){
 const {t}=useLanguage(),[item,setItem]=useState<ContractItem|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;setLoading(true);getEmployeeContract(employeeId).then(result=>{if(active)setItem(result.item);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[employeeId]);
 async function download(){if(!item)return;setBusy(true);setError("");try{await downloadContract(item);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const approved=item?.contract?.published;
 return <section className="card employee-contract"><h2>{t("Employment contract")}</h2>{error&&<p className="error" role="alert">{t(error)}</p>}{loading?<p role="status">{t("Loading contract…")}</p>:approved?<><h3>{approved.title}</h3><p>{approved.reference}</p><p>{t("Approved by")}: {approved.approvedByName} · {new Date(approved.approvedAt).toLocaleDateString()}</p><button className="primary" type="button" disabled={busy} onClick={()=>void download()}>{t("Download contract PDF")}</button></>:<p>{t("HR is preparing your contract. The approved PDF will appear here.")}</p>}</section>;
}
