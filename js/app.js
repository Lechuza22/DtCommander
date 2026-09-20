// ==================================================================
// DTCommander — configuración editable
// (mismo espíritu que documenta el README: tocá estos arrays y la
// UI se actualiza sola. Si agregás/sacás un atributo, replicá el
// cambio en data/google-apps-script.js para que la Sheet coincida.)
// ==================================================================
const ATTRIBUTES = [
  'Técnica', 'Pegada', 'Defensa', 'Ataque', 'Regate',
  'Cabeceo', 'Velocidad', 'Visión', 'Posicionamiento', 'Mentalidad', 'Portería'
];

const POSITIONS = ['Arquera', 'Defensa', 'Mediocampo', 'Delantera'];

const PIE_DOMINANTE_OPTIONS = ['Derecho', 'Izquierdo', 'Ambos'];

const POSITION_COLORS = {
  'Arquera': '#d4a017',
  'Defensa': '#185FA5',
  'Mediocampo': '#7c3aed',
  'Delantera': '#a32d2d'
};
const NO_POSITION_COLOR = '#7a8699';

function colorForPosition(pos) {
  return POSITION_COLORS[pos] || NO_POSITION_COLOR;
}

// Contenido de referencia (no son datos de ninguna jugadora): actividades
// sugeridas por posición, agrupadas por tipo de trabajo.
const TRAINING_SUGGESTIONS = {
  'Arquera': {
    'Técnica': [
      'Recepción en W (control de manos altas)',
      'Despejes con los puños bajo presión',
      'Salidas en 1v1 achicando el ángulo',
      'Colocación bajo los tres palos ante centros'
    ],
    'Táctico': [
      'Lectura de centros y anticipación de córners',
      'Comunicación y organización de la línea defensiva',
      'Decisión de salir vs. quedarse en el arco'
    ],
    'Físico': [
      'Reflejos con conos y pelota lanzada de cerca',
      'Agilidad lateral con escalera de coordinación',
      'Pliometría suave para saltabilidad'
    ],
    'Estrategia': [
      'Relanzamiento rápido tras atajar (transición ofensiva)',
      'Ensayo de penales y tiros libres cercanos'
    ]
  },
  'Defensa': {
    'Técnica': [
      'Despeje limpio de primera',
      'Entradas y anticipación (timing)',
      'Cabeceo defensivo de altura',
      'Pase corto bajo presión rival'
    ],
    'Táctico': [
      'Marca al hombre vs. marca zonal',
      'Achique de línea y coordinación del offside',
      'Coberturas cuando un compañero sale a presionar',
      'Salida jugada desde el fondo'
    ],
    'Físico': [
      'Fuerza en el choque (duelos 1v1)',
      'Arranques cortos y cambios de dirección',
      'Resistencia a la repetición de sprints'
    ],
    'Estrategia': [
      'Lectura de la jugada para anticipar el pase rival',
      'Comunicación y organización de la línea'
    ]
  },
  'Mediocampo': {
    'Técnica': [
      'Control orientado bajo presión',
      'Pase largo y pase corto con precisión',
      'Cambio de frente',
      'Recuperación con entradas limpias'
    ],
    'Táctico': [
      'Manejo de los tiempos del partido',
      'Apoyo entre líneas (recibir de espaldas y girar)',
      'Transición rápida defensa-ataque'
    ],
    'Físico': [
      'Resistencia aeróbica (llegar entera al final del partido)',
      'Cambios de ritmo en carrera'
    ],
    'Estrategia': [
      'Visión de juego: pase con presión y decisión rápida',
      'Liderazgo y organización del equipo en cancha'
    ]
  },
  'Delantera': {
    'Técnica': [
      'Definición de derecha e izquierda',
      'Control orientado hacia el arco',
      'Regate 1v1 en velocidad',
      'Cabeceo ofensivo al gol'
    ],
    'Táctico': [
      'Desmarques para romper la línea defensiva',
      'Juego de espaldas al arco',
      'Asociación rápida con el mediocampo'
    ],
    'Físico': [
      'Velocidad explosiva en arrancadas cortas',
      'Potencia de remate',
      'Salto para el juego aéreo'
    ],
    'Estrategia': [
      'Definición en frío: ensayo de situaciones de gol',
      'Lectura de rebotes y segundas jugadas'
    ]
  }
};

// Rúbrica 1-5 para evaluar (no aplicar automáticamente) el entrenamiento.
// Las 5 dimensiones son las mismas para toda posición (para poder comparar
// "Técnica" entre puestos), pero lo que describe cada una es específico
// del puesto — ver RUBRIC_LABELS_BY_POSITION. Si se agrega o saca una
// dimensión, replicar RUBRIC_DIMENSIONS en data/google-apps-script.js
// (RUBRIC_KEYS) para que las columnas coincidan.
const RUBRIC_DIMENSIONS = ['tecnica', 'tactica', 'presion', 'actitud', 'fisico'];

const RUBRIC_DIMENSION_NAMES = {
  tecnica: 'Técnica',
  tactica: 'Táctica',
  presion: 'Bajo presión',
  actitud: 'Actitud',
  fisico: 'Físico'
};

const RUBRIC_LABELS_BY_POSITION = {
  'Arquera': {
    tecnica: 'Manos y recepción (pelotas altas y rasas)',
    tactica: 'Salidas y achique del arco',
    presion: 'Reflejos y reacción en el mano a mano',
    actitud: 'Comunicación y organización de la defensa',
    fisico: 'Agilidad y explosividad'
  },
  'Defensa': {
    tecnica: 'Despeje y juego aéreo defensivo',
    tactica: 'Marca, cobertura y posicionamiento de línea',
    presion: 'Salida jugada bajo presión rival',
    actitud: 'Comunicación y liderazgo defensivo',
    fisico: 'Duelos y velocidad de recuperación'
  },
  'Mediocampo': {
    tecnica: 'Pase corto y largo',
    tactica: 'Visión de juego y cambio de frente',
    presion: 'Recuperación y entradas bajo presión',
    actitud: 'Manejo de los tiempos del partido',
    fisico: 'Resistencia y cambios de ritmo'
  },
  'Delantera': {
    tecnica: 'Definición y control orientado',
    tactica: 'Desmarque y juego de espaldas',
    presion: 'Definición bajo marca',
    actitud: 'Asociación y trabajo con el equipo',
    fisico: 'Velocidad explosiva y juego aéreo ofensivo'
  }
};

function rubricLabel(position, dimension) {
  return (RUBRIC_LABELS_BY_POSITION[position] && RUBRIC_LABELS_BY_POSITION[position][dimension]) || dimension;
}

