# ArgenGame

Minijuegos argentos para jugar con amigos desde el celular. Primero web (link por WhatsApp, anda en Android y iPhone); después se empaqueta para Play Store con Capacitor.

## Viborita Criolla

La viborita come mates, empanadas y alfajores. Si juntás **3 iguales seguidos** detrás de la cabeza hacés combo: suma puntos y la viborita se achica 3. Los combos seguidos suben la racha (hasta x9) mientras la barra no se vacíe.

- **Desafío del día:** la misma secuencia de comida para todos ese día, y un resultado para copiar y pegar en el grupo.
- **Partida libre:** comida al azar.
- Controles: deslizar el dedo en cualquier parte. En compu, flechas o WASD; `P` o `Esc` pausa.

### Probarlo

Es un solo archivo: abrí `index.html` en el navegador. Para probarlo en el celular, activá GitHub Pages en este repo (Settings → Pages → rama `main`) y abrí el link.

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
