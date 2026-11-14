// musicxml.js — importa MusicXML (.musicxml/.xml e .mxl compactado) para o modelo de grade da tablatura.
// parseMusicXML recebe o texto XML (usa DOMParser, sem tocar na página); partToGrid é pura.
import { noteToMidi } from './theory.js';

const STEP_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const num = (el, sel, def = 0) => { const x = el?.querySelector(sel); return x ? +x.textContent.trim() : def; };
const midiOf = (step, alter, octave) => 12 * (octave + 1) + STEP_PC[step] + Math.round(alter);

/**
 * parseMusicXML(texto) → { title, bpm, parts: [part] } | { error }
 * part = { id, name, strings: [midi grave → aguda] | null, beats, beatType,
 *          notes: [{ start, dur, midi, string, fret }], end }   // start/dur/end em semínimas
 * string: 1 = corda mais aguda (convenção MusicXML); null se a nota não tem <technical>.
 */
export function parseMusicXML(text, { Parser = globalThis.DOMParser } = {}) {
  const doc = new Parser().parseFromString(String(text || ''), 'application/xml');
  if (doc.querySelector('parsererror')) return { error: 'O arquivo não é um XML válido.' };
  const root = doc.documentElement;
  if (root?.nodeName === 'score-timewise') return { error: 'MusicXML "timewise" não é suportado; exporte como "partwise".' };
  if (root?.nodeName !== 'score-partwise') return { error: 'Não é um arquivo MusicXML (score-partwise).' };
  const names = new Map([...doc.querySelectorAll('part-list > score-part')].map(p => [p.getAttribute('id'), p.querySelector('part-name')?.textContent.trim() || '']));
  const title = doc.querySelector('work > work-title, movement-title')?.textContent.trim() || '';
  let bpm = 0;
  const parts = [];
  for (const [k, part] of [...doc.querySelectorAll('score-partwise > part')].entries()) {
    const id = part.getAttribute('id') || `P${k + 1}`;
    let div = 1, strings = null, beats = 4, beatType = 4, mStart = 0;
    const notes = [];
    const lastOn = new Map(); // corda/altura → nota ainda soando (para ligaduras)
    for (const m of part.querySelectorAll(':scope > measure')) {
      let t = 0, len = 0, prevStart = 0;
      for (const el of m.children) {
        const tag = el.nodeName;
        if (tag === 'attributes') {
          div = num(el, 'divisions', div) || div;
          beats = num(el, 'time > beats', beats) || beats;
          beatType = num(el, 'time > beat-type', beatType) || beatType;
          const st = [...el.querySelectorAll('staff-details > staff-tuning')];
          if (st.length) {
            const lines = num(el, 'staff-details > staff-lines', st.length);
            strings = new Array(lines).fill(null);
            for (const s of st) {
              const line = +s.getAttribute('line');
              strings[line - 1] = midiOf(s.querySelector('tuning-step')?.textContent.trim(), num(s, 'tuning-alter'), num(s, 'tuning-octave'));
            }
            if (strings.includes(null)) strings = null;
          }
        } else if (tag === 'sound' || tag === 'direction') {
          const s = tag === 'sound' ? el : el.querySelector('sound');
          if (!bpm && s?.getAttribute('tempo')) bpm = Math.round(+s.getAttribute('tempo'));
        } else if (tag === 'backup') {
          t -= num(el, 'duration') / div;
        } else if (tag === 'forward') {
          t += num(el, 'duration') / div;
          len = Math.max(len, t);
        } else if (tag === 'note') {
          if (el.querySelector('grace')) continue; // ornamento sem duração
          const dur = num(el, ':scope > duration') / div;
          const chord = !!el.querySelector(':scope > chord');
          const start = chord ? prevStart : t;
          if (!chord) { prevStart = t; t += dur; len = Math.max(len, t); }
          if (el.querySelector(':scope > rest')) continue;
          const p = el.querySelector(':scope > pitch');
          const tech = el.querySelector('notations technical');
          const string = tech?.querySelector('string') ? num(tech, 'string') : null;
          const fret = tech?.querySelector('fret') ? num(tech, 'fret') : null;
          const midi = p ? midiOf(p.querySelector('step')?.textContent.trim(), num(p, 'alter'), num(p, 'octave')) : null;
          if (midi === null && fret === null) continue; // percussão / sem altura
          const ties = [...el.querySelectorAll(':scope > tie')].map(x => x.getAttribute('type'));
          const key = string ?? `m${midi}`;
          if (ties.includes('stop') && lastOn.has(key)) { // continuação de ligadura: não ataca de novo
            lastOn.get(key).dur += dur;
            if (!ties.includes('start')) lastOn.delete(key);
            continue;
          }
          const n = { start: mStart + start, dur, midi, string, fret };
          notes.push(n);
          if (ties.includes('start')) lastOn.set(key, n);
        }
      }
      mStart += len || beats * 4 / beatType;
    }
    parts.push({ id, name: names.get(id) || id, strings, beats, beatType, notes, end: mStart });
  }
  if (!parts.some(p => p.notes.length)) return { error: 'Nenhuma nota encontrada no MusicXML.' };
  return { title, bpm, parts };
}

