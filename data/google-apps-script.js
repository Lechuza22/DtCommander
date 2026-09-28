/**
 * DTCommander — backend de Google Apps Script.
 *
 * Cómo instalarlo (una sola vez, ver SETUP.md para el paso a paso):
 * 1. Abrí la Google Sheet → Extensiones → Apps Script.
 * 2. Borrá el contenido de Code.gs y pegá todo este archivo.
 * 3. Ponele clave al DT: Configuración del proyecto (el engranaje de la izquierda) → Propiedades del script →
 *    Agregar propiedad: nombre DT_KEY, valor una clave larga que solo sepas vos (por ejemplo una frase de 4 palabras).
 *    Sin DT_KEY el script no le da acceso a nadie, ni siquiera a vos.
 * 4. Implementar → Nueva implementación → tipo "Aplicación web".
 *      - Ejecutar como: Yo
 *      - Quién tiene acceso: Cualquier usuario
 *    (Si ya tenías una implementación: Implementar → Administrar implementaciones → lápiz → Versión: Nueva versión.
 *    La URL no cambia.)
 * 5. Copiá la URL que te da y pegala en SHEET_API_URL,
 *    en js/sheets-integration.js.
 *
 * Quién puede qué: ver "Acceso y permisos" más abajo. La hoja Accesos se crea sola; las claves de las jugadoras
 * (PIN) y del soporte las genera el DT desde Ajustes en la app. Quien pueda editar esta Sheet ve esas claves.
 *
 * Importante: si agregás o sacás un atributo en js/app.js (ATTRIBUTES),
 * replicá el mismo cambio acá abajo para que las columnas coincidan.
 * Lo mismo si cambiás los nombres de PLANS en js/app.js.
 */
const ATTRIBUTES = [
  'Técnica', 'Pegada', 'Defensa', 'Ataque', 'Regate',
  'Cabeceo', 'Velocidad', 'Visión', 'Posicionamiento', 'Mentalidad', 'Portería'
];

const PLAN_NAMES = ['Plan A', 'Plan B', 'Plan C'];
const DEFAULT_FORMATION = '2-3-2';

// Mismas keys que RUBRIC_DIMENSIONS en js/app.js.
const RUBRIC_KEYS = ['tecnica', 'tactica', 'presion', 'actitud', 'fisico'];

const SHEET_JUGADORAS = 'Jugadoras';
const SHEET_HISTORIAL = 'Historial';
const SHEET_PARTIDOS = 'Partidos';
const SHEET_FORMACION = 'Formacion';
const SHEET_ENTRENAMIENTOS = 'Entrenamientos';
const SHEET_TACTICAS = 'Tacticas';
const SHEET_SIMULACIONES = 'Simulaciones';
const SHEET_PARTIDOS_VIVO = 'PartidosVivo';
const SHEET_META = 'Meta';

// Leer: rol, nombre y clave llegan como parámetros de la URL (?rol=dt&clave=...). Solo se devuelve lo que ese rol puede ver.
// Sin credenciales válidas no se lee ninguna hoja.
function doGet(e) {
  const p = (e && e.parameter) || {};
  const acceso = autenticar_({ rol: p.rol, nombre: p.nombre, clave: p.clave });
  if (!acceso.ok) return jsonResponse_(errorAcceso_(acceso));
  if (p.accion) return jsonResponse_(gestionarAccesos_(acceso, p));
  const salida = filtrarEstadoParaRol_(leerEstado_(), acceso);
  salida.protegido = true;
  salida.rol = acceso.rol;
  salida.nombre = acceso.nombre;
  return jsonResponse_(salida);
}

