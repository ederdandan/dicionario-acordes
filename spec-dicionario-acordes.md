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
| 3 | Sintetizador de áudio | ✅ concluída (2026-11-13) | 62/62 testes (Chrome headless via DevTools Protocol). Karplus-Strong calculado em JS (`ksSamples`, função pura) e tocado como `AudioBuffer` (cache LRU de 160 buffers) — sem laço de realimentação no grafo; cada nota = `BufferSource` + `Gain`, desconectados no `ended`. Re-tocar uma corda abafa a anterior; teto de 48 vozes. Desafinação da 2ª corda do par é fixa por par (±3 cents, determinística → cacheável). Ganho normalizado por √(6/nº de vozes); master = compressor + soft-clip tanh (pico ≤ 0,99 no teste de estresse). `renderDiagram` ganhou a opção `onString(i)`: áreas clicáveis/focáveis (Enter/Espaço) por corda tocada, e o SVG passa a `role="group"`. Vazamento verificado com `OfflineAudioContext` (headless não tem saída de áudio em tempo real). |
| 4 | PWA (manifest, service worker, instalação) | ⬜ pendente | |
| 5 | Extras: favoritos, progressões, canhoto, tema, URL, reverso | ⬜ pendente | |

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
│   └── storage.js        # (Fase 5) localStorage, import/export
├── icons/                # (Fase 4) icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png
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
