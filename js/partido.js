// ==================================================================
// DTCommander — solapa Partido (en vivo)
//
// Reloj del partido (1.er tiempo, entretiempo, 2.º tiempo, final), marcador,
// jugadas de un toque (gol nuestro, gol rival, jugada de gol, jugada peligrosa; y falta,
// tiro libre, córner, lateral y penal, que preguntan "a favor / en contra" al tocarlas),
// la cancha del partido (una copia de la alineación que se trae de Formación o de
// una táctica guardada) y los cambios (por hacer -> hecho, con su minuto). Todo se
// guarda en state.matchLogs (ver app.js) y viaja por la misma sincronización.
// ==================================================================
(function () {
  const KIND_LABELS = {
    goal: 'Gol nuestro', goalRival: 'Gol rival', chance: 'Jugada de gol', danger: 'Jugada peligrosa',
    foul: 'Falta', freeKick: 'Tiro libre', corner: 'Córner', throwIn: 'Lateral', penalty: 'Penal'
  };
  const SIDE_LABELS = { for: 'a favor', against: 'en contra' };
  // Las jugadas que llevan lado se nombran con él: "Falta en contra", "Córner a favor".
  const eventLabel = ev => (MATCH_SIDE_KINDS.includes(ev.kind) ? `${KIND_LABELS[ev.kind]} ${SIDE_LABELS[ev.side]}` : KIND_LABELS[ev.kind]);
  // Qué se le pide en "quién" según la jugada y el lado (después de tocar el botón, abajo en la descripción).
  const WHO_PROMPTS = {
    foul: { for: 'Quién la recibió…', against: 'Quién la cometió…' },
    freeKick: { for: 'Quién lo ejecutó…', against: 'Quién hizo la falta…' },
    corner: { for: 'Quién lo ejecutó…', against: 'Jugadora involucrada…' },
    throwIn: { for: 'Quién lo sacó…', against: 'Jugadora involucrada…' },
    penalty: { for: 'Quién lo pateó…', against: 'Quién lo cometió…' }
  };
  const SIDE_ASK_MS = 8000; // si no se elige "a favor / en contra" en este tiempo, se cancela
  const PHASE_LABELS = { idle: 'Sin empezar', t1: '1.er tiempo', ht: 'Entretiempo', t2: '2.º tiempo', end: 'Final' };
  const PHASE_BUTTONS = {
    idle: 'Iniciar 1.er tiempo', t1: 'Fin del 1.er tiempo', ht: 'Iniciar 2.º tiempo', t2: 'Finalizar partido', end: 'Reabrir partido'
  };
  const ARM_MS = 3000;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  let armedPhase = false;
  let armedReset = false;
  let armedBring = false;
  let armTimer = null;
  let resetTimer = null;
  let bringTimer = null;
  let errorTimer = null;
  let toastTimer = null;
  let wakeLock = null;
  let syncedMatchId = null;
  let setupMatch = null;
  let setupPhase = null;
  let pinnedName = null;
  let hoverName = null;
  let suggestionsChart = null;
  let pendingSide = null; // { kind, pos }: una jugada con lado que está esperando "a favor / en contra"
  let sideTimer = null;
  const TAP_PX = 6; // menos que esto entre que se apoya y se suelta es un toque, no un arrastre

  const $ = id => document.getElementById(id);
  const nowIso = () => new Date().toISOString();
  const newId = prefix => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const isRunning = meta => meta.phase === 't1' || meta.phase === 't2';

  // ------------------------------------------------------------------
  // Registro del partido activo
  // ------------------------------------------------------------------
  // null si todavía no se anotó nada; con create = true lo arma.
  function recordOf(create) {
    if (!Array.isArray(state.matchLogs)) state.matchLogs = [];
    const id = state.activeMatch;
    let rec = state.matchLogs.find(r => r.id === id) || null;
    if (rec && rec.deleted) {
      if (!create) return null;
      rec.deleted = false;
      rec.items = sanitizeLogItems([]);
    }
    if (!rec && create) {
      const match = state.matches[id];
      rec = { id, name: (match && match.rival) || '', createdAt: nowIso(), updatedAt: nowIso(), deleted: false, items: sanitizeLogItems([]) };
      state.matchLogs.push(rec);
    }
    return rec;
  }

  const metaOf = rec => rec.items.find(i => i.type === 'meta');

  function view() {
    const rec = recordOf(false);
    const items = rec ? rec.items : sanitizeLogItems([]);
    return {
      rec,
      meta: items.find(i => i.type === 'meta'),
      events: items.filter(i => i.type === 'event'),
      subs: items.filter(i => i.type === 'sub')
    };
  }

  function commit(rec) {
    rec.updatedAt = nowIso();
    const match = state.matches[rec.id];
    if (match) rec.name = match.rival || '';
    saveState();
  }

  // El partido borrado se marca como borrado (no se saca de la lista) para que una copia vieja no lo reviva.
  window.removeMatchLog = function (matchId) {
    if (!Array.isArray(state.matchLogs)) return;
    const rec = state.matchLogs.find(r => r.id === matchId);
    if (!rec) return;
    rec.deleted = true;
    rec.items = [];
    rec.updatedAt = nowIso();
  };

  // ------------------------------------------------------------------
  // Tiempo. Se guardan las horas de inicio y fin de cada tiempo, no un contador
  // que va sumando: así el reloj sigue bien aunque se bloquee el celular, se
  // cambie de solapa o se recargue la página.
  // ------------------------------------------------------------------
  // Segundos transcurridos DENTRO del tiempo en juego (o del último que se jugó).
  function position(meta, now) {
    const secs = (from, to) => Math.max(0, Math.floor((to - from) / 1000));
    if (meta.phase === 't1') return { half: 1, sec: secs(meta.t1Start, now) };
    if (meta.phase === 'ht') return { half: 1, sec: secs(meta.t1Start, meta.t1End) };
    if (meta.phase === 't2') return { half: 2, sec: secs(meta.t2Start, now) };
    if (meta.phase === 'end') return { half: 2, sec: secs(meta.t2Start, meta.t2End) };
    return { half: 1, sec: 0 };
  }

  // El 2.º tiempo sigue contando desde el final del 1.º (25 min de duración -> arranca en 25:00).
  const totalSec = (meta, pos) => (pos.half === 2 ? meta.duration * 60 : 0) + pos.sec;

  function clockText(total) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // Minuto que se está jugando: a los 23:10 es el minuto 24, como se dice en el fútbol.
  const minuteNumber = (meta, half, sec) => (half === 2 ? meta.duration : 0) + Math.floor(sec / 60) + 1;

  function minuteLabel(meta, half, sec) {
    const minute = minuteNumber(meta, half, sec);
    const cap = half === 2 ? meta.duration * 2 : meta.duration;
    return minute > cap ? `${cap}+${minute - cap}'` : `${minute}'`;
  }

  // ------------------------------------------------------------------
  // Mensajes
  // ------------------------------------------------------------------
  function showError(message) {
    const el = $('liveError');
    if (!el) return;
    el.textContent = message;
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => { el.textContent = ''; }, 7000);
  }

  function showToast(message) {
    const el = $('liveToast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  // ------------------------------------------------------------------
  // Pantalla encendida mientras corre el reloj (si el navegador lo permite)
  // ------------------------------------------------------------------
  async function syncWakeLock(running) {
    try {
      if (running && !wakeLock && navigator.wakeLock && !document.hidden) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!running && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (err) {
      wakeLock = null;
    }
  }

  // ------------------------------------------------------------------
  // Acciones: fases del partido
  // ------------------------------------------------------------------
  function disarmPhase() {
    armedPhase = false;
    clearTimeout(armTimer);
  }

  function changePhase() {
    const meta = view().meta;
    // Terminar un tiempo se confirma con un segundo toque (un toque de más en la cancha no debería cortar el reloj).
    if ((meta.phase === 't1' || meta.phase === 't2') && !armedPhase) {
      armedPhase = true;
      clearTimeout(armTimer);
      armTimer = setTimeout(() => { armedPhase = false; renderPartido(); }, ARM_MS);
      renderPartido();
      return;
    }
    disarmPhase();
    const rec = recordOf(true);
    const m = metaOf(rec);
    const now = Date.now();
    if (m.phase === 'idle') {
      m.lineup = Object.keys(m.field);
      m.phase = 't1';
      m.t1Start = now;
      m.t1End = m.t2Start = m.t2End = null;
    } else if (m.phase === 't1') {
      m.phase = 'ht';
      m.t1End = now;
    } else if (m.phase === 'ht') {
      m.phase = 't2';
      m.t2Start = now;
      m.t2End = null;
    } else if (m.phase === 't2') {
      m.phase = 'end';
      m.t2End = now;
    } else if (m.phase === 'end') {
      // Reabrir: el 2.º tiempo sigue desde donde estaba, sin perder lo que ya corrió.
      m.t2Start = now - (m.t2End - m.t2Start);
      m.t2End = null;
      m.phase = 't2';
    }
    commit(rec);
    renderPartido();
  }

  // Ajustar el reloj: por si se olvidó de arrancarlo justo cuando salió la pelota.
  function nudge(deltaMinutes) {
    const rec = recordOf(false);
    if (!rec) return;
    const m = metaOf(rec);
    if (!isRunning(m)) return;
    const key = m.phase === 't1' ? 't1Start' : 't2Start';
    m[key] = Math.min(Date.now(), m[key] - deltaMinutes * 60000);
    commit(rec);
    renderPartido();
  }

  function setDuration(minutes) {
    if (!MATCH_DURATIONS.includes(minutes)) return;
    const rec = recordOf(true);
    metaOf(rec).duration = minutes;
    commit(rec);
    renderPartido();
  }

  function resetLog() {
    if (!armedReset) {
      armedReset = true;
      $('liveResetBtn').textContent = '¿Seguro? Tocá de nuevo';
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => { armedReset = false; $('liveResetBtn').textContent = 'Borrar registro'; }, ARM_MS);
      return;
    }
    armedReset = false;
    clearTimeout(resetTimer);
    $('liveResetBtn').textContent = 'Borrar registro';
    const rec = recordOf(false);
    if (!rec) return;
    rec.items = sanitizeLogItems([]);
    commit(rec);
    renderPartido();
  }

  // ------------------------------------------------------------------
  // Acciones: jugadas
  // ------------------------------------------------------------------
  // side y atPos solo para las jugadas con lado: el momento es el del primer toque, no el de elegir el lado.
  function addEvent(kind, side, atPos) {
    const rec = recordOf(true);
    const meta = metaOf(rec);
    if (rec.items.filter(i => i.type === 'event').length >= MAX_LOG_EVENTS) {
      showError('Ya hay demasiadas jugadas anotadas en este partido.');
      return;
    }
    const pos = atPos || position(meta, Date.now());
    const ev = {
      id: newId('e'), type: 'event', kind, side: MATCH_SIDE_KINDS.includes(kind) ? side : '',
      half: pos.half, sec: pos.sec, player: '', assist: '', note: ''
    };
    rec.items.push(ev);
    commit(rec);
    renderPartido();
    const detail = kind === 'goal' ? ' Después completá quién la metió.' : (MATCH_SIDE_KINDS.includes(kind) ? ' Después completá quién.' : '');
    showToast(`${eventLabel(ev)} · ${minuteLabel(meta, pos.half, pos.sec)}.${detail}`);
  }

  // Jugadas con lado: al tocar el botón la misma fila pregunta "a favor / en contra" (dos toques en total).
  function askSide(kind) {
    pendingSide = { kind, pos: position(view().meta, Date.now()) };
    clearTimeout(sideTimer);
    sideTimer = setTimeout(cancelSide, SIDE_ASK_MS);
    renderSidePicker();
  }

  function chooseSide(side) {
    if (!pendingSide) return;
    const { kind, pos } = pendingSide;
    cancelSide();
    addEvent(kind, side === 'against' ? 'against' : 'for', pos);
  }

  function cancelSide() {
    pendingSide = null;
    clearTimeout(sideTimer);
    renderSidePicker();
  }

  function renderSidePicker() {
    if (!$('liveSidePicker')) return;
    $('liveMoreButtons').hidden = !!pendingSide;
    $('liveSidePicker').hidden = !pendingSide;
    if (pendingSide) $('liveSideLabel').textContent = KIND_LABELS[pendingSide.kind];
  }

  function updateEvent(id, field, value) {
    const rec = recordOf(false);
    if (!rec) return;
    const ev = rec.items.find(i => i.type === 'event' && i.id === id);
    if (!ev) return;
    const meta = metaOf(rec);
    if (field === 'minute') {
      const minute = Math.round(Number(value));
      // Sin cambios (o algo que no es un minuto): se deja como estaba, así no se pierden los segundos ni el tiempo agregado.
      if (!Number.isFinite(minute) || minute < 1 || minute === minuteNumber(meta, ev.half, ev.sec)) { renderPartido(); return; }
      if (minute <= meta.duration) {
        ev.half = 1;
        ev.sec = (minute - 1) * 60;
      } else {
        ev.half = 2;
        ev.sec = Math.min(7200, (minute - meta.duration - 1) * 60);
      }
    } else if (field === 'player' || field === 'assist') {
      ev[field] = String(value).slice(0, 40);
    } else if (field === 'side') {
      if (!MATCH_SIDE_KINDS.includes(ev.kind)) return;
      ev.side = value === 'against' ? 'against' : 'for';
    } else if (field === 'note') {
      ev.note = String(value).slice(0, 120);
    } else {
      return;
    }
    commit(rec);
    renderPartido();
  }

  function removeEvent(id) {
    const rec = recordOf(false);
    if (!rec) return;
    rec.items = rec.items.filter(i => !(i.type === 'event' && i.id === id));
    commit(rec);
    renderPartido();
  }

  // ------------------------------------------------------------------
  // Acciones: cambios (actúan sobre la cancha del partido, no sobre Formación)
  // ------------------------------------------------------------------
  function addSub(out, inn) {
    if (!out || !inn) { showError('Elegí quién sale y quién entra.'); return false; }
    const field = view().meta.field;
    if (!field[out]) { showError(`${out} no está en la cancha del partido.`); return false; }
    if (field[inn]) { showError(`${inn} ya está en la cancha del partido.`); return false; }
    const rec = recordOf(true);
    if (rec.items.filter(i => i.type === 'sub').length >= MAX_LOG_SUBS) { showError('Ya hay demasiados cambios en este partido.'); return false; }
    rec.items.push({ id: newId('s'), type: 'sub', out, in: inn, status: 'pending', half: 1, sec: 0 });
    commit(rec);
    return true;
  }

  // Hecho: entra la nueva jugadora en el lugar de la que sale, y queda anotado el minuto.
  function doSub(id) {
    const rec = recordOf(false);
    if (!rec) return;
    const sub = rec.items.find(i => i.type === 'sub' && i.id === id);
    if (!sub || sub.status !== 'pending') return;
    const meta = metaOf(rec);
    const field = meta.field;
    if (!field[sub.out]) { showError(`${sub.out} ya no está en la cancha del partido. Quitá el cambio o traé la alineación de nuevo.`); return; }
    if (field[sub.in]) { showError(`${sub.in} ya está en la cancha del partido.`); return; }
    field[sub.in] = { x: field[sub.out].x, y: field[sub.out].y };
    delete field[sub.out];
    const pos = position(meta, Date.now());
    sub.status = 'done';
    sub.half = pos.half;
    sub.sec = pos.sec;
    commit(rec);
    renderPartido();
    showToast(`Cambio hecho · ${minuteLabel(meta, pos.half, pos.sec)}: sale ${sub.out}, entra ${sub.in}.`);
  }

  function undoSub(id) {
    const rec = recordOf(false);
    if (!rec) return;
    const sub = rec.items.find(i => i.type === 'sub' && i.id === id);
    if (!sub || sub.status !== 'done') return;
    const field = metaOf(rec).field;
    if (!field[sub.in] || field[sub.out]) {
      showError(`No se puede deshacer: ${sub.in} tiene que estar en la cancha del partido y ${sub.out} afuera.`);
      return;
    }
    field[sub.out] = { x: field[sub.in].x, y: field[sub.in].y };
    delete field[sub.in];
    sub.status = 'pending';
    sub.half = 1;
    sub.sec = 0;
    commit(rec);
    renderPartido();
  }

  function removeSub(id) {
    const rec = recordOf(false);
    if (!rec) return;
    rec.items = rec.items.filter(i => !(i.type === 'sub' && i.id === id && i.status === 'pending'));
    commit(rec);
    renderPartido();
  }

  // ------------------------------------------------------------------
  // Partido: elegir o crear
  // ------------------------------------------------------------------
  function renderMatchSelect() {
    const sel = $('liveMatchSelect');
    const ids = Object.keys(state.matches).sort((a, b) => (state.matches[b].date || '').localeCompare(state.matches[a].date || ''));
    sel.innerHTML = ids.map(id => `<option value="${escapeHtml(id)}">${escapeHtml(matchLabel(state.matches[id]))}</option>`).join('');
    sel.value = state.activeMatch;
  }

  function confirmAddMatch() {
    const rival = $('liveNewMatchRival').value.trim();
    const error = $('liveAddMatchError');
    error.textContent = '';
    if (!rival) {
      error.textContent = 'Ponele un nombre al rival.';
      $('liveNewMatchRival').focus();
      return;
    }
    const matchId = 'm' + Date.now();
    state.matches[matchId] = makeMatch(rival, $('liveNewMatchDate').value || todayISO());
    state.activeMatch = matchId;
    $('liveAddMatchForm').hidden = true;
    saveState();
    renderPartido();
  }

  // ------------------------------------------------------------------
  // Traer la alineación (de un plan de Formación o de una táctica guardada)
  // ------------------------------------------------------------------
  // Al cambiar de partido se propone su plan y su forma activos.
  function syncSourceSelects() {
    const match = currentMatch();
    const plans = $('liveSourcePlan');
    const forms = $('liveSourceFormation');
    if (!plans.options.length) plans.innerHTML = PLANS.map(p => `<option value="${p}">${p}</option>`).join('');
    if (!forms.options.length) forms.innerHTML = Object.keys(FORMATION_PRESETS).map(f => `<option value="${f}">${f}</option>`).join('');
    if (syncedMatchId !== state.activeMatch) {
      syncedMatchId = state.activeMatch;
      plans.value = match.activePlan;
      const plan = match.plans[match.activePlan];
      forms.value = (plan && plan.activeFormation) || forms.options[0].value;
    }
    const tactics = (state.tactics || []).filter(t => !t.deleted);
    const select = $('liveSourceTactic');
    const keep = select.value;
    select.innerHTML = tactics.length
      ? tactics.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name || 'Sin nombre')}</option>`).join('')
      : '<option value="">No hay tácticas guardadas</option>';
    if (tactics.some(t => t.id === keep)) select.value = keep;
    const kind = $('liveSourceKind').value;
    $('liveSourcePlanBox').hidden = kind !== 'plan';
    $('liveSourceFormationBox').hidden = kind !== 'plan';
    $('liveSourceTacticBox').hidden = kind !== 'tactic';
  }

  function sourcePlacements() {
    if ($('liveSourceKind').value === 'tactic') {
      const tactic = (state.tactics || []).find(t => t.id === $('liveSourceTactic').value && !t.deleted);
      if (!tactic) return { error: 'Elegí una táctica guardada.' };
      const placements = {};
      tactic.items.filter(i => i.type === 'player' && state.players[i.name]).forEach(i => { placements[i.name] = { x: i.x, y: i.y }; });
      return { placements, label: `la táctica "${tactic.name || 'Sin nombre'}"` };
    }
    const planName = $('liveSourcePlan').value;
    const shape = $('liveSourceFormation').value;
    const plan = currentMatch().plans[planName];
    const formation = plan && plan.formations[shape];
    const placements = {};
    Object.keys((formation && formation.placements) || {}).forEach(name => {
      if (state.players[name]) placements[name] = { x: formation.placements[name].x, y: formation.placements[name].y };
    });
    return { placements, label: `${planName} (${shape})` };
  }

  function resetBringButton() {
    armedBring = false;
    clearTimeout(bringTimer);
    $('liveBringBtn').textContent = 'Traer alineación';
  }

  function bringLineup() {
    const error = $('liveBringError');
    error.textContent = '';
    const src = sourcePlacements();
    if (src.error) { error.textContent = src.error; return; }
    if (!Object.keys(src.placements).length) { error.textContent = `${src.label} no tiene jugadoras ubicadas.`; return; }
    const v = view();
    // Con el partido empezado (o con cambios hechos) traer de nuevo pisa lo que se fue moviendo: se pide confirmar.
    if ((v.meta.phase !== 'idle' || v.subs.some(s => s.status === 'done')) && !armedBring) {
      armedBring = true;
      $('liveBringBtn').textContent = '¿Seguro? Se reemplaza la cancha del partido';
      clearTimeout(bringTimer);
      bringTimer = setTimeout(resetBringButton, ARM_MS);
      return;
    }
    resetBringButton();
    const rec = recordOf(true);
    metaOf(rec).field = src.placements;
    commit(rec);
    renderPartido();
    showToast(`Alineación traída de ${src.label}.`);
  }

  // ------------------------------------------------------------------
  // La cancha del partido: fichas y banco arrastrables (mismo gesto que en Formación)
  // ------------------------------------------------------------------
  function overField(clientX, clientY) {
    const rect = $('matchField').getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function svgPoint(clientX, clientY) {
    const field = $('matchField');
    const rect = field.getBoundingClientRect();
    const box = field.viewBox.baseVal;
    return clampToField(((clientX - rect.left) / rect.width) * box.width, ((clientY - rect.top) / rect.height) * box.height);
  }

  // Suelta a una jugadora: dentro de la cancha la ubica; afuera la manda al banco.
  function dropPlayer(name, clientX, clientY, allowRemove) {
    const inside = overField(clientX, clientY);
    if (!inside && !allowRemove) return;
    const rec = recordOf(true);
    const field = metaOf(rec).field;
    if (inside) {
      const p = svgPoint(clientX, clientY);
      field[name] = { x: p.x, y: p.y };
    } else {
      delete field[name];
    }
    commit(rec);
    renderPartido();
  }

  // Un toque sin mover el dedo no es un arrastre: el "ghost" recién aparece cuando el puntero se aleja unos píxeles.
  // onEnd(evento, seMovió): evento es null si el gesto se canceló.
  function startDrag(evt, name, onEnd, onStart) {
    let ghost = null;
    const move = e => {
      if (!ghost) {
        if (Math.hypot(e.clientX - evt.clientX, e.clientY - evt.clientY) < TAP_PX) return;
        ghost = makeGhost(name);
        document.body.appendChild(ghost);
        if (onStart) onStart();
      }
      moveGhost(ghost, e.clientX, e.clientY);
    };
    const finish = e => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      const moved = !!ghost;
      if (ghost) ghost.remove();
      onEnd(e, moved);
    };
    const up = e => finish(e);
    const cancel = () => finish(null);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
  }

  function makeGhost(name) {
    const ghost = document.createElement('div');
    ghost.className = 'player-chip dragging-ghost';
    ghost.textContent = name;
    const player = state.players[name];
    ghost.style.borderLeft = `5px solid ${colorForPosition(player && player.posPrincipal)}`;
    return ghost;
  }

  // Arrastrar mueve a la jugadora; un toque (o clic) sin arrastrar fija el panel con su perfil y los cambios sugeridos.
  function onTokenPointerDown(evt) {
    evt.preventDefault();
    const g = evt.currentTarget;
    const name = g.dataset.player;
    startDrag(evt, name, (e, moved) => {
      g.style.opacity = '';
      if (!e) return;
      if (!moved) { togglePin(name); return; }
      dropPlayer(name, e.clientX, e.clientY, true);
    }, () => { g.style.opacity = '0.25'; });
  }

  function onChipPointerDown(evt) {
    const name = evt.currentTarget.dataset.player;
    startDrag(evt, name, (e, moved) => {
      if (e && moved) dropPlayer(name, e.clientX, e.clientY, false);
    });
  }

  function createToken(name, x, y) {
    const player = state.players[name];
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'player-token');
    g.setAttribute('transform', `translate(${x}, ${y})`);
    g.dataset.player = name;
    // Mismo tamaño que en Formación: el círculo visible es más chico que el área de toque.
    const hit = document.createElementNS(SVG_NS, 'circle');
    hit.setAttribute('r', 16);
    hit.setAttribute('fill', 'transparent');
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('r', 12.8);
    circle.setAttribute('class', 'token-circle');
    circle.style.fill = colorForPosition(player && player.posPrincipal);
    circle.style.pointerEvents = 'none';
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('class', 'token-label');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dy', 3.2);
    text.textContent = name.slice(0, 3);
    g.appendChild(hit);
    g.appendChild(circle);
    g.appendChild(text);
    g.addEventListener('pointerdown', onTokenPointerDown);
    // Con mouse, pasar por encima muestra el panel (vista previa) sin fijarlo; con el dedo no hay "pasar por encima".
    // En pantallas chicas el panel es una hoja fija abajo que taparía la ficha: ahí solo se fija con un toque.
    g.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse' || pinnedName || window.matchMedia('(max-width: 640px)').matches) return;
      hoverName = name;
      renderSuggestions();
    });
    g.addEventListener('pointerleave', () => {
      if (hoverName !== name) return;
      hoverName = null;
      renderSuggestions();
    });
    return g;
  }

  function createChip(name) {
    const chip = document.createElement('div');
    chip.className = 'player-chip';
    chip.textContent = name;
    chip.dataset.player = name;
    const player = state.players[name];
    chip.style.borderLeft = `5px solid ${colorForPosition(player && player.posPrincipal)}`;
    chip.addEventListener('pointerdown', onChipPointerDown);
    return chip;
  }

  // ------------------------------------------------------------------
  // Panel de la jugadora elegida: su perfil (gráfico) y los cambios sugeridos del banco
  // ------------------------------------------------------------------
  function ratingBadge(name) {
    const p = state.players[name];
    const shown = Math.round(average(p.attrs, p) * SCORE_SCALE);
    const bg = colorForAttrValue(shown / SCORE_SCALE);
    return `<span class="sugg-rating" style="background:${bg};color:${readableTextColor(bg)}" title="Promedio">${shown}</span>`;
  }

  const positionsText = p => [p.posPrincipal, p.posSecundaria].filter(Boolean).join(' / ') || 'sin puesto';

  // Del banco: primero las que juegan el mismo puesto (principal o secundario), de mejor a peor promedio.
  function benchCandidates(name, field) {
    const player = state.players[name];
    const rate = n => average(state.players[n].attrs, state.players[n]);
    const best = list => list.slice().sort((a, b) => rate(b) - rate(a));
    const bench = Object.keys(state.players).filter(n => n !== name && !field[n]);
    const wanted = [player.posPrincipal, player.posSecundaria].filter(Boolean);
    const same = bench.filter(n => {
      const o = state.players[n];
      return wanted.includes(o.posPrincipal) || wanted.includes(o.posSecundaria);
    });
    return { same: best(same), all: best(bench) };
  }

  function markSelected() {
    $('matchField').querySelectorAll('.player-token').forEach(g => g.classList.toggle('selected', g.dataset.player === pinnedName));
  }

  function renderSuggestions() {
    const panel = $('liveSuggestions');
    if (!panel) return;
    const field = view().meta.field;
    if (pinnedName && !field[pinnedName]) pinnedName = null; // la que estaba fijada salió de la cancha
    const name = pinnedName || hoverName;
    const player = name && field[name] && state.players[name];
    if (!player) { panel.hidden = true; return; }

    const pinned = name === pinnedName;
    const cands = benchCandidates(name, field);
    const list = cands.same.length ? cands.same : cands.all;
    $('liveSuggestionsFor').textContent = `${name} (${positionsText(player)})`;
    $('liveSuggestionsTitle').textContent = cands.same.length ? 'Cambios sugeridos (su puesto)' : 'Nadie del banco juega su puesto. Banco';
    $('liveSuggestionsList').innerHTML = list.length ? list.map(n => {
      const o = state.players[n];
      return `<div class="live-sugg-row" style="border-left-color:${colorForPosition(o.posPrincipal)}">
        <div class="live-sugg-info">
          <span class="live-sugg-name">${escapeHtml(n)}</span>
          <span class="live-sugg-pos">${escapeHtml(positionsText(o))}</span>
        </div>
        ${ratingBadge(n)}
        ${pinned ? `<button type="button" class="btn btn-small" data-act="suggest-sub" data-out="${escapeHtml(name)}" data-in="${escapeHtml(n)}">Cambio</button>` : ''}
      </div>`;
    }).join('') : '<p class="hint">No hay nadie en el banco.</p>';
    $('liveSuggestionsHint').textContent = pinned
      ? 'Tocá "Cambio" para dejar armado que ella sale y entra esa compañera.'
      : 'Hacé clic en la jugadora para fijar este panel y armar un cambio.';
    $('liveSuggestionsClose').hidden = !pinned;
    // Primero se muestra el panel y recién después se dibuja el gráfico: un canvas oculto mide 0 x 0.
    panel.hidden = false;
    if ($('panel-partido').classList.contains('active')) {
      suggestionsChart = buildOrUpdateRadar(suggestionsChart, 'liveSuggestionsRadar', name, ATTRIBUTES.map(a => player.attrs[a]), true);
    }
  }

  function togglePin(name) {
    pinnedName = pinnedName === name ? null : name;
    hoverName = null;
    markSelected();
    renderSuggestions();
  }

  function unpin() {
    pinnedName = null;
    hoverName = null;
    markSelected();
    renderSuggestions();
  }

  // Un toque en una sugerida deja armado el cambio "por hacer" (sale la elegida, entra la sugerida).
  function suggestSub(out, inn) {
    if (view().subs.some(s => s.status === 'pending' && s.out === out && s.in === inn)) {
      showToast(`El cambio ${out} → ${inn} ya está por hacer.`);
      return;
    }
    if (!addSub(out, inn)) return;
    unpin();
    renderPartido();
    showToast(`Cambio por hacer: sale ${out}, entra ${inn}. Marcalo "Hecho" cuando entre.`);
  }

  function renderField(meta) {
    const field = $('matchField');
    field.querySelectorAll('.player-token').forEach(el => el.remove());
    Object.keys(meta.field).forEach(name => {
      if (state.players[name]) field.appendChild(createToken(name, meta.field[name].x, meta.field[name].y));
    });
    const bench = $('liveAvailable');
    bench.innerHTML = '';
    Object.keys(state.players).filter(n => !meta.field[n]).forEach(n => bench.appendChild(createChip(n)));
    markSelected();
    const count = Object.keys(meta.field).length;
    $('liveBringHint').textContent = count
      ? `En la cancha del partido: ${count} jugadoras. Es una copia: lo que muevas o cambies acá no toca tus planes de Formación. Arrastrá a una jugadora afuera de la cancha para mandarla al banco.`
      : 'Todavía no hay alineación en la cancha del partido. Elegí de dónde traerla y tocá "Traer alineación" (o arrastrá jugadoras desde el banco).';
  }

  // ------------------------------------------------------------------
  // Dibujo
  // ------------------------------------------------------------------
  function playerOptions(names, selected, placeholder) {
    // Si el nombre guardado ya no existe (se borró la jugadora) se sigue mostrando, para no perder el dato.
    const list = selected && !names.includes(selected) ? names.concat([selected]) : names;
    return `<option value="">${placeholder}</option>` + list.map(n =>
      `<option value="${escapeHtml(n)}"${n === selected ? ' selected' : ''}>${escapeHtml(n)}</option>`).join('');
  }

  function renderClock() {
    const bar = $('liveBar');
    if (!bar) return;
    const meta = view().meta;
    const pos = position(meta, Date.now());
    $('liveClock').textContent = clockText(totalSec(meta, pos));
    $('livePhase').textContent = PHASE_LABELS[meta.phase];
    bar.classList.toggle('live-running', isRunning(meta));
  }

  function renderEvents(v) {
    const el = $('liveEventList');
    if (!v.events.length) {
      el.innerHTML = '<p class="hint">Todavía no hay jugadas anotadas. Tocá los botones de arriba mientras se juega; el detalle lo completás después.</p>';
      return;
    }
    const names = Object.keys(state.players);
    const sorted = v.events
      .map((ev, idx) => ({ ev, idx }))
      .sort((a, b) => (b.ev.half - a.ev.half) || (b.ev.sec - a.ev.sec) || (b.idx - a.idx))
      .map(x => x.ev);
    el.innerHTML = sorted.map(ev => `
      <div class="live-row live-row-${ev.kind}${ev.side ? ' live-row-side-' + ev.side : ''}" data-id="${escapeHtml(ev.id)}">
        <span class="live-kind live-kind-${ev.kind}">${eventLabel(ev)}</span>
        <label class="live-min">Min
          <input type="number" min="1" max="200" value="${minuteNumber(v.meta, ev.half, ev.sec)}" data-field="minute" aria-label="Minuto">
        </label>
        ${MATCH_SIDE_KINDS.includes(ev.kind) ? `
          <select data-field="side" aria-label="A favor o en contra">
            <option value="for"${ev.side === 'for' ? ' selected' : ''}>A favor</option>
            <option value="against"${ev.side === 'against' ? ' selected' : ''}>En contra</option>
          </select>
          <select data-field="player" aria-label="Quién">${playerOptions(names, ev.player, WHO_PROMPTS[ev.kind][ev.side])}</select>` : ''}
        ${ev.kind === 'goal' ? `
          <select data-field="player" aria-label="Quién metió el gol">${playerOptions(names, ev.player, 'Quién la metió…')}</select>
          <select data-field="assist" aria-label="Quién asistió">${playerOptions(names, ev.assist, 'Asistencia (opcional)')}</select>` : ''}
        ${ev.kind === 'chance' ? `
          <select data-field="player" aria-label="Quién tuvo la jugada">${playerOptions(names, ev.player, 'Quién la tuvo…')}</select>` : ''}
        <input type="text" class="live-note" data-field="note" maxlength="120" placeholder="Nota (opcional)" value="${escapeHtml(ev.note)}" aria-label="Nota">
        <button type="button" class="btn btn-danger btn-small" data-act="remove-event" title="Borrar esta jugada">✕</button>
      </div>`).join('');
  }

  function renderSubs(v) {
    const pending = v.subs.filter(s => s.status === 'pending');
    const done = v.subs
      .filter(s => s.status === 'done')
      .sort((a, b) => (a.half - b.half) || (a.sec - b.sec));

    const chips = $('liveSubChips');
    chips.hidden = !pending.length;
    chips.innerHTML = pending.map(s => `
      <span class="live-chip">
        <span>${escapeHtml(s.out)} → ${escapeHtml(s.in)}</span>
        <button type="button" class="btn btn-small" data-act="do-sub" data-id="${escapeHtml(s.id)}">Hecho</button>
      </span>`).join('');

    const list = $('liveSubList');
    if (!pending.length && !done.length) {
      list.innerHTML = '<p class="hint">Sin cambios. Armalos con "+ Cambio" y marcalos como "Hecho" cuando entren: se anota el minuto y la cancha del partido se actualiza sola.</p>';
      return;
    }
    list.innerHTML = pending.map(s => `
      <div class="live-row live-row-sub-pending" data-id="${escapeHtml(s.id)}">
        <span class="live-kind live-kind-sub-pending">Por hacer</span>
        <span class="live-sub-text">Sale <strong>${escapeHtml(s.out)}</strong> · Entra <strong>${escapeHtml(s.in)}</strong></span>
        <button type="button" class="btn btn-small" data-act="do-sub" data-id="${escapeHtml(s.id)}">Hecho</button>
        <button type="button" class="btn btn-secondary btn-small" data-act="remove-sub" data-id="${escapeHtml(s.id)}">Quitar</button>
      </div>`).join('') + done.map(s => `
      <div class="live-row live-row-sub-done" data-id="${escapeHtml(s.id)}">
        <span class="live-kind live-kind-sub-done">Hecho ${minuteLabel(v.meta, s.half, s.sec)}</span>
        <span class="live-sub-text">Sale <strong>${escapeHtml(s.out)}</strong> · Entra <strong>${escapeHtml(s.in)}</strong></span>
        <button type="button" class="btn btn-secondary btn-small" data-act="undo-sub" data-id="${escapeHtml(s.id)}">Deshacer</button>
      </div>`).join('');
  }

  function fillSubForm(meta) {
    const onField = Object.keys(meta.field);
    const bench = Object.keys(state.players).filter(n => !meta.field[n]);
    const out = $('liveSubOut');
    const inn = $('liveSubIn');
    const keepOut = out.value;
    const keepIn = inn.value;
    out.innerHTML = '<option value="">Elegí…</option>' + onField.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    inn.innerHTML = '<option value="">Elegí…</option>' + bench.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    if (onField.includes(keepOut)) out.value = keepOut;
    if (bench.includes(keepIn)) inn.value = keepIn;
  }

  // El panel de arriba (partido y alineación) se abre solo mientras el partido no empezó y se pliega cuando arranca,
  // para dejar a la vista la cancha. Si después se abre o se cierra a mano, se respeta.
  function syncSetupPanel(meta) {
    const setup = $('liveSetup');
    if (setupMatch !== state.activeMatch) setup.open = meta.phase === 'idle';
    else if (setupPhase === 'idle' && meta.phase !== 'idle') setup.open = false;
    setupMatch = state.activeMatch;
    setupPhase = meta.phase;
    const match = state.matches[state.activeMatch];
    $('liveSetupSummary').textContent =
      `Partido y alineación · vs ${(match && match.rival) || 'Rival'} · ${Object.keys(meta.field).length} en la cancha`;
  }

  function renderPartido() {
    if (!$('liveBar')) return;
    currentMatch(); // si el partido activo dejó de existir, se recupera solo
    const v = view();
    renderMatchSelect();
    syncSourceSelects();

    const dur = $('liveDuration');
    if (!dur.options.length) dur.innerHTML = MATCH_DURATIONS.map(d => `<option value="${d}">${d} min por tiempo</option>`).join('');
    dur.value = String(v.meta.duration);

    renderClock();

    const us = v.events.filter(e => e.kind === 'goal').length;
    const them = v.events.filter(e => e.kind === 'goalRival').length;
    $('liveScore').textContent = `${us} - ${them}`;
    const match = state.matches[state.activeMatch];
    $('liveRival').textContent = (match && match.rival) || 'Rival';

    const btn = $('livePhaseBtn');
    btn.textContent = armedPhase ? '¿Seguro? Tocá de nuevo' : PHASE_BUTTONS[v.meta.phase];
    btn.classList.toggle('live-armed', armedPhase);
    $('liveAdjust').hidden = !isRunning(v.meta);

    renderSubs(v);
    renderEvents(v);
    renderField(v.meta);
    renderSuggestions();
    syncSetupPanel(v.meta);
    if (!$('liveSubForm').hidden) fillSubForm(v.meta);
    syncWakeLock(isRunning(v.meta));
  }

  // ------------------------------------------------------------------
  // Eventos de la pantalla
  // ------------------------------------------------------------------
  function subAction(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.act === 'do-sub') doSub(id);
    if (btn.dataset.act === 'undo-sub') undoSub(id);
    if (btn.dataset.act === 'remove-sub') removeSub(id);
  }

  function setupPartido() {
    if (!$('liveBar')) return;
    $('livePhaseBtn').addEventListener('click', changePhase);
    $('liveEventButtons').addEventListener('click', e => {
      const btn = e.target.closest('[data-kind]');
      if (btn) addEvent(btn.dataset.kind);
    });
    $('liveMoreButtons').addEventListener('click', e => {
      const btn = e.target.closest('[data-kind]');
      if (btn) askSide(btn.dataset.kind);
    });
    $('liveSidePicker').addEventListener('click', e => {
      const btn = e.target.closest('[data-side]');
      if (btn) chooseSide(btn.dataset.side);
    });
    $('liveSideCancel').addEventListener('click', cancelSide);
    $('liveDuration').addEventListener('change', e => setDuration(Number(e.target.value)));
    $('liveAdjust').addEventListener('click', e => {
      const btn = e.target.closest('[data-nudge]');
      if (btn) nudge(Number(btn.dataset.nudge));
    });
    $('liveResetBtn').addEventListener('click', resetLog);

    // Elegir o crear el partido
    $('liveMatchSelect').addEventListener('change', e => {
      state.activeMatch = e.target.value;
      pinnedName = null;
      hoverName = null;
      cancelSide();
      disarmPhase();
      resetBringButton();
      saveState();
      renderPartido();
    });
    $('liveAddMatchBtn').addEventListener('click', () => {
      const form = $('liveAddMatchForm');
      form.hidden = !form.hidden;
      if (!form.hidden) {
        $('liveNewMatchRival').value = '';
        $('liveNewMatchDate').value = todayISO();
        $('liveAddMatchError').textContent = '';
        $('liveNewMatchRival').focus();
      }
    });
    $('liveCancelAddMatchBtn').addEventListener('click', () => { $('liveAddMatchForm').hidden = true; });
    $('liveConfirmAddMatchBtn').addEventListener('click', confirmAddMatch);
    $('liveNewMatchRival').addEventListener('keydown', e => { if (e.key === 'Enter') confirmAddMatch(); });

    // Traer la alineación
    $('liveSourceKind').addEventListener('change', () => { resetBringButton(); syncSourceSelects(); });
    $('liveSourcePlan').addEventListener('change', e => {
      const plan = currentMatch().plans[e.target.value];
      if (plan && plan.activeFormation) $('liveSourceFormation').value = plan.activeFormation;
      resetBringButton();
    });
    $('liveSourceFormation').addEventListener('change', resetBringButton);
    $('liveSourceTactic').addEventListener('change', resetBringButton);
    $('liveBringBtn').addEventListener('click', bringLineup);

    // Panel de la jugadora elegida (perfil + cambios sugeridos)
    $('liveSuggestionsList').addEventListener('click', e => {
      const btn = e.target.closest('[data-act="suggest-sub"]');
      if (btn) suggestSub(btn.dataset.out, btn.dataset.in);
    });
    $('liveSuggestionsClose').addEventListener('click', unpin);
    // Tocar la cancha (fuera de una jugadora) suelta el panel fijado.
    $('matchField').addEventListener('pointerdown', e => {
      if (pinnedName && !e.target.closest('.player-token')) unpin();
    });

    // Cambios
    $('liveAddSubBtn').addEventListener('click', () => {
      const form = $('liveSubForm');
      form.hidden = !form.hidden;
      if (!form.hidden) fillSubForm(view().meta);
    });
    $('liveSubCancel').addEventListener('click', () => { $('liveSubForm').hidden = true; });
    $('liveSubConfirm').addEventListener('click', () => {
      if (addSub($('liveSubOut').value, $('liveSubIn').value)) {
        $('liveSubOut').value = '';
        $('liveSubIn').value = '';
        $('liveSubForm').hidden = true;
        renderPartido();
      }
    });
    $('liveSubChips').addEventListener('click', subAction);
    $('liveSubList').addEventListener('click', subAction);

    // Jugadas
    const eventList = $('liveEventList');
    eventList.addEventListener('click', e => {
      const btn = e.target.closest('[data-act="remove-event"]');
      if (btn) removeEvent(btn.closest('.live-row').dataset.id);
    });
    // "change" (no "input"): se guarda al salir del campo, sin redibujar la lista mientras se escribe.
    eventList.addEventListener('change', e => {
      const field = e.target.closest('[data-field]');
      const row = e.target.closest('.live-row');
      if (field && row) updateEvent(row.dataset.id, field.dataset.field, field.value);
    });

    const wake = $('liveWakeHint');
    if (wake && navigator.wakeLock) wake.textContent = 'Mientras corre el reloj, la pantalla se mantiene encendida.';

    setInterval(() => { if (!document.hidden) renderClock(); }, 250);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      renderClock();
      syncWakeLock(isRunning(view().meta));
    });
  }

  window.setupPartido = setupPartido;
  window.renderPartido = renderPartido;
  // Lo que comparte con la solapa Jugados (que muestra estos mismos datos ya guardados).
  window.PartidoUtil = { KIND_LABELS, SIDE_LABELS, eventLabel, minuteLabel, minuteNumber, clockText };
})();
