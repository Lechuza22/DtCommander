# js/jugados.js

La solapa **Jugados** (grupo Partido, al lado de En vivo): los partidos que ya
terminaron, para verlos después. Es de **solo lectura**: muestra lo que está guardado en
`state.matchLogs` por [js/partido.js](partido.md). Para corregir algo de un partido hay
que abrirlo en En vivo (botón "Abrir en En vivo"), donde se edita con las mismas
herramientas.

Está dentro de una función que se ejecuta sola (IIFE) y expone `window.setupJugados` y
`window.renderJugados`, que [js/app.js](app.md) llama con un `typeof` de por medio
(`showTab` al abrir la solapa y `renderAll` cuando llegan datos de la Sheet). Usa
`window.PartidoUtil` de `partido.js` para nombrar las jugadas y calcular el minuto igual
que allá, y `escapeHtml`, `formatDateDisplay`, `saveState` y `showTab` de `app.js`.

## Qué cuenta como partido jugado: `playedMatches`

Los registros de `state.matchLogs` que no están borrados, cuyo partido todavía existe en
`state.matches` y que ya **terminaron** (fase "Final", el segundo toque al final del 2.º
tiempo). Mientras un partido no empezó, se está jugando o quedó en el entretiempo no aparece:
se sigue desde En vivo. Van del más reciente al más viejo (por la fecha del partido y, si empatan, la última modificación).

## La lista: `renderJugados`

Un botón por partido con el rival, la fecha, el resultado en palabras y el marcador, y un
borde de color: verde si ganamos, rojo si perdimos y gris si empatamos (`resultOf`, que se
calcula con los goles anotados). Tocar uno lo elige (`selectedId`); si el elegido deja de
existir se elige el primero. Sin partidos terminados lo explica y esconde el detalle.

## El detalle: `renderDetail`

- **Encabezado**: rival, fecha, resultado, minutos por tiempo y el marcador grande.
- **Resumen** (`SUMMARY_ROWS`): una tabla A favor / En contra con goles, jugadas de gol
  contra jugadas peligrosas, faltas, tiros libres, córners, laterales y penales. Goles
  y jugadas de gol/peligrosas ya traen su lado en el tipo (gol nuestro / gol rival, jugada de
  gol / jugada peligrosa); el resto se cuenta por `side`.
- **Goles y asistencias** (`tally`): quién metió y cuántos, y quién asistió; los goles sin
  jugadora elegida se cuentan como "sin definir".
- **Línea de tiempo** (`timelineHtml`): las jugadas y los cambios hechos en orden, cada uno con
  su minuto (`PartidoUtil.minuteLabel`, con `25+2'` si el tiempo se pasó), una marca de
  "Entretiempo" entre los dos tiempos, y el detalle de cada jugada (quién, asistencia,
  nota). Los cambios que quedaron **por hacer** van al final y aparte. Cada fila lleva el
  mismo color de borde que en En vivo (verde a favor, rojo en contra).
- **Alineación inicial**: las jugadoras que estaban en la cancha del partido al empezar el 1.er
  tiempo (`meta.lineup`); si no se guardó, lo explica.

Todo el texto que viene de los datos (rival, jugadoras, notas) pasa por `escapeHtml` antes
de entrar a `innerHTML`: un rival con etiquetas HTML se ve como texto y no ejecuta nada.

## Dependencias

| Dependencia | Para qué |
|---|---|
| [js/partido.js](partido.md) | `window.PartidoUtil`: nombres de las jugadas y minuto |
| [js/app.js](app.md) | `state`, `escapeHtml`, `formatDateDisplay`, `saveState`, `showTab` |

Ver también el [Glosario](../GLOSSARY.md).
