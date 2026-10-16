// Reglas del desafío: días, intentos, changui y puntos. Funciones puras, sin DOM ni red.

export const DAYS = 10;
export const ATTEMPTS = 3;
export const CHANGUIS = 3;
export const MIN_PLAYERS = 2;
export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

const AR_OFFSET_MS = 3 * 3600 * 1000; // Argentina: UTC-3, sin horario de verano

export function todayAR(now = Date.now()) {
  return new Date(now - AR_OFFSET_MS).toISOString().slice(0, 10);
}

export function dayDiff(fromDay, toDay) {
  const p = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(toDay) - p(fromDay)) / 86400000);
}

export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// waiting: falta arrancar · active: día en curso (0..9) · finished: pasaron los 10 días
export function phase(group, today = todayAR()) {
  if (!group || group.status !== 'active' || !group.startDay) return { phase: 'waiting', day: -1 };
  const d = dayDiff(group.startDay, today);
  if (d >= DAYS) return { phase: 'finished', day: DAYS - 1 };
  return { phase: 'active', day: Math.max(0, d) };
}

// Sorteo de juegos: usa todos antes de repetir y nunca el mismo dos días seguidos.
export function makeSchedule(ids, n, rand) {
  const out = [];
  let bag = [];
  while (out.length < n) {
    if (!bag.length) {
      bag = ids.slice();
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    }
    let k = 0;
    if (ids.length > 1 && bag[0] === out[out.length - 1]) k = bag.length > 1 ? 1 : -1;
    if (k === -1) { bag = []; continue; }
    out.push(bag.splice(k, 1)[0]);
  }
  return out;
}

export function emptyPlay(uid, round, day) {
  return { uid, round, day, used: 0, changuis: 0, scores: [], best: null };
}

export function canStartAttempt(play) {
  return (play ? play.used : 0) < ATTEMPTS;
}

// Al terminar un intento: si no llegó al mínimo y le quedan changuis, el intento se devuelve.
export function applyResult(play, score, threshold) {
  const p = { ...play, scores: [...(play.scores || [])] };
  if (score < threshold && p.changuis < CHANGUIS) {
    p.changuis += 1;
    p.used = Math.max(0, p.used - 1);
    return { play: p, counted: false };
  }
  p.scores.push(score);
  p.best = p.best == null ? score : Math.max(p.best, score);
  return { play: p, counted: true };
}

export function dailyRanking(members, plays, day) {
  const rows = members.map(m => {
    const p = plays.find(x => x.uid === m.uid && x.day === day);
    return { uid: m.uid, name: m.name, best: p && p.best != null ? p.best : null, used: p ? p.used : 0 };
  });
  const played = rows.filter(r => r.best != null).sort((a, b) => b.best - a.best);
  let pos = 0, prev = null;
  played.forEach((r, i) => {
    if (r.best !== prev) { pos = i + 1; prev = r.best; }
    r.pos = pos;
    r.points = POINTS[pos - 1] || 0;
  });
  return { played, pending: rows.filter(r => r.best == null) };
}

export function standings(members, plays, lastDay) {
  const tot = new Map(members.map(m => [m.uid, { uid: m.uid, name: m.name, total: 0, wins: 0, days: 0 }]));
  for (let d = 0; d <= lastDay; d++) {
    for (const r of dailyRanking(members, plays, d).played) {
      const t = tot.get(r.uid);
      t.total += r.points; t.days += 1;
      if (r.pos === 1) t.wins += 1;
    }
  }
  const list = [...tot.values()].sort((a, b) => b.total - a.total || b.wins - a.wins || a.name.localeCompare(b.name));
  let pos = 0, prev = null;
  list.forEach((r, i) => {
    const key = r.total + ':' + r.wins;
    if (key !== prev) { pos = i + 1; prev = key; }
    r.pos = pos;
  });
  return list;
}
