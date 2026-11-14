// instruments.js — instrumentos e afinações (somente dados).
// courses: ordem da corda/par mais grave → mais aguda; notes em notação científica.
// bass: regra do baixo usada pelo gerador (voicings.js):
//   'pitch'  → a nota mais grave que soa precisa ser o baixo pedido (violão);
//   'course' → vale a nota grave do par mais grave tocado; em acordes sem barra
//              também aceita a 5ª no baixo (idiomático na viola: E = 00000 no Cebolão em Mi);
//   'free'   → afinação reentrante: só acordes com barra exigem o baixo na corda mais grossa tocada.
// muteCost: custo de ranking por corda/par não tocado (padrão 0,5).

const pairs = (labels, notes) => notes.map((n, i) => ({ label: labels[i], notes: n.split('+') }));
const VIOLA_PARES = ['5º par', '4º par', '3º par', '2º par', '1º par'];

export const INSTRUMENTS = {
  violao: {
    id: 'violao',
    name: 'Violão',
    strings: 6,
    frets: 12,
    bass: 'pitch',
    tunings: {
      padrao: {
        name: 'Padrão (E A D G B E)',
        courses: [
          { label: '6ª', notes: ['E2'] },
          { label: '5ª', notes: ['A2'] },
          { label: '4ª', notes: ['D3'] },
          { label: '3ª', notes: ['G3'] },
          { label: '2ª', notes: ['B3'] },
          { label: '1ª', notes: ['E4'] },
        ],
      },
    },
  },
  viola: {
    id: 'viola',
    name: 'Viola Caipira',
    strings: 10,
    frets: 12,
    bass: 'course',
    muteCost: 2,   // abafar pares é menos idiomático que no violão
    tunings: {
      cebolaoMi: { name: 'Cebolão em Mi', short: 'Cebolão Mi', courses: pairs(VIOLA_PARES, ['B2+B3', 'E3+E4', 'G#3+G#4', 'B3+B3', 'E4+E4']) },
      cebolaoRe: { name: 'Cebolão em Ré', short: 'Cebolão Ré', courses: pairs(VIOLA_PARES, ['A2+A3', 'D3+D4', 'F#3+F#4', 'A3+A3', 'D4+D4']) },
      rioAbaixo: { name: 'Rio Abaixo (Sol)', short: 'Rio Abaixo', courses: pairs(VIOLA_PARES, ['G2+G3', 'D3+D4', 'G3+G4', 'B3+B3', 'D4+D4']) },
      boiadeira: { name: 'Boiadeira', short: 'Boiadeira', courses: pairs(VIOLA_PARES, ['G2+G3', 'D3+D4', 'A3+A4', 'D4+D4', 'F#4+F#4']) },
    },
  },
  ukulele: {
    id: 'ukulele',
    name: 'Ukulele',
    strings: 4,
    frets: 12,
    bass: 'free',
    muteCost: 4,   // no ukulele quase sempre se tocam as 4 cordas
    tunings: {
      highG: {
        name: 'High-G (G C E A)',
        short: 'High-G',
        courses: [
          { label: '4ª', notes: ['G4'] },
          { label: '3ª', notes: ['C4'] },
          { label: '2ª', notes: ['E4'] },
          { label: '1ª', notes: ['A4'] },
        ],
      },
    },
  },
};

export const DEFAULT_INSTRUMENT = 'violao';
export const DEFAULT_TUNING = 'padrao';
