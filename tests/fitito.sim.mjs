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
    // Todo lo que ocupa la ruta con su largo (autos, camiones, pozos y la barrera del peaje), igual que el juego.
    const M = 2000 / 5.5, CAR_LEN = 3.3 * M;
    const all = [...S.obstacles.map(o => ({ o, l: inst._span(o), v: o.v || 0 })), ...inst._tolls.map(tl => ({ o: { z: tl.z, lane: tl.lane }, l: [-0.4 * M, 0], v: 0 }))];
    // tapados: carriles ocupados ahora mismo en la zona del Fitito
    if (new Set(all.filter(({ o, l }) => o.z + l[0] < pz + CAR_LEN && o.z + l[1] > pz).map(({ o }) => o.lane)).size >= 3) blocked++;
    // cuándo empieza y termina a ocupar la zona del Fitito cada cosa
    const win = ({ o, l, v }) => { const rel = Math.max(1, S.speed + v); return [(o.z + l[0] - pz - CAR_LEN) / rel, (o.z + l[1] - pz) / rel]; };
    const busyAt = (lane, t0, t1) => all.some(a => a.o.lane === lane && (([a0, a1]) => a0 < t1 && a1 > t0)(win(a)));
    // Piloto que planifica: busca, en pasos de 50 ms y hasta 2,5 s, una secuencia de quedarse o cambiar de carril
    // (un cambio tarda unos 0,15 s y mientras tanto ocupa los dos carriles) que no se cruce con nada.
    // Si este piloto choca, hubo una situación imposible.
    if (S.x === -1 + (2 * S.lane + 1) / 3 && t - lastMove > 60) {
      const DT = 0.05, H = 50, prev = new Map([[`${S.lane},0`, null]]), q = [[S.lane, 0]];
      let goal = null;
      while (q.length && !goal) {
        const [ln, k] = q.shift();
        if (k >= H) { goal = [ln, k]; break; }
        for (const d of [0, -1, 1]) {
          const nl = ln + d, nk = k + (d ? 3 : 1);
          if (nl < 0 || nl > 2 || prev.has(`${nl},${nk}`)) continue;
          const t0 = k * DT - 0.02, t1 = nk * DT + 0.02;
          if (busyAt(ln, t0, t1) || (d && busyAt(nl, t0, t1))) continue;
          prev.set(`${nl},${nk}`, [ln, k, d]); q.push([nl, nk]);
        }
      }
      if (goal) {
        let cur = `${goal[0]},${goal[1]}`, first = 0;
        while (prev.get(cur)) { const [pl, pk, d] = prev.get(cur); first = d; cur = `${pl},${pk}`; }
        if (first) { inst._move(first); lastMove = t; }
      }
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
