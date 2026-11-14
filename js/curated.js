// Base curada de shapes tradicionais (convertida de referencia/gemini.html).
// Formato: f = casas (corda grossa → fina, x = muda); d = dedos (opcional); l = rótulo (opcional).
// Todos os shapes passam por validação automática em voicings.js; inválidos são descartados com aviso.
export const CURATED = {
  "violao/padrao": {
    "C": [
      {"f":"x-3-2-0-1-0","d":"0-3-2-0-1-0","l":"Posição Aberta"},
      {"f":"x-3-5-5-5-3","d":"0-1-2-3-4-1","l":"Pestana (3ª Casa)"}
    ],
    "C7": [
      {"f":"x-3-2-3-1-0","d":"0-3-2-4-1-0","l":"Posição Aberta"},
      {"f":"x-3-5-3-5-3","d":"0-1-3-1-4-1","l":"Pestana (3ª Casa)"}
    ],
    "C7M": [
      {"f":"x-3-2-0-0-0","d":"0-3-2-0-0-0","l":"Posição Aberta"},
      {"f":"x-3-5-4-5-3","d":"0-1-3-2-4-1","l":"Bossa / Jazz (3ª Casa)"}
    ],
    "C7M(9)": [
      {"f":"x-3-2-4-3-0","d":"0-2-1-4-3-0","l":"Bossa Nova (Aberta)"}
    ],
    "C6/9": [
      {"f":"x-3-2-2-3-3","d":"0-2-1-1-3-4","l":"Bossa Nova Clássico"}
    ],
    "C7(b9)": [
      {"f":"x-3-2-3-2-x","d":"0-2-1-3-4-0","l":"Jazz / MPB"}
    ],
    "C7(#9)": [
      {"f":"x-3-2-3-4-x","d":"0-2-1-3-4-0","l":"Hendrix Chord"}
    ],
    "D": [
      {"f":"x-x-0-2-3-2","d":"0-0-0-1-3-2","l":"Posição Aberta"}
    ],
    "D7": [
      {"f":"x-x-0-2-1-2","d":"0-0-0-2-1-3","l":"Posição Aberta"}
    ],
    "D7M": [
      {"f":"x-x-0-2-2-2","d":"0-0-0-1-2-3","l":"Posição Aberta"}
    ],
    "Dm": [
      {"f":"x-x-0-2-3-1","d":"0-0-0-2-3-1","l":"Posição Aberta"}
    ],
    "Dm7": [
      {"f":"x-x-0-2-1-1","d":"0-0-0-2-1-1","l":"Posição Aberta"}
    ],
    "Dm7(b5)": [
      {"f":"x-x-0-1-1-1","d":"0-0-0-1-2-3","l":"Meio-Diminuto Aberto"}
    ],
    "D/F#": [
      {"f":"2-0-0-2-3-2","d":"1-0-0-2-4-3","l":"Baixo em Fá#"}
    ],
    "E": [
      {"f":"0-2-2-1-0-0","d":"0-2-3-1-0-0","l":"Posição Aberta"}
    ],
    "E7": [
      {"f":"0-2-0-1-0-0","d":"0-2-0-1-0-0","l":"Posição Aberta (2 dedos)"},
      {"f":"0-2-2-1-3-0","d":"0-2-3-1-4-0","l":"Posição Aberta (4 dedos)"}
    ],
    "Em": [
      {"f":"0-2-2-0-0-0","d":"0-2-3-0-0-0","l":"Posição Aberta"}
    ],
    "Em7": [
      {"f":"0-2-0-0-0-0","d":"0-2-0-0-0-0","l":"Posição Aberta"}
    ],
    "F": [
      {"f":"1-3-3-2-1-1","d":"1-3-4-2-1-1","l":"Pestana Completa"},
      {"f":"x-x-3-2-1-1","d":"0-0-3-2-1-1","l":"Simplificado (sem pestana)"}
    ],
    "F7M": [
      {"f":"x-x-3-2-1-0","d":"0-0-3-2-1-0","l":"Posição Aberta"},
      {"f":"1-x-2-2-1-x","d":"1-0-3-4-2-0","l":"MPB (com 6ª corda)"}
    ],
    "G": [
      {"f":"3-2-0-0-0-3","d":"2-1-0-0-0-3","l":"Posição Aberta"},
      {"f":"3-2-0-0-3-3","d":"2-1-0-0-3-4","l":"Com 5ª dobrada"}
    ],
    "G7": [
      {"f":"3-2-0-0-0-1","d":"3-2-0-0-0-1","l":"Posição Aberta"}
    ],
    "G7M": [
      {"f":"3-2-0-0-0-2","d":"3-2-0-0-0-1","l":"Posição Aberta"},
      {"f":"3-x-4-4-3-x","d":"1-0-3-4-2-0","l":"Bossa Nova (3ª Casa)"}
    ],
    "G/B": [
      {"f":"x-2-0-0-3-3","d":"0-1-0-0-3-4","l":"Baixo em Si"}
    ],
    "A": [
      {"f":"x-0-2-2-2-0","d":"0-0-1-2-3-0","l":"Posição Aberta"}
    ],
    "A7": [
      {"f":"x-0-2-0-2-0","d":"0-0-2-0-3-0","l":"Posição Aberta"}
    ],
    "A7M": [
      {"f":"x-0-2-1-2-0","d":"0-0-2-1-3-0","l":"Posição Aberta"}
    ],
    "Am": [
      {"f":"x-0-2-2-1-0","d":"0-0-2-3-1-0","l":"Posição Aberta"}
    ],
    "Am7": [
      {"f":"x-0-2-0-1-0","d":"0-0-2-0-1-0","l":"Posição Aberta"}
    ],
    "Bm": [
      {"f":"x-2-4-4-3-2","d":"0-1-3-4-2-1","l":"Pestana na 2ª casa"}
    ],
    "B7": [
      {"f":"x-2-1-2-0-2","d":"0-2-1-3-0-4","l":"Posição Aberta"}
    ]
  },
  "ukulele/highG": {
    "C":    [{"f":"0-0-0-3","d":"0-0-0-3","l":"Posição Aberta"}],
    "C7":   [{"f":"0-0-0-1","d":"0-0-0-1","l":"Posição Aberta"}],
    "C7M":  [{"f":"0-0-0-2","d":"0-0-0-2","l":"Posição Aberta"}],
    "Cm":   [{"f":"0-3-3-3","d":"0-1-2-3","l":"Posição Aberta"}],
    "D":    [{"f":"2-2-2-0","d":"1-2-3-0","l":"Posição Aberta"}],
    "D7":   [{"f":"2-2-2-3","d":"1-1-1-2","l":"Pestana na 2ª"}],
    "Dm":   [{"f":"2-2-1-0","d":"2-3-1-0","l":"Posição Aberta"}],
    "E7":   [{"f":"1-2-0-2","d":"1-2-0-3","l":"Posição Aberta"}],
    "Em":   [{"f":"0-4-3-2","d":"0-3-2-1","l":"Posição Aberta"}],
    "F":    [{"f":"2-0-1-0","d":"2-0-1-0","l":"Posição Aberta"}],
    "G":    [{"f":"0-2-3-2","d":"0-1-3-2","l":"Posição Aberta"}],
    "G7":   [{"f":"0-2-1-2","d":"0-2-1-3","l":"Posição Aberta"}],
    "A":    [{"f":"2-1-0-0","d":"2-1-0-0","l":"Posição Aberta"}],
    "A7":   [{"f":"0-1-0-0","d":"0-1-0-0","l":"Posição Aberta"}],
    "Am":   [{"f":"2-0-0-0","d":"2-0-0-0","l":"Posição Aberta"}],
    "Am7":  [{"f":"0-0-0-0","d":"0-0-0-0","l":"Cordas soltas"}],
    "Bb":   [{"f":"3-2-1-1","d":"3-2-1-1","l":"Pestana na 1ª"}],
    "Bm":   [{"f":"4-2-2-2","d":"3-1-1-1","l":"Pestana na 2ª"}]
  }
};
