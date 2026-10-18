// Simula Pana Express sin navegador: un piloto mira el tránsito un instante adelante antes de cada salto.
// Sirve para ver que se puede cruzar (los primeros cruces tienen que salir siempre) y que la dificultad sube.
const noop = () => {};
const ctxProxy = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k.startsWith('create') ? () => ({ addColorStop: noop }) : noop)), set: (t, k, v) => { t[k] = v; return true; } });
const mkEl = () => ({
  style: {}, hidden: false, className: '', textContent: '', classList: { add: noop, remove: noop },
  appendChild: noop, remove: noop, addEventListener: noop, removeEventListener: noop,
  getContext: () => ctxProxy, getBoundingClientRect: () => ({ left: 0, top: 0, width: 375, height: 700 }), width: 0, height: 0,
});
globalThis.document = { createElement: () => mkEl() };
globalThis.window = globalThis;
globalThis.addEventListener = noop; globalThis.removeEventListener = noop;
globalThis.devicePixelRatio = 1;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = noop;
globalThis.localStorage = { getItem: () => null, setItem: noop };
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });

const { default: game } = await import('../games/pana.js');

// Piloto que planifica: busca (a lo ancho, en pasos de 50 ms y hasta 3 s) una secuencia de esperar,
// esquivar y avanzar que llegue a la fila de arriba sin que lo pise nadie, y la ejecuta.
const DT = 0.05;
const SAFE_TYPES = new Set(['vereda', 'cantero', 'colectora2']);
function plan(inst) {
  // primero intenta llegar entero al próximo lugar seguro; si no encuentra, una fila con margen
  const S = inst._state;
  let goal = S.row + 1;
  while (goal < S.row + 6 && !SAFE_TYPES.has(inst._lane(goal).type)) goal++;
  return search(inst, goal, 100, 0) || search(inst, S.row + 1, 60, 6);
}
function search(inst, goal, HORIZON, tail) {
  const S = inst._state, { COLS, SAFE_X } = inst._consts;
  const t0 = S.t, r0 = S.row, c0 = S.col;
  const cache = new Map();
  const cellOk = (r, c, k) => {
    const id = `${r},${c},${k}`;
    if (!cache.has(id)) cache.set(id, !inst._hitAt(r, c + SAFE_X, c + 1 - SAFE_X, t0 + k * DT));
    return cache.get(id);
  };
  const okRange = (r, c, ka, kb) => { for (let k = ka; k <= kb; k++) if (!cellOk(r, c, k)) return false; return true; };
  const key = (r, c, k) => `${r},${c},${k}`;
  const prev = new Map([[key(r0, c0, 0), null]]);
  const q = [[r0, c0, 0]];
  while (q.length) {
    const [r, c, k] = q.shift();
    if (r >= goal && okRange(r, c, k, k + tail)) {
      const steps = [];
      for (let cur = key(r, c, k); prev.get(cur); cur = prev.get(cur).from) steps.unshift(prev.get(cur));
      return { t0, steps: steps.filter(s => s.dc || s.dr) };
    }
    for (const [dc, dr, dk] of [[0, 0, 1], [0, 1, 2], [-1, 0, 2], [1, 0, 2], [0, -1, 2]]) {
      const nr = r + dr, nc = c + dc;
      if (nc < 0 || nc >= COLS || nr < 0 || nr < r0 - 1 || nr > goal) continue;
      const moving = dc || dr;
      if (moving && inst._blocked(nr, nc, t0 + k * DT)) continue;
      const L = inst._lane(nr);
      let nk = k + dk;
      if (moving && ((L.pozos && L.pozos.includes(nc)) || (L.sorpresa && L.sorpresa.kind === 'baldosa' && L.sorpresa.col === nc))) nk += 11;
      if (nk > HORIZON) continue;
      if (!okRange(r, c, k, k + 1) || !okRange(nr, nc, k + 1, nk)) continue;
      const nkey = key(nr, nc, nk);
      if (prev.has(nkey)) continue;
      prev.set(nkey, { from: key(r, c, k), dc, dr, k });
      q.push([nr, nc, nk]);
    }
  }
  return null;
}
let current = null;
export function pilot(inst) {
  const S = inst._state, { HOP_MS } = inst._consts;
  if (S.hopT < HOP_MS || S.stunT > 0 || S.queue.length) return;
  if (!current || !current.steps.length) {
    current = plan(inst);
    if (!current) return;
    current.row = S.row;
  }
  const next = current.steps[0];
  if (S.t >= current.t0 + next.k * DT - 1e-9) {
    current.steps.shift();
    inst._step(next.dc, next.dr);
  }
}

let deaths = {}, scores = [], earlyDeaths = 0;
for (let seed = 1; seed <= 40; seed++) {
  const inst = game.mount(mkEl(), { seed, onScore: noop, onEnd: noop });
  const S = inst._state;
  current = null;
  let t = 0;
  while (S.alive && t < 180000) { pilot(inst); inst._update(16); t += 16; }
  const key = S.alive ? 'vivo' : S.crash.kind;
  deaths[key] = (deaths[key] || 0) + 1;
  if (!S.alive && S.maxRow < 20) earlyDeaths++;
  scores.push(S.maxRow);
  inst.destroy();
}
scores.sort((a, b) => a - b);
console.log((earlyDeaths > 4 ? 'FAIL ' : 'OK   ') + `el piloto cruza las 2 primeras Panamericanas en ${40 - earlyDeaths} de 40 partidas`);
console.log('finales:', JSON.stringify(deaths));
console.log('carriles del piloto (mín / mediana / máx):', scores[0], scores[20], scores[39]);
process.exit(earlyDeaths > 4 ? 1 : 0);
