import { useSearchParams } from "react-router-dom";

/** Tabs are navigation entries so both the header and browser Back restore them. */
export function useWorkspaceTab<T extends string>(options: readonly T[], defaultTab: T): [T, (tab: T) => void] {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab") as T | null;
  const tab = requested && options.includes(requested) ? requested : defaultTab;
  return [tab, next => {
    if (next === tab) return;
    setParams(previous => {
      const updated = new URLSearchParams(previous);
      updated.set("tab", next);
      return updated;
    });
  }];
}
