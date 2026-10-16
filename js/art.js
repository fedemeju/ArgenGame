// Dibujos provisorios (en un cuadro de 100x100) y carga de imágenes propias desde assets/.

function bez(t, a, b, c, d) {
  const u = 1 - t;
  return [0, 1].map(i => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i]);
}

function cyl(c, cx, yb, rx, ry, h, side, top) {
  c.fillStyle = side;
  c.beginPath();
  c.moveTo(cx - rx, yb - h);
  c.lineTo(cx - rx, yb);
  c.ellipse(cx, yb, rx, ry, 0, Math.PI, 0, true);
  c.lineTo(cx + rx, yb - h);
  c.ellipse(cx, yb - h, rx, ry, 0, 0, Math.PI, true);
  c.closePath(); c.fill(); c.stroke();
  c.fillStyle = top || side;
  c.beginPath(); c.ellipse(cx, yb - h, rx, ry, 0, 0, Math.PI * 2); c.fill(); c.stroke();
}

export const PAINT = {
  mate(c, s) {
    c.save(); c.scale(s / 100, s / 100); c.lineJoin = c.lineCap = 'round';
    c.fillStyle = '#8b5a2b'; c.strokeStyle = '#3e2410'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(24, 38); c.bezierCurveTo(8, 62, 16, 95, 50, 95); c.bezierCurveTo(84, 95, 92, 62, 76, 38); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#cfd5dd'; c.strokeStyle = '#5d6672'; c.lineWidth = 4;
    c.beginPath(); c.ellipse(50, 38, 28, 9, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#7aa83a'; c.beginPath(); c.ellipse(50, 38, 21, 5.5, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#5d6672'; c.lineWidth = 8; c.beginPath(); c.moveTo(56, 38); c.lineTo(80, 7); c.stroke();
    c.strokeStyle = '#e3e8ee'; c.lineWidth = 4.5; c.beginPath(); c.moveTo(56, 38); c.lineTo(80, 7); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.ellipse(33, 66, 5, 14, -.3, 0, Math.PI * 2); c.fill();
    c.restore();
  },
  empa(c, s) {
    c.save(); c.scale(s / 100, s / 100); c.lineJoin = 'round';
    const A = [8, 74], B = [10, 22], C = [90, 22], D = [92, 74];
    c.fillStyle = '#e9a640'; c.strokeStyle = '#7a4512'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(...A); c.bezierCurveTo(...B, ...C, ...D); c.quadraticCurveTo(50, 86, ...A); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#d48a2a'; c.lineWidth = 3;
    for (let i = 0; i <= 8; i++) {
      const p = bez(i / 8, A, B, C, D);
      c.beginPath(); c.arc(p[0], p[1], 6.5, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    c.fillStyle = 'rgba(255,240,200,.5)'; c.beginPath(); c.ellipse(42, 56, 16, 6, -.12, 0, Math.PI * 2); c.fill();
    c.restore();
  },
  alfa(c, s) {
    c.save(); c.scale(s / 100, s / 100); c.lineJoin = 'round';
    c.strokeStyle = '#2e170a'; c.lineWidth = 4;
    cyl(c, 50, 76, 40, 13, 10, '#5b3417');
    c.strokeStyle = '#8a5a22';
    cyl(c, 50, 66, 41, 13, 7, '#e3a85f');
    c.strokeStyle = '#2e170a';
    cyl(c, 50, 59, 40, 13, 12, '#5b3417', '#7a4a24');
    c.fillStyle = 'rgba(255,255,255,.2)'; c.beginPath(); c.ellipse(38, 45, 13, 4, -.1, 0, Math.PI * 2); c.fill();
    c.restore();
  },
};

const FILES = {
  mate: 'assets/mate.png', empa: 'assets/empanada.png', alfa: 'assets/alfajor.png', head: 'assets/cabeza.png',
  fitito: 'assets/fitito.png',
  carpCorre: 'assets/carpincho/corre.webp',
  carpSalto: 'assets/carpincho/salto.png', carpAgachado: 'assets/carpincho/agachado.png',
  teroVuela: 'assets/carpincho/tero.webp',
};
const custom = {};

export function loadCustomArt(onLoad) {
  for (const [k, src] of Object.entries(FILES)) {
    const im = new Image();
    im.onload = () => { custom[k] = im; if (onLoad) onLoad(k); };
    im.onerror = () => {};
    im.src = src;
  }
}

export function getCustom(k) { return custom[k] || null; }

// Imagen lista para dibujar con drawImage: la propia si existe, si no el dibujo provisorio.
export function sprite(id, px) {
  if (custom[id]) return custom[id];
  const c = document.createElement('canvas');
  c.width = c.height = Math.max(1, Math.ceil(px));
  PAINT[id](c.getContext('2d'), c.width);
  return c;
}
