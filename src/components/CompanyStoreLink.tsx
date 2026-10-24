import { useEffect, useState } from "react";
import { request, serverUrl } from "../api";
import { useLanguage } from "../language-context";

type StoreLink = { settings: { published: boolean }; url: string | null };

export default function CompanyStoreLink({ companyId, companyName, configure }: { companyId: string; companyName: string; configure: () => void }) {
  const { t } = useLanguage();
  const [data, setData] = useState<StoreLink | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    request<StoreLink>(`/workspace/storefronts/${encodeURIComponent(companyId)}`)
      .then(result => { if (active) setData(result); })
      .catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [companyId]);
  const url = data?.url ? new URL(data.url, serverUrl.current() || window.location.origin).href : "";
  return <section className="shop-company-store-link">
    <h3>{t("Company store link")}</h3>
    <p><strong>{companyName}</strong>{data && <> · {t(data.settings.published ? "Published" : "Draft")}</>}</p>
    {error ? <p role="alert" className="error">{t(error)}</p> : !data ? <p role="status">{t("Loading…")}</p> : url ? <>
      <label className="form-field"><span>{t("Store address")}</span><input type="url" readOnly dir="ltr" value={url} onFocus={event => event.currentTarget.select()} /></label>
      {!data.settings.published && <p className="hint">{t("This store is a draft. Publish it in Customer storefront before sharing the link.")}</p>}
      <div className="inline-actions">{data.settings.published && <a href={url} target="_blank" rel="noreferrer">{t("Open shop")} ↗</a>}<button type="button" onClick={configure}>{t("Customer storefront")}</button></div>
    </> : <><p className="hint">{t("Set up this company's storefront to create its store link.")}</p><button type="button" onClick={configure}>{t("Customer storefront")}</button></>}
  </section>;
}
