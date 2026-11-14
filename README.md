# Dicionário de Acordes

Dicionário de acordes para violão (viola caipira e ukulele nas próximas fases), feito em HTML/CSS/JS puro com ES Modules, sem build, sem CDN e sem backend. Pronto para GitHub Pages.

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

## Estrutura

| Arquivo | Papel |
|---|---|
| `js/theory.js` | Notas, intervalos, fórmulas, grafia |
| `js/parser.js` | Texto → `{ root, quality, bass, symbol }` |
| `js/instruments.js` | Instrumentos e afinações |
| `js/voicings.js` | Gerador + ranking + validação da base curada |
| `js/curated.js` | Shapes tradicionais (`{ f: "x-3-2-0-1-0", d: "0-3-2-0-1-0" }`) |
| `js/diagram.js` | Renderização SVG |
| `js/app.js` | Interface |

A especificação completa está em `spec-dicionario-acordes.md`.
