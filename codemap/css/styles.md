# css/styles.css

Todo el estilo visual de la app en un único archivo, sin preprocesador.
No contiene lógica — se documenta acá solo la organización, para que
sea fácil ubicar qué tocar.

## Organización

- **`:root`**: variables de color (`--primary`, `--danger`, `--field-green`,
  etc.), siguiendo la misma convención que ya documentaba el
  [readme.md](../../readme.md) original del proyecto — cambiar un color
  global es cambiar una sola línea acá.
- **`[hidden] { display: none !important; }`**: regla global cerca del
  principio del archivo. Necesaria porque varias clases de la app
  (`.add-player-form`, `.rubric-form`, etc.) definen `display:
  flex`/`grid` directamente sobre el selector — sin este `!important`,
  esa regla de autor le gana al `display: none` por defecto del
  navegador para el atributo `hidden`, y el formulario queda visible
  aunque JS le haya puesto `hidden = true` (bug real que hubo en la
  app — ver la nota en [index.md](../index.md)).
- **Layout general**: `header`, `.tabs`, `.container`, `.card` — la
  estructura de tarjetas que envuelve cada bloque de Evaluador y
  Formación.
- **Evaluador**: `.roster-controls`, `.position-controls`,
  `.slider-group` (grilla de 3 columnas: label, input range, valor),
  `.attrs-chart-layout` (grilla de 2 columnas: atributos al lado del
  radar chart, colapsa a 1 columna en mobile).
- **Formación**: `.plan-tabs` / `.plan-tab-btn` (solapas Plan A/B/C),
  `.field-layout` (grilla de 2 columnas: disponibles + cancha),
  `.player-chip` (jugadora sin ubicar, reutilizado también en
  `#suggestionsList`), `.suggestions` (panel de alternativas, oculto por
  defecto), `.field-bg` / `.field-line` / `.field-line-fill` (dibujo de
  la cancha en SVG), `.player-token` / `.token-circle` / `.token-label`
  (jugadora ubicada).
- **Formularios inline** (alta de jugadora, de partido, y de evaluación):
  `.add-player-form`, reutilizado por `#addPlayerForm`, `#addMatchForm` y
  `#saveEvalForm` — incluye estilos tanto para `input[type=text]` como
  `input[type=date]`.
- **Entrenamiento**: `.training-category` (una sección por categoría de
  sugerencias — Técnica/Táctico/Físico/Estrategia), `.rubric-form` /
  `.rubric-row` / `.rubric-criteria` / `.rubric-criterion` (el
  formulario de la rúbrica, con su propio layout en grilla en vez de
  reutilizar `.add-player-form` porque tiene bastantes más campos),
  `.training-log-notes` (observaciones de cada fila del historial).
- **Jugadora (dashboard)**: `.diff-row` (grilla de 3 columnas: atributo,
  valor, delta), `.diff-up` / `.diff-down` / `.diff-same` (verde/rojo/gris
  para el progreso), `.timeline-row` / `.timeline-head` / `.timeline-avg`
  (cada fila del historial), `.btn-small` (el botón "Eliminar" de una
  fila), `.chart-wrap` (contenedor de alto fijo para que
  `#dashboardTrendChart` de Chart.js no se estire sin control),
  `.attrs-grid` / `.attr-row` / `.attr-row-label` / `.attr-row-value`
  (la lista vertical de atributos estilo FIFA — borde izquierdo y
  número coloreados por `colorForAttrValue`).
- **`.sync-status`**: los cuatro colores de estado de sincronización
  (`sync-local`, `sync-syncing`, `sync-synced`, `sync-offline`), leídos
  por [js/sheets-integration.js](../js/sheets-integration.md).
- **`@media (max-width: 640px)`**: ajustes responsive — la grilla de
  Formación pasa a una columna y la lista de disponibles se vuelve
  horizontal, pensado para usar la app desde el celular en la cancha.

## Dependencias externas

Ninguna — CSS puro, sin frameworks ni preprocesadores.

Ver también [GLOSSARY.md](../GLOSSARY.md).
