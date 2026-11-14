// instruments.js — instrumentos e afinações (somente dados).
// courses: ordem da corda/par mais grave → mais aguda; notes em notação científica.

export const INSTRUMENTS = {
  violao: {
    id: 'violao',
    name: 'Violão',
    strings: 6,
    frets: 12,
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
};

export const DEFAULT_INSTRUMENT = 'violao';
export const DEFAULT_TUNING = 'padrao';