const FORMATION_PRESETS = {
  '2-3-2': [
    { slot: 'A', x: 150, y: 370 },
    { slot: 'D1', x: 90, y: 300 },
    { slot: 'D2', x: 210, y: 300 },
    { slot: 'M1', x: 60, y: 220 },
    { slot: 'M2', x: 150, y: 220 },
    { slot: 'M3', x: 240, y: 220 },
    { slot: 'F1', x: 100, y: 130 },
    { slot: 'F2', x: 200, y: 130 }
  ],
  '3-2-2': [
    { slot: 'A', x: 150, y: 370 },
    { slot: 'D1', x: 70, y: 300 },
    { slot: 'D2', x: 150, y: 300 },
    { slot: 'D3', x: 230, y: 300 },
    { slot: 'M1', x: 100, y: 210 },
    { slot: 'M2', x: 200, y: 210 },
    { slot: 'F1', x: 100, y: 120 },
    { slot: 'F2', x: 200, y: 120 }
  ],
  '2-2-3': [
    { slot: 'A', x: 150, y: 370 },
    { slot: 'D1', x: 90, y: 300 },
    { slot: 'D2', x: 210, y: 300 },
    { slot: 'M1', x: 100, y: 220 },
    { slot: 'M2', x: 200, y: 220 },
    { slot: 'F1', x: 70, y: 130 },
    { slot: 'F2', x: 150, y: 120 },
    { slot: 'F3', x: 230, y: 130 }
  ],
  // Sin posiciones por defecto: arranca vacía y se arma solo arrastrando.
  'Libre': []
};

const PLANS = ['Plan A', 'Plan B', 'Plan C'];
const DEFAULT_PLAYERS = ['Ine', 'Agos'];
const STORAGE_KEY = 'dtcomander_data';
const FIELD_BOUNDS = { minX: 10, maxX: 290, minY: 10, maxY: 390 };

// ==================================================================
// Estado
// ==================================================================
function emptyAttrs() {
  const a = {};
  ATTRIBUTES.forEach(name => { a[name] = 5; });
  return a;
}

function makeEmptyPlayer() {
  return {
    attrs: emptyAttrs(),
    posPrincipal: '',
    posSecundaria: '',
    apodo: '',
    edad: '',
    altura: '',
    pieDominante: '',
    history: []
  };
}

// Los atributos se GUARDAN de 1 a 10 (en pasos de 0,5) — así están en la
// Sheet y así se comparan con el cuestionario de autoevaluación — pero se
// MUESTRAN de 1 a 100 (×10). Todo lo que se ve en pantalla pasa por acá;
// lo guardado nunca se convierte.
const SCORE_SCALE = 10;

// Valor guardado (1-10) -> valor mostrado (1-100), con un decimal como mucho
// (evita ruidos de coma flotante tipo 73.00000000000001 en promedios).
function toScore(raw) {
  return Math.round(Number(raw) * SCORE_SCALE * 10) / 10;
}

// Ya en escala 1-100: entero si se puede, si no un decimal con coma (52,7).
function formatScore(score) {
  const n = Number(score);
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

// Recibe el valor guardado (1-10) y lo muestra en escala 1-100.
function formatAttrValue(raw) {
  return formatScore(toScore(raw));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return (y && m && d) ? `${d}/${m}/${y}` : iso;
}

function matchLabel(match) {
  const rivalText = match.rival ? `vs ${match.rival}` : 'Partido sin rival';
  const dateText = formatDateDisplay(match.date);
  return dateText ? `${rivalText} — ${dateText}` : rivalText;
}

function average(attrs) {
  return ATTRIBUTES.reduce((sum, a) => sum + (attrs[a] || 0), 0) / ATTRIBUTES.length;
}

// Escala de "temperatura" de los atributos. Los cortes están en el valor
// GUARDADO (1-10); en la escala que se ve (1-100) son: 0-29 rojo, 30-49
// naranja, 50-69 amarillo, 70-79 verde claro, 80-89 verde oscuro, 90-100
// celeste. Nada que ver con colorForPosition (esa es por puesto, esta es
// por valor del atributo).
const ATTR_VALUE_COLORS = [
  { min: 9, color: '#38bdf8' },  // celeste
  { min: 8, color: '#15803d' },  // verde oscuro
  { min: 7, color: '#4ade80' },  // verde claro
  { min: 5, color: '#eab308' },  // amarillo
  { min: 3, color: '#f97316' },  // naranja
  { min: -Infinity, color: '#dc2626' } // rojo
];

function colorForAttrValue(value) {
  return ATTR_VALUE_COLORS.find(band => value >= band.min).color;
}

function applyPresetToPlacements(formationName, playerNames) {
  const preset = FORMATION_PRESETS[formationName];
  const placements = {};
  preset.forEach((slot, i) => {
    if (playerNames[i]) placements[playerNames[i]] = { x: slot.x, y: slot.y };
  });
  return placements;
}

// Un "plan" (Plan A/B/C) es un tablero independiente: qué forma táctica
// tiene activa, y las ubicaciones guardadas para cada una de las 4 formas.
// Arranca siempre vacío (como "Libre") — el DT elige a mano quién juega;
// para autocompletar un preset está el botón "Restablecer a preset".
function makeEmptyPlan() {
  const formations = {};
  Object.keys(FORMATION_PRESETS).forEach(name => { formations[name] = { placements: {} }; });
  return { activeFormation: '2-3-2', formations };
}

// Un "partido" agrupa sus propios Plan A/B/C, identificado por rival + fecha.
function makeMatch(rival, date) {
  const plans = {};
  PLANS.forEach(planName => { plans[planName] = makeEmptyPlan(); });
  return { rival: rival || '', date: date || todayISO(), activePlan: PLANS[0], plans };
}

function defaultState() {
  const players = {};
  DEFAULT_PLAYERS.forEach(name => {
    players[name] = makeEmptyPlayer();
  });
  const matchId = 'm' + Date.now();
  const match = makeMatch('', todayISO());
  // Solo en la demo inicial (plantel de ejemplo) dejamos el 2-3-2 ya armado.
  match.plans['Plan A'].formations['2-3-2'].placements = applyPresetToPlacements('2-3-2', DEFAULT_PLAYERS);
  const matches = { [matchId]: match };
  return { players, matches, activeMatch: matchId, trainingLogs: [] };
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Si es un formato viejo (de antes de Partidos/Plan A-B-C) o algo corrupto,
    // lo descartamos: mejor arrancar de cero y dejar que hydrate() traiga lo real
    // de la Sheet, que romper el render o pisar la Sheet con datos incompletos.
    if (!parsed || typeof parsed !== 'object' || !parsed.players || !parsed.matches || !parsed.activeMatch) {
      return null;
    }
    return parsed;
  } catch (err) {
    return null;
  }
}

