# Glosario — DTCommander

### def / function

Un bloque de código con nombre que agrupa una serie de pasos para poder
reutilizarlos, en lugar de repetir el mismo código varias veces.

**En este proyecto:** casi todo el comportamiento vive en funciones dentro
de [js/app.js](js/app.md), como `renderFormacion()` o `exportCsv()`.

### class

Una plantilla para crear objetos que agrupan datos y comportamiento juntos.

**En este proyecto:** no se usan clases — el estado es un único objeto
plano (`state`) y el comportamiento son funciones sueltas que lo leen y
modifican.

### import

Traer código definido en otro archivo para poder usarlo en el archivo
actual.

**En este proyecto:** no hay módulos ES (`import`/`export`); los tres
archivos JS (`app.js`, `sheets-integration.js`, Chart.js desde CDN) se
cargan como `<script>` normales en [index.html](index.md) y comparten el
mismo espacio global (`window`).

### return

La instrucción con la que una función entrega un valor a quien la llamó.

**En este proyecto:** por ejemplo, `svgPointFromClient()` retorna un
objeto `{x, y}` con la posición del mouse convertida a coordenadas del
SVG.

### decorator (@)

Una sintaxis (de otros lenguajes, como Python) para envolver una función
o clase y modificar su comportamiento sin tocar su código interno.

**En este proyecto:** no aplica — JavaScript vanilla no usa esta sintaxis.

### .env

Un archivo para guardar configuración sensible (claves, URLs) fuera del
código fuente.

**En este proyecto:** no existe — al ser una app estática sin backend
propio, la única "configuración sensible" es la URL del Apps Script, que
se pega directamente como constante en
[js/sheets-integration.js](js/sheets-integration.md) (ver `SHEET_API_URL`).

### API

Una interfaz que expone funciones de un sistema para que otro sistema las
pueda invocar, típicamente por HTTP.

**En este proyecto:** el Google Apps Script desplegado en
[data/google-apps-script.js](data/google-apps-script.md) funciona como una
API mínima (un endpoint que responde `GET` y `POST`) entre la app y la
Google Sheet.

### endpoint

Una URL específica de una API que responde a un tipo de pedido.

**En este proyecto:** la URL del "Web App" que genera Google al desplegar
`google-apps-script.js` es el único endpoint que usa la app (ver
`SHEET_API_URL`).

### token

En seguridad, una credencial temporal. (No confundir con "player token":
en este proyecto también se usa "token" para referirse al círculo
dibujado en la cancha que representa a una jugadora — es una coincidencia
de nombre, no tiene que ver con autenticación.)

**En este proyecto:** `createFieldToken()` en
[js/app.js](js/app.md) crea el círculo SVG con el nombre de la jugadora.

### session

Un período de interacción de un usuario con una aplicación, generalmente
persistido con cookies o almacenamiento del navegador.

**En este proyecto:** no hay sesiones ni login — es una app de un solo
usuario (el DT) sin autenticación.

### cache

Una copia de datos guardada para acceder más rápido después, evitando
volver a pedirlos.

**En este proyecto:** `localStorage` funciona como caché local del estado
completo de la app (ver `STORAGE_KEY` en [js/app.js](js/app.md)) —
permite que la app funcione sin conexión y evita esperar a la Sheet en
cada carga.

---

## Términos específicos de este proyecto

### atributos (ATTRIBUTES)

La lista fija de once cualidades futbolísticas que se evalúan por
jugadora (Técnica, Pegada, Defensa, etc.), cada una con un valor de 1 a
10 (en pasos de 0,5).

**En este proyecto:** definida como array en
[js/app.js](js/app.md) y replicada en
[data/google-apps-script.js](data/google-apps-script.md) para que las
columnas de la Sheet coincidan.

### historial de evaluaciones

