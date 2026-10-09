import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import type { EntitySpec, ModuleInfo, ModuleKey } from "./types";

interface MetaContextValue {
  modules: Record<ModuleKey, ModuleInfo> | null;
  entities: EntitySpec[];
  byCollection: Record<string, EntitySpec>;
  loading: boolean;
  error: string | null;
}

const MetaContext = createContext<MetaContextValue>({
  modules: null,
  entities: [],
  byCollection: {},
  loading: true,
  error: null,
});

export function MetaProvider({ children }: { children: ReactNode }) {
  const [modules, setModules] = useState<Record<ModuleKey, ModuleInfo> | null>(null);
  const [entities, setEntities] = useState<EntitySpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.collections
      .meta()
      .then((res) => {
        if (!active) return;
        setModules(res.modules);
        setEntities(res.entities);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Metadata failed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<MetaContextValue>(() => {
    const byCollection: Record<string, EntitySpec> = {};
    for (const entity of entities) byCollection[entity.collection] = entity;
    return { modules, entities, byCollection, loading, error };
  }, [modules, entities, loading, error]);

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export function useMeta(): MetaContextValue {
  return useContext(MetaContext);
}