// Escribir: las credenciales van en body.auth. Solo el DT y el soporte pueden escribir; si algo falla no se toca ninguna hoja.
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return jsonResponse_({ protegido: true, error: 'formato' }); }
  const acceso = autenticar_(body && body.auth);
  if (!acceso.ok) return jsonResponse_(errorAcceso_(acceso));
  if (acceso.rol !== ROL_DT && acceso.rol !== ROL_SOPORTE) return jsonResponse_({ protegido: true, error: 'permiso' });
  writePlayers_(body.players || {});
  writeHistory_(body.players || {});
  writeMatches_(body.matches || {});
  writeTrainingLogs_(body.trainingLogs || []);
  // Solo si el cliente las manda: una versión vieja de la app no las conoce y
  // no debe borrar las tácticas que ya están en la Sheet.
  if (Array.isArray(body.tactics)) writeTactics_(body.tactics);
  if (Array.isArray(body.simulations)) writeSimulations_(body.simulations);
  if (Array.isArray(body.matchLogs)) writeMatchLogs_(body.matchLogs);
  writeMeta_('activeMatch', body.activeMatch || '');
  return jsonResponse_({ ok: true, protegido: true });
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function leerEstado_() {
  const players = readPlayers_();
  attachHistory_(players);
  return {
    players,
    matches: readMatches_(),
    trainingLogs: readTrainingLogs_(),
    tactics: readTactics_(),
    simulations: readSimulations_(),
    matchLogs: readMatchLogs_(),
    activeMatch: readMeta_('activeMatch') || ''
  };
}

// ==================================================================
// Acceso y permisos
//
// Tres roles:
//   dt         entra con la clave guardada en Propiedades del script (DT_KEY); ve y edita todo y administra los accesos.
//   soporte    equipo técnico / soporte del DT: nombre + clave larga (hoja Accesos); ve y edita todo menos los accesos.
//   jugadora   nombre + PIN de 4 dígitos (hoja Accesos); solo lee, y solo lo que le corresponde (ver filtrarEstadoParaRol_).
// La lógica de decisión (decidirAcceso_, filtrarEstadoParaRol_) no usa servicios de Google, para poder probarla aparte.
// ==================================================================
const SHEET_ACCESOS = 'Accesos';
const ACCESOS_HEADERS = ['Rol', 'Nombre', 'Clave', 'Activo'];
const ROL_DT = 'dt';
const ROL_SOPORTE = 'soporte';
const ROL_JUGADORA = 'jugadora';
const PIN_MAX_FALLOS = 5;
const PIN_VENTANA_MS = 30 * 60 * 1000;
const PIN_BLOQUEO_MS = 30 * 60 * 1000;

