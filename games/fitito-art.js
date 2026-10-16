// Dibujos en pixel art de El Fitito en la Panamericana. Cada función devuelve un canvas chico
// que el juego agranda sin suavizar.
import { pixelArt, mirrored, textWidth } from '../js/pixel.js';

const TIRE = '#1d1f22', CHROME = '#c9ced6', CHROME_D = '#8e959e', GLASS = '#2f4b63', GLASS_HI = '#7fa6c4';
const LIGHT = '#ffe9a3', GRILLE = '#2a2d33', WOOD = '#6b4c32', WOOD_D = '#4f3824', WHITE = '#f2f2f2';

// Fiat 600 blanco visto desde atrás: rejilla del motor, óxido y el paragolpes atado con alambre.
export function fitito() {
  return pixelArt(58, 40, (p, W) => {
    const body = '#f1ede2', shade = '#cbc4b3', rust = '#b5651d', rustD = '#7e4416';
    p.mrect(5, 30, 9, 9, TIRE);
    p.mrect(6, 33, 2, 5, '#383b40');
    // carrocería: sombra abajo, cuerpo y techo redondo
    p.oval(3, 9, 52, 24, shade); p.rect(3, 17, 52, 12, shade);
    p.oval(3, 9, 52, 20, body); p.rect(3, 17, 52, 8, body);
    p.oval(12, 1, 34, 20, body);
    p.rect(14, 3, 3, 1, '#ffffff'); p.rect(12, 5, 2, 2, '#ffffff');
    // luneta
    p.trap(29, 5, 7, 18, 24, GLASS);
    p.rect(19, 6, 4, 1, GLASS_HI); p.rect(18, 7, 2, 1, GLASS_HI);
    p.rect(9, 14, 40, 1, shade);
    // tapa del motor con rejilla
    p.rect(17, 16, 24, 7, '#e4dfd2');
    for (let i = 0; i < 3; i++) p.rect(19, 17 + i * 2, 20, 1, '#8f897b');
    // patente vieja negra
    p.rect(20, 22, 18, 7, '#141414');
    p.text('B600', 21, 23, '#e8e8e8');
    // faros traseros
    p.mrect(5, 15, 3, 6, '#d6362b'); p.mrect(5, 19, 3, 2, '#f08a24'); p.mpx(6, 16, '#ff9a8a');
    // óxido
    p.rect(8, 23, 3, 1, rust); p.px(9, 24, rustD); p.px(10, 22, rust);
    p.rect(45, 11, 2, 2, rust); p.px(46, 13, rustD);
    p.px(44, 25, rust); p.rect(49, 24, 2, 1, rustD);
    // paragolpes con alambre y caño de escape
    p.rect(2, 29, 54, 2, CHROME); p.rect(2, 31, 54, 1, CHROME_D);
    p.rect(12, 28, 1, 5, '#6f767e'); p.rect(14, 28, 1, 5, '#6f767e'); p.px(13, 28, '#6f767e'); p.px(13, 32, '#6f767e');
    p.rect(16, 32, 3, 2, '#5a5f66');
  });
}

// Autos clásicos de frente: Falcon, Renault 12, Peugeot 504 y Torino.
function carFront(body, shade, roofW, details) {
  return pixelArt(56, 40, (p, W) => {
    p.mrect(4, 30, 9, 9, TIRE);
    p.trap(28, 3, 14, roofW, 46, body);
    p.trap(28, 5, 10, roofW - 6, 40, GLASS);
    p.line(14, 13, 18, 6, GLASS_HI); p.line(16, 13, 20, 6, GLASS_HI);
    p.rect(3, 16, 50, 1, body); p.rect(2, 17, 52, 13, body);
    p.rect(2, 26, 52, 4, shade);
    p.rect(4, 17, 48, 1, shade);
    details(p, W);
    p.rect(1, 28, 54, 3, CHROME); p.rect(1, 30, 54, 1, CHROME_D);
    p.rect(22, 28, 12, 4, '#f1f1f1'); p.rect(24, 29, 8, 1, '#3a3d42');
  });
}

