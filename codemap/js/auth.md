# js/auth.js

Pantalla de login de la app. Se carga **antes** que `sheets-integration.js`
y `app.js` en [index.html](../index.md), y es completamente independiente
de ellos — no le importa nada de `state`, `players`, etc., solo tapa o
destapa el resto de la página.

Es una "cortina", no una cerradura real: como toda la app corre en el
navegador de quien la abre (no hay servidor propio que valide nada), el
email y la contraseña quedan igual visibles para cualquiera que mire el
código fuente de la página ya desplegada. Sirve para que alguien no se
tope de casualidad con el link público y vea los datos del equipo — no
para protegerlos de alguien que realmente quiera entrar sin la clave.
Por eso las credenciales están directamente en este archivo en texto
plano; esconderlas (`.gitignore`, variables de entorno, etc.) no
aportaría nada real en una app 100% estática — ver la nota sobre
`SHEET_API_URL` en [sheets-integration.md](sheets-integration.md), es
la misma lógica.

## Cómo tapa/destapa la app

`index.html` tiene dos contenedores hermanos en el `<body>`:
`#loginGate` (el formulario) y `#appRoot` (todo lo demás: header, tabs,
las cuatro pestañas). `#appRoot` arranca con el atributo `hidden` puesto
directamente en el HTML —no por JS— para que no haya ni un instante de
"flash" de la app antes de que se decida si hay que mostrarla o no.

- `isLoggedIn()`: lee `localStorage['dtcomander_auth']`. Es una marca
  **por navegador/dispositivo**, sin ninguna relación con la Google
  Sheet (que es donde vive el dato real de la app) — borrar esa marca o
  entrar desde otro celular no toca ni un dato de la Sheet, solo hace
  que vuelva a pedir el login en ese dispositivo.
- Al enviar `#loginForm`: compara contra `AUTH_EMAIL`/`AUTH_PASSWORD`
  (constantes al principio del archivo). Si coincide, guarda la marca y
  llama a `showApp()`; si no, muestra el error en `#loginError` sin
  tocar `localStorage`.
- `#logoutBtn` (botón ⏻ en el header): borra la marca y vuelve a mostrar
  `#loginGate`.

## Dependencias externas

| Dependencia | Uso |
|---|---|
| `localStorage` (API del navegador) | Recordar la sesión en ese dispositivo |

Ver también [GLOSSARY.md](../GLOSSARY.md).
