// Pone un número de versión nuevo a todos los archivos que carga la app, para que los celulares
// no sigan usando los viejos guardados en caché. Correr antes de cada subida:
//   node tools/version.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const v = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
const modules = ['js', 'games'].flatMap(d => readdirSync(join(root, d)).filter(f => f.endsWith('.js')).map(f => `./${d}/${f}`));
const map = { imports: Object.fromEntries(modules.map(m => [m, `${m}?v=${v}`])) };

const file = join(root, 'index.html');
let html = readFileSync(file, 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, `<script type="importmap">${JSON.stringify(map, null, 1)}</script>`);
html = html.replace(/css\/app\.css(\?v=\w+)?/, `css/app.css?v=${v}`);
writeFileSync(file, html);
console.log(`versión ${v}: ${modules.length} módulos`);
