# Solapa Secuencia (archivada)

Esta carpeta guarda la solapa **Secuencia** de DTCommander, que se probó y **no
se quedó en la app**. No forma parte del sitio: `index.html` no carga nada de
acá.

## Qué era

Una segunda forma de armar jugadas animadas, al lado de **Simulación**. En
vez de armar fase por fase, se ubicaban las fichas y después se grababa la
jugada **arrastrando** cada ficha y la pelota. Cada arrastre quedaba como un
movimiento (con flecha numerada en la cancha y una fila en una tabla con
texto), y se podía elegir entre "Paso nuevo" (un movimiento tras otro) y "Mismo
paso" (varios a la vez). Tenía pase, centro, pase por arriba, tiro y gol, y
también terminaba la jugada cuando la pelota entraba al arco.

## Por qué se archivó

El 21/09/2026 se probaron las dos solapas lado a lado y se eligió quedarse con
Simulación. Secuencia no se borró para tener a mano lo que se intentó.

## Qué hay en esta carpeta

| Archivo | Qué es |
|---|---|
| `secuencia.js` | todo el código de la solapa (ex `js/secuencia.js`) |
| `panel-secuencia.html` | el bloque de `index.html` de la solapa |
| `estilos-secuencia.css` | sus estilos (ex `css/styles.css`) |
| `secuencia.md` | su documentación de codemap (ex `codemap/js/secuencia.md`) |

## Qué quedó en la app

- **Las secuencias ya guardadas siguen en la Sheet** (hoja `Simulaciones`,
  items `seq`, `step` y `move`). La app las conserva al sincronizar pero no las
  muestra en ninguna solapa. Si se reactiva Secuencia, reaparecen.
- **`js/simulacion-media.js` conserva lo que usaba Secuencia** (recorridos
  numerados, punta arrastrable, `pointAlong`, `simplifyPath`) y la regla del
  gol (`goalSide`), que ahora usa Simulación.
- Las jugadas de ejemplo de Simulación siguen trayendo el tipo de pase de la
  pelota (`ballAct`), que Secuencia usaba.

## Cómo volver a activarla

1. Copiar `secuencia.js` a `js/` y agregar en `index.html`, después de
   `js/simulacion.js`: `<script src="js/secuencia.js"></script>`.
2. En `index.html`, pegar `panel-secuencia.html` antes de la sección
   `ENTRENAMIENTO` y agregar el botón de la solapa después del de Simulación:
   `<button class="tab-btn" data-tab="panel-secuencia">Secuencia</button>`.
3. Pegar `estilos-secuencia.css` al final de `css/styles.css`.
4. En `js/app.js`, volver a llamar a las funciones de la solapa en los tres
   lugares donde se llama a las de Simulación: `setupSecuencia()` al iniciar,
   `renderSecuencia()` en `renderAll()` y en el clic de las solapas
   (`btn.dataset.tab === 'panel-secuencia'`), cada una con
   `typeof ... === 'function'` como las demás.
5. En `js/simulacion.js`, justo después de `TEMPLATES`, volver a exponer las
   jugadas de ejemplo: `window.SimTemplates = { TEMPLATES, OUR_BASE, RIV_BASE };`.

Más simple todavía: la marca de GitHub `checkpoint-ultimo-con-secuencia-20260921`
(y la copia en `dtcomander_checkpoints/`) tiene la app completa con Secuencia
funcionando, con arcos y gol.