// "Ágos  " y "agos" son la misma persona.
function nombreNormal_(s) {
  return String(s === null || s === undefined ? '' : s).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

// PIN: solo dígitos. Clave del soporte: minúsculas y números (se toleran guiones y espacios). Clave del DT: tal cual.
function claveNormal_(rol, s) {
  const t = String(s === null || s === undefined ? '' : s).trim();
  if (rol === ROL_JUGADORA) return t.replace(/\D/g, '');
  if (rol === ROL_SOPORTE) return t.toLowerCase().replace(/[^a-z0-9]/g, '');
  return t;
}

function igualesSeguras_(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// ctx = { dtKey, accesos: [{rol, nombre, clave, activo}], fallos: { nombreNormal: {n, desde, hasta} }, ahora }
// Devuelve { ok, rol, nombre } o { ok:false, error: 'auth' | 'bloqueado' | 'sin_clave_dt', minutos }, más lo que hay que
// recordar sobre intentos fallidos (fallo / limpiarFallo). Los errores de nombre y de clave son iguales a propósito.
function decidirAcceso_(creds, ctx) {
  const c = creds || {};
  const rol = String(c.rol || '');
  if (rol === ROL_DT) {
    if (!ctx.dtKey) return { ok: false, error: 'sin_clave_dt' };
    const clave = claveNormal_(ROL_DT, c.clave);
    return clave && igualesSeguras_(clave, claveNormal_(ROL_DT, ctx.dtKey))
      ? { ok: true, rol: ROL_DT, nombre: '' }
      : { ok: false, error: 'auth' };
  }
  if (rol !== ROL_SOPORTE && rol !== ROL_JUGADORA) return { ok: false, error: 'auth' };

  const nombre = nombreNormal_(c.nombre);
  const clave = claveNormal_(rol, c.clave);
  if (!nombre || !clave) return { ok: false, error: 'auth' };
  const fila = ctx.accesos.find(a => a.rol === rol && nombreNormal_(a.nombre) === nombre);

  if (rol === ROL_SOPORTE) {
    return fila && fila.activo && igualesSeguras_(clave, claveNormal_(rol, fila.clave))
      ? { ok: true, rol, nombre: fila.nombre }
      : { ok: false, error: 'auth' };
  }

  // Jugadora: el PIN tiene solo 10.000 combinaciones, así que hay bloqueo por intentos.
  // Los nombres que no existen no se registran (si no, se podría llenar el almacenamiento con nombres inventados).
  const previo = Object.prototype.hasOwnProperty.call(ctx.fallos, nombre) ? ctx.fallos[nombre] : null;
  if (fila && previo && previo.hasta && ctx.ahora < previo.hasta) {
    return { ok: false, error: 'bloqueado', minutos: Math.ceil((previo.hasta - ctx.ahora) / 60000) };
  }
  if (fila && fila.activo && igualesSeguras_(clave, claveNormal_(rol, fila.clave))) {
    return { ok: true, rol, nombre: fila.nombre, limpiarFallo: nombre };
  }
  if (!fila) return { ok: false, error: 'auth' };
  const vigente = previo && ctx.ahora - previo.desde <= PIN_VENTANA_MS ? previo : { n: 0, desde: ctx.ahora, hasta: 0 };
  const nuevo = { n: vigente.n + 1, desde: vigente.desde, hasta: 0 };
  if (nuevo.n >= PIN_MAX_FALLOS) {
    nuevo.hasta = ctx.ahora + PIN_BLOQUEO_MS;
    return { ok: false, error: 'bloqueado', minutos: Math.ceil(PIN_BLOQUEO_MS / 60000), fallo: { clave: nombre, valor: nuevo } };
  }
  return { ok: false, error: 'auth', fallo: { clave: nombre, valor: nuevo } };
}

function buscarJugadora_(players, nombre) {
  const buscado = nombreNormal_(nombre);
  return Object.keys(players || {}).find(n => nombreNormal_(n) === buscado) || '';
}

// Lo que recibe cada rol. El DT y el soporte reciben todo; la jugadora, solo esto:
//  - ella: todos sus datos y su historial;
//  - las compañeras: nombre, apodo, posiciones y atributos actuales (sin edad, altura, pie ni historial);
//  - partidos con sus planes de formación y tácticas guardadas;
//  - registros de partidos TERMINADOS, sin las notas del DT ni los cambios que quedaron por hacer.
// Nunca: entrenamientos (rúbricas y observaciones), simulaciones ni registros de partidos en juego.
function filtrarEstadoParaRol_(estado, sesion) {
  if (sesion.rol === ROL_DT || sesion.rol === ROL_SOPORTE) return estado;
  const yo = buscarJugadora_(estado.players, sesion.nombre);
  const players = {};
  Object.keys(estado.players || {}).forEach(name => {
    const p = estado.players[name];
    players[name] = name === yo ? p : {
      apodo: p.apodo || '', edad: '', altura: '', pieDominante: '',
      posPrincipal: p.posPrincipal || '', posSecundaria: p.posSecundaria || '',
      attrs: p.attrs, history: []
    };
  });
  const matchLogs = (estado.matchLogs || [])
    .filter(l => !l.deleted && (l.items || []).some(i => i && i.type === 'meta' && i.phase === 'end'))
    .map(l => Object.assign({}, l, {
      items: (l.items || [])
        .filter(i => !(i && i.type === 'sub' && i.status === 'pending'))
        .map(i => (i && i.type === 'event' ? Object.assign({}, i, { note: '' }) : i))
    }));
  return {
    players,
    matches: estado.matches || {},
    trainingLogs: [],
    tactics: (estado.tactics || []).filter(t => !t.deleted),
    simulations: [],
    matchLogs,
    activeMatch: estado.activeMatch || '',
    yo
  };
}

function errorAcceso_(r) {
  const out = { protegido: true, error: r.error };
  if (r.minutos) out.minutos = r.minutos;
  return out;
}

// ---- Servicios de Google (no se prueban en Node: solo juntan los datos y llaman a decidirAcceso_) ----
function readAccesos_() {
  const sheet = getOrCreateSheet_(SHEET_ACCESOS, ACCESOS_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const rol = asText_(rows[i][0]).trim().toLowerCase();
    const nombre = asText_(rows[i][1]).trim();
    if ((rol !== ROL_SOPORTE && rol !== ROL_JUGADORA) || !nombre) continue;
    let clave = asText_(rows[i][2]).trim();
    if (rol === ROL_JUGADORA && /^\d{1,3}$/.test(clave)) clave = ('0000' + clave).slice(-4); // Sheets se comió el cero de adelante
    // Solo "si" habilita: una fila cargada a mano sin esa columna no da acceso por descuido.
    list.push({ rol, nombre, clave, activo: asText_(rows[i][3]).trim().toLowerCase() === 'si' });
  }
  return list;
}

function writeAccesos_(list) {
  const sheet = getOrCreateSheet_(SHEET_ACCESOS, ACCESOS_HEADERS);
  sheet.clearContents();
  sheet.appendRow(ACCESOS_HEADERS);
  const rows = list.map(a => [a.rol, a.nombre, a.clave, a.activo ? 'si' : 'no']);
  if (rows.length) {
    const range = sheet.getRange(2, 1, rows.length, 4);
    range.setNumberFormat('@'); // texto: si no, el PIN 0123 quedaría como 123
    range.setValues(rows);
  }
}

function cargarContexto_() {
  const todas = PropertiesService.getScriptProperties().getProperties();
  const fallos = {};
  Object.keys(todas).forEach(k => {
    if (k.indexOf('fallo_') !== 0) return;
    try { fallos[k.slice(6)] = JSON.parse(todas[k]); } catch (err) { /* valor roto: se ignora */ }
  });
  return { dtKey: todas.DT_KEY || '', accesos: readAccesos_(), fallos, ahora: Date.now() };
}

function recordarFallos_(r) {
  const props = PropertiesService.getScriptProperties();
  if (r.fallo) props.setProperty('fallo_' + r.fallo.clave, JSON.stringify(r.fallo.valor));
  else if (r.limpiarFallo) props.deleteProperty('fallo_' + r.limpiarFallo);
}

function autenticar_(creds) {
  if (!creds || creds.rol !== ROL_JUGADORA) return decidirAcceso_(creds, cargarContexto_());
  // Las jugadoras entran de a una: si no, se podrían mandar muchos intentos a la vez antes de que el bloqueo los cuente.
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (err) { return { ok: false, error: 'ocupado' }; }
  try {
    const r = decidirAcceso_(creds, cargarContexto_());
    recordarFallos_(r);
    return r;
  } finally {
    lock.releaseLock();
  }
}

function generarClave_(rol) {
  const uuid = Utilities.getUuid().replace(/-/g, '');
  if (rol === ROL_JUGADORA) return ('0000' + (parseInt(uuid.slice(0, 8), 16) % 10000)).slice(-4);
  return uuid.slice(0, 16).replace(/(.{4})(?=.)/g, '$1-'); // por ejemplo a1b2-c3d4-e5f6-a7b8
}

// Solo el DT: listar, generar o regenerar, activar/desactivar y quitar accesos. Devuelve siempre la lista al día.
function gestionarAccesos_(acceso, p) {
  if (acceso.rol !== ROL_DT) return { protegido: true, error: 'permiso' };
  const rolAcceso = String(p.rolAcceso || '');
  const para = String(p.para || '').trim();
  const lista = readAccesos_();
  const mismo = a => a.rol === rolAcceso && nombreNormal_(a.nombre) === nombreNormal_(para);
  if (p.accion !== 'accesos_listar') {
    if ((rolAcceso !== ROL_JUGADORA && rolAcceso !== ROL_SOPORTE) || !para || para.length > 60) return { protegido: true, error: 'datos' };
    const idx = lista.findIndex(mismo);
    if (p.accion === 'acceso_generar') {
      const clave = generarClave_(rolAcceso);
      if (idx >= 0) { lista[idx].clave = clave; lista[idx].activo = true; } else lista.push({ rol: rolAcceso, nombre: para, clave, activo: true });
    } else if (p.accion === 'acceso_activar') {
      if (idx < 0) return { protegido: true, error: 'datos' };
      lista[idx].activo = p.activo === 'si';
    } else if (p.accion === 'acceso_quitar') {
      if (idx >= 0) lista.splice(idx, 1);
    } else {
      return { protegido: true, error: 'accion' };
    }
    writeAccesos_(lista);
    PropertiesService.getScriptProperties().deleteProperty('fallo_' + nombreNormal_(para)); // cambiar un acceso también lo desbloquea
  }
  return { protegido: true, accesos: lista };
}

function getOrCreateSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

// ---- Jugadoras ----
// Primero las columnas de identidad/texto (JUGADORAS_TEXT_HEADERS),
// después los atributos (numéricos).
const JUGADORAS_TEXT_HEADERS = ['Nombre', 'Apodo', 'Edad', 'Altura', 'PieDominante', 'PosPrincipal', 'PosSecundaria'];
const JUGADORAS_HEADERS = JUGADORAS_TEXT_HEADERS.concat(ATTRIBUTES);

function readPlayers_() {
  const sheet = getOrCreateSheet_(SHEET_JUGADORAS, JUGADORAS_HEADERS);
  const rows = sheet.getDataRange().getValues();
  if (!rows.length) return {};

  // Cada columna se busca por el nombre de su encabezado, no por posición
  // fija: así una Sheet con el formato viejo (sin Apodo/Edad/Altura/PieDominante)
  // se sigue leyendo bien, y el orden de columnas puede cambiar sin romper nada.
  const col = {};
  rows[0].forEach((header, idx) => { col[header] = idx; });
  const cell = (row, header) => (header in col ? row[col[header]] : '');

  const players = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = cell(row, 'Nombre');
    if (!name) continue;
    const attrs = {};
    ATTRIBUTES.forEach(attr => { attrs[attr] = Number(cell(row, attr)) || 5; });
    players[name] = {
      apodo: cell(row, 'Apodo') || '',
      edad: cell(row, 'Edad') || '',
      altura: cell(row, 'Altura') || '',
      pieDominante: cell(row, 'PieDominante') || '',
      posPrincipal: cell(row, 'PosPrincipal') || '',
      posSecundaria: cell(row, 'PosSecundaria') || '',
      attrs
    };
  }
  return players;
}

function writePlayers_(players) {
  const sheet = getOrCreateSheet_(SHEET_JUGADORAS, JUGADORAS_HEADERS);
  sheet.clearContents();
  sheet.appendRow(JUGADORAS_HEADERS);
  const rows = Object.keys(players).map(name => {
    const p = players[name];
    return [
      name, p.apodo || '', p.edad || '', p.altura || '', p.pieDominante || '',
      p.posPrincipal || '', p.posSecundaria || ''
    ].concat(ATTRIBUTES.map(attr => (p.attrs && p.attrs[attr]) || 5));
  });
  if (rows.length) {
    // Columnas de texto como texto plano: sin esto Sheets puede "interpretar"
    // un apodo tipo "1-2" como fecha. Los atributos quedan numéricos.
    sheet.getRange(2, 1, rows.length, JUGADORAS_TEXT_HEADERS.length).setNumberFormat('@');
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
}

// ---- Historial (una "foto" de los atributos por jugadora, con fecha y etiqueta) ----
// Se guarda solo cuando el DT aprieta "Guardar evaluación" en la app —
// no en cada cambio de slider — así que acá no hay lógica, es un volcado
// directo de lo que manda el cliente en players[nombre].history.
function attachHistory_(players) {
  Object.keys(players).forEach(name => { players[name].history = []; });
  const sheet = getOrCreateSheet_(SHEET_HISTORIAL, ['Jugadora', 'Fecha', 'Etiqueta'].concat(ATTRIBUTES));
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const name = rows[i][0];
    if (!name || !players[name]) continue;
    const attrs = {};
    ATTRIBUTES.forEach((attr, idx) => { attrs[attr] = Number(rows[i][3 + idx]) || 0; });
    players[name].history.push({ date: rows[i][1] || '', label: rows[i][2] || '', attrs });
  }
}

function writeHistory_(players) {
  const sheet = getOrCreateSheet_(SHEET_HISTORIAL, ['Jugadora', 'Fecha', 'Etiqueta'].concat(ATTRIBUTES));
  sheet.clearContents();
  sheet.appendRow(['Jugadora', 'Fecha', 'Etiqueta'].concat(ATTRIBUTES));
  const rows = [];
  Object.keys(players).forEach(name => {
    (players[name].history || []).forEach(entry => {
      rows.push([name, entry.date || '', entry.label || ''].concat(
        ATTRIBUTES.map(attr => (entry.attrs && entry.attrs[attr]) || 0)
      ));
    });
  });
  if (rows.length) {
    const range = sheet.getRange(2, 1, rows.length, rows[0].length);
    range.setNumberFormat('@');
    range.setValues(rows);
  }
}

// ---- Entrenamientos (rúbrica manual por posición, no toca atributos) ----
function readTrainingLogs_() {
  const headers = ['Fecha', 'Posicion', 'Jugadora'].concat(RUBRIC_KEYS, ['Observaciones']);
  const sheet = getOrCreateSheet_(SHEET_ENTRENAMIENTOS, headers);
  const rows = sheet.getDataRange().getValues();
  const logs = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[1]) continue; // sin posición, no es un registro válido
    const scores = {};
    RUBRIC_KEYS.forEach((key, idx) => { scores[key] = Number(row[3 + idx]) || 0; });
    logs.push({
      date: row[0] || '',
      position: row[1] || '',
      player: row[2] || '',
      scores,
      notes: row[3 + RUBRIC_KEYS.length] || ''
    });
  }
  return logs;
}

