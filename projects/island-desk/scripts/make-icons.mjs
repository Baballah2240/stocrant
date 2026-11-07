// Generates the original Island Desk icon (a black pill with a mint dot) as PNG + ICO, with no dependencies.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const w = size * 0.92, h = size * 0.46, x0 = (size - w) / 2, y0 = (size - h) / 2, r = h / 2;
  const cover = (x, y) => { const cx = Math.max(x0 + r, Math.min(x, x0 + w - r)), cy = y0 + r; return Math.max(0, Math.min(1, r + 0.5 - Math.hypot(x - cx, y - cy))); };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * (size * 4 + 1) + 1 + x * 4, px = x + 0.5, py = y + 0.5;
    const a = cover(px, py), dot = Math.max(0, Math.min(1, h * 0.2 + 0.5 - Math.hypot(px - (x0 + w - r), py - (y0 + r))));
    const border = Math.max(0, Math.min(1, cover(px, py) - Math.max(0, Math.min(1, r - size / 32 + 0.5 - Math.hypot(px - Math.max(x0 + r, Math.min(px, x0 + w - r)), py - y0 - r)))));
    const g = 10 + border * 90;
    raw[i] = g + dot * (188 - g); raw[i + 1] = g + dot * (232 - g); raw[i + 2] = g + dot * (200 - g); raw[i + 3] = Math.round(a * 255);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
mkdirSync("public", { recursive: true }); mkdirSync("assets", { recursive: true });
writeFileSync("public/tray.png", png(32));
const sizes = [16, 32, 48, 256], images = sizes.map(png);
const header = Buffer.alloc(6 + 16 * sizes.length); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, n) => { const e = 6 + n * 16; header[e] = s % 256; header[e + 1] = s % 256; header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6); header.writeUInt32LE(images[n].length, e + 8); header.writeUInt32LE(offset, e + 12); offset += images[n].length; });
writeFileSync("assets/icon.ico", Buffer.concat([header, ...images])); writeFileSync("assets/icon.png", png(256));
console.log("Icons written.");
