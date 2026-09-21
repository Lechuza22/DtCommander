# js/secuencia.js

La pestaña **Secuencia**: una jugada **grabada moviendo las piezas**. Es la
segunda forma de armar una jugada animada, al lado de
[Simulación](simulacion.md) (fases con acciones). Acá no hay fases: se arma
cómo arranca la jugada (**1. Armar**) y después se graba arrastrando las
fichas y la pelota (**2. Grabar**). Cada arrastre queda como un
**movimiento**, dibujado en la cancha con su flecha y el número de su paso, y
como una fila en una tabla editable. Comparte con Simulación el dibujo, el
video y la lista de guardados ([js/simulacion-media.js](simulacion-media.md)).

Está dentro de una función que se ejecuta sola (IIFE) y solo expone
`window.setupSecuencia` y `window.renderSecuencia`, que [js/app.js](app.md)
llama con un `typeof` de por medio.

## Modelo de datos

Lo guardado es el **arranque** y la lista de **movimientos**; las posiciones de
cada momento no se guardan, se calculan aplicando los movimientos en orden
(`allStates()`). Por eso corregir un movimiento del principio acomoda solo lo
que viene después, algo que en Simulación no pasa (cada fase es una foto).

```
board = {
  initial: [ { type: 'player'|'rival'|'ball', name|label, x, y, carrier } ],   // arranque
  steps:   [ { dur, moves: [ { id, piece, path, kind, to, text } ] } ],        // paso i + 1
  decor:   [ { type: 'text'|'zone', ph, ... } ]                                 // ph = paso donde se ve (0 = arranque)
}
```

- **Paso** (`steps[i]`): un momento de la jugada. Todos sus movimientos ocurren a
  la vez y duran `dur` segundos. "Paso nuevo" al grabar crea un paso;
  "Mismo paso" suma el movimiento al paso actual: así se logra el movimiento
  individual y el simultáneo.
- **Movimiento**: `piece` (`p:Ine`, `r:3` o `b:ball`), `path` (los puntos del camino
  **que se arrastró**, sin el de salida: el de salida es donde estaba la pieza),
  `kind` (`run` para fichas; `pass`, `cross`, `lob`, `shot` o `goal` para la
  pelota), `to` (a qué jugadora le llega la pelota) y `text`.
- **Pelota pegada**: si termina en una jugadora, `to` la nombra y desde ahí va
  con ella (mismo mecanismo que en Simulación).
- Los casilleros sombreados y los textos duran **solo en su paso**: aparecen
  con él y se apagan cuando arranca el siguiente.

Se guarda dentro de `state.simulations` (misma lista y misma hoja
`Simulaciones` que las simulaciones por fases) como una lista plana de items:
un item `seq` (la marca que distingue una secuencia), los items de arranque con
`ph: 0`, un `step` y sus `move` por paso (`ph` = número de paso), y los
`text`/`zone`. `flattenBoard` arma esa lista y `splitFlat` la vuelve a
separar (descartando pasos vacíos y renumerando). Cada pestaña muestra solo lo
suyo: `visibleSims()` de Simulación oculta las que tienen `seq` y
`visibleSeqs()` de acá muestra solo esas. No hace falta cambiar el Apps Script.

## Flujo interno

```mermaid
flowchart TD
    setupSecuencia --> restoreDraft
    renderSecuencia --> refreshAll
    refreshAll --> renderBoard --> editItems
    refreshAll --> updateControls --> renderTable
    editItems --> allStates
    editItems --> trackItemsFor --> moveTrack

    onPointerDown --> finishDrag
    finishDrag -->|"Armar"| removePiece
    finishDrag -->|"Grabar"| recordMove --> commit
    tick --> drawFrame --> frameAt
    frameAt --> holdFrame
    frameAt --> moveFrame --> allStates
    exportVideo --> recordVideo["SimMedia.recordVideo"] --> drawFrame
    saveSeq --> flattenBoard
```

## Armar y grabar

- **1. Armar**: se arrastran las fichas a su lugar de arranque, se agregan
  rivales y la pelota, se traen jugadoras de Formación y se asigna el plantel a
  los puestos de una jugada de ejemplo. Una ficha arrastrada afuera de la
  cancha se saca (con sus movimientos). La pelota soltada cerca de una jugadora
  se pega.
