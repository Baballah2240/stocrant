import { useLanguage } from "../language-context";
import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { useMeta } from "../meta-context";
import { useSession } from "../session-context";
import BackButton from "./BackButton";
import type { ModuleKey } from "../types";

interface ModuleOverviewProps {
  module: ModuleKey;
}

export default function ModuleOverview({ module }: ModuleOverviewProps) {
  const { t } = useLanguage();
  const { modules, entities, loading } = useMeta();
  const { user } = useSession();
  const canAddCompany = module === "organization" && user?.roleId === "role-main-manager"
    && user.permissions.some((permission) => ["*", "organizations.*", "organizations.create"].includes(permission));

  const moduleInfo = modules?.[module];
  const moduleEntities = useMemo(
    () => (entities ?? []).filter((e) => e.module === module),
    [entities, module],
  );

  if (loading || !moduleInfo) {
    return <p className="hint">{t("Loading metadata…")}</p>;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <BackButton />
          <h1 className="anim-rise">
            {t(moduleInfo.label)}
          </h1>
          <p className="hint">
            {moduleEntities.length} {moduleEntities.length === 1 ? t("entity") : t("entities")}  {t("· Manage your")} {module}  {t("module from one place")} </p>
        </div>
        {canAddCompany && (
          <NavLink className="primary-link" to="/organization/companies/new">
             {t("Add company")} </NavLink>
        )}
      </div>

      {moduleEntities.length === 0 ? (
        <div className="card">
          <p className="empty">{t("No entities registered for this module yet.")}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t("Collection")}</th>
                <th>{t("Singular")}</th>
                <th className="num">{t("Open")}</th>
              </tr>
            </thead>
            <tbody>
              {moduleEntities.map((entity) => (
                <tr key={entity.collection} className="anim-rise-1">
                  <td>
                    <strong>{entity.collection}</strong>
                    <span className="hint">·</span>
                    <span className="hint">{entity.permission}</span>
                  </td>
                  <td>{t(entity.label)}</td>
                  <td className="num">
                    <NavLink
                      to={`/${entity.module}/${entity.collection}`}
                      className="link-row"
                    >
                       {t("Open list")} </NavLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
