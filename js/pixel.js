// Pixel art hecho en código: lienzos chicos pintados con rectángulos de píxeles enteros (sin suavizado),
// contorno oscuro automático y una letra de 3x5 para carteles. Después se agrandan sin suavizar.

export function pixelArt(w, h, paint, outline = '#1c130d') {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  paint(painter(g, w), w, h);
  if (outline) addOutline(g, w, h, outline);
  return c;
}

// Copia espejada (para que una vaca mire para el otro lado, por ejemplo).
export function mirrored(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.translate(src.width, 0); g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

// Herramientas de dibujo sobre cualquier contexto; W es el ancho, para los dibujos espejados (m...).
export function painter(g, W = 0) {
  const P = {
    rect(x, y, w, h, col) {
      const x0 = Math.round(x), y0 = Math.round(y), x1 = Math.round(x + w), y1 = Math.round(y + h);
      if (x1 <= x0 || y1 <= y0) return;
      g.fillStyle = col; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    },
    // el rectángulo y su reflejo respecto del centro (autos de frente o de atrás)
    mrect(x, y, w, h, col) { P.rect(x, y, w, h, col); P.rect(W - x - w, y, w, h, col); },
    px(x, y, col) { P.rect(x, y, 1, 1, col); },
    mpx(x, y, col) { P.mrect(x, y, 1, 1, col); },
    oval(x, y, w, h, col) {
      for (let j = 0; j < h; j++) {
        const v = (j + 0.5) / h * 2 - 1, hw = w / 2 * Math.sqrt(1 - v * v);
        P.rect(Math.round(x + w / 2 - hw), y + j, Math.round(x + w / 2 + hw) - Math.round(x + w / 2 - hw), 1, col);
      }
    },
    moval(x, y, w, h, col) { P.oval(x, y, w, h, col); P.oval(W - x - w, y, w, h, col); },
    // trapecio centrado en cx, de ancho wTop arriba a wBot abajo
    trap(cx, y, h, wTop, wBot, col) {
      for (let j = 0; j < h; j++) {
        const w = wTop + (wBot - wTop) * (h > 1 ? j / (h - 1) : 0);
        P.rect(Math.round(cx - w / 2), y + j, Math.round(cx + w / 2) - Math.round(cx - w / 2), 1, col);
      }
    },
    line(x0, y0, x1, y1, col) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let e = dx + dy;
      g.fillStyle = col;
      for (let i = 0; i < 2000; i++) {
        g.fillRect(x0, y0, 1, 1);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * e;
        if (e2 >= dy) { e += dy; x0 += sx; }
        if (e2 <= dx) { e += dx; y0 += sy; }
      }
    },
    text(str, x, y, col, s = 1) {
      x = Math.round(x); y = Math.round(y);
      for (const ch of clean(str)) {
        const gl = FONT[ch];
        if (gl) gl.forEach((row, j) => { for (let i = 0; i < 3; i++) if (row[i] === '#') P.rect(x + i * s, y + j * s, s, s, col); });
        x += 4 * s;
      }
    },
  };
  return P;
}

export const textWidth = (str, s = 1) => (clean(str).length * 4 - 1) * s;
const clean = str => String(str).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Pinta un borde de 1 píxel alrededor de todo lo dibujado.
function addOutline(g, w, h, col) {
  let img;
  try { img = g.getImageData && g.getImageData(0, 0, w, h); } catch (e) { return; }
  if (!img || !img.data) return;
  const d = img.data, n = parseInt(col.slice(1), 16), on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  const edge = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) edge.push((y * w + x) * 4);
  }
  for (const i of edge) { d[i] = n >> 16; d[i + 1] = (n >> 8) & 255; d[i + 2] = n & 255; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
}

const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'], '.': ['...', '...', '...', '...', '.#.'], '-': ['...', '...', '###', '...', '...'],
};
