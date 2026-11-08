import { app } from "electron";
import type { Weather } from "../shared/bridge.js";

/**
 * Current weather from Open-Meteo (free, no account, no key). The city comes from Settings,
 * or is guessed from the Windows time zone (e.g. Asia/Qatar -> Doha). Only the city name and
 * its coordinates are sent; nothing about the user.
 */
const zoneCity: Record<string, string> = { "Asia/Qatar": "Doha", "Asia/Riyadh": "Riyadh", "Asia/Dubai": "Dubai", "Asia/Kuwait": "Kuwait City", "Asia/Bahrain": "Manama", "Asia/Muscat": "Muscat", "Africa/Cairo": "Cairo", "Africa/Khartoum": "Khartoum", "Europe/London": "London" };
/** Capital by the country set in Windows; this is more reliable than the time zone (Qatar uses "Riyadh" time). */
const countryZone: Record<string, string[]> = { QA: ["Asia/Qatar", "Asia/Riyadh"], SA: ["Asia/Riyadh"], AE: ["Asia/Dubai"], KW: ["Asia/Kuwait", "Asia/Riyadh"], BH: ["Asia/Bahrain", "Asia/Riyadh"], OM: ["Asia/Muscat", "Asia/Dubai"], EG: ["Africa/Cairo"], SD: ["Africa/Khartoum"], JO: ["Asia/Amman"], GB: ["Europe/London"], IN: ["Asia/Calcutta", "Asia/Kolkata"], PK: ["Asia/Karachi"], TR: ["Europe/Istanbul"], MA: ["Africa/Casablanca"] };
const countryCity: Record<string, string> = { QA: "Doha", SA: "Riyadh", AE: "Dubai", KW: "Kuwait City", BH: "Manama", OM: "Muscat", EG: "Cairo", SD: "Khartoum", JO: "Amman", GB: "London", US: "New York", IN: "New Delhi", PK: "Karachi", TR: "Istanbul", MA: "Casablanca" };
export function guessCity() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  try { const country = app.getLocaleCountryCode(); if (countryCity[country] && (countryZone[country] || []).includes(zone)) return countryCity[country]; } catch { /* fall back to the time zone */ }
  return zoneCity[zone] || zone.split("/").pop()?.replace(/_/g, " ") || "";
}
const geocodeCache = new Map<string, { latitude: number; longitude: number; name: string }>();
export async function fetchWeather(cityInput: string): Promise<Weather | null> {
  const city = (cityInput.trim() || guessCity()).slice(0, 80);
  if (!city) return null;
  let place = geocodeCache.get(city.toLowerCase());
  if (!place) {
    const found = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(city)}`, { signal: AbortSignal.timeout(8000) })).json() as { results?: { latitude: number; longitude: number; name: string }[] };
    place = found.results?.[0]; if (!place) return null;
    geocodeCache.set(city.toLowerCase(), place);
  }
  const data = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,is_day&timezone=auto`, { signal: AbortSignal.timeout(8000) })).json() as { current?: { temperature_2m: number; weather_code: number; is_day: number } };
  if (!data.current) return null;
  return { temp: Math.round(data.current.temperature_2m), code: data.current.weather_code, isDay: data.current.is_day === 1, city: place.name, at: Date.now() };
}
