// diagram.js — renderização SVG do diagrama de acorde (viewBox responsivo).

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

/** Descrição textual do diagrama (para aria-label). */
export function describeVoicing(voicing, tuning) {
  const parts = voicing.frets.map((f, i) => {
    const c = tuning.courses[i].label;
    if (f < 0) return `${c} não tocada`;
    if (f === 0) return `${c} solta (${voicing.courseNotes[i]})`;
    const d = voicing.fingers[i] ? `, dedo ${voicing.fingers[i]}` : '';
    return `${c} casa ${f}${d} (${voicing.courseNotes[i]})`;
  });
  return `Diagrama ${voicing.symbol || ''} (${tuning.name}) — ${voicing.label}: ${parts.join('; ')}.`;
}

/**
 * Desenha o diagrama. Ordem das colunas: corda/par mais grave à esquerda
 * (invertida se leftHanded). Cores via variáveis CSS (--dg-*).
 */
export function renderDiagram(voicing, instrument, tuning, { leftHanded = false, compact = false, onString = null } = {}) {
  const n = voicing.frets.length;
  const colW = 28, rowH = 34, padL = 36, padR = 18, top = 34;
  const rows = voicing.rows || 4;
  const gridW = (n - 1) * colW;
  const showPairs = instrument.strings > tuning.courses.length;
  const legendH = compact ? 4 : showPairs ? 58 : 28;
  const W = padL + gridW + padR;
  const H = top + rows * rowH + legendH + 6;
  const x = i => padL + (leftHanded ? n - 1 - i : i) * colW;
  const yRow = r => top + (r - 0.5) * rowH; // centro da casa relativa r (1-based)
  const base = voicing.baseFret;

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'diagram', role: 'img',
    'aria-label': describeVoicing(voicing, tuning), preserveAspectRatio: 'xMidYMid meet',
  });
  const fg = 'var(--dg-fg, #111)', bg = 'var(--dg-bg, #fff)', grid = 'var(--dg-grid, #555)';

  // Grade
  for (let r = 0; r <= rows; r++) {
    svg.append(el('line', { x1: padL, x2: padL + gridW, y1: top + r * rowH, y2: top + r * rowH, stroke: grid, 'stroke-width': 1.2 }));
  }
  for (let i = 0; i < n; i++) {
    svg.append(el('line', { x1: x(i), x2: x(i), y1: top, y2: top + rows * rowH, stroke: grid, 'stroke-width': 1.2 }));
  }
  // Pestana do instrumento (nut) ou indicador de casa
  if (base === 1) {
    svg.append(el('rect', { x: padL - 2, y: top - 6, width: gridW + 4, height: 7, rx: 1.5, fill: fg }));
  } else {
    svg.append(el('text', {
      x: padL - 10, y: yRow(1) + 4, 'text-anchor': 'end', 'font-size': 12, 'font-weight': 700, fill: fg,
    }, `${base}ª`));
  }
  // Marcadores acima: X = não tocada, círculo limpo = solta
  voicing.frets.forEach((f, i) => {
    if (f > 0) return;
    const cy = top - 18;
    svg.append(el('circle', { cx: x(i), cy, r: 7, fill: 'none', stroke: fg, 'stroke-width': 1.6 }));
    if (f < 0) {
      const d = 4;
      svg.append(el('path', {
        d: `M${x(i) - d} ${cy - d}L${x(i) + d} ${cy + d}M${x(i) + d} ${cy - d}L${x(i) - d} ${cy + d}`,
        stroke: fg, 'stroke-width': 1.6, 'stroke-linecap': 'round',
      }));
    }
  });
  // Pestanas
  const covered = new Set();
  for (const b of voicing.barres || []) {
    const r = b.fret - base + 1;
    const x1 = Math.min(x(b.from), x(b.to)), x2 = Math.max(x(b.from), x(b.to));
    svg.append(el('rect', { x: x1 - 10, y: yRow(r) - 10, width: x2 - x1 + 20, height: 20, rx: 10, fill: fg }));
    svg.append(el('text', {
      x: (x1 + x2) / 2, y: yRow(r) + 4.5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: bg,
    }, String(b.finger)));
    for (let i = b.from; i <= b.to; i++) if (voicing.frets[i] === b.fret) covered.add(i);
  }
  // Dedos
  voicing.frets.forEach((f, i) => {
    if (f <= 0 || covered.has(i)) return;
    const cy = yRow(f - base + 1);
    svg.append(el('circle', { cx: x(i), cy, r: 10, fill: fg }));
    if (voicing.fingers[i]) {
      svg.append(el('text', {
        x: x(i), y: cy + 4.5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: bg,
      }, String(voicing.fingers[i])));
    }
  });
  // Áreas clicáveis por corda/par tocado (ouvir a corda sozinha). Com elas o SVG vira um grupo
  // (role=img esconderia os botões dos leitores de tela).
  if (onString) {
    svg.setAttribute('role', 'group');
    svg.classList.add('playable');
    voicing.frets.forEach((f, i) => {
      if (f < 0) return;
      const c = tuning.courses[i];
      const hit = el('rect', {
        x: x(i) - colW / 2, y: top - 28, width: colW, height: rows * rowH + 28, fill: 'transparent',
        class: 'hit', role: 'button', tabindex: 0, 'data-course': i,
        'aria-label': `Tocar ${c.label} (${voicing.courseNotes[i]})`,
      });
      const fire = () => onString(i);
      hit.addEventListener('click', fire);
      hit.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); }
      });
      svg.append(hit);
    });
  }
  // Legenda: nota de cada corda/par; na viola, número do par e tipo (8ª = oitavado, = uníssono)
  if (!compact) {
    const ly = top + rows * rowH + 18;
    if (showPairs) {
      svg.append(el('text', { x: padL - 16, y: ly + 15, 'text-anchor': 'end', 'font-size': 8.5, fill: grid }, 'par'));
    }
    voicing.courseNotes.forEach((nm, i) => {
      svg.append(el('text', { x: x(i), y: ly, 'text-anchor': 'middle', 'font-size': 10.5, fill: fg }, nm || ''));
      if (showPairs) {
        const c = tuning.courses[i];
        const octave = new Set(c.notes).size > 1;
        svg.append(el('text', { x: x(i), y: ly + 15, 'text-anchor': 'middle', 'font-size': 9.5, fill: grid }, c.label.split(' ')[0]));
        svg.append(el('text', { x: x(i), y: ly + 28, 'text-anchor': 'middle', 'font-size': 8.5, fill: grid },
          octave ? '8ª' : '='));
      }
    });
  }
  return svg;
}

