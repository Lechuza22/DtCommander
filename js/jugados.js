// ==================================================================
// DTCommander — solapa Jugados
//
// Los partidos ya terminados en la solapa En vivo: una lista con el resultado de cada uno y,
// al elegir uno, su resumen (a favor / en contra), quién metió y asistió, la línea de tiempo
// con las jugadas y los cambios de cada minuto, y la alineación inicial. Solo muestra lo que
// está guardado en state.matchLogs; para editar un partido se abre en En vivo.
// ==================================================================
(function () {
  const $ = id => document.getElementById(id);
  let selectedId = null;

  const RESULT_TEXT = { win: 'Ganamos', draw: 'Empatamos', loss: 'Perdimos' };

  // Filas del resumen: qué se cuenta "a favor" y qué "en contra". Goles y jugadas de gol/peligrosas ya traen su lado
  // en el tipo (gol nuestro / gol rival, jugada de gol / jugada peligrosa); el resto lleva side.
  const SUMMARY_ROWS = [
    { label: 'Goles', forKind: 'goal', againstKind: 'goalRival' },
    { label: 'Jugadas de gol / peligrosas', forKind: 'chance', againstKind: 'danger' },
    { label: 'Faltas', kind: 'foul' },
    { label: 'Tiros libres', kind: 'freeKick' },
    { label: 'Córners', kind: 'corner' },
    { label: 'Laterales', kind: 'throwIn' },
    { label: 'Penales', kind: 'penalty' }
  ];

  const count = (events, kind, side) => events.filter(e => e.kind === kind && (!side || e.side === side)).length;
  const score = events => ({ us: count(events, 'goal'), them: count(events, 'goalRival') });

  // Un partido cuenta como jugado recién cuando se terminó (fase "Final"); mientras se juega se sigue en En vivo.
  function playedMatches() {
    return (state.matchLogs || [])
      .filter(r => !r.deleted && state.matches[r.id])
      .map(r => ({
        id: r.id,
        rec: r,
        match: state.matches[r.id],
        meta: r.items.find(i => i.type === 'meta'),
        events: r.items.filter(i => i.type === 'event'),
        subs: r.items.filter(i => i.type === 'sub')
      }))
      .filter(x => x.meta && x.meta.phase === 'end')
      .sort((a, b) => (b.match.date || '').localeCompare(a.match.date || '') || String(b.rec.updatedAt).localeCompare(String(a.rec.updatedAt)));
  }

  function resultOf(x) {
    const s = score(x.events);
    return s.us > s.them ? 'win' : s.us < s.them ? 'loss' : 'draw';
  }

  // "Ine (2), Agos" — quiénes y cuántas veces; las jugadas sin jugadora elegida se cuentan aparte.
  function tally(events, kind, field) {
    const byName = {};
    let sinDefinir = 0;
    events.filter(e => e.kind === kind).forEach(e => {
      if (!e[field]) { if (field === 'player') sinDefinir += 1; return; }
      byName[e[field]] = (byName[e[field]] || 0) + 1;
    });
    const parts = Object.entries(byName).sort((a, b) => b[1] - a[1]).map(([n, k]) => (k > 1 ? `${n} (${k})` : n));
    if (sinDefinir) parts.push(`sin definir (${sinDefinir})`);
    return parts;
  }

  function eventText(ev) {
    const parts = [`<strong>${escapeHtml(PartidoUtil.eventLabel(ev))}</strong>`];
    if (ev.player) parts.push(escapeHtml(ev.player));
    if (ev.kind === 'goal' && ev.assist) parts.push(`(asistió ${escapeHtml(ev.assist)})`);
    if (ev.note) parts.push(`· ${escapeHtml(ev.note)}`);
    return parts.join(' ');
  }

  function timelineHtml(x) {
    const items = x.events.map(e => ({ half: e.half, sec: e.sec, ev: e }))
      .concat(x.subs.filter(s => s.status === 'done').map(s => ({ half: s.half, sec: s.sec, sub: s })))
      .sort((a, b) => (a.half - b.half) || (a.sec - b.sec));
    const pending = x.subs.filter(s => s.status === 'pending');
    if (!items.length && !pending.length) return '<p class="hint">No se anotó ninguna jugada ni ningún cambio.</p>';
    let html = '';
    let lastHalf = 0;
    items.forEach(it => {
      if (lastHalf === 1 && it.half === 2) html += '<div class="played-break">Entretiempo</div>';
      lastHalf = it.half;
      const minute = PartidoUtil.minuteLabel(x.meta, it.half, it.sec);
      if (it.ev) {
        const cls = `live-row live-row-${it.ev.kind}${it.ev.side ? ' live-row-side-' + it.ev.side : ''}`;
        html += `<div class="${cls}"><span class="played-min">${minute}</span><span class="played-text">${eventText(it.ev)}</span></div>`;
      } else {
        html += `<div class="live-row live-row-sub-done"><span class="played-min">${minute}</span><span class="played-text"><strong>Cambio</strong> sale ${escapeHtml(it.sub.out)}, entra ${escapeHtml(it.sub.in)}</span></div>`;
      }
    });
    pending.forEach(s => {
      html += `<div class="live-row live-row-sub-pending"><span class="played-min">—</span><span class="played-text"><strong>Cambio que quedó por hacer</strong> sale ${escapeHtml(s.out)}, entra ${escapeHtml(s.in)}</span></div>`;
    });
    return html;
  }

  function renderDetail(x) {
    const s = score(x.events);
    const result = resultOf(x);
    $('playedDetail').hidden = false;
    $('playedTitle').textContent = `vs ${x.match.rival || 'Rival'}`;
    $('playedMeta').textContent = `${formatDateDisplay(x.match.date)} · ${RESULT_TEXT[result]} · ${x.meta.duration} min por tiempo`;
    $('playedScore').textContent = `${s.us} - ${s.them}`;
    $('playedScore').className = `played-score result-${result}`;

    $('playedTable').innerHTML = '<tr><th></th><th>A favor</th><th>En contra</th></tr>' + SUMMARY_ROWS.map(row => {
      const a = row.kind ? count(x.events, row.kind, 'for') : count(x.events, row.forKind);
      const b = row.kind ? count(x.events, row.kind, 'against') : count(x.events, row.againstKind);
      return `<tr><td>${row.label}</td><td class="num-for">${a}</td><td class="num-against">${b}</td></tr>`;
    }).join('');

    const goals = tally(x.events, 'goal', 'player');
    const assists = tally(x.events, 'goal', 'assist');
    $('playedScorers').textContent = [goals.length ? `Goles: ${goals.join(', ')}.` : '', assists.length ? `Asistencias: ${assists.join(', ')}.` : ''].filter(Boolean).join(' ')
      || 'Todavía no se anotó quién metió los goles.';

    $('playedTimeline').innerHTML = timelineHtml(x);
    $('playedLineup').textContent = x.meta.lineup.length
      ? x.meta.lineup.join(', ')
      : 'No se guardó la alineación inicial (se guarda al empezar el 1.er tiempo, con la cancha del partido armada).';
  }

  function renderJugados() {
    const list = $('playedList');
    if (!list) return;
    const played = playedMatches();
    if (!played.length) {
      list.innerHTML = '<p class="hint">Todavía no hay partidos terminados. Cuando termines un partido en la solapa En vivo, va a aparecer acá.</p>';
      $('playedDetail').hidden = true;
      return;
    }
    if (!played.some(x => x.id === selectedId)) selectedId = played[0].id;
    list.innerHTML = played.map(x => {
      const s = score(x.events);
      const result = resultOf(x);
      return `<button type="button" class="played-item result-${result}${x.id === selectedId ? ' selected' : ''}" data-id="${escapeHtml(x.id)}">
        <span class="played-what"><strong>vs ${escapeHtml(x.match.rival || 'Rival')}</strong>
          <small>${escapeHtml(formatDateDisplay(x.match.date))} · ${RESULT_TEXT[result]} · ${x.meta.duration} min por tiempo</small></span>
        <span class="played-item-score">${s.us} - ${s.them}</span>
      </button>`;
    }).join('');
    renderDetail(played.find(x => x.id === selectedId));
  }

  function setupJugados() {
    if (!$('playedList')) return;
    $('playedList').addEventListener('click', e => {
      const btn = e.target.closest('.played-item');
      if (!btn) return;
      selectedId = btn.dataset.id;
      renderJugados();
    });
    // Para corregir algo de un partido ya jugado se abre en En vivo (mismos datos, misma edición).
    $('playedOpenBtn').addEventListener('click', () => {
      if (!selectedId || !state.matches[selectedId]) return;
      state.activeMatch = selectedId;
      saveState();
      showTab('panel-partido');
    });
  }

  window.setupJugados = setupJugados;
  window.renderJugados = renderJugados;
})();
