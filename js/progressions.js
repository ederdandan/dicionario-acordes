// progressions.js — progressões conhecidas para estudo (dados) e transposição (funções puras, sem DOM).
// Todas escritas com tônica em Dó (C maior, ou Cm quando `minor`); `transposeProgression` leva ao tom pedido.
import { chordNotes, pcOf, spell } from './theory.js';

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Tons oferecidos no seletor (grafia usual de tônica). */
export const STUDY_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export const STUDY_GROUPS = ['Pop e rock', 'Brasileira', 'Jazz e bossa', 'Blues', 'Clássica e outras'];

export const STUDY_PROGRESSIONS = [
  // Pop e rock
  { id: 'pop-4', group: 'Pop e rock', name: 'Pop dos 4 acordes', roman: 'I – V – vi – IV', chords: ['C', 'G', 'Am', 'F'],
    tip: 'A progressão de centenas de sucessos do pop.' },
  { id: 'pop-vi', group: 'Pop e rock', name: 'Pop começando no menor', roman: 'vi – IV – I – V', chords: ['Am', 'F', 'C', 'G'],
    tip: 'Os mesmos 4 acordes, com clima mais melancólico.' },
  { id: 'anos-50', group: 'Pop e rock', name: 'Anos 50 (doo-wop)', roman: 'I – vi – IV – V', chords: ['C', 'Am', 'F', 'G'],
    tip: 'Clássico das baladas dos anos 50 e 60.' },
  { id: 'rock-145', group: 'Pop e rock', name: 'Rock básico', roman: 'I – IV – V – IV', chords: ['C', 'F', 'G', 'F'],
    tip: 'Três acordes que sustentam o rock’n’roll.' },
  { id: 'descida-baixo', group: 'Pop e rock', name: 'Baixo descendo', roman: 'I – V/7 – vi – vi/5 – IV – I/3 – ii – V',
    chords: ['C', 'G/B', 'Am', 'Am/G', 'F', 'C/E', 'Dm', 'G'], tip: 'Inversões fazem o baixo descer nota a nota.' },
  // Brasileira
  { id: 'baiao', group: 'Brasileira', name: 'Baião / forró', roman: 'I – IV – V7 – I', chords: ['C', 'F', 'G7', 'C'],
    tip: 'Base de Asa Branca e de muito forró pé de serra.' },
  { id: 'moda', group: 'Brasileira', name: 'Moda de viola (tônica e dominante)', roman: 'I – V7 – I – I7 – IV – V7 – I',
    chords: ['C', 'G7', 'C', 'C7', 'F', 'G7', 'C'], tip: 'Caminho típico do sertanejo raiz; ótima na viola caipira.' },
  { id: 'samba-menor', group: 'Brasileira', name: 'Samba em menor', roman: 'i – iv – V7 – i', minor: true,
    chords: ['Cm', 'Fm', 'G7', 'Cm'], tip: 'Cadência menor usada em sambas e choros.' },
  { id: 'samba-cadencia', group: 'Brasileira', name: 'Cadência de samba', roman: 'I – VI7 – ii – V7', chords: ['C', 'A7', 'Dm', 'G7'],
    tip: 'O “dó–lá–ré–sol” que gira o samba e a roda de choro.' },
  // Jazz e bossa
  { id: 'ii-v-i', group: 'Jazz e bossa', name: 'II – V – I maior', roman: 'ii7 – V7 – I7M', chords: ['Dm7', 'G7', 'C7M'],
    tip: 'A cadência mais importante do jazz e da bossa nova.' },
  { id: 'ii-v-i-menor', group: 'Jazz e bossa', name: 'II – V – I menor', roman: 'iiø – V7(b9) – i7', minor: true,
    chords: ['Dm7(b5)', 'G7(b9)', 'Cm7'], tip: 'A versão menor, com meio-diminuto e nona menor.' },
  { id: 'turnaround', group: 'Jazz e bossa', name: 'Turnaround', roman: 'I7M – VI7 – ii7 – V7', chords: ['C7M', 'A7', 'Dm7', 'G7'],
    tip: 'Volta ao início no fim de cada chorus.' },
  { id: 'bossa', group: 'Jazz e bossa', name: 'Bossa (I – II7 – ii – V)', roman: 'I7M – II7 – ii7 – V7', chords: ['C7M', 'D7', 'Dm7', 'G7'],
    tip: 'Movimento de abertura típico da bossa nova.' },
  { id: 'ciclo-quintas', group: 'Jazz e bossa', name: 'Ciclo de quintas', roman: 'ii7 – V7 – I7M – IV7M – viiø – III7 – vi7',
    chords: ['Dm7', 'G7', 'C7M', 'F7M', 'Bm7(b5)', 'E7', 'Am7'], tip: 'Percorre a escala de quinta em quinta (estilo “Autumn Leaves”).' },
  // Blues
  { id: 'blues-12', group: 'Blues', name: 'Blues de 12 compassos', roman: 'I7 ×4 – IV7 ×2 – I7 ×2 – V7 – IV7 – I7 – V7',
    chords: ['C7', 'C7', 'C7', 'C7', 'F7', 'F7', 'C7', 'C7', 'G7', 'F7', 'C7', 'G7'], tip: 'Um acorde por compasso.' },
  { id: 'blues-menor', group: 'Blues', name: 'Blues menor', roman: 'i7 ×4 – iv7 ×2 – i7 ×2 – bVI7 – V7 – i7 – V7', minor: true,
    chords: ['Cm7', 'Cm7', 'Cm7', 'Cm7', 'Fm7', 'Fm7', 'Cm7', 'Cm7', 'Ab7', 'G7', 'Cm7', 'G7'], tip: 'Um acorde por compasso.' },
  // Clássica e outras
  { id: 'canon', group: 'Clássica e outras', name: 'Cânone de Pachelbel', roman: 'I – V – vi – iii – IV – I – IV – V',
    chords: ['C', 'G', 'Am', 'Em', 'F', 'C', 'F', 'G'], tip: 'Do Cânone em Ré; reaparece em muitas canções.' },
  { id: 'andaluza', group: 'Clássica e outras', name: 'Cadência andaluza', roman: 'i – bVII – bVI – V', minor: true,
    chords: ['Cm', 'Bb', 'Ab', 'G'], tip: 'Som flamenco; em Lá menor fica Am – G – F – E.' },
  { id: 'perfeita', group: 'Clássica e outras', name: 'Cadência perfeita', roman: 'I – IV – V7 – I', chords: ['C', 'F', 'G7', 'C'],
    tip: 'Tônica, subdominante e dominante: o básico da harmonia.' },
];

