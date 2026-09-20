// ==================================================================
// DTCommander — pantalla de login simple.
//
// OJO: esto es una cortina, no una cerradura. Como la app es 100%
// estática (corre entera en el navegador de quien la abre), cualquiera
// que mire el código fuente puede leer estas credenciales o saltear la
// pantalla directamente. Sirve para que alguien no se tope de casualidad
// con el link y vea los datos del equipo — no protege contra alguien que
// realmente quiera entrar sin la clave.
// ==================================================================
const AUTH_STORAGE_KEY = 'dtcomander_auth';
const AUTH_EMAIL = 'jeromartinez12@gmail.com';
const AUTH_PASSWORD = 'Racing22';

(function () {
  function isLoggedIn() {
    try { return localStorage.getItem(AUTH_STORAGE_KEY) === '1'; } catch (err) { return false; }
  }

  function showApp() {
    document.getElementById('loginGate').hidden = true;
    document.getElementById('appRoot').hidden = false;
  }

  function showGate() {
    document.getElementById('loginGate').hidden = false;
    document.getElementById('appRoot').hidden = true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (isLoggedIn()) {
      showApp();
    } else {
      showGate();
    }

    document.getElementById('loginForm').addEventListener('submit', e => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim().toLowerCase();
      const password = document.getElementById('loginPassword').value;
      const errorEl = document.getElementById('loginError');

      if (email === AUTH_EMAIL && password === AUTH_PASSWORD) {
        try { localStorage.setItem(AUTH_STORAGE_KEY, '1'); } catch (err) { /* localStorage no disponible */ }
        errorEl.textContent = '';
        showApp();
      } else {
        errorEl.textContent = 'Email o contraseña incorrectos.';
      }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
      try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch (err) { /* localStorage no disponible */ }
      document.getElementById('loginEmail').value = '';
      document.getElementById('loginPassword').value = '';
      showGate();
    });
  });
})();