Una serie de "fotos" fechadas de los atributos de una jugadora, para
poder ver cómo cambió con el tiempo (por ejemplo, mejoró +1 en Cabeceo
tras un entrenamiento, o bajó en Velocidad por una lesión). No se crea
sola al mover un slider — solo cuando el DT aprieta explícitamente
"Guardar evaluación" en Evaluador, para que el historial no se llene de
ruido de cada ajuste en el momento.

**En este proyecto:** `state.players[nombre].history`, un array de
`{ date, label, attrs }`. Se lee y muestra (nunca se edita) en la
pestaña [Jugadora](js/app.md) — ver `renderDashboardDiff`,
`updateDashboardTrend` y `renderDashboardTimeline` en
[js/app.js](js/app.md).

### rúbrica de entrenamiento

Una planilla de puntaje (5 dimensiones de 1 a 5: técnica, táctica,
ejecución bajo presión, actitud, físico) para calificar cómo respondió
una jugadora — o el grupo entero — en un entrenamiento puntual. Las 5
dimensiones son siempre las mismas para poder comparar entre puestos,
pero lo que cada una describe es específico de la posición (por
ejemplo "técnica" en Arquera es "manos y recepción", y en Delantera es
"definición") — así la evaluación tiene que ver con lo que esa
posición realmente necesita, no con un genérico igual para todas. A
diferencia del [[historial de evaluaciones]], completar la rúbrica
**no** cambia ningún atributo: es un registro aparte que el DT consulta
para decidir, a mano en Evaluador, si corresponde ajustar algo.

**En este proyecto:** `state.trainingLogs`, un array de `{ date,
position, player, scores, notes }`. Se completa desde la pestaña
Entrenamiento — ver `RUBRIC_DIMENSIONS`, `RUBRIC_LABELS_BY_POSITION` y
`setupEntrenamiento()` en [js/app.js](js/app.md).

### partido (match)

