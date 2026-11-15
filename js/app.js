// app.js — orquestra interface, estado e eventos.
import { CATEGORIES, CHORD_TYPES, ROOT_GRID, TYPE_BY_Q, chordNotes, pcOf, spell, toPt } from './theory.js';
import { parseChord, suggest } from './parser.js';
import { INSTRUMENTS, DEFAULT_INSTRUMENT, DEFAULT_TUNING } from './instruments.js';
import { getVoicings, identifyChord } from './voicings.js';
import { renderDiagram, renderEditor } from './diagram.js';
import { play, unlock, preloadSamples, scheduleFrets, scheduleClick, scheduleDrum, scheduleBass, stopAll, audioNow, audioLatency, audioState } from './audio.js';
import { createStorage, favoriteId, formatRoute, parseRoute, splitProgression } from './storage.js';
import { STUDY_PROGRESSIONS, STUDY_GROUPS, STUDY_KEYS, transposeProgression } from './progressions.js';
import { STROKES, LEVELS, rhythmsFor, countLabels, strokeFor, suggestedRhythm } from './rhythms.js';
import { PARTS, grooveFor, defaultParts, partPattern, beatEvents, bassMidi, stepsToNext } from './band.js';
import { trackView, trackEvent, trackEventDebounced, setEnabled as setStats, slug as gcSlug } from './analytics.js';

const $ = id => document.getElementById(id);
const state = {
  instrument: DEFAULT_INSTRUMENT, tuning: DEFAULT_TUNING,
  chord: parseChord('C'), voicings: [], idx: 0, tab: 'basicos',
  rehearsal: null,                 // { prog, pos } no modo ensaio
  rev: { frets: [], base: 1 },     // identificador reverso
};
const store = createStorage();
let routeMode = 'push';            // 'replace' ao aplicar um estado vindo da URL
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
/** Seleciona um acorde; `frets` (favorito) tem prioridade sobre `idx` para achar a posição. */
function selectChord(chord, { idx = 0, frets = null } = {}) {
  if (!chord) return;
  state.chord = chord;
  state.voicings = getVoicings(chord, state.instrument, state.tuning, { max: 8 });
  const byFrets = frets?.length ? state.voicings.findIndex(v => v.frets.join() === frets.join()) : -1;
  state.idx = byFrets >= 0 ? byFrets : Math.min(Math.max(idx, 0), Math.max(state.voicings.length - 1, 0));
  render();
  trackChord();
}

// ---------- Métricas (GoatCounter) ----------
let lastChordKey = '';
/** Conta o acorde visto (depois de 1,5 s parado nele, para não contar cada passo da navegação). */
function trackChord() {
  const key = `${state.instrument}/${state.tuning}/${state.chord.symbol}`;
  if (key === lastChordKey) return;
  trackEventDebounced('acorde', `acorde/${state.instrument}/${gcSlug(state.chord.symbol)}`, 1500, { title: `Acorde ${state.chord.symbol} (${inst().name})` });
  lastChordKey = key;
  if (!state.voicings.length) trackEventDebounced('acorde-vazio', `acorde-sem-posicao/${state.instrument}/${state.tuning}/${gcSlug(state.chord.symbol)}`, 1500);
}
const gc = (name, opts) => trackEvent(name, opts);
const trackInstrument = () => trackEventDebounced('instrumento', `instrumento/${state.instrument}/${state.tuning}`, 500);

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
    button(r, 'chip', () => { setRoot(r); sheetPicked('root'); }, {
      'aria-pressed': String(pcOf(r) === pcOf(state.chord.root)), 'aria-label': `Tônica ${toPt(r)}`,
    })));
}

function inversionsFor(root) {
  return [['', '3'], ['', '5'], ['', '7b'], ['m', '3b'], ['m', '5'], ['m', '7b'], ['7', '3'], ['7', '7b']]
    .map(([q, tok]) => parseChord(root + q + '/' + spell(root, tok)));
}

$('barra-tonica').addEventListener('click', () => openSheet('root'));
$('barra-tipo').addEventListener('click', () => openSheet('type'));
$('gaveta-fechar').addEventListener('click', () => $('gaveta').close());
$('gaveta').addEventListener('click', e => { if (e.target === $('gaveta')) $('gaveta').close(); });
$('gaveta').addEventListener('close', () => {
  document.querySelector('.picker').append($('seletor-acorde'));
  $(sheetFrom === 'root' ? 'barra-tonica' : 'barra-tipo').focus();
});
$('abas').addEventListener('scroll', tabsFade, { passive: true });
window.addEventListener('resize', tabsFade);
$('barra-instrumento').addEventListener('change', e => {
  const [i, t] = e.target.value.split('/');
  if (i !== state.instrument) setInstrument(i);
  setTuning(t);
});

// ---------- Instrumento e afinação ----------
function setInstrument(id) {
  if (id === state.instrument) return;
  state.instrument = id;
  state.tuning = Object.keys(INSTRUMENTS[id].tunings)[0];
  preloadSamples(id);
  trackInstrument();
  selectChord(state.chord);
  renderReverse();
  renderRhythms();
}

function setTuning(tid) {
  if (tid === state.tuning) return;
  state.tuning = tid;
  trackInstrument();
  selectChord(state.chord);
  renderReverse();
  renderRhythms();
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
  // Linha técnica só quando a afinação não é a padrão do instrumento
  // Barra compacta do celular: um seletor só para instrumento · afinação
  const sel = $('barra-instrumento');
  if (!sel.options.length) sel.replaceChildren(...Object.values(INSTRUMENTS).flatMap(i => Object.entries(i.tunings).map(([tid, tt]) =>
    Object.assign(document.createElement('option'), { value: `${i.id}/${tid}`, textContent: `${i.name}${Object.keys(i.tunings).length > 1 ? ' · ' + (tt.short || tt.name) : ''}` }))));
  sel.value = `${state.instrument}/${state.tuning}`;
  const t = tun();
  $('afinacao-info').hidden = state.tuning === Object.keys(inst().tunings)[0];
  $('afinacao-info').textContent = `${t.name} · ${t.courses.map(c => c.notes.join('+')).join(' ')}`;
}

const TAB_SHORT = { basicos: 'Básicos', setimas: '7ª e 6ª', extensoes: '9ª/11ª/13ª', alterados: 'Alterados', inversoes: 'Inversões' };

