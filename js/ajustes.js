// ==================================================================
// DTCommander — Ajustes (solo el DT): accesos, política de datos y permisos.
//
// Accesos: cada jugadora tiene un PIN de 4 dígitos y cada persona del equipo técnico una clave larga. Las claves las
// genera y guarda el Apps Script (hoja Accesos); acá solo se piden, se muestran y se administran. Como la lista
// contiene claves, NO se guarda en el dispositivo ni en `state`: vive en memoria mientras el panel está abierto.
// Todo texto que viene de la Sheet (nombres, claves) se dibuja con textContent, nunca como HTML.
// ==================================================================
(function () {
  const $ = id => document.getElementById(id);
  const norm = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  const CONFIRMAR_MS = 4000;

  let accesos = [];
  let cargado = false;
  let ocupado = false;
  let focoPrevio = null;
  const reveladas = new Set(); // 'rol|nombre normalizado'
  const idClave = a => a.rol + '|' + norm(a.nombre);

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function boton(texto, clase, alHacer) {
    const b = el('button', 'btn btn-small ' + (clase || ''), texto);
    b.type = 'button';
    b.disabled = ocupado;
    b.addEventListener('click', alHacer);
    return b;
  }

  // Acciones que borran o invalidan algo: el primer toque pide confirmar, el segundo lo hace.
  function botonConConfirmacion(texto, textoConfirmar, clase, alHacer) {
    const b = boton(texto, clase, () => {
      if (b.dataset.armado) { clearTimeout(Number(b.dataset.armado)); alHacer(); return; }
      b.textContent = textoConfirmar;
      b.classList.add('armado');
      b.dataset.armado = String(setTimeout(() => { delete b.dataset.armado; b.textContent = texto; b.classList.remove('armado'); }, CONFIRMAR_MS));
    });
    return b;
  }

  function mostrarError(texto) { $('ajustesError').textContent = texto || ''; }

  function textoDeError(r) {
    switch (r && r.error) {
      case 'sin_candado': return 'El candado no está activado en el script: pegá el script nuevo y cargá DT_KEY (ver SETUP.md).';
      case 'red': return 'No se pudo conectar. Probá de nuevo.';
      case 'ocupado': return 'El servidor está ocupado. Probá de nuevo en unos segundos.';
      case 'auth': return 'Tu clave ya no es válida.';
      case 'permiso': return 'Solo el DT puede administrar los accesos.';
      case 'sin_configurar': return 'Google Sheets no está configurado todavía.';
      default: return 'No se pudo completar la acción.';
    }
  }

  async function llamar(params) {
    if (ocupado) return null;
    ocupado = true;
    mostrarError('');
    renderAccesos();
    const r = await window.SheetsSync.gestionarAccesos(params);
    ocupado = false;
    if (r && Array.isArray(r.accesos)) { accesos = r.accesos; cargado = true; } else mostrarError(textoDeError(r));
    renderAccesos();
    return r;
  }

  function copiar(texto, btn) {
    const original = btn.textContent;
    const listo = () => { btn.textContent = '¡Copiado!'; setTimeout(() => { btn.textContent = original; }, 1500); };
    try {
      navigator.clipboard.writeText(texto).then(listo, () => { btn.textContent = 'No se pudo copiar'; setTimeout(() => { btn.textContent = original; }, 1500); });
    } catch (err) {
      btn.textContent = 'No se pudo copiar';
      setTimeout(() => { btn.textContent = original; }, 1500);
    }
  }

  // Una fila: quién es, su clave (oculta hasta que se pida) y lo que se puede hacer.
  function fila(rol, nombre, acceso, extra) {
    const f = el('div', 'acceso-fila' + (acceso && !acceso.activo ? ' inactivo' : ''));
    f.dataset.rol = rol;
    f.dataset.nombre = nombre;
    const quien = el('div', 'acceso-quien');
    quien.appendChild(el('strong', '', nombre));
    quien.appendChild(el('small', 'acceso-estado', !acceso ? 'Sin acceso' : acceso.activo ? 'Activo' : 'Desactivado'));
    if (extra) quien.appendChild(el('small', 'acceso-extra', extra));
    f.appendChild(quien);
    const acciones = el('div', 'acceso-acciones');
    f.appendChild(acciones);
    const generar = () => llamar({ accion: 'acceso_generar', rolAcceso: rol, para: nombre });

    if (!acceso) {
      acciones.appendChild(boton(rol === 'jugadora' ? 'Crear PIN' : 'Crear clave', '', async () => {
        const r = await generar();
        if (r && r.accesos) reveladas.add(rol + '|' + norm(nombre));
        renderAccesos();
      }));
      return f;
    }
    const visible = reveladas.has(idClave(acceso));
    const clave = el('code', 'acceso-clave', visible ? acceso.clave : '••••');
    quien.appendChild(clave);
    acciones.appendChild(boton(visible ? 'Ocultar' : 'Mostrar', 'btn-secondary', () => {
      if (visible) reveladas.delete(idClave(acceso)); else reveladas.add(idClave(acceso));
      renderAccesos();
    }));
    const copia = boton('Copiar', 'btn-secondary', () => copiar(acceso.clave, copia));
    acciones.appendChild(copia);
    acciones.appendChild(botonConConfirmacion(rol === 'jugadora' ? 'Nuevo PIN' : 'Nueva clave', '¿Cambiar?', 'btn-secondary', async () => {
      const r = await generar();
      if (r && r.accesos) reveladas.add(idClave(acceso));
      renderAccesos();
    }));
    acciones.appendChild(boton(acceso.activo ? 'Desactivar' : 'Activar', 'btn-secondary', () =>
      llamar({ accion: 'acceso_activar', rolAcceso: rol, para: nombre, activo: acceso.activo ? 'no' : 'si' })));
    acciones.appendChild(botonConConfirmacion('Quitar', '¿Quitar?', 'btn-danger', () => {
      reveladas.delete(idClave(acceso));
      llamar({ accion: 'acceso_quitar', rolAcceso: rol, para: nombre });
    }));
    return f;
  }

  function renderAccesos() {
    const aviso = $('ajustesAviso');
    const jug = $('accesosJugadoras');
    const sop = $('accesosSoporte');
    jug.textContent = '';
    sop.textContent = '';
    $('accesoSoporteNombre').disabled = ocupado || !cargado;
    $('accesoSoporteForm').querySelector('button').disabled = ocupado || !cargado;
    // Mientras no se sabe qué accesos hay, no se dibuja la lista: mostraría "Sin acceso" para todas.
    aviso.hidden = !(ocupado && !cargado);
    if (!aviso.hidden) aviso.textContent = 'Cargando accesos…';
    if (!cargado) return;
    const plantel = Object.keys((typeof state !== 'undefined' && state.players) || {});
    const enPlantel = new Set(plantel.map(norm));
    const jugadoras = accesos.filter(a => a.rol === 'jugadora');
    plantel.forEach(nombre => jug.appendChild(fila('jugadora', nombre, jugadoras.find(a => norm(a.nombre) === norm(nombre)) || null)));
    // Accesos de alguien que ya no está en el plantel: se muestran para poder quitarlos.
    jugadoras.filter(a => !enPlantel.has(norm(a.nombre))).forEach(a => jug.appendChild(fila('jugadora', a.nombre, a, 'Ya no está en el plantel')));
    if (!plantel.length && !jugadoras.length) jug.appendChild(el('p', 'hint', 'Todavía no hay jugadoras cargadas.'));

    const soporte = accesos.filter(a => a.rol === 'soporte');
    soporte.forEach(a => sop.appendChild(fila('soporte', a.nombre, a)));
    if (!soporte.length) sop.appendChild(el('p', 'hint', 'Todavía no agregaste a nadie del equipo técnico.'));
    devolverFoco();
  }

  // Al redibujar la lista los botones se reemplazan y el teclado perdería el lugar: se vuelve a la misma fila.
  let filaActiva = null;
  function devolverFoco() {
    if (!filaActiva || document.activeElement !== document.body || $('ajustes').hidden) return;
    const f = [...document.querySelectorAll('#ajustes-accesos .acceso-fila')].find(x => x.dataset.rol === filaActiva.rol && x.dataset.nombre === filaActiva.nombre);
    const b = f && [...f.querySelectorAll('button')].find(x => !x.disabled);
    if (b) b.focus();
  }

  const TEXTO_NIVEL = { editar: 'Ve y edita', ver: 'Solo ve', nada: 'Sin acceso' };
  function renderPermisos() {
    const tabla = $('permisosTabla');
    tabla.textContent = '';
    const cab = tabla.insertRow();
    ['Solapa', 'DT', 'Soporte', 'Jugadora'].forEach(t => { const th = document.createElement('th'); th.textContent = t; cab.appendChild(th); });
    window.Acceso.PERMISOS.forEach(p => {
      const tr = tabla.insertRow();
      tr.insertCell().textContent = p.nombre;
      ['dt', 'soporte', 'jugadora'].forEach(rol => {
        const td = tr.insertCell();
        td.className = 'nivel-' + p[rol];
        td.textContent = TEXTO_NIVEL[p[rol]] + (p.nota && p.nota[rol] ? ' (' + p.nota[rol] + ')' : '');
      });
    });
  }

  function mostrarPestana(nombre) {
    document.querySelectorAll('#ajustes .ajustes-tab').forEach(b => b.classList.toggle('active', b.dataset.pestana === nombre));
    document.querySelectorAll('#ajustes .ajustes-body > section').forEach(s => { s.hidden = s.dataset.pestana !== nombre; });
    if (nombre === 'accesos' && !cargado) llamar({ accion: 'accesos_listar' });
  }

  function abrir() {
    if (window.Acceso.nivel('ajustes') !== 'editar') return;
    focoPrevio = document.activeElement;
    $('ajustes').hidden = false;
    document.body.classList.add('con-ajustes');
    cargado = false;
    accesos = [];
    reveladas.clear();
    mostrarError('');
    renderPermisos();
    renderAccesos();
    mostrarPestana('accesos');
    $('ajustesCerrar').focus();
  }

  function cerrar() {
    $('ajustes').hidden = true;
    document.body.classList.remove('con-ajustes');
    accesos = []; // las claves no se quedan en memoria más de lo necesario
    cargado = false;
    reveladas.clear();
    if (focoPrevio && focoPrevio.focus) focoPrevio.focus();
  }

  function setupAjustes() {
    if (!$('ajustes') || !$('ajustesBtn')) return;
    $('ajustesBtn').addEventListener('click', abrir);
    $('ajustesCerrar').addEventListener('click', cerrar);
    $('ajustes').addEventListener('click', e => { if (e.target === $('ajustes')) cerrar(); });
    document.querySelectorAll('#ajustes .ajustes-tab').forEach(b => b.addEventListener('click', () => mostrarPestana(b.dataset.pestana)));
    $('ajustes-accesos').addEventListener('click', e => {
      const f = e.target.closest('.acceso-fila');
      filaActiva = f ? { rol: f.dataset.rol, nombre: f.dataset.nombre } : null;
    });
    $('accesoSoporteForm').addEventListener('submit', async e => {
      e.preventDefault();
      const nombre = $('accesoSoporteNombre').value.trim();
      if (!nombre) return;
      if (accesos.some(a => a.rol === 'soporte' && norm(a.nombre) === norm(nombre))) { mostrarError('Ya hay alguien del equipo técnico con ese nombre.'); return; }
      const r = await llamar({ accion: 'acceso_generar', rolAcceso: 'soporte', para: nombre });
      if (r && r.accesos) { $('accesoSoporteNombre').value = ''; reveladas.add('soporte|' + norm(nombre)); renderAccesos(); }
    });
    document.addEventListener('keydown', e => {
      if ($('ajustes').hidden) return;
      if (e.key === 'Escape') { cerrar(); return; }
      if (e.key !== 'Tab') return;
      // El foco se queda dentro del panel mientras está abierto.
      const foco = [...$('ajustes').querySelectorAll('button, input, [href]')].filter(x => !x.disabled && x.offsetParent !== null);
      if (!foco.length) return;
      const primero = foco[0];
      const ultimo = foco[foco.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    });
  }

  document.addEventListener('DOMContentLoaded', setupAjustes);
})();