let state = loadLocal() || defaultState();
let currentPlayer = Object.keys(state.players)[0] || null;
let radarChart = null;

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (err) { /* localStorage no disponible */ }
  if (window.SheetsSync) window.SheetsSync.scheduleSync(state);
}

// Ambos son "autocurativos": si el partido o el plan activo quedaron
// apuntando a algo que no existe (estado viejo, corrupto, o a medio
// migrar), se recuperan solos en vez de tirar abajo el render entero.
function currentMatch() {
  if (!state.matches[state.activeMatch]) {
    const ids = Object.keys(state.matches);
    if (ids.length) {
      state.activeMatch = ids[0];
    } else {
      const newId = 'm' + Date.now();
      state.matches[newId] = makeMatch('', todayISO());
      state.activeMatch = newId;
    }
  }
  return state.matches[state.activeMatch];
}

function currentPlan() {
  const match = currentMatch();
  if (!match.plans[match.activePlan]) {
    match.activePlan = Object.keys(match.plans)[0] || PLANS[0];
    if (!match.plans[match.activePlan]) match.plans[match.activePlan] = makeEmptyPlan();
  }
  return match.plans[match.activePlan];
}

function removePlayerFromAllBoards(name) {
  Object.values(state.matches).forEach(match => {
    Object.values(match.plans).forEach(plan => {
      Object.values(plan.formations).forEach(f => { delete f.placements[name]; });
    });
  });
}

// ==================================================================
// Init
// ==================================================================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    setupTabs();
    setupEvaluador();
    setupFormacion();
    setupDashboard();
    setupEntrenamiento();
    renderAll();
  } catch (err) {
    // Si el render local falla (p. ej. estado viejo en localStorage), no
    // dejamos que eso tape el intento de traer los datos reales de la Sheet.
    console.error('Error al renderizar el estado local:', err);
  }

  if (window.SheetsSync) {
    try {
      const remote = await window.SheetsSync.hydrate();
      if (remote && remote.players && Object.keys(remote.players).length) {
        state = normalizeRemoteState(remote);
        currentPlayer = Object.keys(state.players)[0] || null;
        renderAll();
      }
    } catch (err) {
      console.error('Error al sincronizar con Google Sheets:', err);
    }
  }
});

function normalizeRemoteState(remote) {
  const matches = {};
  Object.keys(remote.matches || {}).forEach(matchId => {
    const remoteMatch = remote.matches[matchId] || {};
    const plans = {};
    PLANS.forEach(planName => {
      const remotePlan = remoteMatch.plans && remoteMatch.plans[planName];
      const formations = {};
      Object.keys(FORMATION_PRESETS).forEach(shapeName => {
        formations[shapeName] = (remotePlan && remotePlan.formations && remotePlan.formations[shapeName])
          ? remotePlan.formations[shapeName]
          : { placements: {} };
      });
      plans[planName] = {
        activeFormation: (remotePlan && remotePlan.activeFormation && formations[remotePlan.activeFormation])
          ? remotePlan.activeFormation
          : Object.keys(FORMATION_PRESETS)[0],
        formations
      };
    });
    matches[matchId] = {
      rival: remoteMatch.rival || '',
      date: remoteMatch.date || '',
      activePlan: (remoteMatch.activePlan && plans[remoteMatch.activePlan]) ? remoteMatch.activePlan : PLANS[0],
      plans
    };
  });

  let activeMatch = (remote.activeMatch && matches[remote.activeMatch]) ? remote.activeMatch : Object.keys(matches)[0];

  if (!activeMatch) {
    const newId = 'm' + Date.now();
    matches[newId] = makeMatch('', todayISO());
    activeMatch = newId;
  }

  return { players: remote.players || {}, matches, activeMatch, trainingLogs: remote.trainingLogs || [] };
}

function renderAll() {
  renderPlayerSelect();
  renderEvaluador();
  renderFormacion();
  renderDashboard();
  renderEntrenamiento();
}

// ==================================================================
// Tabs
// ==================================================================
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'panel-formacion') renderFormacion();
      if (btn.dataset.tab === 'panel-jugadora') renderDashboard();
      if (btn.dataset.tab === 'panel-entrenamiento') renderEntrenamiento();
    });
  });
}

