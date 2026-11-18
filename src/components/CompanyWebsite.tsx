import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../api";
import { useLanguage } from "../language-context";
import { useSession } from "../session-context";
import MobileIcon from "./MobileIcon";
import "../shop-clients.css";

type Client = { id: string; companyId: string; effectiveStatus: string; plan: string; endsAt: string; shop: { url: string; published: boolean } | null };

/** Company overview card: the company's online shop service, or a button to add one (platform owner only). */
export default function CompanyWebsite({ companyId }: { companyId: string }) {
  const { t } = useLanguage(), { user } = useSession(), owner = user?.roleId === "role-main-manager";
  const [client, setClient] = useState<Client | null | undefined>(undefined);
  useEffect(() => { if (!owner) return; let active = true; void request<{ clients: Client[] }>("/workspace/shop-clients").then(d => { if (active) setClient(d.clients.find(c => c.companyId === companyId) || null); }).catch(() => { if (active) setClient(undefined); }); return () => { active = false; }; }, [companyId, owner]);
  if (!owner || client === undefined) return null;
  return <section className="card company-website-card"><div><h2><MobileIcon name="shop" /> {t("Website & online shop")}</h2>
    <p className="hint">{client ? t("Plan {plan} · {status} · paid until {date}", { plan: t(client.plan), status: t(client.effectiveStatus), date: client.endsAt || "—" }) : t("Give this company its own online shop connected to its products, stock and finance.")}</p></div>
    <div className="inline-actions">{client ? <>{client.shop && <a className="button" href={client.shop.url} target="_blank" rel="noreferrer">{t(client.shop.published ? "Open shop" : "Preview shop")}</a>}<Link className="button" to="/shop-clients">{t("Manage service")}</Link></> : <Link className="button primary" to={`/shop-clients?company=${encodeURIComponent(companyId)}`}>{t("Add online shop")}</Link>}</div>
  </section>;
}
