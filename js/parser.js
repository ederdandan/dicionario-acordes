// parser.js — cifra/texto → objeto de acorde (funções puras, sem DOM).
import { CHORD_TYPES, TYPE_BY_Q, parseNote, pcOf, spell } from './theory.js';

const PT_ROOT = { do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' };
const stripAccents = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Lê uma tônica no início do texto. Retorna { root, rest } (pode haver mais de uma leitura). */
function readRoots(text) {
  const out = [];
  text = text.normalize('NFC');
  const plain = stripAccents(text);
  // Português: Dó, Ré, Mi, Fá, Sol, Lá, Si (+ #, b, sustenido, bemol)
  const pt = /^(do|re|mi|fa|sol|la|si)(\s*(?:sustenido|bemol)|#|b(?!emol))?/i.exec(plain);
  if (pt) {
    const accRaw = (pt[2] || '').trim().toLowerCase();
    const acc = accRaw === '#' || accRaw === 'sustenido' ? '#' : accRaw ? 'b' : '';
    out.push({ root: PT_ROOT[pt[1].toLowerCase()] + acc, rest: text.slice(pt[0].length) });
  }
  const en = /^([A-Ga-g])(#|b)?/.exec(text);
  if (en) out.push({ root: en[1].toUpperCase() + (en[2] || ''), rest: text.slice(en[0].length) });
  return out;
}

const STRIPPED = Object.fromEntries(CHORD_TYPES.map(t => [t.q.replace(/[()]/g, ''), t.q]));
const ALIAS = {
  M: '', maj: '', Maj: '', MAJ: '', min: 'm', '+': 'aug', '#5': 'aug', '°': 'dim', o: 'dim',
  '°7': 'dim7', o7: 'dim7', ø: 'm7b5', ø7: 'm7b5', Δ: '7M', Δ7: '7M', '7+': '7M', maj7: '7M', Maj7: '7M', M7: '7M',
  maj9: '7M9', Maj9: '7M9', M9: '7M9', Δ9: '7M9', maj13: '7M13', Maj13: '7M13', M13: '7M13', Δ13: '7M13',
  sus: 'sus4', '7sus': '7sus4', 69: '6/9', alt: '7alt', 'm7+': 'm7M', mΔ: 'm7M', mΔ7: 'm7M', mM7: 'm7M',
  mmaj7: 'm7M', mMaj7: 'm7M', 'm7(5b)': 'm7b5', m75b: 'm7b5', 'm7-5': 'm7b5',
};

/** Normaliza o sufixo de qualidade para a forma canônica ('maj7' → '7M'). null se desconhecido. */
export function canonQuality(raw) {
  let s = raw.trim();
  s = s.replace(/s[ée]tima\s+maior/gi, '7M').replace(/s[ée]tima/gi, '7')
    .replace(/\bmenor\b/gi, 'm').replace(/\bmaior\b/gi, '').replace(/\bdiminut[oa]\b/gi, 'dim')
    .replace(/\baumentad[oa]\b/gi, 'aug').replace(/\b(com|e)\b/gi, '');
  s = s.replace(/[\s()]/g, '').replace(/♭/g, 'b').replace(/♯/g, '#');
  if (s in ALIAS) s = ALIAS[s];
  s = s.replace(/^-/, 'm').replace(/^min(?=\d)/, 'm').replace(/^(?:maj|Maj|Δ)7(?=.)/, '7M');
  // Alterações em notação brasileira (9b, 9-, 5+…) → b9, #5…
  s = s.replace(/(5|9|11|13)([b#+-])(?!\d)/g, (_, d, a) => (a === 'b' || a === '-' ? 'b' : '#') + d);
  s = s.replace(/([+-])(5|9|11|13)/g, (_, a, d) => (a === '-' ? 'b' : '#') + d);
  if (s in ALIAS) s = ALIAS[s];
  return s in STRIPPED ? STRIPPED[s] : null;
}

function readFullNote(text) {
  const t = text.trim();
  for (const r of readRoots(t)) if (r.rest.trim() === '') return r.root;
  return null;
}

/** Interpreta uma cifra ou nome por extenso. Retorna { root, quality, bass, symbol } ou null. */
export function parseChord(texto) {
  if (typeof texto !== 'string') return null;
  const text = texto.trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  if (!text) return null;
  for (const { root, rest } of readRoots(text)) {
    if (!parseNote(root)) continue;
    let body = rest, bass = null;
    const slash = rest.lastIndexOf('/');
    if (slash >= 0) {
      const b = readFullNote(rest.slice(slash + 1));
      if (b) { bass = b; body = rest.slice(0, slash); }
    }
    const quality = canonQuality(body);
    if (quality === null) continue;
    if (bass && pcOf(bass) === pcOf(root)) bass = null;
    return { root, quality, bass, symbol: root + quality + (bass ? '/' + bass : '') };
  }
  return null;
}

/** Sugestões para o autocomplete: símbolos válidos que começam pelo texto digitado. */
export function suggest(texto, limit = 10) {
  const text = (texto || '').trim();
  if (!text) return [];
  const out = [];
  const exact = parseChord(text);
  if (exact) out.push(exact.symbol);
  for (const { root, rest } of readRoots(text)) {
    if (!parseNote(root)) continue;
    const r = rest.replace(/\s/g, '');
    for (const t of CHORD_TYPES) {
      const sym = root + t.q;
      if (t.q.startsWith(r) || t.q.replace(/[()]/g, '').startsWith(r.replace(/[()]/g, ''))) out.push(sym);
    }
    if (r === '' || r === '/') {
      // inversões comuns
      for (const tok of ['3', '5', '7b']) out.push(root + '/' + spell(root, tok));
    }
  }
  return [...new Set(out)].slice(0, limit);
}

export { TYPE_BY_Q };
