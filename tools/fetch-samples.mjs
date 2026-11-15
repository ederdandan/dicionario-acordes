// fetch-samples.mjs — baixa as amostras de notas usadas pelo audio.js (rodar com: node tools/fetch-samples.mjs).
// Uma nota a cada 3 semitons (Dó, Mi♭, Sol♭, Lá); o app reafina as intermediárias (no máximo ±1,5 semitom).
// Fontes e licenças: samples/CREDITOS.md. A percussão é gerada por tools/build-percussion.mjs.
import { mkdir, writeFile } from 'node:fs/promises';

const FLUID = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM';
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const name = m => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
const SETS = {
  // pasta local: [URL da nota MIDI m, MIDI mais grave, MIDI mais agudo, segundos a manter (0 = arquivo inteiro)]
  nylon: [m => `${FLUID}/acoustic_guitar_nylon-mp3/${name(m)}.mp3`, 39, 84, 0], // violão (FluidR3_GM, CC BY 3.0)
  aco: [m => `${FLUID}/acoustic_guitar_steel-mp3/${name(m)}.mp3`, 39, 84, 0],   // viola caipira (cordas de aço)
  baixo: [m => `${FLUID}/acoustic_bass-mp3/${name(m)}.mp3`, 33, 60, 0],         // baixo do acompanhamento
  // ukulele de verdade: pacote "Ukulele" de iainmccurdy no Freesound (CC BY 4.0), som nº 697000 + MIDI (C4…A5)
  ukulele: [m => `https://cdn.freesound.org/previews/697/${697000 + m}_3655844-hq.mp3`, 60, 81, 3.5],
};

/** Corta um MP3 (MPEG-1 camada III) em quadros inteiros, sem recodificar: mantém os primeiros `secs` segundos. */
export function cutMp3(buf, secs) {
  let i = 0;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) i = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
  const start = i, BR = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], SR = [44100, 48000, 32000];
  let t = 0;
  while (i + 4 <= buf.length && t < secs) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const br = BR[buf[i + 2] >> 4], sr = SR[(buf[i + 2] >> 2) & 3];
    if (!br || !sr) { i++; continue; }
    i += Math.floor((144000 * br) / sr) + ((buf[i + 2] >> 1) & 1);
    t += 1152 / sr;
  }
  return buf.subarray(start, Math.min(i, buf.length));
}

for (const [dir, [url, lo, hi, secs]] of Object.entries(SETS)) {
  await mkdir(new URL(`../samples/${dir}/`, import.meta.url), { recursive: true });
  for (let m = lo; m <= hi; m++) {
    if (m % 3) continue;
    const res = await fetch(url(m));
    if (!res.ok) throw new Error(`${dir} ${name(m)}: HTTP ${res.status}`);
    let data = Buffer.from(await res.arrayBuffer());
    if (secs) data = cutMp3(data, secs);
    await writeFile(new URL(`../samples/${dir}/${m}.mp3`, import.meta.url), data);
    console.log(dir, m, name(m), `${(data.length / 1024).toFixed(0)} KB`);
  }
}