Un partido real, identificado por el rival y la fecha (por ejemplo "vs
Boca — 01/10/2026"). Es el nivel más alto de la jerarquía de Formación:
cada partido tiene sus propios Plan A/B/C, así que armar el equipo para
un partido nuevo no pisa lo que ya armaste para partidos anteriores —
queda un historial.

**En este proyecto:** `state.matches` en [js/app.js](js/app.md), cada
uno con un `matchId` generado como `'m' + Date.now()`. Se elige con
`#matchSelect` y se crea con el formulario `#addMatchForm`.

### plan (Plan A / Plan B / Plan C)

Dentro de un partido, un plan es un tablero completo e independiente:
tiene su propia forma táctica activa y sus propias ubicaciones de
jugadoras. Sirve para preparar de antemano alternativas para el mismo
partido (por ejemplo, arranque vs. plan con más marca).

**En este proyecto:** `match.plans['Plan A' | 'Plan B' | 'Plan C']`,
cada uno con la misma forma que tenía antes `state.formations` (una
entrada por [[formación (formation) / preset]]). Se cambia con las
solapas `#planTabs`.

### formación (formation) / preset

Una disposición táctica de las jugadoras en la cancha (por ejemplo
"2-3-2"). Un "preset" es la posición por defecto de cada puesto en esa
formación, antes de que el usuario mueva a nadie.

**En este proyecto:** `FORMATION_PRESETS` en
[js/app.js](js/app.md) define las coordenadas por defecto de cada slot
para las tres formaciones disponibles.

### placement

La posición `{x, y}` concreta de una jugadora sobre la cancha, dentro de
una formación específica. Se guarda por separado de los presets: mover a
una jugadora no cambia el preset, solo su placement actual.

**En este proyecto:** `state.formations[nombre].placements[jugadora]`.

### Pointer Events / pointer capture

Una API del navegador que unifica mouse, touch (dedo) y lápiz óptico bajo
un mismo conjunto de eventos (`pointerdown`, `pointermove`, `pointerup`).
"Pointer capture" hace que, una vez que empieza un arrastre sobre un
elemento, ese elemento siga recibiendo los eventos de movimiento aunque
el puntero se mueva fuera de sus límites visuales.

**En este proyecto:** usado en `onTokenPointerDown()` y
`onChipPointerDown()` (ambos en [js/app.js](js/app.md)) para implementar
el arrastrar-y-soltar de jugadoras, tanto en mouse como en celular/tablet.

### viewBox (SVG)

Un atributo de los elementos `<svg>` que define un sistema de coordenadas
interno independiente del tamaño real en pantalla — permite que el campo
se dibuje siempre igual sin importar el ancho de la ventana.

**En este proyecto:** el campo usa `viewBox="0 0 300 400"`; todas las
coordenadas de jugadoras y presets están en ese sistema (0–300 x 0–400),
y `svgPointFromClient()` convierte píxeles reales de pantalla a esas
coordenadas.

### debounce

Una técnica para retrasar una acción hasta que pasa un tiempo sin que se
repita el evento que la dispara — evita, por ejemplo, mandar un pedido de
red por cada pixel que se mueve un slider.

**En este proyecto:** `scheduleSync()` en
[js/sheets-integration.js](js/sheets-integration.md) espera 800ms de
inactividad antes de mandar los datos a Google Sheets.

### CORS / preflight

CORS es el mecanismo de seguridad del navegador que controla si una
página puede pedirle datos a un servidor de otro dominio. Un "preflight"
es un pedido `OPTIONS` extra que el navegador manda antes de un `POST`
"complejo" para pedir permiso — Google Apps Script no responde bien a
ese preflight.

**En este proyecto:** por eso `pushNow()` en
[js/sheets-integration.js](js/sheets-integration.md) manda el `POST` con
`Content-Type: text/plain` en vez de `application/json`: evita que el
navegador dispare el preflight que Apps Script no sabe manejar.

### autenticación real vs. "cortina" (client-side gate)

Una autenticación real valida las credenciales en un servidor que el
visitante no controla, así que negarle el acceso a alguien sin la clave
correcta es efectivo. Una "cortina" del lado del cliente (todo el
chequeo corriendo en JavaScript dentro del navegador de quien visita la
página) no puede lograr eso: el código que decide si dejar pasar o no
se manda igual a todo el mundo, así que alguien con ganas de mirar el
código fuente puede leer la contraseña o saltear el chequeo
directamente. Sirve como filtro contra quien llega de casualidad, no
contra quien busca entrar a propósito.

**En este proyecto:** DTCommander no tiene servidor propio (ver
[Web App (Google Apps Script)](#web-app-google-apps-script) más abajo),
así que [js/auth.js](js/auth.md) es necesariamente de este segundo tipo
— el email y la contraseña están en texto plano en ese archivo a
propósito, porque esconderlos no cambiaría nada real.

### Web App (Google Apps Script)

Una forma de desplegar un script de Google Apps Script como si fuera un
mini servidor HTTP propio, con una URL pública que responde a `GET`
(`doGet`) y `POST` (`doPost`).

**En este proyecto:** es el backend completo de la sincronización — no
hay ningún servidor propio, todo corre en la infraestructura de Google
sobre la Sheet del usuario. Ver [SETUP.md](../SETUP.md) para el
despliegue.

### ContentService

La API de Apps Script para construir la respuesta HTTP de un `doGet` o
`doPost` (texto plano, JSON, etc.).

**En este proyecto:** `jsonResponse_()` en
[data/google-apps-script.js](data/google-apps-script.md) la usa para
devolver siempre JSON.

### Chart.js / radar chart

Chart.js es una librería de JavaScript para dibujar gráficos en un
`<canvas>`. Un "radar chart" (gráfico de radar/araña) dibuja varios ejes
que salen de un centro común, uno por atributo, ideal para comparar el
perfil de una jugadora de un vistazo.

**En este proyecto:** cargada desde CDN en [index.html](index.md);
`updateRadarChart()` en [js/app.js](js/app.md) la usa para graficar los
once atributos de la jugadora seleccionada.

### táctica (tactic)

Una jugada dibujada sobre la cancha (un córner, una salida desde el fondo,
una presión) con las jugadoras, los rivales y las flechas que la explican.
No es lo mismo que una *formación* (quién juega en qué lugar durante un
partido) ni que la dimensión "táctica" de la rúbrica de entrenamiento
(`tactica`, una de las cinco notas de 1 a 5): son tres cosas distintas que
comparten la palabra.

**En este proyecto:** cada una es un objeto de `state.tactics` con nombre y
un dibujo (`items`); se edita en la pestaña Táctica
([js/tactica.js](js/tactica.md)) y se guarda en la hoja `Tacticas` de la
Sheet.

### eliminación blanda (soft delete)

En vez de borrar algo de verdad, se lo marca como eliminado y se lo deja
guardado. Sirve cuando hay más de una copia de los datos (el navegador y la
Sheet): si simplemente desapareciera, una copia vieja lo "resucitaría" la
próxima vez que se sincronice, porque no habría forma de saber que fue
borrado y no que nunca existió.

**En este proyecto:** eliminar una táctica pone `deleted: true` y le vacía
el dibujo. Al sincronizar, `mergeTactics()` en [js/app.js](js/app.md)
compara `updatedAt` táctica por táctica y gana la más reciente, así una
eliminación nueva le gana a una copia vieja, y una táctica hecha sin
conexión no se pierde. La interfaz simplemente no muestra las eliminadas.

### simplificación de trazos

Un trazo hecho a mano alzada está formado por cientos de puntos casi
alineados. El algoritmo de Ramer–Douglas–Peucker se queda solo con los
puntos que hacen falta para que la línea conserve su forma dentro de una
tolerancia, y descarta el resto.

**En este proyecto:** `simplifyPath()` en [js/tactica.js](js/tactica.md)
lo aplica al soltar el dedo (tolerancia de 0,6 unidades de cancha) para que
los dibujos entren cómodos en la Sheet.

### fase (phase) e interpolación

En una simulación cada fase es una "foto" de la jugada: dónde está cada
jugadora, cada rival y la pelota en ese momento. Para animar de una fase a
la siguiente no se guarda el movimiento: se calcula. La interpolación
consiste en ubicar cada pieza en un punto intermedio entre su posición
inicial y la final según cuánto avanzó la transición (de 0 a 1), y una
curva de "suavizado" hace que arranque y frene despacio en vez de moverse a
velocidad constante.

**En este proyecto:** `transitionFrame()` en
[js/simulacion.js](js/simulacion.md) interpola las posiciones con
`ease()`; las flechas de recorrido (`autoTrails()`) también se calculan a
partir de las dos fases y no se guardan.

### MediaRecorder (grabar video en el navegador)

Una función del navegador que graba a un archivo de video lo que se dibuja
en un `<canvas>` (vía `captureStream`), sin programas externos. Graba en
tiempo real: un video de 10 segundos tarda 10 segundos. El formato depende
del navegador: Chrome y Safari de hoy pueden entregar MP4 (el más fácil de
compartir por WhatsApp); los que no, entregan WebM.

**En este proyecto:** `recordVideo()` en
[js/simulacion-media.js](js/simulacion-media.md) pinta cada cuadro de la
simulación en un canvas y lo graba; el botón "Descargar video (MP4)" de la
pestaña Simulación lo usa.

### gol y fin (regla del arco)

En las jugadas animadas, si la pelota queda adentro de un arco se considera
gol y la jugada termina ahí: lo que hubiera después no se reproduce ni se
graba en el video, y se muestran los carteles "¡GOL!" y "FIN". Una pelota que
solo llega a la boca del arco, sin pasar la línea, es un tiro y no un gol.

**En este proyecto:** `goalSide(x, y)` en
[js/simulacion-media.js](js/simulacion-media.md) decide si un punto está
adentro de un arco; `goalPhase()` en [js/simulacion.js](js/simulacion.md)
busca la fase del gol.
