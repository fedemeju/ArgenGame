import { makeCanvas, startLoop, bindInput, mulberry32, audio, buzz, overlay, flash } from '../js/engine.js';
import { painter } from '../js/pixel.js';
import { getCustom } from '../js/art.js';
import * as ART from './fitito-art.js';

// Ruta pseudo 3D al estilo arcade, recta, dibujada en pixel art: se pinta en un lienzo chico
// (unos 190 píxeles de ancho) y se agranda sin suavizar.
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
const LOW_W = 190;          // ancho del lienzo chico
const PXW = 0.36 / 56;      // ancho en el mundo de un píxel de dibujo (un auto de 56 px ocupa 0,36)

const COLORS = {
  light: { road: '#5b5f66', grass: '#7aa548', dirt: '#c2a46b', rumble: '#f2f2f2', lane: '#f2f2f2' },
  dark: { road: '#565a61', grass: '#6f9a40', dirt: '#b39560', rumble: '#c43c32', lane: null },
};
const SKY = ['#25335e', '#33457a', '#4c5089', '#7a5a8c', '#b2617e', '#e0745a', '#f39a5b', '#ffc27a', '#ffe2a6'];

// Los dibujos se arman una sola vez.
let A = null;
function art() {
  if (A) return A;
  const vacas = [ART.vaca(true), ART.vaca(false)];
  A = {
    fitito: ART.fitito(),
    cars: ART.cars(),
    truck: ART.camion(),
    baches: ART.baches(),
    euca: ART.eucalipto(),
    poste: ART.poste(),
    post: ART.alambrado(),
    gauchito: ART.gauchito(),
    parrilla: ART.parrilla(),
    puestos: ['PAN CASERO', 'SALAME', 'QUESOS'].map(ART.puesto),
    vacas: [...vacas, ...vacas.map(ART.mirrored)],
    molino: ART.molino(),
    ypf: ART.ypf(),
    peaje: ART.peaje(),
    nubes: [ART.nube(34), ART.nube(24), ART.nube(44)],
    carteles: [['PILAR', '23 KM'], ['ZARATE', '61 KM'], ['ESCOBAR', '12 KM'], ['CAMPANA', '48 KM'], ['ROSARIO', '290 KM'], ['PANAMERICANA', 'KM 45']].map(([a, b]) => ART.cartel(a, b)),
  };
  return A;
}

// Cielo de atardecer en franjas con tramado, sol y la pampa a lo lejos (no cambia: la ruta es recta).
function paintSky(g, W, horizon) {
  const p = painter(g, W);
  const band = horizon / SKY.length;
  SKY.forEach((col, i) => {
    const y0 = Math.round(i * band), y1 = Math.round((i + 1) * band);
    p.rect(0, y0, W, y1 - y0, col);
    if (i + 1 < SKY.length) for (let x = (y1 - 1) % 2; x < W; x += 2) p.px(x, y1 - 1, SKY[i + 1]);
  });
  p.oval(W / 2 - 11, horizon - 26, 22, 22, '#ffd98a');
  p.oval(W / 2 - 7, horizon - 22, 14, 14, '#fff1c4');
  const r = mulberry32(11);
  for (let x = -6; x < W + 6;) {
    if (r() < 0.25) { x += 6 + r() * 14; continue; }
    const w = 8 + r() * 18, h = 2 + Math.round(r() * 5);
    p.oval(x, horizon - h, w, h * 2, '#2f4a33');
    p.oval(x + w * 0.25, horizon - h, w * 0.4, 2, '#3f5f3a');
    x += w * 0.7;
  }
  const sx = Math.round(W * 0.8);
  for (let i = 0; i < 3; i++) { p.rect(sx + i * 5, horizon - 11, 4, 11, '#a7adb5'); p.oval(sx + i * 5, horizon - 13, 4, 4, '#c9ced6'); }
  const mx = Math.round(W * 0.18);
  p.line(mx - 2, horizon, mx, horizon - 12, '#3a3f45'); p.line(mx + 2, horizon, mx, horizon - 12, '#3a3f45');
  p.oval(mx - 3, horizon - 16, 7, 7, '#5a5f66');
  p.rect(0, horizon, W, 1, '#3f5f3a');
}

