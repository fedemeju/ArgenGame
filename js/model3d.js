// Modelos 3D (GLB) dibujados como imágenes para los juegos.
// Lee el GLB a mano (sin librerías), lo pasa a coordenadas del juego y lo dibuja triángulo por triángulo,
// con luz plana, desde la cámara del juego. Como la cámara de Pana Express es oblicua (no tiene perspectiva),
// el auto se ve igual en cualquier lugar de la pantalla: alcanza con dibujarlo una vez por tamaño y sentido.
//
// Soporta colores por vértice (COLOR_0), color de material y texturas (toma el color del centro de cada
// triángulo: queda con el look low-poly). Dibuja todas las mallas del archivo aunque no estén en la escena
// (el GLB del taxi tenía medio costado sin enganchar).

const cache = new Map();

export function loadModel(url, opts = {}) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(buf => parseGLB(buf, opts))
      .catch(err => { console.warn('No se pudo cargar el modelo', url, err); return null; }));
  }
  return cache.get(url);
}

// Devuelve { tris: [{ v: [[x,y,z] x3], c: [r,g,b] }], len, wid, hgt } en coordenadas del juego:
// x = largo (0 en la cola, len en la trompa), y = alto (0 en el piso), z = ancho (centrado en 0). Medidas en metros del modelo.
export async function parseGLB(buf, { up = 'y', front = '+x' } = {}) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('no es un archivo GLB');
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (type === 0x004e4942) bin = buf.slice(off + 8, off + 8 + len);
    off += 8 + len;
  }
  const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const ARR = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const read = i => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView], n = N[a.type], sz = SIZE[a.componentType];
    const stride = bv.byteStride || n * sz, start = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = new Float32Array(a.count * n), src = new DataView(bin);
    const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    const max = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType];
    for (let k = 0; k < a.count; k++) for (let j = 0; j < n; j++) {
      let v = src[get](start + k * stride + j * sz, true);
      if (a.normalized && max) v /= max;
      out[k * n + j] = v;
    }
    void ARR;
    return { d: out, n };
  };
  // texturas: se decodifican una vez y se leen sus píxeles
  const texCache = new Map();
  async function texture(ti) {
    if (texCache.has(ti)) return texCache.get(ti);
    const img = json.images[json.textures[ti].source], bv = json.bufferViews[img.bufferView];
    const blob = new Blob([new Uint8Array(bin, bv.byteOffset || 0, bv.byteLength)], { type: img.mimeType || 'image/png' });
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
    const t = { w: c.width, h: c.height, px: g.getImageData(0, 0, c.width, c.height).data };
    texCache.set(ti, t);
    return t;
  }

  const raw = [];
  for (const mesh of json.meshes || []) for (const prim of mesh.primitives) {
    if (prim.mode != null && prim.mode !== 4) continue;
    const pos = read(prim.attributes.POSITION);
    const col = prim.attributes.COLOR_0 != null ? read(prim.attributes.COLOR_0) : null;
    const uv = prim.attributes.TEXCOORD_0 != null ? read(prim.attributes.TEXCOORD_0) : null;
    const mat = prim.material != null ? json.materials[prim.material] : null;
    const pbr = mat && mat.pbrMetallicRoughness || {};
    // sin material: blanco si trae colores propios (no los oscurece), gris si no trae nada
    const base = pbr.baseColorFactor || (prim.attributes.COLOR_0 != null ? [1, 1, 1, 1] : [0.7, 0.7, 0.7, 1]);
    const tex = pbr.baseColorTexture && uv ? await texture(pbr.baseColorTexture.index) : null;
    const idx = prim.indices != null ? read(prim.indices).d : Float32Array.from({ length: pos.d.length / 3 }, (_, i) => i);
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const ids = [idx[t], idx[t + 1], idx[t + 2]];
      const v = ids.map(i => [pos.d[i * 3], pos.d[i * 3 + 1], pos.d[i * 3 + 2]]);
      let c = [base[0], base[1], base[2]];
      if (col) { c = [0, 1, 2].map(j => ids.reduce((s, i) => s + col.d[i * col.n + j], 0) / 3 * base[j]); }
      if (tex) {
        const u = ids.reduce((s, i) => s + uv.d[i * 2], 0) / 3, w = ids.reduce((s, i) => s + uv.d[i * 2 + 1], 0) / 3;
        const px = Math.min(tex.w - 1, Math.max(0, Math.floor((u - Math.floor(u)) * tex.w)));
        const py = Math.min(tex.h - 1, Math.max(0, Math.floor((w - Math.floor(w)) * tex.h)));
        const o = (py * tex.w + px) * 4;
        c = [tex.px[o] / 255 * base[0], tex.px[o + 1] / 255 * base[1], tex.px[o + 2] / 255 * base[2]];
      }
      raw.push({ v, c: c.map(x => Math.round(Math.min(1, Math.max(0, x)) * 255)) });
    }
  }

  // ejes del archivo → ejes del juego (x largo hacia la trompa, y arriba, z ancho)
  const ax = { x: 0, y: 1, z: 2 };
  const upI = ax[up], fI = ax[front[1]], fS = front[0] === '-' ? -1 : 1;
  const sideI = [0, 1, 2].find(i => i !== upI && i !== fI);
  const map = p => [p[fI] * fS, p[upI], p[sideI]];
  const tris = raw.map(t => ({ v: t.v.map(map), c: t.c }));
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) for (const p of t.v) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); }
  const cz = (mn[2] + mx[2]) / 2;
  for (const t of tris) for (const p of t.v) { p[0] -= mn[0]; p[1] -= mn[1]; p[2] -= cz; }
  return { tris, len: mx[0] - mn[0], hgt: mx[1] - mn[1], wid: mx[2] - mn[2] };
}

