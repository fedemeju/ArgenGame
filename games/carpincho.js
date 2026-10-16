import { makeCanvas, startLoop, mulberry32, audio, buzz, overlay, flash, rrect } from '../js/engine.js';
import { getCustom } from '../js/art.js';

// El Carpincho de Nordelta: corredor de costado en 2.5D. El mundo es 3D de verdad (x hacia adelante,
// y para arriba, z hacia el fondo) y se proyecta con una cámara en perspectiva: por eso el piso, los
// setos, las casas y la barrera muestran sus costados y cambian de ángulo mientras pasan.
const Z0 = 7;                            // profundidad del sendero por donde corre
const PATH_NEAR = 6.2, PATH_FAR = 7.8;
const H_UP = 0.7, H_DOWN = 0.45;         // alto del carpincho parado y agachado
const NOSE = 0.55, TAIL = 0.5;           // del centro a la trompa y a la cola
const G = 22, JUMP_V = 7, AIR = 2 * JUMP_V / G;
const V0 = 4.8, VMAX = 9.5, K = 0.006, DCAP = (VMAX - V0) / K;
const JUMP_BUFFER = 0.15;                // si tocás saltar un poco antes de caer, salta al tocar el piso
const NIGHT_AT = 250, NIGHT_LEN = 200;   // a los 250 m empieza a oscurecer; a los 450 m es de noche
const SKY_DAY = ['#2c4b82', '#9f86a8', '#f2a982', '#ffdca4'], SKY_NIGHT = ['#070b22', '#141a45', '#2a2d5e', '#463f72'];
const mix = (a, b, t) => {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), x = p(a), y = p(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
};
const speed = d => (d < DCAP ? V0 + K * d : VMAX);
// tiempo que tarda en recorrer d (sirve para que los que vuelan lleguen igual en todos los celulares)
const tOf = d => (d < DCAP ? Math.log(1 + K * d / V0) / K : Math.log(1 + K * DCAP / V0) / K + (d - DCAP) / VMAX);

// Obstáculos: los "low" se saltan, los "high" se pasan agachado. y0/y1: alto de la parte que golpea.
const KINDS = {
  seto: { low: 1, w: [0.7, 1], y1: 0.55, peso: 3 },
  cono: { low: 1, w: [0.42, 0.42], y1: 0.55, peso: 2 },
  conos: { low: 1, w: [1, 1], y1: 0.55, peso: 1 },
  lomo: { low: 1, w: [1.2, 1.4], y1: 0.2, peso: 2 },
  tacho: { low: 1, w: [0.5, 0.5], y1: 0.62, peso: 2 },
  barrera: { high: 1, w: [0.22, 0.22], y0: 0.52, y1: 0.62, peso: 3 },
  pelota: { high: 1, w: [0.18, 0.18], y0: 0.51, y1: 0.69, vx: 2.2, peso: 2 },
  tero: { high: 1, w: [0.5, 0.5], y0: 0.58, y1: 0.86, vx: 1.2, peso: 3 },
  dron: { high: 1, w: [0.55, 0.55], y0: 0.55, y1: 0.68, peso: 2 },
};
const LOWS = Object.keys(KINDS).filter(k => KINDS[k].low);
const HIGHS = Object.keys(KINDS).filter(k => KINDS[k].high);
const pickW = (list, r) => {
  let t = r * list.reduce((s, k) => s + KINDS[k].peso, 0);
  for (const k of list) { t -= KINDS[k].peso; if (t < 0) return k; }
  return list[list.length - 1];
};
const TITLES = {
  seto: '¡Te comiste el ligustro!', cono: '¡Te llevaste puesto el cono!', conos: '¡Te llevaste puestos los conos!',
  lomo: '¡Tropezaste en el lomo de burro!', tacho: '¡Volcaste el tacho!', barrera: '¡Te frenó la barrera de la guardia!',
  pelota: '¡Pelotazo de golf!', tero: '¡Te agarró el tero!', dron: '¡Te cazó el dron de seguridad!',
};

// Imágenes del carpincho y el tero (assets/carpincho/); si no cargaron, se dibujan en código.
// corre.webp es una tira de 15 cuadros sacados de un video (3 pasos de trote): el ciclo entero dura RUN_CYCLE metros.
const RUN_FRAMES = 15, RUN_CYCLE = 3;
const TERO_FRAMES = 9;                   // tero.webp: un aleteo completo en 9 cuadros, también sacado de un GIF
const IMG = () => ({
  corre: getCustom('carpCorre'),
  salto: getCustom('carpSalto'), agachado: getCustom('carpAgachado'),
  tero: getCustom('teroVuela'),
});

/* ---------- paisaje: se genera por tramos, con su propio azar ---------- */
const hash3 = (a, b, c) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return (h ^ (h >>> 16)) >>> 0;
};
const GREEN = ['#8cc45a', '#4f8a35', '#2f5a24'], JACA = ['#c7aaf2', '#8a68c9', '#55398a'];
const LAYERS = [
  { id: 1, size: 16, z: 95, pad: 4, gen(r, x0, out) {
    const n = r() < 0.85 ? 1 + (r() < 0.55) : 0;
    for (let i = 0; i < n; i++) out.push({ t: 'torre', z: 95, x: x0 + r() * 14, w: 1.6 + r() * 2.4, h: 5 + r() * 12, glass: r() < 0.5 });
  } },
  { id: 2, size: 30, z: 70, pad: 2, gen(r, x0, out) { if (r() < 0.5) out.push({ t: 'barco', z: 50 + r() * 20, x: x0 + r() * 28, k: 0.8 + r() * 0.5 }); } },
  { id: 3, size: 3, z: 31, pad: 1, gen(r, x0, out) { if (r() < 0.7) out.push({ t: 'junco', z: 30.4 + r() * 0.8, x: x0 + r() * 3, h: 0.5 + r() * 0.7 }); } },
  { id: 4, size: 10, z: 30, pad: 8, gen(r, x0, out) {
    if (r() < 0.55) out.push({ t: 'casa', z: 19 + r() * 7, x: x0 + r() * 4, w: 4 + r() * 3, d: 4, h: 2.4 + r() * 0.8, pisos: r() < 0.5 ? 2 : 1, luz: Math.floor(r() * 8), madera: r() < 0.6 });
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const rr = 1 + r() * 0.8, jac = r() < 0.3;
      out.push({ t: 'arbol', z: 11 + r() * 18, x: x0 + r() * 10, tronco: 1.3 + r() * 0.9, col: jac ? JACA : GREEN,
        blobs: Array.from({ length: 4 }, () => [(r() - 0.5) * rr * 1.2, (r() - 0.3) * rr * 0.8, rr * (0.55 + r() * 0.35)]) });
    }
  } },
  { id: 5, size: 6, z: 10.5, pad: 3, gen(r, x0, out) {
    out.push({ t: 'farol', z: 8.9, x: x0 + 3 });
    if (r() < 0.14) out.push({ t: 'carrito', z: 10, x: x0 + r() * 3 });
  } },
  { id: 6, size: 2.5, z: 4.6, pad: 1.5, gen(r, x0, out) {
    const n = Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const q = r(), z = 3.6 + r() * 1, x = x0 + r() * 2.5;
      if (q < 0.03) out.push({ t: 'cartel', z: 4.4, x });
      else if (q < 0.15) out.push({ t: 'baliza', z, x });
      else if (q < 0.45) out.push({ t: 'agapanto', z, x, h: 0.45 + r() * 0.25 });
      else out.push({ t: 'pasto', z, x, h: 0.18 + r() * 0.22 });
    }
  } },
];

