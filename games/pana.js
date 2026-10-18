import { makeCanvas, startLoop, bindInput, mulberry32, hashSeed, audio, buzz, overlay, flash, rrect, circle } from '../js/engine.js';

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

function casquito(c, cx, cy, s) {
  c.strokeStyle = 'rgba(20,20,20,.55)'; c.lineWidth = s * 0.05; c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx - s * 0.6, cy - s * 0.12); c.lineTo(cx + s * 0.3, cy - s * 0.1); c.moveTo(cx - s * 0.6, cy + s * 0.12); c.lineTo(cx + s * 0.3, cy + s * 0.1); c.stroke();
  c.fillStyle = '#f6b40e'; c.beginPath(); c.ellipse(cx + s * 0.1, cy, s * 0.17, s * 0.13, 0.4, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d62828'; c.fillRect(cx + s * 0.08, cy - s * 0.13, s * 0.04, s * 0.26);
  c.strokeStyle = '#1b1d20'; c.lineWidth = s * 0.04; c.beginPath(); c.arc(cx - s * 0.25, cy + s * 0.25, s * 0.14, 0, Math.PI * 2); c.stroke();
}

function perro(c, cx, cy, s, t, dir) {
  c.save(); c.translate(cx, cy); if (dir < 0) c.scale(-1, 1);
  const leg = Math.sin(t / 90) * s * 0.06;
  c.fillStyle = '#8a5a2b';
  c.fillRect(-s * 0.22 + leg, -s * 0.16, s * 0.05, s * 0.08); c.fillRect(s * 0.12 - leg, -s * 0.16, s * 0.05, s * 0.08);
  c.fillRect(-s * 0.22 - leg, s * 0.08, s * 0.05, s * 0.08); c.fillRect(s * 0.12 + leg, s * 0.08, s * 0.05, s * 0.08);
  c.beginPath(); c.ellipse(0, 0, s * 0.26, s * 0.12, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(s * 0.28, 0, s * 0.1, s * 0.09, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#5c3a1a'; c.beginPath(); c.ellipse(s * 0.27, -s * 0.08, s * 0.04, s * 0.03, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(s * 0.27, s * 0.08, s * 0.04, s * 0.03, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#8a5a2b'; c.lineWidth = s * 0.04; c.beginPath(); c.moveTo(-s * 0.25, 0); c.lineTo(-s * 0.36, Math.sin(t / 70) * s * 0.08); c.stroke();
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
    const toast = overlay(el, 'g-toast');

    // Las filas se arman cuando hacen falta, cada una con su azar fijo.
    const rows = new Map();
    function lane(r) {
      if (rows.has(r)) return rows.get(r);
      const rng = mulberry32(hashSeed(`${seed}:${r}`));
      const shuffled = () => { const a = [...Array(COLS).keys()]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
      let L;
      if (r <= 0) L = { type: 'vereda', first: true };
      else {
        const tramo = Math.floor((r - 1) / TRAMO), p = PATTERN[(r - 1) % TRAMO];
        const hard = Math.min(tramo, 6);
        L = { ...p, tramo, items: [], static: [], pozos: [] };
        if (p.type === 'road') {
          L.v = (p.speed[0] + rng() * (p.speed[1] - p.speed[0])) * (1 + 0.12 * hard);
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

    /* ---------- dibujo ---------- */
    function draw(dt, now) {
      st.begin();
      const W = st.w, H = st.h;
      const cw = W / COLS, ch = Math.min(H / VIEW_ROWS, cw * 1.5);
      const bottom = H - (H - ch * VIEW_ROWS) / 2;
      const Y = r => bottom - (r - S.cam + 1) * ch;              // borde de arriba de la fila r
      ctx.save();
      if (S.shake > 0) { ctx.translate((Math.random() - 0.5) * S.shake * 10, (Math.random() - 0.5) * S.shake * 6); S.shake = Math.max(0, S.shake - dt / 450); }
      ctx.fillStyle = '#2f3338'; ctx.fillRect(-20, -20, W + 40, H + 40);

      const r0 = Math.floor(S.cam) - 1, r1 = Math.ceil(S.cam + H / ch) + 1;
      for (let r = Math.max(0, r0); r <= r1; r++) drawRow(lane(r), Y(r), cw, ch, now);

      const f = S.hopT / HOP_MS, e = f < 1 ? 1 - (1 - f) * (1 - f) : 1;
      const cx = (S.fromCol + (S.col - S.fromCol) * e + 0.5) * cw;
      const cy = Y(S.fromRow + (S.row - S.fromRow) * e) + ch / 2 - Math.sin(f * Math.PI) * ch * 0.08;
      const s = Math.min(cw, ch) * 0.95;
      if (S.alive) rider(ctx, cx, cy, s, S.ang, S.wobble * Math.sin(now / 30) + (S.stunT > 0 ? Math.sin(now / 40) * 0.2 : 0));
      else casquito(ctx, cx, cy, s);
      ctx.restore();
    }

    function drawRow(L, y, cw, ch, now) {
      const W = st.w;
      if (L.type === 'vereda') {
        ctx.fillStyle = '#d6cdb9'; ctx.fillRect(0, y, W, ch);
        ctx.fillStyle = 'rgba(120,105,80,.18)';
        for (let x = 0; x < W; x += cw / 2) for (let yy = y + cw / 8; yy < y + ch; yy += cw / 4) ctx.fillRect(x + cw / 8, yy, 1.5, 1.5);
        ctx.fillStyle = 'rgba(0,0,0,.1)'; for (let x = 0; x < W; x += cw / 2) ctx.fillRect(x, y, 1, ch);
        ctx.fillStyle = '#e9e1c8'; ctx.fillRect(0, y, W, 3); ctx.fillRect(0, y + ch - 3, W, 3);
        if (L.first) {
          ctx.fillStyle = '#6b7380'; ctx.font = `800 ${ch * 0.2}px Chivo, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText('PARADA', cw * 0.15, y + ch * 0.5);
        } else {
          // cartel del lugar y mojón del kilómetro
          ctx.fillStyle = '#26323e'; rrect(ctx, cw * 2, y + ch * 0.18, cw * 5, ch * 0.42, 4); ctx.fill();
          ctx.fillStyle = '#f6b40e'; ctx.font = `900 ${ch * 0.2}px Chivo, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(L.lugar, cw * 4.5, y + ch * 0.39);
          ctx.fillStyle = '#f2f2f2'; rrect(ctx, cw * 7.6, y + ch * 0.2, cw * 0.8, ch * 0.55, 3); ctx.fill();
          ctx.fillStyle = '#1f7a4a'; ctx.fillRect(cw * 7.6, y + ch * 0.2, cw * 0.8, ch * 0.16);
          ctx.fillStyle = '#26323e'; ctx.font = `900 ${ch * 0.17}px Chivo, system-ui, sans-serif`; ctx.fillText(String(L.km), cw * 8, y + ch * 0.55);
        }
        return;
      }
      if (L.type === 'cantero') {
        ctx.fillStyle = '#6aa84f'; ctx.fillRect(0, y, W, ch);
        ctx.fillStyle = 'rgba(0,0,0,.08)'; for (let x = 0; x < W; x += cw) ctx.fillRect(x, y, cw / 2, ch);
        for (const gy of [y + 3, y + ch - 7]) {
          ctx.fillStyle = '#b8bfc7'; ctx.fillRect(0, gy, W, 4);
          ctx.fillStyle = '#7d858e'; for (let x = cw * 0.25; x < W; x += cw) ctx.fillRect(x, gy - 1, 3, 6);
        }
        if (L.sorpresa.kind === 'baldosa') {
          const bx = L.sorpresa.col * cw;
          ctx.fillStyle = '#cfc6b2'; rrect(ctx, bx + cw * 0.12, y + ch * 0.22, cw * 0.76, ch * 0.56, 3); ctx.fill();
          ctx.strokeStyle = 'rgba(60,50,35,.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx + cw * 0.2, y + ch * 0.3); ctx.lineTo(bx + cw * 0.5, y + ch * 0.55); ctx.lineTo(bx + cw * 0.78, y + ch * 0.4); ctx.moveTo(bx + cw * 0.5, y + ch * 0.55); ctx.lineTo(bx + cw * 0.45, y + ch * 0.75); ctx.stroke();
        } else {
          const goingBack = Math.floor((L.sorpresa.u + L.sorpresa.v * S.t) / (COLS - 1)) % 2;
          perro(ctx, (dogX(L, S.t) + 0.5) * cw, y + ch / 2, Math.min(cw, ch), now, goingBack ? -1 : 1);
        }
        return;
      }
      // asfalto
      ctx.fillStyle = L.stopGo || L.type === 'colectora2' ? '#555a62' : '#4b5058'; ctx.fillRect(0, y, W, ch);
      const next = PATTERN[L.row % TRAMO];
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      if (L.type === 'road' && next && next.type === 'road' && next.dir === L.dir) for (let x = -cw * 0.2; x < W; x += cw * 1.3) ctx.fillRect(x, y - 1, cw * 0.6, 2);
      if (L.stopGo) { ctx.fillStyle = '#e9e1c8'; ctx.fillRect(0, y - 2, W, 4); }
      if (L.type === 'colectora2') { ctx.fillStyle = '#e9e1c8'; ctx.fillRect(0, y + ch - 2, W, 4); }
      ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.font = `900 ${ch * 0.26}px Chivo, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(L.name || '', cw * 0.12, y + ch / 2);
      for (const pc of L.pozos) {
        const px = pc * cw + cw / 2, py = y + ch / 2;
        ctx.fillStyle = '#2a2d31'; ctx.beginPath(); ctx.ellipse(px, py, cw * 0.32, ch * 0.24, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(120,160,200,.35)'; ctx.beginPath(); ctx.ellipse(px - cw * 0.06, py - ch * 0.03, cw * 0.17, ch * 0.1, 0.3, 0, Math.PI * 2); ctx.fill();
      }
      for (const sv of L.static) vehicle(ctx, { kind: 'camioneta', dir: 1, color: sv.color }, sv.col * cw + cw * 0.04, y, cw * 0.92, ch);
      if (L.type === 'road') for (const { it, x } of itemsAt(L, S.t)) if (x < COLS && x + it.len > 0) vehicle(ctx, it, x * cw, y, it.len * cw, ch);
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
