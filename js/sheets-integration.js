// ==================================================================
// DTCommander — sincronización automática con Google Sheets
//
// No hay botón de "sincronizar": esto corre solo, en segundo plano.
// Para activarlo hay un único paso manual (una sola vez, ver SETUP.md):
// desplegar data/google-apps-script.js como Web App en la Sheet, y
// pegar acá abajo la URL que te da ese deploy.
//
// Cada pedido lleva las credenciales de quien entró (js/acceso.js). El Apps Script decide qué devuelve y quién puede
// escribir; acá solo se lee su respuesta para mostrarla en el indicador de estado y para cerrar la sesión si la clave
// ya no vale. Los roles que no editan (jugadora) nunca mandan escrituras.
// ==================================================================
const SHEET_API_URL = 'https://script.google.com/macros/s/AKfycby2J1OBwdPhgTC07PTzRL8blnvdApeKX0YYmRh_eLMwxcNOLyQ_v-Nojc-ywlD33-jY/exec';

(function () {
  const STATUS_EL_ID = 'syncStatus';
  let syncTimer = null;
  const REINTENTO_MS = 1500;
  const esperar = ms => new Promise(r => setTimeout(r, ms));

  function isConfigured() {
    return typeof SHEET_API_URL === 'string' && SHEET_API_URL.indexOf('https://script.google.com/') === 0;
  }

  function setStatus(kind, title) {
    const el = document.getElementById(STATUS_EL_ID);
    if (!el) return;
    el.className = `sync-status sync-${kind}`;
    el.title = title;
  }

  // Lectura por GET, con las credenciales en la URL (un fetch no queda en el historial del navegador).
  // Se usa GET y no POST a propósito: un POST de la app nueva contra un script viejo sería leído como un estado vacío y lo borraría.
  async function leer(params) {
    const q = new URLSearchParams(Object.assign({ _: String(Date.now()) }, params));
    const res = await fetch(SHEET_API_URL + '?' + q.toString(), { method: 'GET' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // Para la pantalla de entrada: comprueba las credenciales contra el script, sin guardar nada.
  async function verificar(creds) {
    if (!isConfigured()) return { estado: 'sin_configurar' };
    try {
      const d = await leer({ rol: creds.rol, nombre: creds.nombre || '', clave: creds.clave });
      if (d && d.error) return { estado: d.error, minutos: d.minutos };
      return { estado: 'ok', protegido: !!(d && d.protegido) };
    } catch (err) {
      return { estado: 'red' };
    }
  }

  // El script contestó con un error: se muestra en el indicador y, si la clave ya no vale, se cierra la sesión.
  function rechazado(resp) {
    const acceso = window.Acceso;
    switch (resp.error) {
      case 'auth':
        // No se cierra la sesión sola: se sigue trabajando con lo guardado en el dispositivo y se muestra un cartel.
        setStatus('denied', 'El script no aceptó la clave guardada en este dispositivo. Lo que hagas se guarda acá pero no llega a la Sheet.');
        if (acceso) acceso.claveRechazada();
        break;
      case 'bloqueado':
        setStatus('denied', `Demasiados intentos fallidos. Probá de nuevo en ${resp.minutos || 30} minutos.`);
        break;
      case 'sin_clave_dt':
        setStatus('denied', 'El script no tiene la clave del DT (propiedad DT_KEY).');
        break;
      case 'ocupado':
        setStatus('offline', 'El servidor está ocupado. Se reintenta en el próximo cambio.');
        break;
      default:
        setStatus('denied', 'Sin permiso para guardar en Google Sheets.');
    }
  }

  async function hydrate() {
    const acceso = window.Acceso;
    const creds = acceso && acceso.credenciales();
    if (!creds) return null; // sin sesión no se pide nada
    if (!isConfigured()) {
      setStatus('local', 'Google Sheets no está configurado todavía (ver SETUP.md). Usando datos guardados en este navegador.');
      return null;
    }
    setStatus('syncing', 'Cargando datos desde Google Sheets…');
    const t0 = Date.now();
    try {
      let remote = await leer({ rol: creds.rol, nombre: creds.nombre, clave: creds.clave });
      let reintento = false;
      // Un "clave incorrecta" aislado no debe sacar a nadie de la app: se reintenta una vez antes de darlo por cierto.
      if (remote && remote.error === 'auth') { reintento = true; await esperar(REINTENTO_MS); remote = await leer({ rol: creds.rol, nombre: creds.nombre, clave: creds.clave }); }
      if (remote && remote.error) { acceso.registrar('lectura', Date.now() - t0, remote.error === 'auth' ? 'clave rechazada' : remote.error, reintento ? 'también al reintentar' : ''); rechazado(remote); return null; }
      acceso.registrar('lectura', Date.now() - t0, 'ok', reintento ? 'el primer intento fue rechazado y el segundo anduvo' : '');
      acceso.claveAceptada();
      acceso.marcarServidor(!!(remote && remote.protegido));
      setStatus('synced', 'Sincronizado con Google Sheets');
      return remote;
    } catch (err) {
      acceso.registrar('lectura', Date.now() - t0, 'sin conexión');
      setStatus('offline', 'No se pudo conectar con Google Sheets. Usando datos guardados en este navegador.');
      return null;
    }
  }

  function scheduleSync(state) {
    const acceso = window.Acceso;
    if (!acceso || !acceso.puedeEditar()) return; // sin sesión o solo lectura: nunca se escribe
    if (!isConfigured()) {
      setStatus('local', 'Google Sheets no está configurado todavía (ver SETUP.md). Guardado solo en este navegador.');
      return;
    }
    setStatus('syncing', 'Sincronizando con Google Sheets…');
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => pushNow(state), 800);
  }

  async function pushNow(state) {
    const acceso = window.Acceso;
    const creds = acceso && acceso.credenciales();
    if (!creds || !acceso.puedeEditar()) return;
    const t0 = Date.now();
    const enviar = async () => {
      const res = await fetch(SHEET_API_URL, {
        method: 'POST',
        // text/plain evita el preflight CORS que Apps Script no maneja bien con application/json
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ auth: creds }, state))
      });
      // Antes la respuesta se ignoraba y siempre decía "Sincronizado": ahora se lee para enterarse si el script rechazó el guardado.
      try { return await res.json(); } catch (err) { return null; }
    };
    try {
      let resp = await enviar();
      let reintento = false;
      // Guardar es un pedido completo (no una suma), así que repetirlo es seguro.
      if (resp && resp.error === 'auth') { reintento = true; await esperar(REINTENTO_MS); resp = await enviar(); }
      if (resp && resp.error) { acceso.registrar('guardado', Date.now() - t0, resp.error === 'auth' ? 'clave rechazada' : resp.error, reintento ? 'también al reintentar' : ''); rechazado(resp); return; }
      acceso.registrar('guardado', Date.now() - t0, resp ? 'ok' : 'sin confirmación', reintento ? 'el primer intento fue rechazado y el segundo anduvo' : '');
      if (resp) acceso.claveAceptada();
      setStatus('synced', resp ? 'Sincronizado con Google Sheets' : 'Enviado a Google Sheets (sin confirmación)');
    } catch (err) {
      acceso.registrar('guardado', Date.now() - t0, 'sin conexión');
      setStatus('offline', 'No se pudo sincronizar con Google Sheets. Guardado local; se reintenta en el próximo cambio.');
    }
  }

  // Administración de accesos (solo el DT): listar, generar o regenerar una clave, activar/desactivar y quitar.
  // Devuelve siempre un objeto: { accesos: [...] } o { error }. Con un script viejo (sin candado) no hay accesos: { error: 'sin_candado' }.
  async function gestionarAccesos(params) {
    const acceso = window.Acceso;
    const creds = acceso && acceso.credenciales();
    if (!creds || creds.rol !== 'dt') return { error: 'permiso' };
    if (!isConfigured()) return { error: 'sin_configurar' };
    try {
      const d = await leer(Object.assign({ rol: creds.rol, nombre: '', clave: creds.clave }, params));
      if (d && d.error === 'auth') { rechazado(d); return d; }
      if (!d || !d.protegido) return { error: 'sin_candado' };
      return d;
    } catch (err) {
      return { error: 'red' };
    }
  }

  window.SheetsSync = { hydrate, scheduleSync, verificar, gestionarAccesos };
})();
