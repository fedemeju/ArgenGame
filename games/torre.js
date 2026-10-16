import { makeCanvas, startLoop, bindInput, mulberry32, audio, buzz, rrect, overlay, flash } from '../js/engine.js';

const KINDS = ['negro', 'blanco', 'maicena'];
const PAL = {
  negro: { tapa: '#5b3417', borde: '#2e170a', brillo: '#8a5a32' },
  blanco: { tapa: '#f4efe4', borde: '#a99d84', brillo: '#ffffff' },
  maicena: { tapa: '#f0d39a', borde: '#a9813f', brillo: '#fbecc9' },
};

function drawLayer(c, x, y, w, h, kind) {
  const p = PAL[kind], r = Math.min(h * 0.45, w / 2);
  c.fillStyle = p.tapa; rrect(c, x, y, w, h, r); c.fill();
  const bw = w - r * 0.6;
  if (bw > 0) {
    c.fillStyle = '#d9964a'; c.fillRect(x + r * 0.3, y + h * 0.42, bw, h * 0.18);
    if (kind === 'maicena') {
      c.fillStyle = '#ffffff';
      for (let i = x + r * 0.6; i < x + w - r * 0.6; i += 5) c.fillRect(i, y + h * 0.4 + ((i * 7) % 4), 1.6, 1.6);
    }
  }
  if (w > 2 * r) { c.globalAlpha = 0.55; c.fillStyle = p.brillo; c.fillRect(x + r, y + h * 0.12, w - 2 * r, h * 0.1); c.globalAlpha = 1; }
  c.strokeStyle = p.borde; c.lineWidth = 2; rrect(c, x, y, w, h, r); c.stroke();
}