const falcon = () => carFront('#2c5aa0', '#1f3f73', 30, p => {
  p.rect(9, 19, 38, 7, GRILLE);
  for (let i = 0; i < 3; i++) p.rect(9, 20 + i * 2, 38, 1, '#b9c0c8');
  p.mrect(3, 19, 5, 6, LIGHT); p.mrect(3, 19, 5, 1, '#fff8dc');
  p.rect(27, 17, 2, 2, '#1f3f73');
});

const renault12 = () => carFront('#d9822b', '#a85f1a', 26, p => {
  p.mrect(3, 20, 11, 5, LIGHT); p.mrect(4, 21, 4, 1, '#fff8dc');
  p.rect(16, 21, 24, 4, GRILLE); p.rect(16, 22, 24, 1, '#9aa1aa');
  p.rect(27, 20, 2, 1, CHROME); p.rect(26, 21, 4, 1, CHROME); p.rect(26, 22, 4, 1, CHROME); p.rect(27, 23, 2, 1, CHROME);
  p.rect(10, 17, 36, 1, '#a85f1a');
});

const peugeot504 = () => carFront('#b8322a', '#86231d', 28, p => {
  // los "ojos tristes": el borde de arriba cae hacia afuera
  p.mrect(9, 19, 5, 1, LIGHT); p.mrect(6, 20, 8, 1, LIGHT); p.mrect(3, 21, 11, 2, LIGHT); p.mrect(3, 23, 11, 1, '#e8c97a');
  p.rect(16, 19, 24, 6, GRILLE);
  for (let x = 17; x < 40; x += 3) p.rect(x, 19, 1, 6, '#9aa1aa');
  p.rect(27, 17, 2, 2, CHROME);
});

const torino = () => carFront('#e0b12b', '#a8821a', 32, p => {
  p.moval(2, 19, 6, 6, LIGHT); p.moval(9, 19, 6, 6, LIGHT);
  p.mpx(4, 20, '#fff8dc'); p.mpx(11, 20, '#fff8dc');
  p.rect(17, 19, 22, 7, GRILLE); p.rect(17, 22, 22, 1, CHROME); p.rect(27, 19, 2, 7, CHROME);
  p.mrect(20, 16, 3, 2, '#1d1f22');
});

export const cars = () => [falcon(), renault12(), peugeot504(), torino()];

// Camión de frente, con la visera fileteada.
export function camion() {
  return pixelArt(80, 64, (p, W) => {
    const cab = '#c0392b', cabD = '#8f2a20', fil = '#ffd23f';
    p.mrect(6, 53, 13, 10, TIRE);
    p.mrect(1, 13, 3, 9, '#2b2e33'); p.mrect(4, 16, 1, 1, '#2b2e33');
    p.rect(5, 8, 70, 48, cab); p.rect(5, 45, 70, 11, cabD);
    p.rect(7, 2, 66, 7, '#1f5e3a');
    p.text('EL TANO', (W - textWidth('EL TANO')) / 2, 3, fil);
    p.mrect(9, 3, 4, 1, fil); p.mpx(9, 4, fil); p.mrect(10, 5, 3, 1, WHITE); p.mpx(12, 4, WHITE);
    p.mrect(9, 11, 29, 17, GLASS);
    p.line(12, 25, 20, 13, GLASS_HI); p.line(14, 25, 22, 13, GLASS_HI);
    p.mrect(5, 29, 13, 1, fil); p.mrect(5, 30, 13, 1, '#2f8f4e');
    p.rect(20, 31, 40, 13, GRILLE);
    for (let x = 21; x < 60; x += 3) p.rect(x, 32, 1, 11, '#9aa1aa');
    p.moval(8, 33, 9, 9, LIGHT); p.moval(10, 35, 3, 3, '#fff8dc');
    p.rect(3, 46, 74, 5, '#d0d4da'); p.rect(3, 50, 74, 1, CHROME_D);
    p.rect(32, 47, 16, 4, '#f1f1f1'); p.rect(34, 48, 12, 1, '#3a3d42');
  });
}

