import { connect } from './data.js';
import { GAMES, GAME_IDS } from '../games/index.js';
import * as T from './tournament.js';
import { loadCustomArt } from './art.js';
import { audio, mulberry32, hashSeed } from './engine.js';

const app = document.getElementById('app');
let api = null;
let current = null; // partida en curso: { abort() }

/* ---------- utilidades ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem('argengame:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('argengame:' + k, JSON.stringify(v)); } catch (e) {} },
};
const myName = () => ls.get('name', '');
const myGroups = () => ls.get('groups', []);
function rememberGroup(gid) {
  const g = myGroups().filter(x => x !== gid);
  g.unshift(gid);
  ls.set('groups', g.slice(0, 30));
}
const validId = gid => /^[A-Za-z0-9_-]{6,40}$/.test(gid || '');
const inviteUrl = gid => `${location.href.split('#')[0]}#/unirse/${gid}`;
const gameOf = id => GAMES[id] || GAMES[GAME_IDS[0]];
const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };
const SOUND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const SOUND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';

function view(html) {
  stopGame();
  document.body.classList.remove('playing');
  app.innerHTML = html;
  window.scrollTo(0, 0);
  paintIcons();
}
function stopGame() { if (current) { const c = current; current = null; c.abort(); } }
function loading() { view('<main class="screen center"><p class="muted loading">Cargando…</p></main>'); }
function paintIcons() {
  app.querySelectorAll('canvas[data-game]').forEach(c => {
    const g = GAMES[c.dataset.game];
    if (!g) return;
    const css = c.getBoundingClientRect().width || 56, px = Math.round(css * Math.min(3, devicePixelRatio || 1));
    c.width = c.height = px;
    g.icon(c.getContext('2d'), px);
  });
}
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}
function modeBanner() {
  if (api.error) return `<p class="banner warn">${esc(api.error)}</p>`;
  if (api.mode === 'local') return '<p class="banner">Modo prueba: los datos quedan solo en este celular, así que el link de invitación todavía no sirve en otros teléfonos. Falta conectar Firebase.</p>';
  return '';
}

/* ---------- router ---------- */
async function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  try {
    if (parts[0] === 'unirse' && validId(parts[1])) return await renderJoin(parts[1]);
    if (!myName()) return renderName();
    if (parts[0] === 'g' && validId(parts[1]) && parts[2] === 'jugar') return await renderRanked(parts[1]);
    if (parts[0] === 'g' && validId(parts[1])) return await renderGroup(parts[1]);
    if (parts[0] === 'practica' && GAMES[parts[1]]) return renderRules(GAMES[parts[1]], null);
    return await renderHome();
  } catch (e) {
    console.error(e);
    view(`<main class="screen center"><div class="card stack">
      <h2>Algo salió mal</h2>
      <p class="muted">No pudimos cargar esta pantalla. Revisá la conexión y probá de nuevo.</p>
      <button class="btn primary" id="retry">Reintentar</button>
      <a class="btn ghost" href="#/">Ir al inicio</a></div></main>`);
    document.getElementById('retry').onclick = route;
  }
}

/* ---------- nombre ---------- */
function renderName() {
  view(`<main class="screen center">
    <div class="brand"><h1 class="logo">Argen<span>Game</span></h1><p class="muted">Desafíos diarios entre amigos</p></div>
    <form id="f" class="card stack">
      <label for="nm">¿Cómo te dicen?</label>
      <input id="nm" maxlength="20" autocomplete="nickname" required placeholder="Ej: Fede" value="${esc(myName())}">
      <p class="muted small">Así te van a ver tus amigos en el ranking.</p>
      <button class="btn primary">Seguir</button>
    </form></main>`);
  const f = document.getElementById('f');
  f.onsubmit = e => {
    e.preventDefault();
    const n = f.nm.value.trim().slice(0, 20);
    if (!n) return;
    ls.set('name', n);
    route();
  };
  f.nm.focus();
}

/* ---------- inicio ---------- */
function statusLine(group, members) {
  const ph = T.phase(group);
  if (ph.phase === 'waiting') return `Esperando arrancar · ${members} ${members === 1 ? 'jugador' : 'jugadores'}`;
  if (ph.phase === 'finished') return `Terminado · ${members} jugadores`;
  return `Día ${ph.day + 1} de ${T.DAYS} · ${members} jugadores`;
}

