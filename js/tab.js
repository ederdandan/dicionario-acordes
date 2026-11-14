// tab.js — tablatura em texto ASCII → eventos no tempo (funções puras, sem DOM).
// Cada caractere (exceto '|') é 1 passo de tempo; números de 2 dígitos são uma nota só.

const TAB_LINE = /^\s*([A-Za-z][#b]?\d?)?\s*(?:-?[|:])?(.*)$/;
const TAB_CHARS = /^[-0-9xX|hpbr/\\~().<>^*=\s]*$/;
// Anotações no meio da linha ((E), E7, A, PM, let ring): viram '-' do mesmo tamanho, sem desalinhar
// as colunas. Letras de técnica (h p b r x) isoladas entre números continuam valendo.
const ANNOTATION = /[A-WYZ][A-Za-z0-9#]*(?:\/[A-G][#b]?)?|[a-z]{2,}\d*/g;

/** Uma linha é de tablatura se, sem rótulo e anotações, tiver ao menos 3 hífens e só caracteres de tab. */
function tabBody(line) {
  const m = TAB_LINE.exec(line.replace(/\s*\[[^\]]*\]\s*$/, '')); // remove marcador final "[1]"
  if (!m) return null;
  const body = m[2].replace(/\s+$/, '');
  const notes = [];
  const clean = body.replace(ANNOTATION, (a, col) => (notes.push({ text: a, col }), '-'.repeat(a.length)));
  if (!TAB_CHARS.test(clean) || (clean.match(/-/g) || []).length < 3) return null;
  // Mais anotação que tablatura: é texto comum (ex.: "Intro --- Refrão")
  if (notes.map(a => a.text).join('').length * 2 > (clean.match(/[-0-9|]/g) || []).length) return null;
  return { label: m[1] || '', body, clean, notes };
}

/**
 * parseTab(texto, nCordas, { isChord }) → { blocks, events, steps, ignored } | { error }
 * Anotação em que isChord(texto) é verdadeiro vira evento { chord: texto, frets: todas -1 } (quem chama
 * escolhe a posição) e entra em blocks[b].chords = [{ line, col, len, text, ev }].
 * ignored = demais anotações descartadas (ex.: ['PM']), para avisar o usuário.
 * blocks[b] = { labels, lines (corpo de cada linha), notes: [{ course, fret, line, col, len, ev }] }
 * events[i] = { step, block, frets: [-1|casa por corda, grave → aguda] }
 * Linha de cima = corda mais aguda (course n-1).
 */
export function parseTab(text, n, { isChord = () => false } = {}) {
  const groups = [];
  let cur = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const t = tabBody(raw);
    if (t) { cur.push(t); continue; }
    if (cur.length) groups.push(cur);
    cur = [];
  }
  if (cur.length) groups.push(cur);
  if (!groups.length) return { error: 'Nenhuma linha de tablatura encontrada (ex.: e|---0---|).' };

  const blocks = [], events = [], ignored = [];
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
    for (let col = 0; col < width; col++) {
      for (const c of marks.get(col) || []) {
        chords.push({ ...c, ev: events.length });
        events.push({ step, block: b, frets: new Array(n).fill(-1), chord: c.text });
      }
      if (clean.every(l => (l[col] || '|') === '|')) continue; // barra de compasso: não conta tempo
      const frets = new Array(n).fill(-1);
      let hit = false;
      clean.forEach((l, line) => {
        if (col <= busy[line]) return;
        const m = /^\d{1,2}/.exec(l.slice(col));
        const course = n - 1 - line;
        if (m) {
          const fret = m[0].length === 2 && +m[0] > 24 ? +m[0][0] : +m[0];
          const len = String(fret).length;
          busy[line] = col + len - 1;
          frets[course] = fret;
          notes.push({ course, fret, line, col, len, ev: events.length });
          hit = true;
        }
      });
      if (hit) events.push({ step, block: b, frets });
      step++;
    }
    blocks.push({ labels: g.map(x => x.label), lines, notes, chords });
  }
  if (!events.length) return { error: 'A tablatura não tem notas.' };
  return { blocks, events, steps: step, ignored: [...new Set(ignored)] };
}

/** Duração de 1 passo em segundos: unit = 8 (colcheia) ou 16 (semicolcheia) por semínima no BPM. */
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
