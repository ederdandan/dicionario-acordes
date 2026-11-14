// tab.js — tablatura em texto ASCII → eventos no tempo (funções puras, sem DOM).
// Cada caractere (exceto '|') é 1 passo de tempo; números de 2 dígitos são uma nota só.
// Técnicas (h p t / \\ s b ^ r ~ x ( ) < > e linhas de PM) continuam ocupando tempo e viram `fx` no evento.

const TAB_LINE = /^\s*([A-Za-z][#b]?\d?)?\s*(?:-?[|:])?(.*)$/;
const TAB_CHARS = /^[-0-9xX|hpbrst/\\~().<>^*=\s]*$/;
// Anotações no meio da linha ((E), E7, A, PM, let ring): viram '-' do mesmo tamanho, sem desalinhar
// as colunas. Letras de técnica (h p b r x) isoladas entre números continuam valendo.
// "xxx" (notas abafadas seguidas) não é anotação.
const ANNOTATION = /[A-WYZ][A-Za-z0-9#]*(?:\/[A-G][#b]?)?|(?![xX]+(?![a-z]))[a-z]{2,}\d*/g;
// Linha só com "PM----" / "P.M." / "let ring" (acima ou abaixo do bloco): modifica as notas das colunas.
const MOD_TOKEN = /P\.?\s?M\.?|let\s*ring/gi;

// Símbolo logo antes do número → como a nota é atacada a partir da anterior na mesma corda.
const LINK = { h: 'hammer', p: 'pull', t: 'tap', '/': 'slide', '\\': 'slide', s: 'slide', b: 'bend', '^': 'bend', r: 'release' };
/** Nome de cada técnica, para a interface. */
export const TECH_NAMES = {
  hammer: 'hammer-on (h)', pull: 'pull-off (p)', tap: 'tapping (t)', slide: 'slide (/ \\ s)', bend: 'bend (b ^)',
  release: 'release (r)', vib: 'vibrato (~)', ghost: 'nota fantasma ( )', harm: 'harmônico natural < >',
  dead: 'nota abafada (x)', pm: 'palm mute (PM)', ring: 'let ring',
};
/** Harmônico natural na casa → semitons acima da corda solta. */
export const HARMONICS = { 12: 12, 7: 19, 19: 19, 5: 24, 24: 24, 4: 28, 9: 28, 16: 28, 3: 31 };

/** Colunas (no texto bruto) cobertas por PM / let ring numa linha modificadora; null se não for uma. */
function modRow(line) {
  const raw = line.replace(/\s+$/, '');
  if (!MOD_TOKEN.test(raw) || raw.replace(MOD_TOKEN, '').replace(/[-–._|\s]/g, '')) return null;
  const spans = [];
  for (const m of raw.matchAll(/(P\.?\s?M\.?|let\s*ring)[-–._|\s]*/gi)) {
    const len = m[0].replace(/\s+$/, '').length;
    spans.push({ kind: /^p/i.test(m[1]) ? 'pm' : 'ring', from: m.index, to: m.index + len });
  }
  return spans;
}

/** Uma linha é de tablatura se, sem rótulo e anotações, tiver ao menos 3 hífens e só caracteres de tab. */
function tabBody(line) {
  const src = line.replace(/\s*\[[^\]]*\]\s*$/, ''); // remove marcador final "[1]"
  const m = TAB_LINE.exec(src);
  if (!m) return null;
  const body = m[2].replace(/\s+$/, '');
  const notes = [];
  const clean = body.replace(ANNOTATION, (a, col) => (notes.push({ text: a, col }), '-'.repeat(a.length)));
  if (!TAB_CHARS.test(clean) || (clean.match(/-/g) || []).length < 3) return null;
  // Mais anotação que tablatura: é texto comum (ex.: "Intro --- Refrão")
  if (notes.map(a => a.text).join('').length * 2 > (clean.match(/[-0-9|]/g) || []).length) return null;
  return { label: m[1] || '', body, clean, notes, offset: src.length - m[2].length };
}

/**
 * parseTab(texto, nCordas, { isChord }) → { blocks, events, steps, ignored } | { error }
 * Anotação em que isChord(texto) é verdadeiro vira evento { chord: texto, frets: todas -1 } (quem chama
 * escolhe a posição) e entra em blocks[b].chords = [{ line, col, len, text, ev }].
 * ignored = demais anotações descartadas (ex.: ['PM']), para avisar o usuário.
 * blocks[b] = { labels, lines (corpo de cada linha), notes: [{ course, fret, line, col, len, ev }] }
 * events[i] = { step, block, frets: [-1|casa por corda, grave → aguda], fx?: [null|Fx por corda] }
 * Fx = { tech?: 'hammer'|'pull'|'tap'|'slide'|'bend'|'release', from?: casa de onde vem (ligado),
 *        slideIn?, bendUp?: semitons (b sem alvo), vib?, ghost?, harm?: semitons, dead?, pm?, ring? }
 * techniques = nomes das técnicas encontradas (chaves de TECH_NAMES).
 * Linha de cima = corda mais aguda (course n-1).
 */
export function parseTab(text, n, { isChord = () => false } = {}) {
  const groups = [];
  let cur = [], mods = [];
  const close = () => { if (cur.length) groups.push(Object.assign(cur, { mods })); cur = []; mods = []; };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const mr = modRow(raw);
    if (mr) { mods.push(...mr); continue; } // vale para o bloco atual (abaixo dele) ou o próximo (acima)
    const t = tabBody(raw);
    if (t) { cur.push(t); continue; }
    if (cur.length) close();
    else if (raw.trim()) mods = []; // texto comum entre a linha de PM e o bloco: descarta
  }
  close();
  if (!groups.length) return { error: 'Nenhuma linha de tablatura encontrada (ex.: e|---0---|).' };

  const blocks = [], events = [], ignored = [], techs = new Set();
  let step = 0;
  for (const [b, g] of groups.entries()) {
    if (g.length !== n) return { error: `O bloco ${b + 1} tem ${g.length} linha(s); este instrumento tem ${n} cordas/pares.` };
    const lines = g.map(x => x.body), clean = g.map(x => x.clean);
    const chords = [], marks = new Map(); // coluna → anotações de acorde que começam nela
    g.forEach((x, line) => x.notes.forEach(a => {
      if (!isChord(a.text)) return ignored.push(a.text);
      marks.set(a.col, [...(marks.get(a.col) || []), { line, col: a.col, len: a.text.length, text: a.text }]);
    }));
    const width = Math.max(...clean.map(l => l.length));
    const notes = [];
    const busy = new Array(n).fill(-1); // até qual coluna um número de 2 dígitos ocupa a linha
    const last = new Array(n).fill(null); // última nota de cada linha: { fret, end }
    // PM / let ring: colunas do texto bruto → colunas do corpo (rótulo "e|" desconta)
    const spans = g.mods.map(s => ({ ...s, from: s.from - g[0].offset, to: s.to - g[0].offset }));
    for (let col = 0; col < width; col++) {
      for (const c of marks.get(col) || []) {
        chords.push({ ...c, ev: events.length });
        events.push({ step, block: b, frets: new Array(n).fill(-1), chord: c.text });
      }
      if (clean.every(l => (l[col] || '|') === '|')) continue; // barra de compasso: não conta tempo
      const frets = new Array(n).fill(-1), fx = new Array(n).fill(null);
      let hit = false;
      clean.forEach((l, line) => {
        if (col <= busy[line]) return;
        const course = n - 1 - line;
        if (/[xX]/.test(l[col] || '')) { // nota abafada: som percussivo, sem altura
          fx[course] = { dead: true };
          notes.push({ course, fret: -1, line, col, len: 1, ev: events.length, fx: fx[course] });
          return (hit = true);
        }
        const m = /^\d{1,2}/.exec(l.slice(col));
        if (!m) return;
        const fret = m[0].length === 2 && +m[0] > 24 ? +m[0][0] : +m[0];
        const len = String(fret).length;
        busy[line] = col + len - 1;
        frets[course] = fret;
        const f = {};
        let k = col - 1, j = col + len;
        if (l[k] === '(' && l[j] === ')') { f.ghost = true; k--; j++; }
        else if (l[k] === '<' && l[j] === '>') { f.harm = HARMONICS[fret] ?? fret; k--; j++; }
        const tech = LINK[l[k]];
        if (tech) {
          f.tech = tech;
          if (tech === 'bend' || tech === 'release') delete f.ghost; // 7b(9): (9) é o alvo do bend
          if (last[line] && last[line].end === k - 1) f.from = last[line].fret;
          else if (tech === 'slide') { f.from = Math.max(0, fret + (l[k] === '\\' ? 2 : -2)); f.slideIn = true; }
        }
        if (l[j] === '~') f.vib = true;
        if ((l[j] === 'b' || l[j] === '^') && !/[\d(]/.test(l[j + 1] || '')) f.bendUp = 2;
        last[line] = { fret, end: j - 1 };
        notes.push({ course, fret, line, col, len, ev: events.length, fx: f });
        fx[course] = f;
        hit = true;
      });
      if (hit) for (const s of spans) if (col >= s.from && col < s.to) fx.forEach((f, i) => { if (f || frets[i] >= 0) fx[i] = Object.assign(f || {}, { [s.kind]: true }); });
      for (const [i, f] of fx.entries()) {
        if (f && !Object.keys(f).length) fx[i] = null;
        if (!fx[i]) continue;
        for (const key of ['tech', 'vib', 'ghost', 'harm', 'dead', 'pm', 'ring']) if (fx[i][key] !== undefined) techs.add(key === 'tech' ? fx[i].tech : key);
        if (fx[i].bendUp) techs.add('bend');
      }
      if (hit) events.push({ step, block: b, frets, ...(fx.some(Boolean) && { fx }) });
      step++;
    }
    blocks.push({ labels: g.map(x => x.label), lines, notes, chords });
  }
  if (!events.length) return { error: 'A tablatura não tem notas.' };
  return { blocks, events, steps: step, ignored: [...new Set(ignored)], techniques: Object.keys(TECH_NAMES).filter(k => techs.has(k)) };
}

/** Duração de 1 passo em segundos: unit = 8 (colcheia), 16 (semicolcheia) ou 32 (fusa); BPM em semínimas. */
export const stepSeconds = (bpm, unit = 16) => 60 / Math.min(240, Math.max(40, bpm || 90)) / (unit / 4);

export const TAB_EXAMPLE = `e|-------0-------0-|-------0-------0-|
B|-----1---1-----1-|-----3---3-----3-|
G|---0-------0-----|---0-------0-----|
D|-----------------|-----------------|
A|-3---------------|-----------------|
E|-----------------|-3---------------|

e|-------0-------0-|-----------------|
B|-----1---1-----1-|-----3-----------|
G|---2-------2-----|---2---2---------|
D|-----------------|-0-------0-------|
A|-0---------------|-----------------|
E|-----------------|-----------------|`;

// ---------- Grade (Fase 6b) ----------
// Modelo da grade: cols = [{ frets: [-1|casa por corda, grave → aguda], dur: passos }].
// O texto continua sendo o formato salvo: a grade é convertida de/para texto.

/** Rótulos das linhas (grave → aguda): nome da nota da corda; nome repetido de uma mais grave → minúsculo (e, d). */
export function tabLabels(tuning) {
  const seen = new Set();
  return tuning.courses.map(c => {
    const l = c.notes[0].replace(/-?\d+$/, '');
    const out = seen.has(l) ? l.toLowerCase() : l;
    seen.add(l);
    return out;
  });
}

/** Largura em caracteres de uma coluna (um número de 2 dígitos ocupa 2). */
export const colWidth = c => Math.max(1, c.dur, ...c.frets.map(f => (f >= 0 ? String(f).length : 0)));

/** Resultado do parseTab → colunas da grade. Eventos no mesmo passo se fundem; pausa inicial vira coluna vazia. */
export function eventsToGrid({ events, steps }, n) {
  const byStep = new Map();
  for (const e of events) {
    const f = byStep.get(e.step) || new Array(n).fill(-1);
    e.frets.forEach((x, i) => { if (x >= 0) f[i] = x; });
    byStep.set(e.step, f);
  }
  const keys = [...byStep.keys()].sort((a, b) => a - b);
  const cols = [];
  if (keys[0] > 0) cols.push({ frets: new Array(n).fill(-1), dur: keys[0] });
  keys.forEach((s, k) => cols.push({ frets: byStep.get(s), dur: Math.max(1, (keys[k + 1] ?? steps) - s) }));
  return cols;
}

/** Passo inicial de cada coluna (mesma conta do texto gerado por gridToText). */
export function gridStarts(cols) {
  let s = 0;
  return cols.map(c => { const at = s; s += colWidth(c); return at; });
}

/**
 * Colunas → texto ASCII. labels grave → aguda; linha de cima = corda mais aguda.
 * Barra a cada `measure` passos; `perLine` compassos por bloco (sistema).
 */
export function gridToText(cols, labels, { measure = 16, perLine = 2 } = {}) {
  const n = labels.length, w = Math.max(...labels.map(l => l.length));
  const blocks = [];
  let cur = new Array(n).fill(''), acc = 0, bars = 0;
  const flush = () => {
    if (!cur[0]) return;
    blocks.push(cur.map((s, i) => `${labels[i].padEnd(w)}|${s}`).reverse().join('\n'));
    cur = new Array(n).fill('');
  };
  for (const c of cols) {
    const width = colWidth(c);
    cur = cur.map((s, i) => s + (c.frets[i] >= 0 ? String(c.frets[i]) : '').padEnd(width, '-'));
    acc += width;
    if (Math.floor(acc / measure) > bars) {
      bars = Math.floor(acc / measure);
      cur = cur.map(s => s + '|');
      if (bars % perLine === 0) flush();
    }
  }
  if (cur[0] && !cur[0].endsWith('|')) cur = cur.map(s => s + '|');
  flush();
  // parseTab só reconhece linhas com 3+ hífens: completa no fim (pausa) se faltar
  const last = blocks.length - 1, lines = last >= 0 ? blocks[last].split('\n') : [];
  const need = Math.max(0, ...lines.map(l => 3 - (l.match(/-/g) || []).length));
  if (need) blocks[last] = lines.map(l => l.replace(/\|$/, '-'.repeat(need) + '|')).join('\n');
  return blocks.join('\n\n');
}
