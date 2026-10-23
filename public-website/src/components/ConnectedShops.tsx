import { usePublicLanguage } from "../language-context";

export default function ConnectedShops() {
  const { t } = usePublicLanguage();
  return (
    <section
      className="service-inclusions connected-shops"
      aria-labelledby="connected-shops-title"
    >
      <div className="section-heading">
        <div>
          <p className="site-kicker">
            {t("YOUR SHOP. YOUR COMPANY. CONNECTED.")}
          </p>
          <h2 id="connected-shops-title">
            {t("From the first product")}
            <br />
            <em>{t("to the delivered order.")}</em>
          </h2>
        </div>
        <p>
          {t(
            "We build custom shop websites around your brand and connect the agreed sales workflow to your company in STOCRANT.",
          )}
        </p>
      </div>
      <div className="inclusion-grid">
        {[
          [
            "01",
            "A shop that feels like yours",
            "Your identity, product pages, categories, mobile shopping and clear customer contact options.",
          ],
          [
            "02",
            "A prepared company workspace",
            "Product records, Excel product imports, incoming shipments and stock reserved for accepted orders.",
          ],
          [
            "03",
            "Orders with a clear journey",
            "Follow preparation, dispatch and delivery. Keep shipment references and link dispatched sales to Finance.",
          ],
          [
            "04",
            "A connection with clear boundaries",
            "Each shop connects to its own company. Payment providers, delivery services, domain setup and launch checks are agreed for each project.",
          ],
        ].map(([number, title, detail]) => (
          <article key={number}>
            <span className="site-kicker">{number}</span>
            <h3>{t(title)}</h3>
            <p>{t(detail)}</p>
          </article>
        ))}
      </div>
      <div className="module-connect">
        <h3>{t("Build the foundation. Then open the shop.")}</h3>
        <p>
          {t(
            "First we prepare your company, products and order process in STOCRANT. Next we design and connect your storefront, test the full journey and arrange the launch with you.",
          )}
        </p>
        <p>
          {t(
            "An inquiry is the first step. It does not create a live shop or enable payments automatically.",
          )}
        </p>
        <a className="site-button secondary" href="#inquire">
          {t("Tell us about your shop")}
        </a>
      </div>
    </section>
  );
}