- **2. Grabar** (`onPointerDown` / `recordMove`): al arrastrar una pieza se van
  guardando los puntos del camino (uno cada 2,5 unidades) y se ve la ficha
  seguir al puntero con un camino punteado. Al soltar, el camino se simplifica
  (Ramer–Douglas–Peucker, ver [[simplificación de trazos]]) y queda como un
  movimiento. Un arrastre de menos de 6 unidades se ignora (es un toque).
  - La pelota soltada cerca de una jugadora es un **pase** a ella; soltada en
    la boca del arco es un **tiro**; en cualquier otro lugar, un pase a la zona.
    El tipo se cambia después en la tabla (`setKind`): al elegir tiro o gol la
    pelota va al arco.
  - Una misma pieza no puede moverse dos veces en un paso: el nuevo reemplaza.
  - El **cursor** (Inicio, 1, 2...) elige en qué momento se mira y se graba:
    "Paso nuevo" inserta un paso justo después del cursor y "Mismo paso" lo suma
    al paso del cursor. Los pasos siguientes se corren (con sus textos y
    casilleros).

Lo recién grabado no queda seleccionado a propósito: el punto arrastrable de
su flecha caería justo sobre la ficha donde se quiere grabar lo próximo.

## La tabla de movimientos: `renderTable`

Una tarjeta por paso (con su duración editable, ▲ ▼ para cambiar el orden,
"A la vez que el anterior" para juntarlo con el paso anterior, y ✕) y una fila
por movimiento: pieza, descripción automática (`B2 → C3`, o "Pase a Agos"),
tipo (para la pelota), texto libre y ✕. "Paso aparte" saca un movimiento de un
paso simultáneo y lo pone en uno propio, justo después. Juntar dos pasos donde
la misma pieza se mueve en los dos se rechaza con un aviso. El **texto** de los
movimientos es lo que se ve en la franja de abajo del video. Tocar una fila
selecciona su flecha en la cancha (`selectMove`) y muestra su **punta
arrastrable** (`handle`, dibujada en una capa por encima de las fichas): al
soltarla cambia adónde llega el movimiento y, si es de pelota, a quién le llega.
Para no perder el foco mientras se escribe, editar un texto o una duración
guarda el cambio sin volver a dibujar la tabla.

## Lo que se ve: `editItems` / `trackItemsFor` / `moveTrack`

`editItems` arma la cancha en el cursor: las piezas (`allStates()[k]`), los
**recorridos** de los pasos (`moveTrack` va desde donde estaba la pieza antes del
paso hasta donde queda, pasando por el camino grabado), los textos y casilleros
del paso, el cartel de gol y la grilla. El selector "Flechas" elige qué
recorridos mostrar: solo el paso actual, hasta este paso (los anteriores tenues)
o todos, como un diagrama de la jugada con los pasos numerados.

## Reproducir: `timeline` / `frameAt` / `moveFrame`

La línea de tiempo es: el arranque (0,9 s), y por cada paso su movimiento (`dur`)
y una pausa (0,4 s, o 1,6 s si el paso tiene texto). En un paso, `moveFrame`
lleva cada pieza por su camino: la posición es el punto que corresponde a la
fracción recorrida del **largo del camino** (`M.pointAlong`), con una curva
suave, así una curva grabada se anima como curva. La pelota por arriba sube y baja
(`_h`), el tiro sale rápido y el "¡GOL!" aparece al final del paso, en el lugar más
despejado (`roomiestPoint`). Los recorridos van creciendo con la pieza.

## Jugadas de ejemplo: `boardFromTemplate`

Convierte las jugadas de [Simulación](simulacion.md) (`window.SimTemplates`) a
arranque más movimientos: lo que cambia de una fase a la siguiente pasa a ser
movimientos de un mismo paso. Se compara contra las posiciones **ya derivadas**
(no contra la fase anterior de la plantilla) y solo se graban cambios de 10
unidades o más, así los ajustes chicos descartados no se acumulan (el estado final
queda a menos de 10 de la plantilla). La nota de cada fase pasa al texto de su
primer movimiento; el tipo de pase de la pelota (pase, centro, por arriba, tiro,
gol) se conserva; los casilleros y textos quedan en su paso.

## Dependencias

| Dependencia | Para qué |
|---|---|
| [js/simulacion-media.js](simulacion-media.md) | dibujo (SVG y canvas), camino, video y entrega del archivo |
| [js/simulacion.js](simulacion.md) | `window.SimTemplates` (las jugadas de ejemplo) |
| [js/app.js](app.md) | estado, `saveState`, `sanitizeSimItems`, fechas, colores |
| `localStorage` | borrador (`dtcomander_seq_draft`) |

Ver también el [Glosario](../GLOSSARY.md).