function renderTabs() {
  const tabs = $('abas');
  tabs.replaceChildren(...CATEGORIES.map(cat => {
    const sel = cat.id === state.tab;
    const b = button(TAB_SHORT[cat.id] || cat.name, 'tab', () => { state.tab = cat.id; renderTabs(); }, {
      role: 'tab', id: `aba-${cat.id}`, 'aria-selected': String(sel), 'aria-controls': 'tipos', tabindex: sel ? '0' : '-1', title: cat.name,
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
  panel.replaceChildren(...chords.map(c => button(c.symbol, 'chip', () => { selectChord(c); sheetPicked('type'); revealViewer(); }, {
    'aria-pressed': String(c.symbol === state.chord.symbol), title: chordTitle(c),
  })));
  tabsFade();
  // Barra compacta (celular)
  const ch = state.chord, ty = TYPE_BY_Q[ch.quality];
  $('barra-tonica').textContent = `${ch.root} ▾`;
  $('barra-tonica').setAttribute('aria-label', `Tônica: ${toPt(ch.root)}. Trocar`);
  const tname = ty.q === '' ? 'maior' : ty.name.toLowerCase();
  $('barra-tipo').textContent = `${ch.symbol.slice(ch.root.length) || 'maior'} ▾`;
  $('barra-tipo').setAttribute('aria-label', `Tipo: ${tname}${ch.bass ? ` com baixo em ${toPt(ch.bass)}` : ''}. Trocar`);
}

/** Esmaecido na borda das abas de tipo quando há mais para rolar. */
function tabsFade() {
  const t = $('abas');
  t.classList.toggle('more-left', t.scrollLeft > 2);
  t.classList.toggle('more-right', t.scrollLeft + t.clientWidth < t.scrollWidth - 2);
}

// ---------- Gaveta inferior (celular): tônica + tipos ----------
let sheetFrom = null;
function openSheet(from) {
  const sh = $('gaveta');
  if (sh.open) return;
  sheetFrom = from;
  $('gaveta-corpo').append($('seletor-acorde')); // move os mesmos controles do painel lateral
  sh.showModal();
  tabsFade();
  const target = from === 'root' ? $('tonicas').querySelector('[aria-pressed="true"]')
    : $('tipos').querySelector('[aria-pressed="true"]') || $(`aba-${state.tab}`);
  target?.focus();
  target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function sheetPicked(what) {
  const sh = $('gaveta');
  if (!sh.open) return;
  // Escolher o tipo sempre fecha; a tônica só fecha se a gaveta foi aberta por ela
  if (what === 'type' || sheetFrom === 'root') return sh.close();
  $('tonicas').querySelector('[aria-pressed="true"]')?.focus(); // renderRoots recriou os botões
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
    main.replaceChildren(renderDiagram(v, inst(), tun(), { leftHanded: lefty(), onString: course => playCurrent('dedilhar', course) }));
    $('posicao-rotulo').innerHTML = '';
    $('posicao-rotulo').append(v.label);
    if (v.nick && v.nick.toLowerCase() !== v.label.toLowerCase()) $('posicao-rotulo').append(Object.assign(document.createElement('small'), { textContent: v.nick }));
  }
  $('tocar-dedilhar').disabled = $('tocar-batida').disabled = !v;
  $('posicao-contador').textContent = `Posição ${voicings.length ? idx + 1 : 0}/${voicings.length}`;
  $('anterior').disabled = idx <= 0;
  $('proxima').disabled = idx >= voicings.length - 1;
  $('dica-deslizar-vis').hidden = !(mobile() && voicings.length > 1 && !seen('swipe'));
  $('miniaturas').replaceChildren(...voicings.map((vv, i) => {
    const b = button('', 'btn thumb', () => { state.idx = i; renderViewer(); renderAnalysis(); }, {
      'aria-pressed': String(i === idx), 'aria-label': `Posição ${i + 1}: ${vv.label}`,
    });
    const svg = renderDiagram(vv, inst(), tun(), { compact: true, leftHanded: lefty() });
    svg.setAttribute('aria-hidden', 'true');
    b.append(svg, Object.assign(document.createElement('span'), { textContent: String(i + 1) }));
    return b;
  }));
  renderFavButton();
  syncHash();
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
  }).reverse()); // 1ª corda no topo
}

function render() {
  renderInstruments();
  renderRoots();
  renderTabs();
  renderViewer();
  renderAnalysis();
  renderRehearsal();
}

function move(d) {
  const i = state.idx + d;
  if (i < 0 || i >= state.voicings.length) return false;
  state.idx = i;
  gc('posicao/trocar', { throttleMs: 10000 });
  renderViewer();
  renderAnalysis();
  renderStage();
  $('diagrama').firstElementChild?.classList.add(d > 0 ? 'slide-next' : 'slide-prev');
  return true;
}

// ---------- Áudio ----------
function playCurrent(mode, course = null) {
  const v = state.voicings[state.idx];
  if (!v) return;
  gc(`tocar/${course === null ? mode : 'corda'}${stageOpen() ? '-palco' : ''}`, { throttleMs: 5000 });
  play(v, state.instrument, tun(), { mode, course });
  checkSound();
}

/** Aviso de som só quando o áudio não conseguiu rodar depois de um toque. */
let soundTimer = 0;
function checkSound() {
  clearTimeout(soundTimer);
  soundTimer = setTimeout(() => {
    if (audioState() !== 'running') notify('Sem som? Toque de novo e confira o volume de mídia do aparelho.');
  }, 700);
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
    if (!c) { msg.textContent = `Cifra não reconhecida: “${sym}”`; gc(`busca/nao-reconhecida/${gcSlug(sym, 24)}`); return; }
    gc('busca/escolher');
    msg.textContent = '';
    input.value = c.symbol;
    close();
    input.blur(); // fecha o teclado do celular
    selectChord(c);
    showView('acordes');
    revealViewer();
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

// ---------- Rota na URL (#/violao/C7M/2) ----------
function syncHash() {
  const h = formatRoute({ instrument: state.instrument, tuning: state.tuning, symbol: state.chord.symbol, idx: state.idx }, INSTRUMENTS);
  if (location.hash === h) return;
  if (stageOpen()) history.replaceState(history.state, '', h); // o palco é uma única entrada no histórico
  else history[routeMode === 'replace' ? 'replaceState' : 'pushState'](null, '', h);
}

function applyRoute(hash) {
  const r = parseRoute(hash, INSTRUMENTS);
  const chord = r && parseChord(r.symbol);
  if (!chord) return false;
  const instChanged = r.instrument !== state.instrument || r.tuning !== state.tuning;
  state.instrument = r.instrument;
  state.tuning = r.tuning;
  routeMode = 'replace'; // não cria entrada nova no histórico (o voltar continua funcionando)
  try { selectChord(chord, { idx: r.idx }); } finally { routeMode = 'push'; }
  if (instChanged) renderReverse();
  return true;
}

// ---------- Preferências (diálogo Ajustes): tema, canhoto, dicas já vistas ----------
const lefty = () => store.prefs().leftHanded;
const seen = k => store.prefs().seen[k] === true;
const markSeen = k => { if (!seen(k)) store.setPref('seen', { ...store.prefs().seen, [k]: true }); };

function applyPrefs() {
  const { theme, leftHanded } = store.prefs();
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  document.querySelectorAll('input[name="tema"]').forEach(r => { r.checked = r.value === theme; });
  $('canhoto').checked = leftHanded;
  $('estatisticas').checked = store.prefs().stats;
  setStats(store.prefs().stats);
}

document.querySelectorAll('input[name="tema"]').forEach(r => r.addEventListener('change', () => {
  store.setPref('theme', r.value);
  applyPrefs();
  gc(`ajustes/tema/${r.value}`);
}));
$('canhoto').addEventListener('change', () => {
  store.setPref('leftHanded', $('canhoto').checked);
  gc(`ajustes/canhoto/${$('canhoto').checked ? 'sim' : 'nao'}`);
  applyPrefs();
  renderViewer();
  renderReverse();
});
$('ajustes-abrir').addEventListener('click', () => { $('backup-msg').textContent = ''; $('ajustes').showModal(); trackView('/ajustes', 'Ajustes'); });
$('estatisticas').addEventListener('change', () => {
  const on = $('estatisticas').checked;
  if (!on) gc('ajustes/estatisticas/desligar'); // último envio, antes de desligar
  store.setPref('stats', on);
  applyPrefs();
  if (on) gc('ajustes/estatisticas/ligar');
});
$('ajustes-fechar').addEventListener('click', () => $('ajustes').close());
// Toque fora do quadro (no fundo escurecido) fecha
$('ajustes').addEventListener('click', e => { if (e.target === $('ajustes')) $('ajustes').close(); });

// ---------- Favoritos ----------
const currentFav = () => {
  const v = state.voicings[state.idx];
  return v && { symbol: state.chord.symbol, instrument: state.instrument, tuning: state.tuning, idx: state.idx, frets: v.frets };
};
const tuningName = (i, t) => (Object.keys(INSTRUMENTS[i]?.tunings || {}).length > 1 ? ` · ${INSTRUMENTS[i].tunings[t]?.short || t}` : '');

function renderFavButton() {
  const f = currentFav(), on = !!f && store.isFavorite(f);
  const b = $('favoritar');
  b.disabled = !f;
  b.textContent = on ? '★ Favorito' : '☆ Favoritar';
  b.setAttribute('aria-pressed', String(on));
}

function openFavorite(f) {
  if (!INSTRUMENTS[f.instrument]?.tunings[f.tuning]) return;
  const instChanged = f.instrument !== state.instrument || f.tuning !== state.tuning;
  state.instrument = f.instrument;
  state.tuning = f.tuning;
  selectChord(parseChord(f.symbol), { idx: f.idx, frets: f.frets });
  gc('favorito/abrir');
  if (instChanged) renderReverse();
  showView('acordes');
  revealViewer();
}

function renderLibrary() {
  const favs = store.favorites();
  $('favoritos').replaceChildren(...(favs.length ? favs.map(f => {
    const li = document.createElement('li');
    const open = button('', 'btn open', () => openFavorite(f), { title: `Abrir ${f.symbol}` });
    open.append(`${f.symbol} `, Object.assign(document.createElement('small'), {
      textContent: `${INSTRUMENTS[f.instrument]?.name || f.instrument}${tuningName(f.instrument, f.tuning)} · posição ${f.idx + 1}`,
    }));
    li.append(open, button('✕', 'btn small', () => { store.removeFavorite(f.id); gc('favorito/remover'); renderLibrary(); renderFavButton(); }, { 'aria-label': `Remover ${f.symbol} dos favoritos` }));
    return li;
  }) : [Object.assign(document.createElement('li'), { className: 'empty-item', textContent: 'Nenhum favorito ainda. Use “☆ Favoritar” no diagrama.' })]));

  const progs = store.progressions();
  $('progressoes').replaceChildren(...(progs.length ? progs.map(p => {
    const li = document.createElement('li');
    const open = button('', 'btn open', () => { gc('progressao/ensaiar-minha'); startRehearsal(p); }, { title: `Ensaiar ${p.name}` });
    open.append(`▶ ${p.name} `, Object.assign(document.createElement('small'), { textContent: p.chords.join(' → ') }));
    li.append(open, button('✕', 'btn small', () => {
      store.removeProgression(p.id);
      gc('progressao/apagar');
      if (state.rehearsal?.prog.id === p.id) state.rehearsal = null;
      renderLibrary(); renderRehearsal();
    }, { 'aria-label': `Apagar a progressão ${p.name}` }));
    return li;
  }) : [Object.assign(document.createElement('li'), { className: 'empty-item', textContent: 'Nenhuma progressão sua ainda. Crie acima ou copie uma das progressões para estudo.' })]));
  renderStudy();
}

// ---------- Progressões para estudo (pré-definidas, em qualquer tom) ----------
function renderStudy() {
  const key = store.prefs().studyKey, sel = $('estudo-tom');
  if (!sel.options.length) sel.replaceChildren(...STUDY_KEYS.map(k => Object.assign(document.createElement('option'), { value: k, textContent: `${k} (${toPt(k)})` })));
  sel.value = STUDY_KEYS.includes(key) ? key : 'C';
  $('estudo-lista').replaceChildren(...STUDY_GROUPS.flatMap(g => {
    const items = STUDY_PROGRESSIONS.filter(p => p.group === g).map(p => {
      const t = transposeProgression(p, sel.value, parseChord);
      const name = `${p.name} em ${toPt(sel.value)}${p.minor ? ' menor' : ''}`;
      const li = document.createElement('li');
      const open = button('', 'btn open study-open', () => {
        gc(`estudo/ensaiar/${gcSlug(p.id || p.name)}`, { title: `Estudo: ${p.name} em ${sel.value}` });
        startRehearsal({ id: t.id, name, chords: t.chords });
      }, { title: `${p.tip} Toque para ensaiar.` });
      open.append(`▶ ${p.name} `, Object.assign(document.createElement('small'), { textContent: p.roman }),
        Object.assign(document.createElement('span'), { className: 'study-chords', textContent: t.chords.join(' → ') }));
      li.append(open, button('Copiar', 'btn small', () => { gc(`estudo/copiar/${gcSlug(p.id || p.name)}`); copyProgression(name, t.chords); }, { 'aria-label': `Copiar ${p.name} para criar a sua` }));
      if (p.songs?.length) li.append(studySongs(p, sel.value));
      return li;
    });
    const ul = Object.assign(document.createElement('ul'), { className: 'item-list study-list' });
    ul.append(...items);
    return [Object.assign(document.createElement('h3'), { className: 'study-group', textContent: g }), ul];
  }));
}

/** Músicas que usam a progressão; as do tom escolhido vêm primeiro e destacadas. Tocar numa leva ao tom original dela. */
function studySongs(p, key) {
  const box = Object.assign(document.createElement('div'), { className: 'study-songs' });
  const inKey = s => s.k && pcOf(s.k) === pcOf(key);
  const songs = [...p.songs].sort((a, b) => inKey(b) - inKey(a));
  box.append(Object.assign(document.createElement('small'), { textContent: 'Músicas:' }));
  for (const s of songs) {
    const tom = s.k ? `${toPt(s.k)}${p.minor ? ' menor' : ''}` : '';
    if (!s.k) { box.append(Object.assign(document.createElement('span'), { className: 'chip', textContent: `${s.t} · ${s.a}`, title: 'Tom varia (tradicional)' })); continue; }
    box.append(button(`${inKey(s) ? '★ ' : ''}${s.t} · ${s.a} · ${tom}`, `chip${inKey(s) ? ' in-key' : ''}`, () => {
      const k = STUDY_KEYS.find(x => pcOf(x) === pcOf(s.k));
      gc(`estudo/musica/${gcSlug(s.t)}`);
      store.setPref('studyKey', k);
      renderStudy();
      notify(`${p.name} no tom de “${s.t}”: ${toPt(k)}${p.minor ? ' menor' : ''}`);
    }, { title: inKey(s) ? 'No tom escolhido (tom original da música)' : `Tom original: ${tom}. Toque para estudar neste tom.` }));
  }
  return box;
}

/** Leva uma progressão para o formulário de "Minhas progressões" (para editar e salvar). */
function copyProgression(name, chords) {
  $('prog-nome').value = name;
  $('prog-acordes').value = chords.join(', ');
  renderDraft();
  $('prog-msg').textContent = 'Edite à vontade e toque em “Salvar progressão”.';
  $('prog-nova').open = true;
  $('prog-form').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  $('prog-acordes').focus({ preventScroll: true });
}
$('estudo-tom').addEventListener('change', e => { store.setPref('studyKey', e.target.value); gc(`estudo/tom/${gcSlug(e.target.value)}`); renderStudy(); });

$('favoritar').addEventListener('click', () => {
  const f = currentFav();
  if (!f) return;
  if (store.isFavorite(f)) { store.removeFavorite(favoriteId(f)); notify('Removido dos favoritos'); gc('favorito/remover'); }
  else {
    notify(store.addFavorite(f) ? `${f.symbol} salvo nos favoritos` : 'Não foi possível salvar (armazenamento indisponível)');
    gc('favorito/adicionar');
  }
  renderFavButton();
  renderLibrary();
});

// ---------- Progressões e modo ensaio ----------
// "＋ Progressão" no visualizador: acrescenta o acorde ao rascunho do formulário do Repertório
function renderDraft() {
  const parts = splitProgression($('prog-acordes').value, parseChord);
  $('prog-rascunho').textContent = parts.length ? `Rascunho: ${parts.join(' → ')}` : '';
}
$('add-prog').addEventListener('click', () => {
  const v = $('prog-acordes').value.trim();
  $('prog-acordes').value = v ? `${v}, ${state.chord.symbol}` : state.chord.symbol;
  renderDraft();
  gc('progressao/adicionar-acorde');
  notify(`${state.chord.symbol} na progressão — salve em Repertório`);
});
$('prog-acordes').addEventListener('input', renderDraft);

$('prog-form').addEventListener('submit', e => {
  e.preventDefault();
  const msg = $('prog-msg');
  const parts = splitProgression($('prog-acordes').value, parseChord);
  const bad = parts.filter(p => !parseChord(p));
  if (!parts.length) { msg.textContent = 'Digite ao menos um acorde.'; return; }
  if (bad.length) { msg.textContent = `Cifra não reconhecida: ${bad.join(', ')}`; return; }
  const chords = parts.map(p => parseChord(p).symbol);
  const prog = store.saveProgression({ name: $('prog-nome').value.trim() || chords.join(' → '), chords });
  msg.textContent = `Progressão “${prog.name}” salva.`;
  gc('progressao/salvar', { title: `Progressão salva (${chords.length} acordes)` });
  notify('Progressão salva');
  $('prog-nome').value = $('prog-acordes').value = '';
  renderDraft();
  renderLibrary();
});

function startRehearsal(prog) {
  stopAuto();
  state.rehearsal = { prog, pos: 0 };
  goRehearsal(0);
  showView('acordes');
  revealViewer();
}

function goRehearsal(pos, fromAuto = false) {
  const r = state.rehearsal;
  if (!r || pos < 0 || pos >= r.prog.chords.length) return;
  if (!fromAuto) stopAuto(); // navegar à mão interrompe o "Tocar progressão"
  r.pos = pos;
  selectChord(parseChord(r.prog.chords[pos])); // render() atualiza a barra de ensaio
}

function renderRehearsal() {
  const r = state.rehearsal, box = $('ensaio');
  box.hidden = !r;
  if (!r) return;
  const n = r.prog.chords.length;
  $('ensaio-nome').textContent = `Ensaio: ${r.prog.name}`;
  $('ensaio-contador').textContent = `${r.pos + 1}/${n}`;
  $('ensaio-acordes').replaceChildren(...r.prog.chords.map((c, i) => button(c, 'chip', () => goRehearsal(i), {
    'aria-pressed': String(i === r.pos), 'aria-label': `Acorde ${i + 1}: ${c}`,
  })));
  $('ensaio-anterior').disabled = r.pos <= 0;
  $('ensaio-proximo').disabled = r.pos >= n - 1;
  $('ensaio-notas').textContent = `${state.chord.symbol}: ${chordNotes(state.chord).names.join(' · ')}`;
  renderStage();
}

// ---------- Tocar a progressão sozinha (agendada no relógio do áudio) ----------
const auto = { on: false, timer: 0, ui: [], chord: 0, beat: 0, next: 0, end: 0, frets: [] };
function startAuto() {
  const r = state.rehearsal;
  if (!r || !unlock() || audioNow() === null) return;
  stopRhythm();
  auto.frets = r.prog.chords.map(s => getVoicings(parseChord(s), state.instrument, state.tuning, { max: 8 })[0]?.frets || null);
  Object.assign(auto, { on: true, chord: r.pos, beat: 0, next: audioNow() + 0.15, end: 0 });
  gc('ensaio/tocar-progressao', { title: `Tocar progressão: ${r.prog.name}` });
  renderAutoBtn();
  autoTick();
  checkSound();
}
function stopAuto() {
  if (!auto.on) return;
  auto.on = false;
  clearTimeout(auto.timer);
  auto.ui.forEach(clearTimeout);
  auto.ui = [];
  stopAll();
  renderAutoBtn();
}
function autoTick() {
  if (!auto.on || !state.rehearsal) return;
  const n = state.rehearsal.prog.chords.length, spb = 60 / +$('ensaio-bpm').value, beats = +$('ensaio-tempos').value;
  const now = audioNow();
  if (auto.end && now >= auto.end) { stopAuto(); return; }
  while (!auto.end && auto.next < now + 0.3) {
    const i = auto.chord, when = auto.next;
    if (auto.beat === 0) { // troca o diagrama/notas quando o acorde soa
      const id = setTimeout(() => { auto.ui = auto.ui.filter(x => x !== id); if (auto.on) goRehearsal(i, true); },
        Math.max(0, (when - now + audioLatency()) * 1000));
      auto.ui.push(id);
    }
    if (auto.frets[i]) scheduleFrets(auto.frets[i], state.instrument, tun(), when,
      { strum: auto.beat === 0 ? 0.02 : 0.012, gain: auto.beat === 0 ? 1 : 0.5, dur: spb });
    auto.next += spb;
    if (++auto.beat >= beats) {
      auto.beat = 0;
      if (++auto.chord >= n) {
        if ($('ensaio-repetir').checked) auto.chord = 0;
        else auto.end = auto.next + spb; // deixa o último acorde soar
      }
    }
  }
  auto.timer = setTimeout(autoTick, 60);
}
function renderAutoBtn() {
  const b = $('ensaio-auto');
  b.textContent = auto.on ? '■ Parar' : '▶ Tocar progressão';
  b.setAttribute('aria-pressed', String(auto.on));
}
$('ensaio-auto').addEventListener('click', () => (auto.on ? stopAuto() : startAuto()));

$('ensaio-anterior').addEventListener('click', () => goRehearsal(state.rehearsal.pos - 1));
$('ensaio-proximo').addEventListener('click', () => goRehearsal(state.rehearsal.pos + 1));
$('ensaio-tocar').addEventListener('click', () => playCurrent('batida'));
$('ensaio-sair').addEventListener('click', () => { gc('ensaio/sair'); stopAuto(); closeStage(); state.rehearsal = null; renderRehearsal(); });
$('ensaio-palco').addEventListener('click', () => { gc('ensaio/palco'); openStage(); });

// ---------- Ritmos: padrão de mão direita tocado sobre uma progressão ----------
const rt = { id: 'balada', prog: 'um', on: false, timer: 0, ui: [], chord: 0, step: 0, cycle: 0, next: 0, shown: -1, chords: [], frets: [], bassPc: [], bpm: 76, beat: 0,
  band: { on: false, for: null, parts: new Set() } };
const rhythm = () => rhythmsFor(state.instrument).find(r => r.id === rt.id) || rhythmsFor(state.instrument)[0];
const option = (value, text) => Object.assign(document.createElement('option'), { value, textContent: text });

function rtProgression() {
  const [kind, id] = rt.prog.split(':');
  const st = kind === 'estudo' && STUDY_PROGRESSIONS.find(x => x.id === id);
  if (st) return transposeProgression(st, store.prefs().studyKey, parseChord);
  rt.prog = 'um';
  return { name: state.chord.symbol, chords: [state.chord.symbol] };
}

function renderRhythms() {
  stopRhythm();
  const list = rhythmsFor(state.instrument), r = rhythm();
  rt.id = r.id;
  $('rt-instrumentos').replaceChildren(...Object.values(INSTRUMENTS).map(i =>
    button(i.name, 'chip', () => setInstrument(i.id), { 'aria-pressed': String(i.id === state.instrument) })));
  renderRtList();
  $('rt-titulo').textContent = `Como tocar: ${r.name}`;
  $('rt-trocar').replaceChildren(Object.assign(document.createElement('span'), { textContent: `${r.name} · ${LEVELS[r.lvl]}` }),
    Object.assign(document.createElement('small'), { textContent: `${inst().name} — trocar ritmo ▾` }));
  $('rt-dica').textContent = r.tip;
  renderBand();
  const counts = countLabels(r);
  $('rt-grade').replaceChildren(...[...r.steps].map((s, i) => {
    const d = document.createElement('div');
    d.className = `rt-step${i % r.sub === 0 ? ' beat' : ''}${STROKES[s]?.soft ? ' soft' : ''}`;
    d.append(Object.assign(document.createElement('b'), { textContent: STROKES[s]?.label || '' }),
      Object.assign(document.createElement('span'), { textContent: counts[i] }));
    return d;
  }));
  $('rt-grade').setAttribute('aria-label', `Padrão de ${r.name}: ` +
    [...r.steps].map((s, i) => `${counts[i]} ${STROKES[s]?.name.split(':')[0].toLowerCase() || 'pausa'}`).join(', '));
  $('rt-legenda').replaceChildren(...[...new Set(r.steps.replace(/\./g, ''))].map(s => {
    const li = document.createElement('li');
    li.append(Object.assign(document.createElement('b'), { textContent: STROKES[s].label }), STROKES[s].name);
    return li;
  }), Object.assign(document.createElement('li'), { textContent: '· = a mão passa sem tocar (deixe soar)' }),
  ...(r.swing ? [Object.assign(document.createElement('li'), { textContent: 'Swing: o “e” vem atrasado, como “TÁ-ra TÁ-ra”' })] : []));
  // Progressões: um acorde só e as de estudo (no tom escolhido); as do usuário ficam no Repertório
  const sel = $('rt-prog');
  const um = option('um', `Só um acorde (${state.chord.symbol}) — para treinar a mão`);
  const groups = STUDY_GROUPS.map(g => {
    const og = Object.assign(document.createElement('optgroup'), { label: `Estudo · ${g}` });
    og.append(...STUDY_PROGRESSIONS.filter(p => p.group === g).map(p => option(`estudo:${p.id}`, `${p.name} (${p.roman})`)));
    return og;
  });
  sel.replaceChildren(um, ...groups);
  rtProgression();
  sel.value = rt.prog;
  const tom = $('rt-tom');
  if (!tom.options.length) tom.append(...STUDY_KEYS.map(k => option(k, toPt(k))));
  tom.value = store.prefs().studyKey;
  tom.disabled = !rt.prog.startsWith('estudo:');
  // Ritmo típico da progressão de estudo escolhida
  const sug = rt.prog.startsWith('estudo:') && suggestedRhythm(rt.prog.slice(7), state.instrument);
  const sp = $('rt-sugestao');
  sp.hidden = !sug || sug === r.id;
  if (!sp.hidden) {
    const sr = list.find(x => x.id === sug);
    sp.replaceChildren(`Ritmo típico desta progressão: ${sr.name}`, button('Usar', 'btn', () => { gc('ritmo/sugerido'); selectRhythm(sug); }));
  }
  loadRtChords();
}

// Lista de ritmos do instrumento, filtrada pela busca (nome ou estilo, sem acento)
const fold = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function renderRtList() {
  const q = fold($('rt-busca').value.trim()), r = rhythm();
  const list = rhythmsFor(state.instrument).filter(x => !q || fold(`${x.name} ${x.style}`).includes(q));
  $('rt-lista').replaceChildren(...(list.length ? list.map(x => {
    const li = document.createElement('li');
    const b = button('', 'chip', () => selectRhythm(x.id), { 'aria-pressed': String(x.id === r.id) });
    b.append(Object.assign(document.createElement('span'), { textContent: x.name }),
      Object.assign(document.createElement('span'), { className: 'lvl', textContent: LEVELS[x.lvl] }),
      Object.assign(document.createElement('small'), { textContent: x.style }));
    li.append(b);
    return li;
  }) : [Object.assign(document.createElement('li'), { className: 'empty-item', textContent: 'Nenhum ritmo com esse nome neste instrumento.' })]));
  $('rt-total').textContent = `${list.length} de ${rhythmsFor(state.instrument).length} ritmos`;
}
$('rt-busca').addEventListener('input', renderRtList);
// Celular: a lista de ritmos (com instrumento e busca) abre numa gaveta, como a escolha de acorde
$('rt-trocar').addEventListener('click', () => {
  $('rt-gaveta-corpo').append($('rt-escolha'));
  $('rt-gaveta').showModal();
  gc('ritmo/gaveta');
  ($('rt-lista').querySelector('[aria-pressed="true"]') || $('rt-busca')).focus();
  $('rt-lista').querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'center' });
});
$('rt-gaveta-fechar').addEventListener('click', () => $('rt-gaveta').close());
$('rt-gaveta').addEventListener('click', e => { if (e.target === $('rt-gaveta')) $('rt-gaveta').close(); });
$('rt-gaveta').addEventListener('close', () => {
  document.querySelector('.rhythms .rt-col').append($('rt-escolha'));
  $('rt-trocar').focus();
});

function selectRhythm(id) {
  rt.id = id;
  if ($('rt-gaveta').open) $('rt-gaveta').close();
  setBpm(rhythm().bpm);
  gc(`ritmo/escolher/${id}`);
  renderRhythms();
}

function loadRtChords() {
  rt.chords = rtProgression().chords;
  rt.bassPc = rt.chords.map(c => { const p = parseChord(c); return p ? pcOf(p.bass || p.root) : null; });
  rt.frets = rt.chords.map(c => getVoicings(parseChord(c), state.instrument, state.tuning, { max: 8 })[0]?.frets || null);
  rt.shown = -1;
  showRtChord(0);
}

function showRtChord(i) {
  if (rt.shown === i) return;
  rt.shown = i;
  const sym = rt.chords[i], v = getVoicings(parseChord(sym), state.instrument, state.tuning, { max: 8 })[0];
  $('rt-diagrama').replaceChildren(...(v ? [renderDiagram(v, inst(), tun(), { compact: true, leftHanded: lefty() })] : []));
  $('rt-acorde').textContent = sym;
  $('rt-barra-acorde').textContent = rt.chords.length > 1 ? `${sym} → ${rt.chords[(i + 1) % rt.chords.length]}` : sym;
  $('rt-proximo').textContent = rt.chords.length > 1
    ? `Acorde ${i + 1} de ${rt.chords.length} · próximo: ${rt.chords[(i + 1) % rt.chords.length]}` : 'Repita até a mão ficar solta.';
}

function setBpm(v) {
  rt.bpm = Math.max(40, Math.min(160, Math.round(v)));
  $('rt-bpm').value = rt.bpm;
  $('rt-bpm-txt').textContent = `${rt.bpm} BPM`;
}

function startRhythm() {
  if (!unlock() || audioNow() === null) return;
  stopAuto();
  const r = rhythm();
  Object.assign(rt, { on: true, chord: 0, step: 0, cycle: 0, beat: 0, next: audioNow() + 0.15,
    count: $('rt-contagem').checked ? r.meter * (r.meter <= 2 ? 2 : 1) : 0 });
  gc(`ritmo/tocar/${rt.id}`, { title: `Ritmo: ${rhythm().name}`, throttleMs: 5000 });
  renderRtBtn();
  rtTick();
  checkSound();
  keepAwake();
}
function stopRhythm() {
  if (!rt.on) return;
  rt.on = false;
  clearTimeout(rt.timer);
  rt.ui.forEach(clearTimeout);
  rt.ui = [];
  stopAll();
  document.querySelectorAll('.rt-step.now').forEach(e => e.classList.remove('now'));
  rt.shown = -1;
  showRtChord(0);
  renderRtBtn();
  letSleep();
}
function rtTick() {
  if (!rt.on) return;
  const r = rhythm(), now = audioNow(), cycles = +$('rt-ciclos').value;
  const later = (when, fn) => {
    const id = setTimeout(() => { rt.ui = rt.ui.filter(x => x !== id); if (rt.on) fn(); }, Math.max(0, (when - now + audioLatency()) * 1000));
    rt.ui.push(id);
  };
  while (rt.next < now + 0.3) {
    if (rt.count > 0) { // contagem antes de começar: só cliques
      const n = rt.count, total = r.meter * (r.meter <= 2 ? 2 : 1), beat = total - n;
      scheduleClick(rt.next, beat % r.meter === 0);
      later(rt.next, () => { $('rt-proximo').replaceChildren(Object.assign(document.createElement('span'), { className: 'rt-proximo-count', textContent: `Prepare-se… ${beat % r.meter + 1}` })); });
      rt.next += 60 / rt.bpm;
      rt.count--;
      continue;
    }
    const ci = rt.chord, step = rt.step, when = rt.next + (r.swing && step % 2 ? 60 / rt.bpm / r.sub / 3 : 0);
    if ($('rt-metronomo').checked && step % r.sub === 0) scheduleClick(when, step % (r.meter * r.sub) === 0);
    if (rt.band.on && step % r.sub === 0) rtBand(r, ci, when);
    const instVol = +$('rt-som-vol').value / 100;
    const st = instVol > 0 && rt.frets[ci] && strokeFor(r.steps[step], rt.frets[ci]);
    if (st) scheduleFrets(st.frets, state.instrument, tun(), when + jitter(0.004), { ...st, gain: instVol * st.gain * (step % r.sub === 0 ? 1 : 0.85) * (1 + jitter(0.08)) });
    later(when, () => {
      if (step === 0 && ci === 0) rt.shown = -1; // após a contagem, repõe o texto do próximo acorde
      showRtChord(ci);
      document.querySelectorAll('.rt-step').forEach((e, k) => e.classList.toggle('now', k === step));
    });
    rt.next += 60 / rt.bpm / r.sub;
    if (++rt.step >= r.steps.length) {
      rt.step = 0;
      if (++rt.cycle >= cycles) {
        rt.cycle = 0;
        if (++rt.chord >= rt.chords.length) {
          rt.chord = 0;
          if ($('rt-acelerar').checked && rt.bpm < r.bpm + 20) setBpm(Math.min(rt.bpm + 4, r.bpm + 20));
        }
      }
    }
  }
  rt.timer = setTimeout(rtTick, 60);
}
// Toque humano: pequena variação aleatória (±amp) de tempo/força; zero com a opção desligada
const jitter = amp => ($('rt-humano').checked ? (Math.random() * 2 - 1) * amp : 0);
// Acompanhamento: percussão e baixo do groove do ritmo, um tempo de cada vez (no início de cada tempo do ritmo)
function rtBand(r, ci, t0) {
  const g = grooveFor(r), beatDur = 60 / rt.bpm, stepDur = beatDur / g.sub, vol = +$('rt-banda-vol').value / 100;
  const b = rt.beat++ % (g.meter * g.bars);
  for (const e of beatEvents(g, b, [...rt.band.parts])) {
    const when = t0 + (r.swing && g.sub === 2 && e.frac ? 2 / 3 : e.frac) * beatDur + jitter(0.006);
    if (e.part !== 'baixo') { scheduleDrum(e.part, when, { accent: e.sym === 'X', gain: vol, human: $('rt-humano').checked ? 1 : 0 }); continue; }
    if (rt.bassPc[ci] == null) continue;
    const len = stepsToNext(partPattern(g, 'baixo'), b * g.sub + Math.round(e.frac * g.sub)) * stepDur * 0.9;
    scheduleBass(bassMidi(rt.bassPc[ci], e.sym), when, { len, gain: vol * (1 + jitter(0.08)) });
  }
}
// Instrumentos do acompanhamento: os padrões do ritmo (ligados; toque para mutar) e outros para adicionar
function renderBand() {
  const r = rhythm(), g = grooveFor(r), defs = defaultParts(g), bd = rt.band;
  if (bd.for !== r.id) { bd.for = r.id; bd.parts = new Set(defs); }
  $('rt-banda').checked = bd.on;
  $('rt-banda-pecas').hidden = !bd.on;
  $('rt-banda-nome').textContent = `Levada: ${g.name}`;
  const chip = (id, extra) => button(`${extra ? '+ ' : ''}${PARTS[id].name}`, 'chip', () => {
    const on = !bd.parts.has(id);
    on ? bd.parts.add(id) : bd.parts.delete(id);
    gc(`ritmo/banda/${on ? 'ligar' : 'mutar'}/${id}`);
    renderBand();
  }, { 'aria-pressed': String(bd.parts.has(id)), title: bd.parts.has(id) ? 'Tocando — toque para mutar' : extra ? 'Toque para adicionar' : 'Mudo — toque para ligar' });
  $('rt-banda-padrao').replaceChildren(...defs.map(id => chip(id)));
  $('rt-banda-extra').replaceChildren(...Object.keys(PARTS).filter(id => !defs.includes(id)).map(id => chip(id, true)));
}
$('rt-banda').addEventListener('change', e => { rt.band.on = e.target.checked; if (rt.band.on) { preloadSamples('baixo'); preloadSamples('percussao'); } gc(`ritmo/banda/${rt.band.on ? 'ativar' : 'desativar'}`); renderBand(); });
$('rt-som-vol').addEventListener('input', e => { $('rt-som-vol-txt').textContent = `${e.target.value}%`; });
$('rt-som-vol').addEventListener('change', e => gc(`ritmo/volume-instrumento/${e.target.value}`, { throttleMs: 10000 }));
$('rt-banda-reset').addEventListener('click', () => { rt.band.for = null; gc('ritmo/banda/padrao'); renderBand(); });

function renderRtBtn() {
  const b = $('rt-tocar');
  b.textContent = rt.on ? '■ Parar' : '▶ Tocar';
  b.setAttribute('aria-pressed', String(rt.on));
}
$('rt-tocar').addEventListener('click', () => (rt.on ? stopRhythm() : startRhythm()));
$('rt-menos').addEventListener('click', () => setBpm(rt.bpm - 5));
$('rt-mais').addEventListener('click', () => setBpm(rt.bpm + 5));
$('rt-bpm').addEventListener('input', e => setBpm(+e.target.value));
// Bater o tempo: média dos últimos intervalos (recomeça após 2 s sem tocar)
const taps = [];
$('rt-bater').addEventListener('click', () => {
  const t = performance.now();
  if (taps.length && t - taps[taps.length - 1] > 2000) taps.length = 0;
  taps.push(t);
  if (taps.length > 5) taps.shift();
  if (taps.length >= 2) setBpm(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
  if (taps.length === 4) gc('ritmo/bater-tempo', { throttleMs: 10000 });
});
$('rt-prog').addEventListener('change', e => { rt.prog = e.target.value; gc(`ritmo/progressao/${gcSlug(rt.prog)}`); renderRhythms(); });
$('rt-tom').addEventListener('change', e => { store.setPref('studyKey', e.target.value); renderStudy(); renderRhythms(); });
setBpm(rhythm().bpm);

// ---------- Backup (JSON) ----------
function downloadJSON(text, name) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const today = () => new Date().toISOString().slice(0, 10);
const exportBackup = () => downloadJSON(store.exportJSON(), `dicionario-acordes-backup-${today()}.json`);
$('exportar').addEventListener('click', () => {
  exportBackup();
  gc('backup/exportar');
  $('backup-msg').textContent = 'Backup exportado.';
});
$('importar').addEventListener('click', () => $('importar-arquivo').click());
$('importar-arquivo').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const n = store.importJSON(await file.text());
    gc('backup/importar');
    $('backup-msg').textContent = `Importados: ${n.favorites} favorito(s) e ${n.progressions} progressão(ões).`;
  } catch (err) {
    $('backup-msg').textContent = err.message;
    gc('backup/importar-erro');
  }
  applyPrefs(); renderLibrary(); renderViewer(); renderReverse();
});
$('apagar-tudo').addEventListener('click', () => {
  if (!confirm('Apagar todos os favoritos, progressões e preferências? Exporte um backup antes, se quiser guardá-los.')) return;
  gc('dados/apagar-tudo');
  store.clear();
  state.rehearsal = null;
  applyPrefs(); renderLibrary(); renderViewer(); renderRehearsal(); renderReverse();
  $('backup-msg').textContent = 'Dados apagados.';
});