// Pozo con una rama clavada para avisar (o una goma vieja).
export function baches() {
  const hole = p => {
    p.oval(2, 15, 40, 11, '#55585e');
    p.oval(5, 16, 34, 8, '#18191b');
    p.oval(10, 18, 18, 4, '#36526e');
    p.rect(13, 19, 5, 1, '#6f93b5');
    p.px(1, 19, '#3a3c40'); p.rect(42, 20, 2, 1, '#3a3c40'); p.px(30, 14, '#3a3c40');
  };
  const rama = pixelArt(45, 26, p => {
    hole(p);
    p.line(24, 20, 14, 2, '#6b4426'); p.line(25, 20, 15, 2, '#6b4426');
    p.line(18, 9, 10, 5, '#6b4426'); p.line(20, 12, 27, 7, '#6b4426');
    for (const [x, y] of [[9, 4], [11, 3], [14, 1], [16, 0], [26, 6], [28, 5], [12, 6]]) { p.rect(x, y, 2, 2, '#4e8a3a'); p.px(x, y, '#76b456'); }
  });
  const goma = pixelArt(45, 26, p => {
    hole(p);
    p.oval(15, 1, 15, 19, TIRE);
    p.oval(19, 6, 7, 9, '#3f4248');
    p.rect(17, 5, 1, 4, '#4a4d52');
  });
  return [rama, goma];
}

/* ---------- costado de la ruta ---------- */

export function eucalipto() {
  return pixelArt(34, 80, p => {
    p.rect(15, 32, 4, 48, '#d9d0c0'); p.rect(15, 44, 2, 5, '#a89f90'); p.rect(17, 58, 2, 6, '#b5ab9b'); p.rect(16, 70, 2, 4, '#a89f90');
    p.line(16, 40, 9, 29, '#cfc5b4'); p.line(18, 37, 25, 26, '#cfc5b4');
    p.oval(2, 26, 11, 11, '#3f5f4f'); p.oval(21, 25, 11, 12, '#3f5f4f');
    p.oval(4, 15, 14, 16, '#3f5f4f'); p.oval(16, 12, 16, 18, '#3f5f4f');
    p.oval(9, 2, 16, 18, '#4b6d5b');
    p.oval(11, 4, 8, 7, '#6f917c'); p.oval(20, 14, 7, 6, '#6f917c'); p.oval(6, 18, 6, 5, '#5a7e69'); p.oval(23, 27, 5, 4, '#5a7e69');
  });
}

export function poste() {
  return pixelArt(18, 70, p => {
    p.rect(8, 4, 3, 66, WOOD); p.rect(10, 4, 1, 66, WOOD_D);
    p.rect(1, 8, 16, 2, WOOD);
    for (const x of [2, 6, 12, 15]) p.rect(x, 6, 1, 2, '#9fd0c0');
  });
}

export function alambrado() {
  return pixelArt(4, 14, p => { p.rect(1, 1, 2, 13, '#7a5a3a'); });
}

export function cartel(line1, line2) {
  const w = Math.max(30, Math.max(textWidth(line1), textWidth(line2)) + 10), h = 40;
  return pixelArt(w, h, (p, W) => {
    p.mrect(7, 18, 2, 22, '#9aa0a8');
    p.rect(1, 1, W - 2, 18, '#1f7a4a');
    p.rect(2, 2, W - 4, 1, WHITE); p.rect(2, 16, W - 4, 1, WHITE); p.rect(2, 2, 1, 15, WHITE); p.rect(W - 3, 2, 1, 15, WHITE);
    p.text(line1, (W - textWidth(line1)) / 2, 4, WHITE);
    p.text(line2, (W - textWidth(line2)) / 2, 10, WHITE);
  });
}

export function gauchito() {
  return pixelArt(40, 36, p => {
    const red = '#d62828';
    p.rect(3, 2, 1, 34, WOOD); p.rect(36, 6, 1, 30, WOOD);
    p.rect(4, 2, 8, 2, red); p.rect(4, 4, 6, 2, red); p.rect(4, 6, 3, 1, red);
    p.rect(28, 6, 8, 2, red); p.rect(30, 8, 6, 2, red); p.rect(33, 10, 3, 1, red);
    p.rect(19, 7, 2, 6, '#7a1414'); p.rect(17, 8, 6, 1, '#7a1414');
    p.trap(20, 12, 7, 2, 22, '#9e1b1b');
    p.rect(11, 19, 18, 14, red);
    p.rect(16, 22, 8, 10, '#3a0d0d');
    p.rect(19, 27, 2, 4, '#f4ead0'); p.px(19, 25, '#ffd23f'); p.px(20, 26, '#ff8c2a');
    p.px(13, 21, '#ff6b6b'); p.px(26, 21, '#ff6b6b');
    p.rect(9, 33, 22, 2, '#7d6a55');
  });
}

