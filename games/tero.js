import { makeCanvas, startLoop, bindInput, mulberry32, audio, buzz, overlay, flash, circle } from '../js/engine.js';
import { getCustom } from '../js/art.js';

// El Vuelo del Tero: el tero cruza Buenos Aires aleteando entre el Obelisco, que sale de la vereda,
// y otro Obelisco del revés que cuelga del cielo (los "caños" del Flappy Bird).
// Todo se mide en "u": el alto de la pantalla es 1 u, así la física es la misma en cualquier celular.
// La física corre a paso fijo (120 por segundo) para que todos jueguen igual.
const GROUND = 0.86;                    // donde empieza la vereda
const G = 2.4, FLAP = 0.62, VMAX = 1.15; // gravedad, impulso del aleteo, caída máxima (u/s)
const R = 0.03;                          // radio del tero para los choques
const TERO_X = 0.17;                     // distancia del borde izquierdo al tero
const PW = 0.15, SPACING = 0.6;          // ancho de la base del Obelisco y distancia entre uno y otro
const TIP = 0.07, BASE_H = 0.03;         // alto de la punta (piramidión) y del pedestal
const SHAFT_TOP = 0.6, SHAFT_BOT = 0.8;  // ancho del fuste arriba y abajo, en proporción a PW
const STEP = 1 / 120;
const TERO_ASPECT = 200 / 245;           // forma de cada cuadro de assets/carpincho/tero.webp (9 cuadros, mira a la izquierda)
const frameCount = img => Math.max(1, Math.round(img.width / (img.height * TERO_ASPECT)));

const speedOf = n => 0.34 + Math.min(0.1, n * 0.0025);
const gapOf = n => Math.max(0.215, 0.29 - n * 0.0018);

const TITLES = {
  abajo: '¡Te la pegaste contra el Obelisco!',
  arriba: '¡Chocaste el Obelisco del revés!',
  piso: '¡Aterrizaste en la 9 de Julio!',
};

// paisaje del fondo: depende de la posición, no del azar de la partida (así no cambia el recorrido)
const hash = (a, b) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Contorno del Obelisco con la punta en tipY. dir = -1: sale de la vereda (punta arriba);
// dir = 1: cuelga del cielo (punta abajo). baseY es donde apoya el pedestal.
function obeliskShape(x, tipY, baseY, dir) {
  const xc = x + PW / 2, wt = PW * SHAFT_TOP / 2, wb = PW * SHAFT_BOT / 2, hb = PW / 2;
  const sTop = tipY - dir * TIP, pTop = baseY + dir * BASE_H; // dir -1: y crece hacia abajo
  return [
    [xc, tipY], [xc + wt, sTop], [xc + wb, pTop], [xc + hb, pTop], [xc + hb, baseY],
    [xc - hb, baseY], [xc - hb, pTop], [xc - wb, pTop], [xc - wt, sTop],
  ];
}

// ¿El círculo (cx, cy, r) toca el polígono?
function circleHitsPoly(cx, cy, r, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > cy) !== (yj > cy) && cx < (xj - xi) * (cy - yi) / (yj - yi) + xi) inside = !inside;
    const dx = xj - xi, dy = yj - yi, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((cx - xi) * dx + (cy - yi) * dy) / len)) : 0;
    if ((cx - xi - t * dx) ** 2 + (cy - yi - t * dy) ** 2 < r * r) return true;
  }
  return inside;
}

