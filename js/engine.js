// Herramientas compartidas por todos los minijuegos: azar con semilla, canvas, loop, controles y sonido.

export function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Canvas que ocupa todo el contenedor y se adapta a su tamaño y a la densidad de pantalla.
export function makeCanvas(container) {
  const cv = document.createElement('canvas');
  cv.className = 'game-cv';
  container.appendChild(cv);
  const st = { cv, ctx: cv.getContext('2d'), w: 1, h: 1, dpr: 1, onResize: null };
  const resize = () => {
    const r = container.getBoundingClientRect();
    st.w = Math.max(1, Math.floor(r.width));
    st.h = Math.max(1, Math.floor(r.height));
    st.dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(st.w * st.dpr);
    cv.height = Math.round(st.h * st.dpr);
    cv.style.width = st.w + 'px';
    cv.style.height = st.h + 'px';
    if (st.onResize) st.onResize();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  st.begin = () => { st.ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0); st.ctx.clearRect(0, 0, st.w, st.h); };
  st.destroy = () => { ro.disconnect(); cv.remove(); };
  return st;
}

export function startLoop(fn) {
  let id = 0, last = performance.now(), on = true;
  const tick = now => {
    if (!on) return;
    const dt = Math.min(50, now - last);
    last = now;
    fn(dt, now);
    id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => { on = false; cancelAnimationFrame(id); };
}

const KEYMAP = { arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };

// onSwipe(dir) se dispara apenas el dedo recorre 22px; onDown al apoyar; onTap al levantar sin haber deslizado.
export function bindInput(el, { onSwipe, onDown, onTap } = {}) {
  let s = null;
  const rel = e => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; };
  const down = e => {
    if (e.button > 0) return;
    audio.unlock();
    s = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
    if (onDown) onDown(rel(e));
  };
  const move = e => {
    if (!s || e.pointerId !== s.id || !onSwipe) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.hypot(dx, dy) < 22) return;
    s.moved = true;
    onSwipe(Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) });
    s.x = e.clientX; s.y = e.clientY;
  };
  const up = e => {
    if (!s || e.pointerId !== s.id) return;
    if (!s.moved && onTap) onTap(rel(e));
    s = null;
  };
  const key = e => {
    if (e.target.closest && e.target.closest('input, textarea, button')) return;
    const k = KEYMAP[e.key.toLowerCase()];
    if (k && onSwipe) { e.preventDefault(); audio.unlock(); onSwipe({ x: k[0], y: k[1] }); return; }
    if ((e.key === ' ' || e.key === 'Enter') && (onDown || onTap)) {
      e.preventDefault(); audio.unlock();
      const r = el.getBoundingClientRect();
      (onDown || onTap)({ x: r.width / 2, y: r.height / 2, w: r.width, h: r.height, key: true });
    }
  };
  el.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('keydown', key);
  return () => {
    el.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    window.removeEventListener('keydown', key);
  };
}

let actx = null;
let muted = (() => { try { return localStorage.getItem('argengame:muted') === '1'; } catch (e) { return false; } })();
export const audio = {
  get muted() { return muted; },
  setMuted(v) {
    muted = v;
    try { localStorage.setItem('argengame:muted', v ? '1' : '0'); } catch (e) {}
    if (!v) audio.unlock();
  },
  unlock() {
    if (muted) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) {}
  },
  tone(f, dur, type = 'triangle', vol = 0.15, delay = 0, to = 0) {
    if (!actx || muted) return;
    const t0 = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(actx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },
  win() { [523, 659, 784, 1047].forEach((f, i) => audio.tone(f, 0.14, 'triangle', 0.15, i * 0.06)); },
  lose() { audio.tone(260, 0.45, 'sawtooth', 0.1, 0, 70); },
};

export function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

export function rrect(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }

// Cartel y aviso flotante sobre el juego (estilos .g-pill y .g-toast en app.css).
export function overlay(el, cls, text = '') {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  el.appendChild(d);
  return d;
}
export function flash(elm, text) {
  elm.textContent = text;
  elm.classList.remove('show');
  void elm.offsetWidth;
  elm.classList.add('show');
}