export function parrilla() {
  return pixelArt(70, 50, p => {
    const chapa = '#8d949c', wood = '#9a6b3e';
    // parrilla de tambor con chorizos y humo
    p.rect(4, 40, 1, 9, '#333'); p.rect(15, 40, 1, 9, '#333');
    p.rect(2, 32, 16, 8, '#2e3136'); p.rect(2, 31, 16, 1, '#ff8c2a');
    p.rect(4, 29, 5, 2, '#a3402a'); p.rect(11, 29, 5, 2, '#a3402a');
    p.oval(5, 20, 8, 7, '#d9dcdf'); p.oval(8, 11, 9, 8, '#c9cdd1'); p.oval(3, 2, 10, 8, '#e6e8ea');
    // puesto con techo de chapa y cartel
    p.rect(27, 0, 36, 8, '#f4ead0');
    p.text('CHORIPAN', 27 + (36 - textWidth('CHORIPAN')) / 2, 2, '#c0392b');
    p.trap(45, 8, 5, 42, 48, chapa);
    for (let x = 23; x < 68; x += 3) p.rect(x, 8, 1, 5, '#6d747c');
    p.rect(24, 13, 2, 35, WOOD); p.rect(64, 13, 2, 35, WOOD);
    p.rect(23, 32, 44, 14, wood); p.rect(23, 36, 44, 1, '#7a5230'); p.rect(23, 40, 44, 1, '#7a5230');
    p.rect(30, 28, 2, 4, '#3c7a3c'); p.rect(34, 27, 2, 5, '#7a2e22'); p.rect(56, 29, 6, 3, '#f4ead0');
  });
}

export function puesto(texto) {
  const w = Math.max(48, textWidth(texto) + 8);
  return pixelArt(w, 40, (p, W) => {
    p.rect(2, 0, W - 4, 7, '#f4ead0');
    p.text(texto, (W - textWidth(texto)) / 2, 1, '#7a2e22');
    p.mrect(4, 7, 2, 31, WOOD); p.rect(4, 8, W - 8, 2, WOOD);
    for (let x = 10; x < W - 10; x += 6) { p.rect(x, 10, 3, 8, '#7a2e22'); p.px(x + 1, 12, '#f4ead0'); p.px(x, 15, '#f4ead0'); }
    for (let x = 8; x < W - 12; x += 11) p.oval(x, 19, 9, 6, '#d9a35b');
    p.rect(4, 24, W - 8, 4, WHITE);
    for (let x = 4; x < W - 4; x += 4) p.rect(x, 24, 2, 4, '#c0392b');
    p.mrect(7, 28, 2, 10, WOOD);
  });
}

// Vaca Hereford (colorada con la cara blanca), mirando a la izquierda; pastando o con la cabeza levantada.
export function vaca(pastando) {
  return pixelArt(34, 23, p => {
    const c = '#8a3f1f', d = '#6a3018', w = '#f2efe6';
    for (const x of [8, 12, 23, 27]) { p.rect(x, 15, 3, 6, d); p.rect(x, 20, 3, 1, '#2a1a10'); }
    p.oval(6, 4, 26, 13, c);
    p.rect(11, 14, 15, 2, w);
    p.rect(31, 6, 1, 9, d); p.rect(30, 14, 3, 2, '#2a1a10');
    const hy = pastando ? 10 : 3;
    p.rect(5, hy + 2, 5, 6, c);
    p.oval(0, hy, 8, 9, w);
    p.px(1, hy - 1, '#e8dcc0'); p.px(6, hy - 1, '#e8dcc0');
    p.px(0, hy + 1, c); p.px(7, hy + 1, c);
    p.px(2, hy + 3, '#2a1a10');
    p.rect(1, hy + 7, 4, 2, '#d99a8a');
  });
}

