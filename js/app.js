// app.js — orquestra interface, estado e eventos.
import { CATEGORIES, CHORD_TYPES, ROOT_GRID, TYPE_BY_Q, chordNotes, pcOf, spell, toPt } from './theory.js';
import { parseChord, suggest } from './parser.js';
import { INSTRUMENTS, DEFAULT_INSTRUMENT, DEFAULT_TUNING } from './instruments.js';
import { getVoicings } from './voicings.js';
import { renderDiagram } from './diagram.js';

const $ = id => document.getElementById(id);
const state = {
  instrument: DEFAULT_INSTRUMENT, tuning: DEFAULT_TUNING,
  chord: parseChord('C'), voicings: [], idx: 0, tab: 'basicos',
};
const inst = () => INSTRUMENTS[state.instrument];
const tun = () => inst().tunings[state.tuning];

function button(text, cls, onClick, attrs = {}) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = cls; b.textContent = text;
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  b.addEventListener('click', onClick);
  return b;
}

function chordTitle(c) {
  const t = TYPE_BY_Q[c.quality];
  const base = `${toPt(c.root)} ${t.q === '' ? 'maior' : t.name.toLowerCase()}`;
  return c.bass ? `${base} com baixo em ${toPt(c.bass)}` : base;
}

// ---------- Seleção ----------
function selectChord(chord) {
  if (!chord) return;
  state.chord = chord;
  state.voicings = getVoicings(chord, state.instrument, state.tuning, { max: 8 });
  state.idx = 0;
  render();
}

function setRoot(root) {
  const c = state.chord;
  let bass = null;
  if (c.bass) {
    // mantém o mesmo intervalo do baixo na nova tônica
    const notes = chordNotes(c);
    const tok = notes.formula[notes.pcs.indexOf(pcOf(c.bass))];
    bass = tok ? spell(root, tok) : null;
  }
  selectChord(parseChord(root + c.quality + (bass ? '/' + bass : '')));
}

// ---------- Renderização ----------
function renderRoots() {
  const box = $('tonicas');
  box.replaceChildren(...ROOT_GRID.map(r =>
    button(r, 'chip', () => setRoot(r), {
      'aria-pressed': String(pcOf(r) === pcOf(state.chord.root)), 'aria-label': `Tônica ${toPt(r)}`,
    })));
}

function inversionsFor(root) {
  return [['', '3'], ['', '5'], ['', '7b'], ['m', '3b'], ['m', '5'], ['m', '7b'], ['7', '3'], ['7', '7b']]
    .map(([q, tok]) => parseChord(root + q + '/' + spell(root, tok)));
}

// ---------- Instrumento e afinação ----------
function setInstrument(id) {
  if (id === state.instrument) return;
  state.instrument = id;
  state.tuning = Object.keys(INSTRUMENTS[id].tunings)[0];
  selectChord(state.chord);
}

function setTuning(tid) {
  if (tid === state.tuning) return;
  state.tuning = tid;
  selectChord(state.chord);
}

function renderInstruments() {
  $('instrumentos').replaceChildren(...Object.values(INSTRUMENTS).map(i =>
    button(i.name, 'chip', () => setInstrument(i.id), { 'aria-pressed': String(i.id === state.instrument) })));
  const tunings = Object.entries(inst().tunings);
  // Seletor rápido só quando há mais de uma afinação
  $('afinacoes').replaceChildren(...(tunings.length > 1 ? tunings : []).map(([tid, t]) =>
    button(t.short || t.name, 'chip', () => setTuning(tid), {
      'aria-pressed': String(tid === state.tuning), title: t.name, 'aria-label': `Afinação ${t.name}`,
    })));
  const t = tun();
  $('afinacao-info').textContent = `${inst().name} · ${t.name} · ${t.courses.map(c => c.notes.join('+')).join(' ')}`;
}

function renderTabs() {
  const tabs = $('abas');
  tabs.replaceChildren(...CATEGORIES.map(cat => {
    const sel = cat.id === state.tab;
    const b = button(cat.name, 'tab', () => { state.tab = cat.id; renderTabs(); }, {
      role: 'tab', id: `aba-${cat.id}`, 'aria-selected': String(sel), 'aria-controls': 'tipos', tabindex: sel ? '0' : '-1',
    });
    b.addEventListener('keydown', e => {
      const i = CATEGORIES.findIndex(c => c.id === state.tab);
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      state.tab = CATEGORIES[(i + d + CATEGORIES.length) % CATEGORIES.length].id;
      renderTabs();
      $(`aba-${state.tab}`).focus();
    });
    return b;
  }));
  const panel = $('tipos');
  panel.setAttribute('aria-labelledby', `aba-${state.tab}`);
  const root = state.chord.root;
  const chords = state.tab === 'inversoes'
    ? inversionsFor(root)
    : CHORD_TYPES.filter(t => t.cat === state.tab).map(t => parseChord(root + t.q));
  panel.replaceChildren(...chords.map(c => button(c.symbol, 'chip', () => selectChord(c), {
    'aria-pressed': String(c.symbol === state.chord.symbol), title: chordTitle(c),
  })));
}

