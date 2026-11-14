// theory.js — notas, intervalos, fórmulas e grafia enarmônica (funções puras, sem DOM).

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const PT_LETTER = { C: 'Dó', D: 'Ré', E: 'Mi', F: 'Fá', G: 'Sol', A: 'Lá', B: 'Si' };

/** Tônicas preferenciais (grade de tônicas da interface). */
export const ROOTS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** Uma tônica por classe de altura, para a grade C…B. */
export const ROOT_GRID = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Semitons do intervalo natural (maior/justo) de cada grau. */
const DEG_BASE = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 9: 14, 11: 17, 13: 21 };

/**
 * Tipos de acorde. q = qualidade canônica; f = fórmula; opt = graus omissíveis
 * (ordem de omissão: 5ª justa → 9ª/11ª não nominais); alt = grupo do qual ao menos `min` precisam soar.
 */
export const CHORD_TYPES = [
  // Básicos
  { q: '', name: 'Maior', cat: 'basicos', f: ['1', '3', '5'] },
  { q: 'm', name: 'Menor', cat: 'basicos', f: ['1', '3b', '5'] },
  { q: '5', name: 'Power chord', cat: 'basicos', f: ['1', '5'] },
  { q: 'sus2', name: 'Suspenso 2ª', cat: 'basicos', f: ['1', '2', '5'] },
  { q: 'sus4', name: 'Suspenso 4ª', cat: 'basicos', f: ['1', '4', '5'] },
  // Sétimas & sextas
  { q: '7', name: 'Sétima', cat: 'setimas', f: ['1', '3', '5', '7b'], opt: ['5'] },
  { q: '7M', name: 'Sétima maior', cat: 'setimas', f: ['1', '3', '5', '7'], opt: ['5'] },
  { q: 'm7', name: 'Menor com sétima', cat: 'setimas', f: ['1', '3b', '5', '7b'], opt: ['5'] },
  { q: 'm(7M)', name: 'Menor com sétima maior', cat: 'setimas', f: ['1', '3b', '5', '7'], opt: ['5'] },
  { q: '6', name: 'Sexta', cat: 'setimas', f: ['1', '3', '5', '6'], opt: ['5'] },
  { q: 'm6', name: 'Menor com sexta', cat: 'setimas', f: ['1', '3b', '5', '6'], opt: ['5'] },
  { q: '7sus4', name: 'Sétima suspensa', cat: 'setimas', f: ['1', '4', '5', '7b'], opt: ['5'] },
  // Nonas / 11ª / 13ª
  { q: 'add9', name: 'Nona adicionada', cat: 'extensoes', f: ['1', '3', '5', '9'], opt: ['5'] },
  { q: '9', name: 'Nona', cat: 'extensoes', f: ['1', '3', '5', '7b', '9'], opt: ['5'] },
  { q: '7M(9)', name: 'Sétima maior com nona', cat: 'extensoes', f: ['1', '3', '5', '7', '9'], opt: ['5'] },
  { q: 'm9', name: 'Menor com nona', cat: 'extensoes', f: ['1', '3b', '5', '7b', '9'], opt: ['5'] },
  { q: '6/9', name: 'Sexta com nona', cat: 'extensoes', f: ['1', '3', '5', '6', '9'], opt: ['5'] },
  { q: '11', name: 'Décima primeira', cat: 'extensoes', f: ['1', '3', '5', '7b', '9', '11'], opt: ['5', '9'] },
  { q: 'm11', name: 'Menor com 11ª', cat: 'extensoes', f: ['1', '3b', '5', '7b', '9', '11'], opt: ['5', '9'] },
  { q: '13', name: 'Décima terceira', cat: 'extensoes', f: ['1', '3', '5', '7b', '9', '11', '13'], opt: ['5', '11', '9'] },
  { q: '7M(13)', name: 'Sétima maior com 13ª', cat: 'extensoes', f: ['1', '3', '5', '7', '13'], opt: ['5'] },
  { q: 'm13', name: 'Menor com 13ª', cat: 'extensoes', f: ['1', '3b', '5', '7b', '9', '11', '13'], opt: ['5', '11', '9'] },
  // Alterados & diminutos
  { q: 'dim', name: 'Diminuto', cat: 'alterados', f: ['1', '3b', '5b'] },
  { q: 'aug', name: 'Aumentado', cat: 'alterados', f: ['1', '3', '5#'] },
  { q: 'dim7', name: 'Diminuto com sétima', cat: 'alterados', f: ['1', '3b', '5b', '7bb'] },
  { q: 'm7(b5)', name: 'Meio-diminuto', cat: 'alterados', f: ['1', '3b', '5b', '7b'] },
  { q: '7(b5)', name: 'Sétima com 5ª diminuta', cat: 'alterados', f: ['1', '3', '5b', '7b'] },
  { q: '7(#5)', name: 'Sétima com 5ª aumentada', cat: 'alterados', f: ['1', '3', '5#', '7b'] },
  { q: '7(b9)', name: 'Sétima com 9ª menor', cat: 'alterados', f: ['1', '3', '5', '7b', '9b'], opt: ['5'] },
  { q: '7(#9)', name: 'Sétima com 9ª aumentada', cat: 'alterados', f: ['1', '3', '5', '7b', '9#'], opt: ['5'] },
  { q: '7(#11)', name: 'Sétima com 11ª aumentada', cat: 'alterados', f: ['1', '3', '5', '7b', '11#'], opt: ['5'] },
  { q: '7(b13)', name: 'Sétima com 13ª menor', cat: 'alterados', f: ['1', '3', '5', '7b', '13b'], opt: ['5'] },
  { q: '7alt', name: 'Sétima alterada', cat: 'alterados', f: ['1', '3', '7b', '9b', '9#', '13b'], alt: { tokens: ['9b', '9#', '13b'], min: 2 } },
];

