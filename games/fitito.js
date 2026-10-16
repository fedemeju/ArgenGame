import { makeCanvas, startLoop, bindInput, mulberry32, audio, buzz, overlay, flash, rrect } from '../js/engine.js';
import { getCustom } from '../js/art.js';

// El Fitito en la Panamericana, en 2.5D: el mundo es 3D (x al costado, y para arriba, z hacia adelante) y se ve
// con una cámara de persecución atrás del auto. Hay bruma de atardecer: el tráfico aparece saliendo de la niebla,
// así no se puede ver a lo lejos y adivinar todo de antemano.
const SEG = 200;            // largo de cada segmento
const N = 6000;             // segmentos de la ruta (se repite)
const ROAD = 2000;          // medio ancho de la calle en unidades del mundo
const CAM_H = 1150;
const DEPTH = 1 / Math.tan((100 / 2) * Math.PI / 180);
const DRAW = 180;           // segmentos donde aparece el tráfico
const MAX_SPEED = SEG * 60; // unidades por segundo
const CUADRA = 8000;        // 100 m de juego
const LANES = 3;
const CAR_W = 0.34;         // ancho del Fitito en medios-anchos de calle

// cámara y bruma (M = un metro en unidades del mundo)
const M = ROAD / 5.5;
const CAM_BACK = 4.2 * M, NEAR = 0.6 * M, FOG0 = 20 * M, FOG1 = 50 * M;
const FOG = '#f3c9a2';

// autos clásicos: color de carrocería, ancho del techo, dónde empieza y termina la cabina, faros
const CARS = [
  { name: 'falcon', body: '#2c5aa0', side: '#1f4078', top: '#3a6cb8', cab: 0.86, cz: [0.36, 0.74], luz: 'cuadrado' },
  { name: 'r12', body: '#d9822b', side: '#a85f1a', top: '#e8964a', cab: 0.8, cz: [0.33, 0.76], luz: 'ancho' },
  { name: '504', body: '#b8322a', side: '#86231d', top: '#cc463d', cab: 0.82, cz: [0.35, 0.75], luz: 'triste' },
  { name: 'torino', body: '#e0b12b', side: '#a8821a', top: '#f0c444', cab: 0.88, cz: [0.4, 0.78], luz: 'cuatro' },
];
const PLACES = [['PILAR', '23 km'], ['ZÁRATE', '61 km'], ['ESCOBAR', '12 km'], ['CAMPANA', '48 km'], ['ROSARIO', '290 km'], ['TIGRE', '8 km']];

