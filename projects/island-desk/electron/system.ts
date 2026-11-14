// Windows display controls: brightness (WMI, built-in/laptop panels) and Night Light (per-user CloudStore registry blob).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BatteryState } from "../shared/bridge.js";
const run = promisify(execFile);
const NIGHT_KEY = ["HKCU", "Software", "Microsoft", "Windows", "CurrentVersion", "CloudStore", "Store", "DefaultAccount", "Current", "default$windows.data.bluelightreduction.bluelightreductionstate", "windows.data.bluelightreduction.bluelightreductionstate"].join(String.fromCharCode(92));
const ps = async (script: string) => (await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 8000 })).stdout.trim();

let batteryRead: Promise<BatteryState | null> | null = null;
/** Read Windows power status without opening a console or changing system settings. */
export function getBattery(): Promise<BatteryState | null> {
  if (process.platform !== "win32") return Promise.resolve(null);
  if (batteryRead) return batteryRead;
  batteryRead = ps('Add-Type -AssemblyName System.Windows.Forms; $p=[System.Windows.Forms.SystemInformation]::PowerStatus; @{level=[double]$p.BatteryLifePercent; flags=[int]$p.BatteryChargeStatus; ac=[int]$p.PowerLineStatus} | ConvertTo-Json -Compress')
    .then(raw => {
      const status = JSON.parse(raw);
      if (status.flags === 255 || (status.flags & 128) !== 0 || typeof status.level !== "number" || status.level < 0 || status.level > 1) return null;
      return { level: Math.round(status.level * 100), charging: (status.flags & 8) !== 0, onAC: status.ac === 1 };
    }).catch(() => null).finally(() => { batteryRead = null; });
  return batteryRead;
}

export async function getBrightness(): Promise<number | null> {
  if (process.platform !== "win32") return null;
  try { const value = Number(await ps("(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness")); return Number.isFinite(value) ? value : null; }
  catch { return null; }
}
export async function setBrightness(level: number) {
  const value = Math.round(Math.max(0, Math.min(100, level)));
  try { await ps(`Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{Timeout=0;Brightness=${value}} | Out-Null`); }
  catch { throw Error("This screen doesn't support software brightness. External monitors usually need their own buttons."); }
}
async function readNight(): Promise<number[] | null> {
  try {
    const { stdout } = await run("reg.exe", ["query", NIGHT_KEY, "/v", "Data"], { windowsHide: true });
    const hex = stdout.match(/REG_BINARY\s+([0-9A-F]+)/i)?.[1]; if (!hex) return null;
    return hex.match(/../g)!.map(byte => parseInt(byte, 16));
  } catch { return null; }
}
export async function getNightLight(): Promise<boolean | null> {
  const data = await readNight(); if (!data || data.length < 25) return null;
  return data[18] === 0x15;
}
export async function setNightLight(on: boolean) {
  const data = await readNight();
  if (!data || data.length < 25 || ![0x13, 0x15].includes(data[18])) throw Error("Night Light couldn't be changed here. Open Windows Settings > Display > Night light once, then try again.");
  if ((data[18] === 0x15) === on) return;
  const next = on ? [...data.slice(0, 23), 0x10, 0x00, ...data.slice(23)] : [...data.slice(0, 23), ...data.slice(25)];
  next[18] = on ? 0x15 : 0x13;
  for (let i = 10; i < 15; i++) if (next[i] !== 0xff) { next[i]++; break; } // bump the change stamp so Windows applies it
  const hex = next.map(byte => byte.toString(16).padStart(2, "0")).join("");
  await run("reg.exe", ["add", NIGHT_KEY, "/v", "Data", "/t", "REG_BINARY", "/d", hex, "/f"], { windowsHide: true });
}
