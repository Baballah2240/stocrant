import { useLanguage } from "../language-context";
import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { useMeta } from "../meta-context";

/** Finance hub: links to the money-related collections (all live in the stores module). */
const FINANCE_COLLECTIONS = ["sales", "expenses", "taxes", "purchases", "returns"];

export default function FinanceOverview() {
  const { t } = useLanguage();
  const { byCollection, loading } = useMeta();

  const items = useMemo(
    () =>
      FINANCE_COLLECTIONS.map((collection) => byCollection[collection]).filter(
        (entity): entity is NonNullable<typeof entity> => Boolean(entity),
      ),
    [byCollection],
  );

  if (loading) {
    return <p className="hint">{t("Loading metadata…")}</p>;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="anim-rise">{t("Finance")}</h1>
          <p className="hint">{t("Sales, expenses, taxes, purchases and returns across the business.")}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <p className="empty">{t("No finance entities are registered yet.")}</p>
        </div>
      ) : (
        <div className="module-grid">
          {items.map((entity) => (
            <NavLink
              key={entity.collection}
              to={`/${entity.module}/${entity.collection}`}
              className="card entity-card"
            >
              <span className="entity-title">{t(entity.label)}</span>
              <span className="entity-sub">{t(entity.singular)}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
