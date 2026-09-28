# DTCommander

Herramienta web para que un DT de fútbol femenino (fútbol 8) evalúe a sus jugadoras, arme la formación, dibuje jugadas, lleve los partidos en vivo y planifique entrenamientos.

Es una página estática (HTML, CSS y JavaScript, sin proceso de compilación) publicada en GitHub Pages. Guarda sus datos en una Google Sheet a través de un Google Apps Script.

- App: https://lechuza22.github.io/DtCommander/
- Estado: modo prueba, con un solo equipo. El plan es pasar a Firebase (ver "Hacia dónde va").

## Qué tiene

| Grupo | Solapa | Para qué sirve |
|---|---|---|
| Equipo | Evaluador | Puntuar 11 atributos por jugadora (radar), cargar sus datos y guardar evaluaciones con fecha |
| Equipo | Jugadora | Ficha de solo lectura: promedio ponderado por puesto, atributos con color y evolución |
| Equipo | Entrenamiento | Rúbrica por posición y sugerencias de trabajo |
| Planificar | Formación | Partidos con tres planes (A, B y C) y formaciones 2-3-2, 3-2-2 y 2-2-3 sobre la cancha |
| Planificar | Táctica | Tablero libre (flechas, lápiz, texto) con historial y exportación como imagen |
| Planificar | Simulación | Jugadas animadas por fases, con grilla, zonas y goles; se descargan en video MP4 |
| Partido | En vivo | Reloj por tiempos, marcador, jugadas (goles, ocasiones, faltas, tiros libres, córners, laterales y penales, a favor o en contra), cambios, cancha propia y cambios sugeridos del banco |
| Partido | Jugados | Partidos ya terminados, con resultado, resumen a favor y en contra, goleadoras y línea de tiempo |

Además, el engranaje del encabezado abre **Ajustes** (solo para el DT): accesos con PIN y claves, política de datos, permisos e historial de conexión.

## Quién puede qué

| Rol | Entra con | Puede |
|---|---|---|
| DT | Una clave larga guardada en el Apps Script (`DT_KEY`) | Ver y editar todo, y administrar los accesos |
| Soporte (equipo técnico) | Su nombre y una clave larga que genera el DT | Ver y editar todo, menos Ajustes |
| Jugadora | Su nombre y un PIN de 4 dígitos | Solo mirar lo que le corresponde. **La vista de jugadora todavía no está hecha**: hoy no puede entrar |

La tabla completa está en Ajustes → Permisos.

## Cómo funciona

- **Datos.** Cada dispositivo guarda una copia en `localStorage` y sincroniza en segundo plano con la Google Sheet a través del Apps Script (`data/google-apps-script.js`). No hay botón de sincronizar.
- **Seguridad.** La página es pública pero no contiene datos del equipo: el Apps Script exige una clave para leer y para escribir, y a cada rol solo le entrega lo que le corresponde. No hay claves escritas en el código. Límites a tener presentes: un PIN de 4 dígitos es débil aunque haya bloqueo por intentos; quien pueda editar la Sheet ve todas las claves (no conviene compartirla); y si dos personas editan a la vez, gana la última escritura.
- **Google es lento a veces.** El Apps Script puede tardar entre unos segundos y casi un minuto en contestar. La app abre al instante con lo guardado en el dispositivo y actualiza cuando Google contesta; Ajustes → Conexión muestra cuánto tardó cada pedido.
- **Datos de menores.** Muchas jugadoras son menores. La política de datos (borrador) está en Ajustes. Conviene pedir autorización a las familias y no compartir capturas con datos de las chicas.

## Puesta en marcha con tu propia Sheet

1. Abrí tu Google Sheet y andá a Extensiones → Apps Script.
2. En Configuración del proyecto → Propiedades del script, agregá `DT_KEY` con una clave larga que solo sepas vos. Sin esa propiedad el script no deja entrar a nadie.
3. Borrá el contenido de `Code.gs` y pegá `data/google-apps-script.js`.
4. Implementar → Nueva implementación → Aplicación web (ejecutar como "Yo", acceso "Cualquier usuario"). Si ya tenías una implementación, publicá una versión nueva de la misma: la dirección no cambia.
5. Pegá la dirección resultante en `SHEET_API_URL`, en `js/sheets-integration.js`.
6. Abrí la app y entrá como DT con esa clave.

Si agregás o sacás un atributo en `ATTRIBUTES` (`js/app.js`), hacé el mismo cambio en `data/google-apps-script.js` y volvé a publicar el script.

## Correrlo en tu compu

```bash
cd dtcomander
python3 -m http.server 8000   # y abrí http://localhost:8000
```

También sirve la extensión Live Server de VS Code.

## Cambios frecuentes

| Quiero | Dónde |
|---|---|
| Cambiar colores | Variables en `:root`, al principio de `css/styles.css` |
| Agregar una jugadora | Desde la app: Evaluador → + Jugadora |
| Agregar un atributo | `ATTRIBUTES` en `js/app.js` y en `data/google-apps-script.js` |
| Cambiar dónde arranca cada jugadora en una formación | `FORMATION_PRESETS` en `js/app.js` (cancha de 300 x 400, con márgenes de 10) |

## Documentación técnica

Todo el código está explicado en `codemap/`: [ARCHITECTURE.md](codemap/ARCHITECTURE.md) (diagrama y flujo), [GLOSSARY.md](codemap/GLOSSARY.md) (términos) y un documento por módulo en `codemap/js/`, `codemap/css/` y `codemap/data/`.

## Cómo se publica

GitHub Pages sirve la rama `main`. Cada cambio se sube al repositorio y queda como una confirmación (commit) con su mensaje; en este proyecto se hace con la API de GitHub (`gh api`), una confirmación por archivo. La carpeta local **no es un repositorio git**.

Hay archivos que se mantienen solo en la compu, a propósito: la guía de instalación personal, el material de autoevaluación de las jugadoras, las capturas originales (`images/originales/`) y las pruebas (`tests/`).

## Pruebas

Las pruebas automáticas están en la carpeta local `tests/`, que no se publica porque usa datos reales del equipo. Se hacen con Playwright y ejecutan el Apps Script real en Node contra una Sheet simulada.

```bash
cd tests
npm install
npx playwright install chromium
cd .. && python3 -m http.server 8783 &     # servidor local que usan las pruebas
cd tests && PORT=8783 node test_acceso.js
```

| Archivo | Qué prueba |
|---|---|
| `test_script.js` | El candado del Apps Script: qué recibe cada rol, PIN, bloqueos |
| `test_acceso.js` | Entrada, salida, reintentos, carga inicial y encabezado |
| `test_ajustes.js` | El panel de Ajustes |
| `test_partido.js` | Partido en vivo: reloj, jugadas, cambios, sugerencias |
| `test_jugados.js` | Partidos terminados |
| `test_regresion.js` | Todas las solapas en escritorio y celular, y texto con etiquetas HTML |
| `test_icono.js` | Ícono de la app y manifiesto |

Si `CHROME_PATH` está definido se usa ese navegador; si no, el de Playwright.

## Hacia dónde va

- **Firebase.** El plan es migrar a Firebase (login real, base de datos por equipo y reglas de seguridad por rol) para que otros DT puedan usar la app con su propio equipo y para evitar la lentitud del Apps Script. Antes de arrancar se planifica; lo que hay en el Apps Script (filtros por rol, PIN con bloqueo) se reescribiría allá.
- **Pendiente de interfaz.** Vista de jugadora con cartas estilo FIFA y evolución "solo lo que subió"; estadística por jugadora; dibujar tácticas sobre la cancha del partido.
