// audio.js — som das cordas com Web Audio API: amostras gravadas (samples/) quando carregadas,
// sintetizador de corda dedilhada (Karplus-Strong) enquanto carregam ou se faltarem (offline sem cache, erro).
// O AudioContext só é criado/retomado dentro de um gesto do usuário (unlock/play*).
// Cada nota = 1 AudioBufferSourceNode + 1 GainNode, desconectados no `ended` (sem vazamento).
import { noteToMidi } from './theory.js';

/** Timbres por instrumento. t60 = tempo (s) até cair 60 dB; blend 0,5 = filtro de média mais fechado (mais quente). */
export const TIMBRES = {
  violao: { t60: 4.2, blend: 0.5, pluck: 0.35, gain: 0.32, pairDelay: 0 },
  viola: { t60: 3.2, blend: 0.3, pluck: 0.75, gain: 0.2, pairDelay: 0.008 },
  ukulele: { t60: 1.1, blend: 0.45, pluck: 0.55, gain: 0.34, pairDelay: 0 },
};
/** Baixo do acompanhamento (Karplus-Strong mais grave e abafado). */
const BASS = { t60: 1.6, blend: 0.6, pluck: 0.2, gain: 0.55 };
/**
 * Amostras gravadas (fontes e licenças em samples/CREDITOS.md): uma nota a cada 3 semitons,
 * reafinada por playbackRate. decay = constante de tempo (s) extra para encurtar a sustentação.
 */
const SAMPLE_SETS = { nylon: { lo: 39, hi: 84 }, aco: { lo: 39, hi: 84 }, baixo: { lo: 33, hi: 60 }, ukulele: { lo: 60, hi: 81 } };
// peak = pico da amostra normalizada, calibrado para soar tão alto quanto a síntese (RMS medido offline)
const SAMPLE_FOR = {
  violao: { set: 'nylon', peak: 0.3 },
  viola: { set: 'aco', peak: 0.48 },
  ukulele: { set: 'ukulele', peak: 0.4 },
  baixo: { set: 'baixo', peak: 0.3 },
};
let samplesOn = true;
/** Liga/desliga as amostras gravadas (desligado = só síntese; usado nos testes e para comparar). */
export function useSamples(on) { samplesOn = !!on; }
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
let ctx = null, master = null, noise = null, mix = null, body = null;
const hits = new Set();               // golpes de percussão agendados/soando ({ nodes, out })
const active = new Set();              // vozes soando
const byCourse = new Map();            // course → Set de vozes (abafa a corda ao re-tocá-la)
const cache = new Map();               // buffers prontos (LRU simples)
const CACHE_MAX = 160, MAX_VOICES = 48;
const sampleSets = new Map();          // set → { notes: Map(midi → { buffer, offset, norm }) } | 'loading' | 'error'

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
  mix = ctx.createGain(); // entrada do limitador: som seco + retorno do reverb
  mix.connect(comp).connect(clip).connect(ctx.destination);
  master.connect(mix);
  // Reverb de sala (envio/retorno): tira a cara de "som seco de sintetizador"
  if (ctx.createConvolver) {
    const room = ctx.createConvolver(), wet = ctx.createGain();
    room.buffer = roomImpulse(ctx);
    wet.gain.value = 0.22;
    master.connect(room).connect(wet).connect(mix);
  }
  // Corpo do instrumento: ressonâncias graves da caixa acústica e agudos mais macios
  body = [['peaking', 110, 1.1, 3], ['peaking', 215, 1.4, 2.5], ['peaking', 1100, 1, -1.5], ['highshelf', 6000, 0.7, -3]]
    .map(([type, f, q, g]) => Object.assign(ctx.createBiquadFilter(), { type }, { _f: f, _q: q, _g: g }));
  body.forEach((b, i) => { b.frequency.value = b._f; b.Q.value = b._q; b.gain.value = b._g; if (i) body[i - 1].connect(b); });
  body[body.length - 1].connect(master);
  body = body[0];
  cache.clear();
  sampleSets.clear();
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); // 1 s de ruído branco para a percussão
  const nd = noise.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < nd.length; i++) nd[i] = ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

/**
 * Resposta ao impulso de uma sala média (~1,3 s), gerada por código: primeiras reflexões + cauda de ruído
 * que escurece com o tempo. Determinística (mesma semente) e estéreo (canais levemente diferentes).
 */