function writeTrainingLogs_(logs) {
  const headers = ['Fecha', 'Posicion', 'Jugadora'].concat(RUBRIC_KEYS, ['Observaciones']);
  const sheet = getOrCreateSheet_(SHEET_ENTRENAMIENTOS, headers);
  sheet.clearContents();
  sheet.appendRow(headers);
  const rows = (logs || []).map(entry => {
    return [entry.date || '', entry.position || '', entry.player || '']
      .concat(RUBRIC_KEYS.map(key => (entry.scores && entry.scores[key]) || 0))
      .concat([entry.notes || '']);
  });
  if (rows.length) {
    const range = sheet.getRange(2, 1, rows.length, rows[0].length);
    range.setNumberFormat('@'); // evita que Sheets confunda fechas/posiciones con otros tipos
    range.setValues(rows);
  }
}

// ---- Tácticas, Simulaciones y Partidos en vivo (solapas Táctica y Simulación, y la barra "En vivo" de Formación) ----
// Las tres hojas tienen el mismo formato, así que comparten el código: una fila
// por elemento con Id, Nombre, Creada, Actualizada, Eliminada y después el
// dibujo (los "items") en formato JSON. Una celda de Sheets aguanta hasta
// 50.000 caracteres, así que si el dibujo es muy grande se reparte en varias
// columnas (Datos, Datos2, ...) y al leer se vuelven a unir.
// Eliminar es "blando": la fila queda con Eliminada = "si" y sin dibujo, para
// que una copia vieja de la app no la haga reaparecer.
const DIBUJOS_FIXED_HEADERS = ['Id', 'Nombre', 'Creada', 'Actualizada', 'Eliminada'];
const DIBUJOS_CHUNK = 40000;

