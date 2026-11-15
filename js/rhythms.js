// rhythms.js — ritmos de mão direita para estudo (dados) e conversão de cada passo em batida (funções puras, sem DOM).
// Versões simplificadas, para quem está começando: o ritmo "de verdade" tem variações regionais e de cada músico.
//
// Padrão (`steps`): um caractere por subdivisão (`sub` por tempo, `meter` tempos por compasso, `bars` compassos).
//   D batida para baixo (todas)   d para baixo leve (agudas)   U para cima (agudas)
//   X abafada (chuck, palma da mão)   x acorde curto (staccato)
//   B baixo (corda mais grave do acorde)   b baixo alternado (2ª mais grave)
//   P pinça (3 agudas juntas)   K baixo + pinça juntos   1–4 uma corda (1 = a mais aguda)   . pausa (deixa soar)

export const STROKES = {
  D: { label: '↓', name: 'Para baixo (todas as cordas)' },
  d: { label: '↓', name: 'Para baixo leve (só as agudas)', soft: true },
  U: { label: '↑', name: 'Para cima (cordas agudas)' },
  X: { label: '✕', name: 'Abafada: bata com a palma sobre as cordas' },
  x: { label: '↓', name: 'Acorde curto: toque e abafe logo', soft: true },
  B: { label: 'B', name: 'Baixo: polegar na corda mais grave do acorde' },
  b: { label: 'b', name: 'Baixo alternado: polegar na corda vizinha' },
  P: { label: 'P', name: 'Pinça: indicador, médio e anelar juntos nas 3 agudas' },
  K: { label: 'B+P', name: 'Baixo e pinça ao mesmo tempo' },
  1: { label: '1', name: 'Corda 1 (a mais aguda) — anelar' },
  2: { label: '2', name: 'Corda 2 — médio' },
  3: { label: '3', name: 'Corda 3 — indicador' },
  4: { label: '4', name: 'Corda 4' },
};

export const LEVELS = ['', 'Fácil', 'Médio', 'Desafio'];

const ALL = ['violao', 'viola', 'ukulele'];

/** lvl: 1 fácil · 2 médio · 3 desafio. inst: instrumentos em que o ritmo é comum. */
export const RHYTHMS = [
  { id: 'so-baixo', name: 'Só para baixo', style: 'Primeiro passo', inst: ALL, lvl: 1, meter: 4, sub: 2, bars: 1, bpm: 70,
    steps: 'D.D.D.D.', tip: 'Uma batida por tempo. Conte “1, 2, 3, 4” em voz alta e troque o acorde sem parar a mão.' },
  { id: 'balada', name: 'Balada pop', style: 'Pop, sertanejo, gospel', inst: ALL, lvl: 1, meter: 4, sub: 2, bars: 1, bpm: 76,
    steps: 'D.DU.UDU', tip: 'A mão sobe e desce o tempo todo, como um pêndulo; nos pontos ela passa sem encostar nas cordas.' },
  { id: 'rock', name: 'Rock em colcheias', style: 'Rock, pop-rock', inst: ['violao', 'ukulele'], lvl: 1, meter: 4, sub: 2, bars: 1, bpm: 96,
    steps: 'DdDdDdDd', tip: 'Tudo para baixo, mais forte no tempo e mais leve no “e”. Mantenha o pulso firme.' },
  { id: 'dedilhado', name: 'Dedilhado de balada', style: 'Baladas, MPB', inst: ALL, lvl: 1, meter: 4, sub: 2, bars: 1, bpm: 72,
    steps: 'B321b321', tip: 'Polegar no baixo; indicador, médio e anelar nas cordas 3, 2 e 1. A mão fica parada, só os dedos se mexem.' },
  { id: 'valsa', name: 'Valsa', style: 'Valsa, serestas (3/4)', inst: ALL, lvl: 1, meter: 3, sub: 2, bars: 1, bpm: 84,
    steps: 'B.D.D.', tip: '“UM-dois-três”: baixo forte no 1 e o acorde nos tempos 2 e 3.' },
  { id: 'island', name: 'Island strum', style: 'Ukulele pop, reggae-pop', inst: ['ukulele', 'violao'], lvl: 2, meter: 4, sub: 2, bars: 1, bpm: 84,
    steps: 'D.DUXUDU', tip: 'Igual à balada, mas o 3º tempo é abafado com a palma — dá o “tchic” característico.' },
  { id: 'reggae', name: 'Reggae', style: 'Reggae', inst: ALL, lvl: 2, meter: 4, sub: 2, bars: 1, bpm: 76,
    steps: 'B.x.b.x.', tip: 'O acorde vem curto nos tempos 2 e 4; abafe com a mão esquerda logo depois de tocar.' },
  { id: 'guarania', name: 'Guarânia', style: 'Guarânia, rasqueado (3/4)', inst: ['violao', 'viola'], lvl: 2, meter: 3, sub: 2, bars: 1, bpm: 80,
    steps: 'B.DUDU', tip: 'Baixo no 1 e depois “desce-sobe” contínuo. Ritmo base de muitas modas de viola.' },
  { id: 'toada', name: 'Toada', style: 'Música caipira', inst: ['viola', 'violao'], lvl: 2, meter: 2, sub: 4, bars: 1, bpm: 72,
    steps: 'B.DUb.DU', tip: 'Baixo no tempo e a batida “desce-sobe” logo depois. Andamento tranquilo, sem pressa.' },
  { id: 'cururu', name: 'Cururu (simplificado)', style: 'Música caipira', inst: ['viola'], lvl: 2, meter: 2, sub: 4, bars: 1, bpm: 84,
    steps: 'D.UDX.UD', tip: 'Versão para iniciantes: o abafado no 2º tempo marca o ritmo. Depois experimente acentuar o último ↓.' },
  { id: 'catere', name: 'Cateretê (simplificado)', style: 'Música caipira, recortado', inst: ['viola'], lvl: 3, meter: 2, sub: 4, bars: 1, bpm: 92,
    steps: 'DUDUD.DU', tip: 'Batida rápida e contínua; o ponto no meio é o “respiro” do recortado. Comece bem devagar.' },
  { id: 'baiao', name: 'Baião', style: 'Baião, forró', inst: ALL, lvl: 2, meter: 2, sub: 4, bars: 1, bpm: 84,
    steps: 'B..bD.DU', tip: 'O baixo faz “TUM… tum-” (3 + 3 + 2) como a zabumba; o acorde preenche o fim do compasso.' },
  { id: 'samba', name: 'Samba (simplificado)', style: 'Samba, pagode', inst: ['violao'], lvl: 3, meter: 2, sub: 4, bars: 1, bpm: 80,
    steps: 'BP.Pb.PP', tip: 'O polegar marca os 2 tempos (o 2º mais forte, como o surdo) e a pinça faz o desenho do tamborim.' },
  { id: 'bossa', name: 'Bossa nova', style: 'Bossa nova', inst: ['violao'], lvl: 3, meter: 2, sub: 4, bars: 2, bpm: 72,
    steps: 'K..Pb.P.B.P.bP..', tip: 'O polegar só marca os tempos, sem acento; a pinça é que balança. Treine primeiro só o polegar.' },
];

