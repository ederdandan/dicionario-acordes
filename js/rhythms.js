// rhythms.js — ritmos de mão direita para estudo (dados) e conversão de cada passo em batida (funções puras, sem DOM).
// Versões simplificadas, para quem está começando: o ritmo "de verdade" tem variações regionais e de cada músico.
//
// Padrão (`steps`): um caractere por subdivisão (`sub` por tempo, `meter` tempos por compasso, `bars` compassos).
//   D batida para baixo (todas)   d para baixo leve (agudas)   U para cima (agudas)
//   X abafada (chuck, palma da mão)   x acorde curto (staccato)
//   B baixo (corda mais grave do acorde)   b baixo alternado (2ª mais grave)
//   P pinça (3 agudas juntas)   K baixo + pinça juntos   1–4 uma corda (1 = a mais aguda)   . pausa (deixa soar)

export const STROKES = {
  D: { label: '↓', name: 'Para baixo (todas as cordas)' },
  d: { label: '↓', name: 'Para baixo leve (só as agudas)', soft: true },
  U: { label: '↑', name: 'Para cima (cordas agudas)' },
  X: { label: '✕', name: 'Abafada: bata com a palma sobre as cordas' },
  x: { label: '↓', name: 'Acorde curto: toque e abafe logo', soft: true },
  B: { label: 'B', name: 'Baixo: polegar na corda mais grave do acorde' },
  b: { label: 'b', name: 'Baixo alternado: polegar na corda vizinha' },
  P: { label: 'P', name: 'Pinça: indicador, médio e anelar juntos nas 3 agudas' },
  K: { label: 'B+P', name: 'Baixo e pinça ao mesmo tempo' },
  1: { label: '1', name: 'Corda 1 (a mais aguda) — anelar' },
  2: { label: '2', name: 'Corda 2 — médio' },
  3: { label: '3', name: 'Corda 3 — indicador' },
  4: { label: '4', name: 'Corda 4' },
};

export const LEVELS = ['', 'Fácil', 'Médio', 'Desafio'];

const INST = { v: 'violao', c: 'viola', u: 'ukulele' };
/** R(id, nome, estilo, instrumentos 'vcu', nível, tempos, subdivisões, compassos, BPM, padrão, dica, swing) */
const R = (id, name, style, inst, lvl, meter, sub, bars, bpm, steps, tip, swing = false) =>
  ({ id, name, style, inst: [...inst].map(c => INST[c]), lvl, meter, sub, bars, bpm, steps, tip, swing });

