import { NavLink } from "react-router-dom";
import { useLanguage } from "../language-context";
import { useSession } from "../session-context";
import type { CollectionItem } from "../types";

export default function FinanceMovementLinks({transaction}:{transaction:CollectionItem}){
  const {t}=useLanguage(),{user}=useSession();
  const canPayroll=user?.permissions.some(p=>["*","payroll.*","payroll.view"].includes(p));
  return <>{transaction.sourceId&&["sales","purchases","expenses","returns"].includes(String(transaction.sourceCollection))?<NavLink className="cell-sub" to={`/finance?${new URLSearchParams({tab:transaction.sourceCollection==="sales"?"Sales":transaction.sourceCollection==="purchases"?"Purchases":"Reconciliation",source:String(transaction.sourceId),company:String(transaction.organizationId),currency:String(transaction.currency)})}`}>{t("View source payments")}</NavLink>:null}{transaction.payrollRunId&&canPayroll?<NavLink className="cell-sub" to={`/hr/payroll?${new URLSearchParams({run:String(transaction.payrollRunId),company:String(transaction.organizationId)})}`}>{t("View payroll history")}</NavLink>:null}</>;
}
