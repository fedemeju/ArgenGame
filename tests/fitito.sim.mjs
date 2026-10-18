// Simula El Fitito sin navegador: piloto automático, controla que nunca queden los 3 carriles tapados.
const noop = () => {};
const ctxProxy = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop)), set: (t, k, v) => { t[k] = v; return true; } });
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
globalThis.performance = globalThis.performance || { now: () => Date.now() };
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });

const { default: game } = await import('../games/fitito.js');
const SEG = 200, PZ = 1150 / Math.tan(50 * Math.PI / 180);

let totalBlocked = 0, deaths = {}, cuadrasList = [];
for (let seed = 1; seed <= 40; seed++) {
  const inst = game.mount(mkEl(), { seed, onScore: noop, onEnd: noop });
  const S = inst._state;
  inst._move(0);
  let lastMove = -1e9, t = 0, blocked = 0;
  while (S.alive && t < 120000) {
    inst._update(16); t += 16;
    const pz = S.pos + PZ;
    // tapados: lo que está pasando por el auto en este momento (autos, pozos quietos y la barrera del peaje)
    const here = [...S.obstacles, ...inst._tolls.map(tl => ({ z: tl.z, lane: tl.lane, v: 0 }))].filter(o => Math.abs(o.z - pz) < SEG * 1.5);
    if (new Set(here.map(o => o.lane)).size >= 3) blocked++;
    // piloto: va al carril cuyo próximo obstáculo llega más tarde, de a un toque (la barrera del peaje cuenta)
    const all = [...S.obstacles, ...inst._tolls.map(tl => ({ z: tl.z, lane: tl.lane, v: 0 }))];
    const arr = o => (o.z - pz) / Math.max(1, S.speed + (o.v || 0));
    const first = l => Math.min(9, ...all.filter(o => o.lane === l && arr(o) > -0.08).map(arr));
    const f = [0, 1, 2].map(first);
    const target = [0, 1, 2].reduce((b, l) => (f[l] > f[b] + 0.05 || (Math.abs(f[l] - f[b]) <= 0.05 && Math.abs(l - S.lane) < Math.abs(b - S.lane))) ? l : b, S.lane);
    if (target !== S.lane && f[S.lane] < 1.3 && t - lastMove > 140) {
      const step = Math.sign(target - S.lane);
      if (f[S.lane + step] > 0.2) { inst._move(step); lastMove = t; }
    }
  }
  totalBlocked += blocked;
  const key = S.alive ? 'vivo a los 2 min' : (S.crash ? S.crash.kind : '?');
  deaths[key] = (deaths[key] || 0) + 1;
  cuadrasList.push(S.cuadras);
  inst.destroy();
}
cuadrasList.sort((a, b) => a - b);
console.log((totalBlocked ? 'FAIL ' : 'OK   ') + 'momentos con 3 carriles tapados: ' + totalBlocked);
console.log('finales:', JSON.stringify(deaths));
console.log('cuadras del piloto (mín / mediana / máx):', cuadrasList[0], cuadrasList[20], cuadrasList[39]);
process.exit(totalBlocked ? 1 : 0);
