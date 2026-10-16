import { makeCanvas, startLoop, bindInput, mulberry32, audio, buzz, rrect, circle, overlay, flash } from '../js/engine.js';
import { sprite, getCustom, PAINT } from '../js/art.js';

const COLS = 13, ROWS = 20, COMBO_STEPS = 55;
const FOOD = {
  mate: { combo: '¡Ronda de mate!', freq: 523, color: '#7aa83a' },
  empa: { combo: '¡Salen empanadas!', freq: 440, color: '#e9a640' },
  alfa: { combo: '¡Triple alfajor!', freq: 659, color: '#7a4a24' },
};
const TYPES = Object.keys(FOOD);
const BOARD_A = '#e7f2fb', BOARD_B = '#d5e9f7';
const SNAKE_DARK = '#1d5a2a', SNAKE = '#4fae55', SNAKE_HEAD = '#5fc265', INK = '#0e2236';

export default {
  id: 'viborita',
  name: 'Viborita Criolla',
  tagline: 'Comé, combiná y no te muerdas',
  threshold: 3,
  rules: [
    'Deslizá el dedo para girar: arriba, abajo, izquierda o derecha.',
    'Comé mates, empanadas y alfajores. Cada uno suma 1 punto y se agrega a tu cuerpo.',
    'Juntá 3 iguales seguidos detrás de la cabeza: es combo, suma 10 × la racha y la viborita se achica.',
    'Si encadenás combos antes de que se vacíe la barra, la racha sube hasta x9.',
    'Si chocás el borde o te mordés la cola, se termina.',
  ],
  icon(c, s) {
    c.save(); c.scale(s / 100, s / 100); c.lineCap = c.lineJoin = 'round';
    const path = () => { c.beginPath(); c.moveTo(16, 84); c.bezierCurveTo(16, 50, 56, 74, 54, 46); c.bezierCurveTo(52, 24, 30, 30, 34, 16); };
    path(); c.strokeStyle = SNAKE_DARK; c.lineWidth = 20; c.stroke();
    path(); c.strokeStyle = SNAKE; c.lineWidth = 13; c.stroke();
    const head = getCustom('head');
    if (head) c.drawImage(head, 14, -4, 42, 42);
    else {
      c.fillStyle = SNAKE_DARK; circle(c, 36, 15, 12); c.fillStyle = SNAKE_HEAD; circle(c, 36, 15, 9.5);
      c.fillStyle = '#fff'; circle(c, 32, 12, 3); circle(c, 41, 12, 3);
      c.fillStyle = INK; circle(c, 32, 11, 1.5); circle(c, 41, 11, 1.5);
    }
    c.restore();
    const mate = getCustom('mate');
    if (mate) c.drawImage(mate, s * 0.5, s * 0.48, s * 0.5, s * 0.5);
    else { c.save(); c.translate(s * 0.52, s * 0.5); PAINT.mate(c, s * 0.46); c.restore(); }
  },

  mount(el, { seed, onScore, onEnd }) {
    const st = makeCanvas(el), ctx = st.ctx;
    const pill = overlay(el, 'g-pill', 'Deslizá para arrancar');
    const toast = overlay(el, 'g-toast');
    let cell = 20, ox = 0, oy = 0, W = 0, H = 0, board = null;
    const sprites = {};

    const layout = () => {
      cell = Math.max(8, Math.floor(Math.min(st.w / COLS, st.h / ROWS)));
      W = cell * COLS; H = cell * ROWS;
      ox = Math.floor((st.w - W) / 2); oy = Math.floor((st.h - H) / 2);
      const px = Math.ceil(cell * st.dpr);
      TYPES.forEach(t => { sprites[t] = sprite(t, px); });
      board = document.createElement('canvas');
      board.width = W * st.dpr; board.height = H * st.dpr;
      const b = board.getContext('2d');
      b.scale(st.dpr, st.dpr);
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        b.fillStyle = (x + y) % 2 ? BOARD_B : BOARD_A;
        b.fillRect(x * cell, y * cell, cell, cell);
      }
    };
    st.onResize = layout;
    layout();

    const rngT = mulberry32(seed), rngP = mulberry32(seed ^ 0x9E3779B9);
    const my = Math.floor(ROWS / 2);
    const snake = [{ x: 6, y: my }, { x: 6, y: my + 1 }, { x: 6, y: my + 2 }];
    const S = {
      snake, prev: snake.map(p => ({ ...p })), items: [null, null, null],
      dir: { x: 0, y: -1 }, queue: [], foods: [],
      score: 0, combo: 1, comboSteps: 0, eaten: 0,
      stepMs: 165, acc: 0, alive: true, started: false,
      shake: 0, particles: [], floats: [],
    };
    let endTimer = 0;
    const report = () => onScore(S.score, 'Racha x' + S.combo);

    const center = p => ({ x: (p.x + 0.5) * cell, y: (p.y + 0.5) * cell });

    function spawnFood() {
      const type = TYPES[Math.floor(rngT() * TYPES.length)];
      const occ = new Set(S.snake.map(p => p.x + ',' + p.y));
      S.foods.forEach(f => occ.add(f.x + ',' + f.y));
      const h = S.snake[0];
      occ.add((h.x + S.dir.x) + ',' + (h.y + S.dir.y));
      if (occ.size >= COLS * ROWS) return;
      let x, y, tries = 0;
      do { x = Math.floor(rngP() * COLS); y = Math.floor(rngP() * ROWS); } while (occ.has(x + ',' + y) && ++tries < 400);
      if (occ.has(x + ',' + y)) {
        outer: for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) if (!occ.has(x + ',' + y)) break outer;
      }
      S.foods.push({ x, y, type, born: performance.now() });
    }

    function burst(p, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = 0.06 + Math.random() * 0.16;
        S.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color, r: cell * (0.07 + Math.random() * 0.08) });
      }
    }
    function floatText(text, gx, gy, big) {
      const c = center({ x: gx, y: gy });
      S.floats.push({ x: c.x, y: c.y - cell * 0.4, text, big, life: 1 });
    }

    function step() {
      if (S.queue.length) S.dir = S.queue.shift();
      const h = S.snake[0], nx = h.x + S.dir.x, ny = h.y + S.dir.y;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return die('wall');
      const fi = S.foods.findIndex(f => f.x === nx && f.y === ny);
      const grow = fi >= 0;
      const n = grow ? S.snake.length : S.snake.length - 1;
      for (let i = 0; i < n; i++) if (S.snake[i].x === nx && S.snake[i].y === ny) return die('self');

      const old = S.snake.map(p => ({ x: p.x, y: p.y }));
      S.snake.unshift({ x: nx, y: ny });
      if (!grow) S.snake.pop();
      S.prev = S.snake.map((p, i) => old[i] || { x: p.x, y: p.y });

      if (grow) {
        const f = S.foods.splice(fi, 1)[0];
        S.items.forEach(it => { if (it) it.vis += 1; });
        S.items.splice(1, 0, { type: f.type, vis: 1 });
        S.eaten++; S.score += 1;
        floatText('+1', nx, ny, false);
        audio.tone(FOOD[f.type].freq, 0.09, 'triangle', 0.16); buzz(12);
        let run = 0;
        while (S.items[1 + run] && S.items[1 + run].type === f.type) run++;
        if (run >= 3) triple(f.type);
        spawnFood();
        S.stepMs = Math.max(88, 165 - S.eaten * 1.4);
      }
      if (S.comboSteps > 0 && --S.comboSteps === 0) S.combo = 1;
      report();
    }

    function triple(type) {
      for (let i = 1; i <= 3; i++) burst(center(S.snake[i]), FOOD[type].color, 9);
      S.items.splice(1, 3);
      S.snake.splice(-3); S.prev.splice(-3);
      const pts = 10 * S.combo;
      S.score += pts;
      floatText('+' + pts, S.snake[0].x, S.snake[0].y, true);
      flash(toast, FOOD[type].combo + (S.combo > 1 ? ' x' + S.combo : ''));
      S.combo = Math.min(9, S.combo + 1);
      S.comboSteps = COMBO_STEPS;
      audio.win(); buzz([20, 40, 20]);
    }

    function die(cause) {
      S.alive = false; S.shake = 1; S.acc = S.stepMs;
      burst(center(S.snake[0]), SNAKE, 16);
      audio.lose(); buzz([60, 40, 90]);
      report();
      endTimer = setTimeout(() => onEnd(S.score, { title: cause === 'wall' ? '¡Contra el alambrado!' : '¡Te mordiste la cola!' }), 750);
    }

    function turn(d) {
      if (!S.alive) return;
      if (!S.started) {
        S.started = true; S.acc = 0; pill.hidden = true;
        if (!(d.x === -S.dir.x && d.y === -S.dir.y)) S.queue.push(d);
        return;
      }
      const last = S.queue.length ? S.queue[S.queue.length - 1] : S.dir;
      if ((d.x === last.x && d.y === last.y) || (d.x === -last.x && d.y === -last.y)) return;
      if (S.queue.length < 3) S.queue.push(d);
    }

    function along(pts, v) {
      v = Math.max(0, Math.min(pts.length - 1, v));
      const i = Math.floor(v), f = v - i, a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    const drawSprite = (id, x, y, size) => ctx.drawImage(sprites[id], x - size / 2, y - size / 2, size, size);

    function draw(t, dt, now) {
      st.begin();
      ctx.save();
      ctx.translate(ox, oy);
      if (S.shake > 0) {
        ctx.translate((Math.random() - 0.5) * S.shake * 10, (Math.random() - 0.5) * S.shake * 10);
        S.shake = Math.max(0, S.shake - dt / 450);
      }
      ctx.save();
      rrect(ctx, 0, 0, W, H, 10); ctx.clip();
      ctx.drawImage(board, 0, 0, W, H);
      ctx.restore();
      ctx.strokeStyle = '#74acdf'; ctx.lineWidth = 3;
      rrect(ctx, -1.5, -1.5, W + 3, H + 3, 11); ctx.stroke();

      for (const f of S.foods) {
        const c = center(f), age = Math.min(1, (now - f.born) / 220);
        const pop = age < 1 ? 1 + 0.25 * Math.sin(age * Math.PI) : 1;
        const bob = Math.sin(now / 320 + f.x * 1.7 + f.y) * cell * 0.04;
        ctx.fillStyle = 'rgba(14,34,54,.14)';
        ctx.beginPath(); ctx.ellipse(c.x, c.y + cell * 0.36, cell * 0.3, cell * 0.08, 0, 0, Math.PI * 2); ctx.fill();
        drawSprite(f.type, c.x, c.y + bob, cell * 0.92 * age * pop);
      }

      const pts = S.snake.map((p, i) => {
        const q = S.prev[i] || p;
        return { x: (q.x + (p.x - q.x) * t + 0.5) * cell, y: (q.y + (p.y - q.y) * t + 0.5) * cell };
      });
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = SNAKE_DARK; ctx.lineWidth = cell * 0.86; ctx.stroke();
      ctx.strokeStyle = SNAKE; ctx.lineWidth = cell * 0.68; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = cell * 0.16; ctx.stroke();

      for (let i = 1; i < S.items.length; i++) {
        const it = S.items[i];
        if (!it) continue;
        const p = along(pts, it.vis);
        drawSprite(it.type, p.x, p.y, cell * 0.74);
      }

      const h = pts[0], d = S.dir, head = getCustom('head');
      if (head) {
        // La cabeza propia está de frente: siempre derecha, espejada cuando va a la izquierda.
        const hs = cell * 1.45;
        ctx.save(); ctx.translate(h.x, h.y - cell * 0.12);
        if (d.x < 0) ctx.scale(-1, 1);
        ctx.drawImage(head, -hs / 2, -hs / 2, hs, hs);
        ctx.restore();
      } else {
        if (S.alive && Math.floor(now / 700) % 4 === 0) {
          const tx = h.x + d.x * cell * 0.45, ty = h.y + d.y * cell * 0.45;
          const ex = h.x + d.x * cell * 0.78, ey = h.y + d.y * cell * 0.78;
          ctx.strokeStyle = '#d33a3a'; ctx.lineWidth = cell * 0.07;
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ex, ey);
          ctx.moveTo(ex, ey); ctx.lineTo(ex + (d.x - d.y) * cell * 0.1, ey + (d.y + d.x) * cell * 0.1);
          ctx.moveTo(ex, ey); ctx.lineTo(ex + (d.x + d.y) * cell * 0.1, ey + (d.y - d.x) * cell * 0.1);
          ctx.stroke();
        }
        ctx.fillStyle = SNAKE_DARK; circle(ctx, h.x, h.y, cell * 0.52);
        ctx.fillStyle = SNAKE_HEAD; circle(ctx, h.x, h.y, cell * 0.43);
        const px = -d.y, py = d.x;
        for (const s of [-1, 1]) {
          const ex = h.x + d.x * cell * 0.12 + px * s * cell * 0.2, ey = h.y + d.y * cell * 0.12 + py * s * cell * 0.2;
          ctx.fillStyle = '#fff'; circle(ctx, ex, ey, cell * 0.13);
          ctx.fillStyle = INK; circle(ctx, ex + d.x * cell * 0.04, ey + d.y * cell * 0.04, S.alive ? cell * 0.07 : cell * 0.035);
        }
      }

      for (const p of S.particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color; circle(ctx, p.x, p.y, p.r);
      }
      ctx.globalAlpha = 1;

      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const f of S.floats) {
        ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.5));
        ctx.font = `900 ${cell * (f.big ? 0.8 : 0.48)}px Chivo, system-ui, sans-serif`;
        ctx.lineWidth = cell * 0.14; ctx.strokeStyle = '#fff'; ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.big ? '#c98a00' : INK; ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;

      // barra de racha bajo el tablero
      if (S.comboSteps > 0) {
        ctx.fillStyle = '#f6b40e';
        ctx.fillRect(0, H + 5, W * S.comboSteps / COMBO_STEPS, 4);
      }
      ctx.restore();
    }

    for (let i = 0; i < 3; i++) spawnFood();
    report();
    const unbind = bindInput(el, { onSwipe: turn });
    const stop = startLoop((dt, now) => {
      if (S.alive && S.started) {
        S.acc += dt;
        while (S.alive && S.acc >= S.stepMs) { S.acc -= S.stepMs; step(); }
      }
      const k = Math.min(1, dt / 80);
      S.items.forEach((it, i) => { if (it) it.vis += (i - it.vis) * k; });
      S.particles = S.particles.filter(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.0004 * dt; p.life -= dt / 600; return p.life > 0; });
      S.floats = S.floats.filter(f => { f.y -= dt * 0.03; f.life -= dt / 800; return f.life > 0; });
      draw(Math.min(1, S.acc / S.stepMs), dt, now);
    });

    return {
      destroy() { stop(); unbind(); clearTimeout(endTimer); st.destroy(); pill.remove(); toast.remove(); },
      _state: S, _step: step, _turn: turn,
    };
  },
};
