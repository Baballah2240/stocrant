import { randomInt } from "node:crypto";
export function newProductAwb(used: Set<string>): string {
  let value: string;
  do { value = `AWB-${randomInt(100000000000, 1000000000000)}`; } while (used.has(value));
  used.add(value);
  return value;
}
