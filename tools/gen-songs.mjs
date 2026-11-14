// gen-songs.mjs — gera js/songs.js (tablaturas de músicas para estudar) a partir das notas (node tools/gen-songs.mjs).
// Só músicas em DOMÍNIO PÚBLICO (clássicas e tradicionais). Cada música é escrita uma vez em altura + duração;
// o gerador escolhe corda/casa para cada instrumento/afinação (menor deslocamento da mão, cordas soltas
// preferidas) e grava o texto no formato da Fase 6a (o mesmo que o app salva).
//
// Notação: "E5/1" = nota/duração em passos; "A2+A4/2" = notas juntas; "r/4" = pausa.
// O passo vale `unit` (8 = colcheia, 16 = semicolcheia); `measure` = passos por compasso.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { INSTRUMENTS } from '../js/instruments.js';
import { noteToMidi } from '../js/theory.js';
import { gridToText, tabLabels, parseTab } from '../js/tab.js';

const OUT = fileURLToPath(new URL('../js/songs.js', import.meta.url));

// ---------- Músicas (tons originais; nas tradicionais, o tom de costume) ----------
const SONGS = {
  furElise: {
    name: 'Für Elise (Pour Elise)', author: 'Beethoven, 1810', key: 'Lá menor', original: true, unit: 16, measure: 6, bpm: 65,
    notes: `r/4 E5/1 D#5/1 | E5/1 D#5/1 E5/1 B4/1 D5/1 C5/1 | A2+A4/1 E3/1 A3/1 C4/1 E4/1 A4/1 | E2+B4/1 E3/1 G#3/1 E4/1 G#4/1 B4/1 |
      A2+C5/1 E3/1 A3/1 E4/1 E5/1 D#5/1 | E5/1 D#5/1 E5/1 B4/1 D5/1 C5/1 | A2+A4/1 E3/1 A3/1 C4/1 E4/1 A4/1 |
      E2+B4/1 E3/1 G#3/1 E4/1 C5/1 B4/1 | A2+A4/1 E3/1 A3/1 r/3`,
  },
  pachelbel: {
    name: 'Cânone em Ré (Pachelbel)', author: 'Pachelbel, c. 1680', key: 'Ré maior', original: true, unit: 8, measure: 8, bpm: 60,
    // baixo contínuo + as duas primeiras vozes (mínimas); o Ré grave sobe uma oitava (o violão não alcança D2)
    notes: `D3+F#4/4 A2+E4/4 | B2+D4/4 F#2+C#4/4 | G2+B3/4 D3+A3/4 | G2+B3/4 A2+C#4/4 |
      D3+D4/4 A2+C#4/4 | B2+B3/4 F#2+A3/4 | G2+G3/4 D3+F#3/4 | G2+G3/4 A2+E3/4 | D3+D4/8`,
  },
  ode: {
    name: 'Ode à Alegria (9ª Sinfonia)', author: 'Beethoven, 1824', key: 'Ré maior', original: true, unit: 8, measure: 8, bpm: 100,
    notes: `F#4/2 F#4/2 G4/2 A4/2 | A4/2 G4/2 F#4/2 E4/2 | D4/2 D4/2 E4/2 F#4/2 | F#4/3 E4/1 E4/4 |
      F#4/2 F#4/2 G4/2 A4/2 | A4/2 G4/2 F#4/2 E4/2 | D4/2 D4/2 E4/2 F#4/2 | E4/3 D4/1 D4/4 |
      E4/2 E4/2 F#4/2 D4/2 | E4/2 F#4/1 G4/1 F#4/2 D4/2 | E4/2 F#4/1 G4/1 F#4/2 E4/2 | D4/2 E4/2 A3/4 |
      F#4/2 F#4/2 G4/2 A4/2 | A4/2 G4/2 F#4/2 E4/2 | D4/2 D4/2 E4/2 F#4/2 | E4/3 D4/1 D4/4`,
  },
  noiteFeliz: {
    name: 'Noite Feliz (Stille Nacht)', author: 'Franz Gruber, 1818', key: 'Ré maior', original: true, unit: 16, measure: 12, bpm: 75,
    notes: `A4/3 B4/1 A4/2 F#4/6 | A4/3 B4/1 A4/2 F#4/6 | E5/4 E5/2 C#5/6 | D5/4 D5/2 A4/6 |
      B4/4 B4/2 D5/3 C#5/1 B4/2 | A4/3 B4/1 A4/2 F#4/6 | B4/4 B4/2 D5/3 C#5/1 B4/2 | A4/3 B4/1 A4/2 F#4/6 |
      E5/4 E5/2 G5/3 E5/1 C#5/2 | D5/6 F#5/6 | D5/3 A4/1 F#4/2 A4/3 G4/1 E4/2 | D4/12`,
  },
  greensleeves: {
    name: 'Greensleeves', author: 'Tradicional inglesa, séc. XVI', key: 'Lá menor', original: false, unit: 16, measure: 12, bpm: 90,
    notes: `r/10 A4/2 | C5/4 D5/2 E5/3 F5/1 E5/2 | D5/4 B4/2 G4/3 A4/1 B4/2 | C5/4 A4/2 A4/3 G#4/1 A4/2 | B4/4 G#4/2 E4/4 A4/2 |
      C5/4 D5/2 E5/3 F5/1 E5/2 | D5/4 B4/2 G4/3 A4/1 B4/2 | C5/3 B4/1 A4/2 G#4/3 F#4/1 G#4/2 | A4/12 |
      G5/6 G5/3 F#5/1 E5/2 | D5/4 B4/2 G4/3 A4/1 B4/2 | C5/4 A4/2 A4/3 G#4/1 A4/2 | B4/4 G#4/2 E4/6 |
      G5/6 G5/3 F#5/1 E5/2 | D5/4 B4/2 G4/3 A4/1 B4/2 | C5/3 B4/1 A4/2 G#4/3 F#4/1 G#4/2 | A4/12`,
  },
  estrelinha: {
    name: 'Brilha, Brilha, Estrelinha', author: 'Tradicional francesa (Mozart, K. 265)', key: 'Dó maior', original: true, unit: 8, measure: 8, bpm: 100,
    notes: `C4/2 C4/2 G4/2 G4/2 | A4/2 A4/2 G4/4 | F4/2 F4/2 E4/2 E4/2 | D4/2 D4/2 C4/4 |
      G4/2 G4/2 F4/2 F4/2 | E4/2 E4/2 D4/4 | G4/2 G4/2 F4/2 F4/2 | E4/2 E4/2 D4/4 |
      C4/2 C4/2 G4/2 G4/2 | A4/2 A4/2 G4/4 | F4/2 F4/2 E4/2 E4/2 | D4/2 D4/2 C4/4`,
  },
  parabens: {
    name: 'Parabéns pra Você', author: 'Melodia de Mildred e Patty Hill, 1893', key: 'Dó maior', original: false, unit: 16, measure: 12, bpm: 110,
    notes: `r/8 G4/3 G4/1 | A4/4 G4/4 C5/4 | B4/8 G4/3 G4/1 | A4/4 G4/4 D5/4 | C5/8 G4/3 G4/1 |
      G5/4 E5/4 C5/4 | B4/4 A4/4 F5/3 F5/1 | E5/4 C5/4 D5/4 | C5/12`,
  },
};

