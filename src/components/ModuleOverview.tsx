import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { useMeta } from "../meta-context";
import BackButton from "./BackButton";
import type { ModuleKey } from "../types";

interface ModuleOverviewProps {
  module: ModuleKey;
}

export default function ModuleOverview({ module }: ModuleOverviewProps) {
  const { modules, entities, loading } = useMeta();

  const moduleInfo = modules?.[module];
  const moduleEntities = useMemo(
    () => (entities ?? []).filter((e) => e.module === module),
    [entities, module],
  );

  if (loading || !moduleInfo) {
    return <p className="hint">Loading metadata&hellip;</p>;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <BackButton />
          <h1 className="anim-rise">
            {moduleInfo.label}
          </h1>
          <p className="hint">
            {moduleEntities.length} {moduleEntities.length === 1 ? "entity" : "entities"} · Manage your
            {module} module from one place
          </p>
        </div>
      </div>

      {moduleEntities.length === 0 ? (
        <div className="card">
          <p className="empty">No entities registered for this module yet.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Collection</th>
                <th>Singular</th>
                <th className="num">Open</th>
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
                  <td>{entity.label}</td>
                  <td className="num">
                    <NavLink
                      to={`/${entity.module}/${entity.collection}`}
                      className="link-row"
                    >
                      Open list
                    </NavLink>
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