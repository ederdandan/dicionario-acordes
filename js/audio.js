// audio.js — sintetizador de corda dedilhada (Karplus-Strong) com Web Audio API.
// O AudioContext só é criado/retomado dentro de um gesto do usuário (unlock/play*).
// Cada nota = 1 AudioBufferSourceNode + 1 GainNode, desconectados no `ended` (sem vazamento).
import { noteToMidi } from './theory.js';

/** Timbres por instrumento. t60 = tempo (s) até cair 60 dB; blend 0,5 = filtro de média mais fechado (mais quente). */
export const TIMBRES = {
  violao: { t60: 4.2, blend: 0.5, pluck: 0.35, gain: 0.32, pairDelay: 0 },
  viola: { t60: 3.2, blend: 0.3, pluck: 0.75, gain: 0.2, pairDelay: 0.008 },
  ukulele: { t60: 1.1, blend: 0.45, pluck: 0.55, gain: 0.34, pairDelay: 0 },
};
export const MODES = { dedilhar: 0.065, batida: 0.018 };
const DETUNE = [3, -2, 2, -3, 1.5, -1.5]; // cents da 2ª corda de cada par (determinístico → cacheável)

export const midiToFreq = m => 440 * 2 ** ((m - 69) / 12);

/**
 * Karplus-Strong: ruído (pré-filtrado conforme `pluck`) numa linha de atraso de período 1/f,
 * realimentada por um passa-baixa de 2 pontos (média ponderada por `blend`) com perda ρ por período.
 * Função pura → Float32Array.
 */
export function ksSamples(freq, sampleRate, { t60 = 3, blend = 0.5, pluck = 0.5 } = {}, seed = 1) {
  const len = Math.ceil(sampleRate * Math.min(t60 * 1.1, 5));
  const out = new Float32Array(len);
  const N = Math.max(2, Math.round(sampleRate / freq));
  const rho = 10 ** (-3 / (t60 * freq)); // perda por período para atingir −60 dB em t60
  let s = seed >>> 0 || 1, lp = 0, mean = 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  for (let i = 0; i < N; i++) { lp += pluck * (rnd() - lp); out[i] = lp; mean += lp; }
  mean /= N;
  for (let i = 0; i < N; i++) out[i] -= mean; // sem componente DC
  for (let i = N; i < len; i++) {
    out[i] = rho * ((1 - blend) * out[i - N] + blend * out[i - N - 1 < 0 ? 0 : i - N - 1]);
  }
  const fade = Math.min(len, Math.round(sampleRate * 0.05)); // fim sem clique
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
  return out;
}

/**
 * Vozes a tocar (função pura). Viola: 2 vozes por par (2ª com +8 ms e ±3 cents).
 * Ordem: corda/par mais grave → mais aguda (ordem de `tuning.courses`).
 */
export function voicesFor(frets, instrumentId, tuning, course = null) {
  const tb = TIMBRES[instrumentId] || TIMBRES.violao;
  const out = [];
  frets.forEach((f, i) => {
    if (f < 0 || (course !== null && i !== course)) return;
    tuning.courses[i].notes.forEach((n, k) => {
      out.push({ course: i, midi: noteToMidi(n) + f, cents: k ? DETUNE[i % DETUNE.length] : 0, offset: k * tb.pairDelay });
    });
  });
  return out;
}

// ---------- Grafo de áudio ----------
let ctx = null, master = null;
const active = new Set();              // vozes soando
const byCourse = new Map();            // course → Set de vozes (abafa a corda ao re-tocá-la)
const cache = new Map();               // buffers prontos (LRU simples)
const CACHE_MAX = 160, MAX_VOICES = 48;

