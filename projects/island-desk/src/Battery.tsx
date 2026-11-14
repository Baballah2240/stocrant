import { useEffect, useState } from "react";
import type { BatteryState } from "../shared/bridge";

export function useBattery() {
  const [battery, setBattery] = useState<BatteryState | null>(null);
  useEffect(() => {
    let active = true, pending = false;
    async function refresh() {
      if (pending || !window.island) return;
      pending = true;
      try { const value = await window.island.battery(); if (active) setBattery(value); }
      catch { if (active) setBattery(null); }
      finally { pending = false; }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    const unsubscribe = window.island?.onEvent(event => { if (active && event.type === "battery") setBattery(event.battery); });
    window.addEventListener("focus", refresh);
    return () => { active = false; clearInterval(timer); unsubscribe?.(); window.removeEventListener("focus", refresh); };
  }, []);
  return battery;
}

export function BatteryIndicator({ battery }: { battery: BatteryState | null }) {
  if (!battery) return null;
  const status = battery.charging ? "Charging" : battery.onAC ? battery.level === 100 ? "Fully charged" : "Plugged in" : "On battery";
  const label = `${battery.level}% · ${status}`;
  return <span className={`island-battery${battery.charging ? " is-charging" : ""}${!battery.onAC && battery.level <= 20 ? " is-low" : ""}`} title={label} aria-label={label}>
    <svg width="23" height="14" viewBox="0 0 26 16" fill="none" aria-hidden="true"><rect x="1" y="2" width="21" height="12" rx="3" stroke="currentColor" strokeWidth="1.5"/><path d="M24 6v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>{battery.charging ? <path d="m12 3-5 6h4l-1 4 6-7h-5z" fill="currentColor"/> : <rect x="3" y="4" width={17 * battery.level / 100} height="8" rx="1" fill="currentColor"/>}</svg><span>{battery.level}%</span>
  </span>;
}
