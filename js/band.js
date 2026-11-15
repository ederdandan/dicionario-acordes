// band.js — acompanhamento (percussão + baixo) de cada ritmo: dados e funções puras, sem DOM nem áudio.
// Versões simplificadas: cada "groove" é a levada típica do estilo, para estudar com uma banda de apoio.
//
// Padrão de cada instrumento: um caractere por subdivisão (`sub` por tempo, `meter` tempos, `bars` compassos).
//   X = golpe forte (ou o som principal do instrumento)   x = golpe leve (ou o som secundário)   . = nada
//   Baixo: R = tônica do acorde (ou o baixo da cifra com barra)   5 = quinta   O = oitava

/** Instrumentos do acompanhamento. `X`/`x` dizem o que cada símbolo toca. */
export const PARTS = {
  bumbo: { name: 'Bumbo', X: 'forte', x: 'leve' },
  caixa: { name: 'Caixa', X: 'forte', x: 'leve (aro)' },
  chimbal: { name: 'Chimbal', X: 'acentuado', x: 'leve' },
  surdo: { name: 'Surdo', X: 'aberto', x: 'abafado' },
  zabumba: { name: 'Zabumba', X: 'grave (maceta)', x: 'bacalhau (vareta)' },
  triangulo: { name: 'Triângulo', X: 'aberto', x: 'fechado' },
  pandeiro: { name: 'Pandeiro', X: 'grave (polegar)', x: 'platinela' },
  tamborim: { name: 'Tamborim', X: 'forte', x: 'leve' },
  ganza: { name: 'Ganzá / chocalho', X: 'acentuado', x: 'leve' },
  agogo: { name: 'Agogô', X: 'agudo', x: 'grave' },
  conga: { name: 'Conga', X: 'aberto', x: 'tapa' },
  palmas: { name: 'Palmas', X: 'forte', x: 'leve' },
  clave: { name: 'Clave', X: 'forte', x: 'leve' },
  baixo: { name: 'Baixo', R: 'tônica', 5: 'quinta', O: 'oitava' },
};

const G = (id, name, meter, sub, bars, parts) => ({ id, name, meter, sub, bars, parts });