export default {
  id: 'carpincho',
  name: 'El Carpincho de Nordelta',
  tagline: 'Saltá y agachate por el barrio cerrado',
  threshold: 20,
  rules: [
    'El carpincho se metió al barrio cerrado y corre solo, cada vez más rápido.',
    'Tocá la mitad derecha de la pantalla para saltar los setos, conos, tachos y lomos de burro.',
    'Mantené apretada la mitad izquierda para agacharte: la barrera de la guardia, las pelotas de golf, los teros y los drones solo se pasan agachado.',
    'Si te agachás en el aire, bajás más rápido.',
    'Cada metro que corrés suma 1 punto.',
  ],
  icon(c, s) {
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#3a5f96'); g.addColorStop(0.45, '#f2b088'); g.addColorStop(0.55, '#7bab4c'); g.addColorStop(1, '#3f7a2c');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    c.fillStyle = '#d9cbb0'; c.fillRect(0, s * 0.72, s, s * 0.12);
    const img = IMG().corre;
    if (img) { const fw = img.width / RUN_FRAMES, w = s * 0.86, h = w * img.height / fw; c.drawImage(img, 0, 0, fw, img.height, (s - w) / 2, s * 0.8 - h, w, h); }
    else { c.save(); c.translate(s * 0.48, s * 0.8); c.scale(s * 0.7, -s * 0.7); paintCarpincho(c, 0, false, false); c.restore(); }
  },

  mount(el, { seed, onScore, onEnd }) {
    const st = makeCanvas(el), ctx = st.ctx, rng = mulberry32(seed);
    const pill = overlay(el, 'g-pill', 'Derecha: saltar · Izquierda: agacharse');
    const toast = overlay(el, 'g-toast');
    el.style.userSelect = el.style.webkitUserSelect = 'none';
    el.style.webkitTouchCallout = 'none';

    const S = {
      d: 0, y: 0, vy: 0, duck: false, duckHeld: false, started: false, alive: true, score: 0,
      landT: 0, startT: 0, obs: [], nextX: 16, spawned: 0, crash: null, shake: 0, parts: [], dustT: 0,
      jumpBuf: 0, rot: 0, duckT: 0,
    };
    let endTimer = 0;
    const report = () => onScore(S.score, `Metros · ${(speed(S.d) * 3.6).toFixed(0)} km/h`);
    const obsX = o => o.X + (o.vx ? o.vx * (tOf(o.X) - tOf(S.d)) : 0);

    // Obstáculos por distancia: siempre hay lugar para aterrizar y volver a saltar.
    function spawnUntil(limit) {
      while (S.nextX < limit) {
        const n = S.spawned++, v = speed(S.nextX);
        // los de agacharse arrancan en el tercero, y el primero siempre es un tero
        const highP = n < 2 ? 0 : n === 2 ? 1 : Math.min(0.42, 0.22 + n * 0.008);
        let kind = rng() < highP ? pickW(HIGHS, rng()) : pickW(LOWS, rng());
        if (KINDS[kind].high && !S.teroVisto) { kind = 'tero'; S.teroVisto = true; }
        const k = KINDS[kind], w = k.w[0] + rng() * (k.w[1] - k.w[0]);
        S.obs.push({ kind, id: n, X: S.nextX, w, y0: k.y0 || 0, y1: k.y1, vx: k.vx || 0, low: !!k.low, passed: false });
        const extra = 0.4 + 1.2 * Math.max(0, 1 - n / 60);
        S.nextX += w + v * (AIR + 0.32) + NOSE + TAIL + v * rng() * extra;
      }
    }

    function die(kind) {
      S.alive = false; S.shake = 1; S.crash = { kind, t: 0 };
      audio.lose(); buzz([60, 40, 110]);
      report();
      endTimer = setTimeout(() => onEnd(S.score, { title: TITLES[kind] }), 1200);
    }

    function dust(n, spread) {
      for (let i = 0; i < n; i++) S.parts.push({ x: S.d - TAIL * 0.6 + (Math.random() - 0.5) * spread, y: 0.03, z: Z0 + (Math.random() - 0.5) * 0.4, vx: -1 - Math.random() * 1.5, vy: 0.4 + Math.random() * 0.8, life: 0.5 + Math.random() * 0.3, t: 0 });
    }

    function update(dt) {
      const sec = Math.min(0.05, dt / 1000);
      S.parts.forEach(p => { p.t += sec; p.x += p.vx * sec; p.y += p.vy * sec; p.vy -= 1.5 * sec; });
      S.parts = S.parts.filter(p => p.t < p.life);
      if (!S.started || !S.alive) return;
      S.startT += sec;
      const v = speed(S.d);
      S.d += v * sec;
      if (S.y > 0 || S.vy > 0) {
        S.vy -= G * (S.duckHeld ? 3 : 1) * sec;
        S.y += S.vy * sec;
        if (S.y <= 0) {
          S.y = 0; S.vy = 0; S.landT = 0.18; dust(6, 0.6);
          if (S.jumpBuf > 0 && !S.duckHeld) jump();
        }
      }
      if (S.jumpBuf > 0) S.jumpBuf -= sec;
      if (S.landT > 0) S.landT = Math.max(0, S.landT - sec);
      const wasDuck = S.duck;
      S.duck = S.duckHeld && S.y === 0;
      if (S.duck && !wasDuck) S.duckT = 0.12;
      if (S.duckT > 0) S.duckT = Math.max(0, S.duckT - sec);
      if (S.y === 0 && !S.duck) { S.dustT -= sec; if (S.dustT <= 0) { S.dustT = 0.09; dust(1, 0.2); } }

      spawnUntil(S.d + 40);
      // cajas de choque un poco más chicas que los dibujos, para que no se sienta injusto
      const top = S.y + (S.duck ? H_DOWN : H_UP) * 0.92;
      const px0 = S.d - TAIL * 0.7, px1 = S.d + NOSE * 0.78;
      if (!S.nocheAvisada && S.d > NIGHT_AT + NIGHT_LEN * 0.5) { S.nocheAvisada = true; flash(toast, '¡Se hizo de noche!'); }
      const meters = Math.floor(S.d);
      if (meters !== S.score) {
        if (Math.floor(meters / 100) > Math.floor(S.score / 100)) { flash(toast, `¡${Math.floor(meters / 100) * 100} m!`); audio.win(); }
        S.score = meters;
      }
      for (const o of S.obs) {
        const ox = obsX(o), m = o.w * 0.12;
        // los que vuelan no se pueden saltar: chocan con todo lo que esté arriba de su parte de abajo
        if (px1 > ox + m && px0 < ox + o.w - m && top > o.y0 + 0.02 && (!o.low || S.y < o.y1 * 0.9)) return die(o.kind);
        if (!o.passed && ox + o.w < px0) { o.passed = true; audio.tone(880, 0.04, 'triangle', 0.03); }
        if (o.kind === 'tero' && !o.chirp && ox - S.d < 6) { o.chirp = true; audio.tone(1900, 0.05, 'square', 0.03); audio.tone(2100, 0.05, 'square', 0.03, 0.09); }
      }
      S.obs = S.obs.filter(o => obsX(o) + o.w > S.d - 14);
      report();
    }

    /* ---------- cámara y dibujo ---------- */
    let W = 1, H = 1, F = 1, yh = 0, camY = 1, camX = 0;
    const P = (x, y, z) => [W / 2 + (x - camX) * F / z, yh + (camY - y) * F / z];
    const poly = (pts, fill) => {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    };
    // caja en perspectiva: se ve el frente, la tapa y el costado que mira al centro
    function box(x0, x1, y0, y1, z0, z1, c) {
      if (x1 < camX) poly([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], c.side);
      else if (x0 > camX) poly([P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)], c.side);
      if (y1 < camY) poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], c.top);
      const a = P(x0, y1, z0), b = P(x1, y0, z0);
      ctx.fillStyle = c.front; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      return { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] };
    }
    const ellipse = (x, y, rx, ry, fill) => { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); };
    const shadowAt = (x, z, rw, a = 0.28) => { const [sx, sy] = P(x, 0, z), k = F / z; ellipse(sx + 0.12 * k, sy, rw * k, 0.1 * k + rw * k * 0.12, `rgba(30,25,10,${a})`); };

    const chunks = new Map();
    function sceneItems() {
      const items = [];
      for (const L of LAYERS) {
        const half = (W / 2) * L.z / F + L.pad;
        const c0 = Math.floor((camX - half) / L.size), c1 = Math.floor((camX + half) / L.size);
        for (let c = c0; c <= c1; c++) {
          const key = L.id + ':' + c;
          let list = chunks.get(key);
          if (!list) { list = []; L.gen(mulberry32(hash3(L.id, c, 77)), c * L.size, list); chunks.set(key, list); }
          items.push(...list);
        }
      }
      if (chunks.size > 600) for (const k of chunks.keys()) { chunks.delete(k); if (chunks.size < 300) break; }
      return items.sort((a, b) => b.z - a.z);
    }

    // 0 = atardecer, 1 = noche cerrada; y las luces que se prenden de noche (se juntan al dibujar)
    let night = 0, lights = [];

    function drawSky(now) {
      const g = ctx.createLinearGradient(0, 0, 0, yh);
      [0, 0.45, 0.8, 1].forEach((t, i) => g.addColorStop(t, mix(SKY_DAY[i], SKY_NIGHT[i], night)));
      ctx.fillStyle = g; ctx.fillRect(-30, -30, W + 60, yh + 31);
      // el sol se esconde detrás del horizonte
      const sx = W * 0.72, sy = yh - H * 0.045 + night * H * 0.12, r = Math.min(W, H) * 0.065;
      if (night < 1) {
        ctx.save(); ctx.globalAlpha = 1 - night;
        let rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 6);
        rg.addColorStop(0, 'rgba(255,232,170,.6)'); rg.addColorStop(1, 'rgba(255,200,140,0)');
        ctx.fillStyle = rg; ctx.fillRect(sx - r * 6, sy - r * 6, r * 12, r * 12);
        rg = ctx.createRadialGradient(sx - r * 0.2, sy - r * 0.2, 0, sx, sy, r);
        rg.addColorStop(0, '#fffbe6'); rg.addColorStop(1, '#ffd27e');
        ellipse(sx, sy, r, r, rg);
        ctx.restore();
      }
      // nubes lejanas que se mueven apenas
      ctx.save(); ctx.globalAlpha = 1 - night * 0.65;
      for (let i = 0; i < 4; i++) {
        const span = W * 1.8, x = ((i * 0.47 * span - camX * F / 400 - now * 0.004 * (i + 1)) % span + span) % span - W * 0.4;
        const y = yh * (0.14 + i * 0.13), k = Math.min(W, H) * (0.07 + i * 0.012);
        ellipse(x, y + k * 0.25, k * 1.9, k * 0.35, 'rgba(214,140,150,.28)');
        ellipse(x - k * 0.6, y, k * 0.8, k * 0.38, 'rgba(255,232,222,.7)');
        ellipse(x + k * 0.3, y - k * 0.12, k * 0.95, k * 0.5, 'rgba(255,238,228,.75)');
        ellipse(x + k * 1.1, y + k * 0.05, k * 0.6, k * 0.3, 'rgba(255,232,222,.7)');
      }
      ctx.restore();
    }

    // De noche: oscurece todo y después prende luna, estrellas, faroles, ventanas y luciérnagas.
    function drawNight(now) {
      if (night <= 0) return;
      ctx.fillStyle = `rgba(8,12,40,${0.5 * night})`; ctx.fillRect(-30, -30, W + 60, H + 60);
      ctx.save();
      ctx.globalAlpha = night;
      for (let i = 0; i < 70; i++) {
        const x = (hash3(i, 1, 5) % 1000) / 1000 * W, y = (hash3(i, 2, 5) % 1000) / 1000 * yh * 0.85;
        const a = 0.5 + 0.5 * Math.sin(now * 0.002 + i * 1.3), r = (hash3(i, 3, 5) % 3) * 0.4 + 0.6;
        ellipse(x, y, r, r, `rgba(255,255,240,${a})`);
      }
      const mx = W * 0.24, my = yh * 0.32, mr = Math.min(W, H) * 0.05;
      let g = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 5);
      g.addColorStop(0, 'rgba(200,215,255,.35)'); g.addColorStop(1, 'rgba(200,215,255,0)');
      ctx.fillStyle = g; ctx.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
      g = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
      g.addColorStop(0, '#fbfaf2'); g.addColorStop(1, '#d9d6c6');
      ellipse(mx, my, mr, mr, g);
      ellipse(mx + mr * 0.3, my + mr * 0.2, mr * 0.18, mr * 0.15, 'rgba(150,150,140,.35)');
      ellipse(mx - mr * 0.35, my - mr * 0.1, mr * 0.12, mr * 0.1, 'rgba(150,150,140,.3)');
      ctx.globalCompositeOperation = 'lighter';
      for (const L of lights) {
        const gl = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
        gl.addColorStop(0, `rgba(${L.c},${L.a * night})`); gl.addColorStop(1, `rgba(${L.c},0)`);
        ctx.fillStyle = gl; ctx.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
      }
      // luciérnagas en el pasto
      const syBank = P(0, 0, 30.4)[1];
      for (let i = 0; i < 16; i++) {
        const x = ((hash3(i, 7, 1) % 1000) / 1000 * W * 1.4 - (camX * F / 60) % (W * 1.4) + W * 1.4) % (W * 1.4) - W * 0.2 + Math.sin(now * 0.0011 + i) * 14;
        const y = syBank + (H - syBank) * ((hash3(i, 8, 1) % 1000) / 1000) + Math.cos(now * 0.0013 + i * 2) * 10;
        const a = Math.max(0, Math.sin(now * 0.003 + i * 2.3)) * night, r = 7;
        const gf = ctx.createRadialGradient(x, y, 0, x, y, r);
        gf.addColorStop(0, `rgba(230,255,120,${a})`); gf.addColorStop(1, 'rgba(230,255,120,0)');
        ctx.fillStyle = gf; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    }

    function drawWater(items, now) {
      const syFar = P(0, 0, 95)[1], syBank = P(0, 0, 30.4)[1];
      const g = ctx.createLinearGradient(0, syFar, 0, syBank);
      g.addColorStop(0, '#b6a3b6'); g.addColorStop(0.3, '#8a93b4'); g.addColorStop(1, '#4c6a8e');
      ctx.fillStyle = g; ctx.fillRect(-30, syFar, W + 60, syBank - syFar + 1);
      // reflejo de las torres
      ctx.save(); ctx.globalAlpha = 0.22;
      for (const it of items) if (it.t === 'torre') {
        const [ax, ay] = P(it.x, 0, it.z), [bx] = P(it.x + it.w, 0, it.z), hh = it.h * F / it.z * 0.5;
        ctx.fillStyle = it.glass ? '#c3cde0' : '#e2cdd0'; ctx.fillRect(ax, ay, bx - ax, Math.min(hh, syBank - ay));
      }
      ctx.restore();
      // brillo del sol sobre el agua
      const sx = W * 0.72;
      for (let i = 0; i < 14; i++) {
        const t = i / 14, y = syFar + (syBank - syFar) * (0.05 + t * 0.9);
        const w = (6 + t * 30) * (0.6 + 0.4 * Math.sin(now * 0.003 + i * 1.7));
        ctx.fillStyle = `rgba(255,226,170,${0.55 - t * 0.35})`; ctx.fillRect(sx - w / 2 + Math.sin(i * 2.1) * 6, y, w, Math.max(1, 1 + t * 2));
      }
      for (let k = Math.floor((camX - 60) / 2.3); k < (camX + 60) / 2.3; k++) {
        const z = 40 + (hash3(k, 3, 9) % 40), [x, y] = P(k * 2.3, 0, z);
        if (x < -10 || x > W + 10) continue;
        const a = 0.25 + 0.25 * Math.sin(now * 0.004 + k);
        ctx.fillStyle = `rgba(255,240,220,${a})`; ctx.fillRect(x, y, 0.5 * F / z, 1);
      }
      ctx.fillStyle = '#5f7a5c'; ctx.fillRect(-30, syFar - 2, W + 60, 2.5);
      return syBank;
    }

    function drawGround(syBank) {
      const g = ctx.createLinearGradient(0, syBank, 0, H);
      g.addColorStop(0, '#a6bd6c'); g.addColorStop(0.25, '#78a848'); g.addColorStop(1, '#3b7429');
      ctx.fillStyle = g; ctx.fillRect(-30, syBank, W + 60, H - syBank + 30);
      // franjas del pasto cortado, en perspectiva
      const zN = 2.2, zF = 30.4, xs = (W / 2) * zF / F;
      for (let k = Math.floor((camX - xs) / 2); k <= Math.ceil((camX + xs) / 2); k++) {
        poly([P(2 * k, 0, zN), P(2 * k + 1, 0, zN), P(2 * k + 1, 0, zF), P(2 * k, 0, zF)], 'rgba(255,255,220,.07)');
      }
      ctx.fillStyle = '#6c7c42'; ctx.fillRect(-30, syBank, W + 60, 2);
      // sendero
      const a = P(0, 0, PATH_FAR)[1], b = P(0, 0, PATH_NEAR)[1], curb = 0.07 * F / PATH_NEAR;
      const pg = ctx.createLinearGradient(0, a, 0, b);
      pg.addColorStop(0, '#d6c6a6'); pg.addColorStop(1, '#e6d8bb');
      ctx.fillStyle = pg; ctx.fillRect(-30, a, W + 60, b - a);
      ctx.fillStyle = '#a99778'; ctx.fillRect(-30, a - 1, W + 60, 2);
      ctx.fillStyle = '#bba987'; ctx.fillRect(-30, b, W + 60, curb);
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(-30, b + curb, W + 60, curb * 0.6);
      ctx.strokeStyle = 'rgba(120,98,68,.35)'; ctx.lineWidth = 1;
      const xs2 = (W / 2) * PATH_FAR / F + 2;
      for (let k = Math.floor((camX - xs2) / 1.2); k <= (camX + xs2) / 1.2; k++) {
        const p = P(k * 1.2, 0, PATH_FAR), q = P(k * 1.2, 0, PATH_NEAR);
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
    }

    /* ---------- cosas del paisaje ---------- */
    function drawItem(it, now) {
      const k = F / it.z, [bx, by] = P(it.x, 0, it.z);
      switch (it.t) {
        case 'torre': {
          const [ax, ay] = P(it.x, it.h, it.z), [cx] = P(it.x + it.w, 0, it.z);
          const g = ctx.createLinearGradient(0, ay, 0, by);
          if (it.glass) { g.addColorStop(0, '#b4c2da'); g.addColorStop(1, '#8996b4'); } else { g.addColorStop(0, '#d8c3c6'); g.addColorStop(1, '#ab9aad'); }
          ctx.fillStyle = g; ctx.fillRect(ax, ay, cx - ax, by - ay);
          ctx.fillStyle = 'rgba(255,214,170,.35)'; ctx.fillRect(cx - (cx - ax) * 0.22, ay, (cx - ax) * 0.22, by - ay);
          ctx.fillStyle = 'rgba(255,255,255,.14)';
          for (let y = 0.6; y < it.h; y += 0.8) ctx.fillRect(ax, P(0, y, it.z)[1], cx - ax, 1);
          if (night > 0) {
            // ventanas prendidas de noche (se dibujan acá para que lo de adelante las tape)
            const tw = cx - ax, cw = Math.max(1, tw / 6), ch = Math.max(1, cw * 0.8), seed = Math.round(it.x * 10);
            ctx.fillStyle = `rgba(16,20,46,${0.75 * night})`; ctx.fillRect(ax, ay, tw, by - ay);
            ctx.fillStyle = `rgba(255,222,150,${night})`;
            for (let r = 0; r * ch * 2 < by - ay - ch; r++) for (let c = 0; c < 5; c++) if (!(hash3(seed, r, c) % 3)) ctx.fillRect(ax + cw * 0.5 + c * cw * 1.1, ay + ch + r * ch * 2, cw * 0.6, ch);
          }
          break;
        }
        case 'barco': {
          const s = k * it.k, bob = Math.sin(now * 0.002 + it.x) * 0.04 * s;
          ctx.fillStyle = '#3b3f4a'; ctx.beginPath(); ctx.moveTo(bx - 0.7 * s, by - 0.15 * s + bob); ctx.lineTo(bx + 0.7 * s, by - 0.15 * s + bob); ctx.lineTo(bx + 0.5 * s, by + bob); ctx.lineTo(bx - 0.5 * s, by + bob); ctx.fill();
          poly([[bx, by - 1.9 * s + bob], [bx, by - 0.2 * s + bob], [bx + 0.9 * s, by - 0.25 * s + bob]], '#fbf3ea');
          poly([[bx - 0.05 * s, by - 1.6 * s + bob], [bx - 0.05 * s, by - 0.25 * s + bob], [bx - 0.6 * s, by - 0.28 * s + bob]], '#efe2d4');
          ctx.fillStyle = 'rgba(255,245,235,.25)'; ctx.fillRect(bx - 0.4 * s, by + bob + 1, 0.9 * s, 0.6 * s);
          break;
        }
        case 'junco': {
          ctx.strokeStyle = '#7f8a49'; ctx.lineWidth = Math.max(1, 0.05 * k);
          for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(bx + i * 0.06 * k, by); ctx.quadraticCurveTo(bx + i * 0.1 * k, by - it.h * k * 0.6, bx + i * 0.16 * k, by - it.h * k * (1 - Math.abs(i) * 0.12)); ctx.stroke(); }
          break;
        }
        case 'casa': drawCasa(it); break;
        case 'arbol': {
          shadowAt(it.x, it.z, 1.4, 0.2);
          const tw = 0.16 * k, top = by - it.tronco * k;
          const tg = ctx.createLinearGradient(bx - tw, 0, bx + tw, 0);
          tg.addColorStop(0, '#7a5a3e'); tg.addColorStop(1, '#3f2c1d');
          ctx.fillStyle = tg; ctx.fillRect(bx - tw / 2, top, tw, by - top);
          for (const [dx, dy, r] of it.blobs) {
            const cx = bx + dx * k, cy = top - (dy + 0.5) * k, rr = r * k;
            const g = ctx.createRadialGradient(cx - rr * 0.4, cy - rr * 0.45, rr * 0.1, cx, cy, rr);
            g.addColorStop(0, it.col[0]); g.addColorStop(0.55, it.col[1]); g.addColorStop(1, it.col[2]);
            ellipse(cx, cy, rr, rr * 0.92, g);
          }
          break;
        }
        case 'farol': {
          const [, ly] = P(it.x, 1.66, it.z);
          ellipse(bx, by, 1.1 * k, 0.22 * k, 'rgba(255,214,150,.16)');
          if (night > 0) lights.push({ t: 'glow', x: bx, y: ly, r: 1.4 * k, c: '255,200,120', a: 0.45 }, { t: 'glow', x: bx, y: by, r: 1.1 * k, c: '255,210,140', a: 0.2 });
          ctx.strokeStyle = '#2b2b31'; ctx.lineWidth = Math.max(1, 0.06 * k);
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, ly); ctx.stroke();
          box(it.x - 0.13, it.x + 0.13, 1.62, 1.8, it.z - 0.13, it.z + 0.13, { front: '#2b2b31', side: '#202026', top: '#3a3a42' });
          ctx.fillStyle = '#ffe2a2'; ctx.fillRect(bx - 0.1 * k, ly - 0.02 * k, 0.2 * k, 0.07 * k);
          const g = ctx.createRadialGradient(bx, ly, 0, bx, ly, 1.1 * k);
          g.addColorStop(0, 'rgba(255,214,140,.45)'); g.addColorStop(1, 'rgba(255,214,140,0)');
          ctx.fillStyle = g; ctx.fillRect(bx - 1.1 * k, ly - 1.1 * k, 2.2 * k, 2.2 * k);
          break;
        }
        case 'carrito': {
          const x = it.x, z = it.z;
          shadowAt(x + 0.9, z, 1.1, 0.25);
          for (const wx of [0.35, 1.45]) { const [wx1, wy1] = P(x + wx, 0.18, z - 0.5); ellipse(wx1, wy1, 0.2 * k, 0.2 * k, '#222'); }
          box(x, x + 1.8, 0.2, 0.7, z - 0.5, z + 0.5, { front: '#f3f1ec', side: '#d3d0c8', top: '#e8e5de' });
          box(x + 0.5, x + 1.25, 0.7, 1.05, z - 0.4, z + 0.4, { front: '#38465a', side: '#2c3747', top: '#45556b' });
          ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = Math.max(1, 0.05 * k);
          for (const px of [0.25, 1.55]) { const p = P(x + px, 0.7, z - 0.45), q = P(x + px, 1.55, z - 0.45); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
          box(x + 0.1, x + 1.7, 1.55, 1.63, z - 0.55, z + 0.55, { front: '#ececec', side: '#cfcfcf', top: '#fafafa' });
          for (const wx of [0.35, 1.45]) { const [wx1, wy1] = P(x + wx, 0.18, z - 0.5); ellipse(wx1, wy1, 0.19 * k, 0.19 * k, '#1d1d1f'); ellipse(wx1, wy1, 0.08 * k, 0.08 * k, '#9aa0a8'); }
          break;
        }
        case 'pasto': {
          for (let i = -3; i <= 3; i++) {
            ctx.strokeStyle = i % 2 ? '#3f7a2a' : '#6aa843'; ctx.lineWidth = Math.max(1, 0.035 * k);
            ctx.beginPath(); ctx.moveTo(bx + i * 0.025 * k, by);
            ctx.quadraticCurveTo(bx + i * 0.05 * k, by - it.h * k * 0.6, bx + i * 0.09 * k + Math.sin(now * 0.003 + it.x) * 0.03 * k, by - it.h * k * (1 - Math.abs(i) * 0.1));
            ctx.stroke();
          }
          break;
        }
        case 'agapanto': {
          ctx.strokeStyle = '#4f8a35'; ctx.lineWidth = Math.max(1, 0.03 * k);
          const tx = bx + 0.03 * k, ty = by - it.h * k;
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
          for (let i = 0; i < 9; i++) {
            const an = i / 9 * Math.PI * 2, r = 0.09 * k;
            ellipse(tx + Math.cos(an) * r, ty + Math.sin(an) * r * 0.8, 0.045 * k, 0.045 * k, i % 2 ? '#7c80dd' : '#a8abf4');
          }
          ellipse(tx, ty, 0.05 * k, 0.05 * k, '#c9cbff');
          for (let i = -2; i <= 2; i++) { ctx.strokeStyle = '#3f7a2a'; ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + i * 0.12 * k, by - 0.12 * k, bx + i * 0.2 * k, by - 0.05 * k); ctx.stroke(); }
          break;
        }
        case 'baliza': {
          box(it.x - 0.06, it.x + 0.06, 0, 0.32, it.z - 0.06, it.z + 0.06, { front: '#2f3036', side: '#25262b', top: '#3d3e45' });
          const [lx, ly] = P(it.x, 0.28, it.z - 0.07);
          ctx.fillStyle = '#ffe2a2'; ctx.fillRect(lx - 0.05 * k, ly, 0.1 * k, 0.04 * k);
          if (night > 0) lights.push({ t: 'glow', x: lx, y: ly, r: 0.45 * k, c: '255,210,140', a: 0.4 });
          ellipse(bx, by, 0.4 * k, 0.1 * k, 'rgba(255,214,150,.2)');
          break;
        }
        case 'cartel': {
          ctx.strokeStyle = '#6b6f76'; ctx.lineWidth = Math.max(1, 0.05 * k);
          const top = P(it.x, 1.1, it.z), bot = P(it.x + 1.3, 0.55, it.z);
          ctx.beginPath(); ctx.moveTo(bx + 0.65 * k, by); ctx.lineTo(bx + 0.65 * k, bot[1]); ctx.stroke();
          ctx.fillStyle = '#c0392b'; ctx.fillRect(top[0], top[1], bot[0] - top[0], bot[1] - top[1]);
          ctx.fillStyle = '#fbfaf6'; ctx.fillRect(top[0] + 0.04 * k, top[1] + 0.04 * k, bot[0] - top[0] - 0.08 * k, bot[1] - top[1] - 0.08 * k);
          ctx.fillStyle = '#c0392b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = `900 ${Math.round(0.15 * k)}px Chivo, sans-serif`;
          const mx = (top[0] + bot[0]) / 2, w = (bot[0] - top[0]) * 0.86;
          ctx.fillText('NO ALIMENTE', mx, top[1] + (bot[1] - top[1]) * 0.36, w);
          ctx.fillText('A LOS CARPINCHOS', mx, top[1] + (bot[1] - top[1]) * 0.7, w);
          break;
        }
      }
    }

    function drawCasa(it) {
      const { x, z, w, d, h } = it, k = F / z;
      shadowAt(x + w / 2 + 0.6, z - 0.3, w * 0.6, 0.18);
      const wall = { front: '#f0ece4', side: '#cfc8bb', top: '#bdb5a8' };
      box(x, x + w, 0, h, z, z + d, wall);
      if (it.pisos === 2) box(x + w * 0.35, x + w, h, h * 1.9, z + 0.4, z + d, wall);
      const roofH = it.pisos === 2 ? h * 1.9 : h;
      box(x - 0.2, x + w + 0.2, roofH, roofH + 0.16, z - 0.25, z + d + 0.1, { front: '#46423f', side: '#36332f', top: '#5b5651' });
      if (it.pisos === 2) box(x - 0.15, x + w * 0.35, h, h + 0.12, z - 0.2, z + 0.4, { front: '#46423f', side: '#36332f', top: '#5b5651' });
      if (it.madera) { const a = P(x + w * 0.05, h * 0.92, z), b = P(x + w * 0.3, 0, z); const g = ctx.createLinearGradient(a[0], 0, b[0], 0); g.addColorStop(0, '#a77650'); g.addColorStop(1, '#7e5536'); ctx.fillStyle = g; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
      // ventanales
      const wins = [[0.36, 0.62, 0.1, 0.78], [0.66, 0.95, 0.1, 0.78]];
      if (it.pisos === 2) wins.push([0.42, 0.95, 1.12, 1.75]);
      wins.forEach(([u0, u1, v0, v1], i) => {
        const a = P(x + w * u0, h * v1, z - 0.01), b = P(x + w * u1, h * v0, z - 0.01);
        const lit = (it.luz >> i) & 1;
        if (lit && night > 0) lights.push({ t: 'glow', x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, r: Math.max(b[0] - a[0], b[1] - a[1]), c: '255,190,110', a: 0.3 });
        const g = ctx.createLinearGradient(0, a[1], 0, b[1]);
        if (lit) { g.addColorStop(0, '#ffe1a6'); g.addColorStop(1, '#f2a85c'); } else { g.addColorStop(0, '#b9cbe0'); g.addColorStop(0.6, '#e8cfae'); g.addColorStop(1, '#7c8ba3'); }
        ctx.fillStyle = '#3d3a37'; ctx.fillRect(a[0] - 0.05 * k, a[1] - 0.05 * k, b[0] - a[0] + 0.1 * k, b[1] - a[1] + 0.1 * k);
        ctx.fillStyle = g; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
        ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(a[0] + (b[0] - a[0]) * 0.1, a[1], (b[0] - a[0]) * 0.08, b[1] - a[1]);
        ctx.fillStyle = '#3d3a37'; ctx.fillRect((a[0] + b[0]) / 2 - 0.02 * k, a[1], 0.04 * k, b[1] - a[1]);
      });
      // ligustrina adelante
      box(x - 0.1, x + w + 0.1, 0, 0.45, z - 0.6, z - 0.15, { front: '#3c7533', side: '#2f5f28', top: '#5c9a47' });
    }

    /* ---------- obstáculos ---------- */
    function drawObstacle(o, ox, part, now) {
      const s = F / Z0, z = Z0;
      switch (o.kind) {
        case 'seto': {
          if (part !== 'mid') return;
          const r = box(ox, ox + o.w, 0, 0.55, z - 0.45, z + 0.45, { front: '#3a7431', side: '#2c5c26', top: '#5f9e48' });
          const rr = mulberry32(o.id * 31 + 7);
          for (let i = 0; i < 16; i++) ellipse(r.x + rr() * r.w, r.y + rr() * r.h, (0.05 + rr() * 0.05) * s, (0.05 + rr() * 0.05) * s, rr() < 0.5 ? '#4a8a3d' : '#2b5a25');
          for (let i = 0; i <= 6; i++) ellipse(r.x + r.w * i / 6, r.y, 0.07 * s, 0.05 * s, '#6aa851');
          const g = ctx.createLinearGradient(0, r.y + r.h * 0.6, 0, r.y + r.h);
          g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.3)');
          ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
          break;
        }
        case 'cono': if (part === 'mid') cone(ox + 0.21); break;
        case 'conos': {
          if (part !== 'mid') return;
          cone(ox + 0.21); cone(ox + o.w - 0.21);
          const a = P(ox + 0.21, 0.42, z), b = P(ox + o.w - 0.21, 0.42, z), n = 6, th = 0.05 * s;
          for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? '#f4f4f4' : '#d6342c'; ctx.fillRect(a[0] + (b[0] - a[0]) * i / n, a[1] - th / 2, (b[0] - a[0]) / n + 0.5, th); }
          break;
        }
        case 'lomo': {
          if (part !== 'mid') return;
          // lomo bajo y redondeado: una loma de asfalto con franjas pintadas en diagonal
          const z0 = PATH_NEAR + 0.15, z1 = PATH_FAR - 0.15, prof = [0, 0.12, 0.18, 0.2, 0.18, 0.12, 0];
          const pts = prof.map((y, i) => P(ox + o.w * i / (prof.length - 1), y, z0));
          const back = prof.map((y, i) => P(ox + o.w * i / (prof.length - 1), y, z1)).reverse();
          poly([...pts, ...back], '#4a4a4f');
          const n = Math.round(o.w / 0.22);
          for (let i = 0; i < n; i += 2) {
            const u0 = i / n, u1 = (i + 1) / n, sh = 0.18;
            const yAt = u => { const f = u * (prof.length - 1), j = Math.min(prof.length - 2, Math.floor(f)); return prof[j] + (prof[j + 1] - prof[j]) * (f - j); };
            poly([P(ox + o.w * u0, yAt(u0), z0), P(ox + o.w * u1, yAt(u1), z0),
              P(ox + o.w * Math.min(1, u1 + sh), yAt(Math.min(1, u1 + sh)), z1), P(ox + o.w * Math.min(1, u0 + sh), yAt(Math.min(1, u0 + sh)), z1)], '#f0be2c');
          }
          poly(pts.concat([P(ox + o.w, 0, z0), P(ox, 0, z0)]), '#34343a');
          for (let i = 0; i < n; i += 2) {
            const a = P(ox + o.w * i / n, 0, z0), b = P(ox + o.w * (i + 1) / n, 0, z0);
            const ya = pts[Math.min(pts.length - 1, Math.round(i / n * (prof.length - 1)))][1];
            ctx.fillStyle = '#d9a823'; ctx.fillRect(a[0], ya, b[0] - a[0], a[1] - ya);
          }
          break;
        }
        case 'tacho': {
          if (part !== 'mid') return;
          const cx = ox + 0.25, a = P(cx - 0.25, 0.56, z), b = P(cx + 0.25, 0, z);
          const g = ctx.createLinearGradient(a[0], 0, b[0], 0);
          g.addColorStop(0, '#6db26a'); g.addColorStop(0.45, '#3c7d42'); g.addColorStop(1, '#1d4824');
          ctx.fillStyle = g; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
          ctx.fillStyle = 'rgba(0,0,0,.18)';
          for (let i = 1; i < 5; i++) ctx.fillRect(a[0] + (b[0] - a[0]) * i / 5, a[1], 1, b[1] - a[1]);
          const lt = P(cx, 0.62, z + 0.27), lb = P(cx, 0.62, z - 0.27), lc = (lt[1] + lb[1]) / 2;
          ctx.fillStyle = '#2a5f31'; ctx.fillRect(a[0] - 0.02 * s, P(0, 0.62, z)[1], b[0] - a[0] + 0.04 * s, P(0, 0.54, z)[1] - P(0, 0.62, z)[1]);
          ellipse((a[0] + b[0]) / 2, lc, 0.27 * s, Math.max(1, (lb[1] - lt[1]) / 2), '#4f9a55');
          ellipse((a[0] + b[0]) / 2 - 0.05 * s, lc - 0.01 * s, 0.14 * s, Math.max(1, (lb[1] - lt[1]) / 4), 'rgba(255,255,255,.2)');
          break;
        }
        case 'barrera': {
          if (part === 'back') {
            box(ox, ox + 0.2, 0, 0.95, z + 0.95, z + 1.15, { front: '#f4f4f4', side: '#cfcfcf', top: '#ffffff' });
            box(ox - 0.01, ox + 0.21, 0.6, 0.72, z + 0.94, z + 1.16, { front: '#d6342c', side: '#a8261f', top: '#e85a50' });
            box(ox + 0.03, ox + 0.17, 0.95, 1.03, z + 0.98, z + 1.12, { front: '#f2c230', side: '#c99a1d', top: '#ffe07a' });
          } else if (part === 'front') {
            const segs = 8, z0 = z - 1.05, z1 = z + 1.0;
            for (let i = segs - 1; i >= 0; i--) {
              const a = z0 + (z1 - z0) * i / segs, b = z0 + (z1 - z0) * (i + 1) / segs;
              box(ox, ox + 0.2, 0.52, 0.62, a, b, i % 2 ? { front: '#d6342c', side: '#a8261f', top: '#e85a50' } : { front: '#f4f4f4', side: '#cfcfcf', top: '#ffffff' });
            }
          }
          break;
        }
        case 'pelota': {
          if (part !== 'front') return;
          const [cx, cy] = P(ox + 0.09, 0.6, z), r = 0.09 * s;
          const tg = ctx.createLinearGradient(cx, 0, cx + 1.2 * s, 0);
          tg.addColorStop(0, 'rgba(255,255,255,.55)'); tg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = tg; ctx.fillRect(cx, cy - r * 0.7, 1.2 * s, r * 1.4);
          const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
          g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#dfe3e8'); g.addColorStop(1, '#9aa3ad');
          ellipse(cx, cy, r, r, g);
          for (let i = 0; i < 5; i++) ellipse(cx + Math.cos(i * 1.3 + now * 0.02) * r * 0.5, cy + Math.sin(i * 1.3) * r * 0.5, r * 0.12, r * 0.12, 'rgba(0,0,0,.12)');
          break;
        }
        case 'tero': {
          if (part !== 'back') return; // por detrás del carpincho: las alas bajan sin atravesarlo
          const img = IMG().tero;
          const [cx, cy] = P(ox + 0.25, 0.74, z + 0.05);
          if (img) {
            const fw = img.width / TERO_FRAMES, f = Math.floor(now / 70) % TERO_FRAMES, w = 0.8 * s, h = w * img.height / fw;
            ctx.drawImage(img, f * fw, 0, fw, img.height, cx - w / 2, cy - h * 0.62, w, h); // el cuerpo está a 0,62 del alto
          } else drawTeroCode(cx, cy, s, now);
          break;
        }
        case 'dron': {
          if (part !== 'front') return;
          const cx = ox + 0.275, bob = Math.sin(now * 0.006) * 0.02, y = 0.55 + bob;
          box(cx - 0.15, cx + 0.15, y, y + 0.08, z - 0.15, z + 0.15, { front: '#2f3238', side: '#24272c', top: '#454a52' });
          for (const [dx, dz] of [[-0.24, -0.2], [0.24, -0.2], [-0.24, 0.2], [0.24, 0.2]]) {
            const p = P(cx + dx, y + 0.1, z + dz), q = P(cx + dx * 0.4, y + 0.06, z + dz * 0.4);
            ctx.strokeStyle = '#3a3e45'; ctx.lineWidth = Math.max(1, 0.03 * s); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
            ellipse(p[0], p[1], 0.14 * s, 0.03 * s, 'rgba(220,230,240,.45)');
            ctx.fillStyle = 'rgba(255,255,255,.7)'; const sp = Math.sin(now * 0.08 + dx * 9) * 0.13 * s; ctx.fillRect(p[0] + sp - 1, p[1] - 1, 2, 2);
          }
          const [lx, ly] = P(cx, y + 0.04, z - 0.16);
          ellipse(lx, ly, 0.035 * s, 0.035 * s, '#111');
          if (Math.floor(now / 300) % 2) ellipse(lx + 0.1 * s, ly - 0.02 * s, 0.02 * s, 0.02 * s, '#ff3b30');
          break;
        }
      }
    }

    function cone(cx) {
      const z = Z0, s = F / z;
      box(cx - 0.21, cx + 0.21, 0, 0.04, z - 0.21, z + 0.21, { front: '#c8561a', side: '#a2440f', top: '#e2742c' });
      const pts = [P(cx - 0.15, 0.04, z), P(cx + 0.15, 0.04, z), P(cx + 0.035, 0.55, z), P(cx - 0.035, 0.55, z)];
      poly(pts, '#f07020');
      const band = (y0, y1) => { const w0 = 0.15 - 0.115 * (y0 - 0.04) / 0.51, w1 = 0.15 - 0.115 * (y1 - 0.04) / 0.51; poly([P(cx - w0, y0, z), P(cx + w0, y0, z), P(cx + w1, y1, z), P(cx - w1, y1, z)], '#f6f6f6'); };
      band(0.18, 0.25); band(0.34, 0.4);
      const g = ctx.createLinearGradient(pts[0][0], 0, pts[1][0], 0);
      g.addColorStop(0, 'rgba(255,255,255,.25)'); g.addColorStop(0.4, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.3)');
      poly(pts, g);
      void s;
    }

    function drawTeroCode(cx, cy, s, now) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(-s, -s);
      const f = Math.sin(now * 0.025);
      ctx.fillStyle = '#6f6b63'; ctx.beginPath(); ctx.moveTo(0, 0.02); ctx.lineTo(-0.2, 0.02 + f * 0.25); ctx.lineTo(-0.05, 0.05); ctx.fill();
      ellipse(0, 0, 0.2, 0.075, '#8d887d');
      ellipse(-0.02, -0.03, 0.15, 0.04, '#f2f0ea');
      ellipse(0.1, 0.0, 0.06, 0.06, '#1d1d1d');
      ellipse(0.18, 0.05, 0.065, 0.06, '#9a958b');
      ellipse(0.21, 0.06, 0.015, 0.015, '#e33');
      ctx.fillStyle = '#d78b8b'; ctx.beginPath(); ctx.moveTo(0.24, 0.05); ctx.lineTo(0.31, 0.04); ctx.lineTo(0.24, 0.03); ctx.fill();
      ctx.fillStyle = '#8d887d'; ctx.beginPath(); ctx.moveTo(0.02, 0.04); ctx.lineTo(-0.16, 0.04 + f * 0.3); ctx.lineTo(-0.03, 0.06); ctx.fill();
      ctx.restore();
    }

    /* ---------- el carpincho ---------- */
    function drawPlayer(now, dt) {
      const s = F / Z0, im = IMG();
      const running = S.started && S.alive && S.y === 0 && !S.duck;
      const phase = (S.d * 0.9) % 1, wave = im.corre ? 0 : Math.sin(phase * 2 * Math.PI);
      // con el dibujo en código simula el galope; la tira del video ya trae su propio movimiento
      const bob = running && !im.corre ? (1 - Math.cos(phase * 2 * Math.PI)) * 0.5 * 0.045 : 0;
      const [sx, sy] = P(S.d, S.y + bob, Z0);
      // en el aire se inclina siguiendo la velocidad, sin saltos bruscos
      const targetRot = S.y > 0 ? Math.max(-0.22, Math.min(0.22, -S.vy * 0.03)) : 0;
      S.rot += (targetRot - S.rot) * Math.min(1, dt / 70);
      // se estira al subir y bajar rápido, y se aplasta un instante al caer o al agacharse
      let kx = 1, ky = 1;
      if (S.y > 0) { const u = Math.min(1, Math.abs(S.vy) / JUMP_V); ky = 1 + 0.07 * u; kx = 1 - 0.05 * u; }
      if (S.landT > 0) { const e = Math.sin(S.landT / 0.18 * Math.PI / 2); ky *= 1 - 0.13 * e; kx *= 1 + 0.09 * e; }
      if (S.duckT > 0) ky *= 1 + 0.25 * S.duckT / 0.12;
      // cada frame: [imagen, transparencia, cuadro de la tira (o -1 si es una imagen sola)]
      let frames = [], ww = 1.3, vs = 1;
      if (S.y > 0 && im.salto) frames = [[im.salto, 1, -1]];
      else if (S.duck && im.agachado) { frames = [[im.agachado, 1, -1]]; ww = 1.45; vs = 0.8; }
      else if (im.corre) frames = [[im.corre, 1, running ? Math.floor((S.d / RUN_CYCLE % 1) * RUN_FRAMES) : 0]];
      ctx.save();
      ctx.translate(sx, sy - 0.35 * s);
      if (S.crash) {
        const t = Math.min(1, S.crash.t / 450);
        ctx.translate(-0.2 * s * t, -Math.sin(t * Math.PI) * 0.4 * s);
        ctx.rotate(-t * 0.9);
      } else ctx.rotate(S.rot + (running ? wave * 0.025 : 0));
      ctx.translate(0, 0.35 * s);
      if (frames.length) {
        for (const [img, a, f] of frames) {
          const sw = f < 0 ? img.width : img.width / RUN_FRAMES;
          const dw = ww * s * kx, dh = ww * s * img.height / sw * vs * ky;
          ctx.globalAlpha = a;
          // alineado por la trompa: no salta al cambiar de pose
          if (f < 0) ctx.drawImage(img, NOSE * 1.1 * s - dw, -dh, dw, dh);
          else ctx.drawImage(img, f * sw, 0, sw, img.height, NOSE * 1.1 * s - dw, -dh, dw, dh);
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.scale(s * kx, -s * ky * (S.duck ? 0.65 : 1));
        paintCarpincho(ctx, S.d * 9, S.y > 0, S.duck);
      }
      ctx.restore();
      if (S.crash) {
        for (let i = 0; i < 3; i++) {
          const an = now * 0.006 + i * 2.1, [hx, hy] = P(S.d + 0.3, 0.95, Z0);
          star(hx + Math.cos(an) * 0.3 * s, hy + Math.sin(an) * 0.08 * s, 0.07 * s);
        }
      }
    }
    function star(x, y, r) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fillStyle = '#ffd23f'; ctx.fill();
    }

    function drawHints(now) {
      const a = S.started ? Math.max(0, 1 - (S.startT - 2) / 1.5) : 1;
      if (a <= 0) return;
      const r = Math.min(W, H) * 0.085, y = H - r * 1.9;
      ctx.save(); ctx.globalAlpha = a;
      [[W * 0.2, '▼', 'AGACHARSE'], [W * 0.8, '▲', 'SALTAR']].forEach(([x, ar, lbl]) => {
        ellipse(x, y, r, r, 'rgba(20,18,30,.38)');
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `900 ${Math.round(r * 0.8)}px Chivo, sans-serif`; ctx.fillText(ar, x, y + r * 0.04);
        ctx.font = `800 ${Math.round(r * 0.32)}px Chivo, sans-serif`; ctx.fillText(lbl, x, y + r * 1.4);
      });
      ctx.restore();
      void now;
    }

    function draw(dt, now) {
      st.begin();
      W = st.w; H = st.h;
      F = Math.min(1.1 * W, 1.5 * H);
      yh = H * 0.36;
      camY = (H * 0.7 - yh) * Z0 / F;
      camX = S.d + 0.32 * W * Z0 / F;
      ctx.save();
      if (S.shake > 0) { ctx.translate((Math.random() - 0.5) * S.shake * 12, (Math.random() - 0.5) * S.shake * 8); S.shake = Math.max(0, S.shake - dt / 600); }
      if (S.crash) S.crash.t += dt;

      const items = sceneItems();
      night = Math.max(0, Math.min(1, (S.d - NIGHT_AT) / NIGHT_LEN));
      lights = [];
      drawSky(now);
      const syBank = drawWater(items, now);
      drawGround(syBank);
      let i = 0;
      for (; i < items.length && items[i].z > 15; i++) drawItem(items[i], now);
      // bruma: lo lejano se ve más claro y cálido
      const hz = ctx.createLinearGradient(0, yh, 0, P(0, 0, 13)[1]);
      const hc = mix('#ffd6b0', '#28325c', night).slice(4, -1);
      hz.addColorStop(0, `rgba(${hc},.38)`); hz.addColorStop(1, `rgba(${hc},0)`);
      ctx.fillStyle = hz; ctx.fillRect(-30, yh, W + 60, P(0, 0, 13)[1] - yh);
      for (; i < items.length && items[i].z > PATH_FAR; i++) drawItem(items[i], now);

      // sendero: sombras, obstáculos y el carpincho
      const vis = S.obs.map(o => [o, obsX(o)]).filter(([o, x]) => P(x + o.w, 0, Z0)[0] > -50 && P(x, 0, Z0)[0] < W + 80);
      for (const [o, x] of vis) shadowAt(x + o.w / 2, Z0 - 0.05, o.w * 0.55 + 0.1, o.low ? 0.3 : 0.16);
      shadowAt(S.d + 0.05, Z0 - 0.05, 0.55 * (1 - Math.min(0.5, S.y * 0.35)), 0.3 * (1 - Math.min(0.6, S.y * 0.5)));
      for (const p of S.parts) { const [x, y] = P(p.x, p.y, p.z), a = 1 - p.t / p.life; ellipse(x, y, (0.04 + p.t * 0.12) * F / Z0, (0.03 + p.t * 0.08) * F / Z0, `rgba(222,205,170,${0.5 * a})`); }
      for (const [o, x] of vis) drawObstacle(o, x, 'back', now);
      for (const [o, x] of vis) drawObstacle(o, x, 'mid', now);
      drawPlayer(now, dt);
      for (const [o, x] of vis) drawObstacle(o, x, 'front', now);

      for (; i < items.length; i++) drawItem(items[i], now);
      drawNight(now);

      // viñeta para darle profundidad
      const vg = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.4, W / 2, H * 0.55, Math.max(W, H) * 0.85);
      vg.addColorStop(0, 'rgba(30,10,40,0)'); vg.addColorStop(1, 'rgba(30,10,40,.4)');
      ctx.fillStyle = vg; ctx.fillRect(-30, -30, W + 60, H + 60);
      ctx.restore();
      drawHints(now);
    }

    /* ---------- controles: mitad derecha salta, mitad izquierda (apretada) agacha ---------- */
    function jump() {
      S.vy = JUMP_V; S.y = 0.0001; S.duckHeld = false; S.jumpBuf = 0;
      audio.tone(380, 0.14, 'triangle', 0.08, 0, 720); buzz(10);
    }
    function press(kind, on) {
      if (!S.alive) return;
      if (!S.started) { S.started = true; pill.hidden = true; }
      if (kind === 'jump' && on) { if (S.y === 0) jump(); else S.jumpBuf = JUMP_BUFFER; }
      if (kind === 'duck') { if (on && !S.duckHeld) audio.tone(240, 0.07, 'triangle', 0.05, 0, 160); S.duckHeld = on; }
    }
    let duckPointer = null;
    const onDown = e => {
      if (e.button > 0) return;
      audio.unlock();
      const r = el.getBoundingClientRect();
      if (e.clientX - r.left < r.width / 2) { duckPointer = e.pointerId; press('duck', true); } else press('jump', true);
    };
    const onUp = e => { if (e.pointerId === duckPointer) { duckPointer = null; press('duck', false); } };
    const keyOf = e => ({ arrowup: 'jump', w: 'jump', ' ': 'jump', arrowdown: 'duck', s: 'duck' })[e.key.toLowerCase()];
    const onKey = e => {
      if (e.target.closest && e.target.closest('input, textarea, button')) return;
      const k = keyOf(e);
      if (!k) return;
      e.preventDefault(); audio.unlock();
      if (e.type === 'keydown') { if (!e.repeat || k === 'duck') press(k, true); } else if (k === 'duck') press('duck', false);
    };
    const noMenu = e => e.preventDefault();
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('contextmenu', noMenu);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    report();
    const stop = startLoop((dt, now) => { update(dt); draw(dt, now); });

    return {
      destroy() {
        stop(); clearTimeout(endTimer); st.destroy(); pill.remove(); toast.remove();
        el.removeEventListener('pointerdown', onDown); el.removeEventListener('contextmenu', noMenu);
        window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey);
      },
      _state: S, _update: update, _draw: draw, _press: press, _obsX: obsX, _phys: { G, JUMP_V, speed },
    };
  },
};