function solDeMayo(c, x, y, r, t) {
  c.save(); c.translate(x, y); c.rotate(t * 0.0002);
  c.fillStyle = '#f6b40e';
  for (let i = 0; i < 16; i++) {
    c.save(); c.rotate(i * Math.PI / 8);
    c.beginPath();
    if (i % 2) { c.moveTo(r * 0.9, -r * 0.08); c.lineTo(r * 1.75, 0); c.lineTo(r * 0.9, r * 0.08); }
    else { c.moveTo(r * 0.9, -r * 0.1); c.quadraticCurveTo(r * 1.3, -r * 0.3, r * 1.6, 0); c.quadraticCurveTo(r * 1.3, r * 0.3, r * 0.9, r * 0.1); }
    c.fill(); c.restore();
  }
  c.restore();
  c.fillStyle = '#f6b40e'; circle(c, x, y, r);
  c.fillStyle = '#c98a00';
  circle(c, x - r * 0.33, y - r * 0.15, r * 0.1); circle(c, x + r * 0.33, y - r * 0.15, r * 0.1);
  c.strokeStyle = '#c98a00'; c.lineWidth = r * 0.08; c.lineCap = 'round';
  c.beginPath(); c.arc(x, y + r * 0.1, r * 0.35, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
}

function medialuna(c, x, y, s) {
  c.save(); c.translate(x, y); c.rotate(-0.4);
  c.fillStyle = '#d98a2b'; c.strokeStyle = '#8a4e12'; c.lineWidth = s * 0.08;
  c.beginPath(); c.arc(0, 0, s, Math.PI * 0.15, Math.PI * 1.85); c.arc(s * 0.35, 0, s * 0.62, Math.PI * 1.7, Math.PI * 0.3, true); c.closePath();
  c.fill(); c.stroke();
  c.strokeStyle = '#b86a1e'; c.lineWidth = s * 0.06;
  for (const a of [0.55, 1, 1.45]) { c.beginPath(); c.moveTo(Math.cos(a * Math.PI) * s * 0.55, Math.sin(a * Math.PI) * s * 0.55); c.lineTo(Math.cos(a * Math.PI) * s * 0.98, Math.sin(a * Math.PI) * s * 0.98); c.stroke(); }
  c.fillStyle = 'rgba(255,240,200,.45)'; c.beginPath(); c.ellipse(-s * 0.4, -s * 0.4, s * 0.25, s * 0.1, -0.6, 0, Math.PI * 2); c.fill();
  c.restore();
}

function teroCode(c, x, y, s, t) {
  // tero dibujado en código, mirando a la derecha (por si la imagen no cargó)
  c.save(); c.translate(x, y); c.scale(s, s);
  const f = Math.sin(t * 0.03);
  c.fillStyle = '#6f6b63'; c.beginPath(); c.moveTo(0, -0.02); c.lineTo(-0.25, -0.02 - f * 0.3); c.lineTo(-0.05, -0.05); c.fill();
  c.fillStyle = '#8d887d'; c.beginPath(); c.ellipse(0, 0, 0.22, 0.08, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f2f0ea'; c.beginPath(); c.ellipse(-0.02, 0.03, 0.16, 0.045, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1d1d1d'; c.beginPath(); c.ellipse(0.11, 0.01, 0.06, 0.065, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#9a958b'; c.beginPath(); c.ellipse(0.19, -0.05, 0.07, 0.06, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#e33'; c.beginPath(); c.arc(0.22, -0.06, 0.016, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d78b8b'; c.beginPath(); c.moveTo(0.25, -0.05); c.lineTo(0.33, -0.04); c.lineTo(0.25, -0.03); c.fill();
  c.fillStyle = '#8d887d'; c.beginPath(); c.moveTo(0.02, -0.04); c.lineTo(-0.18, -0.04 - f * 0.35); c.lineTo(-0.03, -0.06); c.fill();
  c.restore();
}

// Dibuja un Obelisco con el contorno exacto de los choques. k: píxeles por u.
function drawObelisk(c, pts, k, offX, dir, festejo) {
  const P = pts.map(([x, y]) => [(x - offX) * k, y * k]);
  const path = list => { c.beginPath(); list.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
  const xl = P[5][0], xr = P[4][0];
  // fuste de piedra con luz desde la izquierda
  const g = c.createLinearGradient(xl, 0, xr, 0);
  g.addColorStop(0, '#f1ece0'); g.addColorStop(0.55, '#ddd5c4'); g.addColorStop(1, '#b8af9c');
  path(P); c.fillStyle = g; c.fill();
  // cara en sombra (mitad derecha), así se ve que tiene volumen
  c.fillStyle = 'rgba(90,80,60,.16)';
  c.beginPath(); c.moveTo(P[0][0], P[0][1]); c.lineTo(P[1][0], P[1][1]); c.lineTo(P[2][0], P[2][1]); c.lineTo((P[2][0] + P[7][0]) / 2 + (P[2][0] - P[7][0]) * 0.08, P[2][1]); c.closePath(); c.fill();
  // piramidión un poco más oscuro
  c.fillStyle = 'rgba(120,110,90,.22)';
  c.beginPath(); c.moveTo(P[0][0], P[0][1]); c.lineTo(P[1][0], P[1][1]); c.lineTo(P[8][0], P[8][1]); c.closePath(); c.fill();
  // ventanita cerca de la punta
  const wx = P[0][0], wy = P[0][1] - dir * (TIP + 0.03) * k;
  c.fillStyle = '#4a4436'; c.fillRect(wx - 0.006 * k, wy - 0.008 * k, 0.012 * k, 0.016 * k);
  // juntas de los bloques de piedra
  c.strokeStyle = 'rgba(110,100,80,.18)'; c.lineWidth = 1;
  const y0 = P[1][1], y1 = P[2][1];
  for (let yy = y0 - dir * 0.08 * k; dir < 0 ? yy < y1 : yy > y1; yy -= dir * 0.08 * k) {
    const t = (yy - y0) / (y1 - y0), half = (P[1][0] - P[0][0]) + t * ((P[2][0] - P[0][0]) - (P[1][0] - P[0][0]));
    c.beginPath(); c.moveTo(P[0][0] - half, yy); c.lineTo(P[0][0] + half, yy); c.stroke();
  }
  // festejo: iluminado de celeste y blanco
  if (festejo) {
    c.save(); path(P); c.clip();
    const bw = (xr - xl) / 3;
    c.fillStyle = 'rgba(116,172,223,.55)'; c.fillRect(xl, -1e4, bw, 2e4); c.fillRect(xl + 2 * bw, -1e4, bw, 2e4);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(xl + bw, -1e4, bw, 2e4);
    c.restore();
  }
  // pedestal
  c.fillStyle = '#8f8a80'; c.fillRect(P[6][0], Math.min(P[6][1], P[5][1]), P[3][0] - P[6][0], Math.abs(P[5][1] - P[6][1]));
  path(P); c.strokeStyle = 'rgba(80,70,55,.45)'; c.lineWidth = 1.5; c.stroke();
}

export default {
  id: 'tero',
  name: 'El Vuelo del Tero',
  tagline: 'Esquivá el Obelisco, de arriba y de abajo',
  threshold: 3,
  rules: [
    'El tero cruza Buenos Aires volando. Cada toque en la pantalla es un aletazo para arriba; si no tocás, baja.',
    'Pasá por el hueco entre el Obelisco que sale de la vereda y el Obelisco del revés que cuelga de arriba.',
    'Cada Obelisco que pasás suma 1 punto, y cada medialuna que agarrás suma 1 más.',
    'Cuanto más avanzás, más rápido va y más chico es el hueco.',
    'Si chocás un Obelisco o tocás el piso, se termina.',
  ],
  icon(c, s) {
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#4f9fe0'); g.addColorStop(1, '#cfe8f7');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    const k = s / 0.6, x = 0.36;
    drawObelisk(c, obeliskShape(x, 0.4, 0.62, -1), k, 0, -1, false);
    drawObelisk(c, obeliskShape(x, 0.16, -0.02, 1), k, 0, 1, true);
    const img = getCustom('teroVuela');
    if (img) {
      const fw = img.width / frameCount(img), w = s * 0.55, h = w * img.height / fw;
      c.save(); c.translate(s * 0.34, s * 0.48); c.scale(-1, 1); c.drawImage(img, 0, 0, fw, img.height, -w / 2, -h * 0.62, w, h); c.restore();
    } else teroCode(c, s * 0.34, s * 0.48, s * 0.8, 0);
  },

  mount(el, { seed, onScore, onEnd }) {
    const st = makeCanvas(el), ctx = st.ctx, rng = mulberry32(seed);
    const pill = overlay(el, 'g-pill', 'Tocá para aletear');
    const toast = overlay(el, 'g-toast');
    const teroImg = getCustom('teroVuela');

    const S = {
      x: 0, y: 0.42, vy: 0, rot: 0, started: false, alive: true, score: 0,
      pipes: [], nextX: 1.05, prevGap: 0.42, spawned: 0, passedN: 0,
      acc: 0, flapT: 0, crash: null, shake: 0, floats: [], feathers: [],
    };
    let endTimer = 0;
    const report = () => onScore(S.score, 'Puntos');

    // Cada par de Obeliscos deja un hueco; de un par al siguiente el centro del hueco no se mueve más de 0,3 u.
    // Los márgenes dejan siempre un pedazo de fuste debajo de la punta.
    function addPipe() {
      const gap = gapOf(S.spawned++);
      const lo = gap / 2 + TIP + BASE_H + 0.05, hi = GROUND - gap / 2 - TIP - BASE_H - 0.05;
      let cy = lo + rng() * (hi - lo);
      cy = Math.max(S.prevGap - 0.3, Math.min(S.prevGap + 0.3, cy));
      S.prevGap = cy;
      const x = S.nextX, top = cy - gap / 2, bot = cy + gap / 2;
      S.pipes.push({
        x, top, bot, passed: false,
        up: obeliskShape(x, top, -0.2, 1),        // el del revés: el pedestal queda fuera de la pantalla
        down: obeliskShape(x, bot, GROUND, -1),
        festejoUp: rng() < 0.2, festejoDown: rng() < 0.2,
        medialuna: rng() < 0.28 ? { got: false } : null,
      });
      S.nextX += SPACING;
    }
    while (S.nextX < 3) addPipe();

    function flap() {
      if (!S.alive) return;
      if (!S.started) { S.started = true; pill.hidden = true; }
      S.vy = -FLAP; S.flapT = 0;
      audio.tone(1900, 0.04, 'square', 0.035); audio.tone(2250, 0.05, 'square', 0.035, 0.06);
    }

    function die(cause) {
      if (!S.alive) return;
      S.alive = false; S.crash = cause; S.shake = 1;
      for (let i = 0; i < 10; i++) S.feathers.push({ x: S.x, y: S.y, vx: (Math.random() - 0.5) * 0.5, vy: -Math.random() * 0.5, r: Math.random() * 6, life: 1 });
      audio.lose(); buzz([60, 40, 90]);
      report();
      endTimer = setTimeout(() => onEnd(S.score, { title: TITLES[cause] }), 1000);
    }

    function physics(h) {
      if (!S.started) { S.y = 0.42 + Math.sin(performance.now() / 300) * 0.012; return; }
      S.vy = Math.min(VMAX, S.vy + G * h);
      S.y += S.vy * h;
      if (S.y < R) { S.y = R; S.vy = Math.max(0, S.vy); }
      if (!S.alive) { if (S.y > GROUND - R) { S.y = GROUND - R; S.vy = 0; } return; }
      S.x += speedOf(S.passedN) * h;
      if (S.y > GROUND - R) { S.y = GROUND - R; return die('piso'); }
      for (const p of S.pipes) {
        if (S.x + R < p.x || S.x - R > p.x + PW) continue;
        if (circleHitsPoly(S.x, S.y, R, p.up)) return die('arriba');
        if (circleHitsPoly(S.x, S.y, R, p.down)) return die('abajo');
        if (p.medialuna && !p.medialuna.got && Math.hypot(S.x - (p.x + PW / 2), S.y - (p.top + p.bot) / 2) < R + 0.035) {
          p.medialuna.got = true; S.score += 1; report();
          S.floats.push({ x: p.x + PW / 2, y: (p.top + p.bot) / 2, text: '+1 medialuna', life: 1 });
          audio.tone(1047, 0.08, 'triangle', 0.14); audio.tone(1319, 0.1, 'triangle', 0.14, 0.07);
        }
      }
      for (const p of S.pipes) {
        if (!p.passed && S.x > p.x + PW) {
          p.passed = true; S.passedN += 1; S.score += 1; report();
          audio.tone(880, 0.06, 'triangle', 0.12); buzz(8);
          if (S.passedN % 10 === 0) flash(toast, S.passedN % 50 === 0 ? `¡${S.passedN} Obeliscos! ¡Qué bestia!` : `¡${S.passedN}! Teru teru`);
        }
      }
      while (S.nextX < S.x + 3) addPipe();
      S.pipes = S.pipes.filter(p => p.x + PW > S.x - 1);
    }

    function update(dt) {
      S.acc += Math.min(0.05, dt / 1000);
      while (S.acc >= STEP) { physics(STEP); S.acc -= STEP; }
      S.flapT += dt;
      const target = !S.started ? 0 : !S.alive ? 1.4 : Math.max(-0.45, Math.min(1.2, S.vy * 0.9));
      S.rot += (target - S.rot) * Math.min(1, dt / (S.alive ? 90 : 160));
      S.floats = S.floats.filter(f => { f.y -= dt * 0.00012; f.life -= dt / 900; return f.life > 0; });
      S.feathers = S.feathers.filter(f => { f.x += f.vx * dt / 1000; f.y += f.vy * dt / 1000; f.vy += 0.6 * dt / 1000; f.r += dt * 0.004; f.life -= dt / 1200; return f.life > 0; });
    }

    /* ---------- dibujo ---------- */
    function draw(dt, now) {
      st.begin();
      const W = st.w, H = st.h, k = H;           // k: píxeles por u
      const camL = S.x - TERO_X;
      const X = wx => (wx - camL) * k;
      ctx.save();
      if (S.shake > 0) { ctx.translate((Math.random() - 0.5) * S.shake * 12, (Math.random() - 0.5) * S.shake * 8); S.shake = Math.max(0, S.shake - dt / 450); }

      // cielo y sol de mayo
      const g = ctx.createLinearGradient(0, 0, 0, GROUND * k);
      g.addColorStop(0, '#4f9fe0'); g.addColorStop(0.7, '#a9d3f2'); g.addColorStop(1, '#dcefff');
      ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, GROUND * k + 20);
      solDeMayo(ctx, W - 0.09 * k, 0.1 * k, 0.04 * k, now);

      // nubes
      for (let i = -1; i < W / (0.5 * k) + 2; i++) {
        const cell = Math.floor(camL * 0.06 / 0.5) + i, r = hash(cell, 7);
        if (r < 0.45) continue;
        const cx = (cell * 0.5 - camL * 0.06) * k + r * 0.3 * k, cy = (0.08 + hash(cell, 8) * 0.22) * k, s = (0.05 + r * 0.04) * k;
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        circle(ctx, cx, cy, s); circle(ctx, cx + s, cy + s * 0.2, s * 0.8); circle(ctx, cx - s, cy + s * 0.25, s * 0.7); circle(ctx, cx + s * 0.3, cy - s * 0.4, s * 0.7);
      }

      // edificios lejanos
      const farP = 0.15;
      ctx.fillStyle = '#9fc1de';
      for (let i = -1; i < W / (0.12 * k) + 2; i++) {
        const cell = Math.floor(camL * farP / 0.12) + i, r = hash(cell, 1);
        const x = (cell * 0.12 - camL * farP) * k, h = (0.08 + r * 0.16) * k;
        ctx.fillRect(x, GROUND * k - h, 0.11 * k, h);
      }

      // casas del barrio con tanques de agua y antenas
      const midP = 0.4;
      for (let i = -1; i < W / (0.16 * k) + 2; i++) {
        const cell = Math.floor(camL * midP / 0.16) + i, r = hash(cell, 2);
        const x = (cell * 0.16 - camL * midP) * k, w = 0.15 * k, h = (0.1 + r * 0.12) * k, top = GROUND * k - h;
        ctx.fillStyle = ['#c9b79c', '#b7a3b8', '#a9bfae', '#c7a894'][Math.floor(hash(cell, 3) * 4)];
        ctx.fillRect(x, top, w, h);
        ctx.fillStyle = 'rgba(40,50,70,.35)';
        for (let wy = top + 0.025 * k; wy < GROUND * k - 0.04 * k; wy += 0.045 * k) for (let wx = x + 0.02 * k; wx < x + w - 0.03 * k; wx += 0.045 * k) ctx.fillRect(wx, wy, 0.022 * k, 0.025 * k);
        if (hash(cell, 4) < 0.6) {
          ctx.fillStyle = '#2b2d31'; ctx.fillRect(x + w * 0.55, top - 0.04 * k, 0.04 * k, 0.04 * k);
        }
        if (hash(cell, 5) < 0.4) { ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + w * 0.25, top); ctx.lineTo(x + w * 0.25, top - 0.05 * k); ctx.moveTo(x + w * 0.15, top - 0.04 * k); ctx.lineTo(x + w * 0.35, top - 0.04 * k); ctx.stroke(); }
      }

      // Obeliscos
      for (const p of S.pipes) {
        const x = X(p.x), w = PW * k;
        if (x > W + 10 || x + w < -10) continue;
        drawObelisk(ctx, p.up, k, camL, 1, p.festejoUp);
        drawObelisk(ctx, p.down, k, camL, -1, p.festejoDown);
        if (p.medialuna && !p.medialuna.got) medialuna(ctx, x + w / 2, ((p.top + p.bot) / 2 + Math.sin(now / 250 + p.x) * 0.008) * k, 0.028 * k);
      }

      // vereda, cordón y la 9 de Julio
      const gy = GROUND * k;
      ctx.fillStyle = '#c9c4b8'; ctx.fillRect(-20, gy, W + 40, 0.05 * k);
      ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1;
      const tile = 0.05 * k, off = ((camL * k) % tile + tile) % tile;
      for (let x = -off; x < W + tile; x += tile) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + 0.05 * k); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(0, gy + 0.025 * k); ctx.lineTo(W, gy + 0.025 * k); ctx.stroke();
      ctx.fillStyle = '#e7dfc4'; ctx.fillRect(-20, gy + 0.05 * k, W + 40, 0.015 * k);
      ctx.fillStyle = '#4a4f57'; ctx.fillRect(-20, gy + 0.065 * k, W + 40, H - gy);
      ctx.fillStyle = '#f2f2f2';
      const dash = 0.12 * k, doff = ((camL * k) % dash + dash) % dash;
      for (let x = -doff; x < W + dash; x += dash) ctx.fillRect(x, gy + 0.1 * k, dash * 0.5, 0.008 * k);

      drawTero(now);

      for (const f of S.feathers) {
        ctx.globalAlpha = Math.max(0, f.life); ctx.fillStyle = '#efe9dc';
        ctx.save(); ctx.translate(X(f.x), f.y * k); ctx.rotate(f.r); ctx.beginPath(); ctx.ellipse(0, 0, 0.012 * k, 0.004 * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const f of S.floats) {
        ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.6));
        ctx.font = `900 ${0.03 * k}px Chivo, system-ui, sans-serif`;
        ctx.lineWidth = 0.008 * k; ctx.strokeStyle = '#fff'; ctx.strokeText(f.text, X(f.x), f.y * k);
        ctx.fillStyle = '#b86a1e'; ctx.fillText(f.text, X(f.x), f.y * k);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    function drawTero(now) {
      const k = st.h, x = TERO_X * k, y = S.y * k;
      ctx.save(); ctx.translate(x, y); ctx.rotate(S.rot);
      if (teroImg) {
        const n = frameCount(teroImg), fw = teroImg.width / n;
        // al aletear arranca del cuadro con las alas arriba; planeando aletea más lento
        const f = S.alive ? Math.floor(S.flapT / (S.flapT < 400 ? 45 : 90)) % n : 2;
        const w = 0.15 * k, h = w * teroImg.height / fw;
        ctx.scale(-1, 1);
        ctx.drawImage(teroImg, f * fw, 0, fw, teroImg.height, -w * 0.52, -h * 0.62, w, h);
      } else teroCode(ctx, 0, 0, 0.32 * k, S.alive ? now : 0);
      ctx.restore();
    }

    report();
    const unbind = bindInput(el, { onDown: flap });
    const stop = startLoop((dt, now) => { update(dt); draw(dt, now); });

    return {
      destroy() { stop(); unbind(); clearTimeout(endTimer); st.destroy(); pill.remove(); toast.remove(); },
      _state: S, _update: update, _move: flap, _flap: flap,
      _phys: { G, FLAP, R, PW, GROUND, speedOf },
    };
  },
};
