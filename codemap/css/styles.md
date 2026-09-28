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
- **Carteles de estado**: `.candado-aviso` (amarillo, el del candado sin activar), `.clave-aviso` (el mismo estilo, con el
  texto y el botón "Entrar de nuevo" en una fila que se parte en celulares), `.cargando-aviso` (azul claro, centrado) y
  `.conexion-resumen` (el párrafo de la pestaña Conexión).
- **Encabezado**: `header` es un `flex` centrado (título, `.rol-chip` y punto de estado) con `padding` de 84 px a los lados
  para dejar lugar, y `.header-acciones` (con el engranaje y el ⏻) va `position: absolute` en la esquina superior derecha.
  En pantallas de hasta 640 px el título se achica y el padding izquierdo baja a 12 px; en las de hasta 360 px se achica
  más. `.rol-chip` es el único que se encoge (con puntos suspensivos) si falta lugar. Ojo con el orden: esas reglas
  `@media` tienen que ir **después** de `header h1`, si no la regla base las pisa.
- **Entrada y rol**: `.login-gate` (overlay `position: fixed` a pantalla
  completa que tapa todo), `.login-card` (el formulario en sí, con un
  `select` y los `input`), `.btn-logout` (botón ⏻ en el header; con
  `.armado` se ensancha y se pone rojo al primer toque), `.rol-chip` (quién
  entró) y `.candado-aviso` (el cartel amarillo del DT) — ver
  [js/acceso.md](../js/acceso.md).
- **Desplegables de guardados**: `.roster-controls select` y `.formation-controls select` llevan `min-width: 0; max-width: 100%`. Sin eso, un nombre largo (por ejemplo una simulación "Transición: Ataque desde arco (8 fases) — 21/09/2026") estiraba el `<select>` más allá del ancho de la pantalla y la página se desplazaba de costado en el celular (bug real que hubo).
- **Evaluador**: `.roster-controls`, `.position-controls` (fila flex con
  wrap para los seis campos de "Datos de la jugadora": apodo, edad,
  altura, pie dominante y las dos posiciones — entran en una fila en
  escritorio y se acomodan solos en celular),
  `.slider-group` (grilla de 3 columnas: label, input range, valor),
  `.attrs-chart-layout` (grilla de 2 columnas: atributos al lado del
  radar chart, colapsa a 1 columna en mobile; esa columna es `minmax(0, 1fr)` y no `1fr`, porque con `1fr` el contenido
  de los sliders la ensanchaba y la página se desplazaba de costado en celulares de 375 px).
- **Formación**: `.plan-tabs` / `.plan-tab-btn` (solapas Plan A/B/C),
  `.field-layout` (grilla de 2 columnas: disponibles 240px + cancha),
  `.player-chip` (jugadora sin ubicar, reutilizado también en
  `#suggestionsList`), `.suggestions` (panel de radar + alternativas,
  oculto por defecto; en pantallas de hasta 640px pasa a
  `position: fixed` flotante para no desplazar la cancha),
  `.suggestions-radar` (contenedor de alto fijo 200px del radar
  compacto), `.field-bg` / `.field-line` / `.field-line-fill` (dibujo de
  la cancha en SVG), `.player-token` / `.token-circle` / `.token-label`
  (jugadora ubicada; la ficha se achicó al 80%: círculo de radio 12,8, letra de
  9 y borde de 1,6).
- **Táctica**: `.tactic-tools-card` / `.tactic-toolbar` / `.tactic-group`
  (barra de herramientas; en celular es compacta, fija arriba y cada fila se
  desliza de costado), `.tool-btn` (con `.active`; la regla del activo
  repite `:hover` porque en celular el hover queda "pegado" tras un toque y
  dejaba letra blanca sobre fondo claro), `.swatch` (colores),
  `.tactic-check`, `.tactic-text-input`, `.tactic-team-actions`, y
  `#tacticField` (`overflow: visible` para que una jugadora arrastrada
  afuera de la cancha siga al cursor, `touch-action: none` como
  `#field`, y un cursor distinto por herramienta según la clase
  `tool-*` que le pone el JS). Los colores de lo dibujado no están acá:
  van como atributos del SVG (ver [js/tactica.js](../js/tactica.md)).