async function renderHome() {
  loading();
  const ids = myGroups();
  const groups = (await Promise.all(ids.map(async gid => {
    try {
      const g = await api.getGroup(gid);
      if (!g) return null;
      const m = await api.listMembers(gid);
      return m.some(x => x.uid === api.uid) ? { g, n: m.length } : null;
    } catch (e) { return null; }
  }))).filter(Boolean);

  view(`<main class="screen">
    <header class="brandbar">
      <h1 class="logo small">Argen<span>Game</span></h1>
      <button id="rename" class="link">Hola, ${esc(myName())} · cambiar</button>
    </header>
    ${modeBanner()}
    <section class="stack">
      <h2>Mis desafíos</h2>
      ${groups.length ? `<ul class="list">${groups.map(({ g, n }) => `
        <li><a class="item" href="#/g/${esc(g.id)}">
          <span class="item-main"><b>${esc(g.name)}</b><span class="muted small">${esc(statusLine(g, n))}</span></span>
          <span class="chev" aria-hidden="true">›</span></a></li>`).join('')}</ul>`
        : '<p class="empty">Todavía no estás en ningún desafío. Creá uno y pasale el link a tus amigos, o abrí el link que te mandaron.</p>'}
      <button id="create" class="btn primary">Crear desafío</button>
      <form id="cf" class="card stack" hidden>
        <label for="gname">Nombre del desafío</label>
        <input id="gname" maxlength="32" required value="${esc('Desafío de ' + myName())}">
        <p class="muted small">Dura ${T.DAYS} días, con un juego al azar cada día y ${T.ATTEMPTS} intentos diarios. Arranca cuando haya al menos ${T.MIN_PLAYERS} jugadores.</p>
        <button class="btn primary">Crear y conseguir el link</button>
      </form>
    </section>
    <section class="stack">
      <h2>Práctica</h2>
      <p class="muted">Probá los juegos cuando quieras. No cuenta para ningún desafío.</p>
      <ul class="games">${GAME_IDS.map(id => `
        <li><a class="game-card" href="#/practica/${id}">
          <canvas class="gicon" data-game="${id}"></canvas>
          <span><b>${esc(GAMES[id].name)}</b><span class="muted small">${esc(GAMES[id].tagline)}</span></span></a></li>`).join('')}
      </ul>
      <p class="muted small">Pronto se suman más juegos.</p>
    </section>
  </main>`);

  document.getElementById('rename').onclick = renderName;
  const cf = document.getElementById('cf');
  document.getElementById('create').onclick = e => { e.currentTarget.hidden = true; cf.hidden = false; cf.gname.select(); };
  cf.onsubmit = async e => {
    e.preventDefault();
    const name = cf.gname.value.trim().slice(0, 32);
    if (!name) return;
    cf.querySelector('button').disabled = true;
    const gid = await api.createGroup(name, myName());
    rememberGroup(gid);
    go('#/g/' + gid);
  };
}

/* ---------- unirse ---------- */
async function renderJoin(gid) {
  loading();
  const group = await api.getGroup(gid);
  if (!group) {
    view(`<main class="screen center"><div class="card stack">
      <h2>No encontramos este desafío</h2>
      <p class="muted">Puede que el link esté cortado. Pedile el link de nuevo a quien te invitó.</p>
      <a class="btn" href="#/">Ir al inicio</a></div></main>`);
    return;
  }
  const members = await api.listMembers(gid);
  if (members.some(m => m.uid === api.uid)) { rememberGroup(gid); location.replace('#/g/' + gid); return; }
  const ph = T.phase(group);
  const note = ph.phase === 'finished' ? '<p class="banner warn">Este desafío ya terminó. Podés sumarte igual para la revancha.</p>'
    : ph.phase === 'active' ? `<p class="banner">Ya va por el día ${ph.day + 1}. Te sumás desde hoy.</p>` : '';

  view(`<main class="screen center">
    <div class="brand"><h1 class="logo small">Argen<span>Game</span></h1></div>
    <div class="card stack">
      <p class="eyebrow">${esc(group.ownerName)} te invitó a</p>
      <h1 class="title">${esc(group.name)}</h1>
      <p class="muted">Un desafío de ${T.DAYS} días: cada día un minijuego, ${T.ATTEMPTS} intentos, y gana el que suma más puntos.</p>
      ${note}
      <ul class="chips">${members.map(m => `<li>${esc(m.name)}</li>`).join('')}</ul>
      <form id="jf" class="stack">
        <label for="nm">Tu nombre</label>
        <input id="nm" maxlength="20" required autocomplete="nickname" placeholder="Ej: Fede" value="${esc(myName())}">
        <button class="btn primary">Sumarme</button>
      </form>
    </div>
    ${modeBanner()}
  </main>`);
  const f = document.getElementById('jf');
  f.onsubmit = async e => {
    e.preventDefault();
    const n = f.nm.value.trim().slice(0, 20);
    if (!n) return;
    f.querySelector('button').disabled = true;
    ls.set('name', n);
    await api.joinGroup(gid, n);
    rememberGroup(gid);
    go('#/g/' + gid);
  };
}

