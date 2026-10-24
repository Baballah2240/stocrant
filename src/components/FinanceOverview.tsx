import { NavLink } from 'react-router-dom';
import { useLanguage } from '../language-context';
import { financeResult } from '../finance-report';
import { decimal, minor } from '../money';
import type { CollectionItem } from '../types';

export default function FinanceOverview({ accounts, transactions, currency, profitOnly = false, navigate }: { accounts: CollectionItem[]; transactions: CollectionItem[]; currency: string; profitOnly?: boolean; navigate: (tab: 'Sales'|'Purchases'|'Banking'|'All movements'|'Salaries & payroll'|'Profit & loss') => void }) {
  const { t, language } = useLanguage();
  const result = financeResult(transactions, currency);
  const format = (value: unknown) => new Intl.NumberFormat(language === 'ar' ? 'ar-SA' : 'en-GB', { style: 'currency', currency: currency || "SAR" }).format(Number(value));
  const lines = [['Sales & other income', result.revenue], ['Purchase payments', result.purchases], ['Operating expenses & taxes', result.expenses], ['Salary payments', result.payroll], ['Cash-basis profit / loss', result.profit]];
  return <div className="finance-connected">
    {!profitOnly && <><div className="dashboard-grid"><article className="card metric-card"><span>{t('Available balance')}</span><strong>{format(decimal(accounts.filter(a => a.balance !== null).reduce((n, a) => n + minor(a.balance, currency), 0n), currency))}</strong><small>{t('All paid account history')}</small></article><article className="card metric-card"><span>{t('Net cash movement')}</span><strong>{format(result.cash)}</strong><small>{t('Selected period and filters')}</small></article></div><nav className="finance-shortcuts" aria-label={t('Finance tools')}>{(['Sales','Purchases','Banking','All movements','Salaries & payroll','Profit & loss'] as const).map(tab => <button key={tab} onClick={() => navigate(tab)}>{t(tab)} <span aria-hidden="true">↗</span></button>)}</nav></>}
    <section className="card"><h2>{t('Profit & loss')}</h2><p className="hint">{t('Cash basis: income received less purchase payments, operating expenses, taxes and salaries paid. Unpaid invoices and payroll are shown in reconciliation. Inventory valuation and accrual adjustments are not included.')}</p><div className="table-wrap"><table className="table"><thead><tr><th>{t('Category')}</th><th>{currency}</th></tr></thead><tbody>{lines.map(([label, value]) => <tr key={label}><th scope="row">{t(label)}</th><td>{format(value)}</td></tr>)}</tbody></table></div><p className="hint">{t('Financing, advances, repayments, transfers and unclassified movements are excluded from profit. Review them in All movements.')}</p><p>{t('Other net cash movements')}: <strong>{format(result.excluded)}</strong></p></section>
    {!profitOnly && <p className="hint">{t('Record sales and purchases once, settle them through Finance, and use approved payroll for salary payments. Linked payments update the same account ledger.')} <NavLink to="/finance?tab=Reconciliation">{t('Receivables and payables')}</NavLink></p>}
  </div>;
}
