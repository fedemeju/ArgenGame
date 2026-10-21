// Achica un modelo GLB para el celular: pasa los colores de la textura a cada vértice (COLOR_0) y saca la textura.
// Los juegos igual toman un color por triángulo, así que se ve igual y pesa una fracción (la textura del taxi
// pesaba 6,4 MB). También descarta lo que no sea malla (luces, cámaras).
//   node tools/glb-colores.mjs entrada.glb salida.glb
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

// PNG de 8 bits (gris, RGB, RGBA, gris con alfa o paleta) → RGBA
function decodePng(buf) {
  let p = 8, W = 0, H = 0, type = 0, depth = 0, palette = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), t = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (t === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); depth = d[8]; type = d[9]; if (d[12]) throw new Error('PNG entrelazado: no soportado'); }
    else if (t === 'PLTE') palette = d;
    else if (t === 'IDAT') idat.push(d);
    else if (t === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8) throw new Error(`PNG de ${depth} bits: no soportado`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type], stride = W * ch, raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(H * stride), out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[dst + x - ch] : 0, b = y ? px[dst - stride + x] : 0, c = x >= ch && y ? px[dst - stride + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = v & 255;
    }
  }
  for (let i = 0; i < W * H; i++) {
    const s = i * ch, o = i * 4;
    if (type === 6) { out[o] = px[s]; out[o + 1] = px[s + 1]; out[o + 2] = px[s + 2]; out[o + 3] = px[s + 3]; }
    else if (type === 2) { out[o] = px[s]; out[o + 1] = px[s + 1]; out[o + 2] = px[s + 2]; out[o + 3] = 255; }
    else if (type === 3) { const k = px[s] * 3; out[o] = palette[k]; out[o + 1] = palette[k + 1]; out[o + 2] = palette[k + 2]; out[o + 3] = 255; }
    else { const g = px[s]; out[o] = out[o + 1] = out[o + 2] = g; out[o + 3] = type === 4 ? px[s + 1] : 255; }
  }
  return { W, H, px: out };
}

function readGlb(buf) {
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) json = JSON.parse(buf.toString('utf8', off + 8, off + 8 + len));
    else if (type === 0x004e4942) bin = buf.subarray(off + 8, off + 8 + len);
    off += 8 + len;
  }
  return { json, bin };
}

const [src, dest] = process.argv.slice(2);
const { json, bin } = readGlb(readFileSync(src));
const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const GET = { 5120: 'readInt8', 5121: 'readUInt8', 5122: 'readInt16LE', 5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE' };
const read = i => {
  const a = json.accessors[i], bv = json.bufferViews[a.bufferView], n = N[a.type], sz = SIZE[a.componentType];
  const stride = bv.byteStride || n * sz, start = (bv.byteOffset || 0) + (a.byteOffset || 0), out = new Float32Array(a.count * n);
  for (let k = 0; k < a.count; k++) for (let j = 0; j < n; j++) out[k * n + j] = bin[GET[a.componentType]](start + k * stride + j * sz);
  return out;
};
const texCache = new Map();
const texture = ti => {
  if (!texCache.has(ti)) {
    const im = json.images[json.textures[ti].source], bv = json.bufferViews[im.bufferView];
    if (im.mimeType && im.mimeType !== 'image/png') throw new Error(`textura ${im.mimeType}: solo PNG`);
    texCache.set(ti, decodePng(bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)));
  }
  return texCache.get(ti);
};

// junta todas las mallas en una sola, con un color por vértice
const pos = [], col = [], idx = [];
for (const mesh of json.meshes || []) for (const prim of mesh.primitives) {
  if (prim.mode != null && prim.mode !== 4) continue;
  const P = read(prim.attributes.POSITION), base0 = pos.length / 3;
  const uv = prim.attributes.TEXCOORD_0 != null ? read(prim.attributes.TEXCOORD_0) : null;
  const vc = prim.attributes.COLOR_0 != null ? read(prim.attributes.COLOR_0) : null, vcn = vc ? N[json.accessors[prim.attributes.COLOR_0].type] : 0;
  const mat = prim.material != null ? json.materials[prim.material] : null, pbr = (mat && mat.pbrMetallicRoughness) || {};
  const base = pbr.baseColorFactor || [1, 1, 1, 1];
  const tex = pbr.baseColorTexture && uv ? texture(pbr.baseColorTexture.index) : null;
  const max = vc ? { 5121: 255, 5123: 65535 }[json.accessors[prim.attributes.COLOR_0].componentType] || 1 : 1;
  for (let k = 0; k < P.length / 3; k++) {
    pos.push(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]);
    let c = [base[0], base[1], base[2]];
    if (vc) c = c.map((v, j) => v * vc[k * vcn + j] / max);
    if (tex) {
      const u = uv[k * 2] - Math.floor(uv[k * 2]), v = uv[k * 2 + 1] - Math.floor(uv[k * 2 + 1]);
      const o = (Math.min(tex.H - 1, Math.floor(v * tex.H)) * tex.W + Math.min(tex.W - 1, Math.floor(u * tex.W))) * 4;
      c = c.map((x, j) => x * tex.px[o + j] / 255);
    }
    col.push(...c.map(x => Math.round(Math.min(1, Math.max(0, x)) * 255)), 255);
  }
  const I = prim.indices != null ? read(prim.indices) : Float32Array.from({ length: P.length / 3 }, (_, i) => i);
  for (const i of I) idx.push(base0 + i);
}

// GLB nuevo: posiciones (float), colores (bytes normalizados) e índices
const nv = pos.length / 3, posB = Buffer.alloc(nv * 12), colB = Buffer.from(Uint8Array.from(col)), idxB = Buffer.alloc(idx.length * 4);
pos.forEach((v, i) => posB.writeFloatLE(v, i * 4));
idx.forEach((v, i) => idxB.writeUInt32LE(v, i * 4));
const lo = [0, 1, 2].map(j => Math.min(...pos.filter((_, i) => i % 3 === j))), hi = [0, 1, 2].map(j => Math.max(...pos.filter((_, i) => i % 3 === j)));
const binOut = Buffer.concat([posB, colB, idxB]);
const out = {
  asset: { version: '2.0', generator: 'ArgenGame tools/glb-colores.mjs' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, indices: 2, mode: 4 }] }],
  buffers: [{ byteLength: binOut.length }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posB.length },
    { buffer: 0, byteOffset: posB.length, byteLength: colB.length },
    { buffer: 0, byteOffset: posB.length + colB.length, byteLength: idxB.length },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: nv, type: 'VEC3', min: lo, max: hi },
    { bufferView: 1, componentType: 5121, normalized: true, count: nv, type: 'VEC4' },
    { bufferView: 2, componentType: 5125, count: idx.length, type: 'SCALAR' },
  ],
};
let js = Buffer.from(JSON.stringify(out));
js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + binOut.length, 8);
const chunk = (type, d) => { const h = Buffer.alloc(8); h.writeUInt32LE(d.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, d]); };
writeFileSync(dest, Buffer.concat([head, chunk(0x4e4f534a, js), chunk(0x004e4942, binOut)]));
console.log(`${nv} vértices, ${idx.length / 3} triángulos, ${texCache.size} textura(s) pasadas a colores → ${dest} (${(readFileSync(dest).length / 1024).toFixed(0)} KB)`);