function asText_(value) {
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? '' : String(value);
}

function readDrawings_(sheetName) {
  const sheet = getOrCreateSheet_(sheetName, DIBUJOS_FIXED_HEADERS.concat(['Datos']));
  const rows = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;
    let items = [];
    try {
      items = JSON.parse(row.slice(DIBUJOS_FIXED_HEADERS.length).map(asText_).join('') || '[]');
    } catch (err) {
      items = [];
    }
    list.push({
      id: asText_(row[0]),
      name: asText_(row[1]),
      createdAt: asText_(row[2]),
      updatedAt: asText_(row[3]),
      deleted: asText_(row[4]) === 'si',
      items: Array.isArray(items) ? items : []
    });
  }
  return list;
}

function writeDrawings_(sheetName, list) {
  const sheet = getOrCreateSheet_(sheetName, DIBUJOS_FIXED_HEADERS.concat(['Datos']));
  sheet.clearContents();

  const rows = (list || []).map(t => {
    const json = t.deleted ? '[]' : JSON.stringify(t.items || []);
    const row = [t.id || '', t.name || '', t.createdAt || '', t.updatedAt || '', t.deleted ? 'si' : ''];
    for (let start = 0; start < json.length; start += DIBUJOS_CHUNK) {
      row.push(json.slice(start, start + DIBUJOS_CHUNK));
    }
    return row;
  });

  const width = rows.reduce((max, r) => Math.max(max, r.length), DIBUJOS_FIXED_HEADERS.length + 1);
  const header = DIBUJOS_FIXED_HEADERS.slice();
  for (let c = DIBUJOS_FIXED_HEADERS.length; c < width; c++) {
    header.push(c === DIBUJOS_FIXED_HEADERS.length ? 'Datos' : 'Datos' + (c - DIBUJOS_FIXED_HEADERS.length + 1));
  }
  sheet.getRange(1, 1, 1, width).setValues([header]);

  if (rows.length) {
    const padded = rows.map(r => r.concat(new Array(width - r.length).fill('')));
    const range = sheet.getRange(2, 1, padded.length, width);
    range.setNumberFormat('@'); // texto plano: evita que Sheets interprete fechas o fórmulas
    range.setValues(padded);
  }
}