/** Ritmos comuns no instrumento, do mais fácil ao mais difícil. */
export const rhythmsFor = instrumentId => RHYTHMS.filter(r => r.inst.includes(instrumentId)).sort((a, b) => a.lvl - b.lvl);

/** Rótulo de contagem de cada passo: "1 e 2 e" (colcheias) ou "1 · e ·" (semicolcheias). */
export function countLabels(r) {
  return [...r.steps].map((_, i) => {
    const beat = Math.floor(i / r.sub) % r.meter, k = i % r.sub;
    if (k === 0) return String(beat + 1);
    return r.sub === 2 || k === 2 ? 'e' : '·';
  });
}

/**
 * Batida de um passo: quais cordas tocar (casas mascaradas com -1) e como.
 * Devolve null na pausa ou se o acorde não tem cordas para aquele golpe.
 */
export function strokeFor(sym, frets) {
  const played = frets.map((f, i) => (f >= 0 ? i : -1)).filter(i => i >= 0);
  if (!played.length || !STROKES[sym]) return null;
  const treble = played.slice(1).slice(-4), top3 = played.slice(-3);
  const take = idx => frets.map((f, i) => (idx.includes(i) ? f : -1));
  switch (sym) {
    case 'D': return { frets: take(played), strum: 0.012, gain: 1 };
    case 'd': return { frets: take(treble), strum: 0.01, gain: 0.55 };
    case 'U': return { frets: take(treble), strum: 0.01, gain: 0.65, up: true };
    case 'X': return { frets: take(played), strum: 0.003, gain: 0.5, len: 0.035 };
    case 'x': return { frets: take(treble), strum: 0.006, gain: 0.75, len: 0.12 };
    case 'B': return { frets: take([played[0]]), strum: 0, gain: 1 };
    case 'b': return { frets: take([played[Math.min(1, played.length - 1)]]), strum: 0, gain: 0.9 };
    case 'P': return { frets: take(top3), strum: 0.003, gain: 0.75 };
    case 'K': return { frets: take([played[0], ...top3]), strum: 0.003, gain: 0.9 };
    default: { // corda nº n (1 = mais aguda)
      const i = played[played.length - Number(sym)];
      return i === undefined ? null : { frets: take([i]), strum: 0, gain: 0.8 };
    }
  }
}
