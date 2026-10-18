// Simula El Vuelo del Tero sin navegador: un piloto aletea apuntando al centro de cada hueco.
// Si el piloto choca, hay pares de Obeliscos imposibles de pasar (huecos muy chicos o muy desparejos).
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

const { default: game } = await import('../games/tero.js');

// el mismo piloto lo usa tools/ver-juego.html con &piloto=1
export function pilot(inst) {
  const S = inst._state, { PW, R } = inst._phys;
  const next = S.pipes.find(p => p.x + PW + R > S.x);
  if (!next) return;
  const target = (next.top + next.bot) / 2 + 0.025;
  if (S.y > target && S.vy > -0.15) inst._flap();
}

let deaths = {}, scores = [];
for (let seed = 1; seed <= 40; seed++) {
  const inst = game.mount(mkEl(), { seed, onScore: noop, onEnd: noop });
  const S = inst._state;
  inst._flap();
  let t = 0;
  while (S.alive && t < 180000) { pilot(inst); inst._update(16); t += 16; }
  const key = S.alive ? 'vivo' : S.crash;
  deaths[key] = (deaths[key] || 0) + 1;
  scores.push(S.passedN);
  inst.destroy();
}
scores.sort((a, b) => a - b);
const muertes = 40 - (deaths.vivo || 0);
console.log((muertes ? 'FAIL ' : 'OK   ') + 'el piloto pasa todo en 40 partidas de 3 min: ' + JSON.stringify(deaths));
console.log('Obeliscos pasados por el piloto (mín / mediana / máx):', scores[0], scores[20], scores[39]);
process.exit(muertes ? 1 : 0);