/* ---------- grupo ---------- */
async function loadGroup(gid) {
  const group = await api.getGroup(gid);
  if (!group) return null;
  const round = group.round || 1;
  const ph = T.phase(group);
  if (api.mode === 'local' && ph.phase !== 'waiting') await api.simulateBots(gid, round, ph.day);
  const [members, plays] = await Promise.all([api.listMembers(gid), api.getPlays(gid, round)]);
  return { group, round, ph, members, plays };
}

function inviteBlock(gid, group) {
  const url = inviteUrl(gid);
  const msg = `Sumate a mi desafío "${group.name}" en ArgenGame: ${url}`;
  return `<section class="card stack invite">
    <h2>Sumá amigos</h2>
    <p class="muted small">Mandales este link. Cuando lo abran, eligen su nombre y quedan adentro.</p>
    <input id="inv" readonly value="${esc(url)}" aria-label="Link de invitación">
    <div class="row">
      <button id="copy" class="btn">Copiar link</button>
      <a class="btn wa" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Mandar por WhatsApp</a>
    </div>
  </section>`;
}

function newSchedule(gid, round) {
  return T.makeSchedule(GAME_IDS, T.DAYS, mulberry32(hashSeed(gid + ':' + round)));
}

async function renderGroup(gid) {
  loading();
  const d = await loadGroup(gid);
  if (!d) { go('#/unirse/' + gid); return; }
  const { group, round, ph, members, plays } = d;
  if (!members.some(m => m.uid === api.uid)) { go('#/unirse/' + gid); return; }
  rememberGroup(gid);
  const isOwner = group.owner === api.uid;
  const you = uid => (uid === api.uid ? ' <span class="you">vos</span>' : '');

  let main = '';
  if (ph.phase === 'waiting') {
    const enough = members.length >= T.MIN_PLAYERS;
    main = `<section class="card stack">
      <p class="eyebrow">Todavía no arrancó</p>
      <h2>${members.length} de mínimo ${T.MIN_PLAYERS} jugadores</h2>
      <ul class="chips">${members.map(m => `<li>${esc(m.name)}</li>`).join('')}</ul>
      ${isOwner
        ? (enough ? `<p class="muted small">Cuando arranques, hoy es el día 1. Los que entren después se suman desde ese día.</p>
                     <button id="start" class="btn primary">Arrancar el desafío</button>`
                  : '<p class="muted small">Necesitás al menos un amigo más para arrancar. Pasale el link de abajo.</p>')
        : `<p class="muted small">Cuando estén todos, ${esc(group.ownerName)} arranca el desafío.</p>`}
      ${api.mode === 'local' && isOwner ? '<button id="bot" class="btn ghost">Sumar jugador de prueba</button>' : ''}
    </section>
    ${inviteBlock(gid, group)}`;
  } else {
    const lastDay = ph.day;
    const table = T.standings(members, plays, lastDay);
    const tableHtml = `<section class="stack">
      <h2>Tabla del desafío</h2>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>#</th><th>Jugador</th><th class="num">Puntos</th><th class="num">Días ganados</th></tr></thead>
        <tbody>${table.map(r => `<tr${r.uid === api.uid ? ' class="me"' : ''}><td>${r.pos}</td><td>${esc(r.name)}${you(r.uid)}</td><td class="num">${r.total}</td><td class="num">${r.wins}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="muted small">Cada día: 1° suma ${T.POINTS[0]}, 2° ${T.POINTS[1]}, 3° ${T.POINTS[2]}, 4° ${T.POINTS[3]}… Vale el mejor intento de cada uno.${ph.phase === 'active' ? ' Incluye el día de hoy, que sigue en juego.' : ''}</p>
    </section>`;

    const cal = `<section class="stack">
      <h2>Los ${T.DAYS} días</h2>
      <ol class="cal">${Array.from({ length: T.DAYS }, (_, i) => {
        const g = gameOf(group.schedule[i]);
        const date = T.addDays(group.startDay, i).slice(5).split('-').reverse().join('/');
        if (ph.phase === 'active' && i > ph.day) return `<li class="future"><span class="q">?</span><span class="small">Día ${i + 1}</span><span class="muted small">${date}</span></li>`;
        const w = T.dailyRanking(members, plays, i).played.filter(r => r.pos === 1).map(r => r.name).join(', ');
        const cls = ph.phase === 'active' && i === ph.day ? 'today' : 'past';
        return `<li class="${cls}"><canvas class="gicon sm" data-game="${esc(g.id)}"></canvas><span class="small">${cls === 'today' ? 'Hoy' : 'Día ' + (i + 1)}</span><span class="muted small">${cls === 'today' ? 'en juego' : (w ? '🏆 ' + esc(w) : 'nadie jugó')}</span></li>`;
      }).join('')}</ol>
    </section>`;

    if (ph.phase === 'active') {
      const game = gameOf(group.schedule[ph.day]);
      const mine = plays.find(p => p.uid === api.uid && p.day === ph.day) || T.emptyPlay(api.uid, round, ph.day);
      const left = T.ATTEMPTS - mine.used;
      const rk = T.dailyRanking(members, plays, ph.day);
      main = `<section class="card stack today-card">
        <div class="today-head">
          <canvas class="gicon lg" data-game="${esc(game.id)}"></canvas>
          <div><p class="eyebrow">Día ${ph.day + 1} de ${T.DAYS} · Juego de hoy</p><h2>${esc(game.name)}</h2><p class="muted small">${esc(game.tagline)}</p></div>
        </div>
        <div class="tries" aria-label="Intentos usados">${Array.from({ length: T.ATTEMPTS }, (_, i) => `<span class="dot${i < mine.used ? ' used' : ''}"></span>`).join('')}
          <span class="small">${left > 0 ? `Te ${left === 1 ? 'queda 1 intento' : `quedan ${left} intentos`}` : 'Sin intentos por hoy'} · Tu mejor: <b>${mine.best ?? '—'}</b></span></div>
        ${left > 0 ? `<a class="btn primary" href="#/g/${esc(gid)}/jugar">Ver reglas y jugar</a>`
                   : '<p class="muted small">Ya jugaste tus 3 intentos. Mañana hay otro juego.</p>'}
      </section>
      <section class="stack">
        <div class="row-between"><h2>Ranking de hoy</h2><button id="refresh" class="link">Actualizar</button></div>
        ${rk.played.length ? `<ol class="rank">${rk.played.map(r => `<li${r.uid === api.uid ? ' class="me"' : ''}><span class="pos">${r.pos}°</span><span class="nm">${esc(r.name)}${you(r.uid)}</span><span class="sc">${r.best}</span><span class="pts">+${r.points}</span></li>`).join('')}</ol>`
                            : '<p class="empty">Nadie jugó todavía hoy. ¡Arrancá vos!</p>'}
        ${rk.pending.length ? `<p class="muted small">Falta jugar: ${rk.pending.map(r => esc(r.name)).join(', ')}</p>` : ''}
      </section>
      ${tableHtml}${cal}${inviteBlock(gid, group)}`;
    } else {
      const winners = table.filter(r => r.pos === 1);
      main = `<section class="card stack winner">
        <p class="eyebrow">Desafío terminado</p>
        <h2>🏆 ${winners.map(w => esc(w.name)).join(' y ')} ${winners.length > 1 ? 'empataron' : 'ganó'}</h2>
        <p class="muted">${winners[0] ? `${winners[0].total} puntos en ${T.DAYS} días.` : ''}</p>
        ${isOwner ? '<button id="again" class="btn primary">Arrancar revancha</button>' : `<p class="muted small">${esc(group.ownerName)} puede arrancar la revancha.</p>`}
      </section>${tableHtml}${cal}`;
    }
  }

  view(`<main class="screen">
    <header class="top"><a class="back" href="#/">‹ Inicio</a><h1 class="title">${esc(group.name)}</h1></header>
    ${modeBanner()}
    ${main}
  </main>`);

  const $ = id => document.getElementById(id);
  if ($('copy')) $('copy').onclick = () => {
    const inp = $('inv'), url = inp.value;
    const ok = () => toast('Link copiado. Pegalo en el grupo.');
    const fail = () => { inp.focus(); inp.select(); toast('Copialo desde el cuadro.'); };
    try { navigator.clipboard.writeText(url).then(ok, fail); } catch (e) { fail(); }
  };
  if ($('start')) $('start').onclick = async e => {
    e.currentTarget.disabled = true;
    await api.updateGroup(gid, { status: 'active', startDay: T.todayAR(), schedule: newSchedule(gid, round), round });
    renderGroup(gid);
  };
  if ($('again')) $('again').onclick = async e => {
    e.currentTarget.disabled = true;
    await api.updateGroup(gid, { status: 'active', startDay: T.todayAR(), round: round + 1, schedule: newSchedule(gid, round + 1) });
    renderGroup(gid);
  };
  if ($('bot')) $('bot').onclick = async () => { await api.addBot(gid); renderGroup(gid); };
  if ($('refresh')) $('refresh').onclick = () => renderGroup(gid);
}

/* ---------- reglas y partida ---------- */
async function renderRanked(gid) {
  loading();
  const d = await loadGroup(gid);
  if (!d || !d.members.some(m => m.uid === api.uid) || d.ph.phase !== 'active') { go('#/g/' + gid); return; }
  const play = d.plays.find(p => p.uid === api.uid && p.day === d.ph.day) || T.emptyPlay(api.uid, d.round, d.ph.day);
  if (!T.canStartAttempt(play)) { toast('Ya usaste tus 3 intentos de hoy.'); go('#/g/' + gid); return; }
  const game = gameOf(d.group.schedule[d.ph.day]);
  renderRules(game, { gid, round: d.round, day: d.ph.day, play });
}

function renderRules(game, rk) {
  const back = rk ? `#/g/${rk.gid}` : '#/';
  const chLeft = rk ? T.CHANGUIS - rk.play.changuis : 0;
  view(`<main class="screen">
    <header class="top"><a class="back" href="${back}">‹ Volver</a></header>
    <section class="card stack rules">
      <canvas class="gicon xl" data-game="${esc(game.id)}"></canvas>
      <p class="eyebrow">${rk ? `Día ${rk.day + 1} · Intento ${rk.play.used + 1} de ${T.ATTEMPTS}` : 'Práctica · no cuenta'}</p>
      <h1 class="title">${esc(game.name)}</h1>
      <h2 class="h3">Cómo se juega</h2>
      <ul class="rulelist">${game.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      ${rk ? `<div class="howcount">
        <h2 class="h3">Cómo cuenta</h2>
        <ul class="rulelist">
          <li>Tenés ${T.ATTEMPTS} intentos por día y vale el mejor.</li>
          <li><b>Changui:</b> si hacés menos de ${game.threshold} puntos, el intento no cuenta y lo recuperás. Hasta ${T.CHANGUIS} por día; ${chLeft === 0 ? 'hoy ya los usaste todos' : `hoy te ${chLeft === 1 ? 'queda 1' : `quedan ${chLeft}`}`}.</li>
          <li><b>No hay pausa:</b> si salís de la app, cambiás de pestaña o bloqueás el celular, la partida termina con los puntos que tengas.</li>
          <li>Todos juegan la misma partida del día: la comida sale igual para todos.</li>
        </ul></div>` : ''}
      <button id="go" class="btn primary big">${rk ? `Jugar · intento ${rk.play.used + 1} de ${T.ATTEMPTS}` : 'Jugar'}</button>
    </section>
  </main>`);
  document.getElementById('go').onclick = e => { e.currentTarget.disabled = true; startPlay(game, rk); };
}

async function startPlay(game, rk) {
  audio.unlock();
  let n = 0;
  if (rk) {
    try {
      const p = await api.beginAttempt(rk.gid, rk.round, rk.day);
      n = p.used;
    } catch (e) {
      toast(e.code === 'sin-intentos' ? e.message : 'No se pudo arrancar el intento. Revisá la conexión.');
      go('#/g/' + rk.gid);
      return;
    }
  }
  const seed = rk ? hashSeed(`${rk.gid}:${rk.round}:${rk.day}`) : (Math.random() * 2 ** 32) >>> 0;
  renderGame(game, rk, seed, n);
}

function renderGame(game, rk, seed, attemptNo) {
  stopGame();
  document.body.classList.add('playing');
  app.innerHTML = `<div class="game-screen">
    <header class="ghud">
      <div class="gname"><b>${esc(game.name)}</b><span class="lbl">${rk ? `Intento ${attemptNo} de ${T.ATTEMPTS}` : 'Práctica'}</span></div>
      <div class="gscore"><span class="lbl" id="gx">Puntos</span><span class="val" id="gs">0</span></div>
      <button id="snd" class="icon" aria-label="${audio.muted ? 'Activar sonido' : 'Silenciar'}">${audio.muted ? SOUND_OFF : SOUND_ON}</button>
    </header>
    <div id="gbox" class="game-box"></div>
  </div>`;
  const gs = document.getElementById('gs'), gx = document.getElementById('gx'), snd = document.getElementById('snd');
  snd.onclick = () => {
    audio.setMuted(!audio.muted);
    snd.innerHTML = audio.muted ? SOUND_OFF : SOUND_ON;
    snd.setAttribute('aria-label', audio.muted ? 'Activar sonido' : 'Silenciar');
  };

  let last = 0, ended = false, inst = null;
  const cleanup = () => {
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onHide);
    if (inst) { inst.destroy(); inst = null; }
  };
  const finish = (score, info = {}) => {
    if (ended) return;
    ended = true; current = null;
    cleanup();
    showResult(game, rk, score, info);
  };
  const onHide = e => { if (e.type === 'pagehide' || document.hidden) finish(last, { title: 'Saliste de la partida' }); };
  if (rk) { document.addEventListener('visibilitychange', onHide); window.addEventListener('pagehide', onHide); }

  inst = game.mount(document.getElementById('gbox'), {
    seed,
    onScore(s, extra) { last = s; gs.textContent = s; gx.textContent = extra || 'Puntos'; },
    onEnd: finish,
  });
  // Si se va de la pantalla con el botón atrás, el intento se cierra con los puntos que tenía.
  current = {
    abort() {
      if (ended) return;
      ended = true; cleanup();
      if (rk) api.finishAttempt(rk.gid, rk.round, rk.day, last, game.threshold).catch(console.error);
    },
  };
}

