# js/simulacion-media.js

El dibujo y la grabación de video de la pestaña Simulación. Expone
`window.SimMedia` y lo usa [js/simulacion.js](simulacion.md).

## Dos formas de dibujar lo mismo

Las piezas (jugadoras, rivales, pelota, flechas de recorrido, casilleros
sombreados, textos y la grilla) se dibujan de dos maneras:

- **SVG** (`renderItemsSvg`, `drawPitchSvg`): para la pantalla. Cada pieza es
  un nodo que la interfaz puede tocar y arrastrar (`class="t-item"` con su
  `data-id`); las flechas de recorrido, los casilleros y la grilla son `t-auto`
  y no reciben toques (los casilleros se sombrean tocando la cancha, no el
  casillero).
- **canvas** (`drawItemsCanvas`, `drawVideoFrame`): para el video. Cada
  cuadro se pinta directo con la API 2D del canvas. Se hizo aparte porque
  la alternativa (convertir cada cuadro a una imagen SVG y dibujarla) es
  demasiado lenta para grabar en vivo, y en Safari peor.

Las dos comparten las medidas (`THEME`) y la geometría de la punta de
flecha (`arrowGeometry`), para que se vean iguales. Cada pieza puede traer
`_o` (opacidad de 0 a 1, para las que entran o salen en una transición) y, la
pelota, `_h` (altura de 0 a 1 en un pase por arriba: se dibuja más grande y
levantada, con su sombra en el piso). El orden de capas (`DRAW_ORDER`) es:
grilla, casilleros, flechas, jugadoras y rivales, pelota y textos.

Los **recorridos** (`type: 'track'`, usados por la Secuencia) son una lista de
puntos con su flecha y el número del paso en un círculo (`trackSvg`,
`trackParts`): la punta apunta según los últimos ~8 de camino, así una curva
que termina lenta igual queda bien orientada. `pointAlong(puntos, fracción)` da el
punto a esa fracción del **largo** del camino (lo usa la animación) y
`simplifyPath` (Ramer–Douglas–Peucker) deja un camino grabado con pocos puntos.
La punta arrastrable de un recorrido elegido es un item aparte (`handle`, capa
superior): si fuera parte del recorrido, la ficha que termina justo ahí la
taparía. `deliverFile` es la entrega del video: menú de compartir en celular,
descarga en compu.

`THEME.GRID` define los casilleros (3 columnas por 4 filas alineadas con las
líneas de la cancha), `cellRect` da el rectángulo de cada uno y `cellName` su
nombre (`A1` a `C4`). `THEME.GOAL_X` y `GOAL_Y` dicen adónde va la pelota en
un tiro o un gol.

## El cuadro de video: `drawVideoFrame`

720 x 1200 px (todo múltiplo de 16, lo que le gusta a los codificadores de
video): una franja azul de 96 px con el nombre y el escudo (en una chapita
blanca, porque el PNG del escudo tiene fondo blanco), la cancha de 960 px, y
una franja de 144 px abajo con el nombre de la fase y su nota (`wrapText`
parte la nota en hasta 2 renglones).

## Grabar: `recordVideo`

Pinta un `<canvas>` fuera de pantalla y lo graba con `captureStream` +
`MediaRecorder`. Es **en tiempo real**: una animación de 10 segundos tarda
10 segundos en grabarse (más medio segundo de cola para que no se corte el
último cuadro). Por cada cuadro de pantalla llama a `getFrame(ms)` (que le
da las piezas y el texto de ese instante) y avisa el avance con
`onProgress`.

El formato lo elige `pickMimeType` de una lista de preferencias: MP4 con
H.264 primero, después WebM. Chrome y Safari de hoy graban MP4 directamente;
en un navegador que no, cae a WebM (que WhatsApp no siempre reproduce).
`videoSupported()` avisa si hay algo disponible; si no, la interfaz
deshabilita el botón.

Medido con un video de una jugada de 3 fases: H.264 perfil Baseline,
`yuv420p`, 720 x 1200, unos 30 cuadros por segundo, 450 KB para 5,8
segundos.

## Dependencias

| Dependencia | Para qué |
|---|---|
| `MediaRecorder` / `canvas.captureStream` | grabar el video |
| `images/escudo-faltajue.png` | escudo del encabezado (opcional) |

Ver también el [Glosario](../GLOSSARY.md).