/**
 * Braço vazio editável (identificador reverso). frets: casas por corda (-1 = muda).
 * Clicar no marcador acima da corda alterna muda ↔ solta; clicar numa casa pressiona
 * (de novo na mesma casa → solta). Casas fora da janela continuam valendo e aparecem na legenda.
 */
export function renderEditor(frets, instrument, tuning, { baseFret = 1, rows = 5, leftHanded = false, onChange } = {}) {
  const n = frets.length;
  const colW = 34, rowH = 30, padL = 36, padR = 18, top = 40;
  const gridW = (n - 1) * colW;
  const W = padL + gridW + padR, H = top + rows * rowH + 40;
  const x = i => padL + (leftHanded ? n - 1 - i : i) * colW;
  const fg = 'var(--dg-fg, #111)', grid = 'var(--dg-grid, #555)';
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'diagram editor', role: 'group', 'aria-label': `Braço do ${instrument.name} para identificar acorde` });
  const set = (i, f) => { const next = frets.slice(); next[i] = f; onChange?.(next); };
  const button = (attrs, label, fire) => {
    const r = el('rect', { ...attrs, fill: 'transparent', class: 'hit', role: 'button', tabindex: 0, 'aria-label': label });
    r.addEventListener('click', fire);
    r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); } });
    return r;
  };

  for (let r = 0; r <= rows; r++) svg.append(el('line', { x1: padL, x2: padL + gridW, y1: top + r * rowH, y2: top + r * rowH, stroke: grid, 'stroke-width': 1.2 }));
  for (let i = 0; i < n; i++) svg.append(el('line', { x1: x(i), x2: x(i), y1: top, y2: top + rows * rowH, stroke: grid, 'stroke-width': 1.2 }));
  if (baseFret === 1) svg.append(el('rect', { x: padL - 2, y: top - 6, width: gridW + 4, height: 7, rx: 1.5, fill: fg }));
  else svg.append(el('text', { x: padL - 10, y: top + rowH / 2 + 4, 'text-anchor': 'end', 'font-size': 12, 'font-weight': 700, fill: fg }, `${baseFret}ª`));

  frets.forEach((f, i) => {
    const c = tuning.courses[i].label;
    const cy = top - 20;
    if (f <= 0) {
      svg.append(el('circle', { cx: x(i), cy, r: 7, fill: 'none', stroke: fg, 'stroke-width': 1.6 }));
      if (f < 0) svg.append(el('path', { d: `M${x(i) - 4} ${cy - 4}L${x(i) + 4} ${cy + 4}M${x(i) + 4} ${cy - 4}L${x(i) - 4} ${cy + 4}`, stroke: fg, 'stroke-width': 1.6, 'stroke-linecap': 'round' }));
    }
    const r = f - baseFret + 1;
    if (f > 0 && r >= 1 && r <= rows) svg.append(el('circle', { cx: x(i), cy: top + (r - 0.5) * rowH, r: 10, fill: fg }));
    svg.append(el('text', { x: x(i), y: top + rows * rowH + 18, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: fg }, f < 0 ? 'x' : String(f)));
    svg.append(el('text', { x: x(i), y: top + rows * rowH + 32, 'text-anchor': 'middle', 'font-size': 9, fill: grid }, c.split(' ')[0]));
    svg.append(button({ x: x(i) - colW / 2, y: top - 34, width: colW, height: 28 },
      `${c}: ${f < 0 ? 'muda' : f === 0 ? 'solta' : `casa ${f}`} — alternar muda/solta`, () => set(i, f < 0 ? 0 : -1)));
    for (let k = 1; k <= rows; k++) {
      const fret = baseFret + k - 1;
      svg.append(button({ x: x(i) - colW / 2, y: top + (k - 1) * rowH, width: colW, height: rowH },
        `${c}, casa ${fret}${f === fret ? ' (pressionada)' : ''}`, () => set(i, f === fret ? 0 : fret)));
    }
  });
  return svg;
}
