# Créditos das amostras de áudio

Todas as gravações desta pasta são de bancos livres. As licenças CC BY pedem só o crédito, que está abaixo;
as CC0 são domínio público.

## Notas (violão, viola, ukulele, baixo)

| Pasta | Fonte | Licença | Usado como |
|---|---|---|---|
| `nylon/` | **FluidR3_GM** (Frank Wen) — Acoustic Guitar (nylon), via [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | violão |
| `aco/` | **FluidR3_GM** — Acoustic Guitar (steel) | CC BY 3.0 | viola caipira (pares de cordas; não há gravação livre de viola caipira) |
| `baixo/` | **FluidR3_GM** — Acoustic Bass | CC BY 3.0 | baixo do acompanhamento |
| `ukulele/` | **“Ukulele”, de iainmccurdy** no Freesound ([pacote 38906](https://freesound.org/people/iainmccurdy/packs/38906/)) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | ukulele (cortado em 3,5 s) |

Arquivos nomeados pelo número MIDI da nota (60 = Dó central), uma nota a cada 3 semitons; o app reafina as
intermediárias. Para baixar de novo: `node tools/fetch-samples.mjs`.

## Percussão (`percussao/`)

Golpes recortados, normalizados e convertidos para WAV mono 32 kHz por `node tools/build-percussion.mjs`
(`<peça>-forte.wav` = golpe principal, `<peça>-leve.wav` = golpe leve ou secundário).

| Peça | Fonte | Licença |
|---|---|---|
| bumbo | “Big Rock Bass Drum 24in One Shot”, de lennartgreen ([Freesound 860524](https://freesound.org/s/860524/)) | CC0 |
| caixa, chimbal, ganzá (chocalho), agogô, conga, palmas, clave, triângulo; surdo (bumbo sinfônico); bacalhau da zabumba (aro de tom) | **VCSL — Versilian Community Sample Library**, de Versilian Studios ([sgossner/VCSL](https://github.com/sgossner/VCSL)) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| zabumba (golpe grave) | “Alfaia Hit (combined)”, de Sassaby ([Freesound 511275](https://freesound.org/s/511275/)) | CC0 |
| pandeiro | “pandeiro_low” e “pandeiro_plat_01”, de Paulo Gonçalves ([Freesound 182567](https://freesound.org/s/182567/), [182566](https://freesound.org/s/182566/)) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| tamborim | “tamborim A2 collection”, de MeanRaccoon ([Freesound 844753](https://freesound.org/s/844753/)) | CC0 |
