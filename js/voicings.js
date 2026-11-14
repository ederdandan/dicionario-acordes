// voicings.js — gerador algorítmico + ranking de posições (funções puras, sem DOM).
import { CHORD_TYPES, ROOT_GRID, chordNotes, noteToMidi, pcOf } from './theory.js';
import { parseChord } from './parser.js';
import { INSTRUMENTS } from './instruments.js';
import { CURATED } from './curated.js';

const MAX_FRET = 12;
const MAX_SPAN = 3;     // abertura máxima: 4 casas (maior − menor casa pressionada ≤ 3)
const MAX_FINGERS = 4;

/** Dados por corda/par: classe de altura e MIDI mais grave da corda solta. */
function courseInfo(instrumentId, tuningId) {
  const tuning = INSTRUMENTS[instrumentId]?.tunings[tuningId];
  if (!tuning) throw new Error(`Afinação desconhecida: ${instrumentId}/${tuningId}`);
  const courses = tuning.courses.map(c => {
    const midis = c.notes.map(noteToMidi);
    return { pc: midis[0] % 12, low: Math.min(...midis) };
  });
  courses.bassRule = INSTRUMENTS[instrumentId].bass || 'pitch';
  courses.muteCost = INSTRUMENTS[instrumentId].muteCost ?? 0.5;
  return courses;
}

/**
 * Regra do baixo (ver instruments.js). firstPc = nota da corda/par mais grave tocado;
 * lowPc = nota mais grave que soa.
 */
function bassOk(rule, notes, firstPc, lowPc) {
  const slash = notes.bassPc !== notes.rootPc;
  if (rule === 'free') return !slash || firstPc === notes.bassPc;
  if (rule === 'course') {
    if (firstPc === notes.bassPc) return true;
    const i = notes.formula.indexOf('5');
    return !slash && i >= 0 && firstPc === notes.pcs[i];
  }
  return lowPc === notes.bassPc;
}

/**
 * Atribui dedos da casa mais grave para a mais aguda (1→4).
 * Pestana: dedo 1 na menor casa usada em ≥ 2 cordas, sem corda solta/muda entre elas.
 */
export function assignFingers(frets) {
  const fingers = frets.map(() => 0);
  const fretted = frets.map((f, i) => [f, i]).filter(([f]) => f > 0);
  if (!fretted.length) return { fingers, barres: [], count: 0 };
  const minF = Math.min(...fretted.map(([f]) => f));
  const atMin = fretted.filter(([f]) => f === minF).map(([, i]) => i);
  const barres = [];
  let rest = fretted;
  if (atMin.length >= 2) {
    const from = atMin[0], to = atMin[atMin.length - 1];
    let ok = true;
    for (let i = from; i <= to; i++) if (frets[i] < minF) ok = false;
    if (ok) {
      barres.push({ fret: minF, from, to, finger: 1 });
      atMin.forEach(i => { fingers[i] = 1; });
      rest = fretted.filter(([f]) => f !== minF);
    }
  }
  rest.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let next = barres.length ? 2 : 1;
  for (const [, i] of rest) fingers[i] = next++;
  return { fingers, barres, count: next - 1 };
}

/** Pestanas declaradas por dedos explícitos (mesmo dedo, mesma casa, ≥ 2 cordas). */
function barresFromFingers(frets, fingers) {
  const byFinger = {};
  fingers.forEach((d, i) => { if (d > 0 && frets[i] > 0) (byFinger[d] ||= []).push(i); });
  const barres = [];
  for (const [d, idxs] of Object.entries(byFinger)) {
    if (idxs.length >= 2 && idxs.every(i => frets[i] === frets[idxs[0]])) {
      barres.push({ fret: frets[idxs[0]], from: idxs[0], to: idxs[idxs.length - 1], finger: +d });
    }
  }
  return barres;
}

/** Verifica notas/baixo/abertura. Retorna motivo de rejeição (string) ou null se válido. */
export function checkShape(frets, notes, courses, { rootless = false, span = true } = {}) {
  if (frets.length !== courses.length) return `esperava ${courses.length} cordas`;
  const played = [];
  for (let i = 0; i < frets.length; i++) {
    if (frets[i] < 0) continue;
    const pc = (courses[i].pc + frets[i]) % 12;
    if (!notes.pcs.includes(pc)) return `nota estranha na corda ${i + 1}`;
    played.push({ i, pc, midi: courses[i].low + frets[i] });
  }
  if (played.length < 2) return 'poucas cordas';
  const present = new Set(played.map(p => p.pc));
  for (const pc of notes.required) {
    if (rootless && pc === notes.rootPc) continue;
    if (!present.has(pc)) return 'falta nota obrigatória';
  }
  if (notes.alt && notes.alt.pcs.filter(pc => present.has(pc)).length < notes.alt.min) return 'faltam alterações';
  const lowest = played.reduce((a, b) => (b.midi < a.midi ? b : a));
  if (!rootless && !bassOk(courses.bassRule, notes, played[0].pc, lowest.pc)) return 'baixo incorreto';
  const fr = frets.filter(f => f > 0);
  if (span && fr.length && Math.max(...fr) - Math.min(...fr) > MAX_SPAN) return 'abertura maior que 4 casas';
  return null;
}

