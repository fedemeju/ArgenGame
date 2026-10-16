# ArgenGame

Desafíos diarios de minijuegos argentos entre amigos, desde el celular. Es web (se abre con un link y anda en Android y iPhone); más adelante se empaqueta para Play Store con Capacitor.

## Cómo funciona el desafío

- Alguien crea un desafío y pasa el link de invitación. Cada amigo lo abre, pone su nombre y queda adentro.
- Con **2 jugadores o más**, quien lo creó lo arranca. Desde ese día dura **10 días**.
- Cada día toca un **minijuego sorteado** (sin repetir dos días seguidos) y todos juegan la misma partida: la misma semilla para todo el grupo.
- **3 intentos por día**, vale el mejor. No hay pausa: si salís de la app, la partida termina con los puntos que tenías.
- **Changui:** si un intento hace menos de 3 puntos, no cuenta y se devuelve. Hasta 3 changuis por día.
- **Puntos por puesto** cada día (1° 10, 2° 8, 3° 6, 4° 5, 5° 4, 6° 3, 7° 2, 8° 1). Gana el que más suma en los 10 días; desempata quien ganó más días.
- Al terminar, quien lo creó puede arrancar la **revancha** con el mismo grupo.
- El día cambia a las 00:00 de Argentina.

## Probarlo

Hay que servirlo desde un servidor web (los módulos de JavaScript no cargan abriendo el archivo directo). Con GitHub Pages: Settings → Pages → Deploy from a branch → `main` / root. Queda en `https://fedemeju.github.io/ArgenGame/`.

Sin Firebase configurado arranca en **modo prueba**: todo se guarda solo en ese celular y aparece el botón "Sumar jugador de prueba" para probar el ranking sin otro teléfono.

## Conectar Firebase (para jugar de verdad con amigos)

1. Entrá a https://console.firebase.google.com y creá un proyecto (por ejemplo `argengame`). Google Analytics no hace falta.
2. **Authentication** → Comenzar → Método de acceso → activá **Anónimo**.
3. **Firestore Database** → Crear base de datos → ubicación `southamerica-east1` (São Paulo) → modo producción.
4. En Firestore → **Reglas**, pegá el contenido de [`firestore.rules`](firestore.rules) y publicá.
5. Configuración del proyecto (engranaje) → Tus apps → ícono web `</>` → registrá la app (sin Hosting).
6. Copiá el objeto `firebaseConfig` que te muestra y pegalo en [`js/firebase-config.js`](js/firebase-config.js), reemplazando el `null`.
7. Authentication → Configuración → **Dominios autorizados** → agregá `fedemeju.github.io`.

La `apiKey` de Firebase para web es pública por diseño; lo que protege los datos son las reglas de Firestore.

## Estructura

| Carpeta / archivo | Qué hay |
|---|---|
| `index.html`, `css/app.css` | La app |
| `js/app.js` | Pantallas: nombre, mis desafíos, unirse, grupo y ranking, reglas, partida, resultado |
| `js/tournament.js` | Reglas del desafío: días, intentos, changui, puntos, sorteo de juegos |
| `js/data.js` | Guardado: Firebase o modo prueba local |
| `js/engine.js` | Herramientas para los juegos: azar con semilla, canvas, controles, sonido |
| `js/art.js` | Dibujos provisorios y carga de imágenes de `assets/` |
| `games/` | Un archivo por minijuego; `games/index.js` dice cuáles entran en el sorteo |
| `firestore.rules` | Reglas de seguridad de Firestore |

### Sumar un minijuego

Crear `games/<id>.js` con la misma forma que `games/viborita.js`:
- `id`, `name`, `tagline`, `rules` (lista de frases), `threshold` (mínimo para que el intento cuente), `icon(ctx, size)`.
- `mount(contenedor, { seed, onScore, onEnd })`, que devuelve `{ destroy }`.

Después se agrega a la lista de `games/index.js`. Usar siempre el `seed` para el azar, así todo el grupo juega la misma partida.

## Pendientes

- [ ] **Imágenes propias** de mate, empanada, alfajor y cabeza de la víbora (formato abajo).
- [ ] **Juegos nuevos**: definir las ideas. `games/torre.js` (Torre de Alfajores) está escrito pero fuera del sorteo.
- [ ] Conectar Firebase (pasos arriba).

## Imágenes propias

El juego usa dibujos provisorios hechos en código. Si ponés estos archivos en `assets/`, los toma solo; si falta alguno, sigue usando el provisorio.

| Archivo | Qué es | Notas |
|---|---|---|
| `assets/mate.png` | Mate | Comida |
| `assets/empanada.png` | Empanada | Comida |
| `assets/alfajor.png` | Alfajor | Comida |
| `assets/cabeza.png` | Cabeza de la víbora | Opcional. Mirando **hacia la derecha**; el juego la rota |

Formato para todas:

- **PNG con fondo transparente**, cuadrado de **256×256 px**.
- Objeto centrado, con unos 10% de margen libre alrededor.
- Contorno oscuro y grueso, colores planos o con poco sombreado: se ven a unos 30 px en el celular y tienen que reconocerse de un vistazo.
- Las tres comidas en el mismo estilo y vista (frontal o 3/4), y con siluetas bien distintas entre sí.
- Menos de 50 KB cada una.
