// ==================================================================
// DTCommander — solapa Simulación: una jugada animada en fases.
//
// Distinto de Táctica (una jugada dibujada, una sola foto): acá la jugada
// tiene varias fases (cada una con nombre, nota y tiempo) y al reproducirla
// las jugadoras, los rivales y la pelota se deslizan de una fase a la
// siguiente, con las flechas de recorrido dibujadas solas. Se puede grabar
// como video MP4.
//
// Depende de js/simulacion-media.js (window.SimMedia) y de js/app.js: state,
// saveState, currentPlan, currentMatch, matchLabel, formatDateDisplay,
// colorForPosition, moveGhost, FIELD_BOUNDS, MAX_SIM_PHASES,
// SIM_DEFAULT_DUR, sanitizeSimItems. Expone window.setupSimulacion y
// window.renderSimulacion.
// ==================================================================
(function () {
  const M = window.SimMedia;
  const THEME = M.THEME;
  const G = THEME.GRID;
  const VIEW_W = THEME.W;
  const VIEW_H = THEME.H;
  const TOKEN_R = THEME.TOKEN_R;
  const DRAFT_KEY = 'dtcomander_sim_draft';
  const MAX_UNDO = 60;
  const MAX_RIVALS = 11;
  const HOLD_MS = 900;
  const HOLD_NOTE_MS = 2200;
  const TRAIL_MIN = 8;
  const SNAP_DIST = 20;
  const TRAIL_COLORS = { player: '#ffffff', rival: '#fca5a5' };
  // Color de la flecha de la pelota según cómo viaja: por el piso, por arriba o de tiro
  const BALL_TRAIL = { ground: '#facc15', air: '#7dd3fc', shot: '#fb923c' };
  const ZONE_COLORS = [
    { name: 'Amarillo', value: '#facc15' }, { name: 'Rojo', value: '#ef4444' },
    { name: 'Celeste', value: '#22d3ee' }, { name: 'Blanco', value: '#ffffff' }
  ];

  // ------------------------------------------------------------------
  // Acciones de una transición
  // ------------------------------------------------------------------
  // Una acción mueve UNA pieza de la fase anterior a la actual (avanzar 2
  // casilleros, pase a Agos, tiro al arco...). La app calcula el destino y lo
  // escribe en la fase actual; después se puede ajustar arrastrando (eso quita
  // la acción, porque la pieza ya no está donde ella la dejó).
  const DIR_VEC = {
    up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
    upleft: [-1, -1], upright: [1, -1], downleft: [-1, 1], downright: [1, 1]
  };
  const MOVE_LABELS = {
    up: 'Avanzar (atacar)', down: 'Retroceder (defender)', left: 'Ir a la izquierda', right: 'Ir a la derecha',
    upleft: 'Avanzar por la izquierda', upright: 'Avanzar por la derecha',
    downleft: 'Retroceder por la izquierda', downright: 'Retroceder por la derecha'
  };
  const MOVE_VERBS = {
    up: 'avanza', down: 'retrocede', left: 'va a la izquierda', right: 'va a la derecha',
    upleft: 'avanza por la izquierda', upright: 'avanza por la derecha',
    downleft: 'retrocede por la izquierda', downright: 'retrocede por la derecha'
  };
  const TOKEN_ACTS = Object.keys(MOVE_LABELS).concat(['goto', 'press', 'mark']);
  const BALL_ACTS = ['pass', 'cross', 'lob', 'space', 'shot', 'goal'];
  const ACT_LABELS = Object.assign({}, MOVE_LABELS, {
    goto: 'Ir a la zona…', press: 'Presionar a…', mark: 'Marcar a…',
    pass: 'Pase a…', cross: 'Centro a…', lob: 'Pase por arriba a…', space: 'Pelota al espacio (zona)…',
    shot: 'Tiro al arco', goal: 'Gol'
  });
  const SIDE_LABELS = { left: 'palo izquierdo', center: 'al medio', right: 'palo derecho' };
  const ZONE_BAND = { 1: 'Defensa baja', 2: 'Defensa alta', 3: 'Ataque bajo', 4: 'Ataque alto' };

  // ------------------------------------------------------------------
  // Jugadas de ejemplo. Arrancan de una formación 2-3-2 propia (abajo, atacando
  // hacia arriba) y otra rival; cada paso solo indica lo que cambia respecto del
  // anterior. Las jugadoras propias llevan el nombre de su puesto (Arq, DefI...):
  // "Asignar mi plantel" los reemplaza por jugadoras reales.
  // ------------------------------------------------------------------
  const OUR_BASE = {
    Arq: [150, 370], DefI: [90, 300], DefD: [210, 300], MedI: [60, 220], MedC: [150, 220], MedD: [240, 220],
    DelI: [100, 130], DelD: [200, 130]
  };
  const RIV_BASE = {
    1: [150, 30], 2: [90, 100], 3: [210, 100], 4: [60, 180], 5: [150, 180], 6: [240, 180],
    7: [100, 270], 8: [200, 270]
  };

  const TEMPLATES = [
    {
      id: 'salida', name: 'Salir jugando de abajo',
      steps: [
        {
          name: 'La arquera con la pelota', note: 'La arquera controla y mira las opciones. Las defensoras se abren para ofrecerse.', ball: 'Arq',
          zones: [[1, 2, '#ef4444']], texts: [{ x: 150, y: 112, text: 'Presión rival' }],
          our: { Arq: [150, 364], DefI: [70, 320], DefD: [230, 320], MedC: [150, 268], MedI: [55, 240], MedD: [245, 240], DelI: [95, 175], DelD: [205, 175] },
          riv: { 7: [115, 290], 8: [185, 290], 5: [150, 225], 4: [60, 205], 6: [240, 205], 2: [95, 140], 3: [205, 140] }
        },
        { name: 'Pase a la defensora', note: 'Pase al costado para sacar la pelota de la presión.', dur: 1.5, ball: 'DefI', ballAct: 'pass', our: { MedI: [50, 255] }, riv: { 7: [95, 300], 8: [170, 285] } },
        {
          name: 'Progresión por afuera', note: 'La defensora conduce y la mediocampista se ofrece de apoyo.', dur: 2.5, ball: 'DefI',
          our: { DefI: [62, 270], MedC: [125, 250], MedI: [52, 215] }, riv: { 7: [95, 258], 4: [70, 190], 5: [135, 215] }
        },
        {
          name: 'Pase al medio', note: 'Pase interior a la mediocampista y a jugar hacia adelante.', dur: 1.5, ball: 'MedC', ballAct: 'pass',
          our: { MedC: [128, 236], DelI: [85, 160], DelD: [215, 162] }, riv: { 5: [140, 205], 7: [100, 250], 3: [195, 118], 2: [100, 126] }
        }
      ]
    },
    {
      id: 'medio', name: 'Ataque desde medio campo',
      steps: [
        {
          name: 'Mediocampista con la pelota', note: 'Conduce por el centro. Las delanteras fijan a la defensa y las laterales abren el campo.', ball: 'MedC',
          our: { Arq: [150, 338], DefI: [100, 268], DefD: [200, 268], MedC: [150, 222], MedI: [70, 205], MedD: [230, 205], DelI: [105, 140], DelD: [195, 140] },
          riv: { 2: [105, 95], 3: [195, 95], 4: [65, 170], 5: [150, 170], 6: [235, 170], 7: [120, 190], 8: [185, 190] }
        },
        { name: 'Pase a la banda', note: 'La pelota sale rápido al costado derecho.', dur: 1.5, ball: 'MedD', ballAct: 'pass', our: { MedD: [235, 200], DelD: [190, 118] }, riv: { 6: [228, 168], 3: [190, 92] } },
        {
          name: 'Desborde y centro', note: 'La mediocampista gana por afuera y las delanteras atacan el área.', dur: 2.5, ball: 'MedD',
          our: { MedD: [240, 120], DelI: [125, 88], DelD: [180, 90], MedC: [150, 165] },
          riv: { 6: [205, 132], 3: [205, 66], 2: [110, 62], 5: [150, 130], 4: [70, 150] }
        },
        {
          name: 'Centro y remate', note: 'Centro al área y definición de la delantera.', dur: 1.6, ball: 'DelD', ballAct: 'cross',
          our: { DelD: [172, 74], MedD: [240, 118] }, zones: [[1, 4, '#facc15'], [2, 4, '#facc15']], texts: [{ x: 235, y: 34, text: 'Zona de remate' }]
        },
        { name: 'Remate', note: 'Remate al arco.', dur: 1, ballAct: 'goal' }
      ]
    },
    {
      id: 'arco', name: 'Saque de arco',
      steps: [
        {
          name: 'Saque de arco', note: 'La arquera pone la pelota en juego. Defensoras abiertas, mediocampistas ofreciéndose.', ball: 'Arq',
          our: { Arq: [150, 368], DefI: [72, 322], DefD: [228, 322], MedC: [150, 290], MedI: [55, 250], MedD: [245, 250], DelI: [98, 195], DelD: [202, 195] },
          riv: { 7: [105, 268], 8: [195, 268], 5: [150, 232], 4: [60, 208], 6: [240, 208], 2: [95, 150], 3: [205, 150] }
        },
        { name: 'Pase largo al costado', note: 'Pase largo por encima de la presión hacia la mediocampista de la derecha.', dur: 2, ball: 'MedD', ballAct: 'lob', our: { MedD: [240, 240], DelD: [205, 185] }, riv: { 6: [238, 208] } },
        { name: 'Apoyo y pared', note: 'La delantera baja a apoyar y la mediocampista busca la pared.', dur: 2, ball: 'MedD', our: { DelD: [200, 200], MedC: [165, 262] } }
      ]
    },
    {
      id: 'delantera', name: 'Pase de delantera',
      steps: [
        {
          name: 'Delantera de espaldas al arco', note: 'La delantera recibe de espaldas y protege la pelota.', ball: 'DelI',
          our: { Arq: [150, 345], DefI: [95, 275], DefD: [205, 275], MedI: [65, 215], MedC: [150, 215], MedD: [235, 215], DelI: [100, 150], DelD: [205, 140] },
          riv: { 2: [100, 110], 3: [205, 100], 4: [65, 175], 5: [150, 165], 6: [235, 175], 7: [120, 195], 8: [190, 195] }
        },
        { name: 'Pase a la compañera', note: 'Descarga de primera para la delantera que llega en diagonal.', dur: 1.2, ball: 'DelD', ballAct: 'pass', our: { DelD: [195, 120], DelI: [85, 145] }, riv: { 3: [225, 95], 5: [160, 150] } },
        { name: 'Definición', note: 'Conduce hacia el área y define ante la arquera.', dur: 1.5, ball: 'DelD', our: { DelD: [175, 72] }, riv: { 3: [215, 80] } },
        { name: 'Remate', note: 'Remate al arco.', dur: 1, ballAct: 'goal' }
      ]
    },
    {
      id: 'pared', name: 'Jugada de pared (1-2)',
      steps: [
        {
          name: 'Conducción', note: 'La mediocampista conduce y busca a la delantera para la pared.', ball: 'MedC',
          our: { Arq: [150, 345], DefI: [100, 285], DefD: [200, 285], MedI: [65, 235], MedC: [150, 240], MedD: [235, 235], DelI: [100, 145], DelD: [205, 178] },
          riv: { 5: [150, 190], 7: [112, 215], 8: [190, 212], 4: [65, 195], 6: [235, 190], 2: [100, 105], 3: [205, 105] }
        },
        { name: 'Pase a la pared', note: 'Pase corto a la delantera y arranque de la mediocampista.', dur: 1.2, ball: 'DelD', ballAct: 'pass', our: { MedC: [160, 222] } },
        { name: 'Devolución al espacio', note: 'De primera, la delantera devuelve detrás de la defensa.', dur: 1.6, ball: 'MedC', ballAct: 'pass', our: { MedC: [188, 148], DelD: [208, 180] }, riv: { 5: [150, 205], 8: [192, 205], 3: [205, 110] } },
        { name: 'Definición', note: 'Conduce y define.', dur: 1.5, ball: 'MedC', our: { MedC: [172, 100] }, riv: { 3: [212, 92], 2: [110, 90] } },
        { name: 'Remate', note: 'Remate al arco.', dur: 1, ballAct: 'shot' }
      ]
    }
  ];

  // ------------------------------------------------------------------
  // Estado
  // ------------------------------------------------------------------
  let svg = null;
  let itemsLayer = null;
  let isSetup = false;

  let board = { id: null, name: '', items: [], phases: [], dirty: false };
  let curPhase = 0;
  let selectedId = null;
  let undoStack = [];
  let redoStack = [];
  let drag = null;
  let outsideId = null;
  let pendingAction = null;

  let mode = 'edit';
  let playing = false;
  let playT = 0;
  let lastTs = 0;
  let rafId = 0;
  let speed = 1;
  let loop = false;
  let autoOn = true;
  let recording = false;
  let simTool = 'move';
  let zoneColor = ZONE_COLORS[0].value;
  let showGrid = false;
  let textEditBefore = null;

  const $ = id => document.getElementById(id);
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const round1 = v => Math.round(v * 10) / 10;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const newId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const newPhase = () => ({ name: '', note: '', dur: SIM_DEFAULT_DUR, seq: false });
  const isToken = i => i.type === 'player' || i.type === 'rival';
  const isMovable = i => i.type === 'player' || i.type === 'rival' || i.type === 'ball';
  const keyOf = i => (i.type === 'player' ? 'p:' + i.name : i.type === 'rival' ? 'r:' + i.label : i.type === 'ball' ? 'b:ball' : null);

  board.phases = [newPhase()];

  const snapshot = () => JSON.stringify({ i: board.items, p: board.phases });
  function restore(snap) {
    const s = JSON.parse(snap);
    board.items = s.i;
    board.phases = s.p;
    if (curPhase >= board.phases.length) curPhase = board.phases.length - 1;
  }

  const phaseItems = ph => board.items.filter(i => i.ph === ph);
  const findItem = id => board.items.find(i => i.id === id && i.ph === curPhase) || null;

  function ensureSims() {
    if (!Array.isArray(state.simulations)) state.simulations = [];
  }

  function visibleSims() {
    ensureSims();
    return state.simulations
      .filter(s => !s.deleted)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  const actionsOf = ph => board.items.filter(i => i.type === 'action' && i.ph === ph);

  // ---- Grilla de casilleros (A-C de izquierda a derecha, 1-4 desde el arco propio)
  const parseZone = z => (/^[A-C][1-4]$/.test(z || '') ? { c: 'ABC'.indexOf(z.charAt(0)), r: Number(z.charAt(1)) } : null);
  const zoneName = (c, r) => M.cellName(c, r);
  function cellCenter(c, r) {
    const rect = M.cellRect(c, r);
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  }
  function cellAt(x, y) {
    const c = clamp(Math.floor((x - G.x0) / G.cw), 0, G.cols - 1);
    const rowFromTop = clamp(Math.floor((y - G.y0) / G.ch), 0, G.rows - 1);
    return { c, r: G.rows - rowFromTop };
  }

  function pieceLabel(key) {
    if (key === 'b:ball') return 'Pelota';
    if (key.startsWith('p:')) return key.slice(2);
    if (key.startsWith('r:')) return 'Rival ' + key.slice(2);
    if (key.startsWith('z:')) return 'Zona ' + key.slice(2);
    return key;
  }

  function describeAction(a) {
    const who = pieceLabel(a.who);
    const plural = a.n === 1 ? 'casillero' : 'casilleros';
    switch (a.act) {
      case 'move': return `${who} ${MOVE_VERBS[a.dir] || 'se mueve'} ${a.n} ${plural}`;
      case 'goto': return `${who} va a la zona ${a.zone}`;
      case 'press': return `${who} presiona a ${pieceLabel(a.target)}`;
      case 'mark': return `${who} marca a ${pieceLabel(a.target)}`;
      case 'pass': return `Pelota: pase a ${pieceLabel(a.target)}`;
      case 'cross': return `Pelota: centro a ${pieceLabel(a.target)}`;
      case 'lob': return `Pelota: pase por arriba a ${pieceLabel(a.target)}`;
      case 'space': return `Pelota: al espacio, zona ${a.zone}`;
      case 'shot': return `Pelota: tiro al arco (${SIDE_LABELS[a.side] || 'al medio'})`;
      case 'goal': return `Pelota: gol (${SIDE_LABELS[a.side] || 'al medio'})`;
      default: return who;
    }
  }

  // Cómo viaja la pelota según la acción: por el piso, por el aire o de tiro.
  const ballStyleOf = act => (act === 'cross' || act === 'lob' ? 'air' : (act === 'shot' || act === 'goal' ? 'shot' : 'ground'));
  const easeShot = p => 1 - Math.pow(1 - p, 2);

  // ------------------------------------------------------------------
  // Lo que se ve en cada fase (y entre fases)
  // ------------------------------------------------------------------
  // La pelota "pegada" a una jugadora no guarda su propia posición como verdad:
  // se calcula a partir de quien la lleva, así siempre la acompaña.
  function resolvedPhase(ph) {
    const items = phaseItems(ph).filter(i => i.type !== 'action').map(clone);
    const tokens = new Map(items.filter(isToken).map(i => [keyOf(i), i]));
    items.forEach(i => {
      if (i.type !== 'ball' || !i.carrier) return;
      const holder = tokens.get(i.carrier);
      if (holder) {
        i.x = round1(holder.x + THEME.BALL_DX);
        i.y = round1(holder.y + THEME.BALL_DY);
      }
    });
    return items;
  }

  // Flechas de recorrido: de dónde vino cada pieza que se movió entre dos fases.
  // Se calculan, no se guardan. progressOf(clave) da cuánto avanzó esa pieza (0-1)
  // y hace crecer la flecha durante la animación.
  function autoTrails(from, to, progressOf, alpha) {
    const before = new Map(resolvedPhase(from).filter(isMovable).map(i => [keyOf(i), i]));
    const ballAct = actionsOf(to).find(a => a.who === 'b:ball');
    const out = [];
    resolvedPhase(to).filter(isMovable).forEach(now => {
      const key = keyOf(now);
      const prev = before.get(key);
      if (!prev) return;
      // La pelota que va con la misma jugadora ya se ve en el recorrido de ella.
      if (now.type === 'ball' && now.carrier && prev.carrier && now.carrier === prev.carrier) return;
      const dx = now.x - prev.x;
      const dy = now.y - prev.y;
      const dist = Math.hypot(dx, dy);
      if (dist < TRAIL_MIN) return;
      const reach = dist * progressOf(key);
      const headLen = reach - (now.type === 'ball' ? 8 : TOKEN_R + 3);
      if (headLen < 6) return;
      const ux = dx / dist;
      const uy = dy / dist;
      const color = now.type === 'ball' ? BALL_TRAIL[ballAct ? ballStyleOf(ballAct.act) : 'ground'] : TRAIL_COLORS[now.type];
      out.push({
        id: 'auto:' + key + ':' + to, type: 'arrow', _auto: true,
        x1: prev.x, y1: prev.y, x2: round1(prev.x + ux * headLen), y2: round1(prev.y + uy * headLen),
        color, dash: now.type === 'ball', _o: alpha
      });
    });
    return out;
  }

  // Dónde poner un cartel de medidas w x h sin taparle nada a las fichas: entre los lugares
  // con espacio libre, el más cercano a (ax, ay); si no hay ninguno, el más despejado.
  function roomiestPoint(ph, w, h, ax, ay) {
    const items = resolvedPhase(ph).filter(isMovable);
    const MIN_CLEAR = 4;
    let best = null;
    let bestDist = Infinity;
    let fallback = { x: 150, y: 200 };
    let fallbackClear = -Infinity;
    for (let x = 60; x <= 240; x += 10) {
      for (let y = 40; y <= 350; y += 10) {
        let clearance = Infinity;
        items.forEach(i => {
          const dx = Math.max(Math.abs(i.x - x) - w / 2, 0);
          const dy = Math.max(Math.abs(i.y - y) - h / 2, 0);
          clearance = Math.min(clearance, Math.hypot(dx, dy) - TOKEN_R);
        });
        if (clearance > fallbackClear) { fallbackClear = clearance; fallback = { x, y }; }
        const dist = Math.hypot(x - ax, y - ay);
        if (clearance >= MIN_CLEAR && dist < bestDist) { bestDist = dist; best = { x, y }; }
      }
    }
    return best || fallback;
  }

  // El "¡GOL!" grande que aparece cuando la transición termina en gol, donde no tape a nadie.
  function goalFlash(ph, alpha) {
    if (!actionsOf(ph).some(a => a.act === 'goal')) return [];
    const spot = roomiestPoint(ph, 84, 30, 150, 110);
    return [{ id: 'goal-flash', type: 'text', _auto: true, big: true, x: spot.x, y: spot.y + 9, text: '¡GOL!', color: '#facc15', _o: alpha }];
  }

  const gridItems = () => ((showGrid || (mode === 'edit' && simTool === 'zone')) ? [{ id: 'grid', type: 'grid', _auto: true }] : []);

  function staticFrame(ph) {
    let items = resolvedPhase(ph);
    if (autoOn && ph > 0) items = items.concat(autoTrails(ph - 1, ph, () => 1, 1));
    return items.concat(goalFlash(ph, 1), gridItems());
  }

  // La transición de ph a ph + 1 con progreso p (0-1). Cada pieza se mueve en su
  // "ventana" de tiempo: toda la transición, o su turno si las acciones van una
  // tras otra. La pelota por arriba sube y baja (_h); el tiro sale rápido.
  function transitionFrame(ph, p) {
    const acts = actionsOf(ph + 1);
    const seq = !!(board.phases[ph + 1] && board.phases[ph + 1].seq) && acts.length > 1;
    const localP = key => {
      const idx = acts.findIndex(a => a.who === key);
      if (idx < 0 || !seq) return p;
      return clamp01((p - idx / acts.length) / (1 / acts.length));
    };
    const styleOf = key => {
      const a = key === 'b:ball' ? acts.find(x => x.who === key) : null;
      return a ? ballStyleOf(a.act) : 'ground';
    };
    const easedOf = key => (styleOf(key) === 'shot' ? easeShot : ease)(localP(key));

    const from = resolvedPhase(ph);
    const to = resolvedPhase(ph + 1);
    const fromMov = from.filter(isMovable);
    const toMov = to.filter(isMovable);
    const toMap = new Map(toMov.map(i => [keyOf(i), i]));
    const seen = new Set();
    const out = [];
    fromMov.forEach(a => {
      const key = keyOf(a);
      const b = toMap.get(key);
      if (b) {
        seen.add(key);
        const e = easedOf(key);
        const item = Object.assign({}, a, { x: round1(lerp(a.x, b.x, e)), y: round1(lerp(a.y, b.y, e)) });
        if (styleOf(key) === 'air') item._h = 4 * localP(key) * (1 - localP(key));
        out.push(item);
      } else {
        out.push(Object.assign({}, a, { _o: 1 - ease(p) }));
      }
    });
    toMov.forEach(b => { if (!seen.has(keyOf(b))) out.push(Object.assign({}, b, { _o: ease(p) })); });
    // Textos y casilleros: salen los de la fase que termina y entran los de la que llega.
    from.filter(i => !isMovable(i)).forEach(i => out.push(Object.assign({}, i, { _o: 1 - clamp01(p / 0.3) })));
    to.filter(i => !isMovable(i)).forEach(i => out.push(Object.assign({}, i, { _o: clamp01((p - 0.7) / 0.3) })));
    if (autoOn) {
      if (ph > 0) out.push(...autoTrails(ph - 1, ph, () => 1, 1 - clamp01(p / 0.3)));
      out.push(...autoTrails(ph, ph + 1, easedOf, 1));
    }
    out.push(...goalFlash(ph, 1 - clamp01(p / 0.3)), ...goalFlash(ph + 1, clamp01((p - 0.8) / 0.2)));
    return out.concat(gridItems());
  }

  const holdMs = ph => (board.phases[ph] && board.phases[ph].note ? HOLD_NOTE_MS : HOLD_MS);
  const moveMs = ph => Math.round((board.phases[ph].dur || SIM_DEFAULT_DUR) * 1000);

  function totalMs() {
    let t = 0;
    board.phases.forEach((_, i) => { t += holdMs(i) + (i > 0 ? moveMs(i) : 0); });
    return t;
  }

  // Estado visual a los t milisegundos (a velocidad 1x) desde el principio.
  function frameAt(t) {
    const n = board.phases.length;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const hold = holdMs(i);
      if (t < acc + hold || i === n - 1) return { items: staticFrame(i), phase: i, to: null };
      acc += hold;
      const move = moveMs(i + 1);
      if (t < acc + move) return { items: transitionFrame(i, (t - acc) / move), phase: i, to: i + 1 };
      acc += move;
    }
    return { items: staticFrame(n - 1), phase: n - 1, to: null };
  }

  function captionFor(idx) {
    const p = board.phases[idx] || newPhase();
    return { title: `${idx + 1}/${board.phases.length} · ${p.name || 'Fase ' + (idx + 1)}`, note: p.note || '' };
  }

  // ------------------------------------------------------------------
  // Cambios, deshacer y borrador
  // ------------------------------------------------------------------
  function persistDraft() {
    try {
      if (board.dirty) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          id: board.id, name: board.name, items: board.items, phases: board.phases, dirty: true
        }));
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch (err) { /* localStorage no disponible */ }
  }

  function markDirty() {
    board.dirty = true;
    persistDraft();
    updateStatus();
  }

  function commit(before) {
    if (snapshot() === before) return false;
    undoStack.push(before);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
    markDirty();
    return true;
  }

  function mutate(fn) {
    const before = snapshot();
    fn();
    commit(before);
  }

  function refreshAll() {
    renderBoard();
    renderPlayers();
    updateControls();
  }

  function undo() {
    if (!undoStack.length || mode === 'play') return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
    if (selectedId && !findItem(selectedId)) selectedId = null;
    markDirty();
    refreshAll();
  }

  function redo() {
    if (!redoStack.length || mode === 'play') return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
    if (selectedId && !findItem(selectedId)) selectedId = null;
    markDirty();
    refreshAll();
  }

  // ------------------------------------------------------------------
  // Dibujo en pantalla
  // ------------------------------------------------------------------
  function renderBoard() {
    if (!itemsLayer || mode === 'play') return;
    itemsLayer.innerHTML = '';
    M.renderItemsSvg(itemsLayer, staticFrame(curPhase), { selectedId, outsideId });
  }

  function pointFromClient(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * VIEW_W,
      y: ((clientY - rect.top) / rect.height) * VIEW_H
    };
  }

  function isOverBoard(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  const clampField = p => ({
    x: clamp(p.x, FIELD_BOUNDS.minX, FIELD_BOUNDS.maxX),
    y: clamp(p.y, FIELD_BOUNDS.minY, FIELD_BOUNDS.maxY)
  });
  const clampView = p => ({ x: clamp(p.x, 0, VIEW_W), y: clamp(p.y, 0, VIEW_H) });

  function nextFreeSpot(kind) {
    const rows = kind === 'rival' ? [70, 110, 150] : [330, 290, 250];
    const xs = [50, 100, 150, 200, 250];
    const taken = phaseItems(curPhase).filter(isToken);
    for (const y of rows) {
      for (const x of xs) {
        if (taken.every(t => Math.hypot(t.x - x, t.y - y) > 28)) return { x, y };
      }
    }
    return { x: 150, y: kind === 'rival' ? 100 : 300 };
  }

  // ------------------------------------------------------------------
  // Punteros sobre la cancha (solo mover; en reproducción no se puede editar)
  // ------------------------------------------------------------------
  function select(id) {
    selectedId = id;
    const item = id ? findItem(id) : null;
    if (item && isMovable(item)) $('actPiece').value = keyOf(item);
    if (item && item.type === 'text') $('simTextInput').value = item.text;
    renderBoard();
    updateControls();
  }

  function removeFromPhase(id) {
    const item = findItem(id);
    board.items = board.items.filter(i => !(i.id === id && i.ph === curPhase));
    if (item && isMovable(item)) {
      const key = keyOf(item);
      // Las acciones de esta transición que involucraban a la pieza (como protagonista o destino) ya no valen.
      board.items = board.items.filter(i => !(i.type === 'action' && i.ph === curPhase && (i.who === key || i.target === key)));
      if (isToken(item)) phaseItems(curPhase).forEach(b => { if (b.type === 'ball' && b.carrier === key) b.carrier = ''; });
    }
    if (selectedId === id) selectedId = null;
  }

  // Deja guardada la posición real de las pelotas pegadas (por si después se sueltan).
  function syncBalls(ph) {
    const phIndex = ph === undefined ? curPhase : ph;
    const tokens = new Map(phaseItems(phIndex).filter(isToken).map(i => [keyOf(i), i]));
    phaseItems(phIndex).forEach(b => {
      if (b.type !== 'ball' || !b.carrier) return;
      const holder = tokens.get(b.carrier);
      if (holder) {
        b.x = round1(holder.x + THEME.BALL_DX);
        b.y = round1(holder.y + THEME.BALL_DY);
      } else {
        b.carrier = '';
      }
    });
  }

  function nearestToken(x, y) {
    let best = null;
    let bestDist = SNAP_DIST;
    phaseItems(curPhase).filter(isToken).forEach(t => {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d <= bestDist) { best = t; bestDist = d; }
    });
    return best;
  }

  function onPointerDown(e) {
    if (mode === 'play') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const active = document.activeElement;
    if (active && active !== document.body && active.blur) active.blur();

    const pt = pointFromClient(e.clientX, e.clientY);
    if (simTool === 'zone') { toggleZone(pt); return; }
    if (simTool === 'text') { addText(pt); return; }
    const itemEl = e.target.closest ? e.target.closest('.t-item') : null;
    const item = itemEl ? findItem(itemEl.getAttribute('data-id')) : null;
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
    if (!item) { select(null); return; }
    select(item.id);
    drag = { id: item.id, start: pt, orig: clone(item), before: snapshot(), moved: false, pointerId: e.pointerId };
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const item = findItem(drag.id);
    if (!item) return;
    const pt = pointFromClient(e.clientX, e.clientY);
    const dx = pt.x - drag.start.x;
    const dy = pt.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < 0.8) return;
    drag.moved = true;
    if (isToken(item)) {
      item.x = round1(drag.orig.x + dx);
      item.y = round1(drag.orig.y + dy);
      outsideId = !isOverBoard(e.clientX, e.clientY) ? item.id : null;
    } else if (item.type === 'text') {
      const p = clampView({ x: drag.orig.x + dx, y: drag.orig.y + dy });
      item.x = round1(p.x);
      item.y = round1(p.y);
    } else {
      // Al arrastrar la pelota se despega de quien la llevaba; al soltarla cerca de una jugadora se pega.
      item.carrier = '';
      const p = clampView({ x: drag.orig.x + dx, y: drag.orig.y + dy });
      item.x = round1(p.x);
      item.y = round1(p.y);
    }
    renderBoard();
  }

  function finishDrag(e, cancelled) {
    if (!drag || (e && e.pointerId !== drag.pointerId)) return;
    const d = drag;
    drag = null;
    outsideId = null;
    if (e) { try { svg.releasePointerCapture(e.pointerId); } catch (err) { /* ya liberado */ } }

    if (cancelled) {
      restore(d.before);
    } else {
      const item = findItem(d.id);
      if (item && d.moved && isMovable(item)) {
        // La pieza ya no está donde la dejó su acción: la acción deja de valer.
        const key = keyOf(item);
        board.items = board.items.filter(i => !(i.type === 'action' && i.ph === curPhase && i.who === key));
      }
      if (item && d.moved && item.type !== 'text') {
        if (isToken(item)) {
          if (!isOverBoard(e.clientX, e.clientY)) {
            removeFromPhase(item.id);
          } else {
            const c = clampField(item);
            item.x = round1(c.x);
            item.y = round1(c.y);
          }
        } else {
          const holder = nearestToken(item.x, item.y);
          item.carrier = holder ? keyOf(holder) : '';
        }
        syncBalls();
      }
      commit(d.before);
    }
    refreshAll();
  }

  // ------------------------------------------------------------------
  // Acciones: calcular el destino y escribirlo en la fase actual
  // ------------------------------------------------------------------
  const goalPoint = (act, side) => ({ x: THEME.GOAL_X[side] || THEME.GOAL_X.center, y: THEME.GOAL_Y[act] });

  // Un lugar cercano a p que no encime a otra ficha de la fase.
  function nudgeFree(p, ph, selfKey) {
    const others = phaseItems(ph).filter(isToken).filter(t => keyOf(t) !== selfKey);
    const offsets = [[0, 0], [24, 0], [-24, 0], [0, 24], [0, -24], [24, 24], [-24, 24], [24, -24], [-24, -24], [48, 0], [-48, 0]];
    for (const o of offsets) {
      const q = clampField({ x: p.x + o[0], y: p.y + o[1] });
      if (others.every(t => Math.hypot(t.x - q.x, t.y - q.y) >= 26)) return q;
    }
    return clampField(p);
  }

  // Aplica una acción a la fase a.ph tomando como punto de partida la fase anterior.
  // Devuelve false (sin tocar nada) si falta alguna pieza necesaria.
  function applyAction(a) {
    const dstPh = a.ph;
    if (dstPh < 1) return false;
    const src = resolvedPhase(dstPh - 1);
    const dst = phaseItems(dstPh);
    const dstTokens = dst.filter(isToken);
    const tokenByKey = key => dstTokens.find(t => keyOf(t) === key);

    if (a.who === 'b:ball') {
      let dest = null;
      if (a.act === 'shot' || a.act === 'goal') {
        const g = goalPoint(a.act, a.side);
        dest = { carrier: '', x: g.x, y: g.y };
      } else if (a.act === 'space' || (a.target && a.target.startsWith('z:'))) {
        const z = parseZone(a.act === 'space' ? a.zone : a.target.slice(2));
        if (!z) return false;
        const c = cellCenter(z.c, z.r);
        dest = { carrier: '', x: c.x, y: c.y };
      } else {
        const holder = tokenByKey(a.target);
        if (!holder) return false;
        dest = { carrier: a.target, x: holder.x + THEME.BALL_DX, y: holder.y + THEME.BALL_DY };
      }
      let ball = dst.find(i => i.type === 'ball');
      if (!ball) {
        if (!src.some(i => i.type === 'ball')) return false;
        ball = { id: 'ball', type: 'ball', ph: dstPh, x: 0, y: 0, carrier: '' };
        board.items.push(ball);
      }
      ball.carrier = dest.carrier;
      ball.x = round1(dest.x);
      ball.y = round1(dest.y);
      return true;
    }

    const tok = tokenByKey(a.who);
    const start = src.find(i => keyOf(i) === a.who);
    if (!tok || !start) return false;
    let p = null;
    if (a.act === 'move') {
      const v = DIR_VEC[a.dir];
      if (!v) return false;
      p = clampField({ x: start.x + v[0] * a.n * G.cw, y: start.y + v[1] * a.n * G.ch });
    } else if (a.act === 'goto') {
      const z = parseZone(a.zone);
      if (!z) return false;
      p = nudgeFree(cellCenter(z.c, z.r), dstPh, a.who);
    } else if (a.act === 'press') {
      const target = tokenByKey(a.target);
      if (!target) return false;
      const d = Math.hypot(start.x - target.x, start.y - target.y) || 1;
      p = nudgeFree({ x: target.x + ((start.x - target.x) / d) * 32, y: target.y + ((start.y - target.y) / d) * 32 }, dstPh, a.who);
    } else if (a.act === 'mark') {
      const target = tokenByKey(a.target);
      if (!target) return false;
      // Del lado del arco propio de quien marca: las nuestras abajo del rival, los rivales arriba.
      p = nudgeFree({ x: target.x, y: target.y + (tok.type === 'rival' ? -32 : 32) }, dstPh, a.who);
    } else {
      return false;
    }
    tok.x = round1(p.x);
    tok.y = round1(p.y);
    syncBalls(dstPh);
    return true;
  }

  // Deshace el efecto de una acción: la pieza vuelve a donde estaba en la fase anterior.
  function restoreFromSource(a) {
    const src = resolvedPhase(a.ph - 1);
    const dst = phaseItems(a.ph);
    if (a.who === 'b:ball') {
      const before = src.find(i => i.type === 'ball');
      const ball = dst.find(i => i.type === 'ball');
      if (!before || !ball) return;
      const holds = before.carrier && dst.some(i => isToken(i) && keyOf(i) === before.carrier);
      ball.carrier = holds ? before.carrier : '';
      ball.x = before.x;
      ball.y = before.y;
      syncBalls(a.ph);
      return;
    }
    const tok = dst.find(i => isToken(i) && keyOf(i) === a.who);
    const start = src.find(i => keyOf(i) === a.who);
    if (tok && start) {
      tok.x = start.x;
      tok.y = start.y;
      syncBalls(a.ph);
    }
  }

  // Una acción por pieza y transición: si ya había una, la nueva la reemplaza.
  function addAction(spec) {
    if (curPhase < 1 || mode === 'play') return false;
    const a = Object.assign({ id: newId(), type: 'action', ph: curPhase, dir: '', n: 1, zone: '', target: '', side: 'center' }, spec);
    const before = snapshot();
    board.items = board.items.filter(i => !(i.type === 'action' && i.ph === curPhase && i.who === a.who));
    if (!applyAction(a)) {
      restore(before);
      return false;
    }
    board.items.push(a);
    commit(before);
    refreshAll();
    return true;
  }

  function removeAction(id) {
    const a = board.items.find(i => i.id === id && i.type === 'action');
    if (!a) return;
    mutate(() => {
      board.items = board.items.filter(i => i !== a);
      restoreFromSource(a);
    });
    refreshAll();
  }

  // Cambia el orden de la acción (importa cuando van una tras otra).
  function moveAction(id, delta) {
    const list = actionsOf(curPhase);
    const idx = list.findIndex(a => a.id === id);
    const other = list[idx + delta];
    if (idx < 0 || !other) return;
    mutate(() => {
      const i1 = board.items.indexOf(list[idx]);
      const i2 = board.items.indexOf(other);
      board.items[i1] = other;
      board.items[i2] = list[idx];
    });
    refreshAll();
  }

  // Vuelve a calcular todas las acciones de esta transición desde la fase anterior
  // (útil si se cambió algo en la fase anterior). Las que ya no se pueden aplicar se descartan.
  function recomputeActions() {
    if (curPhase < 1) return;
    const before = snapshot();
    actionsOf(curPhase).forEach(a => {
      if (!applyAction(a)) board.items = board.items.filter(i => i !== a);
    });
    commit(before);
    refreshAll();
  }

  // ------------------------------------------------------------------
  // Casilleros sombreados y cuadros de texto
  // ------------------------------------------------------------------
  function toggleZone(pt) {
    const cell = cellAt(pt.x, pt.y);
    const existing = phaseItems(curPhase).find(i => i.type === 'zone' && i.zc === cell.c && i.zr === cell.r);
    mutate(() => {
      if (existing && existing.color === zoneColor) board.items = board.items.filter(i => i !== existing);
      else if (existing) existing.color = zoneColor;
      else board.items.push({ id: newId(), type: 'zone', ph: curPhase, zc: cell.c, zr: cell.r, color: zoneColor });
    });
    refreshAll();
  }

  function addText(pt) {
    const p = clampView(pt);
    const text = ($('simTextInput').value || '').trim().slice(0, 60) || 'Texto';
    const created = { id: newId(), type: 'text', ph: curPhase, x: round1(p.x), y: round1(p.y), text, color: zoneColor };
    mutate(() => board.items.push(created));
    simTool = 'move';
    select(created.id);
    refreshAll();
  }

  function setSimTool(next) {
    if (mode === 'play') return;
    simTool = next;
    if (next !== 'move') selectedId = null;
    refreshAll();
  }

  function setColor(value) {
    zoneColor = value;
    const item = selectedId ? findItem(selectedId) : null;
    if (item && item.type === 'text') {
      mutate(() => { item.color = value; });
      renderBoard();
    }
    updateControls();
  }

  // ------------------------------------------------------------------
  // Piezas: jugadoras, rivales, pelota
  // ------------------------------------------------------------------
  function addToken(token) {
    mutate(() => board.items.push(Object.assign({ ph: curPhase }, token)));
    refreshAll();
  }

  function addRival() {
    const used = new Set(phaseItems(curPhase).filter(i => i.type === 'rival').map(i => i.label));
    if (used.size >= MAX_RIVALS) return;
    let n = 1;
    while (used.has(String(n))) n++;
    const spot = nextFreeSpot('rival');
    addToken({ id: newId(), type: 'rival', label: String(n), x: spot.x, y: spot.y });
  }

  function addBall() {
    const existing = phaseItems(curPhase).find(i => i.type === 'ball');
    if (existing) { select(existing.id); return; }
    addToken({ id: 'ball', type: 'ball', x: 150, y: 200, carrier: '' });
  }

  function giveBall(token) {
    mutate(() => {
      let ball = phaseItems(curPhase).find(i => i.type === 'ball');
      if (!ball) {
        ball = { id: 'ball', type: 'ball', ph: curPhase, x: token.x, y: token.y, carrier: '' };
        board.items.push(ball);
      }
      ball.carrier = keyOf(token);
      syncBalls();
    });
    refreshAll();
  }

  function releaseBall(ball) {
    mutate(() => { ball.carrier = ''; });
    refreshAll();
  }

  function removeSelected() {
    if (!selectedId || mode === 'play') return;
    const id = selectedId;
    mutate(() => removeFromPhase(id));
    refreshAll();
  }

  // Cambiar quién es una jugadora en TODAS las fases (la pelota que ella lleva la sigue llevando).
  function renamePlayer(oldName, newName) {
    mutate(() => renameEverywhere(oldName, newName));
    refreshAll();
  }

  function renameEverywhere(oldName, newName) {
    const oldKey = 'p:' + oldName;
    const newKey = 'p:' + newName;
    board.items.forEach(i => {
      if (i.type === 'player' && i.name === oldName) i.name = newName;
      if (i.type === 'ball' && i.carrier === oldKey) i.carrier = newKey;
      if (i.type === 'action') {
        if (i.who === oldKey) i.who = newKey;
        if (i.target === oldKey) i.target = newKey;
      }
    });
  }

  const ROLE_GROUP = { Arq: 'Arquera', Def: 'Defensa', Med: 'Mediocampo', Del: 'Delantera' };
  const roleGroup = name => ROLE_GROUP[String(name).slice(0, 3)] || null;

  function boardPlayerNames() {
    return Array.from(new Set(board.items.filter(i => i.type === 'player').map(i => i.name)));
  }

  function roleNames() {
    return boardPlayerNames().filter(n => !state.players[n]);
  }

  // Reemplaza los puestos de una jugada de ejemplo (Arq, DefI...) por jugadoras
  // reales, según la posición principal (o la secundaria) que tengan cargada.
  function assignRoster() {
    const roles = roleNames();
    if (!roles.length) return;
    const taken = new Set(boardPlayerNames().filter(n => state.players[n]));
    const assignments = [];
    roles.forEach(role => {
      const group = roleGroup(role);
      if (!group) return;
      const pick = Object.keys(state.players).find(n => !taken.has(n) && state.players[n].posPrincipal === group)
        || Object.keys(state.players).find(n => !taken.has(n) && state.players[n].posSecundaria === group);
      if (pick) { taken.add(pick); assignments.push([role, pick]); }
    });
    if (!assignments.length) {
      showError('No encontré jugadoras con posición cargada para esos puestos. Cargalas en Evaluador o cambialas una por una.');
      return;
    }
    showError('');
    mutate(() => {
      assignments.forEach(([role, name]) => renameEverywhere(role, name));
    });
    refreshAll();
    $('simStatus').textContent = `Asignó ${assignments.length} jugadoras a sus puestos.`;
  }

  function importFromFormation() {
    const plan = currentPlan();
    const formation = plan.formations[plan.activeFormation];
    const placements = (formation && formation.placements) || {};
    const names = Object.keys(placements);
    if (!names.length) {
      showError('No hay jugadoras ubicadas en la Formación activa. Elegí partido y plan en Formación.');
      return;
    }
    showError('');
    mutate(() => {
      names.forEach(name => {
        const p = placements[name];
        const existing = phaseItems(curPhase).find(i => i.type === 'player' && i.name === name);
        if (existing) { existing.x = round1(p.x); existing.y = round1(p.y); }
        else board.items.push({ id: newId(), type: 'player', ph: curPhase, name, x: round1(p.x), y: round1(p.y) });
      });
      syncBalls();
    });
    refreshAll();
    $('simStatus').textContent = `Trajo ${names.length} jugadoras de ${matchLabel(currentMatch())} (${currentMatch().activePlan}).`;
  }

  function onChipPointerDown(e) {
    if (mode === 'play') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const chip = e.currentTarget;
    const name = chip.dataset.player;
    const startX = e.clientX;
    const startY = e.clientY;
    const ghost = chip.cloneNode(true);
    ghost.classList.add('dragging-ghost');
    document.body.appendChild(ghost);
    moveGhost(ghost, e.clientX, e.clientY);

    function cleanup() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      ghost.remove();
    }
    function onMove(ev) { moveGhost(ghost, ev.clientX, ev.clientY); }
    function onCancel() { cleanup(); }
    function onUp(ev) {
      cleanup();
      if (phaseItems(curPhase).some(i => i.type === 'player' && i.name === name)) return;
      const moved = Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6;
      if (moved && isOverBoard(ev.clientX, ev.clientY)) {
        const p = clampField(pointFromClient(ev.clientX, ev.clientY));
        addToken({ id: newId(), type: 'player', name, x: round1(p.x), y: round1(p.y) });
      } else if (!moved) {
        const spot = nextFreeSpot('player');
        addToken({ id: newId(), type: 'player', name, x: spot.x, y: spot.y });
      }
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
  }

  function renderPlayers() {
    const list = $('simPlayers');
    if (!list) return;
    list.innerHTML = '';
    const placed = new Set(phaseItems(curPhase).filter(i => i.type === 'player').map(i => i.name));
    const names = Object.keys(state.players).filter(n => !placed.has(n));
    if (!Object.keys(state.players).length) {
      list.innerHTML = '<span class="hint">No hay jugadoras cargadas (se agregan en Evaluador).</span>';
    } else if (!names.length) {
      list.innerHTML = '<span class="hint">Todas las jugadoras están en la cancha.</span>';
    }
    names.forEach(name => {
      const chip = document.createElement('div');
      chip.className = 'player-chip';
      chip.dataset.player = name;
      chip.textContent = name;
      const p = state.players[name];
      chip.style.borderLeft = `5px solid ${colorForPosition(p && p.posPrincipal)}`;
      chip.addEventListener('pointerdown', onChipPointerDown);
      list.appendChild(chip);
    });
    const rivals = phaseItems(curPhase).filter(i => i.type === 'rival').length;
    $('addSimRivalBtn').disabled = rivals >= MAX_RIVALS;
    $('simAssignBtn').hidden = !roleNames().length;
  }

  // ------------------------------------------------------------------
  // Fases
  // ------------------------------------------------------------------
  function goPhase(i) {
    if (mode === 'play') exitPlay();
    curPhase = clamp(i, 0, board.phases.length - 1);
    selectedId = null;
    refreshAll();
  }

  // Inserta una fase después de la actual con las mismas piezas (jugadoras,
  // rivales y pelota) en el mismo lugar: después se mueven a donde van.
  function addPhase() {
    if (recording) return;
    if (mode === 'play') exitPlay();
    if (board.phases.length >= MAX_SIM_PHASES) {
      showError(`Máximo ${MAX_SIM_PHASES} fases por simulación.`);
      return;
    }
    showError('');
    const cur = curPhase;
    mutate(() => {
      board.items.forEach(i => { if (i.ph > cur) i.ph += 1; });
      board.phases.splice(cur + 1, 0, newPhase());
      const copies = board.items.filter(i => i.ph === cur && isMovable(i)).map(i => Object.assign(clone(i), { ph: cur + 1 }));
      board.items.push(...copies);
    });
    curPhase = cur + 1;
    selectedId = null;
    refreshAll();
  }

  function removePhase() {
    if (board.phases.length <= 1 || recording) return;
    if (mode === 'play') exitPlay();
    const cur = curPhase;
    mutate(() => {
      board.items = board.items.filter(i => i.ph !== cur);
      board.items.forEach(i => { if (i.ph > cur) i.ph -= 1; });
      board.phases.splice(cur, 1);
    });
    curPhase = Math.min(cur, board.phases.length - 1);
    selectedId = null;
    refreshAll();
  }

  // ------------------------------------------------------------------
  // Reproducción
  // ------------------------------------------------------------------
  const fmtTime = ms => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  function isTabActive() {
    const panel = $('panel-simulacion');
    return !!panel && panel.classList.contains('active');
  }

  function drawFrame(t) {
    const f = frameAt(t);
    itemsLayer.innerHTML = '';
    M.renderItemsSvg(itemsLayer, f.items, {});
    const cap = captionFor(f.to !== null ? f.to : f.phase);
    $('simCaptionTitle').textContent = cap.title;
    $('simCaptionNote').textContent = cap.note;
    const total = totalMs();
    $('simScrubber').value = total ? Math.round((t / total) * 1000) : 0;
    $('simTime').textContent = `${fmtTime(t / speed)} / ${fmtTime(total / speed)}`;
    return { items: f.items, caption: cap };
  }

  function enterPlay() {
    if (mode === 'play') return;
    mode = 'play';
    selectedId = null;
    $('panel-simulacion').classList.add('sim-playing');
    updateControls();
  }

  function pause() {
    playing = false;
    cancelAnimationFrame(rafId);
    updateControls();
  }

  function exitPlay() {
    pause();
    mode = 'edit';
    $('panel-simulacion').classList.remove('sim-playing');
    refreshAll();
  }

  function tick(now) {
    if (!playing) return;
    if (!isTabActive()) { pause(); return; }
    playT += (now - lastTs) * speed;
    lastTs = now;
    const total = totalMs();
    if (playT >= total) {
      if (loop) {
        playT -= total;
      } else {
        playT = total;
        drawFrame(total);
        pause();
        return;
      }
    }
    drawFrame(playT);
    rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (recording) return;
    if (board.phases.length < 2) {
      showError('Agregá al menos 2 fases para reproducir la simulación.');
      return;
    }
    showError('');
    enterPlay();
    if (playT >= totalMs() - 1) playT = 0;
    playing = true;
    lastTs = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
    updateControls();
  }

  function scrubTo(fraction) {
    if (recording) return;
    enterPlay();
    pause();
    playT = clamp(fraction, 0, 1) * totalMs();
    drawFrame(playT);
  }

  // ------------------------------------------------------------------
  // Panel de controles
  // ------------------------------------------------------------------
  function renderPhaseTabs() {
    const tabs = $('simPhaseTabs');
    tabs.innerHTML = '';
    board.phases.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'phase-tab' + (i === curPhase && mode === 'edit' ? ' active' : '');
      btn.textContent = `${i + 1}${p.name ? ' · ' + p.name : ''}`;
      btn.title = p.name || `Fase ${i + 1}`;
      btn.disabled = recording;
      btn.addEventListener('click', () => goPhase(i));
      tabs.appendChild(btn);
    });
  }

  function updateControls() {
    if (!svg) return;
    const playingMode = mode === 'play';
    const phase = board.phases[curPhase] || newPhase();
    renderPhaseTabs();

    const nameEl = $('phaseName');
    if (document.activeElement !== nameEl) nameEl.value = phase.name;
    const noteEl = $('phaseNote');
    if (document.activeElement !== noteEl) noteEl.value = phase.note;
    const durEl = $('phaseDur');
    if (document.activeElement !== durEl) durEl.value = phase.dur;
    $('phaseDurLabel').textContent = curPhase === 0
      ? 'La primera fase no tiene transición.'
      : `Transición hacia esta fase: ${String(phase.dur).replace('.', ',')} s`;
    [nameEl, noteEl].forEach(el => { el.disabled = playingMode || recording; });
    durEl.disabled = playingMode || recording || curPhase === 0;

    $('removePhaseBtn').disabled = board.phases.length <= 1 || playingMode || recording;
    $('addPhaseBtn').disabled = recording || board.phases.length >= MAX_SIM_PHASES;
    $('simUndo').disabled = playingMode || !undoStack.length;
    $('simRedo').disabled = playingMode || !redoStack.length;
    $('simClearPhase').disabled = playingMode || !phaseItems(curPhase).length;

    $('simPlayBtn').textContent = playing ? 'Pausar' : 'Reproducir';
    $('simPlayBtn').disabled = recording;
    $('simScrubber').disabled = recording || board.phases.length < 2;
    $('simEditBtn').hidden = !playingMode || recording;
    $('simCaption').hidden = !playingMode;
    if (!playingMode) {
      $('simTime').textContent = `Duración: ${fmtTime(totalMs() / speed)}`;
      $('simScrubber').value = 0;
    }

    const videoBtn = $('exportVideoBtn');
    videoBtn.disabled = recording || board.phases.length < 2 || !M.videoSupported();
    videoBtn.title = !M.videoSupported()
      ? 'Este navegador no puede grabar video.'
      : (board.phases.length < 2 ? 'Agregá al menos 2 fases para grabar la simulación.' : '');

    document.querySelectorAll('[data-simtool]').forEach(b => b.classList.toggle('active', b.dataset.simtool === simTool));
    const picked = !playingMode && selectedId ? findItem(selectedId) : null;
    const shownColor = picked && picked.type === 'text' ? picked.color : zoneColor;
    document.querySelectorAll('#simColors .swatch').forEach(b => b.classList.toggle('active', b.dataset.color === shownColor));
    $('simGrid').checked = showGrid;
    $('simToolHint').textContent = {
      move: 'Mover: arrastrá fichas y textos. La pelota se pega a la jugadora si la soltás cerca.',
      text: 'Texto: escribilo arriba y tocá la cancha para ponerlo (aparece solo en esta fase).',
      zone: 'Zona: tocá un casillero para sombrearlo en esta fase; tocalo de nuevo para sacarlo.'
    }[simTool];

    updateSelBar();
    renderActionPanel();
  }

  // Cambia las opciones de un <select> solo si cambiaron (así no se pierde lo que se estaba eligiendo).
  function setOptions(sel, opts, wanted) {
    const sig = JSON.stringify(opts);
    const prev = sel.value;
    if (sel.dataset.sig !== sig) {
      sel.innerHTML = '';
      opts.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o[0];
        opt.textContent = o[1];
        sel.appendChild(opt);
      });
      sel.dataset.sig = sig;
    }
    const want = wanted !== undefined ? wanted : prev;
    if (opts.some(o => o[0] === want)) sel.value = want;
    else if (opts.length) sel.value = opts[0][0];
  }

  const ALL_ZONES = [];
  for (let r = G.rows; r >= 1; r--) {
    for (let c = 0; c < G.cols; c++) ALL_ZONES.push([zoneName(c, r), `${zoneName(c, r)} · ${ZONE_BAND[r]}`]);
  }

  function renderActionPanel() {
    const first = curPhase === 0;
    const playingMode = mode === 'play';
    $('simActionForm').hidden = first;
    $('simSeqRow').hidden = first;
    $('simActionsHint').textContent = first
      ? 'La primera fase no tiene transición: las acciones se agregan desde la fase 2.'
      : `Transición ${curPhase} → ${curPhase + 1}: elegí una pieza y qué hace. La app la mueve en esta fase; si después la arrastrás a mano, la acción se quita.`;
    const list = $('simActionList');
    list.innerHTML = '';
    $('recalcBtn').disabled = true;
    if (first) return;

    const src = resolvedPhase(curPhase - 1).filter(isMovable);
    const dstKeys = new Set(phaseItems(curPhase).filter(isMovable).map(keyOf));
    const pieces = src.filter(i => dstKeys.has(keyOf(i))).map(i => [keyOf(i), pieceLabel(keyOf(i))]);
    setOptions($('actPiece'), pieces);
    const who = $('actPiece').value;
    const isBall = who === 'b:ball';
    setOptions($('actType'), (isBall ? BALL_ACTS : TOKEN_ACTS).map(a => [a, ACT_LABELS[a]]));
    const type = $('actType').value;

    const usesTarget = ['press', 'mark', 'pass', 'cross', 'lob'].includes(type);
    const targets = phaseItems(curPhase).filter(isToken).filter(i => keyOf(i) !== who).map(i => [keyOf(i), pieceLabel(keyOf(i))]);
    const withZones = type === 'cross' || type === 'lob';
    setOptions($('actTarget'), withZones ? targets.concat(ALL_ZONES.map(z => ['z:' + z[0], 'Zona ' + z[1]])) : targets);
    setOptions($('actZone'), ALL_ZONES);
    $('actN').hidden = !MOVE_LABELS[type];
    $('actNUnit').hidden = !MOVE_LABELS[type];
    $('actZone').hidden = !(type === 'goto' || type === 'space');
    $('actTarget').hidden = !usesTarget;
    $('actSide').hidden = !(type === 'shot' || type === 'goal');
    $('addActionBtn').disabled = playingMode || recording || !pieces.length;

    const seqBox = $('simSeq');
    seqBox.checked = !!(board.phases[curPhase] && board.phases[curPhase].seq);
    seqBox.disabled = playingMode || recording;
    $('recalcBtn').disabled = playingMode || recording || !actionsOf(curPhase).length;

    const acts = actionsOf(curPhase);
    if (!acts.length) {
      const li = document.createElement('li');
      li.className = 'hint';
      li.textContent = 'Todavía no hay acciones en esta transición: las fichas se mueven en línea recta de un lugar al otro.';
      list.appendChild(li);
    }
    acts.forEach((a, i) => {
      const li = document.createElement('li');
      li.className = 'sim-action';
      const label = document.createElement('span');
      label.textContent = (board.phases[curPhase].seq ? `${i + 1}. ` : '') + describeAction(a);
      li.appendChild(label);
      [['▲', -1, 'Subir'], ['▼', 1, 'Bajar']].forEach(([txt, delta, title]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tool-btn sim-mini';
        b.textContent = txt;
        b.title = title;
        b.disabled = playingMode || recording || !acts[i + delta];
        b.addEventListener('click', () => moveAction(a.id, delta));
        li.appendChild(b);
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'tool-btn sim-mini';
      del.textContent = '✕';
      del.title = 'Quitar la acción (la pieza vuelve a donde estaba)';
      del.disabled = playingMode || recording;
      del.addEventListener('click', () => removeAction(a.id));
      li.appendChild(del);
      list.appendChild(li);
    });
  }

  function readActionSpec() {
    const who = $('actPiece').value;
    const type = $('actType').value;
    if (!who || !type) return null;
    const spec = { who };
    if (DIR_VEC[type]) { spec.act = 'move'; spec.dir = type; spec.n = Number($('actN').value) || 1; }
    else spec.act = type;
    if (type === 'goto' || type === 'space') spec.zone = $('actZone').value;
    if (['press', 'mark', 'pass', 'cross', 'lob'].includes(type)) spec.target = $('actTarget').value;
    if (type === 'shot' || type === 'goal') spec.side = $('actSide').value;
    return spec;
  }

  // La barra de la ficha elegida ocupa siempre el mismo lugar (ver .sim-selbar en el CSS):
  // sin nada elegido muestra una ayuda, así tocar una ficha no cambia el alto de la página.
  function updateSelBar() {
    const item = mode === 'edit' && selectedId ? findItem(selectedId) : null;
    const label = $('simSelLabel');
    const rename = $('simRename');
    const giveBtn = $('simGiveBall');
    const releaseBtn = $('simReleaseBall');
    const removeBtn = $('simRemoveSel');
    const textIn = $('simTextInput');
    [rename, giveBtn, releaseBtn, removeBtn, textIn].forEach(el => { el.hidden = true; });
    if (mode !== 'edit') { label.textContent = ''; return; }
    if (!item) {
      if (simTool === 'text') { label.textContent = 'Texto:'; textIn.hidden = false; }
      else if (simTool === 'zone') label.textContent = 'Zona: tocá un casillero de la cancha.';
      else label.textContent = 'Tocá una ficha, la pelota o un texto para elegirlo.';
      return;
    }
    removeBtn.hidden = false;
    if (item.type === 'text') {
      label.textContent = 'Texto';
      textIn.hidden = false;
      return;
    }
    if (item.type === 'ball') {
      const holder = item.carrier ? phaseItems(curPhase).find(i => keyOf(i) === item.carrier) : null;
      label.textContent = holder ? `Pelota, la lleva ${holder.type === 'rival' ? 'rival ' + holder.label : holder.name}` : 'Pelota (suelta)';
      releaseBtn.hidden = !item.carrier;
      return;
    }
    label.textContent = item.type === 'rival' ? `Rival ${item.label}` : `Jugadora ${item.name}`;
    giveBtn.hidden = false;
    if (item.type === 'player') {
      rename.hidden = false;
      const used = new Set(boardPlayerNames());
      rename.innerHTML = '<option value="">Cambiar por…</option>';
      Object.keys(state.players).filter(n => !used.has(n)).forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        rename.appendChild(opt);
      });
      rename.value = '';
    }
  }

  function updateStatus() {
    const el = $('simStatus');
    if (!el) return;
    if (board.dirty) el.textContent = 'Cambios sin guardar';
    else el.textContent = board.id ? 'Guardada' : '';
  }

  function showError(message) {
    const el = $('simError');
    if (el) el.textContent = message || '';
  }

  // ------------------------------------------------------------------
  // Guardar / abrir / nueva / eliminar
  // ------------------------------------------------------------------
  function flattenBoard() {
    const metas = board.phases.map((p, i) => ({
      id: 'ph' + i, type: 'phase', ph: i, name: p.name, note: p.note, dur: p.dur, seq: !!p.seq
    }));
    return metas.concat(clone(board.items));
  }

  function splitFlat(flat) {
    const all = sanitizeSimItems(flat);
    const metas = all.filter(i => i.type === 'phase');
    const items = all.filter(i => i.type !== 'phase');
    let count = 1;
    metas.forEach(m => { count = Math.max(count, m.ph + 1); });
    items.forEach(i => { count = Math.max(count, i.ph + 1); });
    count = Math.min(count, MAX_SIM_PHASES);
    const phases = [];
    for (let i = 0; i < count; i++) {
      const m = metas.find(x => x.ph === i);
      phases.push(m ? { name: m.name, note: m.note, dur: m.dur, seq: !!m.seq } : newPhase());
    }
    items.forEach(i => { if (i.ph >= count) i.ph = count - 1; });
    return { items, phases };
  }

  function saveSim(asCopy) {
    const name = board.name.trim();
    if (!name) {
      showError('Ponele un nombre a la simulación para guardarla.');
      $('simName').focus();
      return false;
    }
    showError('');
    ensureSims();
    const now = new Date().toISOString();
    const items = flattenBoard();
    let sim = !asCopy && board.id ? state.simulations.find(s => s.id === board.id) : null;

    if (sim) {
      sim.name = name;
      sim.items = items;
      sim.updatedAt = now;
      sim.deleted = false;
    } else {
      const current = board.id ? state.simulations.find(s => s.id === board.id) : null;
      const finalName = asCopy && current && current.name === name ? `${name} (copia)` : name;
      sim = {
        id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name: finalName, createdAt: now, updatedAt: now, deleted: false, items
      };
      state.simulations.push(sim);
    }

    board.id = sim.id;
    board.name = sim.name;
    board.dirty = false;
    saveState();
    persistDraft();
    renderSimulacion();
    $('simStatus').textContent = 'Guardada';
    return true;
  }

  function loadBoard(next) {
    pause();
    mode = 'edit';
    $('panel-simulacion').classList.remove('sim-playing');
    board = next;
    curPhase = 0;
    selectedId = null;
    playT = 0;
    undoStack = [];
    redoStack = [];
    persistDraft();
    renderSimulacion();
  }

  function openSim(id) {
    const sim = visibleSims().find(s => s.id === id);
    if (!sim) return;
    showError('');
    const parts = splitFlat(sim.items);
    loadBoard({ id: sim.id, name: sim.name, items: parts.items, phases: parts.phases, dirty: false });
  }

  function newSim() {
    showError('');
    loadBoard({ id: null, name: '', items: [], phases: [newPhase()], dirty: false });
  }

  function guard(action) {
    if (!board.dirty) { action(); return; }
    pendingAction = action;
    $('simConfirm').hidden = false;
  }

  function closeConfirm() {
    pendingAction = null;
    $('simConfirm').hidden = true;
    renderSimSelect();
  }

  function runPending() {
    const action = pendingAction;
    $('simConfirm').hidden = true;
    pendingAction = null;
    if (action) action();
  }

  function renderSimSelect() {
    const sel = $('simSelect');
    if (!sel) return;
    const list = visibleSims();
    sel.innerHTML = '';
    const isSaved = !!board.id && list.some(s => s.id === board.id);
    if (!isSaved) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = list.length ? '— Simulación nueva —' : '— Sin simulaciones guardadas —';
      sel.appendChild(opt);
    }
    list.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      const phases = s.items.filter(i => i.type === 'phase').length;
      const date = formatDateDisplay(String(s.updatedAt).slice(0, 10));
      opt.textContent = `${s.name}${phases > 1 ? ` (${phases} fases)` : ''}${date ? ' — ' + date : ''}`;
      sel.appendChild(opt);
    });
    sel.value = isSaved ? board.id : '';
    $('removeSimBtn').disabled = !isSaved;
  }

  function renderStartOptions() {
    const tpl = $('simTemplate');
    if (tpl && !tpl.options.length) {
      tpl.innerHTML = '<option value="">Elegí una jugada de ejemplo…</option>';
      TEMPLATES.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.name} (${t.steps.length} fases)`;
        tpl.appendChild(opt);
      });
    }
    const from = $('simFromTactic');
    if (from) {
      const keep = from.value;
      from.innerHTML = '<option value="">Elegí una táctica guardada…</option>';
      (Array.isArray(state.tactics) ? state.tactics : []).filter(t => !t.deleted).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        from.appendChild(opt);
      });
      from.value = keep && Array.from(from.options).some(o => o.value === keep) ? keep : '';
    }
  }

  function setupRemoveButton() {
    const btn = $('removeSimBtn');
    let armed = false;
    let timer = null;
    btn.addEventListener('click', () => {
      if (!board.id) return;
      if (!armed) {
        armed = true;
        btn.textContent = '¿Seguro? Tocá de nuevo';
        clearTimeout(timer);
        timer = setTimeout(() => { armed = false; btn.textContent = 'Eliminar'; }, 3000);
        return;
      }
      armed = false;
      clearTimeout(timer);
      btn.textContent = 'Eliminar';
      const sim = state.simulations.find(s => s.id === board.id);
      if (sim) {
        sim.deleted = true;
        sim.items = [];
        sim.updatedAt = new Date().toISOString();
        saveState();
      }
      newSim();
    });
  }

  // ------------------------------------------------------------------
  // Punto de partida: jugada de ejemplo o táctica guardada
  // ------------------------------------------------------------------
  function boardFromTemplate(tpl) {
    const our = clone(OUR_BASE);
    const riv = clone(RIV_BASE);
    const phases = [];
    const items = [];
    let ballSpec = null;
    tpl.steps.forEach((st, idx) => {
      Object.assign(our, st.our || {});
      Object.assign(riv, st.riv || {});
      if (st.ball) ballSpec = { carrier: st.ball };
      if (st.ballAt) ballSpec = { at: st.ballAt };
      if (st.ballAct === 'goal' || st.ballAct === 'shot') ballSpec = { at: [THEME.GOAL_X.center, THEME.GOAL_Y[st.ballAct]] };
      phases.push({ name: st.name, note: st.note, dur: idx === 0 ? SIM_DEFAULT_DUR : (st.dur || SIM_DEFAULT_DUR), seq: false });
      Object.keys(our).forEach(role => {
        items.push({ id: newId(), type: 'player', ph: idx, name: role, x: our[role][0], y: our[role][1] });
      });
      Object.keys(riv).forEach(n => {
        items.push({ id: newId(), type: 'rival', ph: idx, label: String(n), x: riv[n][0], y: riv[n][1] });
      });
      if (ballSpec && ballSpec.carrier) {
        const c = our[ballSpec.carrier];
        items.push({
          id: 'ball', type: 'ball', ph: idx, x: c[0] + THEME.BALL_DX, y: c[1] + THEME.BALL_DY, carrier: 'p:' + ballSpec.carrier
        });
      } else if (ballSpec) {
        items.push({ id: 'ball', type: 'ball', ph: idx, x: ballSpec.at[0], y: ballSpec.at[1], carrier: '' });
      }
      if (st.ballAct && idx > 0) {
        items.push({
          id: newId(), type: 'action', ph: idx, who: 'b:ball', act: st.ballAct, dir: '', n: 1, zone: '', side: 'center',
          target: st.ballAct === 'goal' || st.ballAct === 'shot' ? '' : 'p:' + st.ball
        });
      }
      (st.zones || []).forEach(z => items.push({ id: newId(), type: 'zone', ph: idx, zc: z[0], zr: z[1], color: z[2] }));
      (st.texts || []).forEach(t => items.push({ id: newId(), type: 'text', ph: idx, x: t.x, y: t.y, text: t.text, color: '#ffffff' }));
    });
    return { name: tpl.name, items, phases };
  }

  function boardFromTactic(tactic) {
    const items = [];
    (tactic.items || []).forEach(i => {
      if (i.type === 'player') items.push({ id: newId(), type: 'player', ph: 0, name: i.name, x: i.x, y: i.y });
      else if (i.type === 'rival') items.push({ id: newId(), type: 'rival', ph: 0, label: i.label, x: i.x, y: i.y });
      else if (i.type === 'ball' && !items.some(x => x.type === 'ball')) {
        items.push({ id: 'ball', type: 'ball', ph: 0, x: i.x, y: i.y, carrier: '' });
      }
    });
    // Una pelota que en la táctica estaba pegada a una jugadora queda con ella.
    const ball = items.find(i => i.type === 'ball');
    if (ball) {
      let best = null;
      let bestDist = SNAP_DIST;
      items.filter(isToken).forEach(t => {
        const d = Math.hypot(t.x - ball.x, t.y - ball.y);
        if (d <= bestDist) { best = t; bestDist = d; }
      });
      if (best) ball.carrier = keyOf(best);
    }
    return { name: tactic.name, items, phases: [newPhase()] };
  }

  function startFrom(parts) {
    showError('');
    loadBoard({ id: null, name: parts.name, items: parts.items, phases: parts.phases, dirty: true });
    persistDraft();
  }

  // ------------------------------------------------------------------
  // Descargar video
  // ------------------------------------------------------------------
  async function deliverFile(blob, filename, mimeType) {
    const file = new File([blob], filename, { type: mimeType });
    const wantsShare = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (wantsShare && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: board.name.trim() || 'Simulación' });
        return 'shared';
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return 'downloaded';
  }

  async function exportVideo() {
    if (recording) return;
    if (board.phases.length < 2) {
      showError('Agregá al menos 2 fases para grabar la simulación.');
      return;
    }
    if (!M.videoSupported()) {
      showError('Este navegador no puede grabar video. Probá con Chrome o Safari.');
      return;
    }
    showError('');
    recording = true;
    pause();
    enterPlay();
    updateControls();
    const total = totalMs();
    const spd = speed;
    const status = $('simStatus');
    try {
      const result = await M.recordVideo({
        title: board.name.trim() || 'Simulación',
        subtitle: `DTCommander · ${formatDateDisplay(new Date().toISOString().slice(0, 10))}`,
        durationMs: total / spd,
        getFrame: elapsed => {
          const t = Math.min(total, elapsed * spd);
          playT = t;
          return drawFrame(t);
        },
        onProgress: p => { status.textContent = `Grabando video… ${Math.round(p * 100)}%`; }
      });
      const slug = (board.name.trim() || 'simulacion')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'simulacion';
      const how = await deliverFile(result.blob, `${slug}.${result.extension}`, result.mimeType);
      status.textContent = how === 'downloaded' ? `Video descargado (${result.extension.toUpperCase()})` : (how === 'shared' ? 'Video compartido' : '');
    } catch (err) {
      console.error('No se pudo grabar la simulación:', err);
      showError('No se pudo grabar el video.');
      updateStatus();
    } finally {
      recording = false;
      playT = total;
      drawFrame(total);
      updateControls();
    }
  }

  // ------------------------------------------------------------------
  // Setup y render general
  // ------------------------------------------------------------------
  function restoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft || !draft.dirty) return;
      const parts = splitFlat([].concat(
        (Array.isArray(draft.phases) ? draft.phases : []).slice(0, MAX_SIM_PHASES).map((p, i) => ({
          id: 'ph' + i, type: 'phase', ph: i, name: p && p.name, note: p && p.note, dur: p && p.dur, seq: !!(p && p.seq)
        })),
        Array.isArray(draft.items) ? draft.items : []
      ));
      board = { id: draft.id || null, name: String(draft.name || '').slice(0, 60), items: parts.items, phases: parts.phases, dirty: true };
    } catch (err) { /* borrador ilegible: se ignora */ }
  }

  // Campo de la fase (nombre, nota, tiempo) con un solo punto de "deshacer" por edición.
  function bindPhaseField(el, apply) {
    let before = null;
    el.addEventListener('focus', () => { before = snapshot(); });
    el.addEventListener('input', () => { apply(el.value); renderPhaseTabs(); updateControlsLight(); });
    el.addEventListener('change', () => {
      if (before !== null) commit(before);
      before = null;
    });
  }

  function updateControlsLight() {
    $('phaseDurLabel').textContent = curPhase === 0
      ? 'La primera fase no tiene transición.'
      : `Transición hacia esta fase: ${String(board.phases[curPhase].dur).replace('.', ',')} s`;
    if (mode === 'edit') $('simTime').textContent = `Duración: ${fmtTime(totalMs() / speed)}`;
  }

  function setupSimulacion() {
    if (isSetup) return;
    svg = $('simField');
    if (!svg) return;
    isSetup = true;
    ensureSims();

    M.drawPitchSvg(svg);
    itemsLayer = M.svgEl('g', { id: 'simItems' }, svg);
    M.loadCrest();

    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup', e => finishDrag(e, false));
    svg.addEventListener('pointercancel', e => finishDrag(e, true));

    $('addSimRivalBtn').addEventListener('click', () => { if (mode === 'edit') addRival(); });
    $('addSimBallBtn').addEventListener('click', () => { if (mode === 'edit') addBall(); });
    $('simImportFormationBtn').addEventListener('click', () => { if (mode === 'edit') importFromFormation(); });
    $('simAssignBtn').addEventListener('click', () => { if (mode === 'edit') assignRoster(); });

    $('simGiveBall').addEventListener('click', () => {
      const item = selectedId ? findItem(selectedId) : null;
      if (item && isToken(item)) giveBall(item);
    });
    $('simReleaseBall').addEventListener('click', () => {
      const item = selectedId ? findItem(selectedId) : null;
      if (item && item.type === 'ball') releaseBall(item);
    });
    $('simRemoveSel').addEventListener('click', removeSelected);
    $('simRename').addEventListener('change', e => {
      const item = selectedId ? findItem(selectedId) : null;
      if (item && item.type === 'player' && e.target.value) renamePlayer(item.name, e.target.value);
    });

    document.querySelectorAll('[data-simtool]').forEach(b => b.addEventListener('click', () => setSimTool(b.dataset.simtool)));
    const colors = $('simColors');
    colors.innerHTML = '';
    ZONE_COLORS.forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch';
      btn.dataset.color = c.value;
      btn.title = c.name;
      btn.setAttribute('aria-label', c.name);
      btn.style.background = c.value;
      btn.addEventListener('click', () => setColor(c.value));
      colors.appendChild(btn);
    });
    $('simGrid').addEventListener('change', e => {
      showGrid = e.target.checked;
      if (mode === 'play') drawFrame(playT); else renderBoard();
    });
    const textInput = $('simTextInput');
    textInput.addEventListener('focus', () => { textEditBefore = snapshot(); });
    textInput.addEventListener('input', () => {
      const item = selectedId ? findItem(selectedId) : null;
      const value = textInput.value.slice(0, 60);
      if (item && item.type === 'text' && value.trim()) {
        item.text = value;
        renderBoard();
      }
    });
    textInput.addEventListener('change', () => {
      const item = selectedId ? findItem(selectedId) : null;
      if (item && item.type === 'text' && textEditBefore !== null) commit(textEditBefore);
      textEditBefore = null;
      if (item && item.type === 'text') textInput.value = item.text;
    });

    $('actPiece').addEventListener('change', renderActionPanel);
    $('actType').addEventListener('change', renderActionPanel);
    $('addActionBtn').addEventListener('click', () => {
      const spec = readActionSpec();
      if (!spec) return;
      if (!addAction(spec)) showError('No se pudo aplicar esa acción: falta alguna de las piezas en esta fase.');
      else showError('');
    });
    $('simSeq').addEventListener('change', e => {
      mutate(() => { board.phases[curPhase].seq = e.target.checked; });
      refreshAll();
    });
    $('recalcBtn').addEventListener('click', recomputeActions);

    $('simUndo').addEventListener('click', undo);
    $('simRedo').addEventListener('click', redo);
    const clearBtn = $('simClearPhase');
    let clearArmed = false;
    let clearTimer = null;
    clearBtn.addEventListener('click', () => {
      if (!phaseItems(curPhase).length) return;
      if (!clearArmed) {
        clearArmed = true;
        clearBtn.textContent = '¿Seguro? Tocá de nuevo';
        clearTimeout(clearTimer);
        clearTimer = setTimeout(() => { clearArmed = false; clearBtn.textContent = 'Vaciar fase'; }, 3000);
        return;
      }
      clearArmed = false;
      clearTimeout(clearTimer);
      clearBtn.textContent = 'Vaciar fase';
      mutate(() => { board.items = board.items.filter(i => i.ph !== curPhase); selectedId = null; });
      refreshAll();
    });

    $('addPhaseBtn').addEventListener('click', addPhase);
    const removePhaseBtn = $('removePhaseBtn');
    let removeArmed = false;
    let removeTimer = null;
    removePhaseBtn.addEventListener('click', () => {
      if (board.phases.length <= 1) return;
      if (!removeArmed) {
        removeArmed = true;
        removePhaseBtn.textContent = '¿Seguro? Tocá de nuevo';
        clearTimeout(removeTimer);
        removeTimer = setTimeout(() => { removeArmed = false; removePhaseBtn.textContent = 'Eliminar fase'; }, 3000);
        return;
      }
      removeArmed = false;
      clearTimeout(removeTimer);
      removePhaseBtn.textContent = 'Eliminar fase';
      removePhase();
    });

    bindPhaseField($('phaseName'), v => { board.phases[curPhase].name = v.slice(0, 40); });
    bindPhaseField($('phaseNote'), v => { board.phases[curPhase].note = v.slice(0, 140); });
    bindPhaseField($('phaseDur'), v => { board.phases[curPhase].dur = clamp(Number(v) || SIM_DEFAULT_DUR, 0.5, 6); });

    $('simPlayBtn').addEventListener('click', () => { if (playing) pause(); else play(); });
    $('simEditBtn').addEventListener('click', () => {
      // Al volver a editar se queda en la fase que se estaba mirando.
      const f = frameAt(playT);
      curPhase = f.to !== null ? f.to : f.phase;
      exitPlay();
    });
    $('simScrubber').addEventListener('input', e => scrubTo(Number(e.target.value) / 1000));
    $('simSpeed').addEventListener('change', e => { speed = Number(e.target.value) || 1; updateControlsLight(); if (mode === 'play') drawFrame(playT); });
    $('simLoop').addEventListener('change', e => { loop = e.target.checked; });
    $('simAuto').addEventListener('change', e => {
      autoOn = e.target.checked;
      if (mode === 'play') drawFrame(playT); else renderBoard();
    });

    $('simName').addEventListener('input', e => {
      board.name = e.target.value;
      showError('');
      markDirty();
    });
    $('saveSimBtn').addEventListener('click', () => saveSim(false));
    $('saveSimCopyBtn').addEventListener('click', () => saveSim(true));
    $('exportVideoBtn').addEventListener('click', exportVideo);

    $('newSimBtn').addEventListener('click', () => guard(newSim));
    $('simSelect').addEventListener('change', e => {
      const id = e.target.value;
      if (!id || id === board.id) { renderSimSelect(); return; }
      guard(() => openSim(id));
    });
    $('simConfirmSave').addEventListener('click', () => { if (saveSim(false)) runPending(); });
    $('simConfirmDiscard').addEventListener('click', runPending);
    $('simConfirmCancel').addEventListener('click', closeConfirm);
    setupRemoveButton();

    $('useTemplateBtn').addEventListener('click', () => {
      const tpl = TEMPLATES.find(t => t.id === $('simTemplate').value);
      if (!tpl) { showError('Elegí primero una jugada de ejemplo.'); return; }
      guard(() => startFrom(boardFromTemplate(tpl)));
    });
    $('useTacticBtn').addEventListener('click', () => {
      const tactic = (state.tactics || []).find(t => t.id === $('simFromTactic').value && !t.deleted);
      if (!tactic) { showError('Elegí primero una táctica guardada.'); return; }
      const parts = boardFromTactic(tactic);
      if (!parts.items.length) { showError('Esa táctica no tiene jugadoras, rivales ni pelota para tomar.'); return; }
      guard(() => startFrom(parts));
    });

    document.addEventListener('keydown', e => {
      const panel = $('panel-simulacion');
      if (!panel || !panel.classList.contains('active') || mode === 'play') return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        removeSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    });

    restoreDraft();
  }

  function renderSimulacion() {
    if (!isSetup) return;
    ensureSims();
    renderSimSelect();
    renderStartOptions();
    const nameInput = $('simName');
    if (document.activeElement !== nameInput) nameInput.value = board.name;
    refreshAll();
    updateStatus();
  }

  window.setupSimulacion = setupSimulacion;
  window.renderSimulacion = renderSimulacion;
})();