export default {
  id: 'torre',
  name: 'Torre de Alfajores',
  tagline: 'Apilá sin que se venga abajo',
  threshold: 3,
  rules: [
    'El alfajor va y viene: tocá la pantalla para soltarlo arriba de la torre.',
    'Lo que queda afuera se cae, y el próximo alfajor sale igual de angosto.',
    'Si lo soltás justo encima es ¡Perfecto! y no perdés nada. Con 3 perfectos seguidos el alfajor vuelve a crecer.',
    'Cada alfajor apilado suma 1 punto. Si no toca la torre, se termina.',
  ],
  icon(c, s) {
    const h = s * 0.2;
    drawLayer(c, s * 0.22, s * 0.68, s * 0.56, h, 'negro');
    drawLayer(c, s * 0.18, s * 0.46, s * 0.56, h, 'maicena');
    drawLayer(c, s * 0.27, s * 0.24, s * 0.5, h, 'blanco');
  },

  mount(el, { seed, onScore, onEnd }) {
    const st = makeCanvas(el), ctx = st.ctx, rng = mulberry32(seed);
    const pill = overlay(el, 'g-pill', 'Tocá para soltar');
    const toast = overlay(el, 'g-toast');
    let LH = 28, BW = 220;
    const layout = () => {
      const sc = Math.min(st.w / 360, st.h / 640);
      LH = Math.max(16, Math.round(30 * Math.max(0.7, sc)));
      BW = Math.min(st.w * 0.62, 260 * Math.max(0.8, sc));
    };
    st.onResize = layout;
    layout();

    const S = {
      layers: [{ x: (st.w - BW) / 2, w: BW, kind: 'negro' }],
      moving: null, falling: [], score: 0, perfects: 0,
      alive: true, camY: 0, shake: 0, started: false,
    };
    let endTimer = 0;
    const groundY = () => st.h - 34;
    const screenY = wy => groundY() - wy + S.camY;      // wy: altura del borde superior medida desde el plato
    const top = () => S.layers[S.layers.length - 1];
    const speed = () => (0.13 + 0.01 * Math.min(S.score, 30)) * Math.max(0.8, st.w / 360);

    function nextLayer() {
      const p = top(), fromLeft = rng() < 0.5, kind = KINDS[Math.floor(rng() * KINDS.length)];
      S.moving = { x: fromLeft ? -p.w * 0.3 : st.w - p.w * 0.7, w: p.w, dir: fromLeft ? 1 : -1, kind };
    }

    function placed(l, perfect) {
      S.layers.push(l);
      S.score++;
      onScore(S.score, S.perfects > 1 ? `Perfectos x${S.perfects}` : 'Pisos');
      audio.tone(perfect ? 880 : 520 + Math.min(S.score, 20) * 12, 0.08, 'triangle', 0.15);
      buzz(perfect ? [10, 30, 10] : 10);
      nextLayer();
    }

    function drop() {
      if (!S.alive || !S.moving) return;
      if (!S.started) { S.started = true; pill.hidden = true; }
      const m = S.moving, p = top(), tol = Math.max(3, p.w * 0.035);
      const wy = (S.layers.length + 1) * LH;
      if (Math.abs(m.x - p.x) <= tol) {
        S.perfects++;
        let w = p.w, x = p.x;
        if (S.perfects % 3 === 0 && p.w < BW) { const g = Math.min(BW - p.w, BW * 0.12); w += g; x -= g / 2; flash(toast, '¡Perfecto! Crece'); }
        else flash(toast, '¡Perfecto!');
        placed({ x, w, kind: m.kind }, true);
        return;
      }
      S.perfects = 0;
      const L = Math.max(m.x, p.x), R = Math.min(m.x + m.w, p.x + p.w), ov = R - L;
      const side = m.x < p.x ? -1 : 1;
      if (ov <= 0) {
        S.falling.push({ x: m.x, w: m.w, kind: m.kind, wy, v: 0, r: 0, vr: side * 0.003 });
        S.moving = null;
        return die();
      }
      S.falling.push({ x: side < 0 ? m.x : R, w: m.w - ov, kind: m.kind, wy, v: 0, r: 0, vr: side * 0.004 });
      placed({ x: L, w: ov, kind: m.kind }, false);
    }

    function die() {
      S.alive = false; S.shake = 1;
      audio.lose(); buzz([60, 40, 90]);
      endTimer = setTimeout(() => onEnd(S.score, { title: '¡Se vino abajo la torre!' }), 900);
    }

    function draw(dt, now) {
      st.begin();
      const g = ctx.createLinearGradient(0, 0, 0, st.h);
      g.addColorStop(0, '#0e2236'); g.addColorStop(1, '#1d4166');
      ctx.fillStyle = g; ctx.fillRect(0, 0, st.w, st.h);
      ctx.save();
      if (S.shake > 0) { ctx.translate((Math.random() - 0.5) * S.shake * 10, 0); S.shake = Math.max(0, S.shake - dt / 500); }

      // marcas de altura cada 5 pisos
      ctx.font = '700 11px Chivo, system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      for (let k = 5; k <= S.layers.length + 10; k += 5) {
        const y = screenY(k * LH + LH);
        if (y < -10 || y > st.h) continue;
        ctx.strokeStyle = 'rgba(116,172,223,.25)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(28, y); ctx.stroke();
        ctx.fillStyle = 'rgba(157,180,202,.8)'; ctx.fillText(String(k), 32, y);
      }

      // plato
      const gy = screenY(0);
      if (gy < st.h + 40) {
        ctx.fillStyle = '#e8eef5'; ctx.beginPath(); ctx.ellipse(st.w / 2, gy + 6, BW * 0.75, 12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c9d4e0'; ctx.beginPath(); ctx.ellipse(st.w / 2, gy + 6, BW * 0.55, 7, 0, 0, Math.PI * 2); ctx.fill();
      }

      S.layers.forEach((l, i) => {
        const y = screenY((i + 1) * LH);
        if (y > st.h + LH || y < -LH) return;
        drawLayer(ctx, l.x, y, l.w, LH - 2, l.kind);
      });
      if (S.moving) drawLayer(ctx, S.moving.x, screenY((S.layers.length + 1) * LH), S.moving.w, LH - 2, S.moving.kind);

      for (const f of S.falling) {
        const y = screenY(f.wy);
        ctx.save();
        ctx.translate(f.x + f.w / 2, y + LH / 2); ctx.rotate(f.r);
        drawLayer(ctx, -f.w / 2, -LH / 2, f.w, LH - 2, f.kind);
        ctx.restore();
      }
      ctx.restore();
    }

    nextLayer();
    onScore(0, 'Pisos');
    const unbind = bindInput(el, { onDown: drop });
    const stop = startLoop((dt, now) => {
      if (S.moving && S.alive) {
        const m = S.moving;
        m.x += m.dir * speed() * dt;
        if (m.x < -m.w * 0.3) { m.x = -m.w * 0.3; m.dir = 1; }
        if (m.x > st.w - m.w * 0.7) { m.x = st.w - m.w * 0.7; m.dir = -1; }
      }
      const target = Math.max(0, (S.layers.length + 2) * LH - st.h * 0.55);
      S.camY += (target - S.camY) * Math.min(1, dt / 160);
      S.falling = S.falling.filter(f => { f.v += 0.0016 * dt; f.wy -= f.v * dt; f.r += f.vr * dt; return screenY(f.wy) < st.h + 120; });
      draw(dt, now);
    });

    return {
      destroy() { stop(); unbind(); clearTimeout(endTimer); st.destroy(); pill.remove(); toast.remove(); },
      _state: S, _drop: drop,
    };
  },
};