export default {
  id: 'fitito',
  name: 'El Fitito en la Panamericana',
  tagline: 'Esquivá el tráfico y los baches',
  threshold: 3,
  rules: [
    'Manejás un Fiat 600 atado con alambre por la Panamericana. Acelera solo.',
    'Hay 3 carriles. Tocá el lado izquierdo o derecho de la pantalla: cada toque te mueve un carril.',
    'Vienen autos y camiones de frente, a veces dos juntos: siempre queda un carril libre.',
    'Los baches gigantes te vuelan la suspensión.',
    'Cada cuadra recorrida suma 1 punto. Cuanto más lejos, más rápido.',
  ],
  icon(c, s) {
    const L = 80, lo = document.createElement('canvas');
    lo.width = lo.height = L;
    const g = lo.getContext('2d'), p = painter(g, L), hz = 34;
    paintSky(g, L, hz);
    for (let y = hz + 1; y < L; y++) {
      const t = (y - hz) / (L - hz), half = 3 + t * 46;
      p.rect(0, y, L, 1, y % 6 < 3 ? COLORS.light.grass : COLORS.dark.grass);
      p.rect(L / 2 - half * 1.17, y, half * 2.34, 1, y % 6 < 3 ? COLORS.light.rumble : COLORS.dark.rumble);
      p.rect(L / 2 - half, y, half * 2, 1, COLORS.light.road);
    }
    const f = getCustom('fitito') || art().fitito;
    g.drawImage(f, Math.round((L - f.width) / 2), L - f.height - 2);
    c.imageSmoothingEnabled = false;
    c.drawImage(lo, 0, 0, s, s);
  },

  mount(el, { seed, onScore, onEnd }) {
    const st = makeCanvas(el), ctx = st.ctx, rng = mulberry32(seed);
    const pill = overlay(el, 'g-pill', 'Tocá un costado para cambiar de carril');
    const toast = overlay(el, 'g-toast');
    const SPR = art();

    // Ruta recta: solo cambian los colores de las franjas y lo que hay al costado.
    // El paisaje usa su propio azar, así no cambia el tráfico.
    const segs = Array.from({ length: N }, (_, i) => ({ sprites: [], color: Math.floor(i / RUMBLE) % 2 ? COLORS.dark : COLORS.light }));
    const srng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    const put = (i, img, x, k = 1, extra = {}) => segs[i % N].sprites.push({ img, x, w: img.width * PXW * k, ...extra });
    const pick = list => list[Math.floor(srng() * list.length)];
    for (let i = 0; i < N; i += 4) { put(i, SPR.post, -1.9, 2.2, { fence: -1 }); put(i, SPR.post, 1.9, 2.2, { fence: 1 }); }
    for (let i = 10; i < N; i += 25) put(i, SPR.poste, -1.45, 2.4);
    for (let i = 6; i < N; i += 3 + Math.floor(srng() * 6)) {
      const side = srng() < 0.5 ? -1 : 1, r = srng();
      if (r < 0.4) put(i, SPR.euca, side * (2.2 + srng() * 1.6), 2.6);
      else if (r < 0.56) { const n = 1 + Math.floor(srng() * 3); for (let k = 0; k < n; k++) put(i + k * 2, pick(SPR.vacas), side * (2.4 + srng() * 2), 1.6); }
      else if (r < 0.64) put(i, pick(SPR.carteles), 1.5, 1.8);
      else if (r < 0.69) put(i, SPR.gauchito, side * 1.45, 1.6);
      else if (r < 0.74) put(i, SPR.parrilla, side * 1.65, 2);
      else if (r < 0.79) put(i, pick(SPR.puestos), side * 1.6, 1.8);
      else if (r < 0.83) put(i, SPR.molino, side * (3 + srng() * 2), 2.4);
      else if (r < 0.85) put(i, SPR.ypf, 2.45, 2.2);
    }
    for (let i = 300; i < N; i += 1500) segs[i].sprites.push({ img: SPR.peaje, x: 0, w: 2.9 });

    const S = {
      pos: 0, speed: 0, lane: 1, x: 0, started: false, alive: true,
      obstacles: [], nextObs: SEG * 50, shake: 0, crash: null, cuadras: 0,
    };
    let endTimer = 0;
    const PLAYER_Z = CAM_H * DEPTH;
    // Todo el tráfico (autos y pozos) avanza hacia el auto a la misma velocidad, en filas rígidas:
    // la distancia entre filas no cambia nunca, así la regla de "siempre un carril libre" es exacta.
    const CAR_V = MAX_SPEED * 0.15;
    const SAFE_Z = SEG * 24;         // filas más cerca que esto cuentan como una sola para tapar carriles
    const laneX = l => -1 + (2 * l + 1) / LANES;
    const report = () => onScore(S.cuadras, `Cuadras · ${Math.round(S.speed / MAX_SPEED * 140)} km/h`);

    // Fila nueva de 1 o 2 obstáculos. Nunca deja los 3 carriles tapados: ni sola, ni junto con
    // otra fila (de pozos o de autos) que venga pegada.
    function spawnRow() {
      const level = Math.min(1, S.cuadras / 50);
      const z = S.pos + PLAYER_Z + SEG * DRAW * 0.95;
      const baches = rng() < 0.3;
      const v = CAR_V;
      const near = new Set(S.obstacles.filter(o => Math.abs(o.z - z) < SAFE_Z).map(o => o.lane));
      const want = rng() < 0.4 + level * 0.3 ? 2 : 1;
      const combos = want === 2 ? [[0, 1], [1, 2], [0, 2]] : [[0], [1], [2]];
      for (let i = combos.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [combos[i], combos[j]] = [combos[j], combos[i]]; }
      let lanes = combos.find(c => new Set([...near, ...c]).size <= 2);
      if (!lanes) lanes = [0, 1, 2].filter(l => near.has(l)).slice(0, 1);
      for (const lane of lanes) {
        if (baches) S.obstacles.push({ kind: 'bache', lane, z, x: laneX(lane) + (rng() - 0.5) * 0.16, w: 0.5, v, img: SPR.baches[(lane + S.cuadras) % SPR.baches.length] });
        else {
          const truck = rng() < 0.18;
          S.obstacles.push({
            kind: truck ? 'camion' : 'auto', lane, z, x: laneX(lane), w: truck ? 0.5 : 0.36, v,
            img: truck ? SPR.truck : SPR.cars[Math.floor(rng() * SPR.cars.length)],
          });
        }
      }
      S.nextObs = SEG * (20 - level * 8) * (0.8 + rng() * 0.4);
    }

    function die(kind) {
      S.alive = false; S.shake = 1; S.crash = { kind, t: 0 };
      audio.lose(); buzz(kind === 'bache' ? [80, 40, 120] : [60, 40, 90]);
      report();
      const title = { bache: '¡Volaste la suspensión!', camion: '¡Te comiste un camión!' }[kind] || '¡Choque de frente!';
      endTimer = setTimeout(() => onEnd(S.cuadras, { title }), 1100);
    }

    function update(dt) {
      if (!S.started || !S.alive) return;
      const sec = dt / 1000;
      const prevPz = S.pos + PLAYER_Z;
      const top = MAX_SPEED * Math.min(1, 0.5 + S.cuadras * 0.008);
      S.speed = Math.min(top, S.speed + MAX_SPEED * 0.35 * sec);
      S.pos += S.speed * sec;
      // el auto va al centro de su carril en un instante (cambio de carril de ~0,12 s)
      const tx = laneX(S.lane), step = sec * 6;
      S.x = Math.abs(tx - S.x) <= step ? tx : S.x + Math.sign(tx - S.x) * step;

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

    // Lienzo chico donde se dibuja todo; se rehace si cambia el tamaño de la pantalla.
    const lo = document.createElement('canvas');
    const g = lo.getContext('2d'), P = painter(g);
    const sky = document.createElement('canvas');
    let pd = 1, W = 0, H = 0, horizon = 0;
    function fit() {
      pd = Math.max(1, Math.round(st.cv.width / LOW_W));
      const w = Math.ceil(st.cv.width / pd), h = Math.ceil(st.cv.height / pd);
      if (w === W && h === H) return;
      W = lo.width = w; H = lo.height = h;
      horizon = Math.round(H * 0.4);
      sky.width = W; sky.height = horizon + 1;
      paintSky(sky.getContext('2d'), W, horizon);
    }

    function draw(dt, now) {
      fit();
      g.imageSmoothingEnabled = false;
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (S.shake > 0) {
        g.setTransform(1, 0, 0, 1, Math.round((Math.random() - 0.5) * S.shake * 7), Math.round((Math.random() - 0.5) * S.shake * 5));
        S.shake = Math.max(0, S.shake - dt / 700);
      }
      g.drawImage(sky, 0, 0);
      SPR.nubes.forEach((n, i) => {
        const span = W + n.width * 2;
        const x = ((i * 83 + now * 0.002 * (i + 1)) % span) - n.width;
        g.drawImage(n, Math.round(x), Math.round(horizon * (0.12 + i * 0.17)));
      });

      // piso y ruta, renglón por renglón
      const camX = S.x * ROAD, scaleY = H - horizon, far = SEG * DRAW;
      for (let y = horizon + 1; y < H + 8; y++) {
        const cz = DEPTH * CAM_H * scaleY / (y + 0.5 - horizon);
        const sc = DEPTH / cz;
        const col = cz > far ? COLORS.dark : segs[Math.floor((S.pos + cz) / SEG) % N].color;
        const half = sc * ROAD * W / 2, cx = W / 2 - sc * camX * W / 2;
        P.rect(0, y, W, 1, col.grass);
        P.rect(cx - half * 1.45, y, half * 2.9, 1, col.dirt);
        P.rect(cx - half * 1.17, y, half * 2.34, 1, col.rumble);
        P.rect(cx - half, y, half * 2, 1, col.road);
        if (col.lane && cz <= far) {
          const lw = Math.max(0.5, half / 40);
          for (let k = 1; k < LANES; k++) P.rect(cx + half * (-1 + 2 * k / LANES) - lw, y, Math.max(1, lw * 2), 1, col.lane);
        }
      }

      // objetos de atrás hacia adelante
      const project = (wx, z) => {
        const cz = z - S.pos, sc = DEPTH / cz;
        return { x: W / 2 + sc * (wx * ROAD - camX) * W / 2, y: horizon + sc * CAM_H * scaleY, w: sc * ROAD * W / 2 };
      };
      const baseIdx = Math.floor(S.pos / SEG);
      const wires = {};
      for (let n = DRAW - 1; n > 0; n--) {
        const idx = baseIdx + n, z0 = idx * SEG;
        if (z0 - S.pos <= SEG) continue;
        const pr = project(0, z0);
        for (const sp of segs[idx % N].sprites) {
          const r = drawSprite(sp.img, pr, sp.x, sp.w);
          if (sp.fence && r) {
            const top = { x: r.x + r.w / 2, a: r.y + r.h * 0.1, b: r.y + r.h * 0.5 }, prev = wires[sp.fence];
            if (prev) { P.line(prev.x, prev.a, top.x, top.a, '#8a8f95'); P.line(prev.x, prev.b, top.x, top.b, '#8a8f95'); }
            wires[sp.fence] = top;
          }
        }
        for (const o of S.obstacles) {
          if (Math.floor(o.z / SEG) !== idx) continue;
          const p = project(0, o.z);
          drawSprite(o.img, p, o.x, o.img.width * PXW);
        }
      }

      // el Fitito
      const img = getCustom('fitito') || SPR.fitito, fw = img.width, fh = img.height, ground = H - Math.round(H * 0.03);
      let cy = ground - fh, rot = 0;
      const moving = S.alive && S.started;
      if (moving && Math.sin(now / 45) > 0.4) cy -= 1;
      if (S.crash) {
        S.crash.t += dt;
        const t = Math.min(1, S.crash.t / 700);
        if (S.crash.kind === 'bache') { cy -= Math.sin(t * Math.PI) * H * 0.18; rot = t * 0.6; }
        else rot = Math.sin(S.crash.t / 50) * 0.08;
      }
      P.oval(W / 2 - fw * 0.5, ground - 3, fw, 5, 'rgba(0,0,0,.35)');
      g.save();
      g.translate(Math.round(W / 2), Math.round(cy + fh / 2));
      if (rot) g.rotate(rot);
      g.drawImage(img, -Math.round(fw / 2), -Math.round(fh / 2));
      g.restore();

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(lo, 0, 0, W * pd, H * pd);
    }

    function drawSprite(img, p, offX, worldW) {
      const dw = Math.round(worldW * p.w), dh = Math.round(worldW * p.w * img.height / img.width);
      if (dw < 1 || dh < 1) return null;
      const x = Math.round(p.x + offX * p.w - dw / 2), y = Math.round(p.y - dh);
      if (x > W || x + dw < 0 || y > H) return null;
      g.drawImage(img, x, y, dw, dh);
      return { x, y, w: dw, h: dh };
    }

    // Controles: cada toque en un costado de la pantalla mueve un carril (flechas o A-D en compu).
    function move(dir) {
      if (!S.alive) return;
      if (!S.started) { S.started = true; pill.hidden = true; }
      const lane = Math.max(0, Math.min(LANES - 1, S.lane + dir));
      if (lane !== S.lane) { S.lane = lane; audio.tone(dir < 0 ? 330 : 392, 0.05, 'square', 0.06); buzz(8); }
    }
    const unbind = bindInput(el, {
      onDown: p => move(p.key ? 0 : p.x < p.w / 2 ? -1 : 1),
      onSwipe: d => { if (d.x) move(d.x); else move(0); },
    });

    report();
    const stop = startLoop((dt, now) => { update(dt); draw(dt, now); });

    return {
      destroy() { stop(); unbind(); clearTimeout(endTimer); st.destroy(); pill.remove(); toast.remove(); },
      _state: S, _update: update, _move: move, _draw: draw,
    };
  },
};