/** Monta o objeto Voicing a partir das casas (e dedos opcionais). */
function buildVoicing(frets, notes, courses, fingersGiven) {
  let fingers, barres, count;
  if (fingersGiven) {
    fingers = fingersGiven;
    barres = barresFromFingers(frets, fingers);
    count = new Set(fingers.filter(d => d > 0)).size;
  } else {
    ({ fingers, barres, count } = assignFingers(frets));
  }
  const fr = frets.filter(f => f > 0);
  const minF = fr.length ? Math.min(...fr) : 0;
  const maxF = fr.length ? Math.max(...fr) : 0;
  const opens = frets.filter(f => f === 0).length;
  const muted = frets.filter(f => f < 0).length;
  let baseFret = 1;
  if (maxF > 4 && !(opens && maxF <= 5)) baseFret = minF;
  const rows = Math.max(4, maxF - baseFret + 1);
  const playedIdx = frets.map((f, i) => (f >= 0 ? i : -1)).filter(i => i >= 0);
  let midMutes = 0;
  for (let i = playedIdx[0]; i <= playedIdx[playedIdx.length - 1]; i++) if (frets[i] < 0) midMutes++;
  const span = fr.length ? maxF - minF : 0;
  // Viola: 5ª no baixo é aceita em acordes sem barra, mas a tônica no baixo tem preferência.
  const firstPc = (courses[playedIdx[0]].pc + frets[playedIdx[0]]) % 12;
  const fifthBass = courses.bassRule === 'course' && firstPc !== notes.bassPc ? 1 : 0;
  const cost = span + minF + 10 * midMutes + count - opens + (courses.muteCost ?? 0.5) * muted + fifthBass;
  const courseNotes = frets.map((f, i) => (f < 0 ? null : notes.nameOf((courses[i].pc + f) % 12)));
  const label = barres.length
    ? `Pestana na ${barres[0].fret}ª`
    : baseFret === 1 && opens ? 'Posição aberta' : `Região da ${minF || 1}ª casa`;
  return {
    frets, fingers, baseFret, barres, rows, label, cost, fingerCount: count,
    notes: courseNotes.filter(Boolean), courseNotes,
  };
}

/** Busca em todo o braço por janelas de 4 casas. */
function generate(notes, courses, { rootless = false } = {}) {
  const found = [];
  const n = courses.length;
  const inChord = new Array(12).fill(false);
  notes.pcs.forEach(pc => { inChord[pc] = true; });
  let reqMask = 0;
  for (const pc of notes.required) if (!(rootless && pc === notes.rootPc)) reqMask |= 1 << pc;
  let altMask = 0;
  notes.alt?.pcs.forEach(pc => { altMask |= 1 << pc; });
  const bits = m => { let c = 0; for (; m; m &= m - 1) c++; return c; };
  const frets = new Array(n);

  // Cada janela [w, w+3] só aceita posições cuja menor casa pressionada é w (evita duplicatas).
  for (let w = 1; w <= MAX_FRET - MAX_SPAN; w++) {
    const options = courses.map(c => {
      const o = [-1];
      if (inChord[c.pc]) o.push(0);
      for (let f = w; f <= w + MAX_SPAN; f++) if (inChord[(c.pc + f) % 12]) o.push(f);
      return o;
    });
    const rec = (i, mask, nFretted, hasW, played, lowMidi, lowPc, firstPc) => {
      if (nFretted > MAX_FINGERS + 2) return; // poda grosseira (pestana pode reduzir)
      if (i === n) {
        if ((mask & reqMask) !== reqMask || played < 3) return;
        if (nFretted ? !hasW : w !== 1) return;
        if (!rootless && !bassOk(courses.bassRule, notes, firstPc, lowPc)) return;
        if (altMask && bits(mask & altMask) < notes.alt.min) return;
        const { count } = assignFingers(frets);
        if (count > MAX_FINGERS) return;
        found.push(buildVoicing([...frets], notes, courses));
        return;
      }
      const c = courses[i];
      for (const f of options[i]) {
        frets[i] = f;
        if (f < 0) { rec(i + 1, mask, nFretted, hasW, played, lowMidi, lowPc, firstPc); continue; }
        const pc = (c.pc + f) % 12, midi = c.low + f;
        const low = midi < lowMidi;
        rec(i + 1, mask | (1 << pc), nFretted + (f > 0), hasW || f === w, played + 1,
          low ? midi : lowMidi, low ? pc : lowPc, played ? firstPc : pc);
      }
    };
    rec(0, 0, 0, false, 0, Infinity, -1, -1);
  }
  return found;
}

// ---------- Base curada (validada) ----------
const curatedCache = new Map();
export const curatedReport = { valid: 0, invalid: [] };
const chordKey = c => `${pcOf(c.root)}|${c.quality}|${c.bass ? pcOf(c.bass) : ''}`;

