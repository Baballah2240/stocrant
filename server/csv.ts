/** Pure encoder shared by server exports and the browser attendance download. */
export function csvCell(value: unknown): string {
  let text = Array.isArray(value) ? value.map(String).join("; ") : value == null ? "" : String(value);
  // Quoting alone does not prevent spreadsheet applications from evaluating text.
  // Real numeric values stay numeric, including negative financial adjustments.
  if (typeof value !== "number" && (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text))) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}