function renderViewer() {
  const { chord, voicings, idx } = state;
  $('acorde-simbolo').textContent = chord.symbol;
  $('acorde-nome').textContent = chordTitle(chord);
  const v = voicings[idx];
  const main = $('diagrama');
  if (!v) {
    main.replaceChildren(Object.assign(document.createElement('p'), { className: 'empty', textContent: 'Sem posição viável para este acorde neste instrumento/afinação.' }));
    $('posicao-rotulo').textContent = '';
  } else {
    main.replaceChildren(renderDiagram(v, inst(), tun()));
    $('posicao-rotulo').innerHTML = '';
    $('posicao-rotulo').append(v.label);
    if (v.nick && v.nick.toLowerCase() !== v.label.toLowerCase()) $('posicao-rotulo').append(Object.assign(document.createElement('small'), { textContent: v.nick }));
  }
  $('posicao-contador').textContent = `Posição ${voicings.length ? idx + 1 : 0}/${voicings.length}`;
  $('anterior').disabled = idx <= 0;
  $('proxima').disabled = idx >= voicings.length - 1;
  $('miniaturas').replaceChildren(...voicings.map((vv, i) => {
    const b = button('', 'btn thumb', () => { state.idx = i; renderViewer(); renderAnalysis(); }, {
      'aria-pressed': String(i === idx), 'aria-label': `Posição ${i + 1}: ${vv.label}`,
    });
    const svg = renderDiagram(vv, inst(), tun(), { compact: true });
    svg.setAttribute('aria-hidden', 'true');
    b.append(svg, Object.assign(document.createElement('span'), { textContent: String(i + 1) }));
    return b;
  }));
}

function renderAnalysis() {
  const notes = chordNotes(state.chord);
  $('analise-notas').textContent = notes.names.join(' · ');
  $('analise-formula').textContent = notes.formula.join(' - ');
  const v = state.voicings[state.idx];
  const body = $('analise-tabela');
  body.replaceChildren(...tun().courses.map((c, i) => {
    const tr = document.createElement('tr');
    const f = v ? v.frets[i] : -1;
    const cells = [c.label, f < 0 ? 'x' : String(f), v && v.fingers[i] ? String(v.fingers[i]) : '–', v?.courseNotes[i] || '–'];
    cells.forEach(t => tr.append(Object.assign(document.createElement('td'), { textContent: t })));
    return tr;
  }).reverse()); // 1ª corda no topo, como na tablatura
}

function render() {
  renderInstruments();
  renderRoots();
  renderTabs();
  renderViewer();
  renderAnalysis();
}

function move(d) {
  const i = state.idx + d;
  if (i < 0 || i >= state.voicings.length) return;
  state.idx = i;
  renderViewer();
  renderAnalysis();
}

// ---------- Busca com autocomplete ----------
function setupSearch() {
  const input = $('busca'), list = $('sugestoes'), msg = $('busca-msg');
  let items = [], active = -1;

  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const paint = () => {
    list.replaceChildren(...items.map((sym, i) => {
      const li = document.createElement('li');
      li.id = `sug-${i}`; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', String(i === active));
      li.append(sym, Object.assign(document.createElement('small'), { textContent: chordTitle(parseChord(sym)) }));
      li.addEventListener('mousedown', e => { e.preventDefault(); choose(sym); });
      return li;
    }));
    if (active >= 0) input.setAttribute('aria-activedescendant', `sug-${active}`);
    else input.removeAttribute('aria-activedescendant');
  };
  const choose = sym => {
    const c = parseChord(sym);
    if (!c) { msg.textContent = `Cifra não reconhecida: “${sym}”`; return; }
    msg.textContent = '';
    input.value = c.symbol;
    close();
    selectChord(c);
  };

  input.addEventListener('input', () => {
    msg.textContent = '';
    items = suggest(input.value, 10);
    active = -1;
    if (!items.length) return close();
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
    paint();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (list.hidden || !items.length) return;
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      paint();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active >= 0 ? items[active] : input.value);
    } else if (e.key === 'Escape') {
      close();
    }
  });
  input.addEventListener('blur', close);
}

// ---------- Início ----------
$('anterior').addEventListener('click', () => move(-1));
$('proxima').addEventListener('click', () => move(1));
document.addEventListener('keydown', e => {
  if (e.target.closest('input, [role="tab"]')) return;
  if (e.key === 'ArrowLeft') move(-1);
  if (e.key === 'ArrowRight') move(1);
});
setupSearch();
selectChord(state.chord);
