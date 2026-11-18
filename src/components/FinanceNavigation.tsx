import { useLayoutEffect, useRef } from "react";
import { useLanguage } from "../language-context";
import MobileIcon, { type MobileIconName } from "./MobileIcon";
export const financeToolGroups: { id: string; label: string; icon: MobileIconName; tabs: string[] }[] = [
  { id: "summary", label: "Summary", icon: "home", tabs: ["Overview", "Profit & loss", "Reports", "Aged balances", "Partner ledger"] },
  { id: "movements", label: "Money movements", icon: "finance", tabs: ["All movements", "Income", "Expenses", "Transfers", "Other movements"] },
  { id: "settlements", label: "Collections & payments", icon: "shop", tabs: ["Sales", "Purchases", "Salaries & payroll"] },
  { id: "accounts", label: "Accounts & checks", icon: "shield", tabs: ["Banking", "Reconciliation"] },
];
export const financeTabId = (tab: string) => "finance-tool-" + (tab === "Accounts" ? "Banking" : tab).toLowerCase().replace(/[^a-z]+/g, "-");
export default function FinanceNavigation({ tab, onChange, canPayroll }: { tab: string; onChange: (tab: string) => void; canPayroll: boolean }) {
  const { t, language } = useLanguage();
  const normalized = tab === "Accounts" ? "Banking" : tab;
  const keyboardTarget=useRef<string|null>(null);
  useLayoutEffect(()=>{
    if(keyboardTarget.current!==normalized)return;
    document.getElementById(financeTabId(normalized))?.focus();
    keyboardTarget.current=null;
  },[normalized]);
  const groups = financeToolGroups.map(group => ({ ...group, tabs: group.tabs.filter(value => value !== "Salaries & payroll" || canPayroll) }));
  const active = groups.find(group => group.tabs.includes(normalized))?.id || "summary";
  return <nav className="finance-tool-navigation finance-no-print" aria-label={t("Finance tools")}>
    <div className="finance-tool-groups" aria-label={t("Finance sections")}>{groups.map(group => <button type="button" key={group.id} aria-pressed={active === group.id} onClick={() => { if (active !== group.id) onChange(group.tabs[0]); }}><MobileIcon name={group.icon} /><span>{t(group.label)}</span></button>)}</div>
    {groups.map(group => <div key={group.id} className="finance-tabs" role="tablist" aria-label={t(group.label)} hidden={active !== group.id}>{group.tabs.map((value, index) => <button type="button" key={value} id={financeTabId(value)} className={normalized === value ? "active" : ""} role="tab" aria-selected={normalized === value} aria-controls="finance-content" tabIndex={normalized === value ? 0 : -1} onClick={() => onChange(value)} onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault();
      const forward = language === "ar" ? event.key === "ArrowLeft" : event.key === "ArrowRight";
      const target = event.key === "Home" ? 0 : event.key === "End" ? group.tabs.length - 1 : (index + (forward ? 1 : -1) + group.tabs.length) % group.tabs.length;
      keyboardTarget.current=group.tabs[target];
      onChange(group.tabs[target]);
    }}>{t(value)}</button>)}</div>)}
  </nav>;
}
