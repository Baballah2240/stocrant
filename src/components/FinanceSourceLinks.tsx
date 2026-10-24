import { NavLink } from "react-router-dom";
import { useLanguage } from "../language-context";
import { useSession } from "../session-context";

export default function FinanceSourceLinks({collection,id,item}:{collection:string;id:string;item:Record<string,unknown>}){
  const {t}=useLanguage(),{user}=useSession();
  const can=(section:string)=>user?.permissions.some(p=>["*",`${section}.*`,`${section}.view`].includes(p));
  if(!["sales","purchases","expenses","returns"].includes(collection)||!can("finance"))return null;
  const query=new URLSearchParams({tab:collection==="sales"?"Sales":collection==="purchases"?"Purchases":"Reconciliation",source:id,...(item.organizationId?{company:String(item.organizationId)}:{}),...(item.currency?{currency:String(item.currency)}:{})});
  return <section className="card"><h2>{t("Connected financial record")}</h2><p className="hint">{t("Payments and reversals are recorded in Finance and linked to this document. Editing a payment flag does not move money.")}</p><div className="inline-actions"><NavLink to={`/finance?${query}`}>{t("Open payments in Finance")}</NavLink>{item.shopOrderId&&can("inventory")&&can("operations")?<NavLink to={`/shops?${new URLSearchParams({company:String(item.organizationId),order:String(item.shopOrderId)})}`}>{t("View linked order")}</NavLink>:null}</div></section>;
}
