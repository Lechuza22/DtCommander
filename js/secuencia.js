// ==================================================================
// DTCommander — solapa Secuencia: una jugada grabada moviendo las piezas.
//
// Distinta de Simulación (fases con acciones): acá no hay fases. Se arma la
// cancha (posiciones de arranque) y después se GRABA arrastrando las fichas y
// la pelota: cada arrastre queda como un movimiento, dibujado en la cancha con
// su flecha y el número de su paso. Un paso nuevo va después del anterior; "mismo
// paso" suma el movimiento al paso actual para que pasen a la vez. Las posiciones
// de cada momento no se guardan: se calculan aplicando los movimientos en orden.
//
// Depende de js/simulacion-media.js (window.SimMedia, window.SimTemplates) y de
// js/app.js (state, saveState, sanitizeSimItems, ...). Expone window.setupSecuencia
// y window.renderSecuencia.
// ==================================================================
(function () {
  const M = window.SimMedia;
  const TPL = window.SimTemplates || { TEMPLATES: [], OUR_BASE: {}, RIV_BASE: {} };
  const THEME = M.THEME;
  const G = THEME.GRID;
  const VIEW_W = THEME.W;
  const VIEW_H = THEME.H;
  const DRAFT_KEY = 'dtcomander_seq_draft';
  const MAX_UNDO = 60;
  const MAX_RIVALS = 11;
  const MAX_STEPS = 30;
  const SNAP_DIST = 20;
  const HOLD_START = 900;
  const HOLD_STEP = 400;
  const HOLD_TEXT = 1600;
  const MIN_MOVE = 6;
  const FAINT = 0.38;
  const KIND_LABELS = { pass: 'Pase', cross: 'Centro', lob: 'Pase por arriba', shot: 'Tiro al arco', goal: 'Gol' };
  const BALL_KINDS = ['pass', 'cross', 'lob', 'shot', 'goal'];
  const ZONE_COLORS = [
    { name: 'Amarillo', value: '#facc15' }, { name: 'Rojo', value: '#ef4444' },
    { name: 'Celeste', value: '#22d3ee' }, { name: 'Blanco', value: '#ffffff' }
  ];

  // ------------------------------------------------------------------
  // Estado
  // ------------------------------------------------------------------
  let svg = null;
  let layer = null;
  let isSetup = false;

  // initial: piezas de arranque. steps[i] es el paso i + 1: { dur, moves: [{ id, piece, path, kind, to, text }] }
  // decor: textos y casilleros; su ph es el paso en el que se ven (0 = arranque).
  let board = { id: null, name: '', initial: [], steps: [], decor: [], dirty: false };
  let mode = 'setup';
  let recNew = true;
  let tool = 'move';
  let color = ZONE_COLORS[0].value;
  let showGrid = false;
  let tracksMode = 'upto';
  let cursor = 0;
  let selPiece = null;
  let selMove = null;
  let selDecor = null;
  let undoStack = [];
  let redoStack = [];
  let drag = null;
  let outsideId = null;
  let pendingAction = null;
  let textEditBefore = null;
  let durEditBefore = null;

  let playing = false;
  let playT = 0;
  let lastTs = 0;
  let rafId = 0;
  let speed = 1;
  let loop = false;
  let recording = false;
  let prevMode = 'setup';

  const $ = id => document.getElementById(id);
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const round1 = v => Math.round(v * 10) / 10;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const easeShot = p => 1 - Math.pow(1 - p, 2);
  const newId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const isToken = i => i.type === 'player' || i.type === 'rival';
  const keyOf = i => (i.type === 'player' ? 'p:' + i.name : i.type === 'rival' ? 'r:' + i.label : 'b:ball');

  const fmtTime = ms => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  function pieceLabel(key) {
    if (key === 'b:ball') return 'Pelota';
    if (key.startsWith('p:')) return key.slice(2);
    if (key.startsWith('r:')) return 'Rival ' + key.slice(2);
    return key;
  }

  const kindStyle = kind => (kind === 'cross' || kind === 'lob' ? 'air' : (kind === 'shot' || kind === 'goal' ? 'shot' : 'ground'));

  function trackColor(piece, kind) {
    if (piece === 'b:ball') return { ground: '#facc15', air: '#7dd3fc', shot: '#fb923c' }[kindStyle(kind)];
    return piece.startsWith('r:') ? '#fca5a5' : '#ffffff';
  }

  const snapshot = () => JSON.stringify({ i: board.initial, s: board.steps, d: board.decor });
  function restore(snap) {
    const v = JSON.parse(snap);
    board.initial = v.i;
    board.steps = v.s;
    board.decor = v.d;
    cursor = clamp(cursor, 0, board.steps.length);
  }

  function ensureSims() {
    if (!Array.isArray(state.simulations)) state.simulations = [];
  }

  function visibleSeqs() {
    ensureSims();
    return state.simulations
      .filter(s => !s.deleted && s.items.some(i => i.type === 'seq'))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  // ------------------------------------------------------------------
  // Grilla (la misma que en Simulación)
  // ------------------------------------------------------------------
  const zoneName = (c, r) => M.cellName(c, r);
  function cellAt(x, y) {
    const c = clamp(Math.floor((x - G.x0) / G.cw), 0, G.cols - 1);
    const rowFromTop = clamp(Math.floor((y - G.y0) / G.ch), 0, G.rows - 1);
    return { c, r: G.rows - rowFromTop };
  }
  const zoneOf = p => { const c = cellAt(p[0], p[1]); return zoneName(c.c, c.r); };

  // ------------------------------------------------------------------
  // Derivar posiciones: lo guardado es el arranque y los movimientos; el resto se calcula
  // ------------------------------------------------------------------
  function applyMove(map, m) {
    const p = map.get(m.piece);
    if (!p || !m.path.length) return;
    const end = m.path[m.path.length - 1];
    p.x = end[0];
    p.y = end[1];
    if (p.type === 'ball') p.carrier = m.to && map.has(m.to) ? m.to : '';
  }

  const cloneMap = map => new Map(Array.from(map.entries()).map(([k, v]) => [k, Object.assign({}, v)]));

  // states[k] = cómo están las piezas después del paso k (k = 0 es el arranque).
  function allStates() {
    let cur = new Map();
    board.initial.forEach(i => {
      cur.set(keyOf(i), { key: keyOf(i), type: i.type, name: i.name, label: i.label, x: i.x, y: i.y, carrier: i.carrier || '' });
    });
    const out = [cloneMap(cur)];
    board.steps.forEach(st => {
      st.moves.forEach(m => applyMove(cur, m));
      out.push(cloneMap(cur));
    });
    return out;
  }

  // Posición real de una pieza: la pelota pegada a una jugadora va con ella.
  function resolvedPos(map, key) {
    const p = map.get(key);
    if (!p) return null;
    if (p.type === 'ball' && p.carrier) {
      const holder = map.get(p.carrier);
      if (holder) return { x: holder.x + THEME.BALL_DX, y: holder.y + THEME.BALL_DY };
    }
    return { x: p.x, y: p.y };
  }

  function toItems(map) {
    const items = [];
    map.forEach((p, key) => {
      const pos = resolvedPos(map, key);
      items.push({ id: key, type: p.type, name: p.name, label: p.label, x: round1(pos.x), y: round1(pos.y) });
    });
    return items;
  }

  // El recorrido de un movimiento: desde donde estaba la pieza antes del paso hasta donde queda.
  function moveTrack(S, s, m) {
    const start = resolvedPos(S[s - 1], m.piece);
    if (!start || !m.path.length) return null;
    const pts = [[start.x, start.y]].concat(m.path.map(p => [p[0], p[1]]));
    if (m.piece === 'b:ball' && m.to) {
      const holder = S[s].get(m.to);
      if (holder) pts[pts.length - 1] = [holder.x + THEME.BALL_DX, holder.y + THEME.BALL_DY];
    }
    return pts;
  }

  function polyLength(pts) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return total;
  }

  // Los puntos del recorrido hasta una fracción (0-1) de su largo.
  function truncatePath(pts, frac) {
    const want = polyLength(pts) * clamp01(frac);
    const out = [pts[0]];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc + seg >= want) {
        const t = seg ? (want - acc) / seg : 0;
        out.push([lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t)]);
        return out;
      }
      acc += seg;
      out.push(pts[i]);
    }
    return out;
  }

  const posAlong = (pts, frac) => M.pointAlong(pts, clamp01(frac));

  // Cuánto tarda un paso según lo que se movió (se puede corregir en la tabla).
  function defaultDur(kind, pts, isBall) {
    const len = polyLength(pts);
    let d;
    if (isBall) d = kind === 'shot' || kind === 'goal' ? 0.7 : (kind === 'cross' || kind === 'lob' ? 1.2 + len / 400 : 0.8 + len / 400);
    else d = 1.1 + len / 260;
    return round1(clamp(d, 0.7, 3.5));
  }

  // ------------------------------------------------------------------
  // Lo que se ve
  // ------------------------------------------------------------------
  const stepHasText = s => (board.steps[s - 1] && board.steps[s - 1].moves.some(m => m.text)) || board.decor.some(d => d.ph === s);

  function decorItems(ph, alpha) {
    return board.decor.filter(d => d.ph === ph).map(d => Object.assign({}, d, { id: 'dc:' + d.id, _o: alpha }));
  }

  function goalFlashFor(s, alpha, S) {
    if (s < 1 || !board.steps[s - 1] || !board.steps[s - 1].moves.some(m => m.kind === 'goal')) return [];
    const spot = roomiestPoint(S[s], 84, 30, 150, 110);
    return [{ id: 'goal-flash', type: 'text', _auto: true, big: true, x: spot.x, y: spot.y + 9, text: '¡GOL!', color: '#facc15', _o: alpha }];
  }

  // Dónde poner un cartel de w x h sin tapar fichas: el lugar libre más cercano a (ax, ay).
  function roomiestPoint(map, w, h, ax, ay) {
    const pieces = Array.from(map.keys()).map(k => resolvedPos(map, k));
    let best = null;
    let bestDist = Infinity;
    let fallback = { x: 150, y: 200 };
    let fallbackClear = -Infinity;
    for (let x = 60; x <= 240; x += 10) {
      for (let y = 40; y <= 350; y += 10) {
        let clearance = Infinity;
        pieces.forEach(p => {
          const dx = Math.max(Math.abs(p.x - x) - w / 2, 0);
          const dy = Math.max(Math.abs(p.y - y) - h / 2, 0);
          clearance = Math.min(clearance, Math.hypot(dx, dy) - THEME.TOKEN_R);
        });
        if (clearance > fallbackClear) { fallbackClear = clearance; fallback = { x, y }; }
        const dist = Math.hypot(x - ax, y - ay);
        if (clearance >= 4 && dist < bestDist) { bestDist = dist; best = { x, y }; }
      }
    }
    return best || fallback;
  }

  const gridItems = () => ((showGrid || (mode !== 'play' && tool === 'zone')) ? [{ id: 'grid', type: 'grid', _auto: true }] : []);

  // Los recorridos de los pasos que se muestran cuando el cursor está en el paso k.
  function trackItemsFor(S, k, interactive, growTo) {
    const from = tracksMode === 'current' ? k : 1;
    const to = tracksMode === 'all' && interactive ? board.steps.length : k;
    const out = [];
    for (let s = from; s <= to; s++) {
      if (s < 1 || !board.steps[s - 1]) continue;
      board.steps[s - 1].moves.forEach(m => {
        let pts = moveTrack(S, s, m);
        if (!pts) return;
        let alpha = s === k ? 1 : FAINT;
        if (growTo !== undefined && s === k) pts = truncatePath(pts, growTo(m));
        if (pts.length < 2) return;
        out.push({
          id: 'mv:' + m.id, type: 'track', points: pts, color: trackColor(m.piece, m.kind), dash: m.piece === 'b:ball',
          badge: String(s), _o: alpha, _auto: !interactive, selected: interactive && m.id === selMove
        });
      });
    }
    return out;
  }

  function editItems() {
    const k = mode === 'setup' ? 0 : cursor;
    const S = allStates();
    let items = toItems(S[k]);
    let extra = [];
    if (drag && drag.kind === 'record' && drag.moved) {
      // Mientras se arrastra: la ficha sigue al puntero y se ve el camino que va dejando.
      items = items.map(i => (i.id === drag.key ? Object.assign({}, i, { x: round1(drag.now.x), y: round1(drag.now.y) }) : i));
      if (drag.pts.length > 1) {
        extra = [{ id: 'preview', type: 'track', points: drag.pts, color: trackColor(drag.key, 'pass'), dash: true, _auto: true, _o: 0.9 }];
      }
    }
    // La punta del recorrido elegido, para arrastrarla.
    const handles = [];
    const tr = selMove ? trackItemsFor(S, k, true).find(t => t.id === 'mv:' + selMove) : null;
    if (tr) {
      const end = tr.points[tr.points.length - 1];
      handles.push({ id: 'handle', type: 'handle', x: round1(end[0]), y: round1(end[1]) });
    }
    return items
      .concat(trackItemsFor(S, k, true), extra, decorItems(k, 1), goalFlashFor(k, 1, S), gridItems(), handles);
  }

  function renderBoard() {
    if (!layer || mode === 'play') return;
    layer.innerHTML = '';
    const selId = selPiece || (selDecor ? 'dc:' + selDecor : null);
    M.renderItemsSvg(layer, editItems(), { selectedId: selId, outsideId });
  }

  // ------------------------------------------------------------------
  // Cambios, deshacer y borrador
  // ------------------------------------------------------------------
  function flattenBoard() {
    const out = [{ id: 'seq', type: 'seq', ph: 0 }];
    board.initial.forEach(p => out.push(Object.assign({ ph: 0 }, clone(p))));
    board.steps.forEach((st, i) => {
      out.push({ id: 'st' + (i + 1), type: 'step', ph: i + 1, dur: st.dur });
      st.moves.forEach(m => out.push({
        id: m.id, type: 'move', ph: i + 1, piece: m.piece, path: clone(m.path), kind: m.kind, to: m.to || '', text: m.text || ''
      }));
    });
    board.decor.forEach(d => out.push(clone(d)));
    return out;
  }

  function splitFlat(flat) {
    const all = sanitizeSimItems(flat);
    const initial = all.filter(i => i.ph === 0 && (i.type === 'player' || i.type === 'rival' || i.type === 'ball'))
      .map(i => {
        const p = { id: i.id, type: i.type, x: i.x, y: i.y };
        if (i.type === 'player') p.name = i.name;
        if (i.type === 'rival') p.label = i.label;
        if (i.type === 'ball') p.carrier = i.carrier || '';
        return p;
      });
    const metas = new Map(all.filter(i => i.type === 'step').map(i => [i.ph, i]));
    const byStep = new Map();
    all.filter(i => i.type === 'move').forEach(i => {
      if (!byStep.has(i.ph)) byStep.set(i.ph, []);
      byStep.get(i.ph).push({ id: i.id, piece: i.piece, path: i.path, kind: i.kind, to: i.to || '', text: i.text || '' });
    });
    // Se descartan los pasos sin movimientos y se renumera lo que dependía de ellos (textos y casilleros).
    const used = Array.from(byStep.keys()).sort((a, b) => a - b).slice(0, MAX_STEPS);
    const remap = new Map([[0, 0]]);
    const steps = used.map((ph, idx) => {
      remap.set(ph, idx + 1);
      return { dur: metas.has(ph) ? metas.get(ph).dur : 1.5, moves: byStep.get(ph) };
    });
    const decor = all.filter(i => i.type === 'text' || i.type === 'zone').map(i => {
      const ph = remap.has(i.ph) ? remap.get(i.ph) : steps.length;
      return Object.assign({}, i, { ph });
    });
    return { initial, steps, decor };
  }

  function persistDraft() {
    try {
      if (board.dirty) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ id: board.id, name: board.name, items: flattenBoard(), dirty: true }));
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
    clearSel();
    markDirty();
    refreshAll();
  }

  function redo() {
    if (!redoStack.length || mode === 'play') return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
    clearSel();
    markDirty();
    refreshAll();
  }

  function clearSel() {
    selPiece = null;
    selMove = null;
    selDecor = null;
  }

  // ------------------------------------------------------------------
  // Coordenadas y punteros
  // ------------------------------------------------------------------
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
    const taken = board.initial.filter(isToken);
    for (const y of rows) {
      for (const x of xs) {
        if (taken.every(t => Math.hypot(t.x - x, t.y - y) > 28)) return { x, y };
      }
    }
    return { x: 150, y: kind === 'rival' ? 100 : 300 };
  }

  function nearestToken(map, x, y, exceptKey) {
    let best = null;
    let bestDist = SNAP_DIST;
    map.forEach((p, key) => {
      if (p.type === 'ball' || key === exceptKey) return;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= bestDist) { best = key; bestDist = d; }
    });
    return best;
  }

  // La pieza y su lugar al final del paso k (para arrancar un arrastre o agarrarla).
  function pieceAtCursor(key) {
    const k = mode === 'setup' ? 0 : cursor;
    const S = allStates();
    return resolvedPos(S[k], key);
  }

  function onPointerDown(e) {
    if (mode === 'play' || recording) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const active = document.activeElement;
    if (active && active !== document.body && active.blur) active.blur();
    const pt = pointFromClient(e.clientX, e.clientY);
    if (tool === 'zone') { toggleZone(pt); return; }
    if (tool === 'text') { addText(pt); return; }

    const handle = e.target.getAttribute ? e.target.getAttribute('data-handle') : null;
    const el = e.target.closest ? e.target.closest('.t-item') : null;
    const id = el ? el.getAttribute('data-id') : null;
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }

    if (handle && selMove) {
      drag = { kind: 'handle', moveId: selMove, before: snapshot(), pointerId: e.pointerId, moved: false };
      return;
    }
    if (!id) { clearSel(); refreshAll(); return; }
    if (id.startsWith('mv:')) { selectMove(id.slice(3)); return; }
    if (id.startsWith('dc:')) {
      const d = board.decor.find(x => x.id === id.slice(3));
      if (!d) return;
      clearSel();
      selDecor = d.id;
      if (d.type === 'text') $('seqTextInput').value = d.text;
      drag = { kind: 'decor', id: d.id, start: pt, orig: clone(d), before: snapshot(), pointerId: e.pointerId, moved: false };
      refreshAll();
      return;
    }
    // Una pieza
    if (mode === 'setup') {
      const piece = board.initial.find(i => keyOf(i) === id);
      if (!piece) return;
      clearSel();
      selPiece = id;
      drag = { kind: 'setup', key: id, start: pt, orig: clone(piece), before: snapshot(), pointerId: e.pointerId, moved: false };
      refreshAll();
    } else {
      const start = pieceAtCursor(id);
      if (!start) return;
      clearSel();
      drag = {
        kind: 'record', key: id, start, pts: [[start.x, start.y]], now: { x: start.x, y: start.y }, pointerId: e.pointerId, moved: false
      };
    }
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const pt = pointFromClient(e.clientX, e.clientY);

    if (drag.kind === 'record') {
      const last = drag.pts[drag.pts.length - 1];
      const p = drag.key === 'b:ball' ? clampView(pt) : clampField(pt);
      drag.now = p;
      if (Math.hypot(p.x - last[0], p.y - last[1]) >= 2.5) drag.pts.push([round1(p.x), round1(p.y)]);
      drag.moved = Math.hypot(p.x - drag.start.x, p.y - drag.start.y) >= 2;
      renderBoard();
      return;
    }
    if (drag.kind === 'setup') {
      const piece = board.initial.find(i => keyOf(i) === drag.key);
      if (!piece) return;
      const dx = pt.x - drag.start.x;
      const dy = pt.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) < 0.8) return;
      drag.moved = true;
      if (piece.type === 'ball') {
        piece.carrier = '';
        const p = clampView({ x: drag.orig.x + dx, y: drag.orig.y + dy });
        piece.x = round1(p.x);
        piece.y = round1(p.y);
      } else {
        piece.x = round1(drag.orig.x + dx);
        piece.y = round1(drag.orig.y + dy);
        outsideId = !isOverBoard(e.clientX, e.clientY) ? drag.key : null;
      }
      renderBoard();
      return;
    }
    if (drag.kind === 'decor') {
      const d = board.decor.find(x => x.id === drag.id);
      if (!d || d.type !== 'text') return;
      const dx = pt.x - drag.start.x;
      const dy = pt.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) < 0.8) return;
      drag.moved = true;
      const p = clampView({ x: drag.orig.x + dx, y: drag.orig.y + dy });
      d.x = round1(p.x);
      d.y = round1(p.y);
      renderBoard();
      return;
    }
    if (drag.kind === 'handle') {
      const found = findMove(drag.moveId);
      if (!found) return;
      const p = found.move.piece === 'b:ball' ? clampView(pt) : clampField(pt);
      drag.moved = true;
      found.move.path[found.move.path.length - 1] = [round1(p.x), round1(p.y)];
      renderBoard();
    }
  }

  function finishDrag(e, cancelled) {
    if (!drag || (e && e.pointerId !== drag.pointerId)) return;
    const d = drag;
    drag = null;
    outsideId = null;
    if (e) { try { svg.releasePointerCapture(e.pointerId); } catch (err) { /* ya liberado */ } }

    if (d.kind === 'record') {
      if (!cancelled && d.moved) recordMove(d);
      refreshAll();
      return;
    }
    if (cancelled) {
      restore(d.before);
      refreshAll();
      return;
    }
    if (d.kind === 'setup' && d.moved) {
      const piece = board.initial.find(i => keyOf(i) === d.key);
      if (piece) {
        if (isToken(piece)) {
          if (!isOverBoard(e.clientX, e.clientY)) {
            removePiece(d.key);
          } else {
            const c = clampField(piece);
            piece.x = round1(c.x);
            piece.y = round1(c.y);
            syncInitialBall();
          }
        } else {
          const map = allStates()[0];
          const holder = nearestToken(map, piece.x, piece.y, null);
          piece.carrier = holder || '';
          syncInitialBall();
        }
      }
    }
    if (d.kind === 'handle' && d.moved) settleMoveEnd(d.moveId);
    commit(d.before);
    refreshAll();
  }

  // ------------------------------------------------------------------
  // Grabar movimientos
  // ------------------------------------------------------------------
  function findMove(id) {
    for (let i = 0; i < board.steps.length; i++) {
      const m = board.steps[i].moves.find(x => x.id === id);
      if (m) return { move: m, stepIndex: i };
    }
    return null;
  }

  // Al soltar la pelota cerca de una jugadora es un pase a ella; en la boca del arco, un tiro.
  function ballLanding(map, end, exceptKey) {
    const holder = nearestToken(map, end[0], end[1], exceptKey);
    if (holder) return { kind: 'pass', to: holder };
    if (end[1] <= 24 && end[0] >= 116 && end[0] <= 184) return { kind: 'shot', to: '', end: [clamp(end[0], 122, 178), THEME.GOAL_Y.shot] };
    return { kind: 'pass', to: '' };
  }

  function recordMove(d) {
    const isBall = d.key === 'b:ball';
    let pts = M.simplifyPath(d.pts, 1.2).slice(1).map(p => [round1(p[0]), round1(p[1])]);
    if (!pts.length) return;
    const total = polyLength([[d.start.x, d.start.y]].concat(pts));
    if (total < MIN_MOVE) return;
    if (board.steps.length >= MAX_STEPS && (recNew || cursor === 0)) {
      showError(`Máximo ${MAX_STEPS} pasos por secuencia.`);
      return;
    }
    showError('');
    const k = cursor;
    const S = allStates();
    let kind = 'run';
    let to = '';
    if (isBall) {
      const landing = ballLanding(S[k], pts[pts.length - 1], null);
      kind = landing.kind;
      to = landing.to;
      if (landing.end) pts[pts.length - 1] = landing.end;
    }
    const move = { id: newId(), piece: d.key, path: pts, kind, to, text: '' };
    const dur = defaultDur(kind, [[d.start.x, d.start.y]].concat(pts), isBall);
    mutate(() => {
      if (recNew || k === 0) {
        // Paso nuevo justo después del paso k: lo que tenía ph > k se corre un lugar.
        board.decor.forEach(x => { if (x.ph > k) x.ph += 1; });
        board.steps.splice(k, 0, { dur, moves: [move] });
        cursor = k + 1;
      } else {
        const step = board.steps[k - 1];
        step.moves = step.moves.filter(m => m.piece !== move.piece);
        step.moves.push(move);
        step.dur = Math.max(step.dur, dur);
      }
    });
    // Lo recién grabado no queda seleccionado: su punta arrastrable taparía la ficha justo
    // donde se va a querer grabar el siguiente movimiento.
  }

  function selectMove(id) {
    const found = findMove(id);
    if (!found) return;
    clearSel();
    selMove = id;
    if (mode === 'setup') mode = 'record';
    cursor = found.stepIndex + 1;
    refreshAll();
    const row = document.querySelector(`.seq-move[data-move="${id}"]`);
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }

  // Si se arrastró el final de una flecha de pelota: recalcula a quién le llega
  // (a una jugadora, al arco o a ninguna) y ajusta el tipo si hace falta.
  function settleMoveEnd(moveId) {
    const found = findMove(moveId);
    if (!found || found.move.piece !== 'b:ball') return;
    const m = found.move;
    const S = allStates();
    const landing = ballLanding(S[found.stepIndex + 1], m.path[m.path.length - 1], null);
    m.to = landing.to;
    if (landing.end) {
      m.path[m.path.length - 1] = landing.end;
      if (m.kind !== 'shot' && m.kind !== 'goal') m.kind = 'shot';
    } else if (m.kind === 'shot' || m.kind === 'goal') {
      m.kind = 'pass';
    }
  }

  function setKind(moveId, kind) {
    const found = findMove(moveId);
    if (!found) return;
    mutate(() => {
      const m = found.move;
      m.kind = kind;
      if (kind === 'shot' || kind === 'goal') {
        m.to = '';
        const last = m.path[m.path.length - 1];
        m.path[m.path.length - 1] = [clamp(last[0], 122, 178), THEME.GOAL_Y[kind]];
      }
    });
    refreshAll();
  }

  function removeMove(moveId) {
    const found = findMove(moveId);
    if (!found) return;
    mutate(() => {
      const step = board.steps[found.stepIndex];
      step.moves = step.moves.filter(m => m.id !== moveId);
      if (!step.moves.length) removeStepAt(found.stepIndex);
    });
    if (selMove === moveId) selMove = null;
    cursor = clamp(cursor, 0, board.steps.length);
    refreshAll();
  }

  function removeStepAt(index) {
    const s = index + 1;
    board.steps.splice(index, 1);
    board.decor = board.decor.filter(d => d.ph !== s);
    board.decor.forEach(d => { if (d.ph > s) d.ph -= 1; });
  }

  function removeStep(index) {
    mutate(() => removeStepAt(index));
    clearSel();
    cursor = clamp(cursor, 0, board.steps.length);
    refreshAll();
  }

  function swapSteps(index, delta) {
    const other = index + delta;
    if (other < 0 || other >= board.steps.length) return;
    mutate(() => {
      const a = index + 1;
      const b = other + 1;
      [board.steps[index], board.steps[other]] = [board.steps[other], board.steps[index]];
      board.decor.forEach(d => { if (d.ph === a) d.ph = b; else if (d.ph === b) d.ph = a; });
    });
    cursor = other + 1;
    refreshAll();
  }

  // "Junto con el anterior": el paso pasa a moverse a la vez que el paso anterior.
  function mergeStepWithPrev(index) {
    if (index < 1) return;
    const prev = board.steps[index - 1];
    const cur = board.steps[index];
    const clash = cur.moves.find(m => prev.moves.some(p => p.piece === m.piece));
    if (clash) {
      showError(`${pieceLabel(clash.piece)} se mueve en los dos pasos: no pueden ser a la vez.`);
      refreshAll();
      return;
    }
    showError('');
    mutate(() => {
      prev.moves = prev.moves.concat(cur.moves);
      prev.dur = Math.max(prev.dur, cur.dur);
      const s = index + 1;
      board.steps.splice(index, 1);
      board.decor.forEach(d => { if (d.ph === s) d.ph = s - 1; else if (d.ph > s) d.ph -= 1; });
    });
    cursor = index;
    refreshAll();
  }

  // Saca un movimiento de un paso simultáneo y lo pone en un paso propio, justo después.
  function splitMoveOut(moveId) {
    const found = findMove(moveId);
    if (!found || board.steps[found.stepIndex].moves.length < 2) return;
    mutate(() => {
      const step = board.steps[found.stepIndex];
      step.moves = step.moves.filter(m => m.id !== moveId);
      const s = found.stepIndex + 1;
      board.decor.forEach(d => { if (d.ph > s) d.ph += 1; });
      board.steps.splice(found.stepIndex + 1, 0, { dur: step.dur, moves: [found.move] });
    });
    cursor = found.stepIndex + 2;
    refreshAll();
  }

  // ------------------------------------------------------------------
  // Piezas de arranque
  // ------------------------------------------------------------------
  function addPiece(piece) {
    mutate(() => board.initial.push(piece));
    refreshAll();
  }

  function addRival() {
    const used = new Set(board.initial.filter(i => i.type === 'rival').map(i => i.label));
    if (used.size >= MAX_RIVALS) return;
    let n = 1;
    while (used.has(String(n))) n++;
    const spot = nextFreeSpot('rival');
    addPiece({ id: newId(), type: 'rival', label: String(n), x: spot.x, y: spot.y });
  }

  function addBall() {
    const existing = board.initial.find(i => i.type === 'ball');
    if (existing) { clearSel(); selPiece = 'b:ball'; refreshAll(); return; }
    addPiece({ id: 'ball', type: 'ball', x: 150, y: 200, carrier: '' });
  }

  function syncInitialBall() {
    const map = new Map(board.initial.map(i => [keyOf(i), i]));
    board.initial.forEach(b => {
      if (b.type !== 'ball' || !b.carrier) return;
      const holder = map.get(b.carrier);
      if (holder) { b.x = round1(holder.x + THEME.BALL_DX); b.y = round1(holder.y + THEME.BALL_DY); }
      else b.carrier = '';
    });
  }

  // Sacar una pieza del arranque borra también sus movimientos y lo que apuntaba a ella.
  function removePiece(key) {
    board.initial = board.initial.filter(i => keyOf(i) !== key);
    board.initial.forEach(b => { if (b.type === 'ball' && b.carrier === key) b.carrier = ''; });
    board.steps.forEach(st => {
      st.moves = st.moves.filter(m => m.piece !== key);
      st.moves.forEach(m => { if (m.to === key) m.to = ''; });
    });
    const emptyIdx = [];
    board.steps.forEach((st, i) => { if (!st.moves.length) emptyIdx.push(i); });
    emptyIdx.reverse().forEach(i => removeStepAt(i));
    if (selPiece === key) selPiece = null;
    cursor = clamp(cursor, 0, board.steps.length);
  }

  function giveBall(key) {
    mutate(() => {
      const holder = board.initial.find(i => keyOf(i) === key);
      if (!holder) return;
      let ball = board.initial.find(i => i.type === 'ball');
      if (!ball) { ball = { id: 'ball', type: 'ball', x: holder.x, y: holder.y, carrier: '' }; board.initial.push(ball); }
      ball.carrier = key;
      syncInitialBall();
    });
    refreshAll();
  }

  function releaseBall() {
    mutate(() => { const b = board.initial.find(i => i.type === 'ball'); if (b) b.carrier = ''; });
    refreshAll();
  }

  function renameEverywhere(oldName, newName) {
    const oldKey = 'p:' + oldName;
    const newKey = 'p:' + newName;
    board.initial.forEach(i => {
      if (i.type === 'player' && i.name === oldName) i.name = newName;
      if (i.type === 'ball' && i.carrier === oldKey) i.carrier = newKey;
    });
    board.steps.forEach(st => st.moves.forEach(m => {
      if (m.piece === oldKey) m.piece = newKey;
      if (m.to === oldKey) m.to = newKey;
    }));
  }

  const ROLE_GROUP = { Arq: 'Arquera', Def: 'Defensa', Med: 'Mediocampo', Del: 'Delantera' };
  const roleGroup = name => ROLE_GROUP[String(name).slice(0, 3)] || null;
  const boardPlayerNames = () => board.initial.filter(i => i.type === 'player').map(i => i.name);
  const roleNames = () => boardPlayerNames().filter(n => !state.players[n]);

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
    mutate(() => assignments.forEach(([role, name]) => renameEverywhere(role, name)));
    refreshAll();
    $('seqStatus').textContent = `Asignó ${assignments.length} jugadoras a sus puestos.`;
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
        const existing = board.initial.find(i => i.type === 'player' && i.name === name);
        if (existing) { existing.x = round1(p.x); existing.y = round1(p.y); }
        else board.initial.push({ id: newId(), type: 'player', name, x: round1(p.x), y: round1(p.y) });
      });
      syncInitialBall();
    });
    refreshAll();
    $('seqStatus').textContent = `Trajo ${names.length} jugadoras de ${matchLabel(currentMatch())} (${currentMatch().activePlan}).`;
  }

  function onChipPointerDown(e) {
    if (mode !== 'setup' || recording) return;
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
      if (board.initial.some(i => i.type === 'player' && i.name === name)) return;
      const moved = Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6;
      if (moved && isOverBoard(ev.clientX, ev.clientY)) {
        const p = clampField(pointFromClient(ev.clientX, ev.clientY));
        addPiece({ id: newId(), type: 'player', name, x: round1(p.x), y: round1(p.y) });
      } else if (!moved) {
        const spot = nextFreeSpot('player');
        addPiece({ id: newId(), type: 'player', name, x: spot.x, y: spot.y });
      }
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
  }

  function renderPlayers() {
    const list = $('seqPlayers');
    if (!list) return;
    list.innerHTML = '';
    const placed = new Set(boardPlayerNames());
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
    $('addSeqRivalBtn').disabled = board.initial.filter(i => i.type === 'rival').length >= MAX_RIVALS;
    $('seqAssignBtn').hidden = !roleNames().length;
  }

  // ------------------------------------------------------------------
  // Casilleros sombreados y cuadros de texto (solo en su paso)
  // ------------------------------------------------------------------
  function toggleZone(pt) {
    const cell = cellAt(pt.x, pt.y);
    const k = mode === 'setup' ? 0 : cursor;
    const existing = board.decor.find(d => d.type === 'zone' && d.ph === k && d.zc === cell.c && d.zr === cell.r);
    mutate(() => {
      if (existing && existing.color === color) board.decor = board.decor.filter(d => d !== existing);
      else if (existing) existing.color = color;
      else board.decor.push({ id: newId(), type: 'zone', ph: k, zc: cell.c, zr: cell.r, color });
    });
    refreshAll();
  }

  function addText(pt) {
    const p = clampView(pt);
    const k = mode === 'setup' ? 0 : cursor;
    const text = ($('seqTextInput').value || '').trim().slice(0, 60) || 'Texto';
    const created = { id: newId(), type: 'text', ph: k, x: round1(p.x), y: round1(p.y), text, color };
    mutate(() => board.decor.push(created));
    tool = 'move';
    clearSel();
    selDecor = created.id;
    refreshAll();
  }

  function setTool(next) {
    if (mode === 'play' || recording) return;
    tool = next;
    if (next !== 'move') clearSel();
    refreshAll();
  }

  function setMode(next) {
    if (recording) return;
    if (mode === 'play') exitPlay();
    mode = next;
    clearSel();
    if (next === 'record') cursor = board.steps.length;
    refreshAll();
  }

  function setColor(value) {
    color = value;
    const d = selDecor ? board.decor.find(x => x.id === selDecor) : null;
    if (d && d.type === 'text') {
      mutate(() => { d.color = value; });
      renderBoard();
    }
    updateControls();
  }

  // ------------------------------------------------------------------
  // Reproducción
  // ------------------------------------------------------------------
  function timeline() {
    const segs = [{ type: 'hold', s: 0, ms: HOLD_START }];
    board.steps.forEach((st, i) => {
      const s = i + 1;
      segs.push({ type: 'move', s, ms: Math.round(st.dur * 1000) });
      segs.push({ type: 'hold', s, ms: (stepHasText(s) ? HOLD_TEXT : HOLD_STEP) + (s === board.steps.length ? 600 : 0) });
    });
    return segs;
  }

  const totalMs = () => timeline().reduce((t, sg) => t + sg.ms, 0);

  function captionFor(s) {
    const n = board.steps.length;
    if (s === 0) return { title: n ? `Inicio · ${n} ${n === 1 ? 'paso' : 'pasos'}` : 'Inicio', note: '' };
    const texts = board.steps[s - 1].moves.map(m => m.text).filter(Boolean);
    return { title: `Paso ${s}/${n}`, note: texts.join(' · ') };
  }

  function holdFrame(S, s) {
    return toItems(S[s]).concat(
      trackItemsFor(S, s, false), decorItems(s, 1), goalFlashFor(s, 1, S), gridItems()
    );
  }

  // El paso s en curso, con progreso p (0-1): cada pieza recorre su camino a su tiempo.
  function moveFrame(S, s, p) {
    const step = board.steps[s - 1];
    const before = S[s - 1];
    const byPiece = new Map(step.moves.map(m => [m.piece, m]));
    const tracks = new Map();
    step.moves.forEach(m => { const pts = moveTrack(S, s, m); if (pts) tracks.set(m.id, pts); });
    const easedFor = m => (kindStyle(m.kind) === 'shot' ? easeShot : ease)(p);

    const pos = new Map();
    const height = new Map();
    // Fichas primero: la pelota que va pegada las sigue.
    before.forEach((pc, key) => {
      if (pc.type === 'ball') return;
      const m = byPiece.get(key);
      const pts = m && tracks.get(m.id);
      if (pts) pos.set(key, posAlong(pts, ease(p)));
      else { const a = S[s].get(key); pos.set(key, [a.x, a.y]); }
    });
    const ballPiece = before.get('b:ball');
    if (ballPiece) {
      const m = byPiece.get('b:ball');
      const pts = m && tracks.get(m.id);
      if (pts) {
        const e = easedFor(m);
        pos.set('b:ball', posAlong(pts, e));
        if (kindStyle(m.kind) === 'air') height.set('b:ball', 4 * p * (1 - p));
      } else if (ballPiece.carrier && pos.has(ballPiece.carrier)) {
        const h = pos.get(ballPiece.carrier);
        pos.set('b:ball', [h[0] + THEME.BALL_DX, h[1] + THEME.BALL_DY]);
      } else {
        const a = resolvedPos(S[s], 'b:ball');
        pos.set('b:ball', [a.x, a.y]);
      }
    }
    const items = [];
    before.forEach((pc, key) => {
      const q = pos.get(key);
      const it = { id: key, type: pc.type, name: pc.name, label: pc.label, x: round1(q[0]), y: round1(q[1]) };
      if (height.has(key)) it._h = height.get(key);
      items.push(it);
    });
    // Recorridos: el paso que se mueve va creciendo; los anteriores quedan tenues si se pidió.
    const trackItems = [];
    for (let t = tracksMode === 'current' ? s : 1; t <= s; t++) {
      board.steps[t - 1].moves.forEach(m => {
        let pts = t === s ? tracks.get(m.id) : moveTrack(S, t, m);
        if (!pts) return;
        if (t === s) pts = truncatePath(pts, (kindStyle(m.kind) === 'shot' ? easeShot : ease)(p));
        if (pts.length < 2) return;
        trackItems.push({
          id: 'mv:' + m.id, type: 'track', points: pts, color: trackColor(m.piece, m.kind), dash: m.piece === 'b:ball',
          badge: String(t), _auto: true, _o: t === s ? 1 : FAINT
        });
      });
    }
    const fadeIn = clamp01(p / 0.25);
    return items.concat(
      trackItems, decorItems(s, fadeIn), decorItems(s - 1, 1 - fadeIn), goalFlashFor(s, clamp01((p - 0.8) / 0.2), S), gridItems()
    );
  }

  function frameAt(t) {
    const segs = timeline();
    const S = allStates();
    let acc = 0;
    for (let i = 0; i < segs.length; i++) {
      const sg = segs[i];
      if (t < acc + sg.ms || i === segs.length - 1) {
        const p = clamp01((t - acc) / sg.ms);
        return {
          items: sg.type === 'hold' ? holdFrame(S, sg.s) : moveFrame(S, sg.s, p),
          caption: captionFor(sg.s), step: sg.s
        };
      }
      acc += sg.ms;
    }
    return { items: [], caption: captionFor(0), step: 0 };
  }

  function drawFrame(t) {
    const f = frameAt(t);
    layer.innerHTML = '';
    M.renderItemsSvg(layer, f.items, {});
    $('seqCaptionTitle').textContent = f.caption.title;
    $('seqCaptionNote').textContent = f.caption.note;
    const total = totalMs();
    $('seqScrubber').value = total ? Math.round((t / total) * 1000) : 0;
    $('seqTime').textContent = `${fmtTime(t / speed)} / ${fmtTime(total / speed)}`;
    return f;
  }

  function isTabActive() {
    const panel = $('panel-secuencia');
    return !!panel && panel.classList.contains('active');
  }

  function enterPlay() {
    if (mode === 'play') return;
    prevMode = mode;
    mode = 'play';
    clearSel();
    $('panel-secuencia').classList.add('seq-playing');
    updateControls();
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(rafId);
    updateControls();
  }

  function exitPlay() {
    pause();
    mode = prevMode === 'play' ? 'record' : prevMode;
    $('panel-secuencia').classList.remove('seq-playing');
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
    if (!board.steps.length) {
      showError('Grabá al menos un movimiento para reproducir la secuencia.');
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
  // Panel: pasos, tabla y controles
  // ------------------------------------------------------------------
  function updateStatus() {
    const el = $('seqStatus');
    if (!el) return;
    if (board.dirty) el.textContent = 'Cambios sin guardar';
    else el.textContent = board.id ? 'Guardada' : '';
  }

  function showError(message) {
    const el = $('seqError');
    if (el) el.textContent = message || '';
  }

  function describeMove(S, s, m) {
    const pts = moveTrack(S, s, m);
    if (!pts) return '';
    if (m.piece === 'b:ball') {
      const label = KIND_LABELS[m.kind] || 'Pase';
      if (m.kind === 'shot' || m.kind === 'goal') return label;
      if (m.to) return `${label} a ${pieceLabel(m.to)}`;
      return `${label} a la zona ${zoneOf(pts[pts.length - 1])}`;
    }
    const curve = m.path.length > 1 ? ' (con curva)' : '';
    return `${zoneOf(pts[0])} → ${zoneOf(pts[pts.length - 1])}${curve}`;
  }

  function renderCursorTabs() {
    const tabs = $('seqCursorTabs');
    tabs.innerHTML = '';
    const labels = ['Inicio'].concat(board.steps.map((_, i) => String(i + 1)));
    labels.forEach((label, k) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const activeK = mode === 'setup' ? 0 : cursor;
      btn.className = 'phase-tab' + (k === activeK && mode !== 'play' ? ' active' : '');
      btn.textContent = label;
      btn.title = k === 0 ? 'Cómo arranca la jugada' : `Cómo queda todo después del paso ${k}`;
      btn.disabled = recording;
      btn.addEventListener('click', () => {
        if (mode === 'play') exitPlay();
        if (k === 0 && mode === 'setup') { refreshAll(); return; }
        mode = k === 0 && board.steps.length === 0 ? 'setup' : 'record';
        cursor = k;
        clearSel();
        refreshAll();
      });
      tabs.appendChild(btn);
    });
  }

  function renderTable() {
    const box = $('seqMoves');
    box.innerHTML = '';
    if (!board.steps.length) {
      box.innerHTML = '<p class="hint">Todavía no hay movimientos. Pasá a "2. Grabar" y arrastrá una ficha o la pelota: cada arrastre queda acá.</p>';
      return;
    }
    const S = allStates();
    const locked = mode === 'play' || recording;
    board.steps.forEach((st, si) => {
      const s = si + 1;
      const stepEl = document.createElement('div');
      stepEl.className = 'seq-step' + (mode !== 'setup' && cursor === s ? ' active' : '');

      const head = document.createElement('div');
      head.className = 'seq-stephead';
      const title = document.createElement('strong');
      title.textContent = `Paso ${s}` + (st.moves.length > 1 ? ` · ${st.moves.length} a la vez` : '');
      head.appendChild(title);

      const durLabel = document.createElement('label');
      durLabel.className = 'seq-dur';
      durLabel.appendChild(document.createTextNode('Dura '));
      const dur = document.createElement('input');
      dur.type = 'number';
      dur.min = '0.3';
      dur.max = '8';
      dur.step = '0.1';
      dur.value = String(st.dur);
      dur.disabled = locked;
      dur.addEventListener('focus', () => { durEditBefore = snapshot(); });
      dur.addEventListener('input', () => {
        const v = Number(dur.value);
        if (Number.isFinite(v) && v >= 0.3 && v <= 8) { st.dur = round1(v); updateTimeLabel(); }
      });
      dur.addEventListener('change', () => {
        if (durEditBefore !== null) commit(durEditBefore);
        durEditBefore = null;
        dur.value = String(st.dur);
      });
      durLabel.appendChild(dur);
      durLabel.appendChild(document.createTextNode(' s'));
      head.appendChild(durLabel);

      if (s > 1) {
        const join = document.createElement('label');
        join.className = 'tactic-check';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.disabled = locked;
        cb.addEventListener('change', () => mergeStepWithPrev(si));
        join.appendChild(cb);
        join.appendChild(document.createTextNode(' A la vez que el anterior'));
        head.appendChild(join);
      }
      [['▲', -1, 'Subir el paso'], ['▼', 1, 'Bajar el paso']].forEach(([txt, delta, tt]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tool-btn sim-mini';
        b.textContent = txt;
        b.title = tt;
        b.disabled = locked || !board.steps[si + delta];
        b.addEventListener('click', () => swapSteps(si, delta));
        head.appendChild(b);
      });
      const delStep = document.createElement('button');
      delStep.type = 'button';
      delStep.className = 'tool-btn sim-mini';
      delStep.textContent = '✕';
      delStep.title = 'Quitar el paso entero';
      delStep.disabled = locked;
      delStep.addEventListener('click', () => removeStep(si));
      head.appendChild(delStep);
      stepEl.appendChild(head);

      st.moves.forEach(m => {
        const row = document.createElement('div');
        row.className = 'seq-move' + (m.id === selMove ? ' selected' : '');
        row.dataset.move = m.id;
        row.addEventListener('click', ev => {
          if (['INPUT', 'SELECT', 'BUTTON', 'OPTION'].includes(ev.target.tagName) || locked) return;
          selectMove(m.id);
        });

        const who = document.createElement('span');
        who.className = 'seq-who';
        const dot = document.createElement('span');
        dot.className = 'legend-dot';
        dot.style.background = m.piece === 'b:ball' ? '#ffffff' : (m.piece.startsWith('r:') ? THEME.RIVAL_COLOR : THEME.TEAM_COLOR);
        who.appendChild(dot);
        who.appendChild(document.createTextNode(' ' + pieceLabel(m.piece)));
        row.appendChild(who);

        const what = document.createElement('span');
        what.className = 'seq-what';
        what.textContent = describeMove(S, s, m);
        row.appendChild(what);

        if (m.piece === 'b:ball') {
          const sel = document.createElement('select');
          sel.className = 'seq-kind';
          BALL_KINDS.forEach(k => {
            const o = document.createElement('option');
            o.value = k;
            o.textContent = KIND_LABELS[k];
            sel.appendChild(o);
          });
          sel.value = m.kind;
          sel.disabled = locked;
          sel.addEventListener('change', () => setKind(m.id, sel.value));
          row.appendChild(sel);
        } else {
          const run = document.createElement('span');
          run.className = 'seq-kind hint';
          run.textContent = 'Corre';
          row.appendChild(run);
        }

        const text = document.createElement('input');
        text.type = 'text';
        text.className = 'seq-text';
        text.placeholder = 'Texto (se ve en el video)';
        text.maxLength = 160;
        text.value = m.text || '';
        text.disabled = locked;
        text.addEventListener('focus', () => { textEditBefore = snapshot(); });
        text.addEventListener('input', () => { m.text = text.value.slice(0, 160); });
        text.addEventListener('change', () => {
          if (textEditBefore !== null) commit(textEditBefore);
          textEditBefore = null;
        });
        row.appendChild(text);

        if (st.moves.length > 1) {
          const split = document.createElement('button');
          split.type = 'button';
          split.className = 'tool-btn sim-mini';
          split.textContent = 'Paso aparte';
          split.title = 'Sacarlo de este paso y ponerlo en un paso propio, justo después';
          split.disabled = locked;
          split.addEventListener('click', () => splitMoveOut(m.id));
          row.appendChild(split);
        }
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'tool-btn sim-mini';
        del.textContent = '✕';
        del.title = 'Quitar este movimiento';
        del.disabled = locked;
        del.addEventListener('click', () => removeMove(m.id));
        row.appendChild(del);
        stepEl.appendChild(row);
      });
      box.appendChild(stepEl);
    });
  }

  function updateTimeLabel() {
    if (mode !== 'play') $('seqTime').textContent = `Duración: ${fmtTime(totalMs() / speed)}`;
  }

  function updateSelBar() {
    const label = $('seqSelLabel');
    const rename = $('seqRename');
    const give = $('seqGiveBall');
    const release = $('seqReleaseBall');
    const remove = $('seqRemoveSel');
    const textIn = $('seqTextInput');
    [rename, give, release, remove, textIn].forEach(el => { el.hidden = true; });
    if (mode === 'play') { label.textContent = ''; return; }
    const decor = selDecor ? board.decor.find(d => d.id === selDecor) : null;
    if (decor) {
      label.textContent = decor.type === 'text' ? 'Texto' : 'Casillero';
      remove.hidden = false;
      textIn.hidden = decor.type !== 'text';
      return;
    }
    if (selMove) {
      const found = findMove(selMove);
      if (found) {
        label.textContent = `Movimiento del paso ${found.stepIndex + 1}: ${pieceLabel(found.move.piece)}. Arrastrá la punta blanca para cambiar adónde llega.`;
        remove.hidden = false;
        return;
      }
    }
    if (selPiece && mode === 'setup') {
      const piece = board.initial.find(i => keyOf(i) === selPiece);
      if (piece) {
        remove.hidden = false;
        if (piece.type === 'ball') {
          label.textContent = piece.carrier ? `Pelota, la lleva ${pieceLabel(piece.carrier)}` : 'Pelota (suelta)';
          release.hidden = !piece.carrier;
        } else {
          label.textContent = piece.type === 'rival' ? `Rival ${piece.label}` : `Jugadora ${piece.name}`;
          give.hidden = false;
          if (piece.type === 'player') {
            rename.hidden = false;
            const used = new Set(boardPlayerNames());
            rename.innerHTML = '<option value="">Cambiar por…</option>';
            Object.keys(state.players).filter(n => !used.has(n)).forEach(n => {
              const o = document.createElement('option');
              o.value = n;
              o.textContent = n;
              rename.appendChild(o);
            });
            rename.value = '';
          }
        }
        return;
      }
    }
    if (tool === 'text') { label.textContent = 'Texto:'; textIn.hidden = false; return; }
    if (tool === 'zone') { label.textContent = 'Zona: tocá un casillero de la cancha.'; return; }
    label.textContent = mode === 'setup'
      ? 'Armar: arrastrá las fichas a su lugar de arranque.'
      : 'Grabar: arrastrá una ficha o la pelota.';
  }

  function updateControls() {
    if (!svg) return;
    const play = mode === 'play';
    document.querySelectorAll('[data-seqmode]').forEach(b => {
      b.classList.toggle('active', b.dataset.seqmode === (play ? prevMode : mode));
      b.disabled = recording;
    });
    document.querySelectorAll('[data-seqrec]').forEach(b => {
      b.classList.toggle('active', (b.dataset.seqrec === 'new') === recNew);
      b.disabled = recording || mode !== 'record';
    });
    document.querySelectorAll('[data-seqtool]').forEach(b => b.classList.toggle('active', b.dataset.seqtool === tool));
    document.querySelectorAll('#seqColors .swatch').forEach(b => {
      const d = selDecor ? board.decor.find(x => x.id === selDecor) : null;
      b.classList.toggle('active', b.dataset.color === (d && d.type === 'text' ? d.color : color));
    });
    $('seqGrid').checked = showGrid;
    $('seqTracks').value = tracksMode;
    $('seqToolHint').textContent = mode === 'setup'
      ? 'Armar: dejá las fichas como arrancan. Todavía no se graba nada.'
      : (recNew
        ? `Grabar: cada arrastre va en un paso nuevo, después del paso ${cursor}.`
        : (cursor === 0 ? 'Grabar: el primer movimiento va en el paso 1.' : `Grabar: cada arrastre se suma al paso ${cursor} y se mueve a la vez que lo que ya tiene.`));
    $('seqUndo').disabled = play || !undoStack.length;
    $('seqRedo').disabled = play || !redoStack.length;

    $('seqPlayBtn').textContent = playing ? 'Pausar' : 'Reproducir';
    $('seqPlayBtn').disabled = recording;
    $('seqScrubber').disabled = recording || !board.steps.length;
    $('seqEditBtn').hidden = !play || recording;
    $('seqCaption').hidden = !play;
    if (!play) { updateTimeLabel(); $('seqScrubber').value = 0; }

    const video = $('exportSeqVideoBtn');
    video.disabled = recording || !board.steps.length || !M.videoSupported();
    video.title = !M.videoSupported() ? 'Este navegador no puede grabar video.' : (!board.steps.length ? 'Grabá al menos un movimiento.' : '');

    renderCursorTabs();
    renderTable();
    updateSelBar();
  }

  // ------------------------------------------------------------------
  // Guardar / abrir / nueva / eliminar
  // ------------------------------------------------------------------
  function saveSeq(asCopy) {
    const name = board.name.trim();
    if (!name) {
      showError('Ponele un nombre a la secuencia para guardarla.');
      $('seqName').focus();
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
        id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name: finalName, createdAt: now, updatedAt: now, deleted: false, items
      };
      state.simulations.push(sim);
    }
    board.id = sim.id;
    board.name = sim.name;
    board.dirty = false;
    saveState();
    persistDraft();
    renderSecuencia();
    $('seqStatus').textContent = 'Guardada';
    return true;
  }

  function loadBoard(next, startMode) {
    pause();
    board = next;
    mode = startMode || 'setup';
    $('panel-secuencia').classList.remove('seq-playing');
    cursor = mode === 'record' ? board.steps.length : 0;
    clearSel();
    playT = 0;
    undoStack = [];
    redoStack = [];
    persistDraft();
    renderSecuencia();
  }

  function openSeq(id) {
    const sim = visibleSeqs().find(s => s.id === id);
    if (!sim) return;
    showError('');
    const parts = splitFlat(sim.items);
    loadBoard({ id: sim.id, name: sim.name, initial: parts.initial, steps: parts.steps, decor: parts.decor, dirty: false },
      parts.steps.length ? 'record' : 'setup');
  }

  function newSeq() {
    showError('');
    loadBoard({ id: null, name: '', initial: [], steps: [], decor: [], dirty: false }, 'setup');
  }

  function guard(action) {
    if (!board.dirty) { action(); return; }
    pendingAction = action;
    $('seqConfirm').hidden = false;
  }

  function closeConfirm() {
    pendingAction = null;
    $('seqConfirm').hidden = true;
    renderSeqSelect();
  }

  function runPending() {
    const action = pendingAction;
    $('seqConfirm').hidden = true;
    pendingAction = null;
    if (action) action();
  }

  function renderSeqSelect() {
    const sel = $('seqSelect');
    if (!sel) return;
    const list = visibleSeqs();
    sel.innerHTML = '';
    const isSaved = !!board.id && list.some(s => s.id === board.id);
    if (!isSaved) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = list.length ? '— Secuencia nueva —' : '— Sin secuencias guardadas —';
      sel.appendChild(o);
    }
    list.forEach(s => {
      const o = document.createElement('option');
      o.value = s.id;
      const steps = new Set(s.items.filter(i => i.type === 'move').map(i => i.ph)).size;
      const date = formatDateDisplay(String(s.updatedAt).slice(0, 10));
      o.textContent = `${s.name}${steps ? ` (${steps} ${steps === 1 ? 'paso' : 'pasos'})` : ''}${date ? ' — ' + date : ''}`;
      sel.appendChild(o);
    });
    sel.value = isSaved ? board.id : '';
    $('removeSeqBtn').disabled = !isSaved;
  }

  function setupRemoveButton() {
    const btn = $('removeSeqBtn');
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
      newSeq();
    });
  }

  // ------------------------------------------------------------------
  // Punto de partida: jugada de ejemplo o táctica guardada
  // ------------------------------------------------------------------
  // Convierte una jugada de ejemplo (fases) en arranque + movimientos: lo que cambia de una
  // fase a la siguiente pasa a ser movimientos del mismo paso (a la vez).
  function boardFromTemplate(tpl) {
    const our = clone(TPL.OUR_BASE);
    const riv = clone(TPL.RIV_BASE);
    let ballSpec = null;
    const snaps = [];
    tpl.steps.forEach(st => {
      Object.assign(our, st.our || {});
      Object.assign(riv, st.riv || {});
      if (st.ball) ballSpec = { carrier: st.ball };
      if (st.ballAt) ballSpec = { at: st.ballAt };
      if (st.ballAct === 'goal' || st.ballAct === 'shot') ballSpec = { at: [THEME.GOAL_X.center, THEME.GOAL_Y[st.ballAct]] };
      snaps.push({ our: clone(our), riv: clone(riv), ball: clone(ballSpec), st });
    });
    const ballPos = snap => {
      if (!snap.ball) return null;
      if (snap.ball.carrier) { const c = snap.our[snap.ball.carrier]; return [c[0] + THEME.BALL_DX, c[1] + THEME.BALL_DY]; }
      return snap.ball.at;
    };
    const first = snaps[0];
    const initial = [];
    Object.keys(first.our).forEach(role => initial.push({ id: newId(), type: 'player', name: role, x: first.our[role][0], y: first.our[role][1] }));
    Object.keys(first.riv).forEach(n => initial.push({ id: newId(), type: 'rival', label: String(n), x: first.riv[n][0], y: first.riv[n][1] }));
    if (first.ball) {
      const bp = ballPos(first);
      initial.push({ id: 'ball', type: 'ball', x: bp[0], y: bp[1], carrier: first.ball.carrier ? 'p:' + first.ball.carrier : '' });
    }
    const steps = [];
    const decor = [];
    // Se compara contra las posiciones YA derivadas (no contra la fase anterior de la plantilla),
    // así los ajustes chicos que se descartan no se van acumulando.
    const MIN_TEMPLATE_MOVE = 10;
    const cur = new Map();
    Object.keys(first.our).forEach(r => cur.set('p:' + r, first.our[r]));
    Object.keys(first.riv).forEach(n => cur.set('r:' + n, first.riv[n]));
    let curCarrier = first.ball && first.ball.carrier ? 'p:' + first.ball.carrier : '';
    let curBall = first.ball ? ballPos(first) : null;
    snaps.forEach((snap, idx) => {
      (snap.st.zones || []).forEach(z => decor.push({ id: newId(), type: 'zone', ph: idx, zc: z[0], zr: z[1], color: z[2] }));
      (snap.st.texts || []).forEach(t => decor.push({ id: newId(), type: 'text', ph: idx, x: t.x, y: t.y, text: t.text, color: '#ffffff' }));
      if (idx === 0) return;
      const moves = [];
      const noteText = `${snap.st.name}: ${snap.st.note}`.slice(0, 160);
      const consider = (key, target) => {
        const a = cur.get(key);
        if (Math.hypot(a[0] - target[0], a[1] - target[1]) < MIN_TEMPLATE_MOVE) return;
        moves.push({ id: newId(), piece: key, path: [[target[0], target[1]]], kind: 'run', to: '', text: '' });
        cur.set(key, target);
      };
      Object.keys(snap.our).forEach(role => consider('p:' + role, snap.our[role]));
      Object.keys(snap.riv).forEach(n => consider('r:' + n, snap.riv[n]));
      if (snap.ball) {
        const carrierNow = snap.ball.carrier ? 'p:' + snap.ball.carrier : '';
        const bp = ballPos(snap);
        const needs = carrierNow ? carrierNow !== curCarrier
          : (curCarrier || !curBall || Math.hypot(curBall[0] - bp[0], curBall[1] - bp[1]) >= MIN_TEMPLATE_MOVE);
        if (needs) {
          const kind = snap.st.ballAct && BALL_KINDS.includes(snap.st.ballAct) ? snap.st.ballAct : 'pass';
          moves.push({ id: newId(), piece: 'b:ball', path: [[bp[0], bp[1]]], kind, to: carrierNow, text: '' });
          curCarrier = carrierNow;
          curBall = bp;
        }
      }
      if (!moves.length) return;
      // El texto del paso va en su primer movimiento (así aparece en el cuadro de texto del video).
      moves[0].text = noteText;
      steps.push({ dur: snap.st.dur || 2, moves });
      // Los textos y casilleros de esta fase se ven en el paso recién creado.
      decor.filter(d => d.ph === idx).forEach(d => { d.ph = steps.length; });
    });
    return { name: tpl.name, initial, steps, decor };
  }

  function boardFromTactic(tactic) {
    const initial = [];
    (tactic.items || []).forEach(i => {
      if (i.type === 'player') initial.push({ id: newId(), type: 'player', name: i.name, x: i.x, y: i.y });
      else if (i.type === 'rival') initial.push({ id: newId(), type: 'rival', label: i.label, x: i.x, y: i.y });
      else if (i.type === 'ball' && !initial.some(x => x.type === 'ball')) initial.push({ id: 'ball', type: 'ball', x: i.x, y: i.y, carrier: '' });
    });
    const ball = initial.find(i => i.type === 'ball');
    if (ball) {
      let best = null;
      let bestDist = SNAP_DIST;
      initial.filter(isToken).forEach(t => {
        const d = Math.hypot(t.x - ball.x, t.y - ball.y);
        if (d <= bestDist) { best = t; bestDist = d; }
      });
      if (best) ball.carrier = keyOf(best);
    }
    return { name: tactic.name, initial, steps: [], decor: [] };
  }

  function startFrom(parts, startMode) {
    showError('');
    loadBoard({ id: null, name: parts.name, initial: parts.initial, steps: parts.steps, decor: parts.decor, dirty: true }, startMode);
    persistDraft();
  }

  function renderStartOptions() {
    const tpl = $('seqTemplate');
    if (tpl && !tpl.options.length) {
      tpl.innerHTML = '<option value="">Elegí una jugada de ejemplo…</option>';
      TPL.TEMPLATES.forEach(t => {
        const o = document.createElement('option');
        o.value = t.id;
        o.textContent = t.name;
        tpl.appendChild(o);
      });
    }
    const from = $('seqFromTactic');
    if (from) {
      const keep = from.value;
      from.innerHTML = '<option value="">Elegí una táctica guardada…</option>';
      (Array.isArray(state.tactics) ? state.tactics : []).filter(t => !t.deleted).forEach(t => {
        const o = document.createElement('option');
        o.value = t.id;
        o.textContent = t.name;
        from.appendChild(o);
      });
      from.value = keep && Array.from(from.options).some(o => o.value === keep) ? keep : '';
    }
  }

  // ------------------------------------------------------------------
  // Descargar video
  // ------------------------------------------------------------------
  async function exportVideo() {
    if (recording) return;
    if (!board.steps.length) { showError('Grabá al menos un movimiento para descargar el video.'); return; }
    if (!M.videoSupported()) { showError('Este navegador no puede grabar video. Probá con Chrome o Safari.'); return; }
    showError('');
    recording = true;
    pause();
    enterPlay();
    updateControls();
    const total = totalMs();
    const spd = speed;
    const status = $('seqStatus');
    try {
      const result = await M.recordVideo({
        title: board.name.trim() || 'Secuencia',
        subtitle: `DTCommander · ${formatDateDisplay(new Date().toISOString().slice(0, 10))}`,
        durationMs: total / spd,
        getFrame: elapsed => {
          const t = Math.min(total, elapsed * spd);
          playT = t;
          return drawFrame(t);
        },
        onProgress: p => { status.textContent = `Grabando video… ${Math.round(p * 100)}%`; }
      });
      const slug = (board.name.trim() || 'secuencia')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'secuencia';
      const how = await M.deliverFile(result.blob, `${slug}.${result.extension}`, result.mimeType, board.name.trim() || 'Secuencia');
      status.textContent = how === 'downloaded' ? `Video descargado (${result.extension.toUpperCase()})` : (how === 'shared' ? 'Video compartido' : '');
    } catch (err) {
      console.error('No se pudo grabar la secuencia:', err);
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
      const parts = splitFlat(Array.isArray(draft.items) ? draft.items : []);
      board = {
        id: draft.id || null, name: String(draft.name || '').slice(0, 60),
        initial: parts.initial, steps: parts.steps, decor: parts.decor, dirty: true
      };
      mode = parts.steps.length ? 'record' : 'setup';
      cursor = parts.steps.length;
    } catch (err) { /* borrador ilegible: se ignora */ }
  }

  function setupSecuencia() {
    if (isSetup) return;
    svg = $('seqField');
    if (!svg) return;
    isSetup = true;
    ensureSims();

    M.drawPitchSvg(svg);
    layer = M.svgEl('g', { id: 'seqItems' }, svg);
    M.loadCrest();

    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup', e => finishDrag(e, false));
    svg.addEventListener('pointercancel', e => finishDrag(e, true));

    document.querySelectorAll('[data-seqmode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.seqmode)));
    document.querySelectorAll('[data-seqrec]').forEach(b => b.addEventListener('click', () => { recNew = b.dataset.seqrec === 'new'; updateControls(); }));
    document.querySelectorAll('[data-seqtool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.seqtool)));
    const colors = $('seqColors');
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
    $('seqGrid').addEventListener('change', e => {
      showGrid = e.target.checked;
      if (mode === 'play') drawFrame(playT); else renderBoard();
    });
    $('seqTracks').addEventListener('change', e => {
      tracksMode = e.target.value;
      if (mode === 'play') drawFrame(playT); else renderBoard();
    });

    const textInput = $('seqTextInput');
    textInput.addEventListener('focus', () => { textEditBefore = snapshot(); });
    textInput.addEventListener('input', () => {
      const d = selDecor ? board.decor.find(x => x.id === selDecor) : null;
      const value = textInput.value.slice(0, 60);
      if (d && d.type === 'text' && value.trim()) { d.text = value; renderBoard(); }
    });
    textInput.addEventListener('change', () => {
      const d = selDecor ? board.decor.find(x => x.id === selDecor) : null;
      if (d && d.type === 'text' && textEditBefore !== null) commit(textEditBefore);
      textEditBefore = null;
      if (d && d.type === 'text') textInput.value = d.text;
    });

    $('addSeqRivalBtn').addEventListener('click', () => { if (mode === 'setup') addRival(); });
    $('addSeqBallBtn').addEventListener('click', () => { if (mode === 'setup') addBall(); });
    $('seqImportFormationBtn').addEventListener('click', () => { if (mode === 'setup') importFromFormation(); });
    $('seqAssignBtn').addEventListener('click', () => { if (mode !== 'play' && !recording) assignRoster(); });
    $('seqGiveBall').addEventListener('click', () => { if (selPiece) giveBall(selPiece); });
    $('seqReleaseBall').addEventListener('click', releaseBall);
    $('seqRename').addEventListener('change', e => {
      const piece = selPiece ? board.initial.find(i => keyOf(i) === selPiece) : null;
      if (piece && piece.type === 'player' && e.target.value) {
        const newName = e.target.value;
        mutate(() => renameEverywhere(piece.name, newName));
        selPiece = 'p:' + newName;
        refreshAll();
      }
    });
    $('seqRemoveSel').addEventListener('click', () => {
      if (selMove) { removeMove(selMove); return; }
      if (selDecor) {
        const id = selDecor;
        mutate(() => { board.decor = board.decor.filter(d => d.id !== id); });
        clearSel();
        refreshAll();
        return;
      }
      if (selPiece && mode === 'setup') {
        const key = selPiece;
        mutate(() => removePiece(key));
        clearSel();
        refreshAll();
      }
    });

    $('seqUndo').addEventListener('click', undo);
    $('seqRedo').addEventListener('click', redo);
    $('seqPlayBtn').addEventListener('click', () => { if (playing) pause(); else play(); });
    $('seqEditBtn').addEventListener('click', () => {
      const shown = frameAt(playT).step;
      exitPlay();
      mode = shown > 0 ? 'record' : mode;
      cursor = shown;
      refreshAll();
    });
    $('seqScrubber').addEventListener('input', e => scrubTo(Number(e.target.value) / 1000));
    $('seqSpeed').addEventListener('change', e => { speed = Number(e.target.value) || 1; updateTimeLabel(); if (mode === 'play') drawFrame(playT); });
    $('seqLoop').addEventListener('change', e => { loop = e.target.checked; });

    $('seqName').addEventListener('input', e => {
      board.name = e.target.value;
      showError('');
      markDirty();
    });
    $('saveSeqBtn').addEventListener('click', () => saveSeq(false));
    $('saveSeqCopyBtn').addEventListener('click', () => saveSeq(true));
    $('exportSeqVideoBtn').addEventListener('click', exportVideo);
    $('newSeqBtn').addEventListener('click', () => guard(newSeq));
    $('seqSelect').addEventListener('change', e => {
      const id = e.target.value;
      if (!id || id === board.id) { renderSeqSelect(); return; }
      guard(() => openSeq(id));
    });
    $('seqConfirmSave').addEventListener('click', () => { if (saveSeq(false)) runPending(); });
    $('seqConfirmDiscard').addEventListener('click', runPending);
    $('seqConfirmCancel').addEventListener('click', closeConfirm);
    setupRemoveButton();

    $('useSeqTemplateBtn').addEventListener('click', () => {
      const tpl = TPL.TEMPLATES.find(t => t.id === $('seqTemplate').value);
      if (!tpl) { showError('Elegí primero una jugada de ejemplo.'); return; }
      guard(() => startFrom(boardFromTemplate(tpl), 'record'));
    });
    $('useSeqTacticBtn').addEventListener('click', () => {
      const tactic = (state.tactics || []).find(t => t.id === $('seqFromTactic').value && !t.deleted);
      if (!tactic) { showError('Elegí primero una táctica guardada.'); return; }
      const parts = boardFromTactic(tactic);
      if (!parts.initial.length) { showError('Esa táctica no tiene jugadoras, rivales ni pelota para tomar.'); return; }
      guard(() => startFrom(parts, 'setup'));
    });

    document.addEventListener('keydown', e => {
      const panel = $('panel-secuencia');
      if (!panel || !panel.classList.contains('active') || mode === 'play') return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    });

    restoreDraft();
  }

  function renderSecuencia() {
    if (!isSetup) return;
    ensureSims();
    renderSeqSelect();
    renderStartOptions();
    const nameInput = $('seqName');
    if (document.activeElement !== nameInput) nameInput.value = board.name;
    refreshAll();
    updateStatus();
  }

  window.setupSecuencia = setupSecuencia;
  window.renderSecuencia = renderSecuencia;
})();