/** Grooves: a ordem das chaves em `parts` é a ordem na tela. */
export const GROOVES = Object.fromEntries([
  // 4/4 em colcheias (8 passos)
  G('pop', 'Bateria pop', 4, 2, 1, { bumbo: 'X...X...', caixa: '..X...X.', chimbal: 'xxxxxxxx', baixo: 'R...R.5.' }),
  G('rock', 'Bateria rock', 4, 2, 1, { bumbo: 'X...XX..', caixa: '..X...X.', chimbal: 'XxXxXxXx', baixo: 'RRRRRRRR' }),
  G('balada', 'Balada', 4, 2, 1, { bumbo: 'X.....x.', caixa: '..x...x.', chimbal: 'x.x.x.x.', baixo: 'R...5...' }),
  G('folk', 'Folk', 4, 2, 1, { bumbo: 'X...X...', caixa: '..x...x.', ganza: 'xXxXxXxX', baixo: 'R...5...' }),
  G('country', 'Country', 4, 2, 1, { bumbo: 'X...X...', caixa: '..X...X.', chimbal: 'xxxxxxxx', baixo: 'R...5...' }),
  G('bolero', 'Bolero', 4, 2, 1, { bumbo: 'X..xX...', conga: '..x.X.XX', ganza: 'XxXxXxXx', baixo: 'R..5R...' }),
  G('blues', 'Shuffle de blues', 4, 2, 1, { bumbo: 'X...X...', caixa: '..X...X.', chimbal: 'XxXxXxXx', baixo: 'R.5.O.5.' }),
  G('jazz', 'Jazz (condução e baixo andante)', 4, 2, 1, { chimbal: 'X.XxX.Xx', bumbo: 'x.x.x.x.', baixo: 'R.5.O.5.' }),
  G('disco', 'Disco', 4, 2, 1, { bumbo: 'X.X.X.X.', caixa: '..X...X.', chimbal: '.X.X.X.X', baixo: 'RORORORO' }),
  G('reggae', 'Reggae (one drop)', 4, 2, 1, { bumbo: '....X...', caixa: '....x...', chimbal: 'x.x.x.x.', baixo: 'R..R5...' }),
  G('ska', 'Ska', 4, 2, 1, { bumbo: 'X...X...', caixa: '..X...X.', chimbal: '.X.X.X.X', baixo: 'R.5.O.5.' }),
  G('calypso', 'Calypso', 4, 2, 1, { bumbo: 'X..XX..X', conga: '..x...X.', ganza: 'xXxXxXxX', baixo: 'R..5R...' }),
  G('rumba', 'Rumba (tresillo)', 4, 2, 1, { bumbo: 'X..X..X.', palmas: '..X...X.', ganza: 'xxxxxxxx', baixo: 'R..5..R.' }),
  G('cumbia', 'Cúmbia', 4, 2, 1, { bumbo: 'X...X...', conga: '..X...X.', ganza: 'X.xxX.xx', baixo: 'R...5...' }),
  G('bachata', 'Bachata', 4, 2, 1, { bumbo: 'X...X...', conga: 'xxXxxxXx', ganza: 'X.xxX.xx', baixo: 'R..R5...' }),
  G('tango', 'Tango (marcato)', 4, 2, 1, { bumbo: 'X.x.X.x.', baixo: 'R.5.R.5.' }),
  G('sertanejo', 'Sertanejo', 4, 2, 1, { bumbo: 'X..XX...', caixa: '..X...X.', chimbal: 'xxxxxxxx', baixo: 'R..5R...' }),
  G('samba-rock', 'Samba-rock', 4, 2, 1, { bumbo: 'X..XX...', caixa: '..X...X.', ganza: 'xXxXxXxX', baixo: 'R..5R.5.' }),
  G('samba-reggae', 'Samba-reggae', 4, 2, 1, { surdo: 'X..x..X.', caixa: '..X..xX.', ganza: 'xXxXxXxX', baixo: 'R...5...' }),
  G('havaiana', 'Havaiana', 4, 2, 1, { conga: 'X..xX...', ganza: 'xXxXxXxX', baixo: 'R...5...' }),
  G('salsa', 'Salsa (clave 3-2)', 4, 2, 2, { clave: 'X..X..X...X.X...', conga: '..x...XX..x...XX', ganza: 'xxxxxxxxxxxxxxxx', baixo: '...R..5....R..5.' }),
  // 4/4 em semicolcheias (16 passos)
  G('soul', 'Soul / R&B', 4, 4, 1, { bumbo: 'X......X..X.....', caixa: '....X.......X...', chimbal: 'x.x.x.x.x.x.x.x.', baixo: 'R......5..R.....' }),
  G('funk', 'Funk', 4, 4, 1, { bumbo: 'X.....X...X..X..', caixa: '....X..x.x..X...', chimbal: 'xxxxxxxxxxxxxxxx', baixo: 'R.....O...R..5..' }),
  G('maracatu', 'Maracatu (alfaia, caixa e gonguê)', 4, 4, 1, { surdo: 'X..X..X.X.X.X...', caixa: 'xxXxxxXxxxXxxxXx', agogo: 'X.x.X.x.X.x.X.x.' }),
  // 3/4 (6 passos)
  G('valsa', 'Valsa', 3, 2, 1, { bumbo: 'X.....', caixa: '..x.x.', baixo: 'R.....' }),
  G('guarania', 'Guarânia', 3, 2, 1, { bumbo: 'X.....', ganza: 'xxxxxx', baixo: 'R...5.' }),
  // 2/4 em semicolcheias (8 passos)
  G('samba', 'Samba (surdo, tamborim e pandeiro)', 2, 4, 1, { surdo: 'x...X...', tamborim: 'X.XX.X.X', pandeiro: 'xxxXxxxX', baixo: 'R...5...' }),
  G('pagode', 'Pagode (tantã, repique e pandeiro)', 2, 4, 1, { surdo: 'x...X...', conga: 'x.X.xxX.', pandeiro: 'xxxXxxxX', baixo: 'R...5...' }),
  G('choro', 'Choro (pandeiro)', 2, 4, 1, { pandeiro: 'XxxXXxxX', baixo: 'R...5...' }),
  G('bossa', 'Bossa nova (bumbo e aro)', 2, 4, 2, { bumbo: 'X..XX..XX..XX..X', caixa: 'x..x..x...x..x..', chimbal: 'xxxxxxxxxxxxxxxx', baixo: 'R...5...R...5...' }),
  G('mpb', 'MPB', 2, 4, 1, { bumbo: 'X...X...', caixa: '..x...x.', ganza: 'xxxxxxxx', baixo: 'R...5...' }),
  G('marchinha', 'Marchinha', 2, 4, 1, { bumbo: 'X...X...', caixa: 'X.xxX.xx', baixo: 'R...5...' }),
  G('axe', 'Axé', 2, 4, 1, { surdo: 'X...X...', caixa: 'x.xXx.xX', ganza: 'xxXxxxXx', baixo: 'R..5R...' }),
  G('frevo', 'Frevo', 2, 4, 1, { surdo: 'X...X...', caixa: 'xxXxxxXx', baixo: 'R...5...' }),
  G('baiao', 'Baião (zabumba e triângulo)', 2, 4, 1, { zabumba: 'X.xX..x.', triangulo: 'xxXxxxXx', baixo: 'R..R..5.' }),
  G('xote', 'Xote', 2, 4, 1, { zabumba: 'X..xX.x.', triangulo: 'x.X.x.X.', baixo: 'R...5...' }),
  G('forro', 'Forró pé de serra', 2, 4, 1, { zabumba: 'X..Xx.x.', triangulo: 'xxXxxxXx', baixo: 'R..R5...' }),
  G('arrasta-pe', 'Arrasta-pé', 2, 4, 1, { zabumba: 'X.x.X.x.', triangulo: 'xXxXxXxX', baixo: 'R.5.R.5.' }),
  G('vaneira', 'Vaneira', 2, 4, 1, { bumbo: 'X...X...', ganza: '..X...X.', baixo: 'R...5...' }),
  G('milonga', 'Milonga', 2, 4, 1, { bumbo: 'X..X..X.', baixo: 'R..5..R.' }),
  G('corrido', 'Corrido', 2, 4, 1, { bumbo: 'X...X...', caixa: '..x...x.', baixo: 'R...5...' }),
  G('caipira', 'Caipira (baixo e chocalho)', 2, 4, 1, { ganza: 'x.x.x.x.', baixo: 'R...5...' }),
  G('catira', 'Catira (palmas e sapateado)', 2, 4, 1, { bumbo: 'XXX.XXX.', palmas: '..X...XX' }),
  G('samba-roda', 'Samba de roda', 2, 4, 1, { pandeiro: 'xxxXxxxX', palmas: 'X..X..X.' }),
  G('samba-caipira', 'Samba caipira', 2, 4, 1, { surdo: 'x...X...', pandeiro: 'xxxXxxxX', baixo: 'R...5...' }),
  G('congada', 'Congada (caixas e gungas)', 2, 4, 1, { surdo: 'X...X...', caixa: 'X.xxX.xx', ganza: 'xxxxxxxx' }),
  G('batuque', 'Batuque', 2, 4, 1, { surdo: 'X..X..X.', conga: 'x.X.x.Xx' }),
  // 2/4 em colcheias (4 passos)
  G('polca', 'Polca', 2, 2, 1, { bumbo: 'X.X.', caixa: '.x.x', baixo: 'R.5.' }),
  // 6/8 (2 tempos de 3)
  G('chamame', 'Chamamé (6/8)', 2, 3, 1, { bumbo: 'X..X..', ganza: 'xxxxxx', baixo: 'R..5..' }),
  G('folia', 'Folia de Reis (6/8)', 2, 3, 1, { caixa: 'X.xX.x', baixo: 'R..5..' }),
  G('jongo', 'Jongo (tambu e candongueiro)', 2, 3, 1, { surdo: 'X....x', conga: 'xXxxXx' }),
].map(g => [g.id, g]));

