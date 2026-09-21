// ==================================================================
// DTCommander — solapa Táctica: tablero libre para planear jugadas.
//
// Distinto de Formación (quién juega dónde en un partido): acá se dibuja
// cómo se juega una jugada (córner, salida, presión) con jugadoras propias
// y rivales, flechas, lápiz, texto y pelota. Cada táctica se guarda con
// nombre en state.tactics (y de ahí a la Sheet vía saveState()).
//
// Depende de js/app.js: state, saveState, currentPlan, currentMatch,
// matchLabel, formatDateDisplay, colorForPosition, moveGhost, FIELD_BOUNDS,
// sanitizeTacticItems. Expone window.setupTactica / window.renderTactica.
// ==================================================================
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const VIEW_W = 300;
  const VIEW_H = 400;
  const FONT = 'Helvetica, Arial, sans-serif';
  const FIELD_GREEN = '#1f7a3d';
  const FIELD_LINE = 'rgba(255,255,255,0.67)';
  const TEAM_COLOR = '#2563eb';
  const RIVAL_COLOR = '#dc2626';
  const TOKEN_R = 14;
  const MAX_RIVALS = 11;
  const MAX_UNDO = 60;
  const DRAFT_KEY = 'dtcomander_tactic_draft';

  const PALETTE = [
    { name: 'Amarillo', value: '#facc15' },
    { name: 'Blanco', value: '#ffffff' },
    { name: 'Rojo', value: '#ef4444' },
    { name: 'Celeste', value: '#22d3ee' },
    { name: 'Naranja', value: '#fb923c' },
    { name: 'Negro', value: '#111827' }
  ];

  const TOOL_HINTS = {
    move: 'Arrastrá jugadoras, flechas y dibujos para acomodarlos. Tocá uno para seleccionarlo: podés cambiarle el color o borrarlo. Las jugadoras se sacan arrastrándolas afuera de la cancha.',
    arrow: 'Arrastrá sobre la cancha para trazar una flecha. Elegí el color y si va punteada (pase) o continua (movimiento).',
    pencil: 'Dibujá a mano alzada con el dedo o el mouse. Elegí el color arriba.',
    text: 'Escribí el texto en el cuadro de arriba y tocá la cancha para ponerlo.',
    ball: 'Tocá la cancha para poner una pelota.',
    erase: 'Tocá un elemento de la cancha para borrarlo.'
  };

  const COLORED_TYPES = ['arrow', 'path', 'text'];

  let svg = null;
  let itemsLayer = null;
  let isSetup = false;

  let board = { id: null, name: '', items: [], dirty: false };
  let tool = 'move';
  let color = PALETTE[0].value;
  let dashed = false;
  let selectedId = null;
  let undoStack = [];
  let redoStack = [];
  let preview = null;
  let drag = null;
  let outsideId = null;
  let pendingAction = null;
  let textEditBefore = null;

  const $ = id => document.getElementById(id);
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const round1 = v => Math.round(v * 10) / 10;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const newId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const snapshot = () => JSON.stringify(board.items);
  const findItem = id => board.items.find(i => i.id === id) || null;
  const isToken = item => item.type === 'player' || item.type === 'rival';

  function svgEl(name, attrs, parent) {
    const el = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(k => el.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(el);
    return el;
  }

  function ensureTactics() {
    if (!Array.isArray(state.tactics)) state.tactics = [];
  }

  function visibleTactics() {
    ensureTactics();
    return state.tactics
      .filter(t => !t.deleted)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  // ------------------------------------------------------------------
  // Dibujo del tablero (también se usa para exportar la imagen, por eso
  // todo lleva atributos propios y no depende de clases del CSS)
  // ------------------------------------------------------------------
  function drawPitch(parent) {
    svgEl('rect', { x: 0, y: 0, width: VIEW_W, height: VIEW_H, fill: FIELD_GREEN }, parent);
    const line = { fill: 'none', stroke: FIELD_LINE, 'stroke-width': 2 };
    svgEl('rect', Object.assign({ x: 10, y: 10, width: 280, height: 380 }, line), parent);
    svgEl('line', Object.assign({ x1: 10, y1: 200, x2: 290, y2: 200 }, line), parent);
    svgEl('circle', Object.assign({ cx: 150, cy: 200, r: 40 }, line), parent);
    svgEl('rect', Object.assign({ x: 90, y: 10, width: 120, height: 55 }, line), parent);
    svgEl('rect', Object.assign({ x: 90, y: 335, width: 120, height: 55 }, line), parent);
  }

  function haloText(parent, text, attrs) {
    const t = svgEl('text', Object.assign({
      'text-anchor': 'middle',
      'font-family': FONT,
      'font-weight': 700,
      stroke: '#0b2a14',
      'stroke-width': 3,
      'stroke-linejoin': 'round',
      'paint-order': 'stroke',
      'pointer-events': 'none'
    }, attrs), parent);
    t.textContent = text;
    return t;
  }

  function selectionBox(parent, minX, minY, maxX, maxY) {
    svgEl('rect', {
      x: minX - 5, y: minY - 5, width: maxX - minX + 10, height: maxY - minY + 10,
      fill: 'none', stroke: '#ffffff', 'stroke-width': 1.5, 'stroke-dasharray': '4 3', 'pointer-events': 'none'
    }, parent);
  }

  function renderToken(g, item, selected) {
    const isRival = item.type === 'rival';
    g.setAttribute('transform', `translate(${item.x}, ${item.y})`);
    if (item.id === outsideId) g.setAttribute('opacity', '0.45');
    if (selected) {
      svgEl('circle', {
        r: TOKEN_R + 6, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.5,
        'stroke-dasharray': '4 3', 'pointer-events': 'none'
      }, g);
    }
    svgEl('circle', {
      r: TOKEN_R, fill: isRival ? RIVAL_COLOR : TEAM_COLOR, stroke: '#ffffff', 'stroke-width': 2
    }, g);
    const inner = svgEl('text', {
      'text-anchor': 'middle', dy: 4, fill: '#ffffff', 'font-size': 12, 'font-weight': 700,
      'font-family': FONT, 'pointer-events': 'none'
    }, g);
    inner.textContent = isRival ? item.label : (item.name || '?').charAt(0).toUpperCase();
    if (!isRival) {
      const name = item.name || '';
      haloText(g, name.length > 11 ? name.slice(0, 10) + '…' : name, {
        y: TOKEN_R + 12, fill: '#ffffff', 'font-size': 9.5
      });
    }
  }

  function renderBall(g, item, selected) {
    g.setAttribute('transform', `translate(${item.x}, ${item.y})`);
    if (selected) selectionBox(g, -6, -6, 6, 6);
    svgEl('circle', { r: 13, fill: 'transparent' }, g);
    svgEl('circle', { r: 6, fill: '#ffffff', stroke: '#111827', 'stroke-width': 1.2, 'pointer-events': 'none' }, g);
    svgEl('polygon', {
      points: '0,-3 2.9,-0.9 1.8,2.4 -1.8,2.4 -2.9,-0.9', fill: '#111827', 'pointer-events': 'none'
    }, g);
  }

  function renderText(g, item, selected) {
    const w = Math.max(20, item.text.length * 6.6);
    svgEl('rect', {
      x: item.x - w / 2 - 4, y: item.y - 16, width: w + 8, height: 24, fill: 'transparent'
    }, g);
    haloText(g, item.text, { x: item.x, y: item.y, fill: item.color, 'font-size': 12 });
    if (selected) selectionBox(g, item.x - w / 2, item.y - 12, item.x + w / 2, item.y + 4);
  }

  function renderArrow(g, a, selected) {
    const dx = a.x2 - a.x1;
    const dy = a.y2 - a.y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const head = Math.min(11, len * 0.6);
    const bx = a.x2 - ux * head;
    const by = a.y2 - uy * head;
    const half = head * 0.4;
    const left = `${round1(bx - uy * half)},${round1(by + ux * half)}`;
    const right = `${round1(bx + uy * half)},${round1(by - ux * half)}`;

    svgEl('line', {
      x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2,
      stroke: 'transparent', 'stroke-width': 16, 'stroke-linecap': 'round'
    }, g);
    svgEl('line', {
      x1: a.x1, y1: a.y1, x2: round1(bx + ux), y2: round1(by + uy),
      stroke: a.color, 'stroke-width': 2.6, 'stroke-linecap': 'round',
      'stroke-dasharray': a.dash ? '6 5' : 'none', 'pointer-events': 'none'
    }, g);
    svgEl('polygon', {
      points: `${a.x2},${a.y2} ${left} ${right}`, fill: a.color, 'pointer-events': 'none'
    }, g);
    if (selected) {
      [['1', a.x1, a.y1], ['2', a.x2, a.y2]].forEach(([which, x, y]) => {
        svgEl('circle', {
          cx: x, cy: y, r: 6, fill: '#ffffff', stroke: '#111827', 'stroke-width': 1.5, 'data-handle': which
        }, g);
      });
    }
  }

  function renderPath(g, p, selected) {
    const pts = p.points.map(pt => pt.join(',')).join(' ');
    svgEl('polyline', {
      points: pts, fill: 'none', stroke: 'transparent', 'stroke-width': 14,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }, g);
    svgEl('polyline', {
      points: pts, fill: 'none', stroke: p.color, 'stroke-width': 2.6,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none'
    }, g);
    if (selected) {
      const xs = p.points.map(pt => pt[0]);
      const ys = p.points.map(pt => pt[1]);
      selectionBox(g, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    }
  }

  // Orden de dibujo (no de guardado): trazos y flechas abajo, después las
  // jugadoras, la pelota y al final el texto. Así un dibujo hecho más tarde
  // nunca tapa a una jugadora ni le roba el toque cuando se la quiere mover.
  const DRAW_ORDER = { path: 0, arrow: 1, player: 2, rival: 2, ball: 3, text: 4 };

  function renderItems(parent, items, selId) {
    items.slice().sort((a, b) => DRAW_ORDER[a.type] - DRAW_ORDER[b.type]).forEach(item => {
      const g = svgEl('g', { class: 't-item', 'data-id': item.id }, parent);
      const selected = item.id === selId;
      if (isToken(item)) renderToken(g, item, selected);
      else if (item.type === 'ball') renderBall(g, item, selected);
      else if (item.type === 'text') renderText(g, item, selected);
      else if (item.type === 'arrow') renderArrow(g, item, selected);
      else if (item.type === 'path') renderPath(g, item, selected);
    });
  }

  function renderBoard() {
    if (!itemsLayer) return;
    itemsLayer.innerHTML = '';
    renderItems(itemsLayer, board.items, selectedId);
    if (preview) {
      const g = svgEl('g', { 'pointer-events': 'none' }, itemsLayer);
      if (preview.type === 'arrow') renderArrow(g, preview, false);
      if (preview.type === 'path' && preview.points.length > 1) renderPath(g, preview, false);
    }
  }

  // ------------------------------------------------------------------
  // Coordenadas
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
    const taken = board.items.filter(isToken);
    for (const y of rows) {
      for (const x of xs) {
        if (taken.every(t => Math.hypot(t.x - x, t.y - y) > 28)) return { x, y };
      }
    }
    return { x: 150, y: kind === 'rival' ? 100 : 300 };
  }

  // ------------------------------------------------------------------
  // Cambios, deshacer y borrador
  // ------------------------------------------------------------------
  function persistDraft() {
    try {
      if (board.dirty) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          id: board.id, name: board.name, items: board.items, dirty: true
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

  // Cada gesto (mover, dibujar, borrar...) guarda un punto de "deshacer" solo
  // si de verdad cambió algo respecto de cómo estaba al empezar.
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
    updateToolbar();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    board.items = JSON.parse(undoStack.pop());
    if (selectedId && !findItem(selectedId)) selectedId = null;
    markDirty();
    refreshAll();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    board.items = JSON.parse(redoStack.pop());
    if (selectedId && !findItem(selectedId)) selectedId = null;
    markDirty();
    refreshAll();
  }

  function removeItem(id) {
    board.items = board.items.filter(i => i.id !== id);
    if (selectedId === id) selectedId = null;
  }

  function deleteSelected() {
    if (!selectedId) return;
    const id = selectedId;
    mutate(() => removeItem(id));
    refreshAll();
  }

  // ------------------------------------------------------------------
  // Punteros sobre la cancha
  // ------------------------------------------------------------------
  function select(id) {
    selectedId = id;
    const item = id ? findItem(id) : null;
    if (item && item.type === 'text') $('tacticText').value = item.text;
    renderBoard();
    updateToolbar();
  }

  function setTool(next) {
    tool = next;
    if (next !== 'move') selectedId = null;
    renderBoard();
    updateToolbar();
  }

  function applyMove(item, orig, dx, dy) {
    if (isToken(item)) {
      item.x = round1(orig.x + dx);
      item.y = round1(orig.y + dy);
    } else if (item.type === 'ball' || item.type === 'text') {
      const p = clampView({ x: orig.x + dx, y: orig.y + dy });
      item.x = round1(p.x);
      item.y = round1(p.y);
    } else if (item.type === 'arrow') {
      const minX = Math.min(orig.x1, orig.x2), maxX = Math.max(orig.x1, orig.x2);
      const minY = Math.min(orig.y1, orig.y2), maxY = Math.max(orig.y1, orig.y2);
      const ax = clamp(dx, -minX, VIEW_W - maxX);
      const ay = clamp(dy, -minY, VIEW_H - maxY);
      item.x1 = round1(orig.x1 + ax); item.x2 = round1(orig.x2 + ax);
      item.y1 = round1(orig.y1 + ay); item.y2 = round1(orig.y2 + ay);
    } else if (item.type === 'path') {
      const xs = orig.points.map(p => p[0]);
      const ys = orig.points.map(p => p[1]);
      const ax = clamp(dx, -Math.min(...xs), VIEW_W - Math.max(...xs));
      const ay = clamp(dy, -Math.min(...ys), VIEW_H - Math.max(...ys));
      item.points = orig.points.map(p => [round1(p[0] + ax), round1(p[1] + ay)]);
    }
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const active = document.activeElement;
    if (active && active !== document.body && active.blur) active.blur();

    const pt = pointFromClient(e.clientX, e.clientY);
    const itemEl = e.target.closest ? e.target.closest('.t-item') : null;
    const item = itemEl ? findItem(itemEl.getAttribute('data-id')) : null;
    const handle = e.target.getAttribute ? e.target.getAttribute('data-handle') : null;
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }

    if (tool === 'move') {
      if (!item) { select(null); return; }
      select(item.id);
      drag = {
        kind: handle && item.type === 'arrow' ? 'handle' : 'move',
        id: item.id, handle, start: pt, orig: clone(item), before: snapshot(),
        moved: false, pointerId: e.pointerId
      };
      return;
    }

    if (tool === 'erase') {
      if (item) {
        mutate(() => removeItem(item.id));
        refreshAll();
      }
      return;
    }

    const p = clampView(pt);

    if (tool === 'arrow') {
      preview = { type: 'arrow', x1: round1(p.x), y1: round1(p.y), x2: round1(p.x), y2: round1(p.y), color, dash: dashed };
      drag = { kind: 'arrow', pointerId: e.pointerId };
      return;
    }

    if (tool === 'pencil') {
      preview = { type: 'path', points: [[round1(p.x), round1(p.y)]], color };
      drag = { kind: 'pencil', pointerId: e.pointerId };
      return;
    }

    if (tool === 'text') {
      const text = ($('tacticText').value || '').trim().slice(0, 80) || 'Texto';
      const created = { id: newId(), type: 'text', x: round1(p.x), y: round1(p.y), text, color };
      mutate(() => board.items.push(created));
      tool = 'move';
      select(created.id);
      refreshAll();
      return;
    }

    if (tool === 'ball') {
      const c = clampField(p);
      const created = { id: newId(), type: 'ball', x: round1(c.x), y: round1(c.y) };
      mutate(() => board.items.push(created));
      tool = 'move';
      select(created.id);
      refreshAll();
    }
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const pt = pointFromClient(e.clientX, e.clientY);

    if (drag.kind === 'move') {
      const item = findItem(drag.id);
      if (!item) return;
      const dx = pt.x - drag.start.x;
      const dy = pt.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) < 0.8) return;
      drag.moved = true;
      applyMove(item, drag.orig, dx, dy);
      outsideId = isToken(item) && !isOverBoard(e.clientX, e.clientY) ? item.id : null;
      renderBoard();
    } else if (drag.kind === 'handle') {
      const item = findItem(drag.id);
      if (!item) return;
      const p = clampView(pt);
      drag.moved = true;
      if (drag.handle === '1') { item.x1 = round1(p.x); item.y1 = round1(p.y); }
      else { item.x2 = round1(p.x); item.y2 = round1(p.y); }
      renderBoard();
    } else if (drag.kind === 'arrow' && preview) {
      const p = clampView(pt);
      preview.x2 = round1(p.x);
      preview.y2 = round1(p.y);
      renderBoard();
    } else if (drag.kind === 'pencil' && preview) {
      const p = clampView(pt);
      const last = preview.points[preview.points.length - 1];
      if (Math.hypot(p.x - last[0], p.y - last[1]) >= 1.5) {
        preview.points.push([round1(p.x), round1(p.y)]);
        renderBoard();
      }
    }
  }

  // Ramer–Douglas–Peucker: deja el trazo con la mínima cantidad de puntos que
  // conserva su forma, para que un dibujo a mano entre cómodo en la Sheet.
  function simplifyPath(points, epsilon) {
    if (points.length < 3) return points;
    const [x1, y1] = points[0];
    const [x2, y2] = points[points.length - 1];
    const segLen = Math.hypot(x2 - x1, y2 - y1);
    let maxDist = 0;
    let index = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const [px, py] = points[i];
      const dist = segLen === 0
        ? Math.hypot(px - x1, py - y1)
        : Math.abs((y2 - y1) * px - (x2 - x1) * py + x2 * y1 - y2 * x1) / segLen;
      if (dist > maxDist) { maxDist = dist; index = i; }
    }
    if (maxDist <= epsilon) return [points[0], points[points.length - 1]];
    const left = simplifyPath(points.slice(0, index + 1), epsilon);
    const right = simplifyPath(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }

  function finishDrag(e, cancelled) {
    if (!drag || (e && e.pointerId !== drag.pointerId)) return;
    const d = drag;
    drag = null;
    outsideId = null;
    if (e) { try { svg.releasePointerCapture(e.pointerId); } catch (err) { /* ya liberado */ } }

    if (d.kind === 'move' || d.kind === 'handle') {
      if (cancelled) {
        board.items = JSON.parse(d.before);
      } else {
        const item = findItem(d.id);
        if (item && d.kind === 'move' && d.moved && isToken(item)) {
          if (!isOverBoard(e.clientX, e.clientY)) {
            removeItem(item.id);
          } else {
            const c = clampField(item);
            item.x = round1(c.x);
            item.y = round1(c.y);
          }
        }
        commit(d.before);
      }
      refreshAll();
      return;
    }

    const drawn = preview;
    preview = null;
    if (!cancelled && drawn) {
      const before = snapshot();
      if (d.kind === 'arrow' && Math.hypot(drawn.x2 - drawn.x1, drawn.y2 - drawn.y1) >= 8) {
        board.items.push(Object.assign({ id: newId() }, drawn));
      } else if (d.kind === 'pencil' && drawn.points.length >= 2) {
        const points = simplifyPath(drawn.points, 0.6);
        if (points.length >= 2) board.items.push({ id: newId(), type: 'path', points, color: drawn.color });
      }
      commit(before);
    }
    refreshAll();
  }

  // ------------------------------------------------------------------
  // Jugadoras (lista de la izquierda) y rivales
  // ------------------------------------------------------------------
  function addToken(token) {
    mutate(() => board.items.push(token));
    refreshAll();
  }

  function addRival() {
    const used = new Set(board.items.filter(i => i.type === 'rival').map(i => i.label));
    if (used.size >= MAX_RIVALS) return;
    let n = 1;
    while (used.has(String(n))) n++;
    const spot = nextFreeSpot('rival');
    addToken({ id: newId(), type: 'rival', label: String(n), x: spot.x, y: spot.y });
  }

  function onChipPointerDown(e) {
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
      if (board.items.some(i => i.type === 'player' && i.name === name)) return;
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
    const list = $('tacticPlayers');
    if (!list) return;
    list.innerHTML = '';
    const placed = new Set(board.items.filter(i => i.type === 'player').map(i => i.name));
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
    const rivals = board.items.filter(i => i.type === 'rival').length;
    $('addRivalBtn').disabled = rivals >= MAX_RIVALS;
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
        const existing = board.items.find(i => i.type === 'player' && i.name === name);
        if (existing) { existing.x = round1(p.x); existing.y = round1(p.y); }
        else board.items.push({ id: newId(), type: 'player', name, x: round1(p.x), y: round1(p.y) });
      });
    });
    refreshAll();
    $('tacticStatus').textContent = `Trajo ${names.length} jugadoras de ${matchLabel(currentMatch())} (${currentMatch().activePlan}).`;
  }

  // ------------------------------------------------------------------
  // Barra de herramientas
  // ------------------------------------------------------------------
  function selectedItem() {
    return selectedId ? findItem(selectedId) : null;
  }

  function setColor(value) {
    color = value;
    const item = selectedItem();
    if (item && COLORED_TYPES.includes(item.type)) {
      mutate(() => { item.color = value; });
      renderBoard();
    }
    updateToolbar();
  }

  function setDashed(value) {
    dashed = value;
    const item = selectedItem();
    if (item && item.type === 'arrow') {
      mutate(() => { item.dash = value; });
      renderBoard();
    }
    updateToolbar();
  }

  function updateToolbar() {
    if (!svg) return;
    document.querySelectorAll('#tacticTools .tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    svg.setAttribute('class', `tool-${tool}`);
    $('tacticHint').textContent = TOOL_HINTS[tool];

    const item = selectedItem();
    const shownColor = item && COLORED_TYPES.includes(item.type) ? item.color : color;
    document.querySelectorAll('#tacticPalette .swatch').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color === shownColor);
    });
    $('tacticDash').checked = item && item.type === 'arrow' ? !!item.dash : dashed;
    $('tacticTextRow').hidden = !(tool === 'text' || (item && item.type === 'text'));

    $('tacticUndo').disabled = !undoStack.length;
    $('tacticRedo').disabled = !redoStack.length;
    $('tacticDelete').disabled = !selectedId;
    $('tacticClear').disabled = !board.items.length;
  }

  function updateStatus() {
    const el = $('tacticStatus');
    if (!el) return;
    if (board.dirty) el.textContent = 'Cambios sin guardar';
    else el.textContent = board.id ? 'Guardada' : '';
  }

  function showError(message) {
    const el = $('tacticError');
    if (el) el.textContent = message || '';
  }

  // ------------------------------------------------------------------
  // Guardar / abrir / nueva / eliminar
  // ------------------------------------------------------------------
  function saveTactic(asCopy) {
    const name = board.name.trim();
    if (!name) {
      showError('Ponele un nombre a la táctica para guardarla.');
      $('tacticName').focus();
      return false;
    }
    showError('');
    ensureTactics();
    const now = new Date().toISOString();
    const items = clone(board.items);
    let tactic = !asCopy && board.id ? state.tactics.find(t => t.id === board.id) : null;

    if (tactic) {
      tactic.name = name;
      tactic.items = items;
      tactic.updatedAt = now;
      tactic.deleted = false;
    } else {
      const current = board.id ? state.tactics.find(t => t.id === board.id) : null;
      const finalName = asCopy && current && current.name === name ? `${name} (copia)` : name;
      tactic = {
        id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name: finalName, createdAt: now, updatedAt: now, deleted: false, items
      };
      state.tactics.push(tactic);
    }

    board.id = tactic.id;
    board.name = tactic.name;
    board.dirty = false;
    saveState();
    persistDraft();
    renderTactica();
    $('tacticStatus').textContent = 'Guardada';
    return true;
  }

  function loadBoard(next) {
    board = next;
    selectedId = null;
    preview = null;
    undoStack = [];
    redoStack = [];
    persistDraft();
    renderTactica();
  }

  function openTactic(id) {
    const tactic = visibleTactics().find(t => t.id === id);
    if (!tactic) return;
    showError('');
    loadBoard({ id: tactic.id, name: tactic.name, items: clone(tactic.items), dirty: false });
  }

  function newTactic() {
    showError('');
    loadBoard({ id: null, name: '', items: [], dirty: false });
  }

  // Si hay cambios sin guardar, pregunta antes de cambiar de táctica (con una
  // barra inline: confirm() está bloqueado en varias vistas embebidas).
  function guard(action) {
    if (!board.dirty) { action(); return; }
    pendingAction = action;
    $('tacticConfirm').hidden = false;
  }

  function closeConfirm() {
    pendingAction = null;
    $('tacticConfirm').hidden = true;
    renderTacticSelect();
  }

  function runPending() {
    const action = pendingAction;
    $('tacticConfirm').hidden = true;
    pendingAction = null;
    if (action) action();
  }

  function renderTacticSelect() {
    const sel = $('tacticSelect');
    if (!sel) return;
    const list = visibleTactics();
    sel.innerHTML = '';
    if (!board.id || !list.some(t => t.id === board.id)) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = list.length ? '— Táctica nueva —' : '— Sin tácticas guardadas —';
      sel.appendChild(opt);
    }
    list.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      const date = formatDateDisplay(String(t.updatedAt).slice(0, 10));
      opt.textContent = date ? `${t.name} — ${date}` : t.name;
      sel.appendChild(opt);
    });
    sel.value = board.id && list.some(t => t.id === board.id) ? board.id : '';
    $('removeTacticBtn').disabled = !(board.id && list.some(t => t.id === board.id));
  }

  function setupRemoveButton() {
    const btn = $('removeTacticBtn');
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
      const tactic = state.tactics.find(t => t.id === board.id);
      if (tactic) {
        tactic.deleted = true;
        tactic.items = [];
        tactic.updatedAt = new Date().toISOString();
        saveState();
      }
      newTactic();
    });
  }

  // ------------------------------------------------------------------
  // Exportar como imagen (PNG)
  // ------------------------------------------------------------------
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function buildPng() {
    const scale = 3;
    const exportSvg = svgEl('svg', {
      viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, width: VIEW_W * scale, height: VIEW_H * scale
    });
    drawPitch(exportSvg);
    renderItems(svgEl('g', {}, exportSvg), board.items, null);
    const xml = new XMLSerializer().serializeToString(exportSvg);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));

    try {
      const pitch = await loadImage(url);
      const headerH = 130;
      const canvas = document.createElement('canvas');
      canvas.width = VIEW_W * scale;
      canvas.height = VIEW_H * scale + headerH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0d3a75';
      ctx.fillRect(0, 0, canvas.width, headerH);
      ctx.drawImage(pitch, 0, headerH, VIEW_W * scale, VIEW_H * scale);

      let textRight = canvas.width - 40;
      try {
        const crest = await loadImage('images/escudo-faltajue.png');
        // El PNG del escudo tiene fondo blanco: va sobre una chapita para que no quede como un cuadrado suelto.
        const badgeW = 120;
        const badgeH = 112;
        const badgeX = canvas.width - 40 - badgeW;
        const badgeY = (headerH - badgeH) / 2;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 18);
        ctx.fill();
        ctx.drawImage(crest, badgeX + (badgeW - 106) / 2, badgeY + (badgeH - 104) / 2, 106, 104);
        textRight = badgeX - 24;
      } catch (err) { /* sin escudo, sigue igual */ }

      const title = board.name.trim() || 'Táctica';
      let size = 52;
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      do {
        ctx.font = `bold ${size}px ${FONT}`;
        size -= 2;
      } while (ctx.measureText(title).width > textRight - 40 && size > 22);
      ctx.fillText(title, 40, headerH / 2 - 10);
      ctx.font = `28px ${FONT}`;
      ctx.fillStyle = '#cfd8e3';
      ctx.fillText(`DTCommander · ${formatDateDisplay(new Date().toISOString().slice(0, 10))}`, 40, headerH / 2 + 30);

      return await new Promise((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png');
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function exportImage() {
    const btn = $('exportTacticBtn');
    btn.disabled = true;
    showError('');
    try {
      const blob = await buildPng();
      const slug = (board.name.trim() || 'tactica')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'tactica';
      const filename = `${slug}.png`;
      const file = new File([blob], filename, { type: 'image/png' });

      // En celular se abre el menú de compartir (WhatsApp, etc.); en compu se descarga.
      const wantsShare = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (wantsShare && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: board.name.trim() || 'Táctica' });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      $('tacticStatus').textContent = 'Imagen descargada';
    } catch (err) {
      console.error('No se pudo exportar la táctica:', err);
      showError('No se pudo generar la imagen.');
    } finally {
      btn.disabled = false;
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
      board = {
        id: draft.id || null,
        name: String(draft.name || '').slice(0, 60),
        items: sanitizeTacticItems(draft.items),
        dirty: true
      };
    } catch (err) { /* borrador ilegible: se ignora */ }
  }

  function setupTactica() {
    if (isSetup) return;
    svg = $('tacticField');
    if (!svg) return;
    isSetup = true;
    ensureTactics();

    drawPitch(svg);
    itemsLayer = svgEl('g', { id: 'tacticItems' }, svg);

    $('tacticPalette').innerHTML = '';
    PALETTE.forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch';
      btn.dataset.color = c.value;
      btn.title = c.name;
      btn.setAttribute('aria-label', c.name);
      btn.style.background = c.value;
      btn.addEventListener('click', () => setColor(c.value));
      $('tacticPalette').appendChild(btn);
    });

    document.querySelectorAll('#tacticTools .tool-btn').forEach(btn => {
      btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });
    $('tacticDash').addEventListener('change', e => setDashed(e.target.checked));
    $('tacticUndo').addEventListener('click', undo);
    $('tacticRedo').addEventListener('click', redo);
    $('tacticDelete').addEventListener('click', deleteSelected);

    const clearBtn = $('tacticClear');
    let clearArmed = false;
    let clearTimer = null;
    clearBtn.addEventListener('click', () => {
      if (!board.items.length) return;
      if (!clearArmed) {
        clearArmed = true;
        clearBtn.textContent = '¿Seguro? Tocá de nuevo';
        clearTimeout(clearTimer);
        clearTimer = setTimeout(() => { clearArmed = false; clearBtn.textContent = 'Vaciar'; }, 3000);
        return;
      }
      clearArmed = false;
      clearTimeout(clearTimer);
      clearBtn.textContent = 'Vaciar';
      mutate(() => { board.items = []; selectedId = null; });
      refreshAll();
    });

    const textInput = $('tacticText');
    textInput.addEventListener('focus', () => { textEditBefore = snapshot(); });
    textInput.addEventListener('input', () => {
      const item = selectedItem();
      const value = textInput.value.slice(0, 80);
      if (item && item.type === 'text' && value.trim()) {
        item.text = value;
        renderBoard();
      }
    });
    textInput.addEventListener('change', () => {
      const item = selectedItem();
      if (item && item.type === 'text' && textEditBefore !== null) commit(textEditBefore);
      textEditBefore = null;
      if (item && item.type === 'text') { textInput.value = item.text; updateToolbar(); }
    });

    $('tacticName').addEventListener('input', e => {
      board.name = e.target.value;
      showError('');
      markDirty();
    });
    $('saveTacticBtn').addEventListener('click', () => saveTactic(false));
    $('saveTacticCopyBtn').addEventListener('click', () => saveTactic(true));
    $('exportTacticBtn').addEventListener('click', exportImage);
    $('addRivalBtn').addEventListener('click', addRival);
    $('importFormationBtn').addEventListener('click', importFromFormation);

    $('newTacticBtn').addEventListener('click', () => guard(newTactic));
    $('tacticSelect').addEventListener('change', e => {
      const id = e.target.value;
      if (!id || id === board.id) { renderTacticSelect(); return; }
      guard(() => openTactic(id));
    });
    $('tacticConfirmSave').addEventListener('click', () => { if (saveTactic(false)) runPending(); });
    $('tacticConfirmDiscard').addEventListener('click', runPending);
    $('tacticConfirmCancel').addEventListener('click', closeConfirm);
    setupRemoveButton();

    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup', e => finishDrag(e, false));
    svg.addEventListener('pointercancel', e => finishDrag(e, true));

    document.addEventListener('keydown', e => {
      const panel = $('panel-tactica');
      if (!panel || !panel.classList.contains('active')) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    });

    restoreDraft();
  }

  function renderTactica() {
    if (!isSetup) return;
    ensureTactics();
    renderTacticSelect();
    const nameInput = $('tacticName');
    if (document.activeElement !== nameInput) nameInput.value = board.name;
    refreshAll();
    updateStatus();
  }

  window.setupTactica = setupTactica;
  window.renderTactica = renderTactica;
})();
