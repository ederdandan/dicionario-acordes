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
  return `Diagrama ${voicing.symbol || ''} — ${voicing.label}: ${parts.join('; ')}.`;
}

/**
 * Desenha o diagrama. Ordem das colunas: corda/par mais grave à esquerda
 * (invertida se leftHanded). Cores via variáveis CSS (--dg-*).
 */
export function renderDiagram(voicing, instrument, tuning, { leftHanded = false, compact = false } = {}) {
  const n = voicing.frets.length;
  const colW = 28, rowH = 34, padL = 36, padR = 18, top = 34;
  const rows = voicing.rows || 4;
  const gridW = (n - 1) * colW;
  const showPairs = instrument.strings > tuning.courses.length;
  const legendH = compact ? 4 : showPairs ? 44 : 28;
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
  // Legenda: nota de cada corda/par (e número do par na viola)
  if (!compact) {
    const ly = top + rows * rowH + 18;
    voicing.courseNotes.forEach((nm, i) => {
      svg.append(el('text', { x: x(i), y: ly, 'text-anchor': 'middle', 'font-size': 10.5, fill: fg }, nm || ''));
      if (showPairs) {
        svg.append(el('text', { x: x(i), y: ly + 15, 'text-anchor': 'middle', 'font-size': 9.5, fill: grid }, tuning.courses[i].label));
      }
    });
  }
  return svg;
}