- **Arcos**: `.field-goal` (relleno translúcido y borde blanco) es el estilo
  de los dos arcos de la cancha de Formación; las demás canchas dibujan los
  suyos con atributos propios (ver [js/simulacion-media.js](../js/simulacion-media.md)).
- **Simulación**: `#simField` (igual que `#tacticField`), `.sim-start` /
  `.sim-start-row` (la tarjeta "Empezar desde"), `.sim-selbar` (acciones de
  la ficha seleccionada), `.sim-panel` (el panel de fases debajo de la
  cancha), `.phase-tabs` / `.phase-tab` (una pestaña por fase; se desliza de
  costado), `.sim-row`, `.sim-note`, `.sim-dur`, `.sim-caption` (la nota de la
  fase al reproducir), `.sim-tools` (Mover / Texto / Zona, colores y grilla),
  `.phase-tab.after-goal` (pestaña de una fase posterior al gol: atenuada y
  tachada). `.sim-selbar` ocupa siempre el mismo alto (una
  sola fila que se desliza de costado): si apareciera y desapareciera, el
  navegador corría el scroll de la página al tocar una ficha. Por eso también
  `#panel-simulacion { overflow-anchor: none }`. Con `.sim-playing` en el panel la lista de jugadoras, las
  herramientas y la barra de la ficha se atenúan y no reciben
  toques. Ojo con `.field-layout > .card { min-width: 0 }`:
  sin eso una columna de la grilla no se achica por debajo de su contenido y la
  fila de pestañas de fase (que no se puede comprimir) ensanchaba toda la
  página en celulares.
- **Navegación en dos niveles**: `.tabs` / `.tab-btn` son los tres grupos de arriba
  (Equipo, Planificar, Partido) y `.subtabs` / `.subtab-btn` la fila de las solapas del
  grupo elegido, con botones en forma de píldora. La fila tiene el mismo fondo que el
  grupo activo, así queda como una continuación de él; se desplaza de costado en pantallas
  chicas y se oculta si el grupo tiene una sola solapa.
- **Ajustes** (solo el DT): `.ajustes` (la capa oscura que tapa la app; `body.con-ajustes` frena el desplazamiento de
  atrás), `.ajustes-panel` (la caja blanca, a pantalla completa en celular), `.ajustes-head`, `.ajustes-tabs` /
  `.ajustes-tab` (con `.active`; ambas filas llevan `flex: 0 0 auto` porque si no se aprietan cuando el contenido es largo),
  `.ajustes-body` (la única parte que se desplaza), `.accesos-lista` / `.acceso-fila` (con `.inactivo` tachada) /
  `.acceso-quien` / `.acceso-clave` / `.acceso-acciones` (los botones de cada fila; `.armado` en rojo pide confirmar),
  `.politica` (el texto) y `.permisos-tabla` (los niveles `nivel-editar` / `nivel-ver` / `nivel-nada`). `.btn-ajustes` es el
  engranaje del encabezado, con el mismo estilo que el ⏻.
- **Solapa Jugados**: `.played-list` / `.played-item` (un botón por partido, con el borde
  izquierdo verde si ganamos, rojo si perdimos, y gris si empatamos, y
  `.selected` el elegido), `.played-head` / `.played-score` (encabezado del detalle con el
  marcador grande), `.played-table` (la tabla A favor / En contra, con `.num-for` en verde y
  `.num-against` en rojo), y para la línea de tiempo `.played-min`, `.played-text` y
  `.played-break` (la marca de "Entretiempo"); las filas de la línea de tiempo reusan
  `.live-row` de En vivo.
- **Falta, tiro libre, córner, lateral y penal** (En vivo): `.live-more` con
  `.live-more-buttons` / `.live-more-btn` (la fila chica de cinco botones) y `.live-side` con
  `.live-side-label` / `.live-side-btn` (`.live-side-for` verde, `.live-side-against` rojo) /
  `.live-side-cancel` (el selector que la reemplaza al tocar uno, del mismo alto para no
  mover la barra); `.live-row-side-for` y `.live-row-side-against` pintan el borde de las
  filas de la lista.
