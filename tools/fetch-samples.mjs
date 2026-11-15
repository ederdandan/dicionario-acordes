// fetch-samples.mjs — baixa as amostras gravadas usadas pelo audio.js (rodar com: node tools/fetch-samples.mjs).
// Fonte: FluidR3_GM (Frank Wen), convertido em MP3 por gleitz/midi-js-soundfonts — licença CC BY 3.0.
// Uma nota a cada 3 semitons (Dó, Mi♭, Sol♭, Lá); o app reafina as notas intermediárias (no máximo ±1,5 semitom).
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM';
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SETS = {
  // pasta local: [instrumento no FluidR3, MIDI mais grave, MIDI mais agudo]
  nylon: ['acoustic_guitar_nylon', 39, 84], // violão e ukulele (E2 … C6)
  aco: ['acoustic_guitar_steel', 39, 84],   // viola caipira (cordas de aço)
  baixo: ['acoustic_bass', 33, 60],         // baixo do acompanhamento
};
const name = m => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

for (const [dir, [inst, lo, hi]] of Object.entries(SETS)) {
  await mkdir(new URL(`../samples/${dir}/`, import.meta.url), { recursive: true });
  for (let m = lo; m <= hi; m++) {
    if (m % 3) continue;
    const res = await fetch(`${BASE}/${inst}-mp3/${name(m)}.mp3`);
    if (!res.ok) throw new Error(`${inst} ${name(m)}: HTTP ${res.status}`);
    await writeFile(new URL(`../samples/${dir}/${m}.mp3`, import.meta.url), Buffer.from(await res.arrayBuffer()));
    console.log(dir, m, name(m));
  }
}