// ==================================================================
// Evaluador
// ==================================================================
function setupEvaluador() {
  document.getElementById('playerSelect').addEventListener('change', e => {
    currentPlayer = e.target.value;
    renderEvaluador();
  });

  const addForm = document.getElementById('addPlayerForm');
  const newNameInput = document.getElementById('newPlayerName');
  const addPlayerError = document.getElementById('addPlayerError');

  document.getElementById('addPlayerBtn').addEventListener('click', () => {
    addForm.hidden = !addForm.hidden;
    if (!addForm.hidden) {
      newNameInput.value = '';
      addPlayerError.textContent = '';
      newNameInput.focus();
    }
  });

  document.getElementById('cancelAddPlayerBtn').addEventListener('click', () => {
    addForm.hidden = true;
  });

  function confirmAddPlayer() {
    const clean = newNameInput.value.trim();
    addPlayerError.textContent = '';
    if (!clean) { newNameInput.focus(); return; }
    if (state.players[clean]) {
      addPlayerError.textContent = `Ya existe una jugadora llamada "${clean}".`;
      return;
    }
    state.players[clean] = makeEmptyPlayer();
    currentPlayer = clean;
    addForm.hidden = true;
    saveState();
    renderPlayerSelect();
    renderEvaluador();
  }

  document.getElementById('confirmAddPlayerBtn').addEventListener('click', confirmAddPlayer);
  newNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmAddPlayer();
    if (e.key === 'Escape') { addForm.hidden = true; }
  });

  const removeBtn = document.getElementById('removePlayerBtn');
  let removeArmed = false;
  let removeArmedTimer = null;

  removeBtn.addEventListener('click', () => {
    if (!currentPlayer) return;
    if (!removeArmed) {
      removeArmed = true;
      removeBtn.textContent = '¿Seguro? Tocá de nuevo';
      clearTimeout(removeArmedTimer);
      removeArmedTimer = setTimeout(() => {
        removeArmed = false;
        removeBtn.textContent = 'Eliminar';
      }, 3000);
      return;
    }
    removeArmed = false;
    clearTimeout(removeArmedTimer);
    removeBtn.textContent = 'Eliminar';

    delete state.players[currentPlayer];
    removePlayerFromAllBoards(currentPlayer);
    currentPlayer = Object.keys(state.players)[0] || null;
    saveState();
    renderPlayerSelect();
    renderEvaluador();
    renderFormacion();
  });

  document.getElementById('posPrincipal').addEventListener('change', e => {
    if (!currentPlayer) return;
    state.players[currentPlayer].posPrincipal = e.target.value;
    saveState();
  });

  document.getElementById('posSecundaria').addEventListener('change', e => {
    if (!currentPlayer) return;
    state.players[currentPlayer].posSecundaria = e.target.value;
    saveState();
  });

  // Datos básicos (apodo, edad, altura, pie dominante): se guardan tal cual,
  // sin validaciones más allá de los límites de cada input en el HTML.
  [
    ['playerApodo', 'apodo'],
    ['playerEdad', 'edad'],
    ['playerAltura', 'altura'],
    ['playerPieDominante', 'pieDominante']
  ].forEach(([elementId, field]) => {
    const el = document.getElementById(elementId);
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (!currentPlayer) return;
      state.players[currentPlayer][field] = el.value.trim();
      saveState();
    });
  });

  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);

  const saveEvalForm = document.getElementById('saveEvalForm');
  const evalLabelInput = document.getElementById('evalLabel');
  const evalDateInput = document.getElementById('evalDate');

  document.getElementById('saveEvalBtn').addEventListener('click', () => {
    if (!currentPlayer) return;
    saveEvalForm.hidden = !saveEvalForm.hidden;
    if (!saveEvalForm.hidden) {
      evalLabelInput.value = '';
      evalDateInput.value = todayISO();
      evalLabelInput.focus();
    }
  });

  document.getElementById('cancelSaveEvalBtn').addEventListener('click', () => {
    saveEvalForm.hidden = true;
  });

  function confirmSaveEvaluation() {
    if (!currentPlayer) return;
    const player = state.players[currentPlayer];
    if (!player.history) player.history = [];
    player.history.push({
      date: evalDateInput.value || todayISO(),
      label: evalLabelInput.value.trim(),
      attrs: { ...player.attrs }
    });
    player.history.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    saveEvalForm.hidden = true;
    saveState();
    if (document.getElementById('panel-jugadora').classList.contains('active')) renderDashboard();
  }

  document.getElementById('confirmSaveEvalBtn').addEventListener('click', confirmSaveEvaluation);
  evalLabelInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirmSaveEvaluation(); });

  [document.getElementById('posPrincipal'), document.getElementById('posSecundaria')].forEach(sel => {
    sel.innerHTML = '<option value="">Seleccionar…</option>' +
      POSITIONS.map(p => `<option value="${p}">${p}</option>`).join('');
  });

  document.getElementById('playerPieDominante').innerHTML = '<option value="">Seleccionar…</option>' +
    PIE_DOMINANTE_OPTIONS.map(p => `<option value="${p}">${p}</option>`).join('');

  const slidersContainer = document.getElementById('slidersContainer');
  ATTRIBUTES.forEach(attr => {
    const row = document.createElement('div');
    row.className = 'slider-group';
    // El slider trabaja con el valor guardado (1-10), pero cada paso es de
    // 1 punto de la escala que se ve (1-100): 1 / SCORE_SCALE = 0,1.
    const onePoint = 1 / SCORE_SCALE;
    row.innerHTML = `
      <span class="slider-label">${attr}</span>
      <input type="range" min="${onePoint}" max="10" step="${onePoint}" value="5" data-attr="${attr}">
      <span class="slider-value">50</span>
    `;
    slidersContainer.appendChild(row);
    const input = row.querySelector('input');
    const valueEl = row.querySelector('.slider-value');
    input.addEventListener('input', () => {
      valueEl.textContent = formatAttrValue(input.value);
      if (!currentPlayer) return;
      state.players[currentPlayer].attrs[attr] = Number(input.value);
      updateRadarChart();
      saveState();
    });
  });
}

function renderPlayerSelect() {
  const sel = document.getElementById('playerSelect');
  const names = Object.keys(state.players);
  sel.innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join('');
  if (!currentPlayer || !state.players[currentPlayer]) currentPlayer = names[0] || null;
  if (currentPlayer) sel.value = currentPlayer;
}

function renderEvaluador() {
  const hasPlayer = !!currentPlayer;
  document.getElementById('evaluadorContent').style.display = hasPlayer ? '' : 'none';
  document.getElementById('evaluadorEmpty').style.display = hasPlayer ? 'none' : '';
  if (!hasPlayer) return;

  const player = state.players[currentPlayer];
  document.querySelectorAll('#slidersContainer input[type=range]').forEach(input => {
    const attr = input.dataset.attr;
    input.value = player.attrs[attr];
    input.nextElementSibling.textContent = formatAttrValue(player.attrs[attr]);
  });
  document.getElementById('posPrincipal').value = player.posPrincipal || '';
  document.getElementById('posSecundaria').value = player.posSecundaria || '';
  document.getElementById('playerApodo').value = player.apodo || '';
  document.getElementById('playerEdad').value = player.edad || '';
  document.getElementById('playerAltura').value = player.altura || '';
  document.getElementById('playerPieDominante').value = player.pieDominante || '';
  updateRadarChart();
}

// Compartido entre el radar de Evaluador y el de la pestaña Jugadora.
// Recibe los valores guardados (1-10) y los dibuja en escala 1-100.
function buildOrUpdateRadar(existingChart, canvasId, label, data) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === 'undefined') return existingChart;
  const scaled = data.map(toScore);

  if (existingChart) {
    existingChart.data.datasets[0].data = scaled;
    existingChart.data.datasets[0].label = label;
    existingChart.update();
    return existingChart;
  }

  return new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ATTRIBUTES,
      datasets: [{
        label,
        data: scaled,
        backgroundColor: 'rgba(24, 95, 165, 0.25)',
        borderColor: '#185FA5',
        pointBackgroundColor: '#185FA5'
      }]
    },
    options: {
      scales: { r: { min: 0, max: 10 * SCORE_SCALE, ticks: { stepSize: 2 * SCORE_SCALE } } },
      plugins: { legend: { display: false } }
    }
  });
}

function updateRadarChart() {
  if (!currentPlayer) return;
  const player = state.players[currentPlayer];
  const data = ATTRIBUTES.map(a => player.attrs[a]);
  radarChart = buildOrUpdateRadar(radarChart, 'radarChart', currentPlayer, data);
}