- **Partido en vivo**: `#matchField` comparte con `#field` el estilo de la cancha,
  `.live-setup` es el panel plegable de arriba (`<details>`), `.live-suggestions` (con
  `.live-sugg-row` y `.sugg-rating`) es el panel de perfil y cambios sugeridos de la
  jugadora elegida (dentro del banco en escritorio y una hoja fija abajo en celular) y
  `.player-token.selected` marca con borde amarillo a la jugadora elegida. `.live-bar`
  es la barra de arriba de Partido (`position: sticky; top: 0` para que quede a la
  vista mientras se mira la cancha, con `.live-running` cuando el reloj corre),
  `.live-top` con `.live-clock-box` /
  `.live-clock` / `.live-phase` / `.live-score` / `.live-main-btn` (el botón que
  avanza la fase; `.live-armed` cuando pide el segundo toque para terminar un
  tiempo), `.live-events` con `.live-ev-btn` (los cuatro botones de jugada, en una
  grilla de 4 columnas y con color propio cada uno; miden al menos 46 px de alto
  para tocarlos con el pulgar), `.live-toast` (el aviso breve: **flota** justo
  debajo de la barra en vez de agrandarla, porque si empujara el contenido la
  cancha se movería cada vez que se anota una jugada), `.live-chips` /
  `.live-chip` (los cambios por hacer, en una fila que se desliza de costado), y
  para el detalle de abajo `.live-config`, `.live-list` y `.live-row` (una fila por
  jugada o cambio, con el borde izquierdo del color de su tipo). En pantallas de
  hasta 480 px se achica el reloj y se ocultan los nombres de los equipos para que
  reloj, marcador y botón entren en una sola fila.
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
- **Jugadora (dashboard)**: `.player-rating` (la insignia del promedio delante del
  nombre: cuadrado redondeado de 64 px, el fondo y el color del texto los pone el JS
  según la escala de atributos) con `.player-rating-value` / `.player-rating-label`,
  `.rating-note` (la aclaración de qué atributos cuenta), `.player-info-row` / `.player-info-item` /
  `.player-info-value` (la tarjeta de datos básicos: etiqueta chica
  arriba, valor en negrita abajo), `.diff-grid` (reparte las filas de
  cambios en columnas de al menos 260px), `.diff-row` (grilla de 3
  columnas: atributo flexible, valor, delta), `.diff-up` / `.diff-down` / `.diff-same` (verde/rojo/gris
  para el progreso), `.timeline-row` / `.timeline-head` / `.timeline-avg`
  (cada fila del historial), `.btn-small` (el botón "Eliminar" de una
  fila), `.chart-wrap` (contenedor de alto fijo para que
  `#dashboardTrendChart` de Chart.js no se estire sin control),
  `.attrs-grid` / `.attr-row` / `.attr-row-label` / `.attr-row-value`
  (la lista vertical de atributos estilo FIFA — borde izquierdo y
  número coloreados por `colorForAttrValue`).
- **`.sync-status`**: los cinco colores de estado de sincronización
  (`sync-local`, `sync-syncing`, `sync-synced`, `sync-offline` y `sync-denied`, rojo fuerte cuando el script rechazó el pedido), leídos
  por [js/sheets-integration.js](../js/sheets-integration.md).
- **`@media (max-width: 640px)`**: ajustes responsive — la grilla de
  Formación pasa a una columna y la lista de disponibles se vuelve
  horizontal, pensado para usar la app desde el celular en la cancha.
  Con 6 solapas la barra `.tabs` se vuelve desplazable de costado
  (`overflow-x: auto`, botones que no se achican) sin desbordar la
  página.

## Dependencias externas

Ninguna — CSS puro, sin frameworks ni preprocesadores.

Ver también [GLOSSARY.md](../GLOSSARY.md).
