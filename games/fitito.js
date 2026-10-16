import { makeCanvas, startLoop, mulberry32, audio, buzz, rrect, circle, overlay, flash } from '../js/engine.js';
import { getCustom } from '../js/art.js';

// Ruta pseudo 3D al estilo arcade: la calle es una tira de segmentos proyectados desde una cámara detrás del auto.
const SEG = 200;            // largo de cada segmento
const N = 6000;             // segmentos de la ruta (se repite)
const ROAD = 2000;          // medio ancho de la calle en unidades del mundo
const CAM_H = 1150;
const DEPTH = 1 / Math.tan((100 / 2) * Math.PI / 180);
const DRAW = 180;           // segmentos visibles
const RUMBLE = 3;
const MAX_SPEED = SEG * 60; // unidades por segundo
const CUADRA = 8000;        // 100 m de juego
const LANES = 3;
const CAR_W = 0.34;         // ancho del Fitito en medios-anchos de calle

const COLORS = {
  light: { road: '#5b5f66', grass: '#7aa548', rumble: '#f2f2f2', lane: '#f2f2f2' },
  dark: { road: '#565a61', grass: '#6f9a40', rumble: '#c43c32', lane: null },
};

/* ---------- dibujos provisorios ---------- */
function canvasOf(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  return c;
}