function roomImpulse(c, secs = 1.4) {
  const n = Math.round(c.sampleRate * secs), b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let s = 777 + ch * 101, lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / c.sampleRate, r = ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
      lp += (0.45 * Math.exp(-t * 3) + 0.05) * (r - lp);
      d[i] = lp * Math.exp(-t * 5) * (t < 0.01 ? t / 0.01 : 1);
    }
    [0.011, 0.019, 0.027, 0.041].forEach((tt, j) => { d[Math.round((tt + ch * 0.003) * c.sampleRate)] += 0.4 / (j + 1.5); });
  }
  return b;
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
  const data = ksSamples(freq, ctx.sampleRate, TIMBRES[instrumentId] || (instrumentId === 'baixo' ? BASS : TIMBRES.violao), Math.round(freq * 1000));
  b = ctx.createBuffer(1, data.length, ctx.sampleRate);
  b.copyToChannel ? b.copyToChannel(data, 0) : b.getChannelData(0).set(data);
  cache.set(key, b);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return b;
}

/** Base de `samples/` (ao lado de js/), funciona em subpasta (usuario.github.io/repo/). */
const SAMPLE_BASE = new URL('../samples/', import.meta.url);

/**
 * Carrega (uma vez) as amostras do instrumento: baixa, decodifica, acha o início do som (o MP3 traz
 * silêncio no começo) e normaliza o pico. Enquanto não terminar, as notas usam a síntese.
 */
export function preloadSamples(instrumentId) {
  if (instrumentId === 'percussao') return preloadDrums();
  const set = SAMPLE_FOR[instrumentId]?.set;
  if (!ctx || !set || sampleSets.has(set) || typeof fetch !== 'function') return;
  sampleSets.set(set, 'loading');
  const { lo, hi } = SAMPLE_SETS[set], c = ctx, jobs = [];
  for (let m = lo; m <= hi; m++) {
    if (m % 3) continue;
    jobs.push(fetch(new URL(`${set}/${m}.mp3`, SAMPLE_BASE))
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(data => new Promise((ok, fail) => { const p = c.decodeAudioData(data, ok, fail); if (p?.catch) p.catch(fail); }))
      .then(buffer => [m, prepSample(buffer)]));
  }
  Promise.all(jobs).then(list => {
    if (ctx === c) sampleSets.set(set, { notes: new Map(list) });
  }).catch(err => {
    console.warn(`[audio] amostras "${set}" indisponíveis, usando síntese:`, err.message);
    if (ctx === c) sampleSets.set(set, 'error');
  });
}

function prepSample(buffer) {
  const d = buffer.getChannelData(0);
  // fade final de 40 ms (algumas gravações foram cortadas para ficar menores)
  for (let c = 0, f = Math.min(d.length, Math.round(buffer.sampleRate * 0.04)); c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < f; i++) ch[ch.length - 1 - i] *= i / f;
  }
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  let i = 0;
  while (i < d.length && Math.abs(d[i]) < peak * 0.02) i++;
  return { buffer, offset: Math.max(0, i / buffer.sampleRate - 0.002), norm: peak > 0 ? 1 / peak : 1 };
}

/**
 * Percussão gravada (samples/percussao/<peça>-forte.wav = X e -leve.wav = x; sem -leve usa o forte mais baixo).
 * [forte, leve] = ganho calibrado para soar tão alto quanto a percussão sintetizada (RMS medido offline).
 */
const DRUM_LEVEL = { bumbo: [0.76, 0.48], caixa: [0.18, 0.1], chimbal: [0.05, 0.03], surdo: [0.67, 0.13], zabumba: [0.38, 0.06],
  triangulo: [0.11, 0.05], pandeiro: [0.12, 0.07], tamborim: [0.2, 0.1], ganza: [0.05, 0.045], agogo: [0.32, 0.2],
  conga: [0.28, 0.05], palmas: [0.1, 0.13], clave: [0.4, 0.1] };
function preloadDrums() {
  if (!ctx || sampleSets.has('percussao') || typeof fetch !== 'function') return;
  sampleSets.set('percussao', 'loading');
  const c = ctx, load = file => fetch(new URL(`percussao/${file}.wav`, SAMPLE_BASE))
    .then(r => (r.ok ? r.arrayBuffer() : null))
    .then(data => data && new Promise((ok, fail) => { const p = c.decodeAudioData(data, ok, fail); if (p?.catch) p.catch(fail); }))
    .then(b => b && prepSample(b))
    .catch(() => null);
  Promise.all(Object.keys(DRUM_LEVEL).map(part => Promise.all([load(`${part}-forte`), load(`${part}-leve`)]).then(([X, x]) => [part, { X, x }])))
    .then(list => { if (ctx === c) sampleSets.set('percussao', { drums: new Map(list.filter(([, d]) => d.X)) }); });
}