// ---------- Identificador reverso ----------
const REV_ROWS = 5;
const fmtFrets = fr => (fr.some(f => f > 9) ? fr.map(f => (f < 0 ? 'x' : f)).join('-') : fr.map(f => (f < 0 ? 'x' : f)).join(''));

/** 'x32010' ou 'x-3-2-0-1-0' → casas | null */
function parseFrets(text, n) {
  const s = text.trim();
  if (!s) return null;
  const toks = /[\s,-]/.test(s) ? s.split(/[\s,-]+/).filter(Boolean) : [...s];
  if (toks.length !== n) return null;
  const fr = toks.map(t => (/^[xX]$/.test(t) ? -1 : /^\d{1,2}$/.test(t) && +t <= 12 ? +t : NaN));
  return fr.some(Number.isNaN) ? null : fr;
}

function renderReverse({ keepInput = false } = {}) {
  const n = tun().courses.length, rev = state.rev;
  if (rev.frets.length !== n) rev.frets = new Array(n).fill(-1);
  $('reverso-braco').replaceChildren(renderEditor(rev.frets, inst(), tun(), {
    baseFret: rev.base, rows: REV_ROWS, leftHanded: lefty(),
    onChange: fr => { rev.frets = fr; renderReverse(); },
  }));
  if (!keepInput) $('reverso-casas').value = rev.frets.every(f => f < 0) ? '' : fmtFrets(rev.frets);
  $('reverso-janela').textContent = `Casas ${rev.base}–${rev.base + REV_ROWS - 1}`;
  $('reverso-menos').disabled = rev.base <= 1;
  $('reverso-mais').disabled = rev.base >= 12 - REV_ROWS + 1;

  const list = $('reverso-resultados'), msg = $('reverso-msg');
  if (rev.frets.filter(f => f >= 0).length < 2) {
    msg.textContent = 'Monte um shape com ao menos 2 cordas tocadas.';
    list.replaceChildren();
    return;
  }
  const found = identifyChord(rev.frets, state.instrument, state.tuning);
  trackEventDebounced('identificar', `identificar/${found.length ? 'encontrou' : 'nada'}/${state.instrument}`, 2000);
  msg.textContent = !found.length ? 'Nenhum acorde conhecido com essas notas.'
    : `${found.length === 1 ? 'Encontrado' : `${found.length} possibilidades`} — toque para abrir no dicionário:`;
  list.replaceChildren(...found.map(r => {
    const li = document.createElement('li');
    const notes = [r.rootInBass ? 'tônica no baixo' : `baixo em ${r.bassName}`];
    if (r.omitted) notes.push(`omite ${r.omitted} nota${r.omitted > 1 ? 's' : ''}`);
    const b = button('', 'result-card', () => { gc('identificar/abrir-resultado'); selectChord(r.chord, { frets: rev.frets }); showView('acordes'); revealViewer(); },
      { 'aria-label': `Abrir ${r.symbol}: ${chordTitle(r.chord)}, ${notes.join(', ')}` });
    b.append(Object.assign(document.createElement('strong'), { textContent: r.symbol }),
      Object.assign(document.createElement('span'), { textContent: chordTitle(r.chord) }),
      Object.assign(document.createElement('small'), { textContent: notes.join(' · ') }));
    li.append(b);
    return li;
  }));
}