/** lvl: 1 fácil · 2 médio · 3 desafio. inst: instrumentos em que o ritmo aparece. Tudo simplificado para iniciantes. */
export const RHYTHMS = [
  // Primeiros passos e gerais
  R('so-baixo', 'Só para baixo', 'Primeiro passo', 'vcu', 1, 4, 2, 1, 70, 'D.D.D.D.', 'Uma batida por tempo. Conte “1, 2, 3, 4” em voz alta e troque o acorde sem parar a mão.'),
  R('balada', 'Balada', 'Balada, sertanejo, gospel', 'vcu', 1, 4, 2, 1, 76, 'D.DU.UDU', 'A mão sobe e desce o tempo todo, como um pêndulo; nos pontos ela passa sem encostar nas cordas.'),
  R('pop', 'Pop', 'Pop', 'vu', 1, 4, 2, 1, 92, 'D.DUDUDU', 'Uma ↓ no 1 e depois “desce-sobe” contínuo. A mão nunca para.'),
  R('pop-rock', 'Pop Rock', 'Pop rock', 'vu', 2, 4, 2, 1, 104, 'DDDU.UDU', 'Três ↓ firmes para começar e o “sobe-sobe-desce-sobe” no fim do compasso.'),
  R('rock', 'Rock', 'Rock', 'vu', 1, 4, 2, 1, 100, 'DdDdDdDd', 'Tudo para baixo, mais forte no tempo e mais leve no “e”. Mantenha o pulso firme.'),
  R('folk', 'Folk', 'Folk, MPB acústica', 'vu', 1, 4, 2, 1, 100, 'D.D.DUDU', 'Duas ↓ marcando e o “desce-sobe” na 2ª metade. Ótimo para cantar junto.'),
  R('country', 'Country', 'Country, sertanejo raiz', 'vu', 2, 4, 2, 1, 110, 'B.D.b.D.', '“Boom-chick”: baixo, acorde, baixo alternado, acorde. O polegar faz o trabalho pesado.'),
  R('dedilhado', 'Arpejo (Dedilhado)', 'Baladas, MPB', 'vcu', 1, 4, 2, 1, 72, 'B321b321', 'Polegar no baixo; indicador, médio e anelar nas cordas 3, 2 e 1. A mão fica parada, só os dedos se mexem.'),
  R('fingerstyle', 'Fingerstyle (Travis)', 'Folk, country, violão solo', 'v', 3, 4, 2, 1, 76, 'K2b1B2b1', 'O polegar alterna os baixos em todo tempo, sem parar; os dedos entram entre eles. Treine o polegar sozinho primeiro.'),
  R('percussivo', 'Percussivo', 'Violão percussivo, acústico', 'v', 3, 4, 2, 1, 90, 'D.XUDUXU', 'O ✕ é um tapa com a palma nas cordas, no 2 e no 4, fazendo o papel da caixa da bateria.'),
  R('chuck', 'Chuck Strum (Abafado)', 'Pop, reggae-pop', 'vu', 2, 4, 2, 1, 90, 'D.X.D.X.', 'Desça a mão e abafe com a palma no mesmo movimento, no 2 e no 4: “tum-tchic”.'),
  R('valsa', 'Valsa', 'Valsa, serestas (3/4)', 'vcu', 1, 3, 2, 1, 84, 'B.D.D.', '“UM-dois-três”: baixo forte no 1 e o acorde nos tempos 2 e 3.'),
  R('bolero', 'Bolero', 'Bolero, romântico', 'vcu', 2, 4, 2, 1, 72, 'B.DUd.DU', 'Baixo no 1, e o “desce-sobe” suave. Andamento lento, bem cantado.'),
  // Blues, jazz e música negra americana
  R('blues', 'Blues', 'Blues', 'vu', 2, 4, 2, 1, 80, 'D.DUD.DU', 'Com swing: o “e” vem atrasado (“TÁ-ra TÁ-ra”). Ouça a diferença ligando o metrônomo.', true),
  R('shuffle', 'Shuffle', 'Blues, rock antigo', 'vu', 2, 4, 2, 1, 96, 'DdDdDdDd', 'Tudo para baixo com swing — o famoso “galope” do blues.', true),
  R('jazz', 'Jazz (Charleston)', 'Jazz, standards', 'vu', 3, 4, 2, 1, 120, 'x..x....', 'Acorde curto no 1 e no “e” do 2 (o Charleston). O silêncio faz parte do ritmo.', true),
  R('swing', 'Swing', 'Swing, jazz cigano', 'vu', 2, 4, 2, 1, 120, 'd.x.d.x.', 'Um acorde por tempo, curto no 2 e no 4 (o “chique” da caixa).', true),
  R('soul', 'Soul', 'Soul', 'vu', 2, 4, 4, 1, 84, 'D..DX..UD..DX..U', 'Em semicolcheias: o ✕ no 2 e no 4 e as ↓ antecipadas dão o balanço.'),
  R('rnb', 'R&B', 'R&B, black music', 'vu', 2, 4, 4, 1, 70, 'D...X..UD.D.X...', 'Lento e espaçado: deixe o acorde soar e marque o ✕ no 2 e no 4.'),
  R('funk', 'Funk', 'Funk, groove', 'vu', 3, 4, 4, 1, 92, 'D.XUXUD.XUD.XUXU', 'A mão anda em semicolcheias o tempo todo; quase tudo abafado, poucos acordes soam.'),
  R('disco', 'Disco', 'Disco, dance', 'vu', 2, 4, 2, 1, 112, 'dUdUdUdU', 'O acento está nas ↑ (no “e”). Mão leve e constante.'),
  // Caribe, latinos e reggae
  R('island', 'Island Strum (Calypso)', 'Ukulele pop, calypso', 'vu', 2, 4, 2, 1, 84, 'D.DUXUDU', 'Igual à balada, mas o 3º tempo é abafado com a palma — dá o “tchic” característico.'),
  R('reggae', 'Reggae', 'Reggae', 'vcu', 2, 4, 2, 1, 76, 'B.x.b.x.', 'O acorde vem curto nos tempos 2 e 4; abafe com a mão esquerda logo depois de tocar.'),
  R('ska', 'Ska', 'Ska', 'vu', 2, 4, 2, 1, 130, '.U.U.U.U', 'Só as ↑ no contratempo (no “e”), rápidas e curtas. O tempo fica vazio.'),
  R('samba-reggae', 'Samba-Reggae', 'Axé, samba-reggae', 'u', 2, 4, 2, 1, 92, 'D..UX.DU', 'Mistura o peso do reggae com o balanço do samba; o ✕ no 3 é a caixa.'),
  R('rumba', 'Rumba', 'Rumba, latino', 'v', 2, 4, 2, 1, 100, 'D..D..DU', 'Três ↓ espaçadas (3 + 3 + 2) — o “tresillo” das músicas latinas.'),
  R('rumba-flamenca', 'Rumba Flamenca', 'Rumba flamenca, Gipsy', 'v', 3, 4, 2, 1, 104, 'DUXUDUXU', 'O ✕ no 2 e no 4 é o “golpe” com a palma; a mão não para.'),
  R('salsa', 'Salsa (clave)', 'Salsa, son', 'v', 3, 4, 2, 2, 96, 'x..x..x...x.x...', 'Acordes curtos no desenho da clave 3-2: três batidas num compasso, duas no outro.'),
  R('cumbia', 'Cúmbia', 'Cúmbia', 'v', 2, 4, 2, 1, 92, 'B.xxb.xx', 'Baixo no tempo e dois acordes curtos no contratempo: “tum-tchi-tchi”.'),
  R('bachata', 'Bachata', 'Bachata', 'v', 3, 4, 2, 1, 116, 'BDDUbDDU', 'Baixo no 1 e no 3 e o acorde rápido entre eles; o 4 tem um pequeno “empurrão” (↑).'),
  R('tango', 'Tango', 'Tango', 'v', 3, 4, 2, 1, 64, 'D.x.x.x.', 'Marcado: os quatro tempos com força, os três últimos curtos.'),
  R('arrocha', 'Arrocha', 'Arrocha, romântico', 'v', 2, 4, 2, 1, 72, 'B.D.XUDU', 'Lento: baixo, acorde, abafado e um “desce-sobe” para fechar.'),
  R('sertanejo-univ', 'Sertanejo Universitário', 'Sertanejo', 'v', 1, 4, 2, 1, 90, 'B.DUXUDU', 'A batida “puxada” com o abafado no 3; o baixo dá o peso no 1.'),
  // Brasil — samba e família
  R('samba', 'Samba', 'Samba, pagode', 'vu', 3, 2, 4, 1, 80, 'BP.Pb.PP', 'O polegar marca os 2 tempos (o 2º mais forte, como o surdo) e a pinça faz o desenho do tamborim.'),
  R('samba-cancao', 'Samba-Canção', 'Samba-canção, seresta', 'v', 2, 2, 4, 1, 64, 'K..PbP.P', 'Samba lento e romântico: deixe os acordes soarem.'),
  R('samba-rock', 'Samba-Rock', 'Samba-rock', 'v', 2, 4, 2, 1, 100, 'B.xUbUxU', 'Balanço de samba com batida de rock; acordes curtos no 2 e no 4.'),
  R('partido-alto', 'Partido Alto', 'Partido alto, pagode', 'v', 3, 2, 4, 2, 92, 'B.PPb..PB.P.bP.P', 'Dois compassos com desenhos diferentes. O polegar segue o surdo; a pinça “responde”.'),
  R('pagode', 'Pagode', 'Pagode', 'v', 2, 2, 4, 1, 92, 'B.PPb.PP', 'Polegar nos tempos e pinça em duplas logo depois.'),
  R('choro', 'Choro', 'Choro', 'v', 3, 2, 4, 1, 88, 'B.PPbP.P', 'O polegar faz os baixos (a “baixaria”); a pinça mantém o balanço do pandeiro.'),
  R('bossa', 'Bossa Nova', 'Bossa nova', 'vu', 3, 2, 4, 2, 72, 'K..Pb.P.B.P.bP..', 'O polegar só marca os tempos, sem acento; a pinça é que balança. Treine primeiro só o polegar.'),
  R('mpb', 'MPB', 'MPB', 'vu', 2, 2, 4, 1, 70, 'K.P.b.PP', 'Baixo + pinça leves, entre a bossa e o samba. Toque com suavidade.'),
  R('marchinha', 'Marchinha', 'Carnaval, marchinha', 'vu', 1, 2, 4, 1, 120, 'B.DUb.DD', 'Alegre e marcada: baixo em cada tempo e acordes entre eles.'),
  R('axe', 'Axé', 'Axé', 'v', 2, 2, 4, 1, 120, 'B.XUDUXU', 'Rápido e animado; o ✕ é a caixa.'),
  R('frevo', 'Frevo', 'Frevo', 'v', 3, 2, 4, 1, 132, 'DXUDXUDU', 'Bem rápido: a mão não para e o ✕ dá o ataque. Comece devagar!'),
  R('maracatu', 'Maracatu', 'Maracatu', 'v', 3, 4, 4, 1, 90, 'D..D..D.D.D.D...', 'Batidas fortes no desenho da alfaia (tambor grave). Toque pesado.'),
  // Nordeste
  R('baiao', 'Baião', 'Baião', 'vcu', 2, 2, 4, 1, 84, 'B..bD.DU', 'O baixo faz “TUM… tum-” (3 + 3 + 2) como a zabumba; o acorde preenche o fim do compasso.'),
  R('xote', 'Xote', 'Xote', 'vcu', 2, 2, 4, 1, 96, 'B..Db.D.', 'Gingado e mais lento que o forró: “tum… tchá, tum tchá”.'),
  R('forro', 'Forró', 'Forró pé de serra', 'vcu', 2, 2, 4, 1, 110, 'B.DUbUDU', 'Baixo nos tempos e a mão sempre andando; mais rápido que o baião.'),
  R('arrasta-pe', 'Arrasta-pé', 'Arrasta-pé, quadrilha', 'vc', 2, 2, 4, 1, 132, 'BUDUbUDU', 'Bem rápido, para dançar: baixo, e “sobe-desce-sobe”.'),
  // Sul e fronteira
  R('vaneira', 'Vaneira', 'Gaúcha', 'vc', 2, 2, 4, 1, 120, 'B.UDb.UD', 'O acento está no contratempo (↑ e ↓ depois do baixo).'),
  R('vaneirao', 'Vaneirão', 'Gaúcha', 'vc', 3, 2, 4, 1, 140, 'BUDUbUDU', 'A vaneira mais rápida e cheia: a mão não para.'),
  R('chamame', 'Chamamé', 'Chamamé (6/8)', 'vc', 3, 2, 3, 1, 100, 'BDUbDU', 'Em 6/8: dois grupos de três (“UM-dois-três, DOIS-dois-três”).'),
  R('milonga', 'Milonga', 'Milonga', 'vc', 2, 2, 4, 1, 100, 'K..P..b.', 'O desenho 3 + 3 + 2: “TUM . . tum . . tum .”.'),
  R('polca', 'Polca', 'Polca, rancheira', 'vc', 1, 2, 2, 1, 120, 'BDbD', '“Pum-pá”: baixo e acorde alternados, como uma sanfona.'),
  R('polca-paraguaia', 'Polca Paraguaia', 'Polca paraguaia (6/8)', 'c', 3, 2, 3, 1, 120, 'B.Ub.U', 'Em 6/8, com a ↑ puxando para o próximo tempo.'),
  R('guarania', 'Guarânia', 'Guarânia (3/4)', 'vcu', 2, 3, 2, 1, 80, 'B.DUDU', 'Baixo no 1 e depois “desce-sobe” contínuo. Ritmo base de muitas modas de viola.'),
  R('rasqueado', 'Rasqueado', 'Rasqueado (3/4)', 'c', 2, 3, 2, 1, 96, 'DUDUDU', 'Batida cheia e contínua em 3 tempos, mais rápida que a guarânia.'),
  R('corrido', 'Corrido', 'Corrido', 'c', 2, 2, 4, 1, 120, 'B.DUbDDU', 'Rápido e narrativo: baixo nos tempos e acordes em seguida.'),
  // Caipira
  R('toada', 'Toada', 'Música caipira', 'vcu', 2, 2, 4, 1, 72, 'B.DUb.DU', 'Baixo no tempo e a batida “desce-sobe” logo depois. Andamento tranquilo, sem pressa.'),
  R('moda', 'Moda de Viola', 'Moda caipira', 'c', 1, 2, 4, 1, 76, 'B.D.b.DU', 'Simples e lenta, para acompanhar a história cantada em dupla.'),
  R('cururu', 'Cururu', 'Música caipira', 'c', 2, 2, 4, 1, 84, 'D.UDX.UD', 'O abafado no 2º tempo marca o ritmo. Depois experimente acentuar o último ↓.'),
  R('catere', 'Cateretê', 'Música caipira', 'c', 3, 2, 4, 1, 92, 'DUDUD.DU', 'Batida rápida e contínua; o ponto no meio é o “respiro”. Comece bem devagar.'),
  R('recortado', 'Recortado', 'Música caipira', 'c', 3, 2, 4, 1, 116, 'DUDXDUDX', 'Rápido e “picado”: o ✕ no fim de cada tempo recorta a batida.'),
  R('pagode-viola', 'Pagode de Viola', 'Música caipira', 'c', 3, 2, 4, 1, 108, 'D.UXDUXU', 'Pagode caipira simplificado: o ✕ dá o ataque. O original tem trejeitos — ouça os mestres.'),
  R('querumana', 'Querumana', 'Música caipira', 'c', 3, 2, 4, 1, 96, 'BDUDb.DU', 'Baixo e batida cheia; o ponto é o respiro antes do “desce-sobe”.'),
  R('calango', 'Calango', 'Música caipira, mineira', 'c', 2, 2, 4, 1, 104, 'B.DUbUDU', 'Animado, de desafio: baixo e a mão andando sempre.'),
  R('cipo-preto', 'Cipó Preto', 'Música caipira', 'c', 3, 2, 4, 1, 112, 'DXDUDXDU', 'Batida corrida com abafados; mantenha o pulso firme.'),
  R('cana-verde', 'Cana-verde', 'Dança caipira', 'c', 2, 2, 4, 1, 100, 'BUD.bUD.', 'Baixo e “sobe-desce”, com respiro no fim de cada tempo.'),
  R('samba-caipira', 'Samba Caipira', 'Música caipira', 'c', 2, 2, 4, 1, 96, 'BDUDbDUD', 'O samba do interior: baixo no tempo e batida cheia entre eles.'),
  R('samba-de-roda', 'Samba de Roda', 'Samba de roda, Recôncavo', 'c', 2, 2, 4, 1, 100, 'B.DUbUD.', 'Acompanha as palmas da roda; deixe espaço no fim.'),
  R('batuque', 'Batuque', 'Batuque, tradição', 'c', 3, 2, 4, 1, 100, 'X.DXD.DX', 'Percussivo: os ✕ imitam o tambor.'),
  R('catira', 'Catira', 'Catira (palmas e sapateado)', 'c', 3, 2, 4, 1, 110, 'DUDUX.X.', 'A viola “rasqueia” e os ✕ imitam as palmas e o sapateado dos catireiros.'),
  R('folia', 'Folia de Reis', 'Folia de Reis (6/8)', 'c', 2, 2, 3, 1, 80, 'B.Db.D', 'Em 6/8, lento e solene, para acompanhar o canto.'),
  R('congada', 'Congada', 'Congada', 'c', 2, 2, 4, 1, 100, 'D.DXD.DX', 'Marcado, de cortejo; os ✕ são as caixas.'),
  R('mocambique', 'Moçambique', 'Moçambique (congado)', 'c', 2, 2, 4, 1, 104, 'D.D.X.DU', 'Firme e marchado, como as gungas nos pés dos dançadores.'),
  R('chula', 'Chula', 'Chula', 'c', 3, 2, 4, 1, 108, 'DUD.UDUX', 'Ligeira; o ✕ no fim fecha cada compasso.'),
  R('jongo', 'Jongo', 'Jongo (6/8)', 'c', 3, 2, 3, 1, 92, 'D.XD.X', 'Em 6/8, com o ✕ no lugar do tambor.'),
  R('lundu', 'Lundu', 'Lundu', 'c', 2, 2, 4, 1, 84, 'B.DUD.b.', 'Antigo e gingado: baixo, “desce-sobe” e respiro.'),
  // Havaí e ukulele
  R('hawaiian-vamp', 'Hawaiian Vamp', 'Havaiana', 'u', 2, 4, 2, 1, 100, 'DUDUD.DU', 'O “vamp” é a volta II7 – V7 – I no fim das músicas havaianas; use essa batida nela.'),
  R('kani-ka-pila', 'Kani Ka Pila', 'Havaiana, roda de amigos', 'u', 1, 4, 2, 1, 96, 'D.D.DU.U', 'Batida de roda: simples, para todo mundo tocar junto.'),
  R('hula', 'Hula', 'Havaiana', 'u', 2, 4, 2, 1, 92, 'DU.UDU.U', 'Suave e ondulada, como a dança; as ↑ são leves.'),
];