/** Amostra mais próxima da nota (MIDI fracionário) ou null se o conjunto ainda não está pronto. */
function sampleFor(instrumentId, midi) {
  const spec = SAMPLE_FOR[instrumentId];
  if (!samplesOn || !spec) return null;
  const st = sampleSets.get(spec.set);
  if (!st) preloadSamples(instrumentId);
  if (!st?.notes) return null;
  const { lo, hi } = SAMPLE_SETS[spec.set];
  const base = Math.min(hi, Math.max(lo, 3 * Math.round(midi / 3)));
  const s = st.notes.get(base);
  return s && { ...s, rate: 2 ** ((midi - base) / 12), level: s.norm * spec.peak, decay: spec.decay };
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
  const src = ctx.createBufferSource(), gain = ctx.createGain();
  const smp = sampleFor(instrumentId, voice.midi + voice.cents / 100);
  if (smp) {
    // Gravação: já tem o corpo do instrumento — vai direto ao master (com reverb), sem o EQ de corpo
    src.buffer = smp.buffer;
    src.playbackRate.value = smp.rate;
    gain.gain.value = level * smp.level;
    if (smp.decay) gain.gain.setTargetAtTime(0, when + 0.08, smp.decay);
    src.connect(gain).connect(master);
  } else {
    src.buffer = bufferFor(instrumentId, midiToFreq(voice.midi + voice.cents / 100));
    gain.gain.value = level;
    src.connect(gain).connect(instrumentId === 'baixo' ? master : body);
  }
  const v = { src, gain, course: voice.course, released: false };
  src.onended = () => cleanup(v);
  active.add(v);
  if (!byCourse.has(v.course)) byCourse.set(v.course, new Set());
  byCourse.get(v.course).add(v);
  if (smp) src.start(when, smp.offset); else src.start(when);
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

// ---------- Agendamento (tocar a progressão sozinha) ----------
/** Relógio do áudio em segundos (null se ainda não há contexto). */
export const audioNow = () => (ctx ? ctx.currentTime : null);
/** Atraso entre agendar e ouvir (fones Bluetooth etc.), para sincronizar o que aparece na tela. */
export const audioLatency = () => (ctx ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0);

/**
 * Agenda as casas (-1 = não toca) no instante `when` do relógio do áudio. Re-tocar uma corda abafa a anterior.
 * strum = intervalo entre cordas (grave → aguda) em s; gain multiplica o volume;
 * up = batida para cima (aguda → grave); len > 0 = abafa após `len` s (batida abafada/staccato).
 */
export function scheduleFrets(frets, instrumentId, tuning, when, { strum = 0, gain = 1, up = false, len = 0 } = {}) {
  if (!unlock()) return 0;
  const t = Math.max(when, ctx.currentTime);
  const voices = voicesFor(frets, instrumentId, tuning);
  for (const c of new Set(voices.map(v => v.course))) for (const old of byCourse.get(c) || []) release(old, t);
  const level = gain * (TIMBRES[instrumentId] || TIMBRES.violao).gain * Math.min(1, Math.sqrt(6 / Math.max(voices.length, 1)));
  const order = [...new Set(voices.map(v => v.course))].sort((x, y) => (up ? y - x : x - y));
  for (const v of voices) {
    const sv = startVoice(v, instrumentId, t + order.indexOf(v.course) * strum + v.offset, level);
    if (len > 0) release(sv, t + len + order.indexOf(v.course) * strum);
  }
  if (active.size > MAX_VOICES) [...active].slice(0, active.size - MAX_VOICES).forEach(v => release(v, ctx.currentTime));
  return voices.length;
}

/** Clique de metrônomo no instante `when` (accent = 1º tempo, mais agudo e forte). */
export function scheduleClick(when, accent = false) {
  if (!unlock()) return;
  const t = Math.max(when, ctx.currentTime), o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = accent ? 1600 : 1000;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g).connect(mix); // seco: o clique não passa pelo reverb
  o.onended = () => { o.disconnect(); g.disconnect(); };
  o.start(t); o.stop(t + 0.06);
}