function build(c) {
  ctx = c;
  master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor(); // limitador contra clipping
  comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 12;
  comp.attack.value = 0.002; comp.release.value = 0.2;
  // Soft-clip (tanh) após o compressor: garante |saída| < 1 mesmo nos transientes que escapam do ataque
  const clip = ctx.createWaveShaper();
  const curve = new Float32Array(2049);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / 1024 - 1) * 2;
    curve[i] = Math.abs(x) < 0.6 ? x : Math.sign(x) * (0.6 + 0.39 * Math.tanh((Math.abs(x) - 0.6) / 0.39));
  }
  clip.curve = curve;
  master.connect(comp).connect(clip).connect(ctx.destination);
  cache.clear();
}

/** Para testes: usa um contexto externo (p.ex. OfflineAudioContext). */
export function setContext(c) { active.forEach(v => v.src.disconnect()); active.clear(); byCourse.clear(); build(c); }

/** Cria/retoma o AudioContext. Chamar dentro de um gesto do usuário. */
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    build(new AC({ latencyHint: 'interactive' }));
  }
  if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
  return ctx;
}

export const activeVoices = () => active.size;

function bufferFor(instrumentId, freq) {
  const key = `${instrumentId}:${freq.toFixed(3)}`;
  let b = cache.get(key);
  if (b) { cache.delete(key); cache.set(key, b); return b; }
  const data = ksSamples(freq, ctx.sampleRate, TIMBRES[instrumentId] || TIMBRES.violao, Math.round(freq * 1000));
  b = ctx.createBuffer(1, data.length, ctx.sampleRate);
  b.copyToChannel ? b.copyToChannel(data, 0) : b.getChannelData(0).set(data);
  cache.set(key, b);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return b;
}

function release(v, when) {
  if (v.released) return;
  v.released = true;
  const t = Math.max(when, ctx.currentTime);
  v.gain.gain.cancelScheduledValues(t);
  v.gain.gain.setTargetAtTime(0, t, 0.015);
  try { v.src.stop(t + 0.1); } catch { /* já parado */ }
}

function cleanup(v) {
  if (!active.delete(v)) return;
  byCourse.get(v.course)?.delete(v);
  v.src.disconnect(); v.gain.disconnect();
}

function startVoice(voice, instrumentId, when, level) {
  const src = ctx.createBufferSource();
  src.buffer = bufferFor(instrumentId, midiToFreq(voice.midi + voice.cents / 100));
  const gain = ctx.createGain();
  gain.gain.value = level;
  src.connect(gain).connect(master);
  const v = { src, gain, course: voice.course, released: false };
  src.onended = () => cleanup(v);
  active.add(v);
  if (!byCourse.has(v.course)) byCourse.set(v.course, new Set());
  byCourse.get(v.course).add(v);
  src.start(when);
  return v;
}

/**
 * Toca o voicing. mode: 'dedilhar' | 'batida'. course: índice da corda/par para tocá-la sozinha.
 * Retorna o nº de vozes iniciadas.
 */
export function play(voicing, instrumentId, tuning, { mode = 'dedilhar', course = null } = {}) {
  if (!voicing || !unlock()) return 0;
  const voices = voicesFor(voicing.frets, instrumentId, tuning, course);
  const gap = MODES[mode] ?? MODES.dedilhar;
  const t0 = ctx.currentTime + 0.02;
  const order = [...new Set(voices.map(v => v.course))];
  // Re-tocar uma corda abafa o que ela ainda soava (como no instrumento real)
  for (const c of order) for (const old of byCourse.get(c) || []) release(old, t0 + order.indexOf(c) * gap);
  // Ganho por voz normalizado pelo nº de vozes (10 da viola ≈ mesma intensidade que 6 do violão)
  const level = (TIMBRES[instrumentId] || TIMBRES.violao).gain * Math.min(1, Math.sqrt(6 / voices.length));
  for (const v of voices) startVoice(v, instrumentId, t0 + order.indexOf(v.course) * gap + v.offset, level);
  // Teto de polifonia: solta as vozes mais antigas
  if (active.size > MAX_VOICES) [...active].slice(0, active.size - MAX_VOICES).forEach(v => release(v, ctx.currentTime));
  return voices.length;
}