/** Groove de cada ritmo (rhythms.js). */
export const BAND = {
  'so-baixo': 'pop', balada: 'balada', pop: 'pop', 'pop-rock': 'rock', rock: 'rock', folk: 'folk', country: 'country',
  dedilhado: 'balada', fingerstyle: 'folk', percussivo: 'pop', chuck: 'pop', valsa: 'valsa', bolero: 'bolero',
  blues: 'blues', shuffle: 'blues', jazz: 'jazz', swing: 'jazz', soul: 'soul', rnb: 'soul', funk: 'funk', disco: 'disco',
  island: 'calypso', reggae: 'reggae', ska: 'ska', 'samba-reggae': 'samba-reggae', rumba: 'rumba', 'rumba-flamenca': 'rumba',
  salsa: 'salsa', cumbia: 'cumbia', bachata: 'bachata', tango: 'tango', arrocha: 'sertanejo', 'sertanejo-univ': 'sertanejo',
  samba: 'samba', 'samba-cancao': 'choro', 'samba-rock': 'samba-rock', 'partido-alto': 'pagode', pagode: 'pagode',
  choro: 'choro', bossa: 'bossa', mpb: 'mpb', marchinha: 'marchinha', axe: 'axe', frevo: 'frevo', maracatu: 'maracatu',
  baiao: 'baiao', xote: 'xote', forro: 'forro', 'arrasta-pe': 'arrasta-pe', vaneira: 'vaneira', vaneirao: 'vaneira',
  chamame: 'chamame', milonga: 'milonga', polca: 'polca', 'polca-paraguaia': 'chamame', guarania: 'guarania',
  rasqueado: 'guarania', corrido: 'corrido', toada: 'caipira', moda: 'caipira', cururu: 'caipira', catere: 'caipira',
  recortado: 'caipira', 'pagode-viola': 'caipira', querumana: 'caipira', calango: 'caipira', 'cipo-preto': 'caipira',
  'cana-verde': 'caipira', 'samba-caipira': 'samba-caipira', 'samba-de-roda': 'samba-roda', batuque: 'batuque',
  catira: 'catira', folia: 'folia', congada: 'congada', mocambique: 'congada', chula: 'caipira', jongo: 'jongo',
  lundu: 'caipira', 'hawaiian-vamp': 'havaiana', 'kani-ka-pila': 'havaiana', hula: 'havaiana',
};

