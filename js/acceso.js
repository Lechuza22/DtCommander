// ==================================================================
// DTCommander — quién entró y qué puede hacer.
//
// La app es estática y su código es público, así que acá NO hay ninguna clave escrita: cada persona escribe la suya,
// se manda al Apps Script y es el Apps Script el que decide (ver "Acceso y permisos" en data/google-apps-script.js).
// Lo que se oculte en esta pantalla sirve para no confundir, pero lo que protege los datos es que el script solo
// entrega a cada rol lo que le corresponde y solo deja escribir al DT y al soporte.
//
// Roles: dt (todo), soporte (equipo técnico: todo menos los accesos), jugadora (solo lectura de lo suyo).
// La sesión se guarda en este dispositivo y se aplica al recargar la página: por eso, al entrar y al salir se recarga.
// ==================================================================
(function () {
  const SESION_KEY = 'dtcomander_sesion';
  const CACHE_EQUIPO = 'dtcomander_data';
  const CACHE_JUGADORA = 'dtcomander_data_jugadora';
  const AVISO_KEY = 'dtcomander_aviso';
  // 'jugadora' se agrega acá cuando esté lista su vista de solo lectura.
  const ROLES_HABILITADOS = ['dt', 'soporte'];
  const ROLES_QUE_EDITAN = ['dt', 'soporte'];
  const NOMBRES_ROL = { dt: 'Soy el DT', soporte: 'Soy del equipo técnico / soporte', jugadora: 'Soy jugadora' };

  // Qué puede hacer cada rol en cada solapa: 'editar' (ve y edita), 'ver' (solo mira) o 'nada' (ni la ve).
  // Es la única tabla: la usa la pantalla de Ajustes → Permisos y la vista de solo lectura de las jugadoras.
  // Lo que de verdad se entrega o se acepta lo decide el Apps Script (filtrarEstadoParaRol_ y doPost); esto es lo mismo, dicho en la pantalla.
  const PERMISOS = [
    { panel: 'panel-evaluador', nombre: 'Evaluador', dt: 'editar', soporte: 'editar', jugadora: 'nada' },
    { panel: 'panel-jugadora', nombre: 'Jugadora', dt: 'editar', soporte: 'editar', jugadora: 'ver', nota: { jugadora: 'su ficha y su evolución' } },
    { panel: 'panel-entrenamiento', nombre: 'Entrenamiento', dt: 'editar', soporte: 'editar', jugadora: 'nada' },
    { panel: 'panel-formacion', nombre: 'Formación', dt: 'editar', soporte: 'editar', jugadora: 'ver' },
    { panel: 'panel-tactica', nombre: 'Táctica', dt: 'editar', soporte: 'editar', jugadora: 'ver' },
    { panel: 'panel-simulacion', nombre: 'Simulación', dt: 'editar', soporte: 'editar', jugadora: 'nada' },
    { panel: 'panel-partido', nombre: 'Partido en vivo', dt: 'editar', soporte: 'editar', jugadora: 'nada' },
    { panel: 'panel-jugados', nombre: 'Partidos jugados', dt: 'editar', soporte: 'editar', jugadora: 'ver', nota: { jugadora: 'solo terminados, sin las notas del DT' } },
    { panel: 'ajustes', nombre: 'Ajustes y accesos', dt: 'editar', soporte: 'nada', jugadora: 'nada' }
  ];

  function leerSesion() {
    try {
      const s = JSON.parse(localStorage.getItem(SESION_KEY) || 'null');
      if (s && ['dt', 'soporte', 'jugadora'].includes(s.rol) && typeof s.clave === 'string' && s.clave) {
        return { rol: s.rol, nombre: String(s.nombre || ''), clave: s.clave };
      }
    } catch (err) { /* sin sesión */ }
    return null;
  }

  const sesion = leerSesion();
  const $ = id => document.getElementById(id);

  function avisar(texto) {
    try { sessionStorage.setItem(AVISO_KEY, texto); } catch (err) { /* sin sessionStorage */ }
  }

  function salirYRecargar() {
    try { localStorage.removeItem(SESION_KEY); } catch (err) { /* sin localStorage */ }
    location.reload();
  }

  const Acceso = {
    servidorProtegido: null,
    rol: sesion ? sesion.rol : null,
    nombre: sesion ? sesion.nombre : '',
    credenciales: () => (sesion ? { rol: sesion.rol, nombre: sesion.nombre, clave: sesion.clave } : null),
    puedeEditar: () => !!sesion && ROLES_QUE_EDITAN.includes(sesion.rol),
    PERMISOS,
    nivel(panel) {
      const fila = PERMISOS.find(p => p.panel === panel);
      return sesion && fila ? fila[sesion.rol] : 'nada';
    },
    // Las jugadoras guardan sus datos aparte: nunca comparten lo guardado en el dispositivo con el DT.
    storageKey: () => (sesion && sesion.rol === 'jugadora' ? CACHE_JUGADORA : CACHE_EQUIPO),

    // Lo llama la sincronización cuando el script responde si está protegido o no (una versión vieja del script no lo está).
    marcarServidor(protegido) {
      Acceso.servidorProtegido = !!protegido;
      const aviso = $('candadoAviso');
      if (aviso) aviso.hidden = !!protegido || !sesion || sesion.rol !== 'dt';
    },

    // El script dijo que la clave ya no vale (la cambiaron): se cierra la sesión y se pide entrar de nuevo.
    sesionInvalida() {
      avisar('Tu clave ya no es válida. Ingresá de nuevo.');
      salirYRecargar();
    },

    cerrarSesion() {
      if (sesion && sesion.rol === 'jugadora') { try { localStorage.removeItem(CACHE_JUGADORA); } catch (err) { /* sin localStorage */ } }
      salirYRecargar();
    }
  };
  window.Acceso = Acceso;

  function mensajeDeError(estado, minutos, rol) {
    switch (estado) {
      case 'auth': return rol === 'dt' ? 'La clave no es correcta.' : 'El nombre o la clave no son correctos.';
      case 'bloqueado': return `Demasiados intentos. Probá de nuevo en ${minutos || 30} minutos.`;
      case 'ocupado': return 'El servidor está ocupado. Probá de nuevo en unos segundos.';
      case 'sin_clave_dt': return 'El script todavía no tiene la clave del DT: agregá la propiedad DT_KEY en las Propiedades del script.';
      case 'sin_candado': return 'El candado todavía no está activado en el script, por ahora solo puede entrar el DT.';
      case 'sin_configurar': return 'Google Sheets no está configurado todavía (ver SETUP.md).';
      case 'red': return 'No se pudo conectar. Hace falta internet para entrar.';
      default: return 'No se pudo entrar.';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const gate = $('loginGate');
    const app = $('appRoot');
    if (!gate || !app) return;

    if (sesion) {
      gate.hidden = true;
      app.hidden = false;
      const chip = $('rolChip');
      if (chip) {
        chip.textContent = sesion.rol === 'dt' ? 'DT' : sesion.rol === 'soporte' ? 'Soporte · ' + sesion.nombre : sesion.nombre;
        chip.hidden = false;
      }
      document.body.dataset.rol = sesion.rol;
      const engranaje = $('ajustesBtn');
      if (engranaje) engranaje.hidden = Acceso.nivel('ajustes') !== 'editar';
      const btn = $('logoutBtn');
      let armado = null;
      btn.addEventListener('click', () => {
        if (!armado) {
          // Dos toques: salir sin querer en la cancha, sin señal, dejaría al DT afuera hasta tener internet.
          btn.textContent = '¿Salir?';
          btn.classList.add('armado');
          armado = setTimeout(() => { armado = null; btn.textContent = '⏻'; btn.classList.remove('armado'); }, 4000);
          return;
        }
        clearTimeout(armado);
        Acceso.cerrarSesion();
      });
      return;
    }

    gate.hidden = false;
    app.hidden = true;
    const rolSel = $('loginRol');
    const nombre = $('loginNombre');
    const clave = $('loginClave');
    const error = $('loginError');
    rolSel.innerHTML = ROLES_HABILITADOS.map(r => `<option value="${r}">${NOMBRES_ROL[r]}</option>`).join('');
    rolSel.hidden = ROLES_HABILITADOS.length < 2;
    try {
      const aviso = sessionStorage.getItem(AVISO_KEY);
      if (aviso) { error.textContent = aviso; sessionStorage.removeItem(AVISO_KEY); }
    } catch (err) { /* sin sessionStorage */ }

    function ajustarCampos() {
      const rol = rolSel.value;
      nombre.hidden = rol === 'dt';
      nombre.required = rol !== 'dt';
      clave.placeholder = rol === 'jugadora' ? 'PIN de 4 dígitos' : 'Clave';
      clave.inputMode = rol === 'jugadora' ? 'numeric' : 'text';
      clave.maxLength = rol === 'jugadora' ? 4 : 100;
    }
    rolSel.addEventListener('change', ajustarCampos);
    ajustarCampos();

    $('loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const boton = $('loginBtn');
      const rol = rolSel.value;
      const creds = { rol, nombre: rol === 'dt' ? '' : nombre.value.trim(), clave: clave.value.trim() };
      error.textContent = '';
      boton.disabled = true;
      boton.textContent = 'Entrando…';
      const r = await window.SheetsSync.verificar(creds);
      boton.disabled = false;
      boton.textContent = 'Entrar';
      let estado = r.estado;
      // Con el script viejo (sin candado) no hay cómo comprobar una clave: solo se deja pasar al DT, y la app lo avisa.
      if (estado === 'ok' && !r.protegido && rol !== 'dt') estado = 'sin_candado';
      if (estado !== 'ok') { error.textContent = mensajeDeError(estado, r.minutos, rol); return; }
      try {
        localStorage.setItem(SESION_KEY, JSON.stringify(creds));
        // Otra persona en el mismo dispositivo: lo guardado de las jugadoras no se queda para el DT.
        if (rol !== 'jugadora') localStorage.removeItem(CACHE_JUGADORA);
      } catch (err) {
        error.textContent = 'Este navegador no deja guardar la sesión (¿modo privado?).';
        return;
      }
      location.reload();
    });
  });
})();