function readTactics_() { return readDrawings_(SHEET_TACTICAS); }
function writeTactics_(tactics) { writeDrawings_(SHEET_TACTICAS, tactics); }
function readSimulations_() { return readDrawings_(SHEET_SIMULACIONES); }
function writeSimulations_(simulations) { writeDrawings_(SHEET_SIMULACIONES, simulations); }
// Partido en vivo: un registro por partido (Id = el del partido, Nombre = el rival) con el reloj, las jugadas y los
// cambios como items en JSON (ver sanitizeLogItems en js/app.js).
function readMatchLogs_() { return readDrawings_(SHEET_PARTIDOS_VIVO); }
function writeMatchLogs_(logs) { writeDrawings_(SHEET_PARTIDOS_VIVO, logs); }

// ---- Partidos (rival + fecha + qué forma tiene activa cada Plan) ----
// ---- Formación (placements: Partido x Plan x forma táctica x jugadora) ----
function readMatches_() {
  const partidosHeaders = ['MatchId', 'Rival', 'Fecha', 'ActivePlan']
    .concat(PLAN_NAMES.map(p => 'Formacion' + p.replace(/\s+/g, '')));
  const partidosSheet = getOrCreateSheet_(SHEET_PARTIDOS, partidosHeaders);
  const partidosRows = partidosSheet.getDataRange().getValues();

  const matches = {};
  for (let i = 1; i < partidosRows.length; i++) {
    const row = partidosRows[i];
    const matchId = row[0];
    if (!matchId) continue;
    const plans = {};
    PLAN_NAMES.forEach((planName, idx) => {
      plans[planName] = { activeFormation: row[4 + idx] || DEFAULT_FORMATION, formations: {} };
    });
    matches[matchId] = {
      rival: row[1] || '',
      date: row[2] || '',
      activePlan: row[3] || PLAN_NAMES[0],
      plans
    };
  }

  const formSheet = getOrCreateSheet_(SHEET_FORMACION, ['MatchId', 'Plan', 'Formacion', 'Jugadora', 'X', 'Y']);
  const formRows = formSheet.getDataRange().getValues();
  for (let i = 1; i < formRows.length; i++) {
    const matchId = formRows[i][0];
    const plan = formRows[i][1];
    const formation = formRows[i][2];
    const player = formRows[i][3];
    const x = formRows[i][4];
    const y = formRows[i][5];
    if (!matchId || !plan || !formation || !player) continue;
    if (!matches[matchId] || !matches[matchId].plans[plan]) continue;
    if (!matches[matchId].plans[plan].formations[formation]) {
      matches[matchId].plans[plan].formations[formation] = { placements: {} };
    }
    matches[matchId].plans[plan].formations[formation].placements[player] = { x: Number(x), y: Number(y) };
  }

  return matches;
}

