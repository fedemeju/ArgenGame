import { makeCanvas, startLoop, bindInput, mulberry32, hashSeed, audio, buzz, overlay, flash, rrect, circle } from '../js/engine.js';
import { assetUrl, getCustom } from '../js/art.js';

// Imágenes de vehículos del dueño (de costado, vistos desde arriba, mirando a la derecha). Los de la mano
// contraria se espejan. Los que no tienen imagen se dibujan con cajas en código.
// (la primera imagen del taxi se veía demasiado de costado: hace falta una con la cámara más alta)
const AUTO_IMG = {};

// Profundidad que ocupa un vehículo dentro de su carril (antes 0,17 a 0,83: se veían muy anchos)
const HALF_LO = 0.25, HALF_HI = 0.75;

// El ciclista de delivery como modelo 3D chiquito (en casilleros). a: hacia dónde mira
// (0 arriba, π/2 derecha, -π/2 izquierda, π abajo). Se gira de verdad, así se ve bien para cualquier lado.
const rgbHex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export function riderTris(a) {
  const tris = [], ca = Math.cos(a), sa = Math.sin(a);
  // ejes propios: lz hacia adelante, lx a la derecha, y arriba
  const W = ([lx, y, lz]) => [lx * ca + lz * sa, y, -lx * sa + lz * ca];
  const quad = (p, c) => { tris.push({ v: [W(p[0]), W(p[1]), W(p[2])], c }, { v: [W(p[0]), W(p[2]), W(p[3])], c }); };
  const box = (x0, x1, y0, y1, z0, z1, col) => {
    const c = rgbHex(col);
    quad([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], c);
    quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], c);
    quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], c);
    quad([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], c);
    quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], c);
    quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], c);
  };
  const wheel = (lz, r) => {                                   // rueda: octógono parado, de canto según la marcha
    const c = rgbHex('#1b1d20'), hub = rgbHex('#9aa0a8'), n = 8;
    const pt = (i, rr) => [lz + rr * Math.cos(i * Math.PI * 2 / n), r + rr * Math.sin(i * Math.PI * 2 / n)];
    for (const lx of [-0.025, 0.025]) for (let i = 1; i < n - 1; i++) {
      const [a0, b0] = pt(0, r), [a1, b1] = pt(i, r), [a2, b2] = pt(i + 1, r);
      tris.push({ v: [W([lx, b0, a0]), W([lx, b1, a1]), W([lx, b2, a2])], c });
    }
    for (let i = 0; i < n; i++) {
      const [a1, b1] = pt(i, r), [a2, b2] = pt(i + 1, r);
      quad([[-0.025, b1, a1], [0.025, b1, a1], [0.025, b2, a2], [-0.025, b2, a2]], c);
    }
    for (const lx of [-0.03, 0.03]) for (let i = 1; i < n - 1; i++) {
      const [a0, b0] = pt(0, r * 0.35), [a1, b1] = pt(i, r * 0.35), [a2, b2] = pt(i + 1, r * 0.35);
      tris.push({ v: [W([lx, b0, a0]), W([lx, b1, a1]), W([lx, b2, a2])], c: hub });
    }
  };
  wheel(-0.26, 0.13); wheel(0.26, 0.13);
  box(-0.018, 0.018, 0.17, 0.21, -0.26, 0.26, '#3a3f45');      // cuadro
  box(-0.018, 0.018, 0.21, 0.36, -0.09, -0.05, '#3a3f45');     // caño del asiento
  box(-0.04, 0.04, 0.36, 0.39, -0.14, -0.02, '#1b1d20');       // asiento
  box(-0.018, 0.018, 0.21, 0.43, 0.2, 0.24, '#3a3f45');        // caño del manubrio
  box(-0.14, 0.14, 0.43, 0.46, 0.19, 0.23, '#1b1d20');         // manubrio
  for (const s of [-1, 1]) box(s * 0.03, s * 0.09, 0.14, 0.38, -0.04, 0.05, '#2f3b4a');            // piernas
  box(-0.11, 0.11, 0.38, 0.66, -0.12, 0.05, '#34495e');        // campera
  for (const s of [-1, 1]) box(s * 0.09, s * 0.14, 0.5, 0.57, -0.02, 0.22, '#34495e');             // brazos al manubrio
  box(-0.135, 0.135, 0.42, 0.72, -0.32, -0.12, '#d62828');     // mochila de delivery
  box(-0.135, 0.135, 0.72, 0.75, -0.32, -0.12, '#f6b40e');     // tapa amarilla
  box(-0.07, 0.07, 0.66, 0.79, -0.05, 0.08, '#e0b48a');        // cabeza
  box(-0.085, 0.085, 0.77, 0.86, -0.07, 0.1, '#f6b40e');       // casco
  box(-0.015, 0.015, 0.86, 0.87, -0.07, 0.1, '#d62828');       // franja del casco
  return tris;
}
import { loadModel, renderOblique, renderWorld } from '../js/model3d.js';

// Modelos 3D del dueño (assets/modelos/). up y front: cómo viene orientado cada archivo.
// Los que no tienen modelo se dibujan con cajas en código.
// Ejemplo: taxi: { src: 'assets/modelos/taxi.glb', up: 'y', front: '+x' }
const MODELS = {};

// Pana Express: el frogger del delivery. Cruzás la Panamericana en bici, casillero por casillero,
// y del otro lado viene otra, y otra: la ruta no termina. Puntos = metros recorridos, una sola vida.
// Cada fila se arma con su propio azar (semilla del día + número de fila), así todos ven la misma ruta,
// y el tránsito se calcula con el tiempo desde que arrancó la partida: va igual en todos los celulares.
const COLS = 9, VIEW_ROWS = 11, START_COL = 4;
const TRACK = COLS + 10;                 // largo del recorrido de cada carril (5 casilleros fuera de pantalla a cada lado)
const HOP_MS = 90, STUN_MS = 500;
const SAFE_X = 0.2;                      // margen del ciclista dentro de su casillero (ocupa 0,6 de ancho)
const M_PER_ROW = 3;                     // metros por casillero avanzado
const TRAMO = 10;                        // filas por cruce de Panamericana (la última es vereda para respirar)

