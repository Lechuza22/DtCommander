/**
 * DTCommander — backend de Google Apps Script.
 *
 * Cómo instalarlo (una sola vez, ver SETUP.md para el paso a paso):
 * 1. Abrí la Google Sheet → Extensiones → Apps Script.
 * 2. Borrá el contenido de Code.gs y pegá todo este archivo.
 * 3. Implementar → Nueva implementación → tipo "Aplicación web".
 *      - Ejecutar como: Yo
 *      - Quién tiene acceso: Cualquier usuario
 * 4. Copiá la URL que te da y pegala en SHEET_API_URL,
 *    en js/sheets-integration.js.
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
const SHEET_META = 'Meta';

function doGet(e) {
  const players = readPlayers_();
  attachHistory_(players);
  const matches = readMatches_();
  const trainingLogs = readTrainingLogs_();
  const activeMatch = readMeta_('activeMatch') || '';
  return jsonResponse_({ players, matches, trainingLogs, activeMatch });
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  writePlayers_(body.players || {});
  writeHistory_(body.players || {});
  writeMatches_(body.matches || {});
  writeTrainingLogs_(body.trainingLogs || []);
  writeMeta_('activeMatch', body.activeMatch || '');
  return jsonResponse_({ ok: true });
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
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
function readPlayers_() {
  const sheet = getOrCreateSheet_(SHEET_JUGADORAS, ['Nombre', 'PosPrincipal', 'PosSecundaria'].concat(ATTRIBUTES));
  const rows = sheet.getDataRange().getValues();
  const players = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = row[0];
    if (!name) continue;
    const attrs = {};
    ATTRIBUTES.forEach((attr, idx) => { attrs[attr] = Number(row[3 + idx]) || 5; });
    players[name] = { posPrincipal: row[1] || '', posSecundaria: row[2] || '', attrs };
  }
  return players;
}

function writePlayers_(players) {
  const sheet = getOrCreateSheet_(SHEET_JUGADORAS, ['Nombre', 'PosPrincipal', 'PosSecundaria'].concat(ATTRIBUTES));
  sheet.clearContents();
  sheet.appendRow(['Nombre', 'PosPrincipal', 'PosSecundaria'].concat(ATTRIBUTES));
  const rows = Object.keys(players).map(name => {
    const p = players[name];
    return [name, p.posPrincipal || '', p.posSecundaria || ''].concat(
      ATTRIBUTES.map(attr => (p.attrs && p.attrs[attr]) || 5)
    );
  });
  if (rows.length) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
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