function exportCsv() {
  const rows = [['Jugadora', 'Apodo', 'Edad', 'Altura', 'PieDominante', 'PosPrincipal', 'PosSecundaria', ...ATTRIBUTES]];
  Object.entries(state.players).forEach(([name, p]) => {
    rows.push([
      name, p.apodo || '', p.edad || '', p.altura || '', p.pieDominante || '',
      p.posPrincipal || '', p.posSecundaria || '',
      ...ATTRIBUTES.map(a => toScore(p.attrs[a])) // en la escala 1-100 que se ve en la app
    ]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dtcomander_evaluaciones_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ==================================================================
// Jugadora (dashboard estático: perfil + progreso en el tiempo)
// No se edita nada acá — los valores y el historial se cargan desde
// Evaluador ("Guardar evaluación" es lo único que agrega un punto nuevo).
// ==================================================================
let dashboardRadarChart = null;
let dashboardTrendChart = null;

function setupDashboard() {
  renderAttrColorLegend();

  document.getElementById('dashboardPlayerSelect').addEventListener('change', e => {
    currentPlayer = e.target.value;
    renderDashboard();
  });

  // Delegado en el contenedor (que se reconstruye en cada render) para que
  // el botón "Eliminar" de cada fila del historial siga funcionando siempre.
  document.getElementById('dashboardTimeline').addEventListener('click', e => {
    const btn = e.target.closest('.timeline-remove');
    if (!btn || !currentPlayer) return;
    const idx = Number(btn.dataset.index);
    if (btn.dataset.armed === '1') {
      state.players[currentPlayer].history.splice(idx, 1);
      saveState();
      renderDashboard();
    } else {
      btn.dataset.armed = '1';
      btn.textContent = '¿Seguro?';
      setTimeout(() => {
        btn.dataset.armed = '0';
        btn.textContent = 'Eliminar';
      }, 3000);
    }
  });
}

function renderDashboard() {
  const sel = document.getElementById('dashboardPlayerSelect');
  if (!sel) return; // todavía no se armó el HTML (no debería pasar, pero por las dudas)
  const names = Object.keys(state.players);
  sel.innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join('');
  if (!currentPlayer || !state.players[currentPlayer]) currentPlayer = names[0] || null;

  const hasPlayer = !!currentPlayer;
  document.getElementById('dashboardContent').style.display = hasPlayer ? '' : 'none';
  document.getElementById('dashboardInfoCard').style.display = hasPlayer ? '' : 'none';
  document.getElementById('dashboardEmpty').style.display = hasPlayer ? 'none' : '';
  if (!hasPlayer) return;
  sel.value = currentPlayer;

  const player = state.players[currentPlayer];
  const history = (player.history || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  renderDashboardPlayerInfo(player);
  const data = ATTRIBUTES.map(a => player.attrs[a]);
  dashboardRadarChart = buildOrUpdateRadar(dashboardRadarChart, 'dashboardRadarChart', currentPlayer, data);
  renderDashboardAttrsGrid(player);

  renderDashboardDiff(player, history);
  updateDashboardTrend(player, history);
  renderDashboardTimeline(history);
}

// El apodo es texto libre (y la Sheet es editable desde afuera de la app),
// así que se escapa antes de meterlo en innerHTML.
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

// Datos básicos de la jugadora, de solo lectura (se editan en Evaluador).
function renderDashboardPlayerInfo(player) {
  const container = document.getElementById('dashboardPlayerInfo');
  if (!container) return;
  const items = [
    ['Nombre', currentPlayer],
    ['Apodo', player.apodo],
    ['Edad', player.edad ? `${player.edad} años` : ''],
    ['Altura', player.altura ? `${player.altura} cm` : ''],
    ['Pie dominante', player.pieDominante],
    ['Posición', [player.posPrincipal, player.posSecundaria].filter(Boolean).join(' / ')]
  ];
  container.innerHTML = items.map(([label, value]) => `
    <div class="player-info-item">
      <span class="hint">${label}</span>
      <span class="player-info-value">${value ? escapeHtml(value) : '—'}</span>
    </div>`).join('');
}

// Se arma una sola vez: qué significa cada color, en la escala 1-100 que
// se ve. Los rangos salen de ATTR_VALUE_COLORS (de mayor a menor piso), así
// que si se cambia un corte allá la leyenda se actualiza sola.
function renderAttrColorLegend() {
  const el = document.getElementById('attrColorLegend');
  if (!el) return;
  const top = 10 * SCORE_SCALE;
  const bands = ATTR_VALUE_COLORS.map((band, i) => {
    const from = band.min === -Infinity ? 0 : band.min * SCORE_SCALE;
    const to = i === 0 ? top : ATTR_VALUE_COLORS[i - 1].min * SCORE_SCALE - 1;
    return { label: `${from}-${to}`, color: band.color };
  }).reverse();
  el.innerHTML = bands.map(b =>
    `<span class="legend-item"><span class="legend-dot" style="background:${b.color}"></span>${b.label}</span>`
  ).join('');
}

// Lista de números grandes coloreados por rango de valor (no por
// posición, eso es colorForPosition) — más directo que un gráfico para
// ver de un vistazo fuertes y débiles, estilo tarjeta de FIFA.
function renderDashboardAttrsGrid(player) {
  const list = document.getElementById('dashboardAttrsGrid');
  if (!list) return;
  list.innerHTML = ATTRIBUTES.map(attr => {
    const value = player.attrs[attr];
    const color = colorForAttrValue(value);
    return `
      <div class="attr-row" style="border-left-color:${color}">
        <span class="attr-row-label">${attr}</span>
        <span class="attr-row-value" style="color:${color}">${formatAttrValue(value)}</span>
      </div>`;
  }).join('');
}

// Compara los valores ACTUALES contra la última evaluación guardada.
function renderDashboardDiff(player, history) {
  const container = document.getElementById('dashboardDiff');
  const last = history[history.length - 1];
  if (!last) {
    container.innerHTML = '<p class="hint">Todavía no hay ninguna evaluación guardada. Usá "Guardar evaluación" en Evaluador para crear el primer punto de referencia.</p>';
    return;
  }
  const rows = ATTRIBUTES.map(attr => {
    const current = player.attrs[attr];
    const prev = last.attrs[attr];
    const diff = Math.round((current - prev) * 10) / 10;
    const cls = diff > 0 ? 'diff-up' : diff < 0 ? 'diff-down' : 'diff-same';
    const sign = diff > 0 ? '+' : '';
    const diffText = diff === 0 ? '—' : `${sign}${formatAttrValue(diff)}`;
    return `<div class="diff-row">
      <span class="diff-label">${attr}</span>
      <span class="diff-value">${formatAttrValue(current)}</span>
      <span class="diff-delta ${cls}">${diffText}</span>
    </div>`;
  }).join('');
  container.innerHTML = `
    <p class="hint">Comparado con "${last.label || 'sin etiqueta'}" (${formatDateDisplay(last.date)})</p>
    ${rows}`;
}

// Línea de tiempo del promedio general: un punto por evaluación guardada,
// más el valor actual (en vivo) al final para ver hacia dónde va ahora.
function updateDashboardTrend(player, history) {
  const ctx = document.getElementById('dashboardTrendChart');
  if (!ctx || typeof Chart === 'undefined') return;

  const labels = history.map(h => h.label || formatDateDisplay(h.date));
  const data = history.map(h => toScore(average(h.attrs)));
  labels.push('Actual');
  data.push(toScore(average(player.attrs)));

  if (dashboardTrendChart) {
    dashboardTrendChart.data.labels = labels;
    dashboardTrendChart.data.datasets[0].data = data;
    dashboardTrendChart.update();
    return;
  }

  dashboardTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Promedio general',
        data,
        borderColor: '#0d7d2a',
        backgroundColor: 'rgba(13, 125, 42, 0.15)',
        tension: 0.25,
        fill: true,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { min: 0, max: 10 * SCORE_SCALE } },
      plugins: { legend: { display: false } }
    }
  });
}

// Historial completo, más reciente primero, cada fila comparada con la
// evaluación guardada inmediatamente anterior (no con la actual).
function renderDashboardTimeline(history) {
  const container = document.getElementById('dashboardTimeline');
  if (!history.length) {
    container.innerHTML = '<p class="hint">Sin evaluaciones guardadas todavía.</p>';
    return;
  }
  const rows = history.map((entry, idx) => {
    const prev = idx > 0 ? history[idx - 1] : null;
    const avg = average(entry.attrs);
    // La diferencia se calcula ya en escala 1-100 (con un decimal), no sobre
    // los valores guardados redondeados: si no, +2,7 puntos se vería como +3.
    const avgDiff = prev ? Math.round((toScore(avg) - toScore(average(prev.attrs))) * 10) / 10 : null;
    const cls = avgDiff > 0 ? 'diff-up' : avgDiff < 0 ? 'diff-down' : 'diff-same';
    const diffText = avgDiff === null || avgDiff === 0
      ? ''
      : `<span class="diff-delta ${cls}">(${avgDiff > 0 ? '+' : ''}${formatScore(avgDiff)})</span>`;
    return { idx, avg, diffText, entry };
  }).reverse().map(({ idx, avg, diffText, entry }) => `
    <div class="timeline-row">
      <div class="timeline-head">
        <strong>${entry.label || 'Sin etiqueta'}</strong>
        <span class="hint">${formatDateDisplay(entry.date)}</span>
        <span class="timeline-avg">Promedio: ${formatAttrValue(avg)} ${diffText}</span>
        <button type="button" class="btn btn-danger btn-small timeline-remove" data-index="${idx}">Eliminar</button>
      </div>
    </div>`).join('');
  container.innerHTML = rows;
}

// ==================================================================
// Formación (Partido -> Plan A/B/C -> forma táctica -> jugadoras)
// ==================================================================
function setupFormacion() {
  setupMatchControls();
  setupPlanTabs();
  renderPositionLegend();

  const sel = document.getElementById('formationSelect');
  sel.innerHTML = Object.keys(FORMATION_PRESETS).map(f => `<option value="${f}">${f}</option>`).join('');
  sel.addEventListener('change', () => {
    currentPlan().activeFormation = sel.value;
    saveState();
    renderFormacion();
  });

  document.getElementById('resetFormationBtn').addEventListener('click', () => {
    const plan = currentPlan();
    plan.formations[plan.activeFormation].placements =
      applyPresetToPlacements(plan.activeFormation, Object.keys(state.players));
    saveState();
    renderFormacion();
  });
}

function setupMatchControls() {
  const matchSelect = document.getElementById('matchSelect');
  matchSelect.addEventListener('change', () => {
    state.activeMatch = matchSelect.value;
    saveState();
    renderFormacion();
  });

  const addForm = document.getElementById('addMatchForm');
  const rivalInput = document.getElementById('newMatchRival');
  const dateInput = document.getElementById('newMatchDate');
  const errorEl = document.getElementById('addMatchError');

  document.getElementById('addMatchBtn').addEventListener('click', () => {
    addForm.hidden = !addForm.hidden;
    if (!addForm.hidden) {
      rivalInput.value = '';
      dateInput.value = todayISO();
      errorEl.textContent = '';
      rivalInput.focus();
    }
  });

  document.getElementById('cancelAddMatchBtn').addEventListener('click', () => {
    addForm.hidden = true;
  });

  function confirmAddMatch() {
    const rival = rivalInput.value.trim();
    errorEl.textContent = '';
    if (!rival) {
      errorEl.textContent = 'Ponele un nombre al rival.';
      rivalInput.focus();
      return;
    }
    const matchId = 'm' + Date.now();
    state.matches[matchId] = makeMatch(rival, dateInput.value || todayISO());
    state.activeMatch = matchId;
    addForm.hidden = true;
    saveState();
    renderFormacion();
  }

  document.getElementById('confirmAddMatchBtn').addEventListener('click', confirmAddMatch);
  rivalInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirmAddMatch(); });

  const removeBtn = document.getElementById('removeMatchBtn');
  let armed = false;
  let armTimer = null;

  removeBtn.addEventListener('click', () => {
    if (Object.keys(state.matches).length <= 1) return; // siempre queda al menos un partido
    if (!armed) {
      armed = true;
      removeBtn.textContent = '¿Seguro? Tocá de nuevo';
      clearTimeout(armTimer);
      armTimer = setTimeout(() => {
        armed = false;
        removeBtn.textContent = 'Eliminar partido';
      }, 3000);
      return;
    }
    armed = false;
    clearTimeout(armTimer);
    removeBtn.textContent = 'Eliminar partido';

    delete state.matches[state.activeMatch];
    state.activeMatch = Object.keys(state.matches)[0];
    saveState();
    renderFormacion();
  });
}

