// ==================================================================
// DTCommander — Simulación: dibujo de la cancha y grabación de video.
//
// Dos formas de dibujar lo mismo (jugadoras, rivales, pelota y flechas):
//   - SVG, para la pantalla (la interfaz lo puede tocar y arrastrar)
//   - canvas, para el video (cada cuadro se pinta directo, sin pasar por
//     una imagen SVG, que sería demasiado lenta para grabar en vivo)
// Cada pieza que llega puede traer _o (opacidad 0-1, para las que entran o
// salen) y _auto (flecha de recorrido automático: no se puede tocar).
//
// Expone window.SimMedia. Lo usa js/simulacion.js.
// ==================================================================
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const THEME = {
    W: 300,
    H: 400,
    FONT: 'Helvetica, Arial, sans-serif',
    FIELD_GREEN: '#1f7a3d',
    FIELD_LINE: 'rgba(255,255,255,0.67)',
    TEAM_COLOR: '#2563eb',
    RIVAL_COLOR: '#dc2626',
    TOKEN_R: 14,
    // Dónde queda la pelota respecto de quien la lleva (abajo a la derecha, tocando el borde de la ficha)
    BALL_DX: 11,
    BALL_DY: 10,
    // Grilla de casilleros: 3 columnas (A a C, de izquierda a derecha) por 4 filas
    // (1 a 4, desde el arco propio hacia el rival), alineada con las líneas de la cancha.
    GRID: { x0: 10, y0: 10, cw: 280 / 3, ch: 95, cols: 3, rows: 4 },
    // Adónde va la pelota en un tiro (x según el palo) y cuánto entra (y)
    GOAL_X: { left: 128, center: 150, right: 172 },
    GOAL_Y: { shot: 16, goal: 5 }
  };
  const DRAW_ORDER = { grid: -2, zone: -1, arrow: 0, player: 1, rival: 1, ball: 2, text: 3 };

  // Rectángulo de un casillero: c = columna 0-2, r = fila 1-4 contada desde el arco propio.
  function cellRect(c, r) {
    const g = THEME.GRID;
    return { x: g.x0 + c * g.cw, y: g.y0 + (g.rows - r) * g.ch, w: g.cw, h: g.ch };
  }
  const cellName = (c, r) => 'ABC'.charAt(c) + r;

  const sorted = items => items.slice().sort((a, b) => DRAW_ORDER[a.type] - DRAW_ORDER[b.type]);
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const shortName = name => (name.length > 11 ? name.slice(0, 10) + '…' : name);

  // Triángulo de la punta de una flecha: mismo cálculo para SVG y canvas.
  function arrowGeometry(a) {
    const dx = a.x2 - a.x1;
    const dy = a.y2 - a.y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const head = Math.min(11, len * 0.6);
    const bx = a.x2 - ux * head;
    const by = a.y2 - uy * head;
    const half = head * 0.4;
    return {
      ux, uy, bx, by,
      left: [bx - uy * half, by + ux * half],
      right: [bx + uy * half, by - ux * half]
    };
  }

  // ------------------------------------------------------------------
  // SVG (pantalla)
  // ------------------------------------------------------------------
  function svgEl(name, attrs, parent) {
    const el = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(k => el.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(el);
    return el;
  }

  function drawPitchSvg(parent) {
    svgEl('rect', { x: 0, y: 0, width: THEME.W, height: THEME.H, fill: THEME.FIELD_GREEN }, parent);
    const line = { fill: 'none', stroke: THEME.FIELD_LINE, 'stroke-width': 2 };
    svgEl('rect', Object.assign({ x: 10, y: 10, width: 280, height: 380 }, line), parent);
    svgEl('line', Object.assign({ x1: 10, y1: 200, x2: 290, y2: 200 }, line), parent);
    svgEl('circle', Object.assign({ cx: 150, cy: 200, r: 40 }, line), parent);
    svgEl('rect', Object.assign({ x: 90, y: 10, width: 120, height: 55 }, line), parent);
    svgEl('rect', Object.assign({ x: 90, y: 335, width: 120, height: 55 }, line), parent);
  }

  function haloSvg(parent, text, attrs) {
    const t = svgEl('text', Object.assign({
      'text-anchor': 'middle', 'font-family': THEME.FONT, 'font-weight': 700,
      stroke: '#0b2a14', 'stroke-width': 3, 'stroke-linejoin': 'round',
      'paint-order': 'stroke', 'pointer-events': 'none'
    }, attrs), parent);
    t.textContent = text;
  }

  function selectionBox(parent, minX, minY, maxX, maxY) {
    svgEl('rect', {
      x: minX - 5, y: minY - 5, width: maxX - minX + 10, height: maxY - minY + 10,
      fill: 'none', stroke: '#ffffff', 'stroke-width': 1.5, 'stroke-dasharray': '4 3', 'pointer-events': 'none'
    }, parent);
  }

  function tokenSvg(g, item, selected) {
    const isRival = item.type === 'rival';
    g.setAttribute('transform', `translate(${item.x}, ${item.y})`);
    if (selected) {
      svgEl('circle', {
        r: THEME.TOKEN_R + 6, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.5,
        'stroke-dasharray': '4 3', 'pointer-events': 'none'
      }, g);
    }
    svgEl('circle', {
      r: THEME.TOKEN_R, fill: isRival ? THEME.RIVAL_COLOR : THEME.TEAM_COLOR, stroke: '#ffffff', 'stroke-width': 2
    }, g);
    const inner = svgEl('text', {
      'text-anchor': 'middle', dy: 4, fill: '#ffffff', 'font-size': 12, 'font-weight': 700,
      'font-family': THEME.FONT, 'pointer-events': 'none'
    }, g);
    inner.textContent = isRival ? item.label : (item.name || '?').charAt(0).toUpperCase();
    if (!isRival) {
      haloSvg(g, shortName(item.name || ''), { y: THEME.TOKEN_R + 12, fill: '#ffffff', 'font-size': 9.5 });
    }
  }

  // _h (0-1) es la altura de una pelota "por arriba": se dibuja más grande y levantada,
  // con su sombra en el piso, para que se note que va por el aire.
  function ballSvg(g, item, selected) {
    g.setAttribute('transform', `translate(${item.x}, ${item.y})`);
    if (selected) selectionBox(g, -6, -6, 6, 6);
    svgEl('circle', { r: 13, fill: 'transparent' }, g);
    const h = item._h || 0;
    if (h > 0.02) {
      svgEl('ellipse', { cx: 0, cy: 0, rx: 5.5, ry: 3, fill: '#000000', 'fill-opacity': 0.3, 'pointer-events': 'none' }, g);
    }
    const inner = svgEl('g', {
      transform: `translate(0, ${-Math.round(h * 18)}) scale(${(1 + 0.7 * h).toFixed(2)})`, 'pointer-events': 'none'
    }, g);
    svgEl('circle', { r: 6, fill: '#ffffff', stroke: '#111827', 'stroke-width': 1.2 }, inner);
    svgEl('polygon', { points: '0,-3 2.9,-0.9 1.8,2.4 -1.8,2.4 -2.9,-0.9', fill: '#111827' }, inner);
  }

  function textSvg(g, item, selected) {
    const size = item.big ? 26 : 12;
    const w = Math.max(20, item.text.length * size * 0.55);
    if (!item._auto) {
      svgEl('rect', { x: item.x - w / 2 - 4, y: item.y - size - 4, width: w + 8, height: size + 12, fill: 'transparent' }, g);
    }
    haloSvg(g, item.text, { x: item.x, y: item.y, fill: item.color, 'font-size': size });
    if (selected) selectionBox(g, item.x - w / 2, item.y - size, item.x + w / 2, item.y + 4);
  }

  function zoneSvg(g, item) {
    const r = cellRect(item.zc, item.zr);
    svgEl('rect', {
      x: r.x, y: r.y, width: r.w, height: r.h, fill: item.color, 'fill-opacity': 0.28,
      stroke: item.color, 'stroke-opacity': 0.9, 'stroke-width': 1.5
    }, g);
  }

  function gridSvg(g) {
    const gr = THEME.GRID;
    const line = { stroke: '#ffffff', 'stroke-opacity': 0.5, 'stroke-width': 1, 'stroke-dasharray': '5 4' };
    for (let c = 1; c < gr.cols; c++) {
      svgEl('line', Object.assign({ x1: gr.x0 + c * gr.cw, y1: gr.y0, x2: gr.x0 + c * gr.cw, y2: gr.y0 + gr.rows * gr.ch }, line), g);
    }
    for (let r = 1; r < gr.rows; r++) {
      svgEl('line', Object.assign({ x1: gr.x0, y1: gr.y0 + r * gr.ch, x2: gr.x0 + gr.cols * gr.cw, y2: gr.y0 + r * gr.ch }, line), g);
    }
    for (let c = 0; c < gr.cols; c++) {
      for (let r = 1; r <= gr.rows; r++) {
        const rect = cellRect(c, r);
        const t = svgEl('text', {
          x: rect.x + 5, y: rect.y + 12, fill: '#ffffff', 'fill-opacity': 0.6, 'font-size': 10,
          'font-weight': 700, 'font-family': THEME.FONT, 'pointer-events': 'none'
        }, g);
        t.textContent = cellName(c, r);
      }
    }
  }

  function arrowSvg(g, a) {
    const geo = arrowGeometry(a);
    const r1 = v => Math.round(v * 10) / 10;
    svgEl('line', {
      x1: a.x1, y1: a.y1, x2: r1(geo.bx + geo.ux), y2: r1(geo.by + geo.uy),
      stroke: a.color, 'stroke-width': 2.6, 'stroke-linecap': 'round',
      'stroke-dasharray': a.dash ? '6 5' : 'none'
    }, g);
    svgEl('polygon', {
      points: `${a.x2},${a.y2} ${r1(geo.left[0])},${r1(geo.left[1])} ${r1(geo.right[0])},${r1(geo.right[1])}`,
      fill: a.color
    }, g);
  }

  // opts: { selectedId, outsideId }
  function renderItemsSvg(parent, items, opts) {
    const o = opts || {};
    sorted(items).forEach(item => {
      // Flechas de recorrido, casilleros y grilla son solo decoración: no reciben toques.
      const auto = !!item._auto || item.type === 'zone' || item.type === 'grid';
      const g = svgEl('g', auto ? { class: 't-auto', 'pointer-events': 'none' } : { class: 't-item', 'data-id': item.id }, parent);
      const opacity = item.id === o.outsideId ? 0.45 : item._o;
      if (opacity !== undefined && opacity < 1) g.setAttribute('opacity', clamp01(opacity));
      const selected = !auto && item.id === o.selectedId;
      if (item.type === 'arrow') arrowSvg(g, item);
      else if (item.type === 'ball') ballSvg(g, item, selected);
      else if (item.type === 'text') textSvg(g, item, selected);
      else if (item.type === 'zone') zoneSvg(g, item);
      else if (item.type === 'grid') gridSvg(g);
      else tokenSvg(g, item, selected);
    });
  }

  // ------------------------------------------------------------------
  // Canvas (video)
  // ------------------------------------------------------------------
  function haloCanvas(ctx, text, x, y, size, fill) {
    ctx.font = `bold ${size}px ${THEME.FONT}`;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0b2a14';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  function drawPitchCanvas(ctx) {
    ctx.fillStyle = THEME.FIELD_GREEN;
    ctx.fillRect(0, 0, THEME.W, THEME.H);
    ctx.strokeStyle = THEME.FIELD_LINE;
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 280, 380);
    ctx.beginPath();
    ctx.moveTo(10, 200);
    ctx.lineTo(290, 200);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(150, 200, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(90, 10, 120, 55);
    ctx.strokeRect(90, 335, 120, 55);
  }

  function drawItemsCanvas(ctx, items) {
    sorted(items).forEach(item => {
      ctx.save();
      ctx.globalAlpha = item._o === undefined ? 1 : clamp01(item._o);
      if (item.type === 'zone') {
        const r = cellRect(item.zc, item.zr);
        ctx.globalAlpha *= 0.28;
        ctx.fillStyle = item.color;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.globalAlpha = (item._o === undefined ? 1 : clamp01(item._o)) * 0.9;
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
      } else if (item.type === 'grid') {
        const gr = THEME.GRID;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        for (let c = 1; c < gr.cols; c++) {
          ctx.beginPath(); ctx.moveTo(gr.x0 + c * gr.cw, gr.y0); ctx.lineTo(gr.x0 + c * gr.cw, gr.y0 + gr.rows * gr.ch); ctx.stroke();
        }
        for (let r = 1; r < gr.rows; r++) {
          ctx.beginPath(); ctx.moveTo(gr.x0, gr.y0 + r * gr.ch); ctx.lineTo(gr.x0 + gr.cols * gr.cw, gr.y0 + r * gr.ch); ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.font = `bold 10px ${THEME.FONT}`;
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        for (let c = 0; c < gr.cols; c++) {
          for (let r = 1; r <= gr.rows; r++) {
            const rect = cellRect(c, r);
            ctx.fillText(cellName(c, r), rect.x + 5, rect.y + 12);
          }
        }
      } else if (item.type === 'text') {
        haloCanvas(ctx, item.text, item.x, item.y, item.big ? 26 : 12, item.color);
      } else if (item.type === 'arrow') {
        const geo = arrowGeometry(item);
        ctx.strokeStyle = item.color;
        ctx.fillStyle = item.color;
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.setLineDash(item.dash ? [6, 5] : []);
        ctx.beginPath();
        ctx.moveTo(item.x1, item.y1);
        ctx.lineTo(geo.bx + geo.ux, geo.by + geo.uy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(item.x2, item.y2);
        ctx.lineTo(geo.left[0], geo.left[1]);
        ctx.lineTo(geo.right[0], geo.right[1]);
        ctx.closePath();
        ctx.fill();
      } else if (item.type === 'ball') {
        ctx.translate(item.x, item.y);
        const h = item._h || 0;
        if (h > 0.02) {
          ctx.beginPath();
          ctx.ellipse(0, 0, 5.5, 3, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fill();
        }
        ctx.translate(0, -Math.round(h * 18));
        ctx.scale(1 + 0.7 * h, 1 + 0.7 * h);
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = '#111827';
        ctx.stroke();
        ctx.beginPath();
        [[0, -3], [2.9, -0.9], [1.8, 2.4], [-1.8, 2.4], [-2.9, -0.9]].forEach((p, i) => {
          if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
        });
        ctx.closePath();
        ctx.fillStyle = '#111827';
        ctx.fill();
      } else {
        const isRival = item.type === 'rival';
        ctx.translate(item.x, item.y);
        ctx.beginPath();
        ctx.arc(0, 0, THEME.TOKEN_R, 0, Math.PI * 2);
        ctx.fillStyle = isRival ? THEME.RIVAL_COLOR : THEME.TEAM_COLOR;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.font = `bold 12px ${THEME.FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(isRival ? item.label : (item.name || '?').charAt(0).toUpperCase(), 0, 4);
        if (!isRival) haloCanvas(ctx, shortName(item.name || ''), 0, THEME.TOKEN_R + 12, 9.5, '#ffffff');
      }
      ctx.restore();
    });
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Parte un texto en hasta maxLines renglones que entren en maxWidth.
  function wrapText(ctx, text, maxWidth, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(word => {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width <= maxWidth || !line) line = test;
      else { lines.push(line); line = word; }
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      let last = kept[maxLines - 1];
      while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
      kept[maxLines - 1] = last + '…';
      return kept;
    }
    return lines;
  }

  let crestImg = null;
  let crestPromise = null;
  function loadCrest() {
    if (!crestPromise) {
      crestPromise = new Promise(resolve => {
        const img = new Image();
        img.onload = () => { crestImg = img; resolve(); };
        img.onerror = () => resolve();
        img.src = 'images/escudo-faltajue.png';
      });
    }
    return crestPromise;
  }

  // Cuadro de video: franja con el nombre y el escudo, la cancha, y abajo la
  // franja de texto con la fase y su nota. Todas las medidas son múltiplos de 16.
  const VIDEO = { W: 720, HEADER: 96, PITCH: 960, CAPTION: 144 };
  VIDEO.H = VIDEO.HEADER + VIDEO.PITCH + VIDEO.CAPTION;

  // frame: { title, subtitle, items, caption: { title, note } }
  function drawVideoFrame(ctx, frame) {
    const { W, HEADER, PITCH, H } = VIDEO;
    ctx.fillStyle = '#0d3a75';
    ctx.fillRect(0, 0, W, HEADER);

    let textRight = W - 40;
    if (crestImg) {
      const bw = 86, bh = 80;
      const bx = W - 32 - bw, by = (HEADER - bh) / 2;
      ctx.fillStyle = '#ffffff';
      roundedRect(ctx, bx, by, bw, bh, 14);
      ctx.fill();
      ctx.drawImage(crestImg, bx + (bw - 76) / 2, by + (bh - 74) / 2, 76, 74);
      textRight = bx - 20;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let size = 42;
    do {
      ctx.font = `bold ${size}px ${THEME.FONT}`;
      size -= 2;
    } while (ctx.measureText(frame.title).width > textRight - 32 && size > 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(frame.title, 32, 46);
    ctx.font = `22px ${THEME.FONT}`;
    ctx.fillStyle = '#cfd8e3';
    ctx.fillText(frame.subtitle || '', 32, 78);

    ctx.save();
    ctx.translate(0, HEADER);
    ctx.scale(W / THEME.W, PITCH / THEME.H);
    drawPitchCanvas(ctx);
    drawItemsCanvas(ctx, frame.items);
    ctx.restore();

    const top = HEADER + PITCH;
    ctx.fillStyle = '#0b2f5e';
    ctx.fillRect(0, top, W, H - top);
    const cap = frame.caption || { title: '', note: '' };
    ctx.textAlign = 'left';
    ctx.font = `bold 32px ${THEME.FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(cap.title, 32, top + 46);
    ctx.font = `26px ${THEME.FONT}`;
    ctx.fillStyle = '#dbe4f0';
    wrapText(ctx, cap.note, W - 64, 2).forEach((line, i) => ctx.fillText(line, 32, top + 86 + i * 34));
  }

  // ------------------------------------------------------------------
  // Grabación
  // ------------------------------------------------------------------
  const MIME_CANDIDATES = [
    'video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4',
    'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'
  ];

  function pickMimeType() {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
    return MIME_CANDIDATES.find(t => MediaRecorder.isTypeSupported(t)) || '';
  }

  function videoSupported() {
    return !!pickMimeType() && typeof HTMLCanvasElement !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;
  }

  // Graba en tiempo real: cada cuadro se pide con getFrame(msTranscurridos).
  // Devuelve { blob, mimeType, extension }. El MP4 sale directo del navegador
  // (Chrome y Safari); donde no se pueda, cae a WebM.
  async function recordVideo(opts) {
    const { title, subtitle, durationMs, getFrame, onProgress } = opts;
    const fps = opts.fps || 30;
    const tailMs = opts.tailMs === undefined ? 500 : opts.tailMs;
    const mime = pickMimeType();
    if (!mime || !videoSupported()) throw new Error('Este navegador no puede grabar video.');
    await loadCrest();

    const canvas = document.createElement('canvas');
    canvas.width = VIDEO.W;
    canvas.height = VIDEO.H;
    const ctx = canvas.getContext('2d');
    const paint = elapsed => {
      const f = getFrame(elapsed);
      drawVideoFrame(ctx, { title, subtitle, items: f.items, caption: f.caption });
    };
    paint(0);

    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1800000 });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = e => reject((e && e.error) || new Error('Falló la grabación.'));
    });

    recorder.start();
    const startedAt = performance.now();
    await new Promise(resolve => {
      function step(now) {
        const elapsed = now - startedAt;
        paint(Math.min(elapsed, durationMs));
        if (onProgress) onProgress(Math.min(1, elapsed / (durationMs + tailMs)));
        if (elapsed >= durationMs + tailMs) resolve();
        else requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
    recorder.stop();
    await stopped;
    stream.getTracks().forEach(t => t.stop());

    const type = mime.split(';')[0];
    return { blob: new Blob(chunks, { type }), mimeType: type, extension: type === 'video/mp4' ? 'mp4' : 'webm' };
  }

  window.SimMedia = {
    THEME, VIDEO, svgEl, drawPitchSvg, renderItemsSvg, drawVideoFrame, recordVideo, videoSupported, loadCrest,
    cellRect, cellName
  };
})();