/** Valida e indexa os shapes curados de um instrumento/afinação (descarta inválidos com aviso). */
export function curatedFor(instrumentId, tuningId) {
  const id = `${instrumentId}/${tuningId}`;
  if (curatedCache.has(id)) return curatedCache.get(id);
  const map = new Map();
  const courses = courseInfo(instrumentId, tuningId);
  for (const [sym, shapes] of Object.entries(CURATED[id] || {})) {
    const chord = parseChord(sym);
    const notes = chord && chordNotes(chord);
    for (const s of shapes) {
      const frets = String(s.f).split('-').map(x => (x.toLowerCase() === 'x' ? -1 : +x));
      const fingers = s.d ? String(s.d).split('-').map(Number) : null;
      let reason = !notes ? 'cifra não reconhecida' : frets.some(Number.isNaN) ? 'casas inválidas' : checkShape(frets, notes, courses);
      if (!reason && fingers && fingers.length !== frets.length) reason = 'dedos com tamanho errado';
      if (reason) {
        curatedReport.invalid.push({ id, symbol: sym, f: s.f, reason });
        console.warn(`[curated] Shape descartado ${id} ${sym} ${s.f}: ${reason}`);
        continue;
      }
      curatedReport.valid++;
      const key = chordKey(chord);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ frets, fingers, nick: s.l || null });
    }
  }
  curatedCache.set(id, map);
  return map;
}

// ---------- API pública ----------
const memo = new Map();

/** Retorna até `max` posições para o acorde, curadas primeiro, depois por menor custo. */
export function getVoicings(chord, instrumentId, tuningId, { max = 8 } = {}) {
  if (!chord) return [];
  const key = `${chord.symbol}|${instrumentId}|${tuningId}|${max}`;
  if (memo.has(key)) return memo.get(key);
  const notes = chordNotes(chord);
  if (!notes) return [];
  const courses = courseInfo(instrumentId, tuningId);

  const curated = (curatedFor(instrumentId, tuningId).get(chordKey(chord)) || [])
    .map(c => ({ ...buildVoicing(c.frets, notes, courses, c.fingers), curated: true, nick: c.nick }));
  let generated = generate(notes, courses);
  if (!generated.length && !curated.length && notes.pcs.length >= 4) {
    generated = generate(notes, courses, { rootless: true }).map(v => ({ ...v, label: v.label + ' (sem tônica)' }));
  }
  generated.sort((a, b) => a.cost - b.cost || a.frets.join().localeCompare(b.frets.join()));

  const seen = new Set();
  const out = [];
  for (const v of [...curated, ...generated]) {
    const k = v.frets.join(',');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...v, symbol: chord.symbol });
    if (out.length >= max) break;
  }
  memo.set(key, out);
  return out;
}

// ---------- Identificação reversa ----------
/**
 * Nomes possíveis para um shape (casas da corda mais grossa → mais fina, -1 = muda).
 * Ordem: tônica no baixo primeiro, depois menos notas omitidas, depois tipos mais simples.
 * Usa as mesmas regras do gerador (notas obrigatórias, regra de baixo do instrumento), sem limite de abertura.
 * → [{ symbol, chord, rootInBass, bassName, omitted }]
 */
export function identifyChord(frets, instrumentId, tuningId, { max = 12 } = {}) {
  const courses = courseInfo(instrumentId, tuningId);
  if (!Array.isArray(frets) || frets.length !== courses.length) return [];
  const played = [];
  frets.forEach((f, i) => { if (f >= 0) played.push({ pc: (courses[i].pc + f) % 12, midi: courses[i].low + f }); });
  if (played.length < 2) return [];
  const present = new Set(played.map(p => p.pc));
  const bassPc = courses.bassRule === 'pitch'
    ? played.reduce((a, b) => (b.midi < a.midi ? b : a)).pc
    : played[0].pc; // viola/ukulele: corda/par mais grave tocado
  const out = [];
  for (const rootPc of present) {
    const root = ROOT_GRID[rootPc];
    CHORD_TYPES.forEach((t, order) => {
      const plain = parseChord(root + t.q);
      const pn = plain && chordNotes(plain);
      if (!pn || [...present].some(pc => !pn.pcs.includes(pc))) return;
      let chord = plain;
      if (checkShape(frets, pn, courses, { span: false })) {
        if (bassPc === rootPc) return; // falta nota obrigatória
        chord = parseChord(`${root}${t.q}/${pn.spelled[pn.pcs.indexOf(bassPc)]}`);
        if (!chord || checkShape(frets, chordNotes(chord), courses, { span: false })) return;
      }
      const omitted = pn.pcs.filter(pc => !present.has(pc)).length;
      out.push({ symbol: chord.symbol, chord, rootInBass: bassPc === rootPc, bassName: pn.nameOf(bassPc), omitted, order });
    });
  }
  out.sort((a, b) => b.rootInBass - a.rootInBass || a.omitted - b.omitted || a.order - b.order || a.symbol.localeCompare(b.symbol));
  return out.slice(0, max).map(({ order, ...r }) => r);
}
