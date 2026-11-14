# Dicionário de Acordes

Dicionário de acordes para violão, viola caipira e ukulele, feito em HTML/CSS/JS puro com ES Modules, sem build, sem CDN e sem backend. É um PWA instalável que funciona offline. Pronto para GitHub Pages (inclusive em subdiretório).

## Como rodar

Módulos ES não carregam via `file://`. Sirva a pasta com qualquer servidor estático:

```bash
python -m http.server 8000
# abra http://localhost:8000/        → aplicativo
# abra http://localhost:8000/tests.html → testes dos critérios de aceite
```

## Recursos (Fase 1)

- Busca com autocomplete: cifras (`Am7`, `Bbmaj7`, `G7b9`, `D/F#`) e nomes em português (`Fá#m7`, `Dó menor`, `Si bemol maior`).
- 33 tipos de acorde (tríades, tétrades, extensões, alterados) e inversões/baixo alternativo.
- Grafia enarmônica correta (7ª menor de Dó = Sib).
- Gerador algorítmico de posições em todo o braço (casas 0–12), com ranking e base curada de formas tradicionais.
- Diagramas SVG acessíveis e responsivos, com tema claro/escuro via variáveis CSS.
- Painel de análise: notas, fórmula e tabela corda a corda.

## Recursos (Fases 2 a 5)

- Viola caipira (Cebolão em Mi/Ré, Rio Abaixo, Boiadeira) e ukulele High-G.
- Sintetizador Karplus-Strong: dedilhado, batida e corda isolada (clique no diagrama).
- PWA: instalável (botão “Instalar”; no iPhone, instruções de “Adicionar à Tela de Início”) e 100% offline, áudio incluído.
- Favoritos e progressões com modo ensaio (anterior/próximo/tocar), salvos no navegador; backup em JSON.
- Progressões para estudo prontas (pop, brasileira, jazz/bossa, blues, clássica) em qualquer tom, para ensaiar ou copiar e criar a sua.
- Modo canhoto, tema claro/escuro/automático e links compartilháveis (`#/violao/C7M/2`, `#/viola/rioAbaixo/G%2FB/2`).
- Identificador reverso: monte um shape no braço (ou digite `x32010`) e veja os nomes possíveis.
- Feito para o celular: abas inferiores, deslizar para trocar de posição e **modo palco** (tela cheia, tela sempre acesa, compatível com pedaleira Bluetooth).

## Publicando uma nova versão

O service worker serve os arquivos do cache. Ao alterar qualquer arquivo, **incremente `CACHE_NAME` em `sw.js`** (`dicionario-acordes-v2`, `-v3`…): quem já tem o app verá “Nova versão disponível — Atualizar”. Se criar um arquivo novo, inclua-o na lista `ASSETS` do `sw.js`.

Os ícones são gerados por `node tools/gen-icons.mjs`.

## Estrutura

| Arquivo | Papel |
|---|---|
| `js/theory.js` | Notas, intervalos, fórmulas, grafia |
| `js/parser.js` | Texto → `{ root, quality, bass, symbol }` |
| `js/instruments.js` | Instrumentos e afinações |
| `js/voicings.js` | Gerador + ranking + validação da base curada |
| `js/curated.js` | Shapes tradicionais (`{ f: "x-3-2-0-1-0", d: "0-3-2-0-1-0" }`) |
| `js/diagram.js` | Renderização SVG |
| `js/audio.js` | Sintetizador (Web Audio) |
| `js/storage.js` | Favoritos, progressões, preferências, backup e rota da URL |
| `js/app.js` | Interface, PWA (instalação/atualização) |
| `sw.js`, `manifest.json`, `icons/` | PWA |

A especificação completa está em `spec-dicionario-acordes.md`.