function renderMatchSelect() {
  const sel = document.getElementById('matchSelect');
  const ids = Object.keys(state.matches).sort((a, b) => {
    const da = state.matches[a].date || '';
    const db = state.matches[b].date || '';
    return db.localeCompare(da); // más reciente primero
  });
  sel.innerHTML = ids.map(id => `<option value="${id}">${matchLabel(state.matches[id])}</option>`).join('');
  sel.value = state.activeMatch;
}

function setupPlanTabs() {
  const container = document.getElementById('planTabs');
  container.innerHTML = PLANS.map(p => `<button type="button" class="plan-tab-btn" data-plan="${p}">${p}</button>`).join('');
  container.querySelectorAll('.plan-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentMatch().activePlan = btn.dataset.plan;
      saveState();
      renderFormacion();
    });
  });
}

function renderPlanTabs() {
  const activePlan = currentMatch().activePlan;
  document.querySelectorAll('#planTabs .plan-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.plan === activePlan);
  });
}

// Se arma una sola vez (no depende de datos que cambien) para identificar
// de qué color es cada posición en la cancha y en los chips.
function renderPositionLegend() {
  const el = document.getElementById('positionLegend');
  if (!el) return;
  el.innerHTML = POSITIONS.map(pos =>
    `<span class="legend-item"><span class="legend-dot" style="background:${colorForPosition(pos)}"></span>${pos}</span>`
  ).join('');
}