async function showResult(game, rk, score, info) {
  let res = null, err = false;
  if (rk) {
    try { res = await api.finishAttempt(rk.gid, rk.round, rk.day, score, game.threshold); } catch (e) { console.error(e); err = true; }
  }
  const p = res && res.play;
  const left = p ? T.ATTEMPTS - p.used : 0;
  let msg = '';
  if (rk && err) msg = '<p class="banner warn">No se pudo guardar el resultado. Revisá la conexión.</p>';
  else if (rk && res.counted) msg = `<p class="banner ok">Cuenta para el ranking. Tu mejor de hoy: <b>${p.best}</b>.</p>`;
  else if (rk) msg = `<p class="banner">Changui: hiciste menos de ${game.threshold} puntos, así que este intento no cuenta. ${T.CHANGUIS - p.changuis === 0 ? 'Era tu último changui de hoy: desde ahora todos los intentos cuentan.' : `Te ${T.CHANGUIS - p.changuis === 1 ? 'queda 1 changui' : `quedan ${T.CHANGUIS - p.changuis} changuis`} hoy.`}</p>`;

  view(`<main class="screen center">
    <section class="card stack result">
      <p class="eyebrow">${esc(game.name)}${rk ? '' : ' · práctica'}</p>
      <h1 class="title">${esc(info.title || '¡Se terminó!')}</h1>
      <div class="final"><span>${score}</span><small>puntos</small></div>
      ${msg}
      ${rk && p ? `<p class="muted">${left > 0 ? `Te ${left === 1 ? 'queda 1 intento' : `quedan ${left} intentos`} hoy.` : 'Ya usaste tus 3 intentos de hoy.'}</p>` : ''}
      ${rk ? `${left > 0 ? `<button id="again" class="btn primary">Jugar de nuevo · intento ${p.used + 1} de ${T.ATTEMPTS}</button>` : ''}
              <a class="btn${left > 0 ? '' : ' primary'}" href="#/g/${esc(rk.gid)}">Ver ranking</a>`
           : `<button id="again" class="btn primary">Otra vez</button><a class="btn" href="#/">Volver</a>`}
    </section>
  </main>`);
  const again = document.getElementById('again');
  if (again) again.onclick = e => {
    e.currentTarget.disabled = true;
    startPlay(game, rk ? { ...rk, play: p } : null);
  };
}

/* ---------- arranque ---------- */
(async () => {
  loadCustomArt();
  try {
    api = await connect();
  } catch (e) {
    console.error(e);
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => paintIcons());
  route();
})();
