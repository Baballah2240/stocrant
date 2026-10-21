/** Monetary reports use integer minor units; Number conversion is presentation-only. */
export const currencyDigits = (code: string) => ["JPY", "KRW"].includes(code) ? 0 : ["KWD", "BHD", "OMR"].includes(code) ? 3 : 2;
export function minor(value: unknown, code: string): bigint {
  const text = String(value ?? "0");
  if (!/^-?\d+(\.\d{1,4})?$/.test(text)) throw Error("Invalid monetary value");
  const [whole, fraction = ""] = text.replace("-", "").split("."), digits = currencyDigits(code);
  if (fraction.slice(digits).replace(/0/g, "")) throw Error("Invalid currency precision");
  return (text.startsWith("-") ? -1n : 1n) * (BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.slice(0, digits).padEnd(digits, "0") || "0"));
}
export function decimal(value: bigint, code: string): string {
  const digits = currencyDigits(code), absolute = value < 0n ? -value : value, scale = 10n ** BigInt(digits);
  return `${value < 0n ? "-" : ""}${absolute / scale}${digits ? "." + (absolute % scale).toString().padStart(digits, "0") : ""}`;
}
export function sumMoney(values: unknown[], code: string) { return decimal(values.reduce<bigint>((n, v) => n + minor(v, code), 0n), code); }