$('reverso-casas').addEventListener('input', e => {
  const fr = parseFrets(e.target.value, tun().courses.length);
  if (!fr) return;
  state.rev.frets = fr;
  const max = Math.max(0, ...fr);
  if (max > state.rev.base + REV_ROWS - 1 || (max > 0 && max < state.rev.base)) state.rev.base = Math.max(1, Math.min(max - REV_ROWS + 1, 8));
  renderReverse({ keepInput: true });
});
$('reverso-limpar').addEventListener('click', () => { state.rev.frets = []; state.rev.base = 1; renderReverse(); });
$('reverso-menos').addEventListener('click', () => { state.rev.base = Math.max(1, state.rev.base - 1); renderReverse(); });
$('reverso-mais').addEventListener('click', () => { state.rev.base = Math.min(12 - REV_ROWS + 1, state.rev.base + 1); renderReverse(); });

// ---------- PWA: service worker, atualização e instalação ----------
function setupPWA() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const banner = $('atualizacao');
    let waiting = null, reloading = false;
    const offer = w => { waiting = w; banner.hidden = false; };
    $('atualizar').addEventListener('click', () => {
      gc('pwa/atualizar');
      if (!waiting) return location.reload();
      waiting.postMessage({ type: 'SKIP_WAITING' });
    });
    // Só recarrega numa ATUALIZAÇÃO: na 1ª visita o SW novo assume (clients.claim) sem precisar recarregar.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !hadController) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.register('./sw.js').then(reg => {
      // Só oferece atualização se já havia uma versão controlando a página.
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
        });
      });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(err => console.warn('[pwa] registro do service worker falhou', err));
  }

  const install = $('instalar');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    install.hidden = false;
  });
  window.addEventListener('appinstalled', () => { deferred = null; install.hidden = true; gc('pwa/instalado'); });
  gc(standalone ? 'abrir/app-instalado' : 'abrir/navegador');
  if (ios && !standalone) install.hidden = false;
  install.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      gc(`pwa/instalar-${outcome === 'accepted' ? 'aceito' : 'recusado'}`);
      if (outcome === 'accepted') install.hidden = true;
      deferred = null;
    } else if (ios) {
      $('ios-instalar').showModal();
      gc('pwa/instalar-ios-instrucoes');
    }
  });
}