// Dibuja el modelo con la cámara oblicua del juego. len: largo deseado en casilleros; dir: 1 trompa a la
// derecha, -1 a la izquierda. Devuelve la imagen y dónde va respecto del punto (cola, piso, centro del carril).
export function renderOblique(model, { len, dir, cw, rowD, hS, skew, dpr = 1 }) {
  const s = len / model.len;
  const proj = (x, y, z) => [(x + z * skew) * cw, -z * rowD - y * hS];
  const dview = [-skew, -rowD / hS, 1];                   // dirección "hacia el fondo" de la cámara
  const L = norm([-0.35, 1, -0.55]);                       // luz de arriba, de adelante y de la izquierda
  const items = model.tris.map(t => {
    const w = t.v.map(([x, y, z]) => (dir > 0 ? [x * s, y * s, z * s] : [len - x * s, y * s, -z * s]));
    const n0 = norm(cross(sub(w[1], w[0]), sub(w[2], w[0])));
    const n = dot(n0, dview) > 0 ? n0.map(v => -v) : n0;   // la cara que mira a la cámara
    const k = 0.58 + 0.42 * Math.max(0, dot(n, L));
    return { p: w.map(q => proj(...q)), z: w.map(q => dot(q, dview)), rgb: t.c.map(v => Math.round(Math.min(255, v * k))) };
  });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) for (const [x, y] of it.p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 -= 2; y0 -= 2; x1 += 2; y1 += 2;

  // Se pinta píxel por píxel guardando la profundidad de cada uno (z-buffer): así una pieza finita pegada a otra
  // (un vidrio, una franja) nunca queda tapada por error. Se dibuja al doble y se achica para suavizar los bordes.
  const SS = dpr >= 2 ? 1 : 2, k = dpr * SS;            // en pantallas densas ya alcanza sin dibujar al doble
  const W = Math.max(1, Math.ceil((x1 - x0) * k)), H = Math.max(1, Math.ceil((y1 - y0) * k));
  const zbuf = new Float32Array(W * H).fill(Infinity), px = new Uint8ClampedArray(W * H * 4);
  for (const it of items) {
    const P3 = it.p.map(([x, y]) => [(x - x0) * k, (y - y0) * k]), Z = it.z;
    const area = (P3[1][0] - P3[0][0]) * (P3[2][1] - P3[0][1]) - (P3[2][0] - P3[0][0]) * (P3[1][1] - P3[0][1]);
    if (Math.abs(area) < 1e-6) continue;
    const minX = Math.max(0, Math.floor(Math.min(P3[0][0], P3[1][0], P3[2][0]))), maxX = Math.min(W - 1, Math.ceil(Math.max(P3[0][0], P3[1][0], P3[2][0])));
    const minY = Math.max(0, Math.floor(Math.min(P3[0][1], P3[1][1], P3[2][1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(P3[0][1], P3[1][1], P3[2][1])));
    const [r, g, b] = it.rgb;
    for (let y = minY; y <= maxY; y++) {
      const sy = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const sx = x + 0.5;
        const w0 = ((P3[1][0] - sx) * (P3[2][1] - sy) - (P3[2][0] - sx) * (P3[1][1] - sy)) / area;
        const w1 = ((P3[2][0] - sx) * (P3[0][1] - sy) - (P3[0][0] - sx) * (P3[2][1] - sy)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const z = w0 * Z[0] + w1 * Z[1] + w2 * Z[2], i = y * W + x;
        if (z >= zbuf[i]) continue;
        zbuf[i] = z; px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = 255;
      }
    }
  }
  const big = document.createElement('canvas'); big.width = W; big.height = H;
  big.getContext('2d').putImageData(new ImageData(px, W, H), 0, 0);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(W / SS)); c.height = Math.max(1, Math.ceil(H / SS));
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(big, 0, 0, c.width, c.height);
  return { img: c, dx: x0, dy: y0, w: x1 - x0, h: y1 - y0, hgt: model.hgt * s };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function norm(a) { const l = Math.hypot(...a) || 1; return a.map(v => v / l); }
