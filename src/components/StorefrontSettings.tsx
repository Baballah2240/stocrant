import { useEffect, useState, type FormEvent } from "react";
import { request, serverUrl } from "../api";
import { useLanguage } from "../language-context";
const initial = {
  version: 0,
  slug: "amal",
  name: "Amal",
  tagline: "",
  description: "",
  logo: "",
  contactEmail: "",
  phone: "",
  address: "",
  deliveryFee: "0",
  deliveryEnabled: false,
  pickupEnabled: true,
  deliveryRegions: "",
  shippingPolicy: "",
  returnsPolicy: "",
  privacyPolicy: "",
  terms: "",
  published: false,
  manualPaymentsAccepted: false,
  reservationHours: 24,
};
type Settings = typeof initial;
export default function StorefrontSettings({
  companyId,
}: {
  companyId: string;
}) {
  const { t } = useLanguage();
  const [settings, setSettings] = useState(initial),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    request<{ settings: Settings; url: string | null }>(
      `/workspace/storefronts/${companyId}`,
    )
      .then((r) => {
        if (active) {
          setSettings({ ...initial, ...r.settings });
          setUrl(r.url);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [companyId]);
  async function save(published = settings.published) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        ...Object.fromEntries(
          Object.keys(initial).map((key) => [
            key,
            settings[key as keyof Settings],
          ]),
        ),
        published,
      };
      const r = await request<{ settings: Settings; url: string }>(
        `/workspace/storefronts/${companyId}`,
        { method: "PUT", body: JSON.stringify(payload) },
      );
      setSettings({ ...initial, ...r.settings });
      setUrl(r.url);
      setNotice(
        published
          ? "Shop published. Verify its public address before sharing it."
          : "Shop settings saved as a draft.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function field(
    label: string,
    key:
      | "slug"
      | "name"
      | "tagline"
      | "description"
      | "logo"
      | "contactEmail"
      | "phone"
      | "address"
      | "deliveryFee"
      | "deliveryRegions"
      | "shippingPolicy"
      | "returnsPolicy"
      | "privacyPolicy"
      | "terms",
    type = "text",
    multiline = false,
  ) {
    return (
      <label className="form-field">
        <span>{t(label)}</span>
        {multiline ? (
          <textarea
            value={settings[key]}
            rows={4}
            onChange={(e) =>
              setSettings({ ...settings, [key]: e.target.value })
            }
          />
        ) : (
          <input
            type={type}
            value={settings[key]}
            onChange={(e) =>
              setSettings({ ...settings, [key]: e.target.value })
            }
          />
        )}
      </label>
    );
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save();
  };
  return (
    <section className="card storefront-settings">
      <div className="shop-section-title">
        <div>
          <h2>{t("Customer storefront")}</h2>
          <p>
            {t(
              "Build your shop under this company, then publish when its details and policies are ready.",
            )}
          </p>
        </div>
        <strong>{t(settings.published ? "Published" : "Draft")}</strong>
      </div>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
      {notice && <p role="status">{t(notice)}</p>}
      {loading ? (
        <p>{t("Loading…")}</p>
      ) : (
        <form onSubmit={submit}>
          <fieldset className="shop-controls" disabled={busy}>
            <div className="shop-two-columns">
              <section className="shop-form">
                <h3>{t("Shop identity")}</h3>
                {field("Shop name", "name")}
                {field("Shop address slug", "slug")}
                <p className="hint">
                  {t(
                    "Use lowercase letters, numbers and hyphens. The address is fixed after the first order.",
                  )}
                </p>
                {field("Tagline", "tagline")}
                {field("Shop description", "description", "text", true)}
                {field("Shop logo URL", "logo", "url")}
              </section>
              <section className="shop-form">
                <h3>{t("Customer contact")}</h3>
                {field("Email", "contactEmail", "email")}
                {field("Mobile number", "phone", "tel")}
                {field("Collection address", "address")}
              </section>
            </div>
            <section className="shop-form">
              <h3>{t("Delivery & payment")}</h3>
              <label>
                <input
                  type="checkbox"
                  checked={settings.pickupEnabled}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      pickupEnabled: e.target.checked,
                    })
                  }
                />{" "}
                {t("Allow collection from the shop")}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={settings.deliveryEnabled}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      deliveryEnabled: e.target.checked,
                    })
                  }
                />{" "}
                {t("Offer delivery")}
              </label>
              <div className="shop-two-columns">
                {field("Delivery fee", "deliveryFee", "number")}
                {field("Delivery regions (comma separated)", "deliveryRegions")}
              </div>
              <label className="form-field">
                <span>{t("Unprepared reservation duration (hours)")}</span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={settings.reservationHours}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      reservationHours: Number(e.target.value),
                    })
                  }
                />
              </label>
              <p className="hint">
                {t(
                  "Unprepared guest orders expire automatically. Preparing an order keeps its stock reserved.",
                )}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={settings.manualPaymentsAccepted}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      manualPaymentsAccepted: e.target.checked,
                    })
                  }
                />{" "}
                {t(
                  "I accept payment on delivery or collection. No online payments are collected.",
                )}
              </label>
            </section>
            <section className="shop-form">
              <h3>{t("Shop policies")}</h3>
              <p className="hint">
                {t(
                  "Write the actual policies your company will follow. All four policies are required for publication.",
                )}
              </p>
              <div className="shop-two-columns">
                {field("Shipping policy", "shippingPolicy", "text", true)}
                {field("Returns policy", "returnsPolicy", "text", true)}
                {field("Privacy policy", "privacyPolicy", "text", true)}
                {field("Terms of sale", "terms", "text", true)}
              </div>
            </section>
            <div className="shop-order-actions">
              <button className="btn primary" type="submit">
                {t("Save shop settings")}
              </button>
              {!settings.published ? (
                <button type="button" onClick={() => void save(true)}>
                  {t("Publish shop")}
                </button>
              ) : (
                <button type="button" onClick={() => void save(false)}>
                  {t("Unpublish shop")}
                </button>
              )}
              {url && (
                <a
                  href={`${serverUrl.current()}${url}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t(settings.published ? "Open shop" : "Preview shop")} ↗
                </a>
              )}
            </div>
            <p className="hint">
              {t(
                "Publishing enables the shop at its STOCRANT address. A custom subdomain needs separate DNS and hosting configuration.",
              )}
            </p>
          </fieldset>
        </form>
      )}
    </section>
  );
}
