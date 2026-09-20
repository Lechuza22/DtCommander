# Conectar DTCommander con tu Google Sheet

DTCommander no tiene botón de "sincronizar": una vez hecho este setup
(**una sola vez**), todo se guarda solo en segundo plano cada vez que
movés un slider, agregás una jugadora o arrastrás alguien en la cancha.

Tu Sheet: https://docs.google.com/spreadsheets/d/1kCEriZpy4j2NUMCqdLSJLm9tCnxMXxbfDbn_wnjbQ6k/edit

## Pasos

1. Abrí esa Sheet.
2. Menú **Extensiones → Apps Script**. Se abre un editor nuevo con un
   archivo `Code.gs` vacío (o con `function myFunction() {}`).
3. Borrá todo el contenido de `Code.gs` y pegá el contenido completo de
   [`data/google-apps-script.js`](data/google-apps-script.js) de este
   proyecto.
4. Guardá (ícono de disquete o `Ctrl+S`).
5. Arriba a la derecha, botón **Implementar → Nueva implementación**.
6. En "Selecciona el tipo", elegí **Aplicación web**.
7. Configurá:
   - **Ejecutar como**: Yo (tu cuenta de Google)
   - **Quién tiene acceso**: Cualquier usuario
8. Click en **Implementar**. Google te va a pedir autorizar el script
   la primera vez (es tuyo, sobre tu propia Sheet — es seguro
   aceptarlo).
9. Copiá la **URL de la aplicación web** que te muestra al final
   (empieza con `https://script.google.com/macros/s/.../exec`).
10. Abrí [`js/sheets-integration.js`](js/sheets-integration.js) en este
    proyecto y reemplazá:
    ```js
    const SHEET_API_URL = 'PASTE_YOUR_WEB_APP_URL_HERE';
    ```
    por:
    ```js
    const SHEET_API_URL = 'https://script.google.com/macros/s/TU_ID/exec';
    ```
11. Recargá `index.html`. El puntito de arriba a la derecha del header
    (junto al título) te muestra el estado:
    - 🟢 verde: sincronizado con la Sheet.
    - 🟡 amarillo: sincronizando.
    - 🔴 rojo: no se pudo conectar (se sigue guardando local).
    - ⚪ gris: Sheets todavía no está configurado.

## Cuándo repetir estos pasos

Solo si cambiás el contenido de `data/google-apps-script.js` (por
ejemplo, si agregás un atributo nuevo en `js/app.js`): volvé al editor
de Apps Script, pegá el archivo actualizado, guardá, y hacé
**Implementar → Gestionar implementaciones → editar (lápiz) →
Nueva versión → Implementar**. La URL no cambia.

## Qué guarda la Sheet

Al desplegar, el script crea (si no existen) seis hojas dentro de tu
spreadsheet:

- **Jugadoras**: una fila por jugadora, con posición principal,
  secundaria y sus 11 atributos **actuales**.
- **Historial**: una fila por cada evaluación guardada con el botón
  "Guardar evaluación" (jugadora, fecha, etiqueta y los 11 atributos en
  ese momento) — es lo que alimenta el progreso en el tiempo de la
  pestaña "Jugadora". Mover un slider sin guardar la evaluación no
  agrega nada acá.
- **Partidos**: una fila por partido (rival, fecha, y qué formación
  táctica tiene activa cada uno de los Plan A/B/C).
- **Formacion**: una fila por jugadora ubicada, cruzando partido × plan
  × formación táctica (2-3-2, 3-2-2, 2-2-3, Libre), con sus coordenadas
  en la cancha.
- **Entrenamientos**: una fila por cada rúbrica guardada desde la
  pestaña "Entrenamiento" (fecha, posición, jugadora u "grupal", los 5
  puntajes de 1 a 5, y observaciones). No modifica ningún atributo —
  es solo un registro de referencia para vos.
- **Meta**: guarda qué partido quedó activo.

Podés mirar y editar esas hojas directamente en Sheets — en el próximo
guardado desde la app, DTCommander sobrescribe estas seis hojas con el
estado actual (así que si editás algo a mano en la Sheet, hacelo con la
app cerrada o va a pisarse en el próximo cambio que hagas ahí).
