// ==================================================================
// DTCommander — sincronización automática con Google Sheets
//
// No hay botón de "sincronizar": esto corre solo, en segundo plano.
// Para activarlo hay un único paso manual (una sola vez, ver SETUP.md):
// desplegar data/google-apps-script.js como Web App en la Sheet, y
// pegar acá abajo la URL que te da ese deploy.
// ==================================================================
const SHEET_API_URL = 'https://script.google.com/macros/s/AKfycby2J1OBwdPhgTC07PTzRL8blnvdApeKX0YYmRh_eLMwxcNOLyQ_v-Nojc-ywlD33-jY/exec';

(function () {
  const STATUS_EL_ID = 'syncStatus';
  let syncTimer = null;

  function isConfigured() {
    return typeof SHEET_API_URL === 'string' && SHEET_API_URL.indexOf('https://script.google.com/') === 0;
  }

  function setStatus(kind, title) {
    const el = document.getElementById(STATUS_EL_ID);
    if (!el) return;
    el.className = `sync-status sync-${kind}`;
    el.title = title;
  }

  async function hydrate() {
    if (!isConfigured()) {
      setStatus('local', 'Google Sheets no está configurado todavía (ver SETUP.md). Usando datos guardados en este navegador.');
      return null;
    }
    setStatus('syncing', 'Cargando datos desde Google Sheets…');
    try {
      const res = await fetch(SHEET_API_URL, { method: 'GET' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const remote = await res.json();
      setStatus('synced', 'Sincronizado con Google Sheets');
      return remote;
    } catch (err) {
      setStatus('offline', 'No se pudo conectar con Google Sheets. Usando datos guardados en este navegador.');
      return null;
    }
  }

  function scheduleSync(state) {
    if (!isConfigured()) {
      setStatus('local', 'Google Sheets no está configurado todavía (ver SETUP.md). Guardado solo en este navegador.');
      return;
    }
    setStatus('syncing', 'Sincronizando con Google Sheets…');
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => pushNow(state), 800);
  }

  async function pushNow(state) {
    try {
      await fetch(SHEET_API_URL, {
        method: 'POST',
        // text/plain evita el preflight CORS que Apps Script no maneja bien con application/json
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(state)
      });
      setStatus('synced', 'Sincronizado con Google Sheets');
    } catch (err) {
      setStatus('offline', 'No se pudo sincronizar con Google Sheets. Guardado local; se reintenta en el próximo cambio.');
    }
  }

  window.SheetsSync = { hydrate, scheduleSync };
})();
