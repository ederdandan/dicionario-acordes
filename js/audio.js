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

// iPhone/iPad: por padrão o Web Audio fica mudo com a chave de silencioso ligada.
// Safari 16.4+: audioSession 'playback' toca como player de mídia (ignora a chave).
// Versões antigas: um <audio> silencioso em loop, iniciado num gesto, muda a sessão para 'playback'.
const IOS = typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
let silentEl = null;

function silentWavUrl() {
  const n = 4410, buf = new ArrayBuffer(44 + n), d = new DataView(buf); // 0,1 s, 44,1 kHz, 8 bits mono
  const str = (o, t) => [...t].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); d.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); d.setUint32(16, 16, true);
  d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, 44100, true); d.setUint32(28, 44100, true);
  d.setUint16(32, 1, true); d.setUint16(34, 8, true); str(36, 'data'); d.setUint32(40, n, true);
  for (let i = 0; i < n; i++) d.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function iosPlaybackSession() {
  try {
    if (navigator.audioSession) { navigator.audioSession.type = 'playback'; return; }
  } catch { /* ignora */ }
  if (!IOS || silentEl) return;
  silentEl = document.createElement('audio');
  silentEl.setAttribute('x-webkit-airplay', 'deny');
  silentEl.preload = 'auto';
  silentEl.loop = true;
  silentEl.src = silentWavUrl();
  silentEl.play().catch(() => { silentEl = null; }); // tenta de novo no próximo gesto
}

/** Cria/retoma o AudioContext. Chamar dentro de um gesto do usuário (click/touchend/keydown). */
export function unlock() {
  iosPlaybackSession();
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    build(new AC({ latencyHint: 'interactive' }));
  }
  // 'suspended' (criado sem gesto) ou 'interrupted' (iOS após ligação/segundo plano)
  if (ctx.state !== 'running' && ctx.state !== 'closed' && ctx.resume) ctx.resume().catch(() => {});
  return ctx;
}

/** Estado do áudio, para a interface avisar quando não há som. */
export const audioState = () => ctx?.state ?? 'none';

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
  // semi = semitons acima da corda solta no ataque; rate = último playbackRate agendado (ligados/bends)
  const v = { src, gain, course: voice.course, released: false, semi: voice.semi ?? 0, rate: 1 };
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

// ---------- Agendamento (tablatura) ----------
/** Relógio do áudio em segundos (null se ainda não há contexto). */
export const audioNow = () => (ctx ? ctx.currentTime : null);
/** Atraso entre agendar e ouvir (fones Bluetooth etc.), para sincronizar o destaque. */
export const audioLatency = () => (ctx ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0);

/**
 * Agenda as casas (-1 = não toca) no instante `when` do relógio do áudio. Re-tocar uma corda abafa a anterior.
 * strum = intervalo entre cordas (grave → aguda) em s; gain multiplica o volume (acorde de fundo).
 * fx = técnicas por corda (ver parseTab); dur = tempo até o próximo evento (s), limita slides/bends/vibrato.
 */