// Un cruce, de abajo hacia arriba. speed: casilleros por segundo; gap: espacio libre entre vehículos.
const PATTERN = [
  { type: 'road', name: 'COLECTORA', dir: 1, speed: [0.9, 1.15], kinds: ['colectivo', 'camioneta', 'auto'], gap: [2.4, 3.4], stopGo: true, pozos: 2 },
  { type: 'road', name: 'CARRIL LENTO', dir: 1, speed: [0.85, 1.05], kinds: ['camion'], gap: [2.8, 3.6] },
  { type: 'road', name: 'RÁPIDO', dir: 1, speed: [2.5, 3.0], kinds: ['auto', 'taxi'], gap: [3.0, 4.2] },
  { type: 'road', name: 'RÁPIDO', dir: 1, speed: [2.9, 3.4], kinds: ['auto', 'taxi', 'auto'], gap: [3.1, 4.4] },
  { type: 'cantero' },
  { type: 'road', name: 'MANO CONTRARIA', dir: -1, speed: [2.9, 3.4], kinds: ['auto', 'taxi'], gap: [3.1, 4.4] },
  { type: 'road', name: 'MANO CONTRARIA', dir: -1, speed: [2.5, 3.0], kinds: ['auto', 'taxi', 'auto'], gap: [3.0, 4.2] },
  { type: 'road', name: 'LENTO', dir: -1, speed: [0.85, 1.05], kinds: ['camion', 'colectivo'], gap: [2.8, 3.6] },
  { type: 'colectora2', name: 'COLECTORA', parked: 2, pozos: 1 },
  { type: 'vereda' },
];
const LEN = { auto: 1.15, taxi: 1.15, camioneta: 1.5, colectivo: 2.5, camion: 4.1 };
const AUTO_COLORS = ['#c0392b', '#ecf0f1', '#2e86c1', '#7f8c8d', '#27ae60', '#e67e22', '#34495e', '#8e44ad'];
const BONDI_COLORS = [['#d62828', '#f6b40e'], ['#1d4e89', '#f2f2f2'], ['#2a9d8f', '#e9c46a'], ['#f4a261', '#264653']];
const LUGARES = ['GOMERÍA EL TURCO', 'KIOSCO 24 HS', 'PARRILLA DON TITO', 'BARRIO LOS ÁLAMOS', 'LAVADERO', 'VERDULERÍA', 'FERRETERÍA', 'PIZZERÍA'];
const TITLES = {
  auto: '¡Te pisó un auto!', taxi: '¡Te llevó puesto un tachero!', camioneta: '¡Te pasó una camioneta por arriba!',
  colectivo: '¡Te comió el bondi!', camion: '¡Te pasó por arriba un camión!',
};

