// gen-icons.mjs — gera os ícones PNG do PWA sem dependências (node tools/gen-icons.mjs).
// Desenho: logo (diagrama do acorde C, x32010) claro sobre fundo terracota (--accent); igual a icons/logo.svg.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../icons/', import.meta.url));
const BG = [0xb5, 0x53, 0x2a], FG = [0xff, 0xf8, 0xf0];

// ---------- PNG ----------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => { let c = ~0; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return ~c >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- Formas (coordenadas normalizadas 0..1) ----------
const rect = (x1, y1, x2, y2) => (x, y) => x >= x1 && x <= x2 && y >= y1 && y <= y2;
const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const roundRect = r => (x, y) => {
  const dx = Math.max(r - x, 0, x - (1 - r)), dy = Math.max(r - y, 0, y - (1 - r));
  return dx * dx + dy * dy <= r * r;
};

// Mesmo desenho de icons/logo.svg (logo escolhido, opção A): grade 64×64 reduzida a 80% e centrada.
function diagramShapes() {
  const P = X => (6.4 + 0.8 * X) / 64, xs = [14, 21.2, 28.4, 35.6, 42.8, 50];
  const s = [rect(P(13), P(13), P(51), P(17))]; // pestana (nut)
  for (const x of xs) s.push(rect(P(x - 1), P(17), P(x + 1), P(54)));
  for (const y of [27, 37, 47]) s.push(rect(P(14), P(y - 1), P(50), P(y + 1)));
  for (const [x, y] of [[21.2, 42], [28.4, 32], [42.8, 22]]) s.push(circle(P(x), P(y), (0.8 * 4.2) / 64)); // Dó: x32010
  return s;
}

function render(size, { maskable = false } = {}) {
  const bg = maskable ? () => true : roundRect(0.22);
  const k = maskable ? 0.72 : 1; // zona segura do maskable: círculo de raio 0,4
  const fg = diagramShapes();
  const inFg = (x, y) => { const u = 0.5 + (x - 0.5) / k, v = 0.5 + (y - 0.5) / k; return fg.some(f => f(u, v)); };
  const SS = 4, buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let a = 0, r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = (px + (sx + 0.5) / SS) / size, y = (py + (sy + 0.5) / SS) / size;
      if (!bg(x, y)) continue;
      const c = inFg(x, y) ? FG : BG;
      a++; r += c[0]; g += c[1]; b += c[2];
    }
    const o = (py * size + px) * 4;
    if (a) { buf[o] = Math.round(r / a); buf[o + 1] = Math.round(g / a); buf[o + 2] = Math.round(b / a); }
    buf[o + 3] = Math.round((255 * a) / (SS * SS));
  }
  return png(size, buf);
}

mkdirSync(OUT, { recursive: true });
const files = {
  'icon-192.png': render(192),
  'icon-512.png': render(512),
  'maskable-512.png': render(512, { maskable: true }),
  'apple-touch-icon.png': render(180, { maskable: true }), // iOS: opaco, sem cantos transparentes
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(OUT + name, data);
  console.log(`icons/${name} (${data.length} bytes)`);
}
