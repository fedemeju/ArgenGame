import * as T from '../js/tournament.js';
import { mulberry32 } from '../js/engine.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };

// Día argentino: 02:00 UTC del 16 sigue siendo 15 en Argentina
ok(T.todayAR(Date.UTC(2026, 9, 16, 2, 0)) === '2026-10-15', 'antes de las 3 UTC sigue siendo el día anterior en AR');
ok(T.todayAR(Date.UTC(2026, 9, 16, 3, 0)) === '2026-10-16', 'a las 00:00 AR cambia el día');
ok(T.dayDiff('2026-10-28', '2026-11-02') === 5, 'diferencia de días cruzando mes');

const g = { status: 'active', startDay: '2026-10-16' };
ok(T.phase(g, '2026-10-16').day === 0, 'día 1 el día que arranca');
ok(T.phase(g, '2026-10-25').phase === 'active' && T.phase(g, '2026-10-25').day === 9, 'día 10 sigue activo');
ok(T.phase(g, '2026-10-26').phase === 'finished', 'al día 11 terminó');
ok(T.phase({ status: 'waiting' }).phase === 'waiting', 'sin arrancar = esperando');

for (let s = 1; s < 300; s++) {
  const sch = T.makeSchedule(['a', 'b', 'c', 'd'], 10, mulberry32(s));
  if (sch.length !== 10 || sch.some((x, i) => i && x === sch[i - 1]) || new Set(sch.slice(0, 4)).size !== 4) { ok(false, 'sorteo ' + s + ': ' + sch); break; }
}
ok(true, 'sorteo: 10 días, sin repetir seguidos, usa los 4 antes de repetir');
ok(T.makeSchedule(['a'], 10, mulberry32(1)).every(x => x === 'a'), 'con un solo juego se repite');

// Changui
let p = T.emptyPlay('u', 1, 0);
p.used = 1; let r = T.applyResult(p, 2, 3);
ok(!r.counted && r.play.used === 0 && r.play.changuis === 1, 'menos de 3 puntos: changui y devuelve el intento');
p = r.play; p.used = 1; p = T.applyResult(p, 1, 3).play; p.used = 1; p = T.applyResult(p, 0, 3).play;
ok(p.changuis === 3 && p.used === 0, 'tres changuis usados');
p.used = 1; r = T.applyResult(p, 2, 3);
ok(r.counted && r.play.best === 2 && r.play.used === 1, 'sin changuis, el puntaje bajo cuenta');
p = r.play; p.used = 2; r = T.applyResult(p, 15, 3);
ok(r.play.best === 15, 'vale el mejor intento');
ok(!T.canStartAttempt({ used: 3 }) && T.canStartAttempt({ used: 2 }), 'máximo 3 intentos');

// Ranking con empates
const members = [{ uid: 'a', name: 'Ana' }, { uid: 'b', name: 'Beto' }, { uid: 'c', name: 'Caro' }, { uid: 'd', name: 'Dani' }];
const plays = [
  { uid: 'a', day: 0, best: 20 }, { uid: 'b', day: 0, best: 20 }, { uid: 'c', day: 0, best: 5 },
  { uid: 'a', day: 1, best: 3 }, { uid: 'c', day: 1, best: 30 }, { uid: 'd', day: 1, best: null },
];
const d0 = T.dailyRanking(members, plays, 0);
ok(d0.played[0].pos === 1 && d0.played[1].pos === 1 && d0.played[2].pos === 3, 'empate comparte puesto y el siguiente es 3°');
ok(d0.played[2].points === 6 && d0.pending.map(x => x.uid).join() === 'd', 'puntos por puesto y pendientes');
const tab = T.standings(members, plays, 1);
ok(tab[0].name === 'Ana' && tab[0].total === 18, 'tabla: Ana 10 + 8 = 18');
ok(tab.find(x => x.name === 'Caro').total === 16 && tab.find(x => x.name === 'Caro').wins === 1, 'tabla: Caro 6 + 10 = 16 con 1 día ganado');
ok(tab.find(x => x.name === 'Dani').total === 0, 'quien no jugó suma 0');

process.exit(fails ? 1 : 0);