function renderFormacion() {
  if (!state.activeMatch || !state.matches[state.activeMatch]) {
    state.activeMatch = Object.keys(state.matches)[0];
  }
  renderMatchSelect();
  renderPlanTabs();

  const plan = currentPlan();
  const sel = document.getElementById('formationSelect');
  if (sel) sel.value = plan.activeFormation;

  const resetBtn = document.getElementById('resetFormationBtn');
  const isFree = FORMATION_PRESETS[plan.activeFormation].length === 0;
  resetBtn.textContent = isFree ? 'Vaciar cancha' : 'Restablecer a preset';

  if (!plan.formations[plan.activeFormation]) {
    plan.formations[plan.activeFormation] = { placements: {} };
  }
  const placements = plan.formations[plan.activeFormation].placements;

  const available = document.getElementById('availablePlayers');
  available.innerHTML = '';
  Object.keys(state.players).forEach(name => {
    if (placements[name]) return;
    available.appendChild(createPlayerChip(name));
  });

  hideSuggestions();

  const field = document.getElementById('field');
  field.querySelectorAll('.player-token').forEach(el => el.remove());
  Object.entries(placements).forEach(([name, pos]) => {
    field.appendChild(createFieldToken(name, pos.x, pos.y));
  });
}

// Chip de jugadora reutilizado en "Disponibles" y en "Alternativas"
// (sugerencias) — el borde de color identifica su posición principal.
function createPlayerChip(name) {
  const chip = document.createElement('div');
  chip.className = 'player-chip';
  chip.textContent = name;
  chip.dataset.player = name;
  const player = state.players[name];
  chip.style.borderLeft = `5px solid ${colorForPosition(player && player.posPrincipal)}`;
  chip.addEventListener('pointerdown', onChipPointerDown);
  return chip;
}

function createFieldToken(name, x, y) {
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('class', 'player-token');
  g.setAttribute('transform', `translate(${x}, ${y})`);
  g.dataset.player = name;

  const player = state.players[name];
  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('r', 16);
  circle.setAttribute('class', 'token-circle');
  circle.style.fill = colorForPosition(player && player.posPrincipal);

  const text = document.createElementNS(ns, 'text');
  text.setAttribute('class', 'token-label');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dy', 4);
  text.textContent = name.slice(0, 3);

  g.appendChild(circle);
  g.appendChild(text);
  g.addEventListener('pointerdown', onTokenPointerDown);
  g.addEventListener('pointerenter', () => showSuggestions(name));
  g.addEventListener('pointerleave', hideSuggestions);
  return g;
}

// Muestra, debajo de "Disponibles", las jugadoras sin ubicar que comparten
// posición (principal o secundaria) con la que se está mirando en la cancha.
function showSuggestions(name) {
  const player = state.players[name];
  const box = document.getElementById('suggestions');
  const list = document.getElementById('suggestionsList');
  if (!player || !box || !list) return;

  document.getElementById('suggestionsFor').textContent = name;
  list.innerHTML = '';

  const wanted = [player.posPrincipal, player.posSecundaria].filter(Boolean);
  const plan = currentPlan();
  const placements = plan.formations[plan.activeFormation].placements;

  if (!wanted.length) {
    list.innerHTML = '<span class="hint">Sin posición cargada en el Evaluador.</span>';
  } else {
    const alternatives = Object.keys(state.players).filter(other => {
      if (other === name || placements[other]) return false;
      const o = state.players[other];
      return wanted.includes(o.posPrincipal) || wanted.includes(o.posSecundaria);
    });
    if (!alternatives.length) {
      list.innerHTML = '<span class="hint">No hay disponibles para su posición.</span>';
    } else {
      alternatives.forEach(altName => {
        list.appendChild(createPlayerChip(altName));
      });
    }
  }
  box.hidden = false;
}

function hideSuggestions() {
  const box = document.getElementById('suggestions');
  if (box) box.hidden = true;
  const list = document.getElementById('suggestionsList');
  if (list) list.innerHTML = '';
}

function svgPointFromClient(clientX, clientY) {
  const field = document.getElementById('field');
  const rect = field.getBoundingClientRect();
  const viewBox = field.viewBox.baseVal;
  return {
    x: ((clientX - rect.left) / rect.width) * viewBox.width,
    y: ((clientY - rect.top) / rect.height) * viewBox.height
  };
}

function clampToField(x, y) {
  return {
    x: Math.min(FIELD_BOUNDS.maxX, Math.max(FIELD_BOUNDS.minX, x)),
    y: Math.min(FIELD_BOUNDS.maxY, Math.max(FIELD_BOUNDS.minY, y))
  };
}