export function molino() {
  return pixelArt(44, 96, p => {
    const steel = '#8d949c', blade = '#b7bcc2';
    p.line(13, 94, 20, 24, steel); p.line(31, 94, 24, 24, steel);
    for (let y = 34; y < 94; y += 14) {
      const t = (y - 24) / 70, a = 20 - 7 * t, b = 24 + 7 * t;
      p.line(a, y, b, y, steel);
      const t2 = Math.min(1, (y + 14 - 24) / 70);
      if (y + 14 < 94) p.line(a, y, 24 + 7 * t2, y + 14, '#6d747c');
    }
    p.rect(22, 15, 18, 1, steel); p.rect(35, 10, 6, 8, '#c9ced6');
    for (let k = 0; k < 16; k++) {
      const an = k / 16 * Math.PI * 2;
      p.line(22 + Math.cos(an) * 3, 16 + Math.sin(an) * 3, 22 + Math.cos(an) * 13, 16 + Math.sin(an) * 13, k % 2 ? blade : steel);
    }
    p.rect(21, 15, 3, 3, '#5a5f66');
  });
}

export function ypf() {
  return pixelArt(98, 54, p => {
    const blue = '#1c4fa0';
    p.rect(0, 50, 98, 3, '#9a9a9a');
    p.rect(54, 26, 30, 24, '#e9e4d8'); p.rect(58, 32, 12, 8, GLASS); p.rect(74, 34, 7, 16, GLASS);
    p.rect(8, 21, 3, 29, '#d0d4da'); p.rect(62, 21, 3, 29, '#d0d4da');
    p.rect(2, 12, 70, 2, WHITE); p.rect(2, 14, 70, 7, blue);
    p.text('YPF', 37 - textWidth('YPF') / 2, 15, WHITE);
    for (const x of [22, 44]) { p.rect(x, 34, 6, 16, blue); p.rect(x, 34, 6, 4, WHITE); p.rect(x + 1, 40, 4, 2, '#ffd23f'); }
    p.rect(88, 8, 2, 42, '#9aa0a8');
    p.rect(80, 0, 18, 10, blue);
    p.text('YPF', 89 - textWidth('YPF') / 2, 2, WHITE);
  });
}

// Peaje que cruza la ruta entera; los carriles con luz verde.
export function peaje() {
  return pixelArt(440, 150, p => {
    const c = 220, lane = 152;
    p.rect(6, 8, 428, 6, '#c9ced6');
    p.rect(10, 14, 420, 18, '#f2c230'); p.rect(10, 30, 420, 3, '#2b2e33');
    p.text('PEAJE', c - textWidth('PEAJE', 3) / 2, 16, '#2b2e33', 3);
    for (const l of [-2 / 3, 0, 2 / 3]) { p.rect(c + l * lane - 4, 35, 8, 6, '#2b2e33'); p.rect(c + l * lane - 3, 36, 6, 4, '#3ccf4e'); }
    p.rect(20, 33, 18, 117, '#d0d4da'); p.rect(402, 33, 18, 117, '#d0d4da');
    p.rect(34, 33, 4, 117, '#a8aeb6'); p.rect(416, 33, 4, 117, '#a8aeb6');
    p.rect(0, 100, 46, 50, '#e9e4d8'); p.rect(4, 108, 38, 14, GLASS);
    p.rect(394, 100, 46, 50, '#e9e4d8'); p.rect(398, 108, 38, 14, GLASS);
    p.rect(0, 96, 46, 4, '#c0392b'); p.rect(394, 96, 46, 4, '#c0392b');
  });
}

export function nube(w) {
  return pixelArt(w, Math.round(w * 0.4), (p, W, H) => {
    p.oval(0, H * 0.4, W * 0.6, H * 0.6, '#f6c99a');
    p.oval(W * 0.3, 0, W * 0.5, H * 0.9, '#f6c99a');
    p.oval(W * 0.55, H * 0.35, W * 0.45, H * 0.65, '#f6c99a');
    p.oval(W * 0.35, H * 0.1, W * 0.3, H * 0.4, '#ffe3c2');
  }, null);
}

export { mirrored };