/** A parte tem tablatura (corda/casa) em todas as notas? */
export const hasTab = part => part.notes.length > 0 && part.notes.every(n => n.string !== null && n.fret !== null);

/**
 * Escolhe instrumento/afinação para a parte: mesmas alturas das cordas → mesmas classes de nota →
 * mesmo nº de cordas. Retorna { instrument, tuning } ou null.
 */
export function matchInstrument(part, instruments) {
  if (!part.strings) return null;
  const all = Object.values(instruments).flatMap(i => Object.entries(i.tunings).map(([tid, t]) =>
    ({ instrument: i.id, tuning: tid, midi: t.courses.map(c => Math.min(...c.notes.map(noteToMidi))) })));
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const pcs = a => a.map(x => ((x % 12) + 12) % 12);
  const hit = all.find(c => same(c.midi, part.strings)) || all.find(c => same(pcs(c.midi), pcs(part.strings)))
    || all.find(c => c.midi.length === part.strings.length);
  return hit ? { instrument: hit.instrument, tuning: hit.tuning } : null;
}

/**
 * Parte → { cols, unit, measure }: cols no formato da grade (Fase 6b), passo de 1/16
 * (ou 1/8, se nada cair em semicolcheia). courseMidi = altura de cada corda/par do instrumento escolhido
 * (grave → aguda). Usa corda/casa do arquivo quando o nº de cordas bate; senão, posiciona pela altura
 * (casa mais baixa possível, sem repetir corda no mesmo instante).
 */
export function partToGrid(part, courseMidi, { maxFret = 24 } = {}) {
  const n = courseMidi.length;
  const useTab = hasTab(part) && part.strings?.length === n;
  const q = x => Math.round(x * 4); // semínimas → semicolcheias
  const byStep = new Map();
  let dropped = 0;
  const sorted = [...part.notes].sort((a, b) => a.start - b.start || (a.midi ?? 0) - (b.midi ?? 0));
  for (const nt of sorted) {
    const s = q(nt.start);
    const f = byStep.get(s) || new Array(n).fill(-1);
    let course = -1, fret = -1;
    if (useTab) { course = n - nt.string; fret = nt.fret; }
    else if (nt.midi !== null) {
      for (let c = 0; c < n; c++) {
        const fr = nt.midi - courseMidi[c];
        if (fr >= 0 && fr <= maxFret && f[c] < 0 && (fret < 0 || fr < fret)) { course = c; fret = fr; }
      }
    }
    if (course < 0 || course >= n || fret < 0 || f[course] >= 0) { dropped++; continue; }
    f[course] = fret;
    byStep.set(s, f);
  }
  const keys = [...byStep.keys()].sort((a, b) => a - b);
  let end = Math.max(q(part.end), (keys.at(-1) ?? 0) + 1);
  let measure = Math.max(1, Math.round(part.beats * 16 / part.beatType));
  let unit = 16, k2 = 1;
  if ([...keys, end, measure].every(s => s % 2 === 0)) { // tudo em colcheias: passo de 1/8 (texto mais curto)
    unit = 8; k2 = 2; end /= 2; measure /= 2;
  }
  const cols = [];
  if (keys.length && keys[0] > 0) cols.push({ frets: new Array(n).fill(-1), dur: keys[0] / k2 });
  keys.forEach((s, k) => cols.push({ frets: byStep.get(s), dur: Math.max(1, ((keys[k + 1] ?? end * k2) - s) / k2) }));
  return { cols, unit, measure, dropped, fromTab: useTab };
}

// ---------- .mxl (ZIP) ----------
/** Extrai o XML principal de um .mxl (ZIP). Usa DecompressionStream('deflate-raw'). */
export async function unzipMXL(buffer) {
  const u8 = new Uint8Array(buffer), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Arquivo .mxl inválido (não é ZIP).');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = new Map();
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extra = dv.getUint16(p + 30, true), comment = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    files.set(name, { method, size, local });
    p += 46 + nameLen + extra + comment;
  }
  const read = async name => {
    const f = files.get(name);
    if (!f) return null;
    const start = f.local + 30 + dv.getUint16(f.local + 26, true) + dv.getUint16(f.local + 28, true);
    const data = u8.subarray(start, start + f.size);
    if (f.method === 0) return dec.decode(data);
    if (f.method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('Compressão do .mxl não suportada neste navegador.');
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return dec.decode(await new Response(stream).arrayBuffer());
  };
  const container = await read('META-INF/container.xml');
  const rootPath = container && /full-path="([^"]+)"/.exec(container)?.[1];
  const main = rootPath || [...files.keys()].find(f => /\.(musicxml|xml)$/i.test(f) && !f.startsWith('META-INF/'));
  if (!main) throw new Error('O .mxl não contém um arquivo MusicXML.');
  return read(main);
}