/** Abafa tudo o que soa ou está agendado. */
export function stopAll() {
  if (!ctx) return;
  active.forEach(v => release(v, ctx.currentTime));
  hits.forEach(h => { h.out.gain.cancelScheduledValues(ctx.currentTime); h.out.gain.setTargetAtTime(0, ctx.currentTime, 0.01); });
}

// ---------- Acompanhamento: percussão sintetizada e baixo ----------
/**
 * Um golpe: camadas (osciladores ou ruído, cada uma com filtro opcional e envelope próprio) → `out` → master.
 * Camada: { freq, to?, sweep?, wave?, noise?: true, filter?: [tipo, freq, Q], at?, attack?, peak, decay }.
 * O ruído começa num ponto aleatório do buffer: dois golpes nunca são idênticos. Tudo é desconectado ao terminar.
 */
function hit(t, level, layers, k = 1) {
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(master);
  const h = { out, nodes: [out] };
  let left = 0;
  const done = () => { if (--left > 0) return; h.nodes.forEach(n => n.disconnect()); hits.delete(h); };
  for (const L of layers) {
    const g = ctx.createGain(), at = t + (L.at || 0), d = L.decay;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(L.peak, at + (L.attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    let src;
    if (L.noise) {
      src = ctx.createBufferSource();
      src.buffer = noise;
    } else {
      src = ctx.createOscillator();
      src.type = L.wave || 'sine';
      src.frequency.setValueAtTime(L.freq * k, at);
      if (L.to) src.frequency.exponentialRampToValueAtTime(L.to * k, at + (L.sweep || d));
    }
    let node = src;
    if (L.filter) {
      const f = ctx.createBiquadFilter();
      f.type = L.filter[0]; f.frequency.value = L.filter[1] * k; f.Q.value = L.filter[2] ?? 0.8;
      node = node.connect(f);
      h.nodes.push(f);
    }
    node.connect(g).connect(out);
    h.nodes.push(src, g);
    left++;
    src.onended = done;
    if (L.noise) src.start(at, Math.random() * 0.8); else src.start(at);
    src.stop(at + d + 0.02);
  }
  hits.add(h);
}

const N = (filter, peak, decay, more = {}) => ({ noise: true, filter, peak, decay, ...more });
const METAL = [263, 400, 421, 474, 587, 845]; // parciais inarmônicas (chimbal tipo prato)

/** Receitas de cada instrumento. a = golpe forte/principal (X) ou leve/secundário (x). */
const DRUMS = {
  bumbo: a => [{ freq: 150, to: 48, sweep: 0.09, peak: a ? 1 : 0.6, decay: 0.42 },
    { freq: 75, to: 42, sweep: 0.2, peak: a ? 0.35 : 0.2, decay: 0.3 },
    N(['lowpass', 3500], a ? 0.35 : 0.2, 0.012)],
  caixa: a => [{ wave: 'triangle', freq: 190, to: 165, sweep: 0.05, peak: a ? 0.45 : 0.22, decay: 0.09 },
    { wave: 'triangle', freq: 330, peak: a ? 0.2 : 0.1, decay: 0.05 },
    N(['bandpass', 4200, 0.7], a ? 0.55 : 0.22, a ? 0.22 : 0.1, { attack: 0.003 }), // esteira
    N(['highpass', 1800], a ? 0.3 : 0.12, 0.06)],
  chimbal: a => [...METAL.map(f => ({ wave: 'square', freq: f * 1.5, filter: ['highpass', 7500, 1], peak: (a ? 0.07 : 0.04), decay: a ? 0.07 : 0.045 })),
    N(['highpass', 8000], a ? 0.22 : 0.12, a ? 0.07 : 0.045)],
  surdo: a => [{ freq: 92, to: 62, sweep: 0.18, peak: a ? 0.95 : 0.5, decay: a ? 0.9 : 0.16 },
    { freq: 150, to: 100, sweep: 0.1, peak: a ? 0.25 : 0.15, decay: a ? 0.35 : 0.08 },
    N(['lowpass', 500], a ? 0.4 : 0.3, 0.03)],
  zabumba: a => (a ? [{ freq: 125, to: 58, sweep: 0.11, peak: 0.95, decay: 0.42 }, { freq: 190, to: 120, sweep: 0.06, peak: 0.25, decay: 0.12 },
    N(['lowpass', 900], 0.35, 0.04)]
    : [N(['bandpass', 3200, 2.5], 0.5, 0.045), { wave: 'triangle', freq: 1650, peak: 0.12, decay: 0.03 }]), // bacalhau
  triangulo: a => [1, 2.76, 5.4, 8.93].map((m, i) => ({ freq: 1180 * m, peak: 0.1 / (i + 1) ** 0.6, decay: (a ? 1.3 : 0.07) / (1 + i * 0.4) }))
    .concat(N(['highpass', 6000], 0.05, 0.01)),
  pandeiro: a => [...(a ? [{ freq: 165, to: 115, sweep: 0.08, peak: 0.55, decay: 0.2 }, N(['lowpass', 1200], 0.2, 0.03)] : []),
    ...[5200, 7300, 8800].map(f => ({ freq: f, peak: a ? 0.04 : 0.05, decay: 0.11 })), // platinelas
    N(['bandpass', 7500, 1.2], a ? 0.22 : 0.28, 0.12, { attack: 0.004 })],
  tamborim: a => [{ wave: 'triangle', freq: 780, to: 700, sweep: 0.04, peak: a ? 0.5 : 0.28, decay: 0.07 },
    N(['bandpass', 3000, 1.2], a ? 0.3 : 0.15, 0.035)],
  ganza: a => [N(['bandpass', 5500, 1.1], a ? 0.32 : 0.17, a ? 0.1 : 0.07, { attack: 0.02 }),
    N(['highpass', 9000], a ? 0.1 : 0.05, 0.05, { attack: 0.015 })],
  agogo: a => [1, 2.3, 4.1].map((m, i) => ({ freq: (a ? 920 : 640) * m, peak: 0.28 / (i + 1), decay: 0.4 / (1 + i) }))
    .concat(N(['bandpass', 3000, 2], 0.08, 0.01)),
  conga: a => (a ? [{ freq: 235, to: 198, sweep: 0.05, peak: 0.6, decay: 0.38 }, { freq: 330, peak: 0.12, decay: 0.12 }, N(['lowpass', 2000], 0.15, 0.015)]
    : [{ freq: 380, peak: 0.3, decay: 0.05 }, N(['bandpass', 2000, 1], 0.45, 0.07)]), // tapa
  palmas: a => [0, 0.008, 0.019, 0.03].map((at, i) => N(['bandpass', 1200 + i * 120, 0.9], (a ? 0.5 : 0.25) * (i === 3 ? 1 : 0.55), i === 3 ? 0.13 : 0.01, { at })),
  clave: a => [{ freq: 2480, peak: a ? 0.5 : 0.3, decay: 0.08 }, { freq: 2480 * 2.3, peak: 0.06, decay: 0.03 }],
};

/**
 * Golpe de percussão no instante `when`. accent = X (forte/principal); gain = volume.
 * human = 0–1: variação de afinação (±1,5%) e força (±12%) a cada golpe, como numa pessoa tocando.
 */
export function scheduleDrum(part, when, { accent = true, gain = 1, human = 1 } = {}) {
  if (!DRUMS[part] || !unlock() || !noise) return;
  const r = () => (Math.random() * 2 - 1) * human;
  const st = samplesOn && sampleSets.get('percussao');
  if (samplesOn && !st) preloadDrums();
  const d = st?.drums?.get(part);
  if (d) { // gravação: um BufferSource → ganho → master (com reverb); variação humana de afinação e força
    const smp = accent ? d.X : d.x || d.X;
    const src = ctx.createBufferSource(), out = ctx.createGain();
    src.buffer = smp.buffer;
    src.playbackRate.value = 1 + 0.015 * r();
    out.gain.value = gain * DRUM_LEVEL[part][accent ? 0 : 1] * smp.norm * (1 + 0.12 * r());
    src.connect(out).connect(master);
    const h = { out, nodes: [src, out] };
    hits.add(h);
    src.onended = () => { h.nodes.forEach(n => n.disconnect()); hits.delete(h); };
    src.start(Math.max(when, ctx.currentTime), smp.offset);
    return;
  }
  hit(Math.max(when, ctx.currentTime), gain * 0.5 * (1 + 0.12 * r()), DRUMS[part](accent), 1 + 0.015 * r());
}

/** Nota do baixo (MIDI) no instante `when`, abafada após `len` s. Uma nota nova abafa a anterior. */
export function scheduleBass(midi, when, { len = 0.5, gain = 1 } = {}) {
  if (!unlock()) return;
  const t = Math.max(when, ctx.currentTime);
  for (const old of byCourse.get('baixo') || []) release(old, t);
  const v = startVoice({ course: 'baixo', midi, cents: 0, offset: 0 }, 'baixo', t, gain * BASS.gain);
  release(v, t + len);
}
