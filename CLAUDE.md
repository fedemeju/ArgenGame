# ArgenGame — notas para seguir el proyecto

Desafío diario de minijuegos argentos entre amigos, web para celular (después Android con Capacitor). Repo: https://github.com/fedemeju/ArgenGame. Se publica con GitHub Pages desde `main`. El README tiene las reglas del desafío, la estructura y el formato de imágenes.

## Cómo trabajar acá

- Textos de la app en español rioplatense (vos, tocá, cuadras).
- Se sube directo a `main` (el dueño lo pidió así). El dueño prefiere que se avance sin pedirle que elija entre opciones de diseño: decidir, hacerlo y mostrarle el resultado.
- **Antes de cada push:** `node tools/version.mjs`. Versiona los módulos en el import map de `index.html`; sin eso el celular sigue usando archivos viejos del caché de GitHub Pages (10 min) y parece que no se subió nada.
- Sin build ni dependencias: módulos ES servidos tal cual. Para probar en local: `node tools/serve.mjs` y abrir http://localhost:8766 (los módulos no cargan con `file://`). Hace falta Node 22 o más nuevo (los `.js` son módulos ES sin `package.json`).
- Tests: `node tests/tournament.test.mjs` (reglas del desafío) y `node tests/fitito.sim.mjs` (40 partidas simuladas con piloto automático; controla que nunca queden los 3 carriles tapados).
- En el navegador de pruebas de Claude el panel suele quedar en segundo plano y `requestAnimationFrame` no corre: los juegos parecen congelados. En localhost la partida queda en `window.__partida` (`_state`, `_update`, `_move`) para manejarla desde la consola.
- Para ver el Fitito sin depender del panel: `tools/ver-fitito.html` (con el servidor andando). `?modo=dibujos` muestra todos los dibujos; sin eso dibuja un cuadro del juego (`pasos=`, `seed=`, `carril=`). Captura con Edge sin ventana: `msedge --headless=new --window-size=375,812 --virtual-time-budget=3000 --screenshot=archivo.png "http://localhost:8766/tools/ver-fitito.html?pasos=500"`.

## Decisiones tomadas

- Guardado en **Firebase** (proyecto `argengame`, Firestore + login anónimo). Si `js/firebase-config.js` queda en `null`, funciona en modo prueba local.
- Login con Google **opcional**: se entra anónimo y el botón "Guardar con Google" asocia la cuenta al mismo uid (`linkWithPopup`). Nombre y lista de desafíos se copian a `users/{uid}` para recuperarlos en otro celular. No se hizo obligatorio porque Google bloquea el login en navegadores internos de apps.
- **Los desafíos se juegan solo con pantalla táctil** (celular o tablet), para todos los juegos: en la compu con teclado es más fácil. La práctica sí anda en la compu, y en localhost se permite todo para probar. Está en `canPlayRanked()` de `js/app.js`.
- 10 días, mínimo 2 jugadores, unirse por link, 3 intentos por día sin pausa, changui (menos de 3 puntos no cuenta) hasta 3 por día, puntos por puesto diario.
- Juegos sorteados por día sin repetir dos seguidos, misma semilla para todo el grupo.
- **Los juegos nuevos los define el dueño con sus ideas**: no inventar juegos por cuenta propia. `games/torre.js` está escrito pero fuera del sorteo.
- Puede que la app pase a llamarse **Recreo** (al dueño le gusta; el proyecto de Firebase ya tiene ese nombre público). Falta confirmarlo antes de cambiar textos.

## Juegos

- **Viborita Criolla** (`games/viborita.js`): la cabeza propia (`assets/cabeza.png`) está de frente con boina arriba y ojos mirando abajo; se rota para que los ojos miren hacia donde avanza y la boina quede hacia el cuerpo.
- **El Fitito en la Panamericana** (`games/fitito.js`): ruta pseudo 3D **siempre recta** (el dueño no quiere curvas), 3 carriles fijos, un toque mueve un carril. Todo el tráfico avanza en filas rígidas a la misma velocidad para garantizar que nunca se tapen los 3 carriles (máximo 2 obstáculos juntos contando pozos). En **pixel art**: se dibuja en un lienzo de ~190 px de ancho y se agranda sin suavizar. Los dibujos están en código en `games/fitito-art.js` (con `js/pixel.js`): Fitito blanco con óxido, Falcon, Renault 12, Peugeot 504, Torino, camión fileteado, pozos con rama o goma, y al costado alambrado, eucaliptos, vacas, molinos, Gauchito Gil, carteles verdes, parrilla de choripán, puestos de pan casero y salame, YPF y peaje. El paisaje usa un azar aparte del tráfico.

## Pendientes

- Más juegos, con las ideas del dueño.