export default {
  id: 'fitito',
  name: 'El Fitito en la Panamericana',
  tagline: 'Esquivá el tráfico y los baches',
  threshold: 3,
  rules: [
    'Manejás un Fiat 600 atado con alambre por la Panamericana. Acelera solo.',
    'Hay 3 carriles. Tocá el lado izquierdo o derecho de la pantalla: cada toque te mueve un carril.',
    'Vienen autos y camiones de frente, a veces dos juntos: siempre queda un carril libre.',
    'Hay bruma: el tráfico aparece de golpe, así que atento.',
    'Los baches gigantes te vuelan la suspensión.',
    'Cada cuadra recorrida suma 1 punto. Cuanto más lejos, más rápido.',
  ],
  icon(c, s) {
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#3a5a8f'); g.addColorStop(0.42, '#f4a97c'); g.addColorStop(0.5, FOG); g.addColorStop(0.52, '#7d9a55'); g.addColorStop(1, '#4f7a35');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    c.fillStyle = '#4a4d53';
    c.beginPath(); c.moveTo(s * 0.47, s * 0.5); c.lineTo(s * 0.53, s * 0.5); c.lineTo(s * 1.05, s); c.lineTo(-s * 0.05, s); c.closePath(); c.fill();
    c.save(); c.translate(s * 0.5, s * 0.95); c.scale(s * 0.32, -s * 0.32); paintFitito(c, 0); c.restore();
  },

  mount(el, { seed, onScore, onEnd }) {
    const st = makeCanvas(el), ctx = st.ctx, rng = mulberry32(seed);
    const pill = overlay(el, 'g-pill', 'Tocá un costado para cambiar de carril');
    const toast = overlay(el, 'g-toast');

    // Paisaje: por segmento, con su propio azar (no cambia el tráfico).
    const segs = Array.from({ length: N }, () => []);
    const srng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    const pick = list => list[Math.floor(srng() * list.length)];
    for (let i = 0; i < N; i += 70) segs[i].push({ t: 'poste', x: (i / 70) % 2 ? 1.45 * ROAD : -1.45 * ROAD });
    for (let i = 4; i < N; i += 2 + Math.floor(srng() * 5)) {
      const side = srng() < 0.5 ? -1 : 1, r = srng();
      if (r < 0.45) segs[i].push({ t: 'euca', x: side * ROAD * (1.7 + srng() * 2.2), h: 9 + srng() * 6, k: srng() });
      else if (r < 0.58) segs[i].push({ t: 'vaca', x: side * ROAD * (1.9 + srng() * 2.5), dir: srng() < 0.5 ? -1 : 1, pasta: srng() < 0.5 });
      else if (r < 0.63) segs[i].push({ t: 'cartel', x: 1.55 * ROAD, txt: pick(PLACES) });
      else if (r < 0.67) segs[i].push({ t: 'gauchito', x: side * 1.6 * ROAD });
      else if (r < 0.71) segs[i].push({ t: 'parrilla', x: side * 1.85 * ROAD });
      else if (r < 0.75) segs[i].push({ t: 'molino', x: side * ROAD * (3 + srng() * 2.5) });
      else if (r < 0.765) segs[i].push({ t: 'ypf', x: 2.3 * ROAD });
    }
    for (let i = 150; i < N; i += 420) segs[i].push({ t: 'portico', txt: pick(PLACES) });
    for (let i = 300; i < N; i += 1500) segs[i].push({ t: 'peaje' });

    const S = {
      pos: 0, speed: 0, lane: 1, x: 0, started: false, alive: true,
      obstacles: [], nextObs: SEG * 50, shake: 0, crash: null, cuadras: 0, smoke: [], smokeT: 0,
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
        if (baches) S.obstacles.push({ kind: 'bache', lane, z, x: laneX(lane) + (rng() - 0.5) * 0.16, w: 0.5, v, variant: (lane + S.cuadras) % 2 });
        else {
          const truck = rng() < 0.18;
          S.obstacles.push({ kind: truck ? 'camion' : 'auto', lane, z, x: laneX(lane), w: truck ? 0.5 : 0.36, v, model: Math.floor(rng() * CARS.length) });
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
      const sec = dt / 1000;
      S.smoke.forEach(p => { p.t += sec; p.y += 0.4 * M * sec; p.x += p.vx * sec; p.dz -= 0.8 * M * sec; });
      S.smoke = S.smoke.filter(p => p.t < 0.5);
      if (!S.started || !S.alive) return;
      const prevPz = S.pos + PLAYER_Z;
      const top = MAX_SPEED * Math.min(1, 0.5 + S.cuadras * 0.008);
      S.speed = Math.min(top, S.speed + MAX_SPEED * 0.35 * sec);
      S.pos += S.speed * sec;
      // el auto va al centro de su carril en un instante (cambio de carril de ~0,12 s)
      const tx = laneX(S.lane), step = sec * 6;
      S.x = Math.abs(tx - S.x) <= step ? tx : S.x + Math.sign(tx - S.x) * step;
      // humito del caño de escape
      S.smokeT -= sec;
      if (S.smokeT <= 0) { S.smokeT = 0.07; S.smoke.push({ x: S.x * ROAD - 0.45 * M, y: 0.3 * M, dz: -0.2 * M, vx: (Math.random() - 0.5) * M, t: 0 }); } // dz: atrás del auto

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

    /* ---------- cámara y ayudas de dibujo ---------- */
    let W = 1, H = 1, F = 1, yh = 0, camX = 0, camY = 1, camZ = 0;
    const P = (x, y, z) => { const d = Math.max(1, z - camZ); return [W / 2 + (x - camX) * F / d, yh + (camY - y) * F / d]; };
    const K = z => F / Math.max(1, z - camZ);
    const fogOf = z => Math.max(0, Math.min(1, (z - camZ - FOG0) / (FOG1 - FOG0)));
    const poly = (pts, fill) => {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    };
    const ellipse = (x, y, rx, ry, fill) => { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); };
    // caja en perspectiva: frente (z0), tapa y el costado que mira a la cámara
    function box(x0, x1, y0, y1, z0, z1, c) {
      if (z0 - camZ < NEAR) return null;
      if (x1 < camX) poly([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], c.side);
      else if (x0 > camX) poly([P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)], c.side);
      if (y1 < camY) poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], c.top);
      const a = P(x0, y1, z0), b = P(x1, y0, z0);
      ctx.fillStyle = c.front; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      return { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] };
    }
    // rectángulo en un plano de frente (z fijo), en coordenadas del mundo
    const face = (x0, y0, x1, y1, z, fill) => { const a = P(x0, y1, z), b = P(x1, y0, z); ctx.fillStyle = fill; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); return [a, b]; };
    const glow = (x, y, r, rgb, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const text = (str, x, y, size, fill, weight = 900) => {
      if (size < 4) return;
      ctx.font = `${weight} ${Math.round(size)}px Chivo, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = fill; ctx.fillText(str, x, y);
    };

    /* ---------- cielo, ruta y bruma ---------- */
    function drawSky(now) {
      const g = ctx.createLinearGradient(0, 0, 0, yh);
      g.addColorStop(0, '#34548a'); g.addColorStop(0.5, '#b88ea2'); g.addColorStop(0.85, '#f2ab80'); g.addColorStop(1, FOG);
      ctx.fillStyle = g; ctx.fillRect(-30, -30, W + 60, yh + 31);
      const sx = W / 2 + Math.sin(now * 0.00005) * 4, sy = yh - H * 0.05, r = Math.min(W, H) * 0.08;
      glow(sx, sy, r * 6, '255,226,170', 0.55);
      const sg = ctx.createRadialGradient(sx - r * 0.2, sy - r * 0.2, 0, sx, sy, r);
      sg.addColorStop(0, '#fffbe8'); sg.addColorStop(1, '#ffcf80');
      ellipse(sx, sy, r, r, sg);
      for (let i = 0; i < 4; i++) {
        const span = W * 1.8, x = ((i * 0.43 * span - now * 0.006 * (i + 1)) % span + span) % span - W * 0.4;
        const y = yh * (0.12 + i * 0.15), k = Math.min(W, H) * (0.08 + i * 0.012);
        ellipse(x, y + k * 0.25, k * 1.9, k * 0.35, 'rgba(214,140,150,.25)');
        ellipse(x - k * 0.6, y, k * 0.8, k * 0.38, 'rgba(255,232,222,.65)');
        ellipse(x + k * 0.3, y - k * 0.12, k * 0.95, k * 0.5, 'rgba(255,238,228,.7)');
        ellipse(x + k * 1.1, y + k * 0.05, k * 0.6, k * 0.3, 'rgba(255,232,222,.65)');
      }
    }

    function drawGround() {
      const zN = camZ + NEAR, zF = camZ + FOG1 * 1.1;
      const g = ctx.createLinearGradient(0, yh, 0, H);
      g.addColorStop(0, '#9fae6a'); g.addColorStop(0.3, '#7b9a4f'); g.addColorStop(1, '#4b7631');
      ctx.fillStyle = g; ctx.fillRect(-30, yh, W + 60, H - yh + 30);
      // surcos del campo
      ctx.strokeStyle = 'rgba(60,80,30,.18)'; ctx.lineWidth = 1;
      for (let k = 0; k < 14; k++) for (const s of [-1, 1]) {
        const x = s * (1.7 * ROAD + k * 3 * M), a = P(x, 0, zN), b = P(x, 0, zF);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      // banquina y asfalto
      poly([P(-1.3 * ROAD, 0, zN), P(1.3 * ROAD, 0, zN), P(1.3 * ROAD, 0, zF), P(-1.3 * ROAD, 0, zF)], '#6f7076');
      const ag = ctx.createLinearGradient(0, yh, 0, H);
      ag.addColorStop(0, '#6a6c72'); ag.addColorStop(1, '#3f4247');
      poly([P(-ROAD, 0, zN), P(ROAD, 0, zN), P(ROAD, 0, zF), P(-ROAD, 0, zF)], ag);
      // parches de asfalto (dan sensación de velocidad)
      const blk = 9 * M;
      for (let b = Math.floor(zN / blk); b * blk < zF; b++) {
        const h = Math.abs(Math.imul(b, 2654435761) >>> 0);
        if (h % 3) continue;
        const x = laneX(h % 3) * ROAD + ((h >> 4) % 100 - 50) * 4, z0 = Math.max(zN, b * blk), z1 = Math.min(zF, b * blk + 2.5 * M);
        if (z1 > z0) poly([P(x - 0.8 * M, 0, z0), P(x + 0.8 * M, 0, z0), P(x + 0.8 * M, 0, z1), P(x - 0.8 * M, 0, z1)], 'rgba(20,20,24,.18)');
      }
      // líneas de borde y punteadas
      for (const s of [-1, 1]) {
        const x0 = s * (ROAD - 0.25 * M), x1 = s * (ROAD - 0.1 * M);
        poly([P(x0, 0, zN), P(x1, 0, zN), P(x1, 0, zF), P(x0, 0, zF)], '#e9e6dc');
      }
      const per = 12 * M;
      for (let k = Math.floor(zN / per); k * per < zF; k++) {
        const z0 = Math.max(zN, k * per), z1 = Math.min(zF, k * per + 3 * M);
        if (z1 <= z0) continue;
        for (const x of [-ROAD / 3, ROAD / 3]) poly([P(x - 0.07 * M, 0, z0), P(x + 0.07 * M, 0, z0), P(x + 0.07 * M, 0, z1), P(x - 0.07 * M, 0, z1)], '#f2efe6');
      }
      // guardarraíl a los dos lados, con postes cada 4 m
      for (const s of [-1, 1]) {
        const x = s * 1.36 * ROAD;
        for (let k = Math.floor(zF / (4 * M)); k * 4 * M > zN; k--) box(x - 0.06 * M, x + 0.06 * M, 0, 0.75 * M, k * 4 * M, k * 4 * M + 0.12 * M, { front: '#7b8088', side: '#5d6168', top: '#9aa0a8' });
        poly([P(x, 0.5 * M, zN), P(x, 0.8 * M, zN), P(x, 0.8 * M, zF), P(x, 0.5 * M, zF)], '#c3c8ce');
        poly([P(x, 0.5 * M, zN), P(x, 0.58 * M, zN), P(x, 0.58 * M, zF), P(x, 0.5 * M, zF)], '#8d939b');
      }
      // bruma sobre el piso lejano
      const y1 = P(0, 0, camZ + FOG1)[1], y0 = P(0, 0, camZ + FOG0)[1];
      const fg = ctx.createLinearGradient(0, yh, 0, y0);
      fg.addColorStop(0, FOG); fg.addColorStop(Math.max(0, Math.min(1, (y1 - yh) / (y0 - yh))), FOG); fg.addColorStop(1, 'rgba(243,201,162,0)');
      ctx.fillStyle = fg; ctx.fillRect(-30, yh - 2, W + 60, y0 - yh + 2);
    }

    /* ---------- paisaje ---------- */
    function drawItem(it, z, now) {
      const k = K(z), [bx, by] = P(it.x || 0, 0, z);
      switch (it.t) {
        case 'euca': {
          ellipse(bx + 0.8 * M * k, by, 2.2 * M * k, 0.5 * M * k, 'rgba(40,50,20,.2)');
          const h = it.h * M * k, tw = 0.35 * M * k;
          const tg = ctx.createLinearGradient(bx - tw, 0, bx + tw, 0);
          tg.addColorStop(0, '#e2d8c8'); tg.addColorStop(1, '#9b917f');
          ctx.fillStyle = tg; ctx.fillRect(bx - tw / 2, by - h * 0.75, tw, h * 0.75);
          const blobs = [[0, 0.78, 1.6], [-0.9, 0.62, 1.2], [0.9, 0.66, 1.25], [0.2, 0.95, 1.2], [-0.4, 0.45, 0.9], [0.6, 0.5, 0.9]];
          for (const [dx, dy, r] of blobs) {
            const cx = bx + dx * M * k * (1 + it.k * 0.3), cy = by - h * dy, rr = r * M * k * (1 + it.k * 0.4);
            const g = ctx.createRadialGradient(cx - rr * 0.4, cy - rr * 0.4, rr * 0.1, cx, cy, rr);
            g.addColorStop(0, '#9cbf95'); g.addColorStop(0.5, '#5f8a62'); g.addColorStop(1, '#3a5c40');
            ellipse(cx, cy, rr, rr * 1.15, g);
          }
          break;
        }
        case 'poste': {
          const s = Math.sign(it.x), top = P(it.x, 9 * M, z), arm = P(it.x - s * 2.6 * M, 9 * M, z);
          ctx.strokeStyle = '#8d939b'; ctx.lineWidth = Math.max(1, 0.18 * M * k);
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(top[0], top[1]); ctx.lineTo(arm[0], arm[1]); ctx.stroke();
          ellipse(arm[0], arm[1] + 0.1 * M * k, 0.4 * M * k, 0.12 * M * k, '#ffe7b0');
          glow(arm[0], arm[1], 2.2 * M * k, '255,214,150', 0.35);
          break;
        }
        case 'cartel': {
          const [p0, p1] = [P(it.x - 1.2 * M, 0, z), P(it.x + 1.2 * M, 0, z)];
          ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = Math.max(1, 0.12 * M * k);
          for (const p of [p0, p1]) { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], P(0, 2.2 * M, z)[1]); ctx.stroke(); }
          box(it.x - 1.8 * M, it.x + 1.8 * M, 2 * M, 3.8 * M, z, z + 0.15 * M, { front: '#1f7a4a', side: '#16603a', top: '#2a8d58' });
          const [a, b] = [P(it.x - 1.8 * M, 3.8 * M, z), P(it.x + 1.8 * M, 2 * M, z)];
          ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = Math.max(1, 0.08 * M * k); ctx.strokeRect(a[0] + 0.12 * M * k, a[1] + 0.12 * M * k, b[0] - a[0] - 0.24 * M * k, b[1] - a[1] - 0.24 * M * k);
          text(it.txt[0], (a[0] + b[0]) / 2, a[1] + (b[1] - a[1]) * 0.36, 0.55 * M * k, '#fff');
          text(it.txt[1], (a[0] + b[0]) / 2, a[1] + (b[1] - a[1]) * 0.7, 0.45 * M * k, '#fff', 700);
          break;
        }
        case 'portico': {
          const c = { front: '#9aa0a8', side: '#7b8088', top: '#b9bfc6' };
          for (const s of [-1, 1]) box(s * 1.38 * ROAD - 0.15 * M, s * 1.38 * ROAD + 0.15 * M, 0, 7 * M, z, z + 0.3 * M, c);
          box(-1.38 * ROAD, 1.38 * ROAD, 6.6 * M, 7 * M, z, z + 0.3 * M, c);
          const r = box(-0.85 * ROAD, 0.85 * ROAD, 4.6 * M, 6.6 * M, z - 0.05 * M, z + 0.1 * M, { front: '#1f7a4a', side: '#16603a', top: '#2a8d58' });
          if (r) {
            text(`${it.txt[0]}  ${it.txt[1]}`, r.x + r.w / 2, r.y + r.h * 0.35, 0.65 * M * k, '#fff');
            text('PANAMERICANA · RN 9', r.x + r.w / 2, r.y + r.h * 0.72, 0.42 * M * k, '#fff', 700);
          }
          break;
        }
        case 'gauchito': {
          const x = it.x, red = { front: '#c62020', side: '#951616', top: '#d83a3a' };
          for (const dx of [-1.1, 1.1]) {
            const p = P(x + dx * M, 0, z), q = P(x + dx * M, 2.6 * M, z);
            ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = Math.max(1, 0.06 * M * k); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
            const f = Math.sin(now * 0.006 + dx) * 0.15 * M * k;
            poly([q, [q[0] + 0.9 * M * k * Math.sign(-dx), q[1] + 0.25 * M * k + f], [q[0], q[1] + 0.55 * M * k]], '#e02424');
          }
          box(x - 0.5 * M, x + 0.5 * M, 0, 0.9 * M, z, z + 0.8 * M, red);
          poly([P(x - 0.62 * M, 0.9 * M, z), P(x + 0.62 * M, 0.9 * M, z), P(x, 1.45 * M, z)], '#8f1414');
          const [a, b] = face(x - 0.22 * M, 0.15 * M, x + 0.22 * M, 0.65 * M, z - 1, '#3a0d0d');
          glow((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.5 * M * k, '255,200,90', 0.6);
          break;
        }
        case 'parrilla': {
          const x = it.x, s = Math.sign(it.x);
          box(x - 1.6 * M, x + 1.6 * M, 0, 1.1 * M, z, z + 1.4 * M, { front: '#9a6b3e', side: '#7a5230', top: '#b8865a' });
          box(x - 1.9 * M, x + 1.9 * M, 2.3 * M, 2.45 * M, z - 0.3 * M, z + 1.8 * M, { front: '#8d949c', side: '#6d747c', top: '#a9b0b8' });
          ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = Math.max(1, 0.08 * M * k);
          for (const dx of [-1.7, 1.7]) { const p = P(x + dx * M, 1.1 * M, z - 0.2 * M), q = P(x + dx * M, 2.3 * M, z - 0.2 * M); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
          const r = box(x - 1.3 * M, x + 1.3 * M, 2.45 * M, 3.1 * M, z - 0.3 * M, z - 0.2 * M, { front: '#f4ead0', side: '#d8ccaf', top: '#fff8e4' });
          if (r) text('CHORIPÁN', r.x + r.w / 2, r.y + r.h / 2, 0.42 * M * k, '#c0392b');
          const gx = x - s * 2.6 * M;
          box(gx - 0.45 * M, gx + 0.45 * M, 0.5 * M, 1.0 * M, z, z + 0.7 * M, { front: '#2e3136', side: '#222', top: '#ff8c2a' });
          for (let i = 0; i < 4; i++) {
            const t = ((now * 0.0006 + i * 0.25) % 1), p = P(gx + Math.sin(t * 6 + i) * 0.3 * M, (1.1 + t * 2.4) * M, z + 0.3 * M);
            ellipse(p[0], p[1], (0.3 + t * 0.5) * M * k, (0.25 + t * 0.4) * M * k, `rgba(225,225,228,${0.55 * (1 - t)})`);
          }
          break;
        }
        case 'vaca': drawVaca(bx, by, k * M, it); break;
        case 'molino': {
          const h = 9 * M * k;
          ctx.strokeStyle = '#7d848c'; ctx.lineWidth = Math.max(1, 0.1 * M * k);
          ctx.beginPath(); ctx.moveTo(bx - 1.2 * M * k, by); ctx.lineTo(bx - 0.15 * M * k, by - h); ctx.moveTo(bx + 1.2 * M * k, by); ctx.lineTo(bx + 0.15 * M * k, by - h);
          for (let i = 1; i < 5; i++) { const y = by - h * i / 5, w = (1.2 - 1.05 * i / 5) * M * k; ctx.moveTo(bx - w, y); ctx.lineTo(bx + w, y); }
          ctx.stroke();
          const cy = by - h - 0.4 * M * k, rr = 1.6 * M * k, rot = now * 0.002;
          ctx.strokeStyle = '#b7bcc2'; ctx.lineWidth = Math.max(1, 0.12 * M * k);
          for (let i = 0; i < 12; i++) { const a = rot + i * Math.PI / 6; ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * rr * 0.25, cy + Math.sin(a) * rr * 0.25); ctx.lineTo(bx + Math.cos(a) * rr, cy + Math.sin(a) * rr); ctx.stroke(); }
          ellipse(bx, cy, 0.25 * M * k, 0.25 * M * k, '#5a5f66');
          break;
        }
        case 'ypf': {
          const x = it.x, blue = { front: '#1c4fa0', side: '#153c7a', top: '#2a62bb' };
          box(x + 1 * M, x + 7 * M, 0, 3.2 * M, z + 4 * M, z + 8 * M, { front: '#ece8de', side: '#cbc5b8', top: '#d9d3c6' });
          for (const dz of [0, 3.5]) box(x - 0.5 * M, x + 0.5 * M, 0, 1.6 * M, z + dz * M, z + (dz + 0.6) * M, blue);
          for (const [dx, dz] of [[-2.5, 0], [2.5, 0], [-2.5, 4], [2.5, 4]]) box(x + dx * M - 0.15 * M, x + dx * M + 0.15 * M, 0, 4.4 * M, z + dz * M, z + dz * M + 0.3 * M, { front: '#e9e9e9', side: '#c9c9c9', top: '#fff' });
          const r = box(x - 3.2 * M, x + 3.2 * M, 4.4 * M, 5.2 * M, z - 0.4 * M, z + 5 * M, { front: '#1c4fa0', side: '#153c7a', top: '#f2f2f2' });
          if (r) text('YPF', r.x + r.w / 2, r.y + r.h / 2, 0.6 * M * k, '#fff');
          glow(bx, P(0, 4.2 * M, z)[1], 3 * M * k, '255,240,210', 0.25);
          break;
        }
        case 'peaje': {
          const c = { front: '#d0d4da', side: '#a8aeb6', top: '#e4e7ea' };
          for (const s of [-1, 1]) {
            box(s * 1.5 * ROAD - 1.4 * M, s * 1.5 * ROAD + 1.4 * M, 0, 2.6 * M, z, z + 2.5 * M, { front: '#ece8de', side: '#cbc5b8', top: '#c0392b' });
            box(s * 1.32 * ROAD - 0.2 * M, s * 1.32 * ROAD + 0.2 * M, 0, 5.6 * M, z + 0.5 * M, z + 0.9 * M, c);
          }
          const r = box(-1.6 * ROAD, 1.6 * ROAD, 5.6 * M, 6.6 * M, z, z + 3 * M, { front: '#f2c230', side: '#c99a1d', top: '#ffd659' });
          if (r) {
            text('PEAJE', r.x + r.w / 2, r.y + r.h / 2, 0.7 * M * k, '#2b2b2b');
            for (const l of [-2 / 3, 0, 2 / 3]) { const p = P(l * ROAD, 5.35 * M, z); ellipse(p[0], p[1], 0.2 * M * k, 0.2 * M * k, '#3ccf4e'); glow(p[0], p[1], 0.7 * M * k, '80,255,110', 0.4); }
          }
          break;
        }
      }
    }

    function drawVaca(bx, by, s, it) {
      ctx.save(); ctx.translate(bx, by); ctx.scale(s * it.dir, -s);
      const c = '#8a3f1f', w = '#f2efe6';
      ellipse(0.2, -0.02, 1.0, 0.18, 'rgba(30,40,10,.25)');
      ctx.fillStyle = '#5e2a14';
      for (const x of [-0.7, -0.45, 0.45, 0.7]) { ctx.fillRect(x - 0.06, 0, 0.12, 0.7); }
      const g = ctx.createLinearGradient(0, 1.4, 0, 0.6);
      g.addColorStop(0, '#a8552c'); g.addColorStop(1, '#6a2f15');
      ctx.beginPath(); ctx.ellipse(0, 1.0, 0.95, 0.42, 0, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0.1, 0.72, 0.6, 0.12, 0, 0, Math.PI * 2); ctx.fillStyle = w; ctx.fill();
      const hy = it.pasta ? 0.45 : 1.15;
      ctx.beginPath(); ctx.ellipse(1.0, hy, 0.24, 0.3, it.pasta ? -0.6 : 0.3, 0, Math.PI * 2); ctx.fillStyle = w; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0.8, (hy + 1.0) / 2 + 0.05, 0.25, 0.22, 0, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
      ctx.restore();
    }

    /* ---------- tráfico ---------- */
    function drawCar(o, z) {
      const sp = CARS[o.model], x = o.x * ROAD, hw = o.w * ROAD / 2, L = 4.3 * M, k = K(z);
      if (z - camZ < NEAR) return;
      poly([P(x - hw * 1.08, 0, z - 0.2 * M), P(x + hw * 1.08, 0, z - 0.2 * M), P(x + hw * 1.08, 0, z + L), P(x - hw * 1.08, 0, z + L)], 'rgba(10,10,15,.35)');
      // reflejo de los faros en el asfalto
      glow(P(x, 0, z - 1.5 * M)[0], P(x, 0, z - 1.5 * M)[1], 1.6 * M * k, '255,236,180', 0.18);
      for (const [wz0, wz1] of [[0.55, 1.25], [L / M - 1.25, L / M - 0.55]]) for (const s of [-1, 1]) {
        box(x + s * hw * 0.88 - 0.13 * M, x + s * hw * 0.88 + 0.13 * M, 0, 0.62 * M, z + wz0 * M, z + wz1 * M, { front: '#1b1c1f', side: '#141416', top: '#222' });
      }
      box(x - hw, x + hw, 0.25 * M, 0.82 * M, z, z + L, { front: sp.body, side: sp.side, top: sp.top });
      const cw = hw * sp.cab, cz0 = z + sp.cz[0] * L, cz1 = z + sp.cz[1] * L;
      const cab = box(x - cw, x + cw, 0.82 * M, 1.38 * M, cz0, cz1, { front: '#34506b', side: '#2a3b4d', top: sp.top });
      if (cab) {
        const g = ctx.createLinearGradient(cab.x, cab.y, cab.x + cab.w, cab.y + cab.h);
        g.addColorStop(0, 'rgba(255,220,190,.45)'); g.addColorStop(0.45, 'rgba(255,255,255,.05)'); g.addColorStop(1, 'rgba(0,0,0,.2)');
        ctx.fillStyle = g; ctx.fillRect(cab.x, cab.y, cab.w, cab.h);
        ctx.fillStyle = sp.body; ctx.fillRect(cab.x, cab.y, cab.w, Math.max(1, cab.h * 0.08));
      }
      // frente: parrilla, faros, paragolpes y patente
      const zf = z - 1, light = '#fff3c4';
      face(x - hw * 0.5, 0.42 * M, x + hw * 0.5, 0.68 * M, zf, '#1d2026');
      for (let i = 0; i < 3; i++) face(x - hw * 0.5, (0.46 + i * 0.07) * M, x + hw * 0.5, (0.475 + i * 0.07) * M, zf, '#9aa1aa');
      const lights = [];
      for (const s of [-1, 1]) {
        if (sp.luz === 'cuadrado') { face(x + s * hw * 0.92 - 0.14 * M, 0.45 * M, x + s * hw * 0.92 + 0.14 * M, 0.68 * M, zf, light); lights.push(P(x + s * hw * 0.92, 0.56 * M, zf)); }
        else if (sp.luz === 'ancho') { face(x + s * hw * 0.74 - 0.24 * M, 0.5 * M, x + s * hw * 0.74 + 0.24 * M, 0.64 * M, zf, light); lights.push(P(x + s * hw * 0.74, 0.57 * M, zf)); }
        else if (sp.luz === 'triste') { const cx = x + s * hw * 0.76; poly([P(cx - s * 0.05 * M, 0.68 * M, zf), P(cx + s * 0.25 * M, 0.6 * M, zf), P(cx + s * 0.25 * M, 0.47 * M, zf), P(cx - s * 0.2 * M, 0.47 * M, zf), P(cx - s * 0.2 * M, 0.66 * M, zf)], light); lights.push(P(cx, 0.57 * M, zf)); }
        else for (const dx of [0.62, 0.86]) { const p = P(x + s * hw * dx, 0.56 * M, zf); ellipse(p[0], p[1], 0.11 * M * k, 0.11 * M * k, light); lights.push(p); }
      }
      const [ba, bb] = face(x - hw * 1.03, 0.25 * M, x + hw * 1.03, 0.37 * M, zf, '#c9ced6');
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(ba[0], bb[1] - (bb[1] - ba[1]) * 0.3, bb[0] - ba[0], (bb[1] - ba[1]) * 0.3);
      face(x - 0.26 * M, 0.27 * M, x + 0.26 * M, 0.36 * M, zf - 1, '#f1f1f1');
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const p of lights) glow(p[0], p[1], 0.7 * M * k, '255,230,170', 0.55);
      ctx.restore();
    }

    function drawTruck(o, z) {
      const x = o.x * ROAD, hw = o.w * ROAD / 2, k = K(z);
      if (z - camZ < NEAR) return;
      poly([P(x - hw * 1.05, 0, z - 0.2 * M), P(x + hw * 1.05, 0, z - 0.2 * M), P(x + hw * 1.05, 0, z + 14 * M), P(x - hw * 1.05, 0, z + 14 * M)], 'rgba(10,10,15,.38)');
      glow(P(x, 0, z - 2 * M)[0], P(x, 0, z - 2 * M)[1], 2.2 * M * k, '255,236,180', 0.2);
      box(x - hw, x + hw, 1.0 * M, 4.0 * M, z + 2.7 * M, z + 14 * M, { front: '#e9e9e9', side: '#cfd3d8', top: '#f6f6f6' });
      for (const [wz0, wz1] of [[0.5, 1.5], [9, 10], [11, 12]]) for (const s of [-1, 1]) {
        box(x + s * hw * 0.85 - 0.18 * M, x + s * hw * 0.85 + 0.18 * M, 0, 1.0 * M, z + wz0 * M, z + wz1 * M, { front: '#1b1c1f', side: '#141416', top: '#222' });
      }
      box(x - hw, x + hw, 0.5 * M, 3.0 * M, z, z + 2.5 * M, { front: '#c0392b', side: '#8f2a20', top: '#d4503f' });
      const zf = z - 1;
      face(x - hw * 0.9, 1.7 * M, x - 0.05 * M, 2.6 * M, zf, '#34506b');
      face(x + 0.05 * M, 1.7 * M, x + hw * 0.9, 2.6 * M, zf, '#34506b');
      const [ga, gb] = face(x - hw * 0.9, 1.7 * M, x + hw * 0.9, 2.6 * M, zf, 'rgba(255,220,190,.18)');
      void ga; void gb;
      const [va, vb] = face(x - hw, 2.62 * M, x + hw, 3.0 * M, zf, '#1f5e3a');
      text('EL TANO', (va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, 0.28 * M * k, '#ffd23f');
      face(x - hw, 1.58 * M, x + hw, 1.64 * M, zf, '#ffd23f');
      face(x - hw * 0.55, 0.65 * M, x + hw * 0.55, 1.5 * M, zf, '#1d2026');
      for (let i = 0; i < 9; i++) { const u = -hw * 0.5 + i * hw * 0.125; face(x + u, 0.7 * M, x + u + 0.04 * M, 1.45 * M, zf, '#9aa1aa'); }
      face(x - hw * 1.02, 0.45 * M, x + hw * 1.02, 0.68 * M, zf, '#d0d4da');
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const s of [-1, 1]) { const p = P(x + s * hw * 0.8, 1.05 * M, zf); ellipse(p[0], p[1], 0.17 * M * k, 0.17 * M * k, '#fff3c4'); glow(p[0], p[1], 0.9 * M * k, '255,230,170', 0.55); }
      ctx.restore();
    }

    function drawBache(o, z, now) {
      const cx = o.x * ROAD, r = 0.42 * o.w * ROAD, k = K(z), zc = z + 0.7 * M;
      if (z - camZ < NEAR) return;
      const ring = (rr, fill) => poly(Array.from({ length: 16 }, (_, i) => { const a = i / 16 * Math.PI * 2; return P(cx + Math.cos(a) * rr * (1 + 0.12 * Math.sin(i * 3.1)), 0, zc + Math.sin(a) * rr * 0.75); }), fill);
      ring(r * 1.12, '#5a5b60'); ring(r, '#1c1d20'); ring(r * 0.55, 'rgba(90,120,160,.55)');
      const hl = P(cx - r * 0.2, 0, zc - r * 0.1);
      ellipse(hl[0], hl[1], 0.35 * M * k, 0.06 * M * k, 'rgba(255,220,180,.5)');
      if (o.variant === 0) {
        // rama clavada para avisar
        const b = P(cx + r * 0.1, 0, zc), t = P(cx - r * 0.25, 1.1 * M, zc);
        ctx.strokeStyle = '#6b4426'; ctx.lineWidth = Math.max(1, 0.08 * M * k); ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(t[0], t[1]); ctx.stroke();
        for (let i = 0; i < 6; i++) ellipse(t[0] + Math.cos(i * 1.1 + now * 0.004) * 0.25 * M * k, t[1] + Math.sin(i * 1.7) * 0.18 * M * k, 0.14 * M * k, 0.09 * M * k, i % 2 ? '#4e8a3a' : '#76b456');
      } else {
        // goma vieja parada en el pozo
        const p = P(cx, 0.4 * M, zc);
        ellipse(p[0], p[1], 0.26 * M * k, 0.42 * M * k, '#16171a');
        ellipse(p[0], p[1], 0.12 * M * k, 0.24 * M * k, '#3a3d42');
      }
    }

    /* ---------- el Fitito ---------- */
    function drawPlayer(now, dt) {
      const pz = S.pos + PLAYER_Z, x = S.x * ROAD, k = K(pz), s = k * M;
      let [sx, sy] = P(x, 0, pz), rot = 0;
      const moving = S.alive && S.started;
      if (moving) sy -= Math.max(0, Math.sin(now / 45)) * 0.02 * s;
      if (S.crash) {
        S.crash.t += dt;
        const t = Math.min(1, S.crash.t / 700);
        if (S.crash.kind === 'bache') { sy -= Math.sin(t * Math.PI) * H * 0.16; rot = t * 0.6; }
        else rot = Math.sin(S.crash.t / 50) * 0.08;
      } else rot = Math.max(-1, Math.min(1, (laneX(S.lane) - S.x) * 4)) * 0.05;
      ellipse(sx, sy, 1.15 * s, 0.25 * s, 'rgba(10,10,15,.4)');
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(rot);
      const own = getCustom('fititoAtras');
      if (own) { const w = 2.1 * s, h = w * own.height / own.width; ctx.drawImage(own, -w / 2, -h, w, h); }
      else { ctx.scale(s, -s); paintFitito(ctx, now); }
      ctx.restore();
    }

    function draw(dt, now) {
      st.begin();
      W = st.w; H = st.h;
      F = Math.min(0.95 * W, 1.25 * H);
      yh = H * 0.3;
      camZ = S.pos + PLAYER_Z - CAM_BACK;
      camY = (H * 0.86 - yh) * CAM_BACK / F;
      camX = S.x * ROAD * 0.7;
      ctx.save();
      if (S.shake > 0) { ctx.translate((Math.random() - 0.5) * S.shake * 14, (Math.random() - 0.5) * S.shake * 10); S.shake = Math.max(0, S.shake - dt / 700); }
      drawSky(now);
      drawGround();

      // todo lo que tiene altura, de atrás hacia adelante, apareciendo desde la bruma
      const list = [];
      const i0 = Math.floor((camZ + NEAR) / SEG), i1 = Math.floor((camZ + FOG1) / SEG);
      for (let i = i1; i >= i0; i--) for (const it of segs[((i % N) + N) % N]) list.push({ z: i * SEG, f: () => drawItem(it, i * SEG, now) });
      const pz = S.pos + PLAYER_Z;
      for (const o of S.obstacles) {
        if (o.z - camZ > FOG1 || o.z - camZ < NEAR) continue;
        // los que ya pasaron al Fitito se desvanecen rápido (si no, quedan como bloques gigantes contra la cámara)
        const gone = o.kind === 'bache' ? 1 : Math.max(0, Math.min(1, (o.z - (pz - 1.5 * M)) / (1.5 * M)));
        if (gone <= 0) continue;
        list.push({ z: o.z, a: gone, f: () => (o.kind === 'auto' ? drawCar(o, o.z) : o.kind === 'camion' ? drawTruck(o, o.z) : drawBache(o, o.z, now)) });
      }
      list.push({ z: pz, f: () => drawPlayer(now, dt) });
      for (const p of S.smoke) { const z = pz + p.dz; list.push({ z, f: () => { const q = P(p.x, p.y, z), r = (0.07 + p.t * 0.25) * M * K(z); ellipse(q[0], q[1], r, r * 0.8, `rgba(200,200,205,${0.3 * (1 - p.t / 0.5)})`); } }); }
      list.sort((a, b) => b.z - a.z);
      for (const it of list) {
        const a = (1 - fogOf(it.z)) * (it.a ?? 1);
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        it.f();
      }
      ctx.globalAlpha = 1;

      const vg = ctx.createRadialGradient(W / 2, H * 0.6, Math.min(W, H) * 0.4, W / 2, H * 0.6, Math.max(W, H) * 0.85);
      vg.addColorStop(0, 'rgba(30,10,40,0)'); vg.addColorStop(1, 'rgba(30,10,40,.35)');
      ctx.fillStyle = vg; ctx.fillRect(-30, -30, W + 60, H + 60);
      ctx.restore();
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

// Fiat 600 blanco visto desde atrás, en metros con el piso en 0 y y para arriba: redondito, con óxido,
// rejilla en la tapa del motor y el paragolpes atado con alambre.
function paintFitito(c, now) {
  c.fillStyle = '#16171a';
  for (const s of [-1, 1]) { rrect(c, s * 0.72 - 0.15, 0, 0.3, 0.44, 0.08); c.fill(); }
  // carrocería
  c.beginPath();
  c.moveTo(-0.9, 0.3);
  c.bezierCurveTo(-0.97, 0.62, -0.92, 0.88, -0.74, 0.98);
  c.bezierCurveTo(-0.62, 1.28, -0.4, 1.38, 0, 1.39);
  c.bezierCurveTo(0.4, 1.38, 0.62, 1.28, 0.74, 0.98);
  c.bezierCurveTo(0.92, 0.88, 0.97, 0.62, 0.9, 0.3);
  c.closePath();
  let g = c.createLinearGradient(-0.9, 0, 0.9, 0);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#f1ede3'); g.addColorStop(1, '#bdb6a6');
  c.fillStyle = g; c.fill();
  g = c.createLinearGradient(0, 0.3, 0, 0.75);
  g.addColorStop(0, 'rgba(60,50,40,.35)'); g.addColorStop(1, 'rgba(60,50,40,0)');
  c.fillStyle = g; c.fill();
  c.lineWidth = 0.025; c.strokeStyle = 'rgba(40,35,30,.55)'; c.stroke();
  // luneta
  c.beginPath();
  c.moveTo(-0.5, 0.98); c.bezierCurveTo(-0.45, 1.22, -0.3, 1.28, 0, 1.28); c.bezierCurveTo(0.3, 1.28, 0.45, 1.22, 0.5, 0.98); c.closePath();
  g = c.createLinearGradient(-0.5, 1.28, 0.5, 0.98);
  g.addColorStop(0, '#9fb7cc'); g.addColorStop(0.4, '#3d5870'); g.addColorStop(1, '#22313f');
  c.fillStyle = g; c.fill();
  // tapa del motor con rejilla
  rrect(c, -0.42, 0.46, 0.84, 0.4, 0.08); c.fillStyle = '#e6e1d4'; c.fill();
  c.fillStyle = '#7d776a';
  for (let i = 0; i < 6; i++) c.fillRect(-0.34, 0.55 + i * 0.05, 0.68, 0.018);
  // faros
  for (const s of [-1, 1]) {
    c.beginPath(); c.ellipse(s * 0.74, 0.7, 0.06, 0.1, 0, 0, Math.PI * 2); c.fillStyle = '#d6362b'; c.fill();
    c.beginPath(); c.ellipse(s * 0.74, 0.58, 0.05, 0.035, 0, 0, Math.PI * 2); c.fillStyle = '#f08a24'; c.fill();
  }
  // óxido
  c.fillStyle = 'rgba(160,82,30,.55)';
  for (const [x, y, rx, ry] of [[-0.62, 0.42, 0.08, 0.04], [0.55, 1.05, 0.05, 0.04], [0.66, 0.4, 0.06, 0.03], [-0.2, 0.92, 0.03, 0.02]]) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); }
  // paragolpes con alambre y patente
  rrect(c, -0.95, 0.26, 1.9, 0.09, 0.04);
  g = c.createLinearGradient(0, 0.35, 0, 0.26); g.addColorStop(0, '#eef1f4'); g.addColorStop(1, '#8e959e');
  c.fillStyle = g; c.fill();
  c.strokeStyle = '#6f767e'; c.lineWidth = 0.015;
  for (const x of [-0.52, -0.46, -0.4]) { c.beginPath(); c.moveTo(x, 0.24); c.lineTo(x + 0.03, 0.37); c.stroke(); }
  rrect(c, -0.22, 0.37, 0.44, 0.1, 0.015); c.fillStyle = '#141414'; c.fill();
  c.save(); c.translate(0, 0.42); c.scale(0.01, -0.01); c.fillStyle = '#e8e8e8'; c.font = '700 7px Chivo, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('B 600.123', 0, 0); c.restore();
  // caño de escape
  c.fillStyle = '#4a4f56'; rrect(c, -0.55, 0.18, 0.12, 0.06, 0.02); c.fill();
  void now;
}
