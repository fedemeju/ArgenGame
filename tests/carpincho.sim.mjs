// Simula El Carpincho sin navegador: un piloto automático salta y se agacha justo a tiempo.
// Si el piloto choca, hay obstáculos imposibles de pasar (muy pegados o muy anchos).
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

const { default: game } = await import('../games/carpincho.js');
const NOSE = 0.55, TAIL = 0.5;

let deaths = {}, scores = [], kinds = {};
for (let seed = 1; seed <= 40; seed++) {
  const inst = game.mount(mkEl(), { seed, onScore: noop, onEnd: noop });
  const S = inst._state, { G, JUMP_V: V, speed } = inst._phys;
  // cuándo cruza el salto una altura h al subir
  const tUp = h => (V - Math.sqrt(Math.max(0, V * V - 2 * G * h))) / G;
  inst._press('jump', false);
  let t = 0;
  while (S.alive && t < 150000) {
    const v = speed(S.d);
    const next = S.obs.map(o => [o, inst._obsX(o)]).filter(([o, x]) => x + o.w > S.d - TAIL).sort((a, b) => a[1] - b[1])[0];
    if (next) {
      const [o, x] = next, rel = v + o.vx, tc = (x - (S.d + NOSE)) / rel;
      if (o.low) {
        if (S.duckHeld) inst._press('duck', false);
        if (S.y === 0 && tc <= tUp(o.y1) + 0.01) inst._press('jump', true);
      } else inst._press('duck', tc < (S.y > 0 ? 0.6 : 0.3));
    }
    inst._update(16); t += 16;
  }
  const key = S.alive ? 'vivo' : S.crash.kind;
  deaths[key] = (deaths[key] || 0) + 1;
  S.obs.forEach(o => { kinds[o.kind] = 1; });
  scores.push(S.score);
  inst.destroy();
}
scores.sort((a, b) => a - b);
const muertes = 40 - (deaths.vivo || 0);
console.log((muertes ? 'FAIL ' : 'OK   ') + 'el piloto pasa todo en 40 partidas de 2,5 min: ' + JSON.stringify(deaths));
console.log('metros del piloto (mín / mediana / máx):', scores[0], scores[20], scores[39]);
console.log('obstáculos vistos:', Object.keys(kinds).join(', '));
process.exit(muertes ? 1 : 0);