/** Ritmo típico de cada progressão de estudo (em ordem de preferência; o 1º disponível no instrumento vale). */
export const SUGGESTED = {
  'pop-4': ['balada'], 'pop-vi': ['balada'], 'anos-50': ['balada'], 'rock-145': ['rock'], 'descida-baixo': ['dedilhado'],
  baiao: ['baiao'], moda: ['moda', 'toada', 'guarania'], 'samba-menor': ['samba', 'samba-caipira'], 'samba-cadencia': ['samba', 'samba-caipira'],
  'ii-v-i': ['bossa', 'jazz'], 'ii-v-i-menor': ['bossa', 'jazz'], turnaround: ['jazz', 'bossa', 'balada'], bossa: ['bossa', 'dedilhado'],
  'ciclo-quintas': ['bossa', 'dedilhado'], 'blues-12': ['shuffle', 'blues'], 'blues-menor': ['blues', 'dedilhado'],
  canon: ['dedilhado'], andaluza: ['rumba-flamenca', 'rock', 'dedilhado'], perfeita: ['valsa'],
};
export function suggestedRhythm(progId, instrumentId) {
  const ok = rhythmsFor(instrumentId).map(r => r.id);
  return [...(SUGGESTED[progId] || []), 'balada'].find(id => ok.includes(id));
}