function paintFitito(c, w, h) {
  // Fiat 600 visto desde atrás, con el paragolpes atado con alambre.
  c.lineJoin = 'round';
  c.fillStyle = '#1b1f24';
  rrect(c, w * 0.08, h * 0.72, w * 0.18, h * 0.26, 6); c.fill();
  rrect(c, w * 0.74, h * 0.72, w * 0.18, h * 0.26, 6); c.fill();
  c.fillStyle = '#8ec3e6'; c.strokeStyle = '#2f4f66'; c.lineWidth = 4;
  c.beginPath();
  c.moveTo(w * 0.06, h * 0.86);
  c.bezierCurveTo(w * 0.02, h * 0.5, w * 0.12, h * 0.36, w * 0.2, h * 0.34);
  c.bezierCurveTo(w * 0.28, h * 0.04, w * 0.72, h * 0.04, w * 0.8, h * 0.34);
  c.bezierCurveTo(w * 0.88, h * 0.36, w * 0.98, h * 0.5, w * 0.94, h * 0.86);
  c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#26384a';
  c.beginPath(); c.moveTo(w * 0.27, h * 0.33); c.bezierCurveTo(w * 0.32, h * 0.12, w * 0.68, h * 0.12, w * 0.73, h * 0.33); c.closePath(); c.fill();
  c.strokeStyle = '#4b7896'; c.lineWidth = 3;
  for (let i = 0; i < 5; i++) { const y = h * (0.46 + i * 0.045); c.beginPath(); c.moveTo(w * 0.36, y); c.lineTo(w * 0.64, y); c.stroke(); }
  c.fillStyle = '#d6362b'; circle(c, w * 0.16, h * 0.55, h * 0.06); circle(c, w * 0.84, h * 0.55, h * 0.06);
  c.fillStyle = '#c9ced6'; rrect(c, w * 0.04, h * 0.78, w * 0.92, h * 0.07, 4); c.fill();
  c.fillStyle = '#111'; rrect(c, w * 0.38, h * 0.66, w * 0.24, h * 0.1, 2); c.fill();
  c.fillStyle = '#fff'; c.font = `700 ${Math.round(h * 0.075)}px Chivo, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('B 600.123', w * 0.5, h * 0.712);
  c.strokeStyle = '#9aa0a8'; c.lineWidth = 2;
  c.beginPath(); for (let i = 0; i <= 8; i++) c.lineTo(w * (0.18 + i * 0.012), h * (0.8 + (i % 2 ? 0.06 : 0))); c.stroke();
}

function paintCarFront(c, w, h, color, truck) {
  c.lineJoin = 'round';
  c.fillStyle = '#1b1f24';
  rrect(c, w * 0.08, h * 0.74, w * 0.16, h * 0.24, 5); c.fill();
  rrect(c, w * 0.76, h * 0.74, w * 0.16, h * 0.24, 5); c.fill();
  c.fillStyle = color; c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 4;
  if (truck) { rrect(c, w * 0.06, h * 0.08, w * 0.88, h * 0.8, 10); c.fill(); c.stroke(); }
  else {
    c.beginPath();
    c.moveTo(w * 0.05, h * 0.86); c.lineTo(w * 0.07, h * 0.48);
    c.bezierCurveTo(w * 0.12, h * 0.4, w * 0.2, h * 0.38, w * 0.22, h * 0.36);
    c.lineTo(w * 0.3, h * 0.12); c.lineTo(w * 0.7, h * 0.12); c.lineTo(w * 0.78, h * 0.36);
    c.bezierCurveTo(w * 0.8, h * 0.38, w * 0.88, h * 0.4, w * 0.93, h * 0.48);
    c.lineTo(w * 0.95, h * 0.86); c.closePath(); c.fill(); c.stroke();
  }
  c.fillStyle = '#2a3b4d';
  if (truck) { rrect(c, w * 0.14, h * 0.16, w * 0.72, h * 0.3, 6); c.fill(); }
  else { c.beginPath(); c.moveTo(w * 0.27, h * 0.37); c.lineTo(w * 0.33, h * 0.17); c.lineTo(w * 0.67, h * 0.17); c.lineTo(w * 0.73, h * 0.37); c.closePath(); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(w * 0.36, h * 0.2, w * 0.08, h * 0.12);
  c.fillStyle = '#2b2f36'; rrect(c, w * 0.32, h * 0.56, w * 0.36, h * 0.12, 3); c.fill();
  c.fillStyle = '#ffe9a3'; circle(c, w * 0.18, h * 0.6, h * 0.075); circle(c, w * 0.82, h * 0.6, h * 0.075);
  c.fillStyle = 'rgba(255,240,180,.35)'; circle(c, w * 0.18, h * 0.6, h * 0.12); circle(c, w * 0.82, h * 0.6, h * 0.12);
  c.fillStyle = '#c9ced6'; rrect(c, w * 0.04, h * 0.76, w * 0.92, h * 0.07, 4); c.fill();
  c.fillStyle = '#f4f4f4'; rrect(c, w * 0.4, h * 0.69, w * 0.2, h * 0.08, 2); c.fill();
}

function paintTree(c, w, h) {
  c.fillStyle = '#d9cfbf'; c.fillRect(w * 0.45, h * 0.45, w * 0.1, h * 0.55);
  const blobs = [[0.5, 0.18, 0.3], [0.3, 0.32, 0.24], [0.7, 0.3, 0.24], [0.5, 0.4, 0.26], [0.36, 0.12, 0.18], [0.64, 0.12, 0.18]];
  c.fillStyle = '#4f6e4a'; blobs.forEach(([x, y, r]) => circle(c, w * x, h * y, w * r));
  c.fillStyle = '#6b8a62'; blobs.slice(0, 3).forEach(([x, y, r]) => circle(c, w * x - 3, h * y - 3, w * r * 0.6));
}

function paintSign(c, w, h, text) {
  c.fillStyle = '#9aa0a8'; c.fillRect(w * 0.15, h * 0.4, w * 0.05, h * 0.6); c.fillRect(w * 0.8, h * 0.4, w * 0.05, h * 0.6);
  c.fillStyle = '#1f7a4a'; c.strokeStyle = '#f2f2f2'; c.lineWidth = 4;
  rrect(c, w * 0.04, h * 0.04, w * 0.92, h * 0.42, 8); c.fill(); c.stroke();
  c.fillStyle = '#fff'; c.font = `800 ${Math.round(h * 0.15)}px Chivo, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, w * 0.5, h * 0.25);
}