export const TYPE_BY_Q = Object.fromEntries(CHORD_TYPES.map(t => [t.q, t]));

export const CATEGORIES = [
  { id: 'basicos', name: 'Básicos' },
  { id: 'setimas', name: 'Sétimas & Sextas' },
  { id: 'extensoes', name: 'Nonas/11ª/13ª' },
  { id: 'alterados', name: 'Alterados & Diminutos' },
  { id: 'inversoes', name: 'Inversões' },
];

/** 'Bb' → { letter: 'B', acc: -1, pc: 10 } | null */
export function parseNote(name) {
  const m = /^([A-G])(#{1,2}|b{1,2})?$/.exec(name || '');
  if (!m) return null;
  const acc = m[2] ? (m[2][0] === '#' ? m[2].length : -m[2].length) : 0;
  return { letter: m[1], acc, pc: (LETTER_PC[m[1]] + acc + 12) % 12 };
}

export const pcOf = name => parseNote(name)?.pc ?? null;

/** Converte grafia em inglês ('Bb') para português ('Sib'). */
export function toPt(name) {
  const n = parseNote(name);
  if (!n) return name;
  return PT_LETTER[n.letter] + (n.acc > 0 ? '#'.repeat(n.acc) : 'b'.repeat(-n.acc));
}

/** '7b' → { deg: 7, semis: 10 } */
export function parseToken(tok) {
  const m = /^(\d+)(bb|b|#)?$/.exec(tok);
  const deg = +m[1];
  const mod = m[2] === 'bb' ? -2 : m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0;
  return { deg, semis: DEG_BASE[deg] + mod };
}

/** Grafa o intervalo `tok` a partir da tônica: spell('C','7b') → 'Bb'. */
export function spell(root, tok) {
  const r = parseNote(root);
  const { deg, semis } = parseToken(tok);
  const letter = LETTERS[(LETTERS.indexOf(r.letter) + deg - 1) % 7];
  const target = (r.pc + semis) % 12;
  const diff = ((target - LETTER_PC[letter] + 18) % 12) - 6;
  return letter + (diff > 0 ? '#'.repeat(diff) : 'b'.repeat(-diff));
}

/** Nome do intervalo entre a tônica e outra nota grafada (para baixos fora do acorde). */
function intervalToken(root, other) {
  const r = parseNote(root), o = parseNote(other);
  const deg = ((LETTERS.indexOf(o.letter) - LETTERS.indexOf(r.letter) + 7) % 7) + 1;
  const diff = ((o.pc - r.pc + 12) % 12) - DEG_BASE[deg];
  const d = ((diff + 18) % 12) - 6;
  return deg + (d === -2 ? 'bb' : d === -1 ? 'b' : d === 1 ? '#' : '');
}

/**
 * Nome em português da classe de altura `pc`.
 * contexto: { root: 'C', token?: '7b' } ou string da tônica. Sem token, escolhe o
 * grau do acorde que bate com `pc`; se não houver, usa bemóis/sustenidos conforme a tônica.
 */
export function noteName(pc, contexto = {}) {
  const ctx = typeof contexto === 'string' ? { root: contexto } : contexto;
  const root = ctx.root || 'C';
  if (ctx.token) return toPt(spell(root, ctx.token));
  const r = parseNote(root);
  for (const tok of ['1', '3', '5', '7b', '3b', '7', '9', '6', '4', '11#', '9b', '9#', '5b', '5#', '13b', '2']) {
    if ((r.pc + parseToken(tok).semis) % 12 === pc) return toPt(spell(root, tok));
  }
  const flats = r.acc < 0 || root === 'F';
  const SH = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FL = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  return toPt((flats ? FL : SH)[pc]);
}

/** 'E2' → 40 (MIDI) */
export function noteToMidi(n) {
  const m = /^([A-G](?:#|b)?)(-?\d)$/.exec(n);
  return pcOf(m[1]) + (+m[2] + 1) * 12;
}

/**
 * Notas do acorde. Retorna pcs/nomes/fórmula em ordem de grau, required/optional (pcs),
 * bassPc (nota que deve soar mais grave) e alt (grupo "ao menos N", p.ex. 7alt).
 */
export function chordNotes(chord) {
  const type = TYPE_BY_Q[chord.quality];
  if (!type) return null;
  const formula = [...type.f];
  const spelled = formula.map(t => spell(chord.root, t));
  if (chord.bass) {
    const bpc = pcOf(chord.bass);
    if (!spelled.some(s => pcOf(s) === bpc)) {
      formula.push(intervalToken(chord.root, chord.bass));
      spelled.push(chord.bass);
    }
  }
  const pcs = spelled.map(pcOf);
  const optTokens = new Set([...(type.opt || []), ...(type.alt?.tokens || [])]);
  const rootPc = pcOf(chord.root);
  const bassPc = chord.bass ? pcOf(chord.bass) : rootPc;
  // Tônica omissível só em inversões (o baixo já é outra nota) com ≥ 4 notas.
  if (bassPc !== rootPc && pcs.length >= 4) optTokens.add('1');
  const optional = pcs.filter((pc, i) => optTokens.has(formula[i]) && pc !== bassPc);
  const required = pcs.filter(pc => !optional.includes(pc));
  const alt = type.alt ? { pcs: type.alt.tokens.map(t => pcOf(spell(chord.root, t))), min: type.alt.min } : null;
  return {
    pcs, names: spelled.map(toPt), spelled, formula, required, optional, bassPc, rootPc, alt,
    nameOf: pc => toPt(spelled[pcs.indexOf(pc)] ?? spell(chord.root, '1')),
  };
}