/** Usa bemóis em tons de bemol (e nas tônicas menores Dó, Ré, Sol, Fá); senão sustenidos. */
export function useFlats(key, minor = false) {
  if (/b/.test(key) || key === 'F') return true;
  return minor && ['C', 'D', 'G'].includes(key);
}

/** Transpõe uma cifra (já reconhecida por `parse`) em `semis` semitons. */
export function transposeChord(symbol, semis, parse, flats = false) {
  const c = parse(symbol);
  if (!c) return symbol;
  const names = flats ? FLATS : SHARPS;
  const root = names[(((pcOf(c.root) + semis) % 12) + 12) % 12];
  let bass = '';
  if (c.bass) { // grafa o baixo pelo intervalo dentro do acorde (C#/E#, não C#/F)
    const n = chordNotes(c), tok = n.formula[n.pcs.indexOf(pcOf(c.bass))];
    bass = '/' + (tok ? spell(root, tok) : names[(((pcOf(c.bass) + semis) % 12) + 12) % 12]);
  }
  return root + c.quality + bass;
}

/** Progressão de estudo no tom `key` (tônica). Devolve { id, name, chords } pronto para o modo ensaio. */
export function transposeProgression(p, key, parse) {
  const semis = pcOf(key) ?? 0;
  const flats = useFlats(key, p.minor);
  return { ...p, id: `estudo-${p.id}`, key, chords: p.chords.map(s => transposeChord(s, semis, parse, flats)) };
}