function paintGauchito(c, w, h) {
  c.fillStyle = '#7a1414'; c.fillRect(w * 0.08, h * 0.05, w * 0.03, h * 0.95); c.fillRect(w * 0.89, h * 0.12, w * 0.03, h * 0.88);
  c.fillStyle = '#d61f1f';
  c.beginPath(); c.moveTo(w * 0.11, h * 0.05); c.lineTo(w * 0.4, h * 0.12); c.lineTo(w * 0.11, h * 0.2); c.fill();
  c.beginPath(); c.moveTo(w * 0.92, h * 0.12); c.lineTo(w * 0.66, h * 0.19); c.lineTo(w * 0.92, h * 0.26); c.fill();
  c.fillStyle = '#c42a2a'; c.strokeStyle = '#5c0f0f'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(w * 0.25, h * 0.55); c.lineTo(w * 0.5, h * 0.36); c.lineTo(w * 0.75, h * 0.55); c.lineTo(w * 0.75, h); c.lineTo(w * 0.25, h); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#ffd36b'; c.fillRect(w * 0.42, h * 0.66, w * 0.16, h * 0.2);
}

function paintPost(c, w, h) {
  c.fillStyle = '#a7adb5'; c.fillRect(w * 0.44, 0, w * 0.12, h);
  c.fillRect(w * 0.1, h * 0.04, w * 0.8, h * 0.04);
  c.fillStyle = '#ffe9a3'; circle(c, w * 0.12, h * 0.1, w * 0.07);
}

const CAR_COLORS = ['#c0392b', '#f2f2f2', '#2e86c1', '#f1c40f', '#7f8c8d', '#27ae60', '#e67e22'];
const PLACES = ['PILAR 23', 'ZÁRATE 61', 'ESCOBAR 12', 'CAMPANA 48', 'TIGRE 8', 'ROSARIO 290'];