/** Groove do ritmo (cai no pop se faltar). */
export const grooveFor = rhythm => GROOVES[BAND[rhythm.id]] || GROOVES.pop;

/** Instrumentos padrão do groove, na ordem da tela. */
export const defaultParts = g => Object.keys(g.parts);

/** Padrão do instrumento no groove; para um instrumento "adicionado" (fora do padrão), gera uma levada genérica. */
export function partPattern(g, part) {
  if (g.parts[part]) return g.parts[part];
  const per = g.meter * g.sub;
  return Array.from({ length: per * g.bars }, (_, i) => {
    const k = i % g.sub, beat = Math.floor(i / g.sub) % g.meter, first = i % per === 0, onBeat = k === 0;
    const off = g.sub === 3 ? false : k === g.sub / 2, last = k === g.sub - 1;
    const back = onBeat && (g.meter === 4 ? beat % 2 === 1 : g.meter === 3 ? beat > 0 : beat === g.meter - 1);
    switch (part) {
      case 'bumbo': return first ? 'X' : '.';
      case 'caixa': case 'palmas': return back ? 'X' : '.';
      case 'chimbal': return 'x';
      case 'ganza': return onBeat ? 'X' : 'x';
      case 'pandeiro': return last ? 'X' : 'x';
      case 'triangulo': return off ? 'X' : 'x';
      case 'surdo': return onBeat ? (beat === g.meter - 1 ? 'X' : 'x') : '.';
      case 'zabumba': return first ? 'X' : off ? 'x' : '.';
      case 'tamborim': return off ? 'X' : '.';
      case 'clave': return onBeat ? 'X' : '.';
      case 'agogo': return first ? 'X' : onBeat ? 'x' : '.';
      case 'conga': return onBeat && beat === g.meter - 1 ? 'X' : off ? 'x' : '.';
      case 'baixo': return first ? 'R' : onBeat && g.meter % 2 === 0 && beat === g.meter / 2 ? '5' : '.';
      default: return '.';
    }
  }).join('');
}

/** Golpes de um tempo do groove (`beat` = índice do tempo no ciclo): [{ part, sym, frac }], frac = fração do tempo (0–1). */
export function beatEvents(g, beat, parts) {
  const b = beat % (g.meter * g.bars), out = [];
  for (const part of parts) {
    const p = partPattern(g, part);
    for (let k = 0; k < g.sub; k++) {
      const sym = p[b * g.sub + k];
      if (sym && sym !== '.') out.push({ part, sym, frac: k / g.sub });
    }
  }
  return out;
}

/** Nota MIDI do baixo: tônica entre Dó2 e Si2 (36–47); `5` = quinta acima, `O` = oitava. */
export const bassMidi = (pc, sym) => 36 + (((pc % 12) + 12) % 12) + (sym === '5' ? 7 : sym === 'O' ? 12 : 0);

/** Passos até a próxima nota do padrão (cíclico) — para o baixo soar até a nota seguinte. */
export function stepsToNext(pattern, i) {
  for (let k = 1; k <= pattern.length; k++) if (pattern[(i + k) % pattern.length] !== '.') return k;
  return pattern.length;
}