// ---------- O que vai para cada instrumento ----------
// shift: semitons (oitavas, mesmo tom), só nas notas >= split (se houver); low: notas abaixo do alcance → 'fold' (sobe 8ª) ou 'drop' (omite: só a melodia)
const PLAN = [
  ['violao', 'padrao', 'furElise', { shift: -12, split: 60 }], // só a mão direita desce 8ª (melodia no Mi solto); baixo no lugar
  ['violao', 'padrao', 'pachelbel', {}],
  ['violao', 'padrao', 'ode', { shift: -12, low: 'fold' }],
  ['violao', 'padrao', 'noiteFeliz', { shift: -12 }],
  ['violao', 'padrao', 'greensleeves', { shift: -12 }],
  ['viola', 'cebolaoRe', 'ode', { shift: -12, low: 'fold' }],
  ['viola', 'cebolaoRe', 'noiteFeliz', { shift: -12 }],
  ['viola', 'cebolaoMi', 'greensleeves', { shift: -12 }],
  ['viola', 'rioAbaixo', 'estrelinha', {}],
  ['viola', 'rioAbaixo', 'parabens', { shift: -12 }],
  ['ukulele', 'highG', 'estrelinha', {}],
  ['ukulele', 'highG', 'ode', { low: 'fold' }],
  ['ukulele', 'highG', 'noiteFeliz', {}],
  ['ukulele', 'highG', 'greensleeves', {}],
  ['ukulele', 'highG', 'parabens', {}],
  ['ukulele', 'highG', 'furElise', { low: 'drop', name: 'Für Elise (melodia)' }],
];

// ---------- Leitura e digitação ----------
function parseNotes(src) {
  return src.split(/\s+/).filter(t => t && t !== '|').map(tok => {
    const [p, d] = tok.split('/');
    return { pitches: p === 'r' ? [] : p.split('+').map(noteToMidi), dur: +d };
  });
}

const MAX_FRET = 12;

/** Todas as formas de tocar as alturas da coluna (cada uma numa corda diferente). */
function options(pitches, bases) {
  const out = [];
  const rec = (i, used, frets) => {
    if (i === pitches.length) { out.push(frets.slice()); return; }
    bases.forEach((b, c) => {
      const f = pitches[i] - b;
      if (used.has(c) || f < 0 || f > MAX_FRET) return;
      used.add(c); frets[c] = f;
      rec(i + 1, used, frets);
      used.delete(c); frets[c] = -1;
    });
  };
  rec(0, new Set(), new Array(bases.length).fill(-1));
  return out;
}