// ---------- Celular: seções, rolagem, deslizar, avisos ----------
const mobile = () => matchMedia('(max-width: 859px)').matches;

function showView(v) {
  if (document.body.dataset.view === v) return;
  document.body.dataset.view = v;
  document.querySelectorAll('.bottom-nav [data-go]').forEach(b => {
    if (b.dataset.go === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (v !== 'acordes') endTour();
  if (v === 'ritmos') renderRhythms(); else stopRhythm();
  window.scrollTo({ top: 0 });
  trackViewOf(v);
}
document.querySelectorAll('.bottom-nav [data-go]').forEach(b => b.addEventListener('click', () => showView(b.dataset.go)));
const VIEW_TITLES = { acordes: 'Acordes', repertorio: 'Repertório', identificar: 'Identificar', ritmos: 'Ritmos' };
function trackViewOf(v) {
  trackView(`/${v}`, VIEW_TITLES[v] || v);
}

/** No celular, se a página rolou para além do diagrama (ex.: análise), volta até ele. */
function revealViewer() {
  if (!mobile()) return;
  const r = document.querySelector('.viewer').getBoundingClientRect();
  if (r.top >= 0) return; // o diagrama já está à vista: não mexe na rolagem
  window.scrollTo({ top: r.top + window.scrollY - 8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

let notifyTimer = 0;
function notify(msg) {
  const el = $('aviso');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

/** Deslizar horizontal (toque/caneta). Anula o clique que vem junto, para não tocar uma corda. */
function addSwipe(el, onSwipe) {
  let x0 = 0, y0 = 0, id = null, swiped = false;
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    id = e.pointerId; x0 = e.clientX; y0 = e.clientY; swiped = false;
  });
  el.addEventListener('pointerup', e => {
    if (e.pointerId !== id) return;
    id = null;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (Math.abs(dx) > 45 && Math.abs(dx) > 1.5 * Math.abs(dy)) { swiped = true; onSwipe(dx < 0 ? 1 : -1); }
  });
  el.addEventListener('pointercancel', () => { id = null; });
  el.addEventListener('click', e => { if (swiped) { e.stopPropagation(); e.preventDefault(); swiped = false; } }, true);
}
addSwipe($('diagrama'), d => {
  const moved = move(d);
  if (moved) gc('posicao/deslizar', { throttleMs: 10000 });
  if (moved && !seen('swipe')) { markSeen('swipe'); $('dica-deslizar-vis').hidden = true; }
});
addSwipe($('palco-diagrama'), d => goRehearsal(state.rehearsal.pos + d));

// ---------- Tour de 1ª visita (3 passos, dispensável) ----------
const TOUR = [
  { el: () => (mobile() ? document.querySelector('.chord-bar') : document.querySelector('.picker')),
    text: 'Escolha um acorde: busque pela cifra no topo ou escolha a tônica e o tipo.' },
  { el: () => document.querySelector('.play'), text: 'Ouça: “Dedilhar” ou “Batida” — ou toque numa corda do diagrama.' },
  { el: () => $('favoritar'), text: 'Gostou da posição? “☆ Favoritar” guarda no Repertório, junto com suas progressões.' },
];
let tourStep = -1;
function showTour(i) {
  document.querySelector('.tour-on')?.classList.remove('tour-on');
  tourStep = i;
  const st = TOUR[i], target = st.el();
  $('tour-texto').textContent = st.text;
  $('tour-passo').textContent = `${i + 1} de ${TOUR.length}`;
  $('tour-proximo').textContent = i === TOUR.length - 1 ? 'Começar' : 'Próximo';
  $('tour').hidden = false;
  target?.classList.add('tour-on');
  target?.scrollIntoView({ block: 'nearest' });
  // Cartão no lado oposto ao alvo, para não cobri-lo
  const r = target?.getBoundingClientRect();
  $('tour').classList.toggle('top', !!r && r.top + r.height / 2 > innerHeight / 2);
  $('tour-proximo').focus({ preventScroll: true });
}
function endTour() {
  if (tourStep < 0) return;
  gc(tourStep === TOUR.length - 1 ? 'tour/concluir' : `tour/sair-no-passo-${tourStep + 1}`);
  tourStep = -1;
  $('tour').hidden = true;
  document.querySelector('.tour-on')?.classList.remove('tour-on');
  markSeen('tour');
}
$('tour-proximo').addEventListener('click', () => (tourStep < TOUR.length - 1 ? showTour(tourStep + 1) : endTour()));
$('tour-pular').addEventListener('click', endTour);
$('tour').addEventListener('keydown', e => { if (e.key === 'Escape') endTour(); });

// ---------- Modo palco ----------
const stageOpen = () => !$('palco').hidden;
let wakeLock = null, stageReturnFocus = null, ignoreHash = false;

async function keepAwake() {
  // Tela acesa no palco e enquanto um ritmo toca (mãos ocupadas no instrumento)
  try { if ('wakeLock' in navigator && !wakeLock && (stageOpen() || rt.on)) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* sem suporte ou negado */ }
}
function letSleep() {
  if (stageOpen() || rt.on) return;
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { wakeLock = null; keepAwake(); } });

function openStage() {
  if (!state.rehearsal || stageOpen()) return;
  stageReturnFocus = document.activeElement;
  $('palco').hidden = false;
  document.documentElement.style.overflow = 'hidden';
  history.pushState({ stage: true }, '', location.hash); // o "voltar" do Android fecha o palco
  const r = state.rehearsal;
  if (parseChord(r.prog.chords[r.pos])?.symbol !== state.chord.symbol) goRehearsal(r.pos); // volta ao acorde do ensaio
  renderStage();
  keepAwake();
  $('palco-fechar').focus();
}

function closeStage(fromHistory = false) {
  if (!stageOpen()) return;
  $('palco').hidden = true;
  document.documentElement.style.overflow = '';
  letSleep();
  if (!fromHistory && history.state?.stage) { ignoreHash = true; history.back(); }
  stageReturnFocus?.focus?.();
}

function renderStage() {
  if (!stageOpen() || !state.rehearsal) return;
  const { prog, pos } = state.rehearsal, n = prog.chords.length;
  $('palco-prog').textContent = prog.name;
  $('palco-contador').textContent = `${pos + 1}/${n}`;
  $('palco-simbolo').textContent = state.chord.symbol;
  $('palco-notas').textContent = chordNotes(state.chord).names.join(' · ');
  const v = state.voicings[state.idx];
  $('palco-diagrama').replaceChildren(v
    ? renderDiagram(v, inst(), tun(), { leftHanded: lefty(), onString: course => playCurrent('dedilhar', course) })
    : Object.assign(document.createElement('p'), { className: 'empty', textContent: 'Sem posição viável.' }));
  const next = prog.chords[pos + 1];
  $('palco-seguinte').replaceChildren(...(next ? ['Próximo: ', Object.assign(document.createElement('strong'), { textContent: next })] : ['Fim da progressão']));
  $('palco-anterior').disabled = pos <= 0;
  $('palco-avancar').disabled = pos >= n - 1;
}

/** Teclado e pedaleiras Bluetooth (enviam setas, PageUp/PageDown ou espaço). */
function stageKeys(e) {
  const fwd = ['ArrowRight', 'PageDown', 'ArrowDown'], back = ['ArrowLeft', 'PageUp', 'ArrowUp'];
  if (e.key === 'Escape') { e.preventDefault(); closeStage(); }
  else if (fwd.includes(e.key)) { e.preventDefault(); goRehearsal(state.rehearsal.pos + 1); }
  else if (back.includes(e.key)) { e.preventDefault(); goRehearsal(state.rehearsal.pos - 1); }
  else if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); playCurrent('batida'); }
  else if (e.key === 'Tab') { // mantém o foco dentro do palco
    const f = [...$('palco').querySelectorAll('button:not(:disabled), [tabindex="0"]')];
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey ? i <= 0 : i === f.length - 1) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); }
  }
}

