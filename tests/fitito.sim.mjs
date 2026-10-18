// Simula El Fitito sin navegador y comprueba que el juego sea justo:
//  1. nunca quedan los 3 carriles tapados a la vez en la zona del Fitito;
//  2. siempre EXISTE una forma de sobrevivir: como el tráfico no depende de lo que hace el jugador,
//     se graba qué carril está ocupado en cada cuadro y se busca un camino (quedarse o cambiar de carril,
//     que tarda lo mismo que en el juego) que no choque nunca en 2 minutos.
//  3. ningún carril queda mucho tiempo sin tráfico.
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
const PZ = 1150 / Math.tan(50 * Math.PI / 180), M = 2000 / 5.5, CAR_LEN = 3.3 * M, CUADRA = 8000;
const DT = 16, CHANGE = 9;   // un cambio de carril tarda unos 0,11 s; se cuentan 9 cuadros (0,14 s) para ir seguros

let blockedTotal = 0, imposibles = 0, worstGap = 0;
for (let seed = 1; seed <= 40; seed++) {
  const inst = game.mount(mkEl(), { seed, onScore: noop, onEnd: noop });
  const S = inst._state;
  inst._move(0);
  const busy = [];                       // por cuadro: qué carriles están ocupados en la zona del Fitito
  const last = [0, 0, 0], seen = new Set();
  for (let t = 0; t < 120000; t += DT) {
    inst._update(DT);
    if (!S.alive) { S.alive = true; S.crash = null; }   // el auto no choca: solo se graba el tráfico
    const pz = S.pos + PZ;
    const all = [...S.obstacles.map(o => [o, inst._span(o)]), ...inst._tolls.map(tl => [{ z: tl.z, lane: tl.lane }, [-0.4 * M, 0]])];
    const b = [false, false, false];
    for (const [o, l] of all) if (o.z + l[0] < pz + CAR_LEN && o.z + l[1] > pz) b[o.lane] = true;
    busy.push(b);
    if (b[0] && b[1] && b[2]) blockedTotal++;
    for (const o of S.obstacles) if (!seen.has(o) && o.z < pz) {
      seen.add(o);
      if (S.pos > 20 * CUADRA) worstGap = Math.max(worstGap, (S.pos - last[o.lane]) / CUADRA);
      last[o.lane] = S.pos;
    }
  }
  inst.destroy();
  // ¿existe un camino? ok[l] = se puede estar en el carril l en este cuadro sin haber chocado
  let ok = [false, true, false];
  for (let f = 0; f + 1 < busy.length; f++) {
    const next = [0, 1, 2].map(l => ok[l] && !busy[f + 1][l]);
    for (const l of [0, 1, 2]) for (const d of [-1, 1]) {
      const n = l + d;
      if (!ok[l] || n < 0 || n > 2 || f + CHANGE >= busy.length) continue;
      let free = true;
      for (let g = f; g <= f + CHANGE; g++) if (busy[g][l] || busy[g][n]) { free = false; break; }
      if (free) busy[f + CHANGE].arrive = [...(busy[f + CHANGE].arrive || []), n];
    }
    for (const n of busy[f + 1].arrive || []) if (!busy[f + 1][n]) next[n] = true;
    ok = next;
    if (!ok.some(Boolean)) { imposibles++; console.log(`semilla ${seed}: sin salida a los ${(f * DT / 1000).toFixed(1)} s`); break; }
  }
}
console.log((blockedTotal ? 'FAIL ' : 'OK   ') + 'momentos con 3 carriles tapados: ' + blockedTotal);
console.log((imposibles ? 'FAIL ' : 'OK   ') + `partidas sin salida posible: ${imposibles} de 40`);
console.log((worstGap > 10 ? 'FAIL ' : 'OK   ') + `tramo más largo sin tráfico en un carril: ${worstGap.toFixed(1)} cuadras`);
process.exit(blockedTotal || imposibles || worstGap > 10 ? 1 : 0);