function isOverField(clientX, clientY) {
  const field = document.getElementById('field');
  const rect = field.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

// Mover una jugadora que ya está ubicada en la cancha
function onTokenPointerDown(evt) {
  evt.preventDefault();
  const g = evt.currentTarget;
  const name = g.dataset.player;

  // Mismo "ghost" que al arrastrar desde Disponibles: sigue al cursor
  // libremente por toda la pantalla (no queda pegada al borde del campo),
  // así se ve claro que soltarla afuera la manda de vuelta a Disponibles.
  const ghost = document.createElement('div');
  ghost.className = 'player-chip dragging-ghost';
  ghost.textContent = name;
  const draggedPlayer = state.players[name];
  ghost.style.borderLeft = `5px solid ${colorForPosition(draggedPlayer && draggedPlayer.posPrincipal)}`;
  document.body.appendChild(ghost);
  moveGhost(ghost, evt.clientX, evt.clientY);
  g.style.opacity = '0.25';

  function onMove(e) {
    moveGhost(ghost, e.clientX, e.clientY);
  }

  function onUp(e) {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    ghost.remove();

    const placements = currentPlan().formations[currentPlan().activeFormation].placements;
    if (isOverField(e.clientX, e.clientY)) {
      const raw = svgPointFromClient(e.clientX, e.clientY);
      const p = clampToField(raw.x, raw.y);
      placements[name] = { x: p.x, y: p.y };
    } else {
      delete placements[name];
    }
    saveState();
    renderFormacion();
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

// Arrastrar una jugadora desde "Disponibles" (o "Alternativas") hacia la cancha
function onChipPointerDown(evt) {
  const chip = evt.currentTarget;
  const name = chip.dataset.player;
  const ghost = chip.cloneNode(true);
  ghost.classList.add('dragging-ghost');
  document.body.appendChild(ghost);
  moveGhost(ghost, evt.clientX, evt.clientY);

  function onMove(e) {
    moveGhost(ghost, e.clientX, e.clientY);
  }

  function onUp(e) {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    ghost.remove();
    if (isOverField(e.clientX, e.clientY)) {
      const raw = svgPointFromClient(e.clientX, e.clientY);
      const p = clampToField(raw.x, raw.y);
      currentPlan().formations[currentPlan().activeFormation].placements[name] = { x: p.x, y: p.y };
      saveState();
      renderFormacion();
    }
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function moveGhost(ghost, clientX, clientY) {
  ghost.style.position = 'fixed';
  ghost.style.left = `${clientX - 30}px`;
  ghost.style.top = `${clientY - 15}px`;
  ghost.style.pointerEvents = 'none';
  ghost.style.zIndex = 1000;
}

// ==================================================================
// Entrenamiento (sugerencias por posición + rúbrica manual, sin tocar
// los atributos de nadie — eso lo sigue haciendo el DT a mano en
// Evaluador. Es contenido/registro de referencia, no un dato de jugadora.)
// ==================================================================
let currentTrainingPosition = POSITIONS[0];

function setupEntrenamiento() {
  const tabsContainer = document.getElementById('trainingPositionTabs');
  tabsContainer.innerHTML = POSITIONS.map(pos =>
    `<button type="button" class="plan-tab-btn" data-position="${pos}">${pos}</button>`
  ).join('');
  tabsContainer.querySelectorAll('.plan-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTrainingPosition = btn.dataset.position;
      renderEntrenamiento();
    });
  });

  // El contenido de #rubricCriteria depende de la posición activa (cada
  // dimensión se describe distinto según el puesto), así que se arma en
  // renderRubricCriteria() en vez de acá — acá solo quedan los listeners.
  const rubricCriteriaEl = document.getElementById('rubricCriteria');

  const rubricForm = document.getElementById('rubricForm');
  const rubricPlayerSelect = document.getElementById('rubricPlayer');
  const rubricDateInput = document.getElementById('rubricDate');
  const rubricNotesInput = document.getElementById('rubricNotes');

  document.getElementById('openRubricBtn').addEventListener('click', () => {
    rubricForm.hidden = !rubricForm.hidden;
    if (!rubricForm.hidden) {
      rubricPlayerSelect.innerHTML = '<option value="">Grupal (sin jugadora específica)</option>' +
        Object.keys(state.players).map(n => `<option value="${n}">${n}</option>`).join('');
      rubricDateInput.value = todayISO();
      rubricNotesInput.value = '';
      rubricCriteriaEl.querySelectorAll('select').forEach(sel => { sel.value = '3'; });
    }
  });

  document.getElementById('cancelRubricBtn').addEventListener('click', () => {
    rubricForm.hidden = true;
  });

  document.getElementById('confirmRubricBtn').addEventListener('click', () => {
    const scores = {};
    RUBRIC_DIMENSIONS.forEach(key => {
      scores[key] = Number(rubricCriteriaEl.querySelector(`[data-criterion="${key}"]`).value);
    });
    if (!state.trainingLogs) state.trainingLogs = [];
    state.trainingLogs.push({
      date: rubricDateInput.value || todayISO(),
      position: currentTrainingPosition,
      player: rubricPlayerSelect.value,
      scores,
      notes: rubricNotesInput.value.trim()
    });
    rubricForm.hidden = true;
    saveState();
    renderTrainingLog();
  });

  // Delegado (la lista se reconstruye entera en cada render) para el
  // botón "Eliminar" de cada fila del historial — mismo patrón de doble
  // click armado que en Formación/Jugadora.
  document.getElementById('trainingLogList').addEventListener('click', e => {
    const btn = e.target.closest('.training-log-remove');
    if (!btn) return;
    const idx = Number(btn.dataset.index);
    if (btn.dataset.armed === '1') {
      state.trainingLogs.splice(idx, 1);
      saveState();
      renderTrainingLog();
    } else {
      btn.dataset.armed = '1';
      btn.textContent = '¿Seguro?';
      setTimeout(() => {
        btn.dataset.armed = '0';
        btn.textContent = 'Eliminar';
      }, 3000);
    }
  });
}

function renderEntrenamiento() {
  const tabsEl = document.getElementById('trainingPositionTabs');
  if (!tabsEl) return; // todavía no se armó el HTML
  tabsEl.querySelectorAll('.plan-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.position === currentTrainingPosition);
  });
  document.getElementById('trainingPositionName').textContent = currentTrainingPosition;

  const suggestions = TRAINING_SUGGESTIONS[currentTrainingPosition] || {};
  document.getElementById('trainingSuggestions').innerHTML = Object.keys(suggestions).map(category => `
    <div class="training-category">
      <h3>${category}</h3>
      <ul>${suggestions[category].map(item => `<li>${item}</li>`).join('')}</ul>
    </div>
  `).join('');

  renderRubricCriteria();
  renderTrainingLog();
}

// La rúbrica siempre evalúa las mismas 5 dimensiones (para poder comparar
// entre puestos), pero lo que describe cada una es específico de la
// posición activa — por eso se reconstruye acá y no una sola vez.
function renderRubricCriteria() {
  const el = document.getElementById('rubricCriteria');
  if (!el) return;
  el.innerHTML = RUBRIC_DIMENSIONS.map(key => `
    <label class="rubric-criterion">
      <span class="rubric-dimension">${RUBRIC_DIMENSION_NAMES[key]}</span>
      ${rubricLabel(currentTrainingPosition, key)}
      <select data-criterion="${key}">
        ${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${n === 3 ? ' selected' : ''}>${n}</option>`).join('')}
      </select>
    </label>
  `).join('');
}

function renderTrainingLog() {
  const container = document.getElementById('trainingLogList');
  if (!container) return;
  const logs = state.trainingLogs || [];
  if (!logs.length) {
    container.innerHTML = '<p class="hint">Sin entrenamientos registrados todavía.</p>';
    return;
  }
  const sorted = logs
    .map((entry, idx) => ({ entry, idx }))
    .sort((a, b) => (b.entry.date || '').localeCompare(a.entry.date || ''));

  container.innerHTML = sorted.map(({ entry, idx }) => {
    // Cada entrada muestra las etiquetas de SU posición, no la que esté
    // activa ahora en las solapas (por si cambiaron desde que se guardó).
    const scoresText = RUBRIC_DIMENSIONS
      .map(key => `${rubricLabel(entry.position, key)}: ${entry.scores[key]}`)
      .join(' · ');
    return `
      <div class="timeline-row">
        <div class="timeline-head">
          <strong>${entry.position}${entry.player ? ' — ' + entry.player : ' (grupal)'}</strong>
          <span class="hint">${formatDateDisplay(entry.date)}</span>
          <button type="button" class="btn btn-danger btn-small training-log-remove" data-index="${idx}">Eliminar</button>
        </div>
        <div class="hint">${scoresText}</div>
        ${entry.notes ? `<p class="training-log-notes">${entry.notes}</p>` : ''}
      </div>`;
  }).join('');
}
