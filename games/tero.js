import { makeCanvas, startLoop, bindInput, mulberry32, audio, buzz, overlay, flash, circle } from '../js/engine.js';
import { getCustom } from '../js/art.js';

// El Vuelo del Tero: el tero cruza Buenos Aires aleteando entre el Obelisco, que sale de la vereda,
// y otro Obelisco del revés que cuelga del cielo (los "caños" del Flappy Bird).
// Todo se mide en "u": el alto de la pantalla es 1 u, así la física es la misma en cualquier celular.
// La física corre a paso fijo (120 por segundo) para que todos jueguen igual.
const GROUND = 0.86;                    // donde empieza la vereda
const G = 2.4, FLAP = 0.62, VMAX = 1.15; // gravedad, impulso del aleteo, caída máxima (u/s)
const R = 0.03;                          // radio del tero para los choques
const TERO_X = 0.17;                     // distancia del borde izquierdo al tero
const PW = 0.15, SPACING = 0.6;          // ancho de la base del Obelisco y distancia entre uno y otro
const TIP = 0.07, BASE_H = 0.03;         // alto de la punta (piramidión) y del pedestal
const SHAFT_TOP = 0.6, SHAFT_BOT = 0.8;  // ancho del fuste arriba y abajo, en proporción a PW
const STEP = 1 / 120;
const TERO_ASPECT = 200 / 245;           // forma de cada cuadro de assets/carpincho/tero.webp (9 cuadros, mira a la izquierda)
const frameCount = img => Math.max(1, Math.round(img.width / (img.height * TERO_ASPECT)));

const speedOf = n => 0.34 + Math.min(0.1, n * 0.0025);
const gapOf = n => Math.max(0.215, 0.29 - n * 0.0018);

const TITLES = {
  abajo: '¡Te la pegaste contra el Obelisco!',
  arriba: '¡Chocaste el Obelisco del revés!',
  piso: '¡Aterrizaste en la 9 de Julio!',
};

// paisaje del fondo: depende de la posición, no del azar de la partida (así no cambia el recorrido)
const hash = (a, b) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Contorno del Obelisco con la punta en tipY. dir = -1: sale de la vereda (punta arriba);
// dir = 1: cuelga del cielo (punta abajo). baseY es donde apoya el pedestal.
function obeliskShape(x, tipY, baseY, dir) {
  const xc = x + PW / 2, wt = PW * SHAFT_TOP / 2, wb = PW * SHAFT_BOT / 2, hb = PW / 2;
  const sTop = tipY - dir * TIP, pTop = baseY + dir * BASE_H; // dir -1: y crece hacia abajo
  return [
    [xc, tipY], [xc + wt, sTop], [xc + wb, pTop], [xc + hb, pTop], [xc + hb, baseY],
    [xc - hb, baseY], [xc - hb, pTop], [xc - wb, pTop], [xc - wt, sTop],
  ];
}

// ¿El círculo (cx, cy, r) toca el polígono?
function circleHitsPoly(cx, cy, r, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > cy) !== (yj > cy) && cx < (xj - xi) * (cy - yi) / (yj - yi) + xi) inside = !inside;
    const dx = xj - xi, dy = yj - yi, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((cx - xi) * dx + (cy - yi) * dy) / len)) : 0;
    if ((cx - xi - t * dx) ** 2 + (cy - yi - t * dy) ** 2 < r * r) return true;
  }
  return inside;
}

