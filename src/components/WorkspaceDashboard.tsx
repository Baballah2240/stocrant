import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api";

interface Overview { organizations: number; locations: number; activeEmployees: number; work: { total: number; overdue: number }; inventory: { lowStockCount: number }; finance: { net: number }; pendingApprovals: number; }

export default function WorkspaceDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; api.workspace.overview().then((data) => active && setOverview(data)).catch((err: unknown) => active && setError(err instanceof Error ? err.message : "Could not load workspace.")); return () => { active = false; }; }, []);
  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!overview) return <div className="page"><p className="hint">Loading your workspace…</p></div>;
  const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(overview.finance.net);
  return <div className="page"><div className="page-head"><div><h1 className="anim-rise">Daily workspace</h1><p className="hint">A clear view of the work, people, stock and money that need attention.</p></div></div><div className="dashboard-grid"><Metric label="Organizations" value={overview.organizations} to="/organizations" /><Metric label="Locations" value={overview.locations} to="/locations" /><Metric label="Active employees" value={overview.activeEmployees} to="/hr" /><Metric label="Open work" value={overview.work.total} to="/operations" /><Metric label="Overdue work" value={overview.work.overdue} tone="danger" to="/operations?view=overdue" /><Metric label="Low-stock alerts" value={overview.inventory.lowStockCount} tone="warning" to="/inventory" /><Metric label="Net recorded" value={money} to="/finance" /><Metric label="Approval inbox" value={overview.pendingApprovals} to="/access" /></div><section className="card workspace-callout"><h2>Start the day</h2><p className="hint">Review overdue work, record any stock movement, and process pending approvals before closing the day.</p><div className="inline-actions"><NavLink className="primary-link" to="/operations">Open daily work</NavLink><NavLink className="secondary-link" to="/access">Review approvals</NavLink></div></section></div>;
}

function Metric({ label, value, to, tone }: { label: string; value: string | number; to: string; tone?: "danger" | "warning" }) {
  return <NavLink className="card metric-card hoverable" to={to}><span>{label}</span><strong className={tone ? `metric-${tone}` : ""}>{value}</strong><small>Open</small></NavLink>;
}