$('palco-fechar').addEventListener('click', () => closeStage());
$('palco-anterior').addEventListener('click', () => goRehearsal(state.rehearsal.pos - 1));
$('palco-avancar').addEventListener('click', () => goRehearsal(state.rehearsal.pos + 1));
$('palco-tocar').addEventListener('click', () => playCurrent('batida'));
// Sair do palco (✕ ou "voltar") não deve desfazer o acorde atual: grava-o de novo no histórico.
window.addEventListener('popstate', () => {
  const leaving = stageOpen() && !history.state?.stage;
  if (leaving) closeStage(true);
  if (leaving || ignoreHash) { ignoreHash = false; syncHash(); }
});

// ---------- Início ----------
$('anterior').addEventListener('click', () => move(-1));
$('tocar-dedilhar').addEventListener('click', () => playCurrent('dedilhar'));
$('tocar-batida').addEventListener('click', () => playCurrent('batida'));
// Desbloqueia o áudio no primeiro gesto VÁLIDO. Em tela de toque, pointerdown/touchstart não contam
// como ativação do usuário (Chrome/Safari): o contexto nasceria suspenso. Use touchend/click/keydown.
const UNLOCK_EVENTS = ['touchend', 'click', 'keydown'];
function firstGesture() {
  const ok = unlock()?.state === 'running';
  preloadSamples(state.instrument); // gravações do instrumento atual (o baixo carrega ao ligar o acompanhamento)
  if (ok) UNLOCK_EVENTS.forEach(ev => document.removeEventListener(ev, firstGesture, true));
}
UNLOCK_EVENTS.forEach(ev => document.addEventListener(ev, firstGesture, { capture: true, passive: true }));
// Ao voltar do segundo plano o iOS deixa o contexto 'interrupted': o próximo toque o retoma.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') UNLOCK_EVENTS.forEach(ev => document.addEventListener(ev, firstGesture, { capture: true, passive: true }));
});
$('proxima').addEventListener('click', () => move(1));
document.addEventListener('keydown', e => {
  if (stageOpen()) return stageKeys(e);
  if (e.target.closest('input, textarea, select, [role="tab"], dialog')) return;
  if (e.key === 'ArrowLeft') move(-1);
  if (e.key === 'ArrowRight') move(1);
});
setupSearch();
applyPrefs();
// Dica das cordas: só na 1ª visita
if (!seen('cordas')) { $('dica-cordas').hidden = false; markSeen('cordas'); }
renderLibrary();
window.addEventListener('hashchange', () => { if (applyRoute(location.hash)) showView('acordes'); });
// Página inicial: a seção aberta; vindo de um link com acorde (#/violao/C7M), conta também o link.
trackViewOf(document.body.dataset.view);
if (location.hash.length > 2) gc('abrir/link-de-acorde');
window.addEventListener('error', e => gc(`erro/js/${gcSlug(e.message, 60)}`, { throttleMs: 60000 }));
window.addEventListener('unhandledrejection', e => gc(`erro/promise/${gcSlug(e.reason?.message || e.reason, 60)}`, { throttleMs: 60000 }));
if (!applyRoute(location.hash)) {
  routeMode = 'replace';
  selectChord(state.chord);
  routeMode = 'push';
}
renderReverse();
setupPWA();
if (!seen('tour') && document.body.dataset.view === 'acordes') showTour(0);
