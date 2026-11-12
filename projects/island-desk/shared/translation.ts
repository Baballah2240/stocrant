export const translationLanguages = [
  { code: "en", label: "English" }, { code: "ar", label: "Arabic", rtl: true },
  { code: "fr", label: "French" }, { code: "es", label: "Spanish" },
  { code: "de", label: "German" }, { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" }, { code: "tr", label: "Turkish" },
  { code: "hi", label: "Hindi" }, { code: "ur", label: "Urdu", rtl: true },
  { code: "zh-CN", label: "Chinese (simplified)" }, { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" }, { code: "ru", label: "Russian" },
] as const;
export const translationLimit = 3000;
export interface TranslationRequest { text: string; from: string; to: string }
export type TranslationResult = { ok: true; text: string } | { ok: false; error: "invalid" | "offline" | "limit" | "unavailable" | "canceled" };
export function validTranslation(value: unknown): value is TranslationRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as TranslationRequest;
  return typeof v.text === "string" && Boolean(v.text.trim()) && v.text.length <= translationLimit && v.from !== v.to &&
    translationLanguages.some(l => l.code === v.from) && translationLanguages.some(l => l.code === v.to);
}
/** MyMemory accepts at most 500 UTF-8 bytes. Preserve separators outside requests. */
export function translationSegments(text: string): string[] {
  const segments: string[] = [];
  for (const paragraph of text.split(/(\n+)/)) {
    if (!paragraph || /^\n+$/.test(paragraph)) { segments.push(paragraph); continue; }
    let chunk = "", bytes = 0;
    for (const char of paragraph) {
      const size = new TextEncoder().encode(char).length;
      if (bytes + size > 480) {
        const boundary = chunk.lastIndexOf(" ");
        if (boundary > chunk.length / 2) {
          segments.push(chunk.slice(0, boundary), " ");
          chunk = chunk.slice(boundary + 1);
          bytes = new TextEncoder().encode(chunk).length;
        } else { segments.push(chunk); chunk = ""; bytes = 0; }
      }
      chunk += char; bytes += size;
    }
    if (chunk) segments.push(chunk);
  }
  return segments;
}
/** Network only runs after a deliberate submit. No history, keys, telemetry or disk writes. */
export async function translateText(value: unknown, signal: AbortSignal, request: typeof fetch = fetch): Promise<TranslationResult> {
  if (!validTranslation(value)) return { ok: false, error: "invalid" };
  const output: string[] = [];
  try {
    for (const segment of translationSegments(value.text)) {
      if (signal.aborted) return { ok: false, error: "canceled" };
      if (!segment.trim()) { output.push(segment); continue; }
      const url = new URL("https://api.mymemory.translated.net/get");
      url.search = new URLSearchParams({ q: segment, langpair: `${value.from}|${value.to}`, mt: "1" }).toString();
      const response = await request(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), redirect: "error" });
      if (response.status === 429) return { ok: false, error: "limit" };
      if (!response.ok) return { ok: false, error: "unavailable" };
      const data = await response.json() as { responseStatus?: unknown; quotaFinished?: unknown; responseData?: { translatedText?: unknown } };
      if (data.quotaFinished || Number(data.responseStatus) === 429 || Number(data.responseStatus) === 403) return { ok: false, error: "limit" };
      const text = data.responseData?.translatedText;
      if (Number(data.responseStatus) !== 200 || typeof text !== "string" || !text.trim() || text.length > 12000) return { ok: false, error: "unavailable" };
      output.push(text);
    }
    return signal.aborted ? { ok: false, error: "canceled" } : { ok: true, text: output.join("") };
  } catch { return { ok: false, error: signal.aborted ? "canceled" : "offline" }; }
}