const fretted = fr => fr.filter(f => f > 0);
function ownCost(fr) {
  const fx = fretted(fr);
  const span = fx.length ? Math.max(...fx) - Math.min(...fx) : 0;
  return (span > 4 ? 100 : span * 0.3) + fx.reduce((s, f) => s + 0.25 + f * 0.04, 0);
}
const pos = fr => { const fx = fretted(fr); return fx.length ? Math.min(...fx) : null; };

/** Programação dinâmica: menor custo total (própria coluna + deslocamento da mão entre colunas). */
function fingerSong(cols, bases) {
  const steps = cols.map(c => (c.pitches.length ? options(c.pitches, bases) : [new Array(bases.length).fill(-1)]));
  steps.forEach((o, i) => { if (!o.length) throw new Error(`coluna ${i + 1} impossível: ${cols[i].pitches}`); });
  let prev = steps[0].map(fr => ({ cost: ownCost(fr), hand: pos(fr) ?? 1, back: -1 }));
  const table = [prev];
  for (let i = 1; i < steps.length; i++) {
    const cur = steps[i].map(fr => {
      const p = pos(fr);
      let best = { cost: Infinity };
      prev.forEach((st, k) => {
        const move = p === null ? 0 : Math.abs(p - st.hand) * 0.6 + (Math.abs(p - st.hand) > 3 ? 1 : 0);
        // Sem hífen entre duas notas na mesma corda ("03") o texto viraria uma casa só: evita
        const pf = steps[i - 1][k], d = cols[i - 1].dur;
        const glued = fr.some((f, c) => f >= 0 && pf[c] >= 0 && d <= String(pf[c]).length) ? 100 : 0;
        // casa de 2 dígitos numa nota de 1 passo ocupa 2 passos no texto (o ritmo mudaria): evita
        const wide = cols[i].dur < 2 && fr.some(f => f > 9) ? 100 : 0;
        const c = st.cost + move + glued + wide + ownCost(fr);
        if (c < best.cost) best = { cost: c, hand: p ?? st.hand, back: k };
      });
      return best;
    });
    table.push(cur);
    prev = cur;
  }
  let k = prev.reduce((b, st, j) => (st.cost < prev[b].cost ? j : b), 0);
  const out = [];
  for (let i = steps.length - 1; i >= 0; i--) { out.unshift({ frets: steps[i][k], dur: cols[i].dur }); k = table[i][k].back; }
  return out;
}

// ---------- Geração ----------
const result = [];
for (const [instId, tunId, songId, opt] of PLAN) {
  const song = SONGS[songId], tuning = INSTRUMENTS[instId].tunings[tunId];
  const bases = tuning.courses.map(c => Math.min(...c.notes.map(noteToMidi)));
  const lowest = Math.min(...bases);
  // Toda nota com 2+ passos, para sempre sobrar um hífen entre notas na mesma corda (senão "3" e "1" viram "31"):
  // colcheias → semicolcheias; com semicolcheias (ritmo pontuado) → fusas
  const unit = song.unit * 2, k = 2, measure = song.measure * k;
  const cols = parseNotes(song.notes).map(c => ({
    dur: c.dur * k,
    pitches: [...new Set(c.pitches.map(p => (p >= (opt.split ?? -Infinity) ? p + (opt.shift || 0) : p)).flatMap(p => {
      if (p >= lowest) return [p];
      if (opt.low === 'drop') return [];
      let q = p; while (q < lowest) q += 12; return [q];
    }))],
  }));
  const grid = fingerSong(cols, bases);
  const text = gridToText(grid, tabLabels(tuning), { measure });
  // Conferência: o player lê exatamente as mesmas casas e tempos
  const parsed = parseTab(text, bases.length);
  let t = 0;
  const sounding = grid.map(g => { const at = t; t += g.dur; return { ...g, at }; }).filter(g => g.frets.some(f => f >= 0));
  if (parsed.error || parsed.events.length !== sounding.length || parsed.steps !== t
    || parsed.events.some((e, i) => e.frets.join() !== sounding[i].frets.join() || e.step !== sounding[i].at)) {
    throw new Error(`${instId}/${songId}: o texto gerado não confere (${parsed.error || parsed.events.length + ' eventos'})`);
  }
  result.push({ id: `${instId}-${songId}`, name: opt.name || song.name, author: song.author, key: song.key, original: song.original,
    instrument: instId, tuning: tunId, bpm: song.bpm, unit, text });
  console.log(`${instId.padEnd(8)} ${tunId.padEnd(10)} ${song.name}: ${parsed.events.length} notas, casa máx. ${Math.max(...grid.flatMap(g => g.frets))}`);
}

writeFileSync(OUT, `// songs.js — GERADO por tools/gen-songs.mjs (não edite à mão). Músicas em domínio público para estudar.
// key = tom; original = tom original da obra (false: melodia tradicional sem tom fixo, no tom de costume).
export const SONG_TABS = ${JSON.stringify(result, null, 2)};
`);
console.log(`\n${result.length} tablaturas → js/songs.js`);