export default {
  id: 'fitito',
  name: 'El Fitito en la Panamericana',
  tagline: 'Esquivá el tráfico y los baches',
  threshold: 3,
  rules: [
    'Manejás un Fiat 600 atado con alambre por la Panamericana. Acelera solo.',
    'Mantené apretado el lado izquierdo o derecho de la pantalla para doblar.',
    'Vienen autos y camiones de frente: esquivalos.',
    'Los baches gigantes te vuelan la suspensión.',
    'Por la banquina el auto frena, y si te llevás puesto un árbol o un cartel, perdés.',
    'Cada cuadra recorrida suma 1 punto. Cuanto más lejos, más rápido.',
  ],
  icon(c, s) {
    c.fillStyle = '#f4a259'; c.fillRect(0, 0, s, s * 0.45);
    c.fillStyle = '#7aa548'; c.fillRect(0, s * 0.45, s, s * 0.55);
    c.fillStyle = '#5b5f66';
    c.beginPath(); c.moveTo(s * 0.44, s * 0.45); c.lineTo(s * 0.56, s * 0.45); c.lineTo(s * 0.95, s); c.lineTo(s * 0.05, s); c.closePath(); c.fill();
    const own = getCustom('fitito');
    const img = own || canvasOf(160, 110, paintFitito);
    const w = s * 0.62, h = w * img.height / img.width;
    c.drawImage(img, (s - w) / 2, s - h - s * 0.06, w, h);
  },

  mount(el, { seed, onScore, onEnd }) {
    const st = makeCanvas(el), ctx = st.ctx, rng = mulberry32(seed);
    const pill = overlay(el, 'g-pill', 'Mantené apretado un costado para doblar');
    const toast = overlay(el, 'g-toast');

    // Imágenes: las propias si existen, si no los dibujos provisorios.
    const SPR = {
      fitito: getCustom('fitito') || canvasOf(320, 220, paintFitito),
      cars: [1, 2, 3].map(i => getCustom('auto' + i)).filter(Boolean),
      truck: getCustom('camion') || canvasOf(300, 260, (c, w, h) => paintCarFront(c, w, h, '#d35400', true)),
      tree: canvasOf(160, 260, paintTree),
      post: canvasOf(80, 300, paintPost),
      gauchito: canvasOf(160, 180, paintGauchito),
      signs: PLACES.map(p => canvasOf(300, 200, (c, w, h) => paintSign(c, w, h, p))),
    };
    if (!SPR.cars.length) SPR.cars = CAR_COLORS.map(col => canvasOf(300, 210, (c, w, h) => paintCarFront(c, w, h, col, false)));

    // Ruta: tramos rectos y curvas que entran y salen suave.
    const segs = [];
    const ease = (a, b, t) => a + (b - a) * ((-Math.cos(t * Math.PI) / 2) + 0.5);
    const addRoad = (enter, hold, leave, curve) => {
      for (let i = 0; i < enter; i++) segs.push({ curve: ease(0, curve, i / enter), sprites: [] });
      for (let i = 0; i < hold; i++) segs.push({ curve, sprites: [] });
      for (let i = 0; i < leave; i++) segs.push({ curve: ease(curve, 0, i / leave), sprites: [] });
    };
    addRoad(0, 60, 0, 0);
    while (segs.length < N) {
      const r = rng();
      if (r < 0.35) addRoad(25, 40 + Math.floor(rng() * 80), 25, 0);
      else addRoad(30, 40 + Math.floor(rng() * 60), 30, (rng() < 0.5 ? -1 : 1) * (1.5 + rng() * 3.5));
    }
    segs.length = N;
    segs.forEach((s, i) => { s.index = i; s.color = Math.floor(i / RUMBLE) % 2 ? COLORS.dark : COLORS.light; });
    for (let i = 20; i < N; i += 6 + Math.floor(rng() * 10)) {
      const side = rng() < 0.5 ? -1 : 1, r = rng();
      let img = SPR.tree, w = 0.7;
      if (r < 0.12) { img = SPR.signs[Math.floor(rng() * SPR.signs.length)]; w = 1.1; }
      else if (r < 0.2) { img = SPR.gauchito; w = 0.55; }
      else if (r < 0.45) { img = SPR.post; w = 0.22; }
      segs[i].sprites.push({ img, w, x: side * (1.35 + rng() * 1.4) });
    }
    const TRACK = N * SEG;

    const S = {
      pos: 0, speed: 0, x: 0, steer: 0, started: false, alive: true,
      obstacles: [], nextObs: SEG * 60, skyX: 0, shake: 0, crash: null, cuadras: 0,
    };
    let endTimer = 0;
    const PLAYER_Z = CAM_H * DEPTH;
    const laneX = l => -1 + (2 * l + 1) / LANES;
    const report = () => onScore(S.cuadras, `Cuadras · ${Math.round(S.speed / MAX_SPEED * 140)} km/h`);

    function spawnRow() {
      const z = S.pos + PLAYER_Z + SEG * DRAW * 0.95;
      const lanes = [0, 1, 2].sort(() => rng() - 0.5);
      const level = Math.min(1, S.cuadras / 60);
      const n = rng() < 0.15 + level * 0.35 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const lane = lanes[k];
        if (rng() < 0.3) S.obstacles.push({ kind: 'bache', z, x: laneX(lane) + (rng() - 0.5) * 0.2, w: 0.5 });
        else {
          const truck = rng() < 0.18;
          S.obstacles.push({
            kind: truck ? 'camion' : 'auto', z, x: laneX(lane), w: truck ? 0.5 : 0.36,
            img: truck ? SPR.truck : SPR.cars[Math.floor(rng() * SPR.cars.length)],
            v: MAX_SPEED * (0.12 + rng() * 0.18),
          });
        }
      }
      S.nextObs = SEG * (34 - level * 16) * (0.8 + rng() * 0.5);
    }

    function die(kind) {
      S.alive = false; S.shake = 1; S.crash = { kind, t: 0 };
      audio.lose(); buzz(kind === 'bache' ? [80, 40, 120] : [60, 40, 90]);
      report();
      const title = { bache: '¡Volaste la suspensión!', camion: '¡Te comiste un camión!', cartel: '¡Te fuiste a la banquina!' }[kind] || '¡Choque de frente!';
      endTimer = setTimeout(() => onEnd(S.cuadras, { title }), 1100);
    }

    function update(dt) {
      if (!S.started || !S.alive) return;
      const sec = dt / 1000;
      const prevPz = S.pos + PLAYER_Z;
      const seg = segs[Math.floor(prevPz / SEG) % N];
      const pct = S.speed / MAX_SPEED;
      const top = MAX_SPEED * Math.min(1, 0.5 + S.cuadras * 0.008);
      const off = Math.abs(S.x) > 1;
      if (off) S.speed += (MAX_SPEED * 0.22 - S.speed) * Math.min(1, sec * 2);
      else S.speed = Math.min(top, S.speed + MAX_SPEED * 0.35 * sec);
      S.pos += S.speed * sec;
      S.x += S.steer * sec * 2.2 * Math.max(0.35, pct);
      S.x -= sec * 2.2 * pct * pct * seg.curve * 0.32;
      S.x = Math.max(-1.8, Math.min(1.8, S.x));
      if (off) {
        for (let i = Math.floor(prevPz / SEG); i <= Math.floor((S.pos + PLAYER_Z) / SEG); i++) {
          for (const sp of segs[i % N].sprites) if (Math.abs(sp.x - S.x) < (sp.w + CAR_W) / 2 * 0.7) return die('cartel');
        }
      }
      S.skyX += seg.curve * pct * sec * 0.02;

      const c = Math.floor(S.pos / CUADRA);
      if (c !== S.cuadras) {
        S.cuadras = c;
        if (c > 0 && c % 25 === 0) { flash(toast, `¡${c} cuadras!`); audio.win(); }
      }
      report();

      S.nextObs -= S.speed * sec;
      if (S.nextObs <= 0) spawnRow();
      const pz = S.pos + PLAYER_Z;
      for (const o of S.obstacles) {
        const before = o.z - prevPz;
        if (o.v) o.z -= o.v * sec;
        const after = o.z - pz;
        // choca si en este cuadro el obstáculo pasó por la franja del auto (aunque haya avanzado mucho)
        if (before > -SEG * 0.5 && after < SEG * 0.5 && Math.abs(o.x - S.x) < (o.w + CAR_W) / 2 * 0.78) return die(o.kind);
      }
      S.obstacles = S.obstacles.filter(o => o.z > S.pos - SEG * 2);
    }

    function draw(dt, now) {
      st.begin();
      const W = st.w, H = st.h;
      const horizon = H * 0.42;
      ctx.save();
      if (S.shake > 0) { ctx.translate((Math.random() - 0.5) * S.shake * 14, (Math.random() - 0.5) * S.shake * 10); S.shake = Math.max(0, S.shake - dt / 700); }

      // cielo de atardecer, sol y horizonte de la pampa
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, '#2d4a7a'); sky.addColorStop(0.55, '#f08a5d'); sky.addColorStop(1, '#ffd08a');
      ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, horizon + 40);
      const sunX = W * 0.5 - (S.skyX % 1) * W * 2;
      ctx.fillStyle = 'rgba(255,236,170,.9)'; circle(ctx, ((sunX % (W * 1.4)) + W * 1.4) % (W * 1.4) - W * 0.2, horizon - H * 0.06, H * 0.06);
      ctx.fillStyle = '#3f5f3a';
      const off = ((S.skyX * W * 3) % 80 + 80) % 80;
      for (let x = -80 - off; x < W + 80; x += 80) {
        ctx.beginPath(); ctx.ellipse(x + 20, horizon, 26, 10, 0, Math.PI, 0); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + 58, horizon, 16, 6, 0, Math.PI, 0); ctx.fill();
      }

      ctx.fillStyle = COLORS.dark.grass; ctx.fillRect(-20, horizon, W + 40, H - horizon + 20);

      // ruta
      const baseIdx = Math.floor(S.pos / SEG);
      const basePct = (S.pos % SEG) / SEG;
      let x = 0, dx = -(segs[baseIdx % N].curve * basePct);
      let maxy = H;
      const proj = [];
      const scaleY = H - horizon;
      const project = (wx, wz, camX) => {
        const cz = wz - S.pos;
        const sc = DEPTH / cz;
        return { x: W / 2 + sc * (wx - camX) * W / 2, y: horizon + sc * CAM_H * scaleY, w: sc * ROAD * W / 2, sc };
      };
      for (let n = 0; n < DRAW; n++) {
        const idx = baseIdx + n, seg = segs[idx % N];
        const camX = S.x * ROAD;
        const p1 = project(0, idx * SEG, camX - x);
        const p2 = project(0, (idx + 1) * SEG, camX - x - dx);
        x += dx; dx += seg.curve;
        proj[n] = { p1, p2, seg };
        if (idx * SEG - S.pos <= DEPTH || p2.y >= maxy) continue;
        drawSegment(p1, p2, seg.color, W);
        maxy = p2.y;
      }

      // objetos de atrás hacia adelante
      for (let n = DRAW - 1; n > 0; n--) {
        const pr = proj[n];
        if (!pr || pr.p1.y > H + 50) continue;
        for (const sp of pr.seg.sprites) drawSprite(sp.img, pr.p1, sp.x, sp.w, W);
        for (const o of S.obstacles) {
          const on = Math.floor(o.z / SEG) - baseIdx;
          if (on !== n) continue;
          const f = (o.z % SEG) / SEG;
          const p = { x: pr.p1.x + (pr.p2.x - pr.p1.x) * f, y: pr.p1.y + (pr.p2.y - pr.p1.y) * f, w: pr.p1.w + (pr.p2.w - pr.p1.w) * f };
          if (o.kind === 'bache') drawBache(p, o);
          else drawSprite(o.img, p, o.x, o.w, W);
        }
      }

      // el Fitito
      const img = SPR.fitito;
      const cw = CAR_W * W * 0.92, ch = cw * img.height / img.width;
      let cy = H - ch - H * 0.035, cx = W / 2 - cw / 2, rot = 0;
      const bounce = S.alive && S.started ? Math.sin(now / (Math.abs(S.x) > 1 ? 40 : 90)) * (Math.abs(S.x) > 1 ? 3 : 1) * (S.speed / MAX_SPEED) : 0;
      if (S.crash) {
        S.crash.t += dt;
        const t = Math.min(1, S.crash.t / 700);
        if (S.crash.kind === 'bache') { cy -= Math.sin(t * Math.PI) * H * 0.18; rot = t * 0.6; }
        else rot = Math.sin(S.crash.t / 50) * 0.08;
      }
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.ellipse(W / 2, H - H * 0.03, cw * 0.5, ch * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.translate(cx + cw / 2, cy + ch / 2 + bounce);
      ctx.rotate(rot + S.steer * 0.04);
      ctx.drawImage(img, -cw / 2, -ch / 2, cw, ch);
      ctx.restore();
      ctx.restore();
    }

    function drawSegment(p1, p2, col, W) {
      ctx.fillStyle = col.grass; ctx.fillRect(0, p2.y, W, p1.y - p2.y + 1);
      const poly = (x1, y1, w1, x2, y2, w2, color) => {
        y1 += 1; // superpone un píxel con el tramo anterior para que no se vean costuras
        ctx.fillStyle = color; ctx.beginPath();
        ctx.moveTo(x1 - w1, y1); ctx.lineTo(x2 - w2, y2); ctx.lineTo(x2 + w2, y2); ctx.lineTo(x1 + w1, y1); ctx.closePath(); ctx.fill();
      };
      const r1 = p1.w / 6, r2 = p2.w / 6;
      poly(p1.x, p1.y, p1.w + r1, p2.x, p2.y, p2.w + r2, col.rumble);
      poly(p1.x, p1.y, p1.w, p2.x, p2.y, p2.w, col.road);
      if (col.lane) {
        const l1 = p1.w / 40, l2 = p2.w / 40;
        for (let k = 1; k < LANES; k++) {
          const t = -1 + (2 * k) / LANES;
          poly(p1.x + p1.w * t, p1.y, l1, p2.x + p2.w * t, p2.y, l2, col.lane);
        }
      }
    }

    function drawSprite(img, p, offX, worldW, W) {
      const dw = worldW * p.w, dh = dw * img.height / img.width;
      if (dw < 1) return;
      const sx = p.x + offX * p.w;
      ctx.drawImage(img, sx - dw / 2, p.y - dh, dw, dh);
    }

    function drawBache(p, o) {
      const cx = p.x + o.x * p.w, w = o.w * p.w * 0.5, h = w * 0.28;
      if (w < 1) return;
      ctx.fillStyle = '#3c3f44'; ctx.beginPath(); ctx.ellipse(cx, p.y - h * 0.5, w * 1.1, h * 1.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1d1f22'; ctx.beginPath(); ctx.ellipse(cx, p.y - h * 0.5, w, h, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(120,160,200,.35)'; ctx.beginPath(); ctx.ellipse(cx - w * 0.2, p.y - h * 0.6, w * 0.5, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Controles: mantener apretado un costado de la pantalla (o flechas / A-D).
    const touches = new Map();
    const refresh = () => {
      let s = 0;
      for (const v of touches.values()) s = v;
      S.steer = s || keySteer;
    };
    let keySteer = 0;
    const start = () => { if (!S.started && S.alive) { S.started = true; pill.hidden = true; } };
    const pd = e => {
      if (e.button > 0) return;
      audio.unlock(); start();
      const r = el.getBoundingClientRect();
      touches.set(e.pointerId, e.clientX - r.left < r.width / 2 ? -1 : 1);
      refresh();
    };
    const pm = e => {
      if (!touches.has(e.pointerId)) return;
      const r = el.getBoundingClientRect();
      touches.set(e.pointerId, e.clientX - r.left < r.width / 2 ? -1 : 1);
      refresh();
    };
    const pu = e => { touches.delete(e.pointerId); refresh(); };
    const kd = e => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') keySteer = -1;
      else if (k === 'arrowright' || k === 'd') keySteer = 1;
      else if (k !== ' ' && k !== 'arrowup' && k !== 'w') return;
      e.preventDefault(); audio.unlock(); start(); refresh();
    };
    const ku = e => {
      const k = e.key.toLowerCase();
      if ((k === 'arrowleft' || k === 'a') && keySteer < 0) keySteer = 0;
      if ((k === 'arrowright' || k === 'd') && keySteer > 0) keySteer = 0;
      refresh();
    };
    el.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    window.addEventListener('pointercancel', pu);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    report();
    const stop = startLoop((dt, now) => { update(dt); draw(dt, now); });

    return {
      destroy() {
        stop(); clearTimeout(endTimer); st.destroy(); pill.remove(); toast.remove();
        el.removeEventListener('pointerdown', pd);
        window.removeEventListener('pointermove', pm);
        window.removeEventListener('pointerup', pu);
        window.removeEventListener('pointercancel', pu);
        window.removeEventListener('keydown', kd);
        window.removeEventListener('keyup', ku);
      },
      _state: S, _update: update,
    };
  },
};