/* ---------- dibujos de arriba (el frente del vehículo mira hacia su dir) ---------- */
function vehicle(c, v, x, y, w, h) {
  c.save();
  if (v.dir < 0) { c.translate(x + w, y + h); c.rotate(Math.PI); } else c.translate(x, y);
  const m = h * 0.14, bh = h - 2 * m;
  c.fillStyle = 'rgba(0,0,0,.25)'; rrect(c, 2, m + 3, w - 2, bh, bh * 0.25); c.fill();
  if (v.kind === 'camion') {
    const cab = Math.min(w * 0.22, h * 0.95);
    c.fillStyle = '#5c6670'; rrect(c, 0, m, w - cab - 3, bh, 3); c.fill();
    c.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 1; i < 5; i++) c.fillRect((w - cab) * i / 5, m, 1.5, bh);
    c.fillStyle = '#2b2f33'; c.fillRect(w - cab - 4, m + bh * 0.4, 5, bh * 0.2);
    c.fillStyle = v.color; rrect(c, w - cab, m, cab, bh, 4); c.fill();
    c.fillStyle = '#26323e'; c.fillRect(w - cab * 0.32, m + bh * 0.1, cab * 0.18, bh * 0.8);
    c.fillStyle = '#ffe9a3'; c.fillRect(w - 3, m + 2, 3, bh * 0.18); c.fillRect(w - 3, m + bh * 0.82 - 2, 3, bh * 0.18);
  } else if (v.kind === 'colectivo') {
    c.fillStyle = v.color; rrect(c, 0, m, w, bh, 5); c.fill();
    c.fillStyle = v.color2; c.fillRect(4, m + bh * 0.42, w - 8, bh * 0.16);
    c.fillStyle = '#dfe4ea'; rrect(c, w * 0.35, m + bh * 0.22, w * 0.25, bh * 0.56, 3); c.fill();
    c.fillStyle = '#26323e'; c.fillRect(w - 6, m + 3, 4, bh - 6);
    c.fillStyle = '#fff'; c.font = `900 ${bh * 0.38}px Chivo, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.save(); c.translate(w * 0.18, m + bh / 2); if (v.dir < 0) c.rotate(Math.PI); c.fillText(v.linea, 0, 0); c.restore();
  } else {
    const isTaxi = v.kind === 'taxi', van = v.kind === 'camioneta';
    c.fillStyle = isTaxi ? '#16181b' : v.color; rrect(c, 0, m, w, bh, bh * 0.3); c.fill();
    const roofX = w * (van ? 0.42 : 0.28), roofW = w * (van ? 0.5 : 0.42);
    c.fillStyle = isTaxi ? '#f2c230' : 'rgba(255,255,255,.18)'; rrect(c, roofX, m + bh * 0.16, roofW, bh * 0.68, 3); c.fill();
    c.fillStyle = '#26323e';
    c.fillRect(roofX + roofW, m + bh * 0.14, w * 0.12, bh * 0.72);
    c.fillRect(roofX - w * 0.08, m + bh * 0.18, w * 0.06, bh * 0.64);
    if (van) { c.fillStyle = 'rgba(0,0,0,.15)'; c.fillRect(4, m + 3, roofX - w * 0.12, bh - 6); }
    c.fillStyle = '#ffe9a3'; c.fillRect(w - 3, m + 2, 3, bh * 0.2); c.fillRect(w - 3, m + bh * 0.8 - 2, 3, bh * 0.2);
    c.fillStyle = '#c0392b'; c.fillRect(0, m + 2, 2, bh * 0.2); c.fillRect(0, m + bh * 0.8 - 2, 2, bh * 0.2);
  }
  c.restore();
}

// El ciclista de arriba: bici, casco y la mochila de delivery roja con tapa amarilla. ang: hacia dónde mira.
function rider(c, cx, cy, s, ang, wobble) {
  c.save(); c.translate(cx, cy); c.rotate(ang + wobble);
  c.strokeStyle = '#1b1d20'; c.lineCap = 'round';
  c.lineWidth = s * 0.07; c.beginPath(); c.moveTo(0, -s * 0.42); c.lineTo(0, -s * 0.24); c.moveTo(0, s * 0.24); c.lineTo(0, s * 0.44); c.stroke();
  c.lineWidth = s * 0.04; c.beginPath(); c.moveTo(0, -s * 0.3); c.lineTo(0, s * 0.3); c.stroke();
  c.beginPath(); c.moveTo(-s * 0.16, -s * 0.3); c.lineTo(s * 0.16, -s * 0.3); c.stroke();
  c.fillStyle = '#2f3b4a'; c.beginPath(); c.ellipse(0, s * 0.02, s * 0.16, s * 0.12, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#2f3b4a'; c.lineWidth = s * 0.06; c.beginPath(); c.moveTo(-s * 0.12, -s * 0.02); c.lineTo(-s * 0.15, -s * 0.28); c.moveTo(s * 0.12, -s * 0.02); c.lineTo(s * 0.15, -s * 0.28); c.stroke();
  c.fillStyle = '#d62828'; rrect(c, -s * 0.17, s * 0.06, s * 0.34, s * 0.3, s * 0.05); c.fill();
  c.fillStyle = '#f6b40e'; c.fillRect(-s * 0.17, s * 0.06, s * 0.34, s * 0.07);
  c.fillStyle = '#f6b40e'; circle(c, 0, -s * 0.08, s * 0.1);
  c.fillStyle = '#d62828'; c.fillRect(-s * 0.02, -s * 0.18, s * 0.04, s * 0.2);
  c.restore();
}

export default {
  id: 'pana',
  name: 'Pana Express',
  tagline: 'Cruzá la Panamericana con el pedido',
  threshold: 9,
  rules: [
    'Sos el delivery y cruzás la Panamericana con la bici y la mochila, casillero por casillero.',
    'Tocá la pantalla para avanzar. Deslizá a los costados para esquivar o para abajo para retroceder.',
    'Colectora con colectivos que arrancan y frenan, camiones con acoplado, carriles rápidos, el cantero para respirar y la mano contraria.',
    'Los pozos y la baldosa floja te frenan medio segundo. Las camionetas estacionadas y el perro no te dejan pasar.',
    'Del otro lado viene otra Panamericana, con más tránsito y más rápido. Cada casillero que avanzás suma 3 metros.',
    'Tenés una sola vida: si te pisan, se terminó.',
  ],
  icon(c, s) {
    c.fillStyle = '#4b5058'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#d6cdb9'; c.fillRect(0, s * 0.82, s, s * 0.18);
    c.fillStyle = '#6aa84f'; c.fillRect(0, s * 0.36, s, s * 0.12);
    c.fillStyle = '#f2f2f2'; for (let x = 0; x < s; x += s * 0.25) { c.fillRect(x, s * 0.6, s * 0.12, s * 0.02); c.fillRect(x, s * 0.2, s * 0.12, s * 0.02); }
    vehicle(c, { kind: 'taxi', dir: 1 }, s * 0.05, s * 0.5, s * 0.42, s * 0.2);
    vehicle(c, { kind: 'auto', dir: -1, color: '#2e86c1' }, s * 0.5, s * 0.12, s * 0.42, s * 0.2);
    rider(c, s * 0.62, s * 0.72, s * 0.32, 0, 0);
  },

  mount(el, { seed, onScore, onEnd }) {
    const st = makeCanvas(el), ctx = st.ctx;
    const pill = overlay(el, 'g-pill', 'Tocá para avanzar · deslizá para esquivar');
    // el cartel va arriba de todo: abajo taparía la largada y los primeros carriles
    pill.style.bottom = 'auto'; pill.style.top = '10px'; pill.style.fontSize = '13px'; pill.style.opacity = '0.92';
    const toast = overlay(el, 'g-toast');

    // Las filas se arman cuando hacen falta, cada una con su azar fijo.
    const rows = new Map();
    function lane(r) {
      if (rows.has(r)) return rows.get(r);
      const rng = mulberry32(hashSeed(`${seed}:${r}`));
      const shuffled = () => { const a = [...Array(COLS).keys()]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
      let L;
      if (r < 0) L = { type: 'vereda', plain: true };         // más vereda debajo de la largada
      else if (r === 0) L = { type: 'vereda', first: true };
      else {
        const tramo = Math.floor((r - 1) / TRAMO), p = PATTERN[(r - 1) % TRAMO];
        const hard = Math.min(tramo, 6);
        L = { ...p, tramo, items: [], static: [], pozos: [] };
        if (p.type === 'road') {
          // el primer cruce va a 0,85 de la velocidad base y cada cruce suma 0,1 (tope en el séptimo)
          L.v = (p.speed[0] + rng() * (p.speed[1] - p.speed[0])) * (0.85 + 0.1 * hard);
          const gk = Math.max(0.78, 1 - 0.04 * hard);
          L.phase = rng() * TRACK; L.period = 3 + rng() * 2; L.pp = rng() * 6;
          let u = 0;
          const lastGap = p.gap[0] * gk;
          while (true) {
            const kind = p.kinds[Math.floor(rng() * p.kinds.length)], len = LEN[kind];
            if (u + len + lastGap > TRACK) break;
            const bc = BONDI_COLORS[Math.floor(rng() * BONDI_COLORS.length)];
            L.items.push({
              u, len, kind, dir: p.dir, color2: bc[1], linea: ['60', '15', '57', '194', '365', '203'][Math.floor(rng() * 6)],
              color: kind === 'camion' ? ['#d35400', '#2e86c1', '#c0392b', '#16a085'][Math.floor(rng() * 4)] : kind === 'colectivo' ? bc[0] : AUTO_COLORS[Math.floor(rng() * AUTO_COLORS.length)],
            });
            u += len + (p.gap[0] + rng() * (p.gap[1] - p.gap[0])) * gk;
          }
          if (p.pozos) L.pozos = shuffled().filter(c => r !== 1 || c !== START_COL).slice(0, p.pozos);
        } else if (p.type === 'colectora2') {
          const cols = shuffled();
          L.static = cols.slice(0, p.parked).map(c => ({ col: c, color: ['#f2f2f2', '#bdc3c7'][Math.floor(rng() * 2)] }));
          L.pozos = cols.slice(p.parked, p.parked + p.pozos);
        } else if (p.type === 'cantero') {
          L.sorpresa = rng() < 0.5 ? { kind: 'perro', u: rng() * COLS, v: 0.7 + rng() * 0.4 } : { kind: 'baldosa', col: shuffled()[0] };
        } else if (p.type === 'vereda') {
          L.lugar = LUGARES[Math.floor(rng() * LUGARES.length)]; L.km = 20 + (tramo + 1) * 3;
        }
      }
      L.row = r;
      rows.set(r, L);
      return L;
    }

    const S = {
      t: 0, col: START_COL, row: 0, fromCol: START_COL, fromRow: 0, hopT: HOP_MS, ang: 0,
      queue: [], stunT: 0, started: false, alive: true, maxRow: 0, cam: 0,
      crash: null, shake: 0, wobble: 0,
    };
    let endTimer = 0;
    const score = () => S.maxRow * M_PER_ROW;
    const report = () => onScore(score(), 'Metros');

    // Posición del borde izquierdo de cada vehículo en casilleros (puede estar fuera de la pantalla)
    function offset(L, t) {
      if (!L.stopGo) return L.dir * L.v * t;
      // colectora: los colectivos arrancan y frenan (velocidad entre 0,1 y 1 de la base)
      const w = 2 * Math.PI / L.period;
      return L.dir * L.v * (0.55 * t - 0.45 / w * (Math.cos(w * t + L.pp) - Math.cos(L.pp)));
    }
    function itemsAt(L, t) {
      const off = offset(L, t) + L.phase;
      return L.items.map(it => ({ it, x: ((it.u + off) % TRACK + TRACK) % TRACK - 5 }));
    }
    function dogX(L, t) {
      const span = COLS - 1, d = (L.sorpresa.u + L.sorpresa.v * t) % (2 * span);
      return d < span ? d : 2 * span - d;
    }
    // ¿El tramo [x0, x1] de la fila row está ocupado por un vehículo en el instante t?
    function hitAt(row, x0, x1, t) {
      const L = lane(row);
      if (L.type !== 'road') return null;
      for (const { it, x } of itemsAt(L, t)) if (x < x1 && x + it.len > x0) return it;
      return null;
    }
    function blocked(row, col, t) {
      const L = lane(row);
      if (L.type === 'colectora2' && L.static.some(s => s.col === col)) return 'camioneta';
      if (L.type === 'cantero' && L.sorpresa.kind === 'perro' && Math.abs(dogX(L, t) - col) < 0.7) return 'perro';
      return null;
    }

    function move(dc, dr) {
      if (!S.alive) return;
      if (S.hopT < HOP_MS || S.stunT > 0) { if (S.queue.length < 1) S.queue.push([dc, dr]); return; }
      const nc = S.col + dc, nr = S.row + dr;
      if (nc < 0 || nc >= COLS || nr < 0) return;
      if (!S.started) { S.started = true; pill.hidden = true; }
      S.ang = dr < 0 ? Math.PI : dc > 0 ? Math.PI / 2 : dc < 0 ? -Math.PI / 2 : 0;
      const b = blocked(nr, nc, S.t);
      if (b) { S.wobble = 0.35; audio.tone(b === 'perro' ? 520 : 180, 0.08, 'square', 0.06); if (b === 'perro') audio.tone(620, 0.06, 'square', 0.06, 0.1); buzz(15); return; }
      S.fromCol = S.col; S.fromRow = S.row; S.col = nc; S.row = nr; S.hopT = 0;
      audio.tone(dr > 0 ? 660 : 520, 0.04, 'triangle', 0.08);
      const L = lane(nr);
      if (nr > S.maxRow) {
        S.maxRow = nr;
        if (L.type === 'vereda') { flash(toast, `¡Cruzaste! Km ${L.km}`); audio.win(); buzz([20, 40, 20]); }
      }
      if (L.pozos && L.pozos.includes(nc)) { S.stunT = STUN_MS; flash(toast, '¡Pozo!'); audio.tone(140, 0.15, 'sawtooth', 0.08); buzz(30); }
      if (L.type === 'cantero') {
        if (L.sorpresa.kind === 'baldosa' && L.sorpresa.col === nc) { S.stunT = STUN_MS; flash(toast, '¡Baldosa floja!'); audio.tone(300, 0.08, 'square', 0.07); audio.tone(200, 0.1, 'square', 0.07, 0.09); buzz(30); }
        else if (S.fromRow < nr) flash(toast, 'Cantero: respirá');
      }
      report();
    }

    function die(it) {
      S.alive = false; S.crash = it; S.shake = 1;
      // frenada y bocinazo con chiste
      audio.tone(1400, 0.45, 'sawtooth', 0.05, 0, 300);
      [523, 392, 330, 392, 523].forEach((f, i) => audio.tone(f, 0.11, 'square', 0.06, 0.45 + i * 0.13));
      buzz([80, 40, 120]);
      report();
      endTimer = setTimeout(() => onEnd(score(), { title: TITLES[it.kind] || '¡Te pisaron!' }), 1300);
    }

    function update(dt) {
      S.t += Math.min(0.05, dt / 1000);
      if (S.hopT < HOP_MS) S.hopT = Math.min(HOP_MS, S.hopT + dt);
      if (S.stunT > 0) S.stunT = Math.max(0, S.stunT - dt);
      S.wobble *= Math.pow(0.001, dt / 1000);
      if (S.alive && S.hopT >= HOP_MS && S.stunT <= 0 && S.queue.length) move(...S.queue.shift());
      if (S.alive) {
        // choca en la fila donde está (a mitad del salto ya cuenta la de destino)
        const f = S.hopT / HOP_MS, cx = S.fromCol + (S.col - S.fromCol) * f;
        const row = f < 0.5 ? S.fromRow : S.row;
        const it = hitAt(row, cx + SAFE_X, cx + 1 - SAFE_X, S.t);
        if (it) die(it);
      }
      // la cámara sigue al ciclista dejándolo cerca de abajo
      const target = Math.max(0, S.row - 2);
      S.cam += (target - S.cam) * Math.min(1, dt / 140);
      for (const r of rows.keys()) if (r < S.cam - 4) rows.delete(r);
    }

    /* ---------- dibujo en 3D: cámara de arriba, inclinada y un poco de costado ---------- */
    // Mundo: x = columnas (derecha), z = filas (hacia el fondo), y = altura. Cada fila más lejos se corre
    // un poco a la derecha (SKEW): así se ven el techo, el costado que da a la cámara y la cara derecha.
    const SKEW = 0.3;
    let cw = 1, rowD = 1, hS = 1, baseY = 0, ox = 0;
    const P = (x, y, z) => [ox + (x + (z - S.cam - 4) * SKEW) * cw, baseY - (z - S.cam) * rowD - y * hS];
    const shade = (hex, k) => {
      const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(v * k)));
      return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
    };
    function quad(pts, fill) {
      ctx.fillStyle = fill; ctx.beginPath();
      pts.forEach(([x, y, z], i) => { const [sx, sy] = P(x, y, z); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); });
      ctx.closePath(); ctx.fill();
    }
    // Caja: se ven el costado de adelante (z0), la cara derecha (x1) y el techo (y1).
    function box(x0, x1, y0, y1, z0, z1, col, opt = {}) {
      quad([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], opt.side || shade(col, 0.72));
      quad([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], opt.front || shade(col, 0.9));
      quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], opt.top || shade(col, 1.12));
    }
    function wheel(x, z) {
      const [sx, sy] = P(x, 0.11, z), r = 0.11 * hS;
      ctx.fillStyle = '#16181b'; ctx.beginPath(); ctx.ellipse(sx, sy, r, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a9099'; ctx.beginPath(); ctx.ellipse(sx, sy, r * 0.42, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    }
    function shadow(x0, x1, z0, z1) { quad([[x0 + 0.08, 0.005, z0 - 0.03], [x1 + 0.12, 0.005, z0 - 0.03], [x1 + 0.12, 0.005, z1], [x0 + 0.08, 0.005, z1]], 'rgba(0,0,0,.28)'); }
    function faceText(text, x, y, z, size, color) {
      const [sx, sy] = P(x, y, z);
      ctx.fillStyle = color; ctx.font = `900 ${size}px Chivo, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, sx, sy);
    }
    const GLASS = '#2b3a4a';

    // Imágenes de los modelos 3D, una por vehículo, sentido y tamaño de pantalla
    const models = {}, sprites = new Map();
    for (const [kind, m] of Object.entries(MODELS)) {
      loadModel(assetUrl(m.src), m).then(model => { if (model) { models[kind] = model; sprites.clear(); } });
    }
    function modelSprite(kind, dir, len) {
      const model = models[kind];
      if (!model) return null;
      const key = `${kind}|${dir}|${len}|${cw.toFixed(1)}|${rowD.toFixed(1)}|${hS.toFixed(1)}|${st.dpr}`;
      if (!sprites.has(key)) sprites.set(key, renderOblique(model, { len, dir, cw, rowD, hS, skew: SKEW, dpr: st.dpr }));
      return sprites.get(key);
    }

    function vehicle3d(v, x, r) {
      const len = v.len, d = v.dir, z0 = r + HALF_LO, z1 = r + HALF_HI;
      const img = AUTO_IMG[v.kind] && getCustom(AUTO_IMG[v.kind]);
      if (img) {
        // La imagen viene de una cámara un poco más baja que la del juego: se agranda apenas y se estira de alto
        // para que llene el carril como los demás. Las ruedas apoyan en el borde cercano del vehículo.
        const w = len * cw * 1.14, h = w * img.height / img.width * 1.35;
        const [bx, by] = P(x, 0, z0 + 0.02);
        const cx = bx + len * cw / 2;
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.beginPath(); ctx.ellipse(cx + cw * 0.06, by - h * 0.08, w * 0.5, h * 0.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        if (d < 0) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
        ctx.drawImage(img, cx - w / 2, by - h, w, h);
        ctx.restore();
        return;
      }
      const spr = modelSprite(v.kind, d, len);
      if (spr) {
        shadow(x, x + len, z0, z1);
        const [ax, ay] = P(x, 0, r + 0.5);
        ctx.drawImage(spr.img, ax + spr.dx, ay + spr.dy, spr.w, spr.h);
        return;
      }
      const at = f => (d > 0 ? x + len * f : x + len * (1 - f));            // f: 0 cola, 1 trompa
      const span = (a, b) => [Math.min(at(a), at(b)), Math.max(at(a), at(b))];
      shadow(x, x + len, z0, z1);
      if (v.kind === 'camion') {
        const [tx0, tx1] = span(0.02, 0.72), [cx0, cx1] = span(0.75, 1);
        box(tx0, tx1, 0.18, 0.72, z0 + 0.02, z1 - 0.02, '#5c6670', { top: '#6f7a85' });
        for (let i = 1; i < 6; i++) { const xx = tx0 + (tx1 - tx0) * i / 6; quad([[xx, 0.2, z0 + 0.02], [xx + 0.03, 0.2, z0 + 0.02], [xx + 0.03, 0.7, z0 + 0.02], [xx, 0.7, z0 + 0.02]], 'rgba(255,255,255,.12)'); }
        box(cx0, cx1, 0.08, 0.66, z0, z1, v.color);
        box(cx0 + 0.05, cx1 - 0.05, 0.4, 0.62, z0 - 0.002, z0 + 0.3, v.color, { front: GLASS, top: shade(v.color, 1.12), side: GLASS });
        if (d > 0) { quad([[cx1, 0.4, z0 + 0.08], [cx1, 0.4, z1 - 0.08], [cx1, 0.62, z1 - 0.08], [cx1, 0.62, z0 + 0.08]], GLASS); box(cx1 - 0.01, cx1 + 0.01, 0.16, 0.24, z0 + 0.06, z0 + 0.16, '#ffe9a3', { side: '#ffe9a3', front: '#ffe9a3', top: '#ffe9a3' }); }
        for (const f of [0.08, 0.2, 0.62, 0.86]) wheel(at(f), z0);
      } else if (v.kind === 'colectivo') {
        box(x, x + len, 0.08, 0.7, z0, z1, v.color);
        quad([[x + 0.08, 0.42, z0 - 0.002], [x + len - 0.08, 0.42, z0 - 0.002], [x + len - 0.08, 0.62, z0 - 0.002], [x + 0.08, 0.62, z0 - 0.002]], GLASS);
        for (let xx = x + 0.45; xx < x + len - 0.1; xx += 0.45) quad([[xx, 0.42, z0 - 0.004], [xx + 0.04, 0.42, z0 - 0.004], [xx + 0.04, 0.62, z0 - 0.004], [xx, 0.62, z0 - 0.004]], v.color);
        quad([[x, 0.28, z0 - 0.003], [x + len, 0.28, z0 - 0.003], [x + len, 0.34, z0 - 0.003], [x, 0.34, z0 - 0.003]], v.color2);
        const [ax0, ax1] = span(0.35, 0.62);
        box(ax0, ax1, 0.7, 0.78, z0 + 0.15, z1 - 0.15, '#dfe4ea');
        if (d > 0) {
          quad([[x + len, 0.36, z0 + 0.06], [x + len, 0.36, z1 - 0.06], [x + len, 0.62, z1 - 0.06], [x + len, 0.62, z0 + 0.06]], GLASS);
          quad([[x + len, 0.63, z0 + 0.1], [x + len, 0.63, z1 - 0.1], [x + len, 0.69, z1 - 0.1], [x + len, 0.69, z0 + 0.1]], '#111');
        }
        faceText(v.linea, at(0.12), 0.18, z0, hS * 0.16, '#fff');
        for (const f of [0.15, 0.8]) wheel(at(f), z0);
      } else {
        const taxi = v.kind === 'taxi', van = v.kind === 'camioneta';
        const body = taxi ? '#16181b' : v.color, bodyH = van ? 0.38 : 0.32;
        box(x, x + len, 0.08, bodyH, z0, z1, body);
        if (van) {
          const [cx0, cx1] = span(0.5, 0.92), [bx0, bx1] = span(0.04, 0.48);
          box(cx0, cx1, bodyH, 0.64, z0 + 0.06, z1 - 0.06, body, { front: GLASS, side: d > 0 ? GLASS : shade(body, 0.72) });
          quad([[bx0 + 0.04, bodyH + 0.001, z0 + 0.1], [bx1 - 0.04, bodyH + 0.001, z0 + 0.1], [bx1 - 0.04, bodyH + 0.001, z1 - 0.1], [bx0 + 0.04, bodyH + 0.001, z1 - 0.1]], 'rgba(0,0,0,.25)');
        } else {
          const [cx0, cx1] = span(0.22, 0.7);
          box(cx0, cx1, bodyH, 0.56, z0 + 0.08, z1 - 0.08, body, { front: GLASS, side: GLASS, top: taxi ? '#f2c230' : shade(body, 1.18) });
          if (taxi) box((cx0 + cx1) / 2 - 0.1, (cx0 + cx1) / 2 + 0.1, 0.56, 0.63, r + 0.42, r + 0.58, '#f2f2f2', { top: '#f6b40e' });
        }
        // luces en la cara que se ve: trompa (amarillas) si va a la derecha, cola (rojas) si va a la izquierda
        const lc = d > 0 ? '#ffe9a3' : '#e74c3c';
        for (const zz of [z0 + 0.06, z1 - 0.16]) quad([[x + len, 0.18, zz], [x + len, 0.18, zz + 0.1], [x + len, 0.25, zz + 0.1], [x + len, 0.25, zz]], lc);
        for (const f of [0.2, 0.8]) wheel(at(f), z0);
      }
    }

    // El ciclista: una imagen por cada sentido (se arma una vez con el modelo 3D y la profundidad por píxel)
    const riderSprites = new Map();
    function rider3d(x, z, hop, ang, wob) {
      const c = x + 0.5, m = z + 0.5;
      const [sx, sy] = P(c + 0.06, 0.005, m - 0.05);
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(sx, sy, 0.26 * cw, 0.13 * rowD, 0, 0, Math.PI * 2); ctx.fill();
      const key = [ang.toFixed(3), cw.toFixed(1), rowD.toFixed(1), hS.toFixed(1)].join('|');
      if (!riderSprites.has(key)) riderSprites.set(key, renderWorld(riderTris(ang), { cw, rowD, hS, skew: SKEW, dpr: Math.min(2, st.dpr) }));
      const spr = riderSprites.get(key);
      const [px, py] = P(c, hop, m);
      ctx.save(); ctx.translate(px, py); ctx.rotate(wob);
      ctx.drawImage(spr.img, spr.dx, spr.dy, spr.w, spr.h);
      ctx.restore();
    }

    function casquito3d(x, z) {
      const c = x + 0.5, m = z + 0.5;
      ctx.strokeStyle = 'rgba(20,20,20,.55)'; ctx.lineWidth = Math.max(2, 0.04 * cw); ctx.lineCap = 'round';
      for (const dz of [-0.1, 0.1]) { const [a, b] = P(c - 0.7, 0.01, m + dz), [e, f] = P(c + 0.1, 0.01, m + dz); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(e, f); ctx.stroke(); }
      const [hx, hy] = P(c + 0.2, 0.08, m), hr = 0.13 * hS;
      ctx.fillStyle = '#f6b40e'; ctx.beginPath(); ctx.arc(hx, hy, hr, Math.PI * 0.9, Math.PI * 2.1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d62828'; ctx.fillRect(hx - hr * 0.1, hy - hr, hr * 0.2, hr);
      const [wx, wy] = P(c - 0.3, 0.13, m + 0.2); ctx.strokeStyle = '#1b1d20'; ctx.lineWidth = Math.max(1.5, 0.035 * hS); ctx.beginPath(); ctx.ellipse(wx, wy, 0.13 * hS, 0.06 * hS, 0, 0, Math.PI * 2); ctx.stroke();
    }

    function dog3d(x, z, now, dir) {
      const c = x + 0.5, m = z + 0.5, leg = Math.sin(now / 90) * 0.04;
      shadow(c - 0.3, c + 0.3, m - 0.12, m + 0.12);
      for (const [dx, dz] of [[-0.18, -0.08], [0.15, -0.08], [-0.18, 0.08], [0.15, 0.08]]) box(c + dx + (dz < 0 ? leg : -leg), c + dx + 0.05, 0.1, 0.24, m + dz - 0.02, m + dz + 0.02, '#7a4e24');
      box(c - 0.24, c + 0.2, 0.22, 0.38, m - 0.1, m + 0.1, '#8a5a2b');
      const hx = dir > 0 ? c + 0.18 : c - 0.38;
      box(hx, hx + 0.2, 0.3, 0.48, m - 0.08, m + 0.08, '#8a5a2b');
      box(hx + (dir > 0 ? 0.14 : 0), hx + (dir > 0 ? 0.24 : 0.06), 0.32, 0.4, m - 0.05, m + 0.05, '#5c3a1a');
    }

    function draw(dt, now) {
      st.begin();
      const W = st.w, H = st.h;
      cw = W / (COLS + 1.4);
      rowD = Math.min(cw * 1.25, H / 11);
      hS = cw * 0.8;                 // alturas un poco aplastadas: lo alto tapa menos la fila de atrás
      baseY = H - rowD * 1.1;
      ox = cw * 0.3;
      ctx.save();
      if (S.shake > 0) { ctx.translate((Math.random() - 0.5) * S.shake * 10, (Math.random() - 0.5) * S.shake * 6); S.shake = Math.max(0, S.shake - dt / 450); }
      ctx.fillStyle = '#2f3338'; ctx.fillRect(-20, -20, W + 40, H + 40);

      const f = S.hopT / HOP_MS, e = f < 1 ? 1 - (1 - f) * (1 - f) : 1;
      const pz = S.fromRow + (S.row - S.fromRow) * e, px = S.fromCol + (S.col - S.fromCol) * e;
      const hop = Math.sin(f * Math.PI) * 0.25;
      const r0 = Math.floor(S.cam) - 2, r1 = Math.ceil(S.cam + H / rowD) + 2;
      let playerDrawn = false;
      const drawPlayer = () => {
        if (S.alive) rider3d(px, pz, hop, S.ang, S.wobble * Math.sin(now / 30) + (S.stunT > 0 ? Math.sin(now / 40) * 0.15 : 0), now);
        else casquito3d(px, pz);
        playerDrawn = true;
      };
      // de atrás para adelante: lo de más lejos queda tapado por lo de más cerca
      for (let r = r1; r >= r0; r--) {
        drawGround(lane(r), r);
        if (!playerDrawn && r <= Math.round(pz) && r < pz + 0.5) { drawObjects(lane(r), r, now, pz, px, drawPlayer); }
        else drawObjects(lane(r), r, now);
      }
      if (!playerDrawn) drawPlayer();
      ctx.restore();
    }

    function drawGround(L, r) {
      const XL = -6, XR = COLS + 6;
      if (L.type === 'vereda' || L.type === 'cantero') {
        const h = L.type === 'vereda' ? 0.07 : 0.1, col = L.type === 'vereda' ? '#d6cdb9' : '#6aa84f';
        quad([[XL, 0, r], [XR, 0, r], [XR, h, r], [XL, h, r]], L.type === 'vereda' ? '#e9e1c8' : '#9aa1a8');   // cordón
        quad([[XL, h, r], [XR, h, r], [XR, h, r + 1], [XL, h, r + 1]], col);
        if (L.type === 'vereda') for (let x = -4; x < COLS + 4; x += 0.5) quad([[x, h + 0.001, r], [x + 0.015, h + 0.001, r], [x + 0.015, h + 0.001, r + 1], [x, h + 0.001, r + 1]], 'rgba(0,0,0,.08)');
        else for (let x = -4; x < COLS + 4; x += 1) quad([[x, h + 0.001, r], [x + 0.5, h + 0.001, r], [x + 0.5, h + 0.001, r + 1], [x, h + 0.001, r + 1]], 'rgba(0,0,0,.07)');
        return;
      }
      quad([[XL, 0, r], [XR, 0, r], [XR, 0, r + 1], [XL, 0, r + 1]], L.stopGo || L.type === 'colectora2' ? '#555a62' : '#4b5058');
      const next = PATTERN[L.row % TRAMO];
      if (L.type === 'road' && next && next.type === 'road' && next.dir === L.dir) for (let x = -4; x < COLS + 4; x += 1.3) quad([[x, 0.002, r + 0.985], [x + 0.6, 0.002, r + 0.985], [x + 0.6, 0.002, r + 1.015], [x, 0.002, r + 1.015]], 'rgba(255,255,255,.75)');
      const [lx, ly] = P(0.1, 0, r + 0.5);
      ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.font = `900 ${rowD * 0.24}px Chivo, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(L.name || '', lx, ly);
      for (const pc of L.pozos || []) {
        const [sx, sy] = P(pc + 0.5, 0.003, r + 0.5);
        ctx.fillStyle = '#2a2d31'; ctx.beginPath(); ctx.ellipse(sx, sy, cw * 0.34, rowD * 0.26, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(120,160,200,.35)'; ctx.beginPath(); ctx.ellipse(sx - cw * 0.06, sy - rowD * 0.03, cw * 0.18, rowD * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Objetos de la fila de izquierda a derecha; si el ciclista está en esta fila se dibuja en su lugar.
    function drawObjects(L, r, now, pz, px, drawPlayer) {
      const objs = [];
      if (L.type === 'road') for (const { it, x } of itemsAt(L, S.t)) if (x < COLS + 2 && x + it.len > -3) {
        // un colectivo o camión que pasa justo delante del ciclista se ve medio transparente, para no taparlo
        const tall = it.kind === 'colectivo' || it.kind === 'camion';
        const ghost = tall && S.alive && r === S.row - 1 && x < S.col + 1.2 && x + it.len > S.col - 0.2;
        objs.push({ x, fn: () => { if (ghost) ctx.globalAlpha = 0.5; vehicle3d(it, x, r); ctx.globalAlpha = 1; } });
      }
      if (L.type === 'colectora2') for (const sv of L.static) objs.push({ x: sv.col, fn: () => vehicle3d({ kind: 'camioneta', dir: 1, color: sv.color, len: 0.92 }, sv.col + 0.04, r) });
      if (L.type === 'cantero') {
        objs.push({ x: -10, fn: () => { for (const zz of [r + 0.06, r + 0.94]) { box(-6, COLS + 6, 0.24, 0.32, zz - 0.02, zz + 0.02, '#b8bfc7'); for (let x = -4.75; x < COLS + 4; x += 1) box(x, x + 0.06, 0.1, 0.32, zz - 0.03, zz + 0.03, '#7d858e'); } } });
        if (L.sorpresa.kind === 'baldosa') {
          const bc = L.sorpresa.col;
          objs.push({ x: bc, fn: () => {
            box(bc + 0.12, bc + 0.88, 0.1, 0.14, r + 0.22, r + 0.78, '#cfc6b2');
            ctx.strokeStyle = 'rgba(60,50,35,.6)'; ctx.lineWidth = 1.5; ctx.beginPath();
            const a = P(bc + 0.2, 0.141, r + 0.7), b = P(bc + 0.5, 0.141, r + 0.45), c = P(bc + 0.8, 0.141, r + 0.6), d = P(bc + 0.45, 0.141, r + 0.25);
            ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.moveTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
          } });
        } else {
          const goingBack = Math.floor((L.sorpresa.u + L.sorpresa.v * S.t) / (COLS - 1)) % 2;
          const dx = dogX(L, S.t);
          objs.push({ x: dx, fn: () => dog3d(dx, r, now, goingBack ? -1 : 1) });
        }
      }
      if (L.type === 'vereda' && !L.plain) {
        if (L.first) {
          objs.push({ x: 0, fn: () => {
            for (const xx of [0.3, 1.9]) box(xx, xx + 0.06, 0.07, 1.05, r + 0.82, r + 0.88, '#6b7380');
            box(0.2, 2.1, 1.05, 1.12, r + 0.55, r + 0.95, '#26323e', { top: '#3a4a5c' });
            box(0.3, 1.95, 0.4, 0.95, r + 0.86, r + 0.9, '#9fc1de', { front: 'rgba(160,200,230,.45)' });
            faceText('PARADA', 1.12, 1.0, r + 0.55, rowD * 0.14, '#f6b40e');
          } });
        } else {
          objs.push({ x: 2, fn: () => {
            for (const xx of [2.3, 6.6]) box(xx, xx + 0.08, 0.07, 0.75, r + 0.84, r + 0.9, '#3a3f45');
            box(2, 7, 0.7, 1.25, r + 0.82, r + 0.92, '#26323e', { top: '#3a4a5c' });
            faceText(L.lugar, 4.5, 0.97, r + 0.82, rowD * 0.22, '#f6b40e');
          } });
          objs.push({ x: 7.6, fn: () => {
            box(7.65, 8.25, 0.07, 0.62, r + 0.5, r + 0.7, '#f2f2f2');
            box(7.65, 8.25, 0.5, 0.62, r + 0.497, r + 0.7, '#1f7a4a');
            faceText(String(L.km), 7.95, 0.3, r + 0.5, rowD * 0.2, '#26323e');
          } });
        }
      }
      objs.sort((a, b) => a.x - b.x);
      if (drawPlayer) {
        // el ciclista se mete entre los objetos según su columna
        let done = false;
        for (const o of objs) { if (!done && o.x > px + 0.5) { drawPlayer(); done = true; } o.fn(); }
        if (!done) drawPlayer();
      } else objs.forEach(o => o.fn());
      void pz;
    }

    report();
    const unbind = bindInput(el, {
      onTap: () => move(0, 1),
      onSwipe: d => move(d.x, -d.y),
    });
    const stop = startLoop((dt, now) => { update(dt); draw(dt, now); });

    return {
      destroy() { stop(); unbind(); clearTimeout(endTimer); st.destroy(); pill.remove(); toast.remove(); },
      _state: S, _update: update, _move: () => move(0, 1), _step: move,
      _hitAt: hitAt, _blocked: blocked, _lane: lane, _consts: { COLS, HOP_MS, SAFE_X, STUN_MS },
    };
  },
};