function writeMatches_(matches) {
  const partidosHeaders = ['MatchId', 'Rival', 'Fecha', 'ActivePlan']
    .concat(PLAN_NAMES.map(p => 'Formacion' + p.replace(/\s+/g, '')));
  const partidosSheet = getOrCreateSheet_(SHEET_PARTIDOS, partidosHeaders);
  partidosSheet.clearContents();
  partidosSheet.appendRow(partidosHeaders);

  const formSheet = getOrCreateSheet_(SHEET_FORMACION, ['MatchId', 'Plan', 'Formacion', 'Jugadora', 'X', 'Y']);
  formSheet.clearContents();
  formSheet.appendRow(['MatchId', 'Plan', 'Formacion', 'Jugadora', 'X', 'Y']);

  const partidoRows = [];
  const formRows = [];

  Object.keys(matches).forEach(matchId => {
    const match = matches[matchId];
    const plans = match.plans || {};

    const row = [matchId, match.rival || '', match.date || '', match.activePlan || PLAN_NAMES[0]];
    PLAN_NAMES.forEach(planName => {
      row.push((plans[planName] && plans[planName].activeFormation) || DEFAULT_FORMATION);
    });
    partidoRows.push(row);

    PLAN_NAMES.forEach(planName => {
      const formations = (plans[planName] && plans[planName].formations) || {};
      Object.keys(formations).forEach(shapeName => {
        const placements = formations[shapeName].placements || {};
        Object.keys(placements).forEach(player => {
          const pos = placements[player];
          formRows.push([matchId, planName, shapeName, player, pos.x, pos.y]);
        });
      });
    });
  });

  if (partidoRows.length) {
    const range = partidosSheet.getRange(2, 1, partidoRows.length, partidoRows[0].length);
    // Sin esto, Sheets "adivina" que "2-3-2" es una fecha (2 de marzo) y la reescribe sola.
    range.setNumberFormat('@');
    range.setValues(partidoRows);
  }
  if (formRows.length) {
    const range = formSheet.getRange(2, 1, formRows.length, 6);
    range.setNumberFormat('@');
    range.setValues(formRows);
  }
}

// ---- Meta (config simple clave/valor) ----
function readMeta_(key) {
  const sheet = getOrCreateSheet_(SHEET_META, ['Clave', 'Valor']);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === key) return rows[i][1];
  }
  return null;
}

function writeMeta_(key, value) {
  const sheet = getOrCreateSheet_(SHEET_META, ['Clave', 'Valor']);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === key) {
      const cell = sheet.getRange(i + 1, 2);
      cell.setNumberFormat('@'); // idem: evita que se guarde como fecha
      cell.setValue(value);
      return;
    }
  }
  const range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, 2);
  range.setNumberFormat('@');
  range.setValues([[key, value]]);
}
