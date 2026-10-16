// Saca los cuadros de un GIF animado (por ejemplo uno hecho con IA) como PNG, sin dependencias.
//   node tools/gif-cuadros.mjs assets/nuevas/x.gif hoja salida.png          → todos los cuadros en una grilla de 6 columnas (para elegir)
//   node tools/gif-cuadros.mjs assets/nuevas/x.gif tira salida.png 3,5,7,9  → esos cuadros uno al lado del otro (para tools/importar-personaje.html)
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

export function decodeGif(buf) {
  let p = 6;
  const W = buf[p] | buf[p + 1] << 8, H = buf[p + 2] | buf[p + 3] << 8, flags = buf[p + 4];
  p += 7;
  const readTable = n => { const t = []; for (let i = 0; i < n; i++) t.push([buf[p++], buf[p++], buf[p++]]); return t; };
  const global = flags & 0x80 ? readTable(1 << ((flags & 7) + 1)) : null;
  const canvas = new Uint8ClampedArray(W * H * 4), frames = [];
  let transp = -1, disposal = 0, prev = null;
  while (p < buf.length) {
    const b = buf[p++];
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = buf[p++];
      if (label === 0xf9) { const f = buf[p + 1]; disposal = (f >> 2) & 7; transp = f & 1 ? buf[p + 4] : -1; }
      while (buf[p]) p += buf[p] + 1;
      p++;
      continue;
    }
    if (b !== 0x2c) break;
    const x0 = buf[p] | buf[p + 1] << 8, y0 = buf[p + 2] | buf[p + 3] << 8, w = buf[p + 4] | buf[p + 5] << 8, h = buf[p + 6] | buf[p + 7] << 8, lf = buf[p + 8];
    p += 9;
    const table = lf & 0x80 ? readTable(1 << ((lf & 7) + 1)) : global, inter = lf & 0x40;
    const minCode = buf[p++];
    const chunks = [];
    while (buf[p]) { chunks.push(buf.subarray(p + 1, p + 1 + buf[p])); p += buf[p] + 1; }
    p++;
    const idx = lzw(Buffer.concat(chunks), minCode, w * h);
    if (disposal === 3) prev = canvas.slice();
    const rows = [];
    if (inter) { for (const [s, st] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = s; y < h; y += st) rows.push(y); } else for (let y = 0; y < h; y++) rows.push(y);
    rows.forEach((y, r) => {
      for (let x = 0; x < w; x++) {
        const c = idx[r * w + x];
        if (c === transp || c === undefined) continue;
        const k = ((y0 + y) * W + x0 + x) * 4, col = table[c] || [0, 0, 0];
        canvas[k] = col[0]; canvas[k + 1] = col[1]; canvas[k + 2] = col[2]; canvas[k + 3] = 255;
      }
    });
    frames.push(canvas.slice());
    if (disposal === 2) for (let y = y0; y < y0 + h; y++) canvas.fill(0, (y * W + x0) * 4, (y * W + x0 + w) * 4);
    else if (disposal === 3 && prev) canvas.set(prev);
    transp = -1; disposal = 0;
  }
  return { W, H, frames };
}

function lzw(data, minCode, n) {
  const out = new Uint8Array(n), clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, dict = [], o = 0, prev = null, bit = 0;
  const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; dict[clear] = []; dict[eoi] = null; size = minCode + 1; };
  reset();
  while (o < n) {
    let code = 0;
    for (let i = 0; i < size; i++, bit++) { if ((bit >> 3) >= data.length) return out; code |= ((data[bit >> 3] >> (bit & 7)) & 1) << i; }
    if (code === clear) { reset(); prev = null; continue; }
    if (code === eoi) break;
    let entry;
    if (code < dict.length && dict[code]) entry = dict[code];
    else if (prev) entry = prev.concat(prev[0]);
    else break;
    for (const v of entry) if (o < n) out[o++] = v;
    if (prev) dict.push(prev.concat(entry[0]));
    prev = entry;
    if (dict.length === (1 << size) && size < 12) size++;
  }
  return out;
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function encodePng(W, H, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// pega cuadros (achicados por k) en una grilla de cols columnas
function grid(gif, list, cols, k) {
  const w = Math.floor(gif.W / k), h = Math.floor(gif.H / k), rows = Math.ceil(list.length / cols);
  const out = new Uint8ClampedArray(w * cols * h * rows * 4), OW = w * cols;
  list.forEach((fi, n) => {
    const f = gif.frames[fi], ox = (n % cols) * w, oy = Math.floor(n / cols) * h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = ((y * k) * gif.W + x * k) * 4, d = ((oy + y) * OW + ox + x) * 4;
      out[d] = f[s]; out[d + 1] = f[s + 1]; out[d + 2] = f[s + 2]; out[d + 3] = f[s + 3];
    }
  });
  return encodePng(OW, h * rows, out);
}

if (process.argv[1] && process.argv[1].endsWith('gif-cuadros.mjs')) {
  const [src, modo, dest, lista] = process.argv.slice(2);
  const gif = decodeGif(readFileSync(src));
  if (modo === 'hoja') writeFileSync(dest, grid(gif, gif.frames.map((_, i) => i), 6, 4));
  else writeFileSync(dest, grid(gif, lista.split(',').map(Number), lista.split(',').length, 1));
  console.log(`${gif.frames.length} cuadros de ${gif.W}x${gif.H} → ${dest}`);
}