function solDeMayo(c, x, y, r, t) {
  c.save(); c.translate(x, y); c.rotate(t * 0.0002);
  c.fillStyle = '#f6b40e';
  for (let i = 0; i < 16; i++) {
    c.save(); c.rotate(i * Math.PI / 8);
    c.beginPath();
    if (i % 2) { c.moveTo(r * 0.9, -r * 0.08); c.lineTo(r * 1.75, 0); c.lineTo(r * 0.9, r * 0.08); }
    else { c.moveTo(r * 0.9, -r * 0.1); c.quadraticCurveTo(r * 1.3, -r * 0.3, r * 1.6, 0); c.quadraticCurveTo(r * 1.3, r * 0.3, r * 0.9, r * 0.1); }
    c.fill(); c.restore();
  }
  c.restore();
  c.fillStyle = '#f6b40e'; circle(c, x, y, r);
  c.fillStyle = '#c98a00';
  circle(c, x - r * 0.33, y - r * 0.15, r * 0.1); circle(c, x + r * 0.33, y - r * 0.15, r * 0.1);
  c.strokeStyle = '#c98a00'; c.lineWidth = r * 0.08; c.lineCap = 'round';
  c.beginPath(); c.arc(x, y + r * 0.1, r * 0.35, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
}

/* ---------- Buenos Aires de fondo (todo en u; base = línea de la vereda en píxeles) ---------- */

// Siluetas lejanas: el Barolo, el Kavanagh, la Torre Monumental y el Congreso.
function landmark(c, kind, x, base, k) {
  const R = (x0, w, h, y0 = 0) => c.fillRect(x + x0 * k, base - (y0 + h) * k, w * k, h * k);
  const dome = (cx, y0, r) => { c.beginPath(); c.arc(x + cx * k, base - y0 * k, r * k, Math.PI, 0); c.fill(); };
  const spire = (cx, y0, h, w = 0.004) => { c.beginPath(); c.moveTo(x + (cx - w) * k, base - y0 * k); c.lineTo(x + cx * k, base - (y0 + h) * k); c.lineTo(x + (cx + w) * k, base - y0 * k); c.fill(); };
  if (kind === 'barolo') {
    R(0, 0.1, 0.24); R(0.025, 0.05, 0.07, 0.24); R(0.035, 0.03, 0.03, 0.31);
    dome(0.05, 0.34, 0.018); R(0.046, 0.008, 0.02, 0.35); spire(0.05, 0.37, 0.02);
  } else if (kind === 'kavanagh') {
    R(0, 0.12, 0.2); R(0.015, 0.09, 0.07, 0.2); R(0.03, 0.06, 0.06, 0.27); R(0.042, 0.036, 0.05, 0.33); spire(0.06, 0.38, 0.04, 0.002);
  } else if (kind === 'torre') {
    R(0.02, 0.04, 0.26); R(0.014, 0.052, 0.045, 0.26); spire(0.04, 0.305, 0.04, 0.028); spire(0.04, 0.34, 0.03, 0.003);
    const fill = c.fillStyle; c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.arc(x + 0.04 * k, base - 0.282 * k, 0.012 * k, 0, Math.PI * 2); c.fill(); c.fillStyle = fill;
  } else if (kind === 'congreso') {
    R(0, 0.2, 0.1); R(0.06, 0.08, 0.05, 0.1); dome(0.1, 0.15, 0.04); R(0.093, 0.014, 0.02, 0.188); spire(0.1, 0.208, 0.025);
  }
}

const FACHADA = ['#e6d3b3', '#d9c7a7', '#cdbb9d', '#e2c9a2', '#c9bfb0', '#d8b9a2'];
const TOLDOS = [['#c0392b', '#f4f1ea'], ['#2e7d4f', '#f4f1ea'], ['#2d5f9a', '#f4f1ea'], ['#d68a1c', '#f4f1ea']];

// Edificio porteño: planta baja con negocio y toldo, balcones franceses y techo mansarda.
function edificio(c, x, base, k, r1, r2, r3) {
  const w = 0.16 * k, floors = 4 + Math.floor(r1 * 4), fh = 0.036 * k, pb = 0.045 * k;
  const top = base - pb - floors * fh;
  c.fillStyle = FACHADA[Math.floor(r2 * FACHADA.length)];
  c.fillRect(x, top, w, base - top);
  // planta baja: vidriera y toldo a rayas
  c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(x, base - pb, w, pb);
  c.fillStyle = '#34414f'; c.fillRect(x + w * 0.1, base - pb * 0.75, w * 0.5, pb * 0.75);
  c.fillStyle = '#5a3b26'; c.fillRect(x + w * 0.7, base - pb * 0.85, w * 0.18, pb * 0.85);
  const [ta, tb] = TOLDOS[Math.floor(r3 * TOLDOS.length)];
  for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? tb : ta; c.beginPath(); c.moveTo(x + w * (0.06 + i * 0.09), base - pb * 0.95); c.lineTo(x + w * (0.15 + i * 0.09), base - pb * 0.95); c.lineTo(x + w * (0.17 + i * 0.09), base - pb * 0.6); c.lineTo(x + w * (0.08 + i * 0.09), base - pb * 0.6); c.fill(); }
  // pisos con ventanas altas y balcones de hierro
  for (let f = 0; f < floors; f++) {
    const fy = base - pb - (f + 1) * fh;
    for (let i = 0; i < 3; i++) {
      const wx = x + w * (0.12 + i * 0.29), ww = w * 0.17, wh = fh * 0.66;
      c.fillStyle = '#46556a'; c.fillRect(wx, fy + fh * 0.18, ww, wh);
      c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(wx, fy + fh * 0.18, ww * 0.35, wh);
      c.fillStyle = '#efe6d2'; c.fillRect(wx - 1, fy + fh * 0.12, ww + 2, 1.5);
      c.strokeStyle = '#222'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(wx - ww * 0.15, fy + fh * 0.84); c.lineTo(wx + ww * 1.15, fy + fh * 0.84);
      for (let b = 0; b <= 4; b++) { const bx = wx - ww * 0.15 + b * ww * 0.325; c.moveTo(bx, fy + fh * 0.84); c.lineTo(bx, fy + fh * 0.62); }
      c.moveTo(wx - ww * 0.15, fy + fh * 0.62); c.lineTo(wx + ww * 1.15, fy + fh * 0.62); c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(x, fy + fh - 1.5, w, 1.5);
  }
  // cornisa y mansarda de pizarra con buhardillas
  c.fillStyle = '#efe6d2'; c.fillRect(x - 2, top - 3, w + 4, 4);
  c.fillStyle = '#5d6470';
  c.beginPath(); c.moveTo(x + w * 0.04, top - 3); c.lineTo(x + w * 0.14, top - 0.03 * k); c.lineTo(x + w * 0.86, top - 0.03 * k); c.lineTo(x + w * 0.96, top - 3); c.fill();
  for (const dx of [0.3, 0.62]) {
    c.fillStyle = '#efe6d2'; c.fillRect(x + w * dx, top - 0.024 * k, w * 0.09, 0.016 * k);
    c.fillStyle = '#46556a'; c.fillRect(x + w * (dx + 0.02), top - 0.02 * k, w * 0.05, 0.011 * k);
  }
}

function casaRosada(c, x, base, k) {
  const w = 0.2 * k, h = 0.13 * k, top = base - h;
  c.fillStyle = '#e7a49b'; c.fillRect(x, top, w, h);
  c.fillStyle = '#d68f86'; c.fillRect(x, top, w, 3); c.fillRect(x, base - h * 0.36, w, 2);
  c.fillStyle = '#7d4a45';
  for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
    const wx = x + w * (0.06 + i * 0.155), wy = top + h * (0.14 + row * 0.38), ww = w * 0.07, wh = h * 0.22;
    if (row === 1 && (i === 2 || i === 3)) continue;
    c.fillRect(wx, wy + ww / 2, ww, wh - ww / 2); c.beginPath(); c.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0); c.fill();
  }
  c.beginPath(); c.moveTo(x + w * 0.4, base); c.lineTo(x + w * 0.4, base - h * 0.32); c.arc(x + w * 0.5, base - h * 0.32, w * 0.1, Math.PI, 0); c.lineTo(x + w * 0.6, base); c.fill();
  // mástil con la bandera
  c.fillStyle = '#555'; c.fillRect(x + w * 0.5 - 1, top - 0.07 * k, 2, 0.07 * k);
  const fx = x + w * 0.5 + 1, fy = top - 0.07 * k, fw = 0.04 * k, fh = 0.027 * k;
  c.fillStyle = '#74acdf'; c.fillRect(fx, fy, fw, fh);
  c.fillStyle = '#ffffff'; c.fillRect(fx, fy + fh / 3, fw, fh / 3);
  c.fillStyle = '#f6b40e'; c.beginPath(); c.arc(fx + fw / 2, fy + fh / 2, fh * 0.12, 0, Math.PI * 2); c.fill();
}

