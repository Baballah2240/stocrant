import { useEffect, useState } from "react";
import { request } from "../api";
import { useLanguage } from "../language-context";
import "../shop-stats.css";

type Day = { date: string; visitors: number; orders: number; sales: string };
type Stats = { days: number; from: string; to: string; currency: string; totals: { visitors: number; productViews: number; bagAdds: number; checkouts: number; orders: number; cancelled: number; revenue: string; averageOrder: string; conversion: number; abandoned: number }; series: Day[]; bestSellers: { productId: string; name: string; quantity: number; revenue: string }[]; mostViewed: { productId: string; name: string; views: number; sold: number }[] };

/** Online shop figures: visitors, conversion, funnel, abandoned bags, best sellers and most viewed products. */
export default function ShopStorefrontStats({ companyId }: { companyId: string }) {
  const { t, language } = useLanguage(), [days, setDays] = useState(30), [stats, setStats] = useState<Stats | null | undefined>(undefined), [error, setError] = useState(""), [table, setTable] = useState(false), [hover, setHover] = useState<number | null>(null);
  useEffect(() => { let active = true; setError(""); void request<{ stats: Stats | null }>(`/workspace/storefronts/${encodeURIComponent(companyId)}/stats?days=${days}`).then(r => { if (active) setStats(r.stats); }).catch(e => { if (active) setError((e as Error).message); }); return () => { active = false; }; }, [companyId, days]);
  const locale = language === "ar" ? "ar" : "en-GB", n = (v: number) => new Intl.NumberFormat(locale).format(v);
  const cash = (v: string) => v === "" ? "—" : new Intl.NumberFormat(locale, { style: "currency", currency: stats?.currency || "USD", maximumFractionDigits: 2 }).format(Number(v));
  const date = (v: string) => new Date(v + "T00:00:00").toLocaleDateString(locale, { day: "numeric", month: "short" });
  if (stats === null) return <section className="card shop-stats"><h2>{t("Shop figures")}</h2><p className="hint">{t("Set up the customer storefront to see visitors and sales here.")}</p></section>;
  const T = stats?.totals, max = Math.max(1, ...(stats?.series || []).map(d => d.visitors));
  const funnel: [string, number][] = T ? [["Visitors", T.visitors], ["Viewed a product", T.productViews], ["Added to bag", T.bagAdds], ["Started checkout", T.checkouts], ["Ordered", T.orders]] : [];
  return <section className="card shop-stats" aria-busy={!stats}>
    <header className="shop-stats-head"><div><h2>{t("Shop figures")}</h2><p className="hint">{t("Visitors are counted once per day per browser, without personal data.")}</p></div>
      <div className="shop-stats-range" role="group" aria-label={t("Period")}>{[7, 30, 90].map(d => <button type="button" key={d} aria-pressed={days === d} onClick={() => setDays(d)}>{t("{days} days", { days: d })}</button>)}</div></header>
    {error && <p className="error" role="alert">{t(error)}</p>}
    {!stats || !T ? <p role="status">{t("Loading…")}</p> : <>
      <div className="shop-stats-tiles">
        <div><span>{t("Visitors")}</span><strong>{n(T.visitors)}</strong></div>
        <div><span>{t("Orders")}</span><strong>{n(T.orders)}</strong>{T.cancelled > 0 && <small>{t("{count} cancelled", { count: T.cancelled })}</small>}</div>
        <div><span>{t("Conversion rate")}</span><strong>{new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(T.conversion)}%</strong><small>{t("orders per visitor")}</small></div>
        <div><span>{t("Sales")}</span><strong>{cash(T.revenue)}</strong><small>{t("Average order")}: {cash(T.averageOrder)}</small></div>
        <div data-tone={T.abandoned ? "warn" : undefined}><span>{t("Abandoned checkouts")}</span><strong>{n(T.abandoned)}</strong><small>{t("started checkout, no order")}</small></div>
      </div>
      <div className="shop-stats-grid">
        <figure className="shop-stats-chart">
          <figcaption><strong>{t("Visitors per day")}</strong><button type="button" className="link-button" onClick={() => setTable(v => !v)}>{t(table ? "Show chart" : "Show table")}</button></figcaption>
          {table ? <div className="shop-stats-table-wrap"><table><thead><tr><th>{t("Date")}</th><th>{t("Visitors")}</th><th>{t("Orders")}</th><th>{t("Sales")}</th></tr></thead><tbody>{stats.series.map(d => <tr key={d.date}><td>{date(d.date)}</td><td>{n(d.visitors)}</td><td>{n(d.orders)}</td><td>{cash(d.sales)}</td></tr>)}</tbody></table></div> :
            <div className="shop-stats-bars" onMouseLeave={() => setHover(null)}>
              {stats.series.map((d, i) => <button type="button" key={d.date} className="shop-stats-bar" aria-label={`${date(d.date)}: ${n(d.visitors)} ${t("Visitors")}, ${n(d.orders)} ${t("Orders")}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}><span style={{ height: `${d.visitors ? Math.max(3, d.visitors / max * 100) : 0}%` }} /></button>)}
              {hover !== null && stats.series[hover] && <div className="shop-stats-tip" style={{ insetInlineStart: `${Math.min(80, Math.max(0, hover / stats.series.length * 100 - 8))}%` }} role="status"><strong>{date(stats.series[hover].date)}</strong><span>{n(stats.series[hover].visitors)} {t("Visitors")}</span><span>{n(stats.series[hover].orders)} {t("Orders")}</span>{stats.series[hover].sales !== "" && <span>{cash(stats.series[hover].sales)}</span>}</div>}
              <div className="shop-stats-axis"><span>{date(stats.from)}</span><span>{date(stats.to)}</span></div>
            </div>}
        </figure>
        <figure className="shop-stats-funnel"><figcaption><strong>{t("From visit to order")}</strong></figcaption>
          {funnel.map(([label, value]) => <div key={label}><span>{t(label)}</span><span className="shop-stats-funnel-track"><span style={{ width: `${T.visitors ? Math.min(100, value / T.visitors * 100) : 0}%` }} /></span><b>{n(value)}</b></div>)}
        </figure>
      </div>
      <div className="shop-stats-grid">
        <section><h3>{t("Best sellers")}</h3>{stats.bestSellers.length ? <table><thead><tr><th>{t("Product")}</th><th>{t("Sold")}</th><th>{t("Sales")}</th></tr></thead><tbody>{stats.bestSellers.map(b => <tr key={b.productId}><td>{b.name}</td><td>{n(b.quantity)}</td><td>{cash(b.revenue)}</td></tr>)}</tbody></table> : <p className="hint">{t("No orders in this period yet.")}</p>}</section>
        <section><h3>{t("Most viewed")}</h3>{stats.mostViewed.length ? <table><thead><tr><th>{t("Product")}</th><th>{t("Views")}</th><th>{t("Sold")}</th></tr></thead><tbody>{stats.mostViewed.map(v => <tr key={v.productId}><td>{v.name}</td><td>{n(v.views)}</td><td>{n(v.sold)}</td></tr>)}</tbody></table> : <p className="hint">{t("No product views in this period yet.")}</p>}<p className="hint">{t("Many views but few sales can mean the price, photos or description need work.")}</p></section>
      </div>
    </>}
  </section>;
}