// Carpincho dibujado en código (por si no cargaron las imágenes). Unidades del mundo, y para arriba.
function paintCarpincho(c, phase, air, duck) {
  const leg = (x, off, col) => {
    if (duck) return;
    const dx = air ? (off ? -0.03 : 0.03) : Math.sin(phase + off) * 0.06;
    const lift = air ? 0.07 : Math.max(0, Math.cos(phase + off)) * 0.07;
    c.fillStyle = col; rrect(c, x + dx - 0.05, lift, 0.1, 0.26 - lift, 0.04); c.fill();
  };
  leg(-0.24, Math.PI, '#4e321f'); leg(0.28, 0, '#4e321f');
  c.beginPath(); c.ellipse(-0.06, 0.37, 0.45, 0.22, 0, 0, Math.PI * 2);
  const g = c.createLinearGradient(0, 0.6, 0, 0.14);
  g.addColorStop(0, '#c08f5f'); g.addColorStop(0.55, '#93633d'); g.addColorStop(1, '#6a442a');
  c.fillStyle = g; c.fill();
  leg(-0.32, 0, '#6f4a2e'); leg(0.2, Math.PI, '#6f4a2e');
  rrect(c, 0.18, 0.2, 0.44, 0.34, 0.12); c.fillStyle = '#93633d'; c.fill();
  c.beginPath(); c.arc(0.27, 0.55, 0.05, 0, Math.PI * 2); c.fillStyle = '#7a5034'; c.fill();
  c.beginPath(); c.arc(0.43, 0.44, 0.03, 0, Math.PI * 2); c.fillStyle = '#1a120c'; c.fill();
  c.beginPath(); c.ellipse(0.6, 0.41, 0.015, 0.025, 0, 0, Math.PI * 2); c.fill();
}