export function scheduleFrets(frets, instrumentId, tuning, when, { strum = 0, gain = 1, fx = null, dur = 0.5 } = {}) {
  if (!unlock()) return 0;
  const t = Math.max(when, ctx.currentTime);
  const semis = new Array(frets.length).fill(-1), mult = [], after = [];
  frets.forEach((f, i) => {
    const e = fx?.[i];
    if (!e) { semis[i] = f; return; }
    const live = [...(byCourse.get(i) || [])].filter(v => !v.released);
    if (e.tech && !e.slideIn && e.from !== undefined && live.length && f >= 0) {
      // Ligado: a corda continua soando; só muda a altura (hammer/pull/tap na hora, slide/bend com rampa)
      const glide = e.tech === 'slide' ? Math.min(0.12, dur * 0.8) : e.tech === 'bend' || e.tech === 'release' ? Math.min(0.25, dur * 0.7) : 0;
      retune(live, f, t, glide);
      after.push({ i, e, f, voices: live });
      return;
    }
    if (e.dead) { semis[i] = 0; mult[i] = 0.55; }
    else if (f < 0) return;
    else {
      semis[i] = e.harm ?? (e.slideIn ? e.from : f);
      mult[i] = e.ghost ? 0.4 : e.harm ? 0.75 : e.tech ? 0.75 : e.pm ? 0.9 : 1; // ligado sem nota anterior: ataque suave
    }
    after.push({ i, e, f, voices: null });
  });
  const voices = voicesFor(semis, instrumentId, tuning).map(v => ({ ...v, semi: semis[v.course] }));
  for (const c of new Set(voices.map(v => v.course))) for (const old of byCourse.get(c) || []) release(old, t);
  const level = gain * (TIMBRES[instrumentId] || TIMBRES.violao).gain * Math.min(1, Math.sqrt(6 / Math.max(voices.length, 1)));
  const order = [...new Set(voices.map(v => v.course))].sort((a, b) => a - b);
  const started = new Map();
  for (const v of voices) {
    const sv = startVoice(v, instrumentId, t + order.indexOf(v.course) * strum + v.offset, level * (mult[v.course] ?? 1));
    started.set(v.course, [...(started.get(v.course) || []), sv]);
  }
  for (const { i, e, f, voices: live } of after) {
    const vs = live || started.get(i) || [];
    if (!vs.length) continue;
    if (e.dead) { vs.forEach(v => release(v, t + 0.03)); continue; }
    if (e.slideIn) retune(vs, f, t + 0.01, Math.min(0.1, dur * 0.7));
    if (e.bendUp) retune(vs, (e.harm ?? f) + e.bendUp, t + Math.min(0.06, dur * 0.3), Math.min(0.25, dur * 0.6));
    if (e.vib) vibrato(vs, t, t + Math.max(0.3, Math.min(dur, 4)));
    if (e.pm && !e.ring) vs.forEach(v => release(v, t + 0.14)); // palm mute: abafa logo
  }
  if (active.size > MAX_VOICES) [...active].slice(0, active.size - MAX_VOICES).forEach(v => release(v, ctx.currentTime));
  return voices.length;
}

/** Muda a altura das vozes para `semi` semitons acima da corda solta (glide em s; 0 = na hora). */
function retune(vs, semi, t, glide = 0) {
  for (const v of vs) {
    const r = 2 ** ((semi - v.semi) / 12), p = v.src.playbackRate;
    if (glide > 0) { p.setValueAtTime(v.rate, t); p.exponentialRampToValueAtTime(r, t + glide); }
    else p.setValueAtTime(r, t);
    v.rate = r;
  }
}

/** Vibrato: oscilador de 5,5 Hz somado ao playbackRate (±~25 cents), entrando aos poucos. */
function vibrato(vs, t, end) {
  const osc = ctx.createOscillator(), depth = ctx.createGain();
  osc.frequency.value = 5.5;
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(0.015 * vs[0].rate, t + 0.15);
  osc.connect(depth);
  vs.forEach(v => depth.connect(v.src.playbackRate));
  osc.onended = () => { osc.disconnect(); depth.disconnect(); };
  osc.start(t);
  osc.stop(end);
}

/** Abafa tudo o que soa ou está agendado. */
export function stopAll() {
  if (ctx) active.forEach(v => release(v, ctx.currentTime));
}

/** Clique de metrônomo (contagem de entrada) no instante `when`; accent = 1º tempo, mais agudo. */
export function scheduleClick(when, accent = false) {
  if (!unlock()) return;
  const t = Math.max(when, ctx.currentTime);
  const src = ctx.createOscillator();
  src.frequency.value = accent ? 1760 : 1175;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(accent ? 0.45 : 0.3, t + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  src.connect(gain).connect(master);
  const v = { src, gain, course: -1, released: false };
  src.onended = () => cleanup(v);
  active.add(v);
  src.start(t);
  src.stop(t + 0.08);
}
