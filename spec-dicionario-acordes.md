# Especificação — Dicionário Universal de Acordes (Violão, Viola Caipira & Ukulele)

**Hospedagem:** GitHub Pages (subdiretório ou domínio raiz) · **Arquitetura:** PWA offline-first, SPA em HTML5/CSS3/JS (ES Modules), **sem build, sem CDN, sem backend**.

> ## 🤖 Como usar este documento (para a IA)
> O projeto é implementado **em fases, uma por sessão**. Em cada sessão:
> 1. Leia a seção **0. Status** para saber a fase atual.
> 2. Leia **apenas** as seções 1–3 (regras gerais) e a seção da fase pedida. Não leia arquivos de código fora da lista "Arquivos" da fase, salvo para importar APIs já existentes (veja os contratos na seção 3).
> 3. Implemente, valide pelos **Critérios de aceite** e marque a fase como concluída na seção 0 (com data e notas curtas de desvios/decisões).

---

## 0. Status

| Fase | Descrição | Status | Notas |
|---|---|---|---|
| 1 | MVP Violão: teoria, parser, gerador, diagrama, busca | ✅ concluída (2026-11-13) | 32/32 testes; geração completa ~0,7 s. Decisões: 9ª omissível em `11`/`m11`/`13`/`m13` (senão inviável com 4 dedos); `7alt` exige 1-3-7b + ≥2 de {b9,#9,b13}; tônica omissível só em inversões com ≥4 notas, e fallback "sem tônica" se nada for achado; abertura = maior−menor casa ≤ 3; ranking ganha desempate +0,5 por corda muda; corda muda entre pestana impede pestana; `chordNotes` retorna extras (`bassPc`, `rootPc`, `alt`, `nameOf`) e `Voicing` tem extras (`courseNotes`, `rows`, `cost`, `nick`, `symbol`); curated (30 acordes do protótipo + `Bm`) aceita rótulo opcional `l`. Seção "5.3" citada no contrato não existe — usada a 1.4.4. |
| 2 | Viola Caipira (4 afinações) + Ukulele | ✅ concluída (2026-11-13) | 50/50 testes (rodados via Node com DOM simulado). Rio Abaixo confirmado (G D G B D, fonte USP); Boiadeira **não** confirmada em fonte — mantida a tabela. **Gerador alterado** (só regra de baixo e custo, via dados do instrumento): `bass: 'pitch'` (violão, inalterado), `'course'` (viola: baixo = par mais grave tocado; acorde sem barra aceita também a 5ª no baixo, com custo +1 — senão `E` = 00000 no Cebolão em Mi seria E/B e inválido), `'free'` (ukulele: só acordes com barra exigem o baixo na corda mais grossa tocada); `muteCost` por instrumento (violão 0,5, viola 2, ukulele 4) para não favorecer cordas abafadas. Curated: 18 shapes de ukulele. Diagrama: legenda do par (nº + `8ª` oitavado / `=` uníssono); seletor de afinação só aparece com >1 afinação. Mensagem vazia: "Sem posição viável…". |
| 3 | Sintetizador de áudio | ✅ concluída (2026-11-13) | 62/62 testes (Chrome headless via DevTools Protocol). Karplus-Strong calculado em JS (`ksSamples`, função pura) e tocado como `AudioBuffer` (cache LRU de 160 buffers) — sem laço de realimentação no grafo; cada nota = `BufferSource` + `Gain`, desconectados no `ended`. Re-tocar uma corda abafa a anterior; teto de 48 vozes. Desafinação da 2ª corda do par é fixa por par (±3 cents, determinística → cacheável). Ganho normalizado por √(6/nº de vozes); master = compressor + soft-clip tanh (pico ≤ 0,99 no teste de estresse). `renderDiagram` ganhou a opção `onString(i)`: áreas clicáveis/focáveis (Enter/Espaço) por corda tocada, e o SVG passa a `role="group"`. Vazamento verificado com `OfflineAudioContext` (headless não tem saída de áudio em tempo real). **Correção (2026-11-14):** o áudio era desbloqueado no `pointerdown`, que em tela de toque não conta como gesto (o contexto nascia suspenso); agora usa `touchend`/`click`/`keydown`, retoma também o estado `interrupted` do iOS e põe a sessão em `playback` (`navigator.audioSession`, ou `<audio>` silencioso em iOS antigos) para tocar mesmo com a chave de silencioso. Verificado com um analisador na saída: pico ≈ 0,93 já no 1º toque. |
| 4 | PWA (manifest, service worker, instalação) | ✅ concluída (2026-11-14) | Verificado em Chrome headless via DevTools Protocol, servido de `/dicionario-acordes/`: `Page.getInstallabilityErrors` vazio (o Lighthouse atual não tem mais a categoria PWA); offline real (servidor desligado) recarrega, busca, gera e toca áudio; trocar `CACHE_NAME` mostra o aviso e "Atualizar" troca o SW e apaga o cache antigo. Ícones gerados por `tools/gen-icons.mjs` (PNG em Node puro, sem dependências). SW: `tests.html` sempre da rede; páginas fora do pré-cache entram no cache na 1ª visita. Instalar: botão via `beforeinstallprompt`; no iOS abre um `<dialog>` com as instruções. |
| 5 | Extras: favoritos, progressões, canhoto, tema, URL, reverso | ✅ concluída (2026-11-14) | 100/100 testes em `tests.html` + 20/20 verificações E2E. Tudo num único item do localStorage (`dicionario-acordes:v1`); o favorito guarda as casas (posição reencontrada pelas casas, índice como reserva). Importar **mescla** por id (não apaga o que já existe). Rota: `#/instrumento[/afinação]/acorde/posição`, afinação omitida quando é a padrão (`#/violao/C7M/2`, `#/viola/rioAbaixo/G%2FB/2`); estado vindo da URL usa `replaceState`, mudanças do usuário usam `pushState`. Tema: botão alterna automático → claro → escuro. Reverso: `identifyChord(frets, inst, tun)` em `voicings.js` usa `checkShape` (ganhou a opção `span: false`) e a regra de baixo do instrumento; ordena por tônica no baixo, depois menos notas omitidas, depois ordem de `CHORD_TYPES`; teste extra: reconhece a 1ª posição de todos os tipos × 12 tônicas em todos os instrumentos. `diagram.js` ganhou `renderEditor` (braço clicável). **Ajustes de UX para celular (2026-11-14):** abaixo de 860 px, barra de abas inferior (Acordes · Repertório · Identificar) e diagrama antes do seletor, com rolagem de volta ao diagrama ao escolher um tipo; deslizar no diagrama troca a posição; **modo palco** em tela cheia (próximo acorde, botões grandes, deslizar, pedaleira Bluetooth via setas/PageUp/PageDown, tela sempre acesa com Wake Lock, o “voltar” do Android fecha o palco sem desfazer o acorde); alvos de toque ≥ 44 px em telas de toque; abas de tipo e miniaturas em faixas horizontais; áreas seguras do iPhone; aviso rápido ao favoritar/salvar. Desktop inalterado. |
| 6a | Tablatura em texto: play com BPM, destaque sincronizado, salvar | 🟡 implementada (2026-11-14) — validação manual pendente | Agendador com lookahead no relógio do AudioContext; destaque compensa latência; passo = 1/8 ou 1/16; tabs no backup. Anotações no meio da linha ((E), PM, `[1]` no fim) são ignoradas sem desalinhar; as que são cifra (`A`, `E7`, `G/B`) viram evento de acorde destacado e, com “Tocar acordes das anotações” (ligado por padrão), soam na 1ª posição do instrumento/afinação escolhidos (batida rápida, volume 0,6). **Técnicas (2026-11-14):** ligados (h/p/t, slide, bend/release) mudam o `playbackRate` da voz que já soa, sem novo ataque (rampa de até 0,12 s no slide e 0,25 s no bend, limitada pelo tempo até a próxima nota); sem nota anterior viram ataque suave (slide de entrada parte de 2 casas antes). Vibrato = oscilador 5,5 Hz no `playbackRate`; PM abafa em 0,14 s; `x` = ataque curto da corda solta; harmônicos pela tabela 12/7/5/4… → semitons. Legenda "Símbolos que o player entende" na tela e dica por nota. A grade (6b) descarta as técnicas na 1ª edição. Testes novos verificados no Node (Chrome headless bloqueado nesta sessão). |
| 6b | Editor de tablatura em grade, braço sincronizado, modo estudo | 🟡 implementada (2026-11-14) — validação manual pendente | 115/115 testes + 14 verificações E2E (Chrome headless). O **texto continua sendo o formato salvo**: a grade (`eventsToGrid`/`gridToText`/`gridStarts`/`tabLabels` em `tab.js`, puras) lê o texto e, a cada edição, regrava o texto com barra a cada compasso de 4 tempos (16 passos em 1/16, 8 em 1/8) e 2 compassos por sistema; anotações do texto somem na 1ª edição pela grade. Coluna = instante; duração em passos (1–16); número de 2 dígitos ocupa 2 passos se a duração for 1. Entrada: teclado físico (dois dígitos em 1,2 s → 10–24; setas, Delete, `+`/`-`) ou teclado na tela (0–12, 15, 17, ⌫). “Inserir acorde” usa a posição atual do dicionário (ou a 1ª gerada, se o instrumento da tablatura for outro). Braço horizontal (`renderFretboard` em `diagram.js`) mostra as casas do evento que soa/selecionado. Estudo: velocidade 50–100% (multiplica o passo), A–B por evento (marca no ponto selecionado/tocando, sempre em laço, emendado no tempo), contagem de entrada de 4 cliques (`scheduleClick` em `audio.js`). Duplo clique na grade toca dali. |
| 6c | Importar MusicXML | 🟡 implementada (2026-11-14) — validação manual pendente | 123/123 testes + 7 verificações E2E. Novo módulo `js/musicxml.js`: `parseMusicXML(texto)` (DOMParser; `score-partwise`; `<chord/>`, pausas, `<backup>`/`<forward>` de várias vozes, ligaduras sem novo ataque, ornamentos ignorados, andamento de `<sound tempo>`, afinação de `<staff-tuning>`), `matchInstrument` (afinação exata → mesmas classes de nota → nº de cordas), `partToGrid` (pura → colunas da grade da 6b; passo de 1/16, ou 1/8 se nada cair em semicolcheia; barras pela fórmula de compasso) e `unzipMXL` (.mxl: ZIP lido à mão + `DecompressionStream('deflate-raw')`). O resultado vira texto da 6a (o que se salva). **Desvio:** parte sem `<technical>` (partitura comum) também é importada, com a casa mais baixa possível por altura no instrumento escolhido (recalcula ao trocar o instrumento); notas fora do alcance são contadas e avisadas. Com várias partes, aparece o seletor “Parte do MusicXML” (prefere a 1ª com tablatura). Quiálteras são arredondadas para a semicolcheia; `score-timewise` é recusado com mensagem. |
| 7 | Melhorias de UX (7a cabeçalho/ajustes · 7b seletor acima do diagrama · 7c correções rápidas · 7d tablatura em Biblioteca/Player/Editar · 7e abas no desktop) | ⬜ pendente | Backlog da análise de UX de 2026-11-14; detalhes e aceite na seção da Fase 7. Ordem sugerida: 7a+7c juntos, depois 7b, 7d, 7e. |

---

## 1. Regras gerais (valem para todas as fases)
- **Caminhos relativos** sempre (`./js/app.js`, `./sw.js`) — deve funcionar em `usuario.github.io/repo/`.
- **Sem Tailwind/CDN/dependências externas.** CSS próprio com variáveis CSS (`--bg`, `--fg`, `--accent`…), já preparado para tema claro/escuro.
- **ES Modules** (`<script type="module">`), um módulo por responsabilidade, arquivos pequenos. Funções puras em `theory/parser/voicings` (sem acesso ao DOM) para facilitar testes.
- Interface em **português**. Mobile-first, responsivo.
- Acessibilidade: SVG com `role="img"` e `aria-label` descritivo; controles navegáveis por teclado.
- Testes: `tests.html` que importa os módulos e roda as asserções dos critérios de aceite no console/tela (sem framework).

## 2. Estrutura de arquivos
```text
/
├── index.html            # Marcação da interface
├── tests.html            # Testes dos critérios de aceite
├── css/app.css
├── js/
│   ├── app.js            # Orquestra UI, estado e eventos
│   ├── theory.js         # Notas, intervalos, fórmulas, grafia enarmônica
│   ├── parser.js         # Cifra/texto → objeto de acorde
│   ├── instruments.js    # Instrumentos e afinações (dados)
│   ├── voicings.js       # Gerador + ranking de posições
│   ├── curated.js        # Pequena base de shapes tradicionais (overrides)
│   ├── diagram.js        # Renderização SVG
│   ├── audio.js          # (Fase 3) Sintetizador
│   ├── storage.js        # (Fase 5) localStorage, import/export
│   └── tab.js            # (Fase 6) Parser de tablatura (funções puras)
├── icons/                # (Fase 4) icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png
├── tools/gen-icons.mjs   # (Fase 4) gera os ícones PNG (node tools/gen-icons.mjs)
├── manifest.json         # (Fase 4)
├── sw.js                 # (Fase 4)
└── README.md
```

## 3. Contratos entre módulos (manter estáveis)
```js
// parser.js
parseChord(texto) → { root: 'C', quality: 'm7', bass: 'G'|null, symbol: 'Cm7/G' } | null
// theory.js
chordNotes(chord) → { pcs: [0,3,7,10], names: ['Dó','Mib','Sol','Sib'], formula: ['1','3b','5','7b'],
                      required: [...pcs], optional: [...pcs] }   // optional = omissíveis (ver 5.3)
noteName(pc, contexto) → 'Sib'           // grafia correta conforme tônica/intervalo
// instruments.js
INSTRUMENTS[id] = { id, name, strings: n, tunings: { [tid]: { name, courses: [{ label, notes: ['B2','B3'] }] } } }
// voicings.js
getVoicings(chord, instrumentId, tuningId, { max: 8 }) → Voicing[]
Voicing = { frets: [-1,3,2,0,1,0],   // -1 = não tocada, 0 = solta; ordem: corda mais grossa → mais fina
            fingers: [0,3,2,0,1,0],   // 0 = sem dedo
            baseFret: 1, barres: [{ fret: 1, from: 0, to: 5, finger: 1 }],
            notes: ['Dó','Mi','Sol','Dó','Mi'], label: 'Posição aberta' }
// diagram.js
renderDiagram(voicing, instrument, tuning, { leftHanded: false }) → SVGElement
```

---

## Fase 1 — MVP Violão
**Arquivos:** `index.html`, `tests.html`, `css/app.css`, `js/{app,theory,parser,instruments,voicings,curated,diagram}.js`, `README.md`.

> **Referência opcional:** se existir `referencia/gemini.html` (protótipo anterior), **não leia o arquivo inteiro**. Use grep para achar só a base de acordes ou o motor, converta para o formato do `curated.js`, ou aproveite a lógica, e passe tudo pela validação automática abaixo. A interface do protótipo é descartada.

### 1.1 Violão
Afinação padrão `E2 A2 D3 G3 B3 E4` (6 colunas).

### 1.2 Teoria e grafia
- 12 classes de altura; nomes em português (`Dó Ré Mi Fá Sol Lá Si`, com `#`/`b`).
- **Grafia enarmônica:** cada nota é grafada pelo intervalo em relação à tônica (7ª menor de C = `Sib`, não `Lá#`; 3ª de E = `Sol#`). Tônicas preferenciais: `C C# Db D Eb E F F# Gb G Ab A Bb B` (respeitar a que o usuário digitou).

### 1.3 Parser
- Tônicas com `#`/`b` e por extenso em PT (`Dó menor`, `Fá#m7`, `Si bemol maior`).
- **Tipos suportados (com fórmulas):**
  - Tríades: `M`(vazio) `m` `5` `sus2` `sus4` `dim` `aug`
  - Tétrades: `7` `7M` `m7` `m(7M)` `6` `m6` `dim7` `m7(b5)` `7sus4`
  - Extensões: `add9` `9` `7M(9)` `m9` `6/9` `11` `m11` `13` `7M(13)` `m13`
  - Alterados: `7(b5)` `7(#5)` `7(b9)` `7(#9)` `7(#11)` `7(b13)` `7alt` (= 1 3 7b b9 #9 b13, 5ª omitida)
  - Inversões / baixo alternativo: `X/Y` (`G/B`, `D/F#`, `Am/G`)
- **Aliases:** `maj7 Δ 7+`→`7M`; `-`→`m`; `°`→`dim`; `ø m7b5`→`m7(b5)`; `+`→`aug`; parênteses opcionais (`7b9` = `7(b9)`); `maj`/`M` = maior.

### 1.4 Gerador de posições (`voicings.js`)
Busca algorítmica em todo o braço (casas 0–12):
1. Para cada janela de casas, gera combinações (cada corda: muda, solta ou casa na janela).
2. **Validação:** abertura máxima de 4 casas (desconsiderando soltas); no máximo 4 dedos, contando uma pestana como 1 dedo; todas as notas de `required` presentes; nenhuma nota fora do acorde.
3. **Baixo:** a nota mais grave que soa deve ser a tônica, ou o `bass` se houver barra. Para inversões, isso é obrigatório.
4. **Notas omissíveis** quando faltar corda, nesta ordem: 5ª justa → tônica (só se houver ≥ 4 notas e o baixo não for exigido) → 11ª no acorde `13`. Nunca omitir 3ª, 7ª ou a extensão/alteração que dá nome ao acorde.
5. **Dedos:** atribuídos da casa mais grave para a mais aguda (1→4). Há pestana quando o dedo 1 cobre a menor casa usada em ≥ 2 cordas e não existe corda solta entre elas.
6. **Ranking (menor custo primeiro):** abertura entre casas + casa base + cordas mudas no meio do acorde (penalidade alta) + dedos usados − cordas soltas. Remover duplicatas e retornar até 8.
7. **Base curada** (`curated.js`): poucos shapes tradicionais por instrumento/afinação (formas abertas clássicas). Quando existir, entra em primeiro lugar, deduplicada com os gerados.
8. **Rótulos:** "Posição aberta" / "Pestana na Nª" / "Região da Nª casa".
9. Memoizar resultados por `(acorde, instrumento, afinação)`.

### 1.5 Diagrama SVG (`diagram.js`), em `viewBox` responsivo
1. Um círculo vazado acima da pestana para cada corda/par: **`X` dentro** = não tocada; **limpo** = solta.
2. `baseFret === 1`: barra preta espessa (nut). `baseFret > 1`: linha simples e indicador `Nª` à esquerda da primeira casa.
3. Grade com 4 casas visíveis (5 se a posição exigir).
4. Dedos: círculo preto sólido com número branco em negrito; pestana como barra arredondada com o número do dedo.
5. Legenda inferior: nota de cada corda/par; na viola, também `5º … 1º`.
6. Cores via variáveis CSS (tema claro/escuro).

### 1.6 Interface
- Busca com autocomplete em tempo real (sugestões a partir do parser + lista de tipos).
- Grade de tônicas (`C` a `B`) + abas: *Básicos*, *Sétimas & Sextas*, *Nonas/11ª/13ª*, *Alterados & Diminutos*, *Inversões*.
- Diagrama principal + seletor de posições (setas e miniaturas, "Posição 2/8").
- Painel de análise: notas em PT, fórmula (`1 - 3 - 5 - 7b`) e tabela corda a corda (corda, casa, dedo, nota).

### ✅ Critérios de aceite (em `tests.html`)
Notação de casas: corda mais grossa → mais fina, `x` = muda.
- Parser: `Fá#m7`→`F#m7`; `Dó menor`→`Cm`; `Bbmaj7`→`Bb7M`; `G7b9`→`G7(b9)`; `D/F#` com `bass='F#'`; `xyz`→`null`.
- Notas: `C7` = Dó Mi Sol Sib; `E` = Mi Sol# Si; `Bb7M` = Sib Ré Fá Lá.
- A 1ª posição do violão deve ser: `C` x32010 · `G` 320003 ou 320033 · `D` xx0232 · `Am` x02210 · `E` 022100 · `F` 133211 (pestana na 1ª casa) · `Bm` x24432 (pestana na 2ª).
- `G/B`: a nota mais grave é Si em todas as posições.
- `C13`: todas as posições têm 3ª, 7b e 13ª.
- Todos os tipos × 12 tônicas retornam ≥ 1 posição no violão, e a geração completa leva < 2 s.
- **Validação automática do `curated.js`** (pode ter sido gerado por IA externa): cada shape precisa conter as notas `required`, não ter notas estranhas, ter o baixo correto e abertura ≤ 4 casas. Shapes inválidos são **descartados com aviso no console** e listados em `tests.html`. Formato: `{ "violao/padrao": { "C": [{ "f": "x-3-2-0-1-0", "d": "0-3-2-0-1-0" }] } }` (`f` = casas, corda grossa → fina, `x` = muda; `d` = dedos, opcional).

---

## Fase 2 — Viola Caipira e Ukulele
**Arquivos:** `js/instruments.js`, `js/curated.js`, `js/diagram.js` (legenda de pares), `js/app.js` (seletores), `tests.html`. O gerador deve funcionar **sem mudanças**, só com dados novos. Se precisar mexer nele, registre a mudança em Notas.

### 2.1 Viola Caipira: 10 cordas / 5 pares (5 colunas, do 5º ao 1º par)
A nota de cada corda do par está listada abaixo. Nos pares 5º, 4º e 3º, as cordas são oitavadas; nos pares 2º e 1º, uníssonas.

| Afinação | 5º par | 4º par | 3º par | 2º par | 1º par |
|---|---|---|---|---|---|
| Cebolão em Mi | B2+B3 | E3+E4 | G#3+G#4 | B3+B3 | E4+E4 |
| Cebolão em Ré | A2+A3 | D3+D4 | F#3+F#4 | A3+A3 | D4+D4 |
| Rio Abaixo (Sol) | G2+G3 | D3+D4 | G3+G4 | B3+B3 | D4+D4 |
| Boiadeira | G2+G3 | D3+D4 | A3+A4 | D4+D4 | F#4+F#4 |

> ⚠️ Confirmar Rio Abaixo e Boiadeira com uma fonte confiável antes de fechar a fase (há variantes regionais). Ajuste só a tabela se necessário. O protótipo `referencia/gemini.html` concorda com as notas, mas põe os pares 2º e 1º **uma oitava acima** (B4, E5). Ignore isso: vale a tabela acima.

- **Baixo na viola:** o "baixo" é a nota grave do **par mais grave tocado** (no sentido 5º → 1º). A oitava aguda dos pares oitavados não conta para definir inversão.
- Seletor rápido de afinação (4 botões).

### 2.2 Ukulele: afinação High-G reentrante `G4 C4 E4 A4` (4 colunas)
- **Baixo no ukulele:** usa a **ordem das cordas** (4ª corda = "baixo" visual), não a nota mais grave, porque a nota mais grave é o C4. Inversões são aceitas se a nota pedida estiver na corda mais grossa tocada.
- Com 4 cordas, a omissão de notas da seção 1.4 é essencial (ex.: `C13` = C/E, Bb e A).

### ✅ Critérios de aceite
- Ao trocar de instrumento ou afinação, o diagrama, a legenda e as posições são recalculados.
- Cebolão em Mi: `E` = 00000 (tudo solto) na 1ª posição. Cebolão em Ré: `D` = 00000. Rio Abaixo: `G` = 00000.
- Ukulele: `C` 0003 · `G` 0232 · `Am` 2000 · `F` 2010 · `G7` 0212.
- Todos os tipos × 12 tônicas retornam ≥ 1 posição em cada instrumento e afinação. Se algum acorde for impossível, mostrar a mensagem "sem posição viável".

---

## Fase 3 — Sintetizador de Áudio (Web Audio API, sem arquivos de áudio)
**Arquivos:** `js/audio.js`, `js/app.js` (botões), `js/diagram.js` (clique na corda).
- Síntese **Karplus-Strong** (ruído em buffer + delay com filtro passa-baixa) para som de corda dedilhada.
- **Modos:** Dedilhar (arpejo, ~65 ms entre cordas, do grave ao agudo) · Batida (~18 ms) · Clique em uma corda/círculo do diagrama para ouvi-la sozinha.
- **Timbres:**
  - Violão: quente, decaimento longo, passa-baixa mais fechado.
  - Viola: toca as **2 cordas de cada par** (oitavas/uníssonos da tabela 2.1), com micro-atraso de ~8 ms e leve desafinação (±3 cents) para o coro metálico; timbre mais brilhante.
  - Ukulele: nylon, decaimento curto e percussivo; respeitar o reentrante (G4 mais agudo que C4).
- Criar e retomar o `AudioContext` **só após um gesto do usuário**. Limitador/compressor no master para evitar clipping.
- Aviso discreto na interface: "No iPhone, desative o modo silencioso para ouvir".

### ✅ Critérios de aceite
- Sem erros no console. As três formas de tocar funcionam nos três instrumentos.
- Na viola, cada par aciona 2 vozes. No ukulele, a corda G soa acima da C.
- Tocar várias vezes seguidas não acumula nós de áudio (vazamento).

---

## Fase 4 — PWA
**Arquivos:** `manifest.json`, `sw.js`, `icons/*`, `index.html` (links/meta), `js/app.js` (instalação/atualização).
- **manifest:** `display: "standalone"`, `start_url: "./index.html"`, `scope: "./"`, `name`, `short_name`, `theme_color`, `background_color`, `lang: "pt-BR"`. Ícones **PNG** 192 e 512 com `purpose: "any"`, e um 512 separado com `purpose: "maskable"`. Gerar os ícones com um script local ou como SVG convertido.
- iOS: `apple-touch-icon` 180 px e metas `apple-mobile-web-app-*`.
- **sw.js:** `CACHE_NAME` versionado; pré-cache de todos os arquivos estáticos (lista explícita) no `install`; limpeza de caches antigos no `activate`; **cache-first** para assets; **network-first com fallback ao cache** para o `index.html` (para receber atualizações).
- **Atualização:** quando houver um SW novo em espera, mostrar o aviso "Nova versão disponível — Atualizar", que envia `skipWaiting` e recarrega a página.
- **Instalação:** botão que captura `beforeinstallprompt`; no iOS/Safari, mostrar instruções visuais ("Compartilhar → Adicionar à Tela de Início").

### ✅ Critérios de aceite
- Lighthouse PWA "installable" OK. Com o DevTools em *Offline*, o app recarrega e funciona por completo (incluindo áudio).
- Funciona servido de um subdiretório (`python -m http.server` na pasta-pai, acessando `/dicionario-acordes/`).
- Alterar `CACHE_NAME` faz o aviso de atualização aparecer.

---

## Fase 5 — Extras de estudo e palco
**Arquivos:** `js/storage.js`, `js/app.js`, `js/diagram.js`, `css/app.css`, `js/voicings.js` (identificação reversa).
1. **Favoritos:** salvar acorde, instrumento, afinação e posição. Persistir no `localStorage` dentro de `try/catch`.
2. **Progressões/Repertório:** criar sequências (ex.: `C7M → A7 → Dm7 → G7(b9)`) e navegar em modo ensaio (anterior/próximo, tocar). Também guardadas no `localStorage`.
3. **Exportar/Importar** favoritos e progressões em JSON (backup).
4. **Modo Canhoto:** espelha **só a geometria** (grade, dedos, círculos). Textos, números e legenda continuam legíveis.
5. **Tema claro/escuro:** segue `prefers-color-scheme` por padrão, com alternância manual persistida.
6. **Rota na URL (hash):** `#/violao/C7M/2` (instrumento/afinação, acorde, posição) para compartilhar links; o botão voltar do navegador funciona.
7. **Identificador reverso:** braço vazio clicável (alternar solta/muda/casa). Retorna os nomes possíveis ordenados (fundamental no baixo primeiro, depois menos notas omitidas), por exemplo `x32010` → `C`; `x02010` → `Am7` / `C6/A`.

### ✅ Critérios de aceite
- Favoritos e progressões sobrevivem a um recarregamento, e exportar → limpar → importar restaura tudo.
- Com o modo canhoto ativo, os textos não aparecem espelhados.
- Abrir uma URL com hash restaura exatamente o estado.
- O reverso identifica corretamente os shapes listados nos critérios das Fases 1 e 2.

---

## Fase 6 — Tablatura
### 6a — Tablatura em texto
**Arquivos:** `js/tab.js` (novo, puro), `js/audio.js` (agendamento), `js/storage.js`, `js/app.js`, `index.html`, `css/app.css`, `sw.js`, `tests.html`.
- **Entrada:** texto ASCII colado/digitado, um bloco por sistema (linhas separadas por linha em branco). Linha de cima = corda mais aguda. Rótulo opcional antes do 1º `|` (`e|`, `B|`). O bloco deve ter tantas linhas quanto cordas/pares do instrumento escolhido; senão, erro claro.
- **Tempo:** cada caractere (exceto `|`) = 1 passo; o passo vale 1/8 ou 1/16 de tempo (escolha do usuário) no BPM informado (40–240). Números de 2 dígitos (`10`, `12`) são uma nota só. Técnicas contam como tempo **e soam** (ver nota da 6a no Status): `h p t` ligado, `/ \ s` slide, `b ^` bend (`7b9`; `7b` = 1 tom), `r` release, `~` vibrato, `(5)` fantasma, `<12>` harmônico natural, `x` abafada (percussiva), linha `PM----`/`let ring` acima ou abaixo do bloco. Evento ganha `fx: [null|Fx por corda]` e o resultado ganha `techniques`.
- **Contrato:** `parseTab(texto, nCordas) → { blocks: [{ lines: [string], notes: [{ course, fret, line, col, len, ev }] }], events: [{ step, block, frets: number[] }], steps } | { error }`.
- **Reprodução:** o instrumento e a afinação são escolhidos no módulo. O agendador olha uma janela à frente no relógio do Web Audio (sem temporizador acumulando atraso). Parar abafa tudo. Opção de repetir.
- **Destaque:** a cada quadro, compara o relógio do áudio (descontando `outputLatency`) com o horário de cada evento: a nota que soa fica acesa, as já tocadas ficam marcadas e a rolagem acompanha. Tocar num número começa dali.
- **Salvar:** tablaturas (nome, texto, instrumento, afinação, BPM, unidade) no `storage.js`, entrando no backup JSON.
- **Celular:** nova aba "Tablatura" na barra inferior; tablatura com rolagem horizontal própria.

#### ✅ Critérios de aceite
- `parseTab` lê o exemplo de 6 linhas com `|` e números de 2 dígitos; rejeita bloco com nº de linhas errado.
- Tocar o exemplo produz som e o destaque passa por todas as notas em ordem; ao parar, nenhuma voz fica ativa.
- Tablaturas salvas sobrevivem a recarregar e ao ciclo exportar → limpar → importar.

### 6b — Editor em grade e estudo
Grade de toque (cordas × colunas, teclado numérico de casas, duração por coluna, inserir acorde do dicionário), braço do instrumento sincronizado com a reprodução, velocidade de estudo (50–100%), repetição A–B e contagem de entrada.

### 6c — Importar MusicXML
Ler partes com `<technical><string>/<fret>` e durações, convertendo para o modelo da 6a/6b.

---

## Fase 7 — Melhorias de UX (backlog da análise de 2026-11-14)
Origem: análise de usabilidade feita com capturas reais (celular 390 px nas 4 abas e desktop 1366 px). Ensaio e modo Palco **não** foram avaliados (ficaram de fora das capturas). Diagnóstico geral: cada recurso virou mais um bloco numa página que só cresce; no celular isso obriga a rolar muito para tarefas básicas, e no desktop vira uma página única muito longa.
**Arquivos:** `index.html`, `css/app.css`, `js/app.js`, `js/diagram.js` (só 7c), `sw.js` (incrementar `CACHE_NAME`), `tests.html` (só se mudar função pura). Manter os contratos da seção 3 e o desktop funcional. Fazer na ordem 7a → 7e (uma subfase por commit).

### 7a — Cabeçalho enxuto + Ajustes (esforço baixo)
- Hoje o cabeçalho ocupa ~165 px (20% da tela do celular) em todas as abas: título + Instalar + "Tema: automático" + Canhoto + busca.
- Cabeçalho de ~48 px: título + botão **⚙ Ajustes** (diálogo ou gaveta) com: tema como seletor de 3 opções (automático/claro/escuro — hoje é um botão que alterna 3 estados), canhoto, instalar, e **Backup** (exportar/importar JSON, movido do Repertório) com **"Apagar tudo" numa área de perigo separada** (hoje fica ao lado de Exportar).
- A busca aparece só na aba Acordes (no celular); no desktop pode continuar no topo.
- **Aceite:** no celular a 390×844, o diagrama completo com os botões Dedilhar/Batida cabe na 1ª tela da aba Acordes; tema/canhoto/backup continuam funcionando e persistindo.

### 7b — Seletor de acorde acima do diagrama (esforço médio)
- Hoje, no celular, trocar de acorde exige rolar ~1000 px: instrumento/tônica/tipo ficam abaixo do diagrama, dos botões e das miniaturas.
- Barra compacta acima do diagrama: `C ▾ · maior ▾ · Violão ▾`. Tocar abre uma gaveta inferior (bottom sheet) com tônica + abas de tipo; escolher fecha a gaveta e o diagrama segue à vista. Instrumento pode ser um seletor na própria barra.
- Abas de tipo com nomes curtos (*Básicos*, *7ª e 6ª*, *9ª/11ª/13ª*, *Alterados*, *Inversões*) e esmaecido na borda indicando que há mais para rolar (hoje "Altera…" fica cortado sem pista).
- Desktop: manter a coluna lateral atual (a barra pode ser só mobile).
- **Aceite:** trocar tônica e tipo no celular sem rolar a página; teclado e leitores de tela conseguem abrir/fechar a gaveta (foco preso, Esc fecha).

### 7c — Correções rápidas de clareza (esforço baixo)
1. **Placeholders que parecem conteúdo:** `x32010` (Identificar) e a tablatura de exemplo no textarea, cinza e monoespaçados, parecem valores preenchidos → "ex.: x32010" / textarea vazio (o botão Exemplo já existe).
2. **Ajuda permanente** ("Toque numa corda… Sem som? Confira o volume…") → dica só na 1ª visita (guardar em prefs); aviso de som só quando `audioState()` não for `running` após um toque.
3. **Linha técnica** "Violão · Padrão (E A D G B E) · E2 A2 D3 G3 B3 E4" → mostrar só quando a afinação não for a padrão do instrumento.
4. **Navegação de posições repetida** (setas + "Posição 1/8" + miniaturas; deslizar não é descoberto) → no celular, miniaturas + contador; dica "deslize para trocar" na 1ª vez.
5. **Identificar:** a instrução "Monte um shape com ao menos 2 cordas tocadas" aparece como item "1." de lista numerada → mensagem fora da lista; resultados como cartões clicáveis que abrem o acorde no dicionário.
6. **Bug:** o braço da Tablatura (`renderFretboard`) rotula as duas cordas Mi como "E"; usar os mesmos rótulos de `tabLabels` (a de cima "e").
7. **Contraste:** textos auxiliares de 11–12 px em `--muted` no limite do legível → mínimo 13 px ou cor mais forte (verificar contraste AA nos dois temas).

### 7d — Tablatura em Biblioteca / Player / Editar (esforço alto)
- Hoje é um formulário longo: no celular o braço fica ~1500 px abaixo do Tocar (não dá para ver controles + tablatura + braço ao tocar); o texto aparece duas vezes (textarea e visualização); ajustes raros pesam igual aos comuns.
- **Biblioteca:** lista de tablaturas salvas + Nova, Importar MusicXML, Exemplo.
- **Player:** tablatura em destaque; **barra de transporte fixa embaixo** (▶/■, BPM, velocidade, A–B, repetir); braço compacto fixo acima da barra. Ajustes avançados ("Cada traço", "Tocar acordes das anotações", contagem de entrada) num painel recolhido.
- **Editar:** Texto ou Grade, aberto a partir do Player; a visualização duplicada some no modo texto.
- **Linguagem:** "A"/"B"/"✕" → "Marcar início"/"Marcar fim"/"Limpar" (ou arrastar sobre a tablatura para marcar o trecho); durações da grade em figuras (♪ colcheia, ♩ semínima…) em vez de "passos"; "Cada traço" → "Cada traço vale".
- **Aceite:** no celular, durante a reprodução, a nota destacada, o braço e o botão Parar ficam visíveis ao mesmo tempo sem rolar; os critérios da 6a/6b/6c continuam passando.

### 7e — Abas também no desktop + repertório mais fácil (esforço médio)
- Desktop hoje é uma página única sem navegação; a Tablatura fica ~1400 px abaixo do topo → usar as mesmas 4 seções (Acordes · Repertório · Tablatura · Identificar) como abas no topo, mantendo o layout de 2 colunas dentro de cada uma.
- Progressões: o placeholder usa "→", que ninguém sabe digitar → deixar claro o separador aceito (conferir `splitProgression`) e adicionar **"+ Adicionar à progressão"** no visualizador do acorde.
- Primeira visita: tour curto de 3 passos (escolher acorde → ouvir → favoritar), dispensável e guardado em prefs.
- **Aceite:** no desktop, cada seção abre por aba sem rolar; rota/URL (`#/…`) continua funcionando.
