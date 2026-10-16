# ArgenGame — notas para seguir el proyecto

Desafío diario de minijuegos argentos entre amigos, web para celular (después Android con Capacitor). Repo: https://github.com/fedemeju/ArgenGame. Se publica con GitHub Pages desde `main`. El README tiene las reglas del desafío, la estructura y el formato de imágenes.

## Cómo trabajar acá

- Textos de la app en español rioplatense (vos, tocá, cuadras).
- Se sube directo a `main` (el dueño lo pidió así).
- **Antes de cada push:** `node tools/version.mjs`. Versiona los módulos en el import map de `index.html`; sin eso el celular sigue usando archivos viejos del caché de GitHub Pages (10 min) y parece que no se subió nada.
- Sin build ni dependencias: módulos ES servidos tal cual. Para probar en local: `node tools/serve.mjs` y abrir http://localhost:8766 (los módulos no cargan con `file://`).
- Tests: `node tests/tournament.test.mjs` (reglas del desafío) y `node tests/fitito.sim.mjs` (40 partidas simuladas con piloto automático; controla que nunca queden los 3 carriles tapados).
- En el navegador de pruebas de Claude el panel suele quedar en segundo plano y `requestAnimationFrame` no corre: los juegos parecen congelados. En localhost la partida queda en `window.__partida` (`_state`, `_update`, `_move`) para manejarla desde la consola.

## Decisiones tomadas

- Guardado en **Firebase** (Firestore + login anónimo). Sin `js/firebase-config.js` configurado funciona en modo prueba local.
- Login con Google **opcional**: se entra anónimo y el botón "Guardar con Google" asocia la cuenta al mismo uid (`linkWithPopup`). Nombre y lista de desafíos se copian a `users/{uid}` para recuperarlos en otro celular. No se hizo obligatorio porque Google bloquea el login en navegadores internos de apps.
- 10 días, mínimo 2 jugadores, unirse por link, 3 intentos por día sin pausa, changui (menos de 3 puntos no cuenta) hasta 3 por día, puntos por puesto diario.
- Juegos sorteados por día sin repetir dos seguidos, misma semilla para todo el grupo.
- **Los juegos nuevos los define el dueño con sus ideas**: no inventar juegos por cuenta propia. `games/torre.js` está escrito pero fuera del sorteo.

## Juegos

- **Viborita Criolla** (`games/viborita.js`): la cabeza propia (`assets/cabeza.png`) está de frente con boina arriba y ojos mirando abajo; se rota para que los ojos miren hacia donde avanza y la boina quede hacia el cuerpo.
- **El Fitito en la Panamericana** (`games/fitito.js`): ruta pseudo 3D, 3 carriles fijos, un toque mueve un carril. Todo el tráfico avanza en filas rígidas a la misma velocidad para garantizar que nunca se tapen los 3 carriles (máximo 2 obstáculos juntos contando pozos).

## Pendientes

- Fotos de autos para el Fitito: `assets/fitito.png` (desde atrás), `assets/auto1-3.png` y `assets/camion.png` (de frente). PNG transparente, ~480 px de ancho, vista recta, ruedas tocando el borde de abajo, sin sombra.
- Conectar Firebase (pasos en el README).
- Más juegos, con las ideas del dueño.