/** Ritmos comuns no instrumento, do mais fácil ao mais difícil. */
export const rhythmsFor = instrumentId => RHYTHMS.filter(r => r.inst.includes(instrumentId)).sort((a, b) => a.lvl - b.lvl);

/** Rótulo de contagem de cada passo: "1 e 2 e" (colcheias) ou "1 · e ·" (semicolcheias). */
export function countLabels(r) {
  return [...r.steps].map((_, i) => {
    const beat = Math.floor(i / r.sub) % r.meter, k = i % r.sub;
    if (k === 0) return String(beat + 1);
    return r.sub === 2 || (r.sub === 4 && k === 2) ? 'e' : '·';
  });
}

/**
 * Batida de um passo: quais cordas tocar (casas mascaradas com -1) e como.
 * Devolve null na pausa ou se o acorde não tem cordas para aquele golpe.
 */
export function strokeFor(sym, frets) {
  const played = frets.map((f, i) => (f >= 0 ? i : -1)).filter(i => i >= 0);
  if (!played.length || !STROKES[sym]) return null;
  const treble = played.slice(1).slice(-4), top3 = played.slice(-3);
  const take = idx => frets.map((f, i) => (idx.includes(i) ? f : -1));
  switch (sym) {
    case 'D': return { frets: take(played), strum: 0.012, gain: 1 };
    case 'd': return { frets: take(treble), strum: 0.01, gain: 0.55 };
    case 'U': return { frets: take(treble), strum: 0.01, gain: 0.65, up: true };
    case 'X': return { frets: take(played), strum: 0.003, gain: 0.5, len: 0.035 };
    case 'x': return { frets: take(treble), strum: 0.006, gain: 0.75, len: 0.12 };
    case 'B': return { frets: take([played[0]]), strum: 0, gain: 1 };
    case 'b': return { frets: take([played[Math.min(1, played.length - 1)]]), strum: 0, gain: 0.9 };
    case 'P': return { frets: take(top3), strum: 0.003, gain: 0.75 };
    case 'K': return { frets: take([played[0], ...top3]), strum: 0.003, gain: 0.9 };
    default: { // corda nº n (1 = mais aguda)
      const i = played[played.length - Number(sym)];
      return i === undefined ? null : { frets: take([i]), strum: 0, gain: 0.8 };
    }
  }
}