function jacaranda(c, x, base, k, r) {
  c.strokeStyle = '#4a3427'; c.lineCap = 'round';
  c.lineWidth = 0.012 * k; c.beginPath(); c.moveTo(x, base); c.lineTo(x + 0.005 * k, base - 0.09 * k); c.stroke();
  c.lineWidth = 0.006 * k; c.beginPath();
  c.moveTo(x + 0.004 * k, base - 0.08 * k); c.lineTo(x - 0.035 * k, base - 0.13 * k);
  c.moveTo(x + 0.004 * k, base - 0.085 * k); c.lineTo(x + 0.045 * k, base - 0.135 * k); c.stroke();
  const cols = ['#7d5bc0', '#9b7ad8', '#b394e8'];
  const blobs = [[-0.04, 0.14, 0.04], [0.04, 0.145, 0.042], [0, 0.17, 0.045], [-0.015, 0.12, 0.035], [0.025, 0.12, 0.033]];
  cols.forEach((col, ci) => {
    c.fillStyle = col;
    blobs.forEach(([bx, by, br], i) => { if ((i + ci) % 3 === 2 && ci) return; c.beginPath(); c.arc(x + (bx + (r - 0.5) * 0.01 - ci * 0.004) * k, base - (by + ci * 0.006) * k, br * (1 - ci * 0.22) * k, 0, Math.PI * 2); c.fill(); });
  });
  // flores caídas en la vereda
  c.fillStyle = 'rgba(155,122,216,.55)'; c.fillRect(x - 0.05 * k, base - 2, 0.1 * k, 2);
}

function farol(c, x, base, k) {
  c.fillStyle = '#1f2326';
  c.fillRect(x - 0.003 * k, base - 0.15 * k, 0.006 * k, 0.15 * k);
  c.fillRect(x - 0.008 * k, base - 0.012 * k, 0.016 * k, 0.012 * k);
  c.beginPath(); c.moveTo(x - 0.012 * k, base - 0.15 * k); c.lineTo(x + 0.012 * k, base - 0.15 * k); c.lineTo(x + 0.008 * k, base - 0.18 * k); c.lineTo(x - 0.008 * k, base - 0.18 * k); c.fill();
  c.fillStyle = '#fff3c4'; c.fillRect(x - 0.007 * k, base - 0.175 * k, 0.014 * k, 0.02 * k);
  c.fillStyle = '#1f2326'; c.beginPath(); c.moveTo(x - 0.014 * k, base - 0.18 * k); c.lineTo(x, base - 0.192 * k); c.lineTo(x + 0.014 * k, base - 0.18 * k); c.fill();
}

