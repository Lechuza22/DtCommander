# 🛠️ DTCommander - Guía de desarrollo en VS Code

**Cómo editar, mejorar y customizar DTCommander desde Visual Studio Code**

---

## 📖 Tabla de Contenidos

1. [Abrir proyecto en VS Code](#abrir-proyecto-en-vs-code)
2. [Estructura de archivos](#estructura-de-archivos)
3. [Extensiones útiles](#extensiones-útiles)
4. [Flujo de desarrollo](#flujo-de-desarrollo)
5. [Hacer cambios](#hacer-cambios)
6. [Testing y debugging](#testing-y-debugging)
7. [Tips de desarrollo](#tips-de-desarrollo)

---

## 🚀 Abrir proyecto en VS Code

### Opción 1: Desde terminal
```bash
cd ~/projects/dtcomander
code .
```

### Opción 2: Desde VS Code
1. File → Open Folder
2. Selecciona `~/projects/dtcomander/`
3. Listo, el proyecto se abre

---

## 📁 Estructura de archivos

```
dtcomander/
├── index.html                 ← Estructura HTML (UI)
├── css/
│   └── styles.css            ← Todos los estilos (responsive, temas)
├── js/
│   ├── app.js                ← Lógica principal (evaluaciones, formaciones, storage)
│   └── sheets-integration.js ← Google Sheets sync (opcional)
├── data/
│   └── google-apps-script.js ← Código para Google Apps Script
├── README.md                 ← Documentación completa
├── QUICK_START.md            ← Guía rápida
└── DESARROLLO_VSCODE.md      ← Este archivo
```

### Qué hace cada archivo

| Archivo | Responsabilidad | Cuándo editarlo |
|---------|-----------------|-----------------|
| **index.html** | Estructura + formularios + tabs | Agregar nuevas secciones, campos, botones |
| **styles.css** | Diseño, colores, responsive | Cambiar colores, layouts, estilos |
| **app.js** | Lógica de evaluaciones, formaciones, storage local | Agregar atributos, formaciones, lógica |
| **sheets-integration.js** | Sincronización con Google Sheets | Cambiar cómo se sincronizan datos |
| **google-apps-script.js** | Backend en Google Apps Script | Cambiar estructura de Sheets |

---

## 🧩 Extensiones útiles en VS Code

### Recomendadas (instala estas)

```
Ctrl+Shift+X (Buscar y instalar)
```

1. **Live Server** (Ritwick Dey)
   - Abre un servidor local en http://localhost:5500
   - Los cambios en CSS/JS se reflejan automáticamente (sin F5)
   - Click derecho en `index.html` → "Open with Live Server"

2. **Prettier** (Code formatter)
   - Formatea automáticamente HTML/CSS/JS
   - Instalación: `Ctrl+Shift+X` → busca "Prettier" → instala
   - Uso: `Shift+Alt+F` para formatear

3. **Thunder Client** o **REST Client**
   - Para testear llamadas a Google Apps Script
   - Útil cuando sincronizas con Sheets

4. **Color Picker** (Sarah Drasner)
   - Click derecho en colores para seleccionar visualmente
   - Útil para editar CSS

5. **HTML CSS Support**
   - Autocompletado de clases CSS en HTML

---

## ⚙️ Flujo de desarrollo

### Workflow típico:

```
1. Abre VS Code
   code ~/projects/dtcomander

2. Abre Live Server
   Click derecho en index.html → "Open with Live Server"

3. Navegador abre en http://localhost:5500

4. Edita en VS Code (CSS/JS/HTML)
   Los cambios aparecen automáticamente en navegador (F5 si no)

5. F12 en navegador para debuggear (consola, inspector)

6. Guarda cambios (Ctrl+S)

7. Listo, tu app está actualizada
```

---

## 🎨 Hacer cambios comunes

### 1️⃣ Cambiar colores

**Archivo:** `css/styles.css`

Busca `:root` al inicio:
```css
:root {
    --primary: #185FA5;        ← Azul principal
    --primary-dark: #0d3a75;   ← Azul oscuro
    --success: #0d7d2a;        ← Verde
    --danger: #a32d2d;         ← Rojo
    ...
}
```

**Cambio rápido:**
- Selecciona el color
- Extensión "Color Picker" → elige color
- Se actualiza automáticamente

---

### 2️⃣ Agregar un nuevo atributo

**Archivo:** `js/app.js`

Busca `const attributes` (línea ~20):
```javascript
const attributes = [
    'Técnica', 'Pegada', 'Defensa', 'Ataque', 'Regate', 
    'Cabeceo', 'Velocidad', 'Visión', 'Posicionamiento', 'Mentalidad', 'Portería',
    'TU_NUEVO_ATRIBUTO'  ← Agrega aquí
];
```

Eso es todo. El gráfico, sliders y tabla se actualizan automáticamente.

---

### 3️⃣ Agregar una nueva jugadora

**Archivo:** `index.html`

Busca `<select id="playerSelect">` (línea ~68):
```html
<option value="Ine">Ine</option>
<option value="Agos">Agos</option>
<!-- Agrega aquí -->
<option value="TU_JUGADORA">TU_JUGADORA</option>
```

Listo, la app reconoce la jugadora automáticamente.

---

### 4️⃣ Cambiar la alineación del campo

**Archivo:** `js/app.js`

Busca `const fieldPositions` (línea ~40):
```javascript
const fieldPositions = {
    '2-3-2': [
        {x: 150, y: 350, label: 'A'},      ← Arquera
        {x: 80, y: 280, label: 'D1'},      ← Defensa 1
        // ... más posiciones
    ]
}
```

Los números `x` e `y` son coordenadas en el SVG:
- **x**: posición horizontal (10-290)
- **y**: posición vertical (10-390)

Ajusta para cambiar dónde aparecen los jugadores.

---

### 5️⃣ Cambiar estilos (colores, tamaños, fuentes)

**Archivo:** `css/styles.css`

Ejemplos:

**Cambiar tamaño de fuente del encabezado:**
```css
header h1 {
    font-size: 32px;  ← Cambiar a 40px, 28px, etc.
}
```

**Cambiar espaciado:**
```css
.card {
    padding: 1.5rem;  ← Cambiar a 1rem, 2rem, etc.
    margin-bottom: 1.5rem;
}
```

**Cambiar ancho máximo:**
```css
.container {
    max-width: 1200px;  ← Cambiar a 800px, 1400px, etc.
}
```

---

## 🔍 Testing y debugging

### Abrir DevTools en navegador

```
F12 (Windows/Linux)
Cmd+Option+I (Mac)
```

**Tabs útiles:**

1. **Console** 
   - Ver errores de JavaScript
   - Ejecutar comandos: `localStorage.getItem('dtcomander_data')`

2. **Inspector (Elements)**
   - Ver estructura HTML
   - Editar estilos en vivo (Ctrl+Click)
   - Debuggear responsividad

3. **Network**
   - Ver llamadas a Google Apps Script
   - Ver si Chart.js carga desde CDN

4. **Application**
   - Ver localStorage (dónde se guardan los datos)
   - Path: Application → Local Storage → http://localhost:5500

---

### Comandos útiles en Console

```javascript
// Ver todos los datos guardados
JSON.parse(localStorage.getItem('dtcomander_data'))

// Limpiar datos
localStorage.removeItem('dtcomander_data')

// Ver objeto de jugadora específica
JSON.parse(localStorage.getItem('dtcomander_data')).playerData.Ine

// Resetear todo
localStorage.clear()
```

---

### Debuggear formaciones

En `js/app.js`, agrega `console.log` temporalmente:

```javascript
function updateFormationUI() {
    console.log('Formation:', teamFormation);  ← Ver datos
    console.log('Players:', playerData);       ← Ver jugadoras
    updateAvailablePlayers();
    updateFieldPlayers();
}
```

Luego abre DevTools → Console y ves los datos.

---

## 💡 Tips de desarrollo

### 1. Usa Find & Replace para cambios globales

```
Ctrl+H → Find: "Técnica"
         Replace: "Control"
         Replace All
```

Útil para cambiar nombres de atributos en todos lados.

---

### 2. Snippet rápido para agregar sliders

Si necesitas agregar un control rápido, copia/pega:

```html
<!-- En index.html -->
<div class="slider-group">
    <span class="slider-label">Atributo</span>
    <input type="range" min="1" max="10" value="5">
    <span class="slider-value">5</span>
</div>
```

---

### 3. Editar CSS en DevTools (preview antes de guardar)

1. F12 → Inspector
2. Haz click derecho en elemento
3. "Inspect Element"
4. Click en estilos (derecha)
5. Edita valores
6. **Luego copia los cambios a `css/styles.css`**

---

### 4. Responsive testing en VS Code

Extensión: **Responsive Viewer**
```
Ctrl+Shift+X → "Responsive Viewer" → instala
```

Luego: `Ctrl+K Ctrl+I` para ver mobile/tablet/desktop side-by-side.

---

### 5. Versionado con Git (opcional)

Si quieres trackear cambios:

```bash
cd ~/projects/dtcomander
git init
git add .
git commit -m "v1.0 - DTCommander inicial"

# Luego cada cambio:
git add -A
git commit -m "Agregué nuevo atributo: Inteligencia"
```

---

## 🔗 Documentación de referencia

| Necesidad | Archivo |
|-----------|---------|
| Usando la app | QUICK_START.md |
| Setup Google Sheets | README.md |
| Estructura datos | README.md → "Estructura de Datos" |
| Solucionar problemas | README.md → "Troubleshooting" |

---

## 🚀 Próximos cambios sugeridos

### Fáciles (15 min)
- [ ] Cambiar colores primarios
- [ ] Agregar 1-2 atributos nuevos
- [ ] Agregar 3-4 jugadoras nuevas
- [ ] Cambiar textos/labels

### Medio (1 hora)
- [ ] Agregar 4ª formación personalizada
- [ ] Cambiar Layout del campo visual
- [ ] Mejorar estilos mobile

### Avanzado (2+ horas)
- [ ] Agregar historial de evaluaciones (versiones)
- [ ] Exportar a PDF en lugar de CSV
- [ ] Sistema de comparación entre jugadoras
- [ ] Gráficos adicionales (Box plot, heatmap)

---

## 🆘 Problemas comunes

### Live Server no se abre
```
1. Instala Live Server (Ctrl+Shift+X)
2. Click derecho en index.html
3. Si falta opción "Open with Live Server":
   - Recargar VS Code (Ctrl+Shift+P → reload)
   - O click en "Go Live" (abajo a la derecha)
```

### Los cambios no se reflejan
```
1. Presiona F5 en navegador (refresh)
2. Ctrl+Shift+Delete (borrar caché)
3. Cierra Live Server y reabre
```

### Error en consola "Chart is not defined"
```
Significa que Chart.js no cargó del CDN
Solución:
- Verifica tu conexión a internet
- Abre DevTools → Network → busca "chart.min.js"
- Si no está, error de CDN (espera minutos)
```

### localStorage vacío después de F5
```
Normal si usas navegación privada/incógnito
Solución: Abre en navegación normal
```

---

## 📝 Checklist antes de publicar cambios

- [ ] F12 → Console: sin errores rojos
- [ ] Probaste todos los 3 tabs (Evaluador, Formación, Sincronizar)
- [ ] Agregaste una jugadora y guardaste ✓
- [ ] Arrastraste jugadora al campo ✓
- [ ] Exportaste a CSV ✓
- [ ] Probaste en mobile (F12 → responsive)
- [ ] Código formateado (Shift+Alt+F)

---

## 🎯 Resumen

**Para editar DTCommander en VS Code:**

1. Abre proyecto: `code ~/projects/dtcomander`
2. Instala "Live Server"
3. Click derecho en `index.html` → "Open with Live Server"
4. Edita archivos (CSS, JS, HTML)
5. Cambios aparecen automáticamente
6. F12 para debuggear
7. Listo

---

**Versión:** 1.0  
**Última actualización:** Septiembre 2026  
**Para:** Jero en VS Code 🛠️