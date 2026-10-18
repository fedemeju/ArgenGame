// Juegos que entran en el sorteo del desafío. Para sumar uno: crear games/<id>.js con la misma forma
// que viborita.js (id, name, tagline, threshold, rules, icon, mount) y agregarlo a esta lista.
// torre.js está escrito pero fuera del sorteo hasta decidir los juegos nuevos.
import viborita from './viborita.js';
import fitito from './fitito.js';
import carpincho from './carpincho.js';
import tero from './tero.js';
import pana from './pana.js';

const LIST = [viborita, fitito, carpincho, tero, pana];

export const GAMES = Object.fromEntries(LIST.map(g => [g.id, g]));
export const GAME_IDS = LIST.map(g => g.id);