// Taxi negro y amarillo o colectivo, de costado, mirando a la derecha. y: donde apoyan las ruedas.
function vehiculo(c, v, x, y, k) {
  const L = v.kind === 'bondi' ? 0.19 : 0.1, Hh = v.kind === 'bondi' ? 0.06 : 0.032;
  const w = L * k, h = Hh * k;
  c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x + w * 0.05, y - 2, w * 0.9, 3);
  if (v.kind === 'bondi') {
    c.fillStyle = v.color; c.fillRect(x, y - h, w, h * 0.85);
    c.fillStyle = v.color2; c.fillRect(x, y - h * 0.42, w, h * 0.12);
    c.fillStyle = '#2b3846'; for (let i = 0; i < 6; i++) c.fillRect(x + w * (0.06 + i * 0.13), y - h * 0.9, w * 0.1, h * 0.32);
    c.fillRect(x + w * 0.88, y - h * 0.9, w * 0.11, h * 0.55);
    c.fillStyle = '#f6b40e'; c.fillRect(x + w * 0.9, y - h * 0.98, w * 0.08, h * 0.08);
    c.fillStyle = '#fff'; c.font = `900 ${h * 0.22}px Chivo, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(v.linea, x + w * 0.3, y - h * 0.3);
  } else {
    c.fillStyle = '#16181b';
    c.beginPath(); c.moveTo(x, y - h * 0.15); c.lineTo(x, y - h * 0.55); c.lineTo(x + w * 0.22, y - h * 0.6); c.lineTo(x + w * 0.32, y - h); c.lineTo(x + w * 0.72, y - h); c.lineTo(x + w * 0.84, y - h * 0.6); c.lineTo(x + w, y - h * 0.52); c.lineTo(x + w, y - h * 0.15); c.fill();
    c.fillStyle = '#f2c230'; c.beginPath(); c.moveTo(x + w * 0.3, y - h * 0.62); c.lineTo(x + w * 0.35, y - h * 0.95); c.lineTo(x + w * 0.7, y - h * 0.95); c.lineTo(x + w * 0.8, y - h * 0.62); c.fill();
    c.fillStyle = '#2b3846'; c.fillRect(x + w * 0.36, y - h * 0.9, w * 0.15, h * 0.24); c.fillRect(x + w * 0.54, y - h * 0.9, w * 0.15, h * 0.24);
    c.fillStyle = '#ffe9a3'; c.fillRect(x + w * 0.96, y - h * 0.48, w * 0.04, h * 0.12);
    c.fillStyle = '#16181b'; c.fillRect(x + w * 0.46, y - h * 1.12, w * 0.1, h * 0.14);
  }
  c.fillStyle = '#111'; for (const fx of [0.2, 0.8]) { c.beginPath(); c.arc(x + w * fx, y - h * 0.1, h * (v.kind === 'bondi' ? 0.17 : 0.22), 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#888'; for (const fx of [0.2, 0.8]) { c.beginPath(); c.arc(x + w * fx, y - h * 0.1, h * (v.kind === 'bondi' ? 0.07 : 0.09), 0, Math.PI * 2); c.fill(); }
}

function medialuna(c, x, y, s) {
  c.save(); c.translate(x, y); c.rotate(-0.4);
  c.fillStyle = '#d98a2b'; c.strokeStyle = '#8a4e12'; c.lineWidth = s * 0.08;
  c.beginPath(); c.arc(0, 0, s, Math.PI * 0.15, Math.PI * 1.85); c.arc(s * 0.35, 0, s * 0.62, Math.PI * 1.7, Math.PI * 0.3, true); c.closePath();
  c.fill(); c.stroke();
  c.strokeStyle = '#b86a1e'; c.lineWidth = s * 0.06;
  for (const a of [0.55, 1, 1.45]) { c.beginPath(); c.moveTo(Math.cos(a * Math.PI) * s * 0.55, Math.sin(a * Math.PI) * s * 0.55); c.lineTo(Math.cos(a * Math.PI) * s * 0.98, Math.sin(a * Math.PI) * s * 0.98); c.stroke(); }
  c.fillStyle = 'rgba(255,240,200,.45)'; c.beginPath(); c.ellipse(-s * 0.4, -s * 0.4, s * 0.25, s * 0.1, -0.6, 0, Math.PI * 2); c.fill();
  c.restore();
}

function teroCode(c, x, y, s, t) {
  // tero dibujado en código, mirando a la derecha (por si la imagen no cargó)
  c.save(); c.translate(x, y); c.scale(s, s);
  const f = Math.sin(t * 0.03);
  c.fillStyle = '#6f6b63'; c.beginPath(); c.moveTo(0, -0.02); c.lineTo(-0.25, -0.02 - f * 0.3); c.lineTo(-0.05, -0.05); c.fill();
  c.fillStyle = '#8d887d'; c.beginPath(); c.ellipse(0, 0, 0.22, 0.08, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f2f0ea'; c.beginPath(); c.ellipse(-0.02, 0.03, 0.16, 0.045, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1d1d1d'; c.beginPath(); c.ellipse(0.11, 0.01, 0.06, 0.065, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#9a958b'; c.beginPath(); c.ellipse(0.19, -0.05, 0.07, 0.06, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#e33'; c.beginPath(); c.arc(0.22, -0.06, 0.016, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d78b8b'; c.beginPath(); c.moveTo(0.25, -0.05); c.lineTo(0.33, -0.04); c.lineTo(0.25, -0.03); c.fill();
  c.fillStyle = '#8d887d'; c.beginPath(); c.moveTo(0.02, -0.04); c.lineTo(-0.18, -0.04 - f * 0.35); c.lineTo(-0.03, -0.06); c.fill();
  c.restore();
}

// Dibuja un Obelisco con el contorno exacto de los choques, visto de esquina: la cara izquierda
// al sol, la derecha en sombra y la arista en el medio, como se lo ve desde la 9 de Julio. k: píxeles por u.
function drawObelisk(c, pts, k, offX, dir, festejo) {
  const P = pts.map(([x, y]) => [(x - offX) * k, y * k]);
  const path = list => { c.beginPath(); list.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
  const xc = P[0][0], tipY = P[0][1], shY = P[1][1], botY = P[2][1];
  const along = (yy, side) => { // borde del fuste a la altura yy (side -1 izquierda, 1 derecha)
    const t = (yy - shY) / (botY - shY);
    return xc + side * ((P[1][0] - xc) + t * ((P[2][0] - xc) - (P[1][0] - xc)));
  };
  // fuste: cara al sol y cara en sombra, un poco más sucias cerca del pie
  const lit = c.createLinearGradient(0, shY, 0, botY), dark = c.createLinearGradient(0, shY, 0, botY);
  lit.addColorStop(0, '#f6f1e6'); lit.addColorStop(1, '#e2d9c6');
  dark.addColorStop(0, '#d3c9b4'); dark.addColorStop(1, '#bcb19a');
  path([[xc, shY], P[8], P[7], [xc, botY]]); c.fillStyle = lit; c.fill();
  path([[xc, shY], P[1], P[2], [xc, botY]]); c.fillStyle = dark; c.fill();
  // piramidión
  path([P[0], P[8], [xc, shY]]); c.fillStyle = '#ece4d0'; c.fill();
  path([P[0], P[1], [xc, shY]]); c.fillStyle = '#b6ab92'; c.fill();
  // juntas de los bloques de piedra, apenas marcadas
  c.lineWidth = 1;
  for (let yy = shY - dir * 0.06 * k; dir < 0 ? yy < botY - 0.01 * k : yy > botY + 0.01 * k; yy -= dir * 0.06 * k) {
    c.strokeStyle = 'rgba(120,108,85,.14)'; c.beginPath(); c.moveTo(along(yy, -1), yy); c.lineTo(xc, yy); c.stroke();
    c.strokeStyle = 'rgba(80,70,52,.16)'; c.beginPath(); c.moveTo(xc, yy); c.lineTo(along(yy, 1), yy); c.stroke();
  }
  // ventanitas debajo de la punta, una por cara (la de la sombra se ve más angosta)
  const wy = shY - dir * 0.022 * k, wh = 0.014 * k;
  c.fillStyle = '#3f3a30';
  c.fillRect(xc - (xc - along(wy, -1)) * 0.55 - 0.004 * k, wy - wh / 2, 0.008 * k, wh);
  c.fillStyle = '#2f2b24';
  c.fillRect(xc + (along(wy, 1) - xc) * 0.5 - 0.0025 * k, wy - wh / 2, 0.005 * k, wh);
  // arista del medio y contorno
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(xc, tipY); c.lineTo(xc, botY); c.stroke();
  c.strokeStyle = 'rgba(130,118,95,.45)';
  c.beginPath(); c.moveTo(P[8][0], P[8][1]); c.lineTo(P[1][0], P[1][1]); c.stroke();
  // pararrayos en la punta
  c.strokeStyle = '#4b4b4b'; c.lineWidth = Math.max(1, 0.003 * k);
  c.beginPath(); c.moveTo(xc, tipY); c.lineTo(xc, tipY + dir * 0.018 * k); c.stroke();
  // festejo: proyectado de celeste y blanco
  if (festejo) {
    c.save(); path(P); c.clip();
    const fg = c.createLinearGradient(0, tipY, 0, botY);
    fg.addColorStop(0, 'rgba(116,172,223,.6)'); fg.addColorStop(0.33, 'rgba(116,172,223,.6)');
    fg.addColorStop(0.34, 'rgba(255,255,255,.45)'); fg.addColorStop(0.66, 'rgba(255,255,255,.45)');
    fg.addColorStop(0.67, 'rgba(116,172,223,.6)'); fg.addColorStop(1, 'rgba(116,172,223,.6)');
    c.fillStyle = fg; c.fillRect(P[5][0], Math.min(tipY, botY), P[4][0] - P[5][0], Math.abs(botY - tipY));
    c.restore();
  }
  path(P); c.strokeStyle = 'rgba(90,80,60,.4)'; c.lineWidth = 1.2; c.stroke();
  // pedestal y, si sale de la vereda, el cantero de pasto alrededor
  const py0 = Math.min(P[6][1], P[5][1]), ph = Math.abs(P[5][1] - P[6][1]);
  c.fillStyle = '#a19b8f'; c.fillRect(P[6][0], py0, P[3][0] - P[6][0], ph);
  c.fillStyle = '#c2bcae'; c.fillRect(P[6][0], dir < 0 ? py0 : py0 + ph - 2, P[3][0] - P[6][0], 2);
  if (dir < 0) {
    const gy = P[5][1], w = P[4][0] - P[5][0];
    c.fillStyle = '#5e9c45'; c.fillRect(P[5][0] - w * 0.3, gy - 0.008 * k, w * 1.6, 0.008 * k);
    c.fillStyle = '#7bb85a';
    for (let i = 0; i < 7; i++) { const bx = P[5][0] - w * 0.28 + i * w * 0.26; c.beginPath(); c.ellipse(bx, gy - 0.008 * k, w * 0.12, 0.007 * k, 0, Math.PI, 0); c.fill(); }
  }
}

export default {
  id: 'tero',
  name: 'El Vuelo del Tero',
  tagline: 'Esquivá el Obelisco, de arriba y de abajo',
  threshold: 3,
  rules: [
    'El tero cruza Buenos Aires volando. Cada toque en la pantalla es un aletazo para arriba; si no tocás, baja.',
    'Pasá por el hueco entre el Obelisco que sale de la vereda y el Obelisco del revés que cuelga de arriba.',
    'Cada Obelisco que pasás suma 1 punto, y cada medialuna que agarrás suma 1 más.',
    'Cuanto más avanzás, más rápido va y más chico es el hueco.',
    'Si chocás un Obelisco o tocás el piso, se termina.',
  ],
  icon(c, s) {
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#4f9fe0'); g.addColorStop(1, '#cfe8f7');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    const k = s / 0.6, x = 0.36;
    drawObelisk(c, obeliskShape(x, 0.4, 0.62, -1), k, 0, -1, false);
    drawObelisk(c, obeliskShape(x, 0.16, -0.02, 1), k, 0, 1, true);
    const img = getCustom('teroVuela');
    if (img) {
      const fw = img.width / frameCount(img), w = s * 0.55, h = w * img.height / fw;
      c.save(); c.translate(s * 0.34, s * 0.48); c.scale(-1, 1); c.drawImage(img, 0, 0, fw, img.height, -w / 2, -h * 0.62, w, h); c.restore();
    } else teroCode(c, s * 0.34, s * 0.48, s * 0.8, 0);
  },

  mount(el, { seed, onScore, onEnd }) {
    const st = makeCanvas(el), ctx = st.ctx, rng = mulberry32(seed);
    const pill = overlay(el, 'g-pill', 'Tocá para aletear');
    const toast = overlay(el, 'g-toast');
    const teroImg = getCustom('teroVuela');

    const S = {
      x: 0, y: 0.42, vy: 0, rot: 0, started: false, alive: true, score: 0,
      pipes: [], nextX: 1.05, prevGap: 0.42, spawned: 0, passedN: 0,
      acc: 0, flapT: 0, crash: null, shake: 0, floats: [], feathers: [],
      cars: [], carT: 0,
    };
    // tránsito de la 9 de Julio: es decorado, no usa el azar de la partida
    const BONDIS = [['#d62828', '#f6b40e'], ['#1d4e89', '#f2f2f2'], ['#2a9d8f', '#e9c46a'], ['#f4a261', '#264653'], ['#7b2cbf', '#f2f2f2']];
    const LINEAS = ['60', '152', '29', '39', '64', '10', '132', '17'];
    function traffic(dt) {
      S.carT -= dt;
      if (S.carT <= 0) {
        S.carT = 900 + Math.random() * 1800;
        const bondi = Math.random() < 0.35, v = 0.12 + Math.random() * 0.45, col = BONDIS[Math.floor(Math.random() * BONDIS.length)];
        const camL = S.x - TERO_X, view = st.w / st.h;
        const lane = Math.random() < 0.5 ? 0.098 : 0.138;
        const x = v > speedOf(S.passedN) && S.started ? camL - 0.3 : camL + view + 0.05;
        if (!S.cars.some(o => o.lane === lane && Math.abs(o.x - x) < 0.3)) {
          S.cars.push({
            kind: bondi ? 'bondi' : 'taxi', lane, v, x,
            color: col[0], color2: col[1], linea: LINEAS[Math.floor(Math.random() * LINEAS.length)],
          });
          S.cars.sort((a, b) => a.lane - b.lane);
        }
      }
      // nadie se lleva puesto al de adelante: si lo alcanza, va a su velocidad
      const len = v => (v.kind === 'bondi' ? 0.19 : 0.1);
      for (const v of S.cars) {
        const ahead = S.cars.filter(o => o !== v && o.lane === v.lane && o.x > v.x).sort((a, b) => a.x - b.x)[0];
        if (ahead && ahead.x - v.x < len(v) + 0.04) v.v = Math.min(v.v, ahead.v);
      }
      for (const v of S.cars) v.x += v.v * dt / 1000;
      const camL = S.x - TERO_X;
      S.cars = S.cars.filter(v => v.x > camL - 0.6 && v.x < camL + st.w / st.h + 0.6);
    }
    let endTimer = 0;
    const report = () => onScore(S.score, 'Puntos');

    // Cada par de Obeliscos deja un hueco; de un par al siguiente el centro del hueco no se mueve más de 0,3 u.
    // Los márgenes dejan siempre un pedazo de fuste debajo de la punta.
    function addPipe() {
      const gap = gapOf(S.spawned++);
      const lo = gap / 2 + TIP + BASE_H + 0.05, hi = GROUND - gap / 2 - TIP - BASE_H - 0.05;
      let cy = lo + rng() * (hi - lo);
      cy = Math.max(S.prevGap - 0.3, Math.min(S.prevGap + 0.3, cy));
      S.prevGap = cy;
      const x = S.nextX, top = cy - gap / 2, bot = cy + gap / 2;
      S.pipes.push({
        x, top, bot, passed: false,
        up: obeliskShape(x, top, -0.2, 1),        // el del revés: el pedestal queda fuera de la pantalla
        down: obeliskShape(x, bot, GROUND, -1),
        festejoUp: rng() < 0.2, festejoDown: rng() < 0.2,
        medialuna: rng() < 0.28 ? { got: false } : null,
      });
      S.nextX += SPACING;
    }
    while (S.nextX < 3) addPipe();

    function flap() {
      if (!S.alive) return;
      if (!S.started) { S.started = true; pill.hidden = true; }
      S.vy = -FLAP; S.flapT = 0;
      audio.tone(1900, 0.04, 'square', 0.035); audio.tone(2250, 0.05, 'square', 0.035, 0.06);
    }

    function die(cause) {
      if (!S.alive) return;
      S.alive = false; S.crash = cause; S.shake = 1;
      for (let i = 0; i < 10; i++) S.feathers.push({ x: S.x, y: S.y, vx: (Math.random() - 0.5) * 0.5, vy: -Math.random() * 0.5, r: Math.random() * 6, life: 1 });
      audio.lose(); buzz([60, 40, 90]);
      report();
      endTimer = setTimeout(() => onEnd(S.score, { title: TITLES[cause] }), 1000);
    }

    function physics(h) {
      if (!S.started) { S.y = 0.42 + Math.sin(performance.now() / 300) * 0.012; return; }
      S.vy = Math.min(VMAX, S.vy + G * h);
      S.y += S.vy * h;
      if (S.y < R) { S.y = R; S.vy = Math.max(0, S.vy); }
      if (!S.alive) { if (S.y > GROUND - R) { S.y = GROUND - R; S.vy = 0; } return; }
      S.x += speedOf(S.passedN) * h;
      if (S.y > GROUND - R) { S.y = GROUND - R; return die('piso'); }
      for (const p of S.pipes) {
        if (S.x + R < p.x || S.x - R > p.x + PW) continue;
        if (circleHitsPoly(S.x, S.y, R, p.up)) return die('arriba');
        if (circleHitsPoly(S.x, S.y, R, p.down)) return die('abajo');
        if (p.medialuna && !p.medialuna.got && Math.hypot(S.x - (p.x + PW / 2), S.y - (p.top + p.bot) / 2) < R + 0.035) {
          p.medialuna.got = true; S.score += 1; report();
          S.floats.push({ x: p.x + PW / 2, y: (p.top + p.bot) / 2, text: '+1 medialuna', life: 1 });
          audio.tone(1047, 0.08, 'triangle', 0.14); audio.tone(1319, 0.1, 'triangle', 0.14, 0.07);
        }
      }
      for (const p of S.pipes) {
        if (!p.passed && S.x > p.x + PW) {
          p.passed = true; S.passedN += 1; S.score += 1; report();
          audio.tone(880, 0.06, 'triangle', 0.12); buzz(8);
          if (S.passedN % 10 === 0) flash(toast, S.passedN % 50 === 0 ? `¡${S.passedN} Obeliscos! ¡Qué bestia!` : `¡${S.passedN}! Teru teru`);
        }
      }
      while (S.nextX < S.x + 3) addPipe();
      S.pipes = S.pipes.filter(p => p.x + PW > S.x - 1);
    }

    function update(dt) {
      S.acc += Math.min(0.05, dt / 1000);
      while (S.acc >= STEP) { physics(STEP); S.acc -= STEP; }
      S.flapT += dt;
      traffic(dt);
      const target = !S.started ? 0 : !S.alive ? 1.4 : Math.max(-0.45, Math.min(1.2, S.vy * 0.9));
      S.rot += (target - S.rot) * Math.min(1, dt / (S.alive ? 90 : 160));
      S.floats = S.floats.filter(f => { f.y -= dt * 0.00012; f.life -= dt / 900; return f.life > 0; });
      S.feathers = S.feathers.filter(f => { f.x += f.vx * dt / 1000; f.y += f.vy * dt / 1000; f.vy += 0.6 * dt / 1000; f.r += dt * 0.004; f.life -= dt / 1200; return f.life > 0; });
    }

    /* ---------- dibujo ---------- */
    function draw(dt, now) {
      st.begin();
      const W = st.w, H = st.h, k = H;           // k: píxeles por u
      const camL = S.x - TERO_X;
      const X = wx => (wx - camL) * k;
      ctx.save();
      if (S.shake > 0) { ctx.translate((Math.random() - 0.5) * S.shake * 12, (Math.random() - 0.5) * S.shake * 8); S.shake = Math.max(0, S.shake - dt / 450); }

      // cielo y sol de mayo
      const g = ctx.createLinearGradient(0, 0, 0, GROUND * k);
      g.addColorStop(0, '#4f9fe0'); g.addColorStop(0.7, '#a9d3f2'); g.addColorStop(1, '#dcefff');
      ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, GROUND * k + 20);
      solDeMayo(ctx, W - 0.09 * k, 0.1 * k, 0.04 * k, now);

      // nubes
      for (let i = -1; i < W / (0.5 * k) + 2; i++) {
        const cell = Math.floor(camL * 0.06 / 0.5) + i, r = hash(cell, 7);
        if (r < 0.45) continue;
        const cx = (cell * 0.5 - camL * 0.06) * k + r * 0.3 * k, cy = (0.08 + hash(cell, 8) * 0.22) * k, s = (0.05 + r * 0.04) * k;
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        circle(ctx, cx, cy, s); circle(ctx, cx + s, cy + s * 0.2, s * 0.8); circle(ctx, cx - s, cy + s * 0.25, s * 0.7); circle(ctx, cx + s * 0.3, cy - s * 0.4, s * 0.7);
      }

      const base = GROUND * k;
      const layer = (par, size, fn) => {
        for (let i = -2; i < W / (size * k) + 2; i++) {
          const cell = Math.floor(camL * par / size) + i;
          fn(cell, (cell * size - camL * par) * k);
        }
      };

      // siluetas lejanas: torres comunes y, cada tanto, el Barolo, el Kavanagh, la Torre Monumental o el Congreso
      const haze = (h, a) => {
        const hg = ctx.createLinearGradient(0, base - h * k, 0, base);
        hg.addColorStop(0, 'rgba(214,232,248,0)'); hg.addColorStop(1, `rgba(214,232,248,${a})`);
        ctx.fillStyle = hg; ctx.fillRect(-20, base - h * k, W + 40, h * k);
      };
      ctx.fillStyle = '#8fb1d1';
      layer(0.12, 0.17, (cell, x) => {
        const r = hash(cell, 1);
        if (r < 0.42 || cell % 5 === 0) landmark(ctx, ['barolo', 'kavanagh', 'torre', 'congreso'][Math.floor(hash(cell, 9) * 4)], x, base, k * 1.6);
        else {
          const h = (0.22 + hash(cell, 6) * 0.22) * k, w = (0.06 + hash(cell, 10) * 0.06) * k;
          ctx.fillRect(x, base - h, w, h);
          if (hash(cell, 12) < 0.4) ctx.fillRect(x + w * 0.45, base - h - 0.03 * k, 1.5, 0.03 * k);
        }
      });
      haze(0.5, 0.35);

      // edificios porteños, cada tanto la Casa Rosada
      layer(0.35, 0.17, (cell, x) => {
        if (hash(cell, 2) < 0.06) casaRosada(ctx, x - 0.02 * k, base, k);
        else edificio(ctx, x, base, k, hash(cell, 3), hash(cell, 4), hash(cell, 5));
      });
      haze(0.35, 0.22);

      // jacarandás y faroles sobre la vereda
      layer(0.7, 0.22, (cell, x) => {
        if (hash(cell, 13) < 0.65) jacaranda(ctx, x + 0.06 * k, base, k, hash(cell, 14));
        farol(ctx, x + 0.17 * k, base, k);
      });

      // Obeliscos
      for (const p of S.pipes) {
        const x = X(p.x), w = PW * k;
        if (x > W + 10 || x + w < -10) continue;
        drawObelisk(ctx, p.up, k, camL, 1, p.festejoUp);
        drawObelisk(ctx, p.down, k, camL, -1, p.festejoDown);
        if (p.medialuna && !p.medialuna.got) medialuna(ctx, x + w / 2, ((p.top + p.bot) / 2 + Math.sin(now / 250 + p.x) * 0.008) * k, 0.028 * k);
      }

      // vereda de baldosas vainilla, cordón y la 9 de Julio con taxis y colectivos
      const gy = GROUND * k;
      ctx.fillStyle = '#d6cdb9'; ctx.fillRect(-20, gy, W + 40, 0.04 * k);
      const tile = 0.02 * k, off = ((camL * k) % tile + tile) % tile;
      ctx.fillStyle = 'rgba(120,105,80,.18)';
      for (let x = -off; x < W + tile; x += tile) for (let yy = gy + tile * 0.25; yy < gy + 0.04 * k; yy += tile * 0.5) ctx.fillRect(x + tile * 0.25, yy, 1.5, 1.5);
      ctx.fillStyle = 'rgba(0,0,0,.1)'; for (let x = -off; x < W + tile; x += tile) ctx.fillRect(x, gy, 1, 0.04 * k);
      ctx.fillStyle = '#e9e1c8'; ctx.fillRect(-20, gy + 0.04 * k, W + 40, 0.012 * k);
      ctx.fillStyle = '#4a4f57'; ctx.fillRect(-20, gy + 0.052 * k, W + 40, H - gy);
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      const dash = 0.1 * k, doff = ((camL * k) % dash + dash) % dash;
      for (let x = -doff; x < W + dash; x += dash) ctx.fillRect(x, gy + 0.098 * k, dash * 0.45, 0.005 * k);
      for (const v of S.cars) vehiculo(ctx, v, X(v.x), (GROUND + v.lane) * k, k);

      drawTero(now);

      for (const f of S.feathers) {
        ctx.globalAlpha = Math.max(0, f.life); ctx.fillStyle = '#efe9dc';
        ctx.save(); ctx.translate(X(f.x), f.y * k); ctx.rotate(f.r); ctx.beginPath(); ctx.ellipse(0, 0, 0.012 * k, 0.004 * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const f of S.floats) {
        ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.6));
        ctx.font = `900 ${0.03 * k}px Chivo, system-ui, sans-serif`;
        ctx.lineWidth = 0.008 * k; ctx.strokeStyle = '#fff'; ctx.strokeText(f.text, X(f.x), f.y * k);
        ctx.fillStyle = '#b86a1e'; ctx.fillText(f.text, X(f.x), f.y * k);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    function drawTero(now) {
      const k = st.h, x = TERO_X * k, y = S.y * k;
      ctx.save(); ctx.translate(x, y); ctx.rotate(S.rot);
      if (teroImg) {
        const n = frameCount(teroImg), fw = teroImg.width / n;
        // al aletear arranca del cuadro con las alas arriba; planeando aletea más lento
        const f = S.alive ? Math.floor(S.flapT / (S.flapT < 400 ? 45 : 90)) % n : 2;
        const w = 0.15 * k, h = w * teroImg.height / fw;
        ctx.scale(-1, 1);
        ctx.drawImage(teroImg, f * fw, 0, fw, teroImg.height, -w * 0.52, -h * 0.62, w, h);
      } else teroCode(ctx, 0, 0, 0.32 * k, S.alive ? now : 0);
      ctx.restore();
    }

    report();
    const unbind = bindInput(el, { onDown: flap });
    const stop = startLoop((dt, now) => { update(dt); draw(dt, now); });

    return {
      destroy() { stop(); unbind(); clearTimeout(endTimer); st.destroy(); pill.remove(); toast.remove(); },
      _state: S, _update: update, _move: flap, _flap: flap,
      _phys: { G, FLAP, R, PW, GROUND, speedOf },
    };
  },
};
