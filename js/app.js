// app.js — orquestra interface, estado e eventos.
import { CATEGORIES, CHORD_TYPES, ROOT_GRID, TYPE_BY_Q, chordNotes, noteToMidi, pcOf, spell, toPt } from './theory.js';
import { parseMusicXML, partToGrid, matchInstrument, hasTab, unzipMXL } from './musicxml.js';
import { parseChord, suggest } from './parser.js';
import { INSTRUMENTS, DEFAULT_INSTRUMENT, DEFAULT_TUNING } from './instruments.js';
import { getVoicings, identifyChord } from './voicings.js';
import { renderDiagram, renderEditor, renderFretboard } from './diagram.js';
import { play, unlock, scheduleFrets, scheduleClick, stopAll, audioNow, audioLatency, audioState } from './audio.js';
import { parseTab, stepSeconds, TAB_EXAMPLE, TECH_NAMES, eventsToGrid, gridToText, gridStarts, tabLabels } from './tab.js';
import { createStorage, favoriteId, formatRoute, parseRoute, splitProgression } from './storage.js';

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
  selectChord(state.chord);
  renderReverse();
}

function setTuning(tid) {
  if (tid === state.tuning) return;
  state.tuning = tid;
  selectChord(state.chord);
  renderReverse();
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
  }).reverse()); // 1ª corda no topo, como na tablatura
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
    if (!c) { msg.textContent = `Cifra não reconhecida: “${sym}”`; return; }
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
}

document.querySelectorAll('input[name="tema"]').forEach(r => r.addEventListener('change', () => {
  store.setPref('theme', r.value);
  applyPrefs();
}));
$('canhoto').addEventListener('change', () => {
  store.setPref('leftHanded', $('canhoto').checked);
  applyPrefs();
  renderViewer();
  renderReverse();
  renderBoard(TAB.cursor >= 0 && TAB.parsed ? TAB.parsed.events[TAB.cursor]?.frets : null);
});
$('ajustes-abrir').addEventListener('click', () => { $('backup-msg').textContent = ''; $('ajustes').showModal(); });
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
    li.append(open, button('✕', 'btn small', () => { store.removeFavorite(f.id); renderLibrary(); renderFavButton(); }, { 'aria-label': `Remover ${f.symbol} dos favoritos` }));
    return li;
  }) : [Object.assign(document.createElement('li'), { className: 'empty-item', textContent: 'Nenhum favorito ainda. Use “☆ Favoritar” no diagrama.' })]));

  const progs = store.progressions();
  $('progressoes').replaceChildren(...(progs.length ? progs.map(p => {
    const li = document.createElement('li');
    const open = button('', 'btn open', () => startRehearsal(p), { title: `Ensaiar ${p.name}` });
    open.append(`▶ ${p.name} `, Object.assign(document.createElement('small'), { textContent: p.chords.join(' → ') }));
    li.append(open, button('✕', 'btn small', () => {
      store.removeProgression(p.id);
      if (state.rehearsal?.prog.id === p.id) state.rehearsal = null;
      renderLibrary(); renderRehearsal();
    }, { 'aria-label': `Apagar a progressão ${p.name}` }));
    return li;
  }) : [Object.assign(document.createElement('li'), { className: 'empty-item', textContent: 'Nenhuma progressão salva.' })]));
}

$('favoritar').addEventListener('click', () => {
  const f = currentFav();
  if (!f) return;
  if (store.isFavorite(f)) { store.removeFavorite(favoriteId(f)); notify('Removido dos favoritos'); }
  else notify(store.addFavorite(f) ? `${f.symbol} salvo nos favoritos` : 'Não foi possível salvar (armazenamento indisponível)');
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
  notify('Progressão salva');
  $('prog-nome').value = $('prog-acordes').value = '';
  renderDraft();
  renderLibrary();
});

function startRehearsal(prog) {
  state.rehearsal = { prog, pos: 0 };
  goRehearsal(0);
  showView('acordes');
  revealViewer();
}

function goRehearsal(pos) {
  const r = state.rehearsal;
  if (!r || pos < 0 || pos >= r.prog.chords.length) return;
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
  renderStage();
}

$('ensaio-anterior').addEventListener('click', () => goRehearsal(state.rehearsal.pos - 1));
$('ensaio-proximo').addEventListener('click', () => goRehearsal(state.rehearsal.pos + 1));
$('ensaio-tocar').addEventListener('click', () => playCurrent('batida'));
$('ensaio-sair').addEventListener('click', () => { closeStage(); state.rehearsal = null; renderRehearsal(); });
$('ensaio-palco').addEventListener('click', () => openStage());

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
  $('backup-msg').textContent = 'Backup exportado.';
});
$('importar').addEventListener('click', () => $('importar-arquivo').click());
$('importar-arquivo').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const n = store.importJSON(await file.text());
    $('backup-msg').textContent = `Importados: ${n.favorites} favorito(s), ${n.progressions} progressão(ões) e ${n.tabs} tablatura(s).`;
  } catch (err) {
    $('backup-msg').textContent = err.message;
  }
  applyPrefs(); renderLibrary(); renderViewer(); renderReverse(); renderTabList();
});
$('apagar-tudo').addEventListener('click', () => {
  if (!confirm('Apagar todos os favoritos, progressões e preferências? Exporte um backup antes, se quiser guardá-los.')) return;
  store.clear();
  state.rehearsal = null;
  applyPrefs(); renderLibrary(); renderViewer(); renderRehearsal(); renderReverse(); renderTabList();
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
  msg.textContent = !found.length ? 'Nenhum acorde conhecido com essas notas.'
    : `${found.length === 1 ? 'Encontrado' : `${found.length} possibilidades`} — toque para abrir no dicionário:`;
  list.replaceChildren(...found.map(r => {
    const li = document.createElement('li');
    const notes = [r.rootInBass ? 'tônica no baixo' : `baixo em ${r.bassName}`];
    if (r.omitted) notes.push(`omite ${r.omitted} nota${r.omitted > 1 ? 's' : ''}`);
    const b = button('', 'result-card', () => { selectChord(r.chord, { frets: rev.frets }); showView('acordes'); revealViewer(); },
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
  window.addEventListener('appinstalled', () => { deferred = null; install.hidden = true; });
  if (ios && !standalone) install.hidden = false;
  install.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') install.hidden = true;
      deferred = null;
    } else if (ios) {
      $('ios-instalar').showModal();
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
  window.scrollTo({ top: 0 });
}
document.querySelectorAll('.bottom-nav [data-go]').forEach(b => b.addEventListener('click', () => showView(b.dataset.go)));

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
  if (move(d) && !seen('swipe')) { markSeen('swipe'); $('dica-deslizar-vis').hidden = true; }
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
  try { if ('wakeLock' in navigator && stageOpen()) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* sem suporte ou negado */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && stageOpen()) keepAwake(); });

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
  wakeLock?.release().catch(() => {});
  wakeLock = null;
  if (!fromHistory && history.state?.stage) { ignoreHash = true; history.back(); }
  stageReturnFocus?.focus?.();
}

function renderStage() {
  if (!stageOpen() || !state.rehearsal) return;
  const { prog, pos } = state.rehearsal, n = prog.chords.length;
  $('palco-prog').textContent = prog.name;
  $('palco-contador').textContent = `${pos + 1}/${n}`;
  $('palco-simbolo').textContent = state.chord.symbol;
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

// ---------- Tablatura (Fases 6a/6b) ----------
// Agendador com antecedência no relógio do Web Audio + destaque por quadro (requestAnimationFrame).
// O texto é a fonte de verdade (é o que se salva); a grade (6b) edita colunas e regrava o texto.
const TAB = {
  parsed: null, playing: false, timer: 0, raf: 0, start: 0, next: 0, dt: 0.1, queue: [], spans: [], on: -1, editId: null,
  mode: 'texto', grid: null, sel: { col: 0, course: 0 }, colEv: [], cursor: -1, a: -1, b: -1, digit: null,
  open: false, dirty: false, // há uma tablatura aberta no Player/Editar; alterações não salvas
};
const tabKey = () => $('tab-instrumento').value.split('/');
const tabTuning = () => { const [i, t] = tabKey(); return INSTRUMENTS[i].tunings[t]; };
const tabSpeed = () => +$('tab-vel').value / 100;
const DURS = [1, 2, 3, 4, 6, 8, 12, 16];

function fillTabInstruments(value = `${state.instrument}/${state.tuning}`) {
  $('tab-instrumento').replaceChildren(...Object.values(INSTRUMENTS).flatMap(i => Object.entries(i.tunings).map(([tid, t]) =>
    Object.assign(document.createElement('option'), { value: `${i.id}/${tid}`, textContent: `${i.name}${Object.keys(i.tunings).length > 1 ? ' · ' + (t.short || t.name) : ''}` }))));
  $('tab-instrumento').value = value;
  if (!$('tab-instrumento').value) $('tab-instrumento').selectedIndex = 0;
}

function tabParse() {
  const [i, t] = tabKey();
  const text = $('tab-texto').value;
  const r = text.trim() ? parseTab(text, INSTRUMENTS[i].tunings[t].courses.length, { isChord: s => !!parseChord(s) }) : { error: '' };
  const chords = [...new Set((r.events || []).filter(e => e.chord).map(e => e.chord))];
  const play = $('tab-acordes').checked;
  // Acorde da anotação: 1ª posição gerada para o instrumento/afinação escolhidos
  for (const e of r.events || []) if (e.chord) e.frets = (play && getVoicings(parseChord(e.chord), i, t, { max: 1 })[0]?.frets) || e.frets;
  $('tab-msg').textContent = r.error || [
    chords.length ? `Acordes${play ? '' : ' (sem som)'}: ${chords.join(', ')}` : '',
    r.techniques?.length ? `Técnicas: ${r.techniques.map(k => TECH_NAMES[k]).join(', ')}` : '',
    r.ignored?.length ? `Anotações ignoradas: ${r.ignored.join(', ')}` : '',
  ].filter(Boolean).join(' · ');
  TAB.parsed = r.error === undefined ? r : null;
  const n = TAB.parsed?.events.length ?? 0;
  if (TAB.a >= n || TAB.b >= n) TAB.a = TAB.b = -1;
  if (TAB.cursor >= n) TAB.cursor = -1;
  renderTabView();
  return TAB.parsed;
}

function renderTabView() {
  const p = TAB.parsed;
  TAB.spans = [];
  TAB.on = -1;
  if (TAB.mode === 'grade') renderGrid();
  if (!p) { $('tab-view').replaceChildren(); renderAB(); return renderBoard(null); }
  const w = Math.max(0, ...p.blocks.flatMap(b => b.labels.map(l => l.length)));
  $('tab-view').replaceChildren(...p.blocks.map(b => {
    const pre = Object.assign(document.createElement('pre'), { className: 'tab-block' });
    b.lines.forEach((line, li) => {
      pre.append((b.labels[li] || '').padEnd(w) + '|');
      let pos = 0;
      for (const nt of [...b.notes, ...b.chords].filter(x => x.line === li).sort((x, y) => x.col - y.col)) {
        pre.append(line.slice(pos, nt.col));
        const sp = Object.assign(document.createElement('span'), { className: nt.text ? 'tn tc' : 'tn', textContent: line.substr(nt.col, nt.len) });
        sp.dataset.ev = nt.ev;
        const tips = fxNames(nt.fx);
        if (tips) { sp.title = tips; sp.classList.add('tfx'); }
        (TAB.spans[nt.ev] ||= []).push(sp);
        pre.append(sp);
        pos = nt.col + nt.len;
      }
      pre.append(line.slice(pos) + (li < b.lines.length - 1 ? '\n' : ''));
    });
    return pre;
  }));
  renderAB();
  renderBoard(TAB.cursor >= 0 ? p.events[TAB.cursor].frets : null);
}

/** Descrição das técnicas de uma nota (dica ao passar o mouse). */
function fxNames(f) {
  if (!f) return '';
  const k = [f.tech, ...['vib', 'ghost', 'harm', 'dead', 'pm', 'ring'].filter(x => f[x] !== undefined), f.bendUp && 'bend'];
  return [...new Set(k.filter(Boolean))].map(x => TECH_NAMES[x]).join(' · ');
}

/** Braço do instrumento com as casas do evento atual (ou vazio). */
function renderBoard(frets) {
  const [i] = tabKey(), tn = tabTuning();
  const all = TAB.parsed?.events.flatMap(e => e.frets) || [];
  const maxFret = Math.min(24, Math.max(12, ...all));
  $('tab-braco').replaceChildren(renderFretboard(frets || new Array(tn.courses.length).fill(-1), INSTRUMENTS[i], tn, { maxFret, leftHanded: lefty() }));
}

function tabHighlight(ev) {
  if (ev < TAB.on) { TAB.spans.flat().forEach(s => s.classList.remove('on', 'done')); TAB.on = -1; } // recomeço (repetir)
  (TAB.spans[TAB.on] || []).forEach(s => { s.classList.remove('on'); s.classList.add('done'); });
  const cur = TAB.spans[ev] || [];
  cur.forEach(s => { s.classList.remove('done'); s.classList.add('on'); });
  const sp = cur[0], box = sp?.closest('.tab-block, .grid-wrap');
  if (box) {
    box.scrollLeft = sp.offsetLeft - box.clientWidth / 2;
    const prev = TAB.spans[TAB.on]?.[0]?.closest('.tab-block, .grid-wrap');
    if (prev !== box) box.scrollIntoView({ block: 'nearest' });
  }
  TAB.on = ev;
  TAB.cursor = ev;
  renderBoard(TAB.parsed.events[ev].frets);
}

/** Trecho tocado: A–B (sempre em laço) ou a tablatura inteira (laço se "Repetir"). */
function tabRange() {
  const ev = TAB.parsed.events;
  const ab = TAB.a >= 0 && TAB.b >= 0;
  const lo = ab ? TAB.a : 0, hi = ab ? TAB.b : ev.length - 1;
  return { lo, hi, loop: ab || $('tab-repetir').checked, from: ev[lo].step, to: ev[hi + 1]?.step ?? TAB.parsed.steps };
}

function tabSchedule() {
  const p = TAB.parsed, ev = p.events, r = tabRange();
  const ahead = audioNow() + (document.hidden ? 1.5 : 0.3); // em segundo plano o setInterval é atrasado
  for (;;) {
    if (TAB.next > r.hi) {
      const end = TAB.start + r.to * TAB.dt;
      if (!r.loop) { if (audioNow() > end && !TAB.queue.length) tabStop(false); return; }
      if (end > ahead) return;
      TAB.start = end - r.from * TAB.dt; TAB.next = r.lo; // volta ao início do trecho, emendado no tempo
    }
    const e = ev[TAB.next], when = TAB.start + e.step * TAB.dt;
    if (when > ahead) return;
    const dur = ((ev[TAB.next + 1]?.step ?? p.steps) - e.step) * TAB.dt;
    scheduleFrets(e.frets, TAB.inst, TAB.tun, when, e.chord ? { strum: 0.018, gain: 0.6 } : { fx: e.fx, dur });
    TAB.queue.push({ time: when, ev: TAB.next++ });
  }
}

function tabDraw() {
  if (!TAB.playing) return;
  const now = audioNow() - audioLatency(); // o destaque acompanha o que se OUVE
  let cur = -1;
  while (TAB.queue.length && TAB.queue[0].time <= now) cur = TAB.queue.shift().ev;
  if (cur >= 0) tabHighlight(cur);
  TAB.raf = requestAnimationFrame(tabDraw);
}

function tabPlay(from = null, { countIn = $('tab-contagem').checked } = {}) {
  tabStop();
  const p = tabParse();
  if (!p || !unlock()) return;
  checkSound();
  const r = tabRange();
  if (from === null || from < r.lo || from > r.hi) from = r.lo;
  const [i, t] = tabKey();
  const bpm = Math.min(240, Math.max(40, +$('tab-bpm').value || 90));
  Object.assign(TAB, {
    inst: i, tun: INSTRUMENTS[i].tunings[t], dt: stepSeconds(bpm, +$('tab-unidade').value) / tabSpeed(),
    next: from, queue: [], playing: true,
  });
  let t0 = audioNow() + 0.12;
  if (countIn) { // 1 compasso de 4 tempos no andamento de estudo
    const beat = 60 / bpm / tabSpeed();
    for (let k = 0; k < 4; k++) scheduleClick(t0 + k * beat, k === 0);
    t0 += 4 * beat;
  }
  TAB.start = t0 - p.events[from].step * TAB.dt;
  $('tab-play').textContent = '■ Parar';
  tabSchedule();
  TAB.timer = setInterval(tabSchedule, 50);
  TAB.raf = requestAnimationFrame(tabDraw);
}

function tabStop(silence = true) {
  clearInterval(TAB.timer);
  cancelAnimationFrame(TAB.raf);
  if (silence && TAB.playing) stopAll();
  TAB.playing = false;
  TAB.queue = [];
  TAB.spans.flat().forEach(s => s.classList.remove('on', 'done'));
  TAB.on = -1;
  $('tab-play').textContent = '▶ Tocar';
}

// ----- Repetição A–B -----
function renderAB() {
  TAB.spans.flat().forEach(s => s.classList.remove('mark-a', 'mark-b', 'in-ab'));
  const ab = TAB.a >= 0 && TAB.b >= 0;
  if (ab) for (let e = TAB.a; e <= TAB.b; e++) (TAB.spans[e] || []).forEach(s => s.classList.add('in-ab'));
  (TAB.spans[TAB.a] || []).forEach(s => s.classList.add('mark-a'));
  (TAB.spans[TAB.b] || []).forEach(s => s.classList.add('mark-b'));
  $('tab-ab').textContent = ab ? `Trecho: nota ${TAB.a + 1} → ${TAB.b + 1} (repete em laço)`
    : TAB.a >= 0 ? `Início na nota ${TAB.a + 1} — marque o fim` : TAB.b >= 0 ? `Fim na nota ${TAB.b + 1} — marque o início` : '';
  $('tab-a').setAttribute('aria-pressed', String(TAB.a >= 0));
  $('tab-b').setAttribute('aria-pressed', String(TAB.b >= 0));
  $('tab-ab-limpar').disabled = TAB.a < 0 && TAB.b < 0;
}

function setMark(which) {
  if (!TAB.parsed) return;
  const ev = TAB.playing && TAB.on >= 0 ? TAB.on : TAB.cursor;
  if (ev < 0) return notify('Toque numa nota (ou selecione na grade) para marcar');
  TAB[which] = ev;
  if (TAB.a >= 0 && TAB.b >= 0 && TAB.a > TAB.b) [TAB.a, TAB.b] = [TAB.b, TAB.a];
  renderAB();
  if (TAB.playing && TAB.a >= 0 && TAB.b >= 0) tabPlay(TAB.a, { countIn: false });
}

// ----- Editor em grade (6b) -----
const measure = () => +$('tab-unidade').value; // 4 tempos: 16 semicolcheias ou 8 colcheias
// Duração em figuras (em semicolcheias): nome, símbolo e fração da semibreve
const FIGS = { 1: ['semicolcheia', '♬', '1/16'], 2: ['colcheia', '♪', '1/8'], 3: ['colcheia pontuada', '♪.', '3/16'], 4: ['semínima', '♩', '1/4'],
  6: ['semínima pontuada', '♩.', '3/8'], 8: ['mínima', '', '1/2'], 12: ['mínima pontuada', '', '3/4'], 16: ['semibreve', '', '1'], 24: ['semibreve pontuada', '', '3/2'], 32: ['2 semibreves', '', '2'] };
const fig = steps => FIGS[steps * 16 / measure()];
const figName = steps => { const f = fig(steps); return f ? `${f[1] ? f[1] + ' ' : ''}${f[0]} (${f[2]})` : `${steps} ${steps === 1 ? 'passo' : 'passos'}`; };
const figShort = steps => fig(steps)?.[2] ?? String(steps);

function gridFromText() {
  const n = tabTuning().courses.length;
  const p = TAB.parsed;
  TAB.grid = p ? eventsToGrid(p, n) : Array.from({ length: 8 }, () => ({ frets: new Array(n).fill(-1), dur: 2 }));
  TAB.sel = { col: 0, course: n - 1 };
}

/** Grava a grade no texto (formato salvo) e re-lê. */
function gridCommit() {
  tabStop();
  setDirty();
  $('tab-texto').value = gridToText(TAB.grid, tabLabels(tabTuning()), { measure: measure() });
  tabParse();
}

function setTabMode(mode) {
  tabStop();
  TAB.mode = mode;
  $('tab-modo-texto').setAttribute('aria-pressed', String(mode === 'texto'));
  $('tab-modo-grade').setAttribute('aria-pressed', String(mode === 'grade'));
  $('tab-edit-texto').hidden = mode !== 'texto';
  $('tab-edit-grade').hidden = mode !== 'grade';
  if (mode === 'grade') {
    if (tabParse() === null && $('tab-texto').value.trim()) { // texto com erro: não sobrescreve
      setTabMode('texto');
      return notify('Corrija o texto antes de abrir a grade');
    }
    gridFromText();
  }
  renderTabView();
}

function renderGrid() {
  const g = TAB.grid;
  if (!g) return;
  const tn = tabTuning(), n = tn.courses.length, labels = tabLabels(tn);
  TAB.sel.col = Math.max(0, Math.min(TAB.sel.col, g.length - 1));
  TAB.sel.course = Math.max(0, Math.min(TAB.sel.course, n - 1));
  const starts = gridStarts(g), m = measure();
  // coluna → evento (pelo passo inicial)
  const evAt = new Map((TAB.parsed?.events || []).map((e, k) => [e.step, k]).reverse());
  TAB.colEv = starts.map(s => evAt.get(s) ?? -1);
  const wrap = $('grade');
  const hadFocus = wrap.contains(document.activeElement);
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.style.gridTemplateColumns = `auto repeat(${g.length}, minmax(2.4em, auto))`;
  for (let c = n - 1; c >= 0; c--) {
    const row = document.createElement('div');
    row.setAttribute('role', 'row');
    row.className = 'grid-line';
    row.append(Object.assign(document.createElement('span'), { className: 'gl', textContent: labels[c], role: 'rowheader' }));
    g.forEach((col, k) => {
      const f = col.frets[c];
      const b = button(f >= 0 ? String(f) : '', 'gc', () => selectCell(k, c), {
        role: 'gridcell', 'aria-label': `${tn.courses[c].label}, coluna ${k + 1}: ${f >= 0 ? `casa ${f}` : 'vazia'}`,
      });
      b.dataset.col = k; b.dataset.course = c;
      if (k && Math.floor(starts[k] / m) > Math.floor(starts[k - 1] / m)) b.classList.add('bar');
      if (TAB.colEv[k] >= 0) (TAB.spans[TAB.colEv[k]] ||= []).push(b);
      row.append(b);
    });
    grid.append(row);
  }
  const durRow = document.createElement('div');
  durRow.className = 'grid-line grid-dur';
  durRow.setAttribute('aria-hidden', 'true');
  durRow.append(Object.assign(document.createElement('span'), { className: 'gl' }));
  g.forEach(col => durRow.append(Object.assign(document.createElement('span'), { textContent: figShort(col.dur), title: figName(col.dur) })));
  grid.append(durRow);
  wrap.replaceChildren(grid);
  markSel();
  if (hadFocus) wrap.querySelector('.gc.sel')?.focus();
}

/** Aplica a seleção (sem recriar a grade: o duplo clique precisa do mesmo botão). */
function markSel() {
  const { col, course } = TAB.sel;
  for (const b of $('grade').querySelectorAll('.gc')) {
    const c = +b.dataset.col === col, sel = c && +b.dataset.course === course;
    b.classList.toggle('selcol', c);
    b.classList.toggle('sel', sel);
    b.tabIndex = sel ? 0 : -1;
    b.setAttribute('aria-selected', String(sel));
  }
  const d = TAB.grid[col]?.dur ?? 2;
  $('grade-dur').replaceChildren(...[...new Set([...DURS, d])].sort((x, y) => x - y).map(v =>
    Object.assign(document.createElement('option'), { value: v, textContent: figName(v) })));
  $('grade-dur').value = String(d);
}

function selectCell(col, course, focus = false) {
  TAB.sel = { col, course };
  TAB.digit = null;
  TAB.cursor = TAB.colEv[col] >= 0 ? TAB.colEv[col] : TAB.cursor;
  markSel();
  if (focus) $('grade').querySelector('.gc.sel')?.focus();
  renderBoard(TAB.grid[col]?.frets);
}

function gridSetFret(f) {
  const col = TAB.grid[TAB.sel.col];
  if (!col) return;
  col.frets[TAB.sel.course] = f;
  gridCommit();
}

/** Dígito digitado: dois seguidos na mesma célula (em 1,2 s) formam 10–24. */
function gridDigit(d) {
  const now = Date.now(), k = `${TAB.sel.col}:${TAB.sel.course}`;
  let f = d;
  if (TAB.digit && TAB.digit.k === k && now - TAB.digit.t < 1200 && TAB.digit.v * 10 + d <= 24 && TAB.digit.v > 0) f = TAB.digit.v * 10 + d;
  TAB.digit = { k, v: f, t: now };
  const keep = TAB.digit;
  gridSetFret(f);
  TAB.digit = keep;
}

function gridAddCol() {
  const n = tabTuning().courses.length;
  const dur = TAB.grid[TAB.sel.col]?.dur ?? 2;
  TAB.grid.splice(TAB.sel.col + 1, 0, { frets: new Array(n).fill(-1), dur });
  TAB.sel.col++;
  gridCommit();
}

function gridDelCol() {
  if (TAB.grid.length <= 1) { TAB.grid[0].frets.fill(-1); return gridCommit(); }
  TAB.grid.splice(TAB.sel.col, 1);
  gridCommit();
}

/** Insere a posição atual do dicionário na coluna selecionada (gerada para o instrumento da tablatura). */
function gridInsertChord() {
  const [i, t] = tabKey();
  const v = i === state.instrument && t === state.tuning ? state.voicings[state.idx]
    : getVoicings(state.chord, i, t, { max: 1 })[0];
  if (!v) return notify(`Sem posição de ${state.chord.symbol} para este instrumento`);
  TAB.grid[TAB.sel.col].frets = v.frets.slice();
  gridCommit();
  notify(`${state.chord.symbol} inserido`);
}

function gridKeys(e) {
  const g = TAB.grid, n = tabTuning().courses.length;
  if (!g || !e.target.closest('.gc')) return;
  const { col, course } = TAB.sel;
  const go = (c, s) => { e.preventDefault(); selectCell(Math.max(0, Math.min(g.length - 1, c)), Math.max(0, Math.min(n - 1, s)), true); };
  if (e.key === 'ArrowLeft') go(col - 1, course);
  else if (e.key === 'ArrowRight') go(col + 1, course);
  else if (e.key === 'ArrowUp') go(col, course + 1);   // linha de cima = corda mais aguda
  else if (e.key === 'ArrowDown') go(col, course - 1);
  else if (e.key === 'Home') go(0, course);
  else if (e.key === 'End') go(g.length - 1, course);
  else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); gridDigit(+e.key); }
  else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'x') { e.preventDefault(); gridSetFret(-1); }
  else if (e.key === '+' || e.key === 'Insert') { e.preventDefault(); gridAddCol(); }
  else if (e.key === '-') { e.preventDefault(); gridDelCol(); }
}

function setupGrid() {
  $('grade-teclado').replaceChildren(
    ...Array.from({ length: 13 }, (_, f) => button(String(f), 'btn key', () => gridSetFret(f), { 'aria-label': `Casa ${f}` })),
    ...[15, 17].map(f => button(String(f), 'btn key', () => gridSetFret(f), { 'aria-label': `Casa ${f}` })),
    button('⌫', 'btn key', () => gridSetFret(-1), { 'aria-label': 'Apagar a nota' }));
  $('grade').addEventListener('keydown', gridKeys);
  $('grade').addEventListener('dblclick', e => {
    const k = +e.target.closest('.gc')?.dataset.col;
    if (Number.isInteger(k)) tabPlay(TAB.colEv.slice(k).find(x => x >= 0) ?? null);
  });
  $('grade-dur').addEventListener('change', () => { TAB.grid[TAB.sel.col].dur = +$('grade-dur').value; gridCommit(); });
  $('grade-add').addEventListener('click', gridAddCol);
  $('grade-del').addEventListener('click', gridDelCol);
  $('grade-acorde').addEventListener('click', gridInsertChord);
  $('tab-modo-texto').addEventListener('click', () => setTabMode('texto'));
  $('tab-modo-grade').addEventListener('click', () => setTabMode('grade'));
}

function renderTabList() {
  // Tablatura aberta (talvez não salva): atalho para continuar
  const cur = $('tab-atual');
  cur.hidden = !TAB.open;
  if (TAB.open) {
    const name = $('tab-nome').value.trim() || 'Sem nome';
    const b = button('', 'btn open', () => showTabPane('player'), { title: `Continuar em ${name}` });
    b.append('Continuar: ', Object.assign(document.createElement('strong'), { textContent: name }),
      ...(TAB.dirty ? [' ', Object.assign(document.createElement('small'), { textContent: '(não salva)' })] : []));
    cur.replaceChildren(b);
  }
  const tabs = store.tabs();
  $('tab-lista').replaceChildren(...(tabs.length ? tabs.map(t => {
    const li = document.createElement('li');
    const open = button('', 'btn open', () => openTab(t), { title: `Abrir ${t.name}` });
    open.append(`${t.name} `, Object.assign(document.createElement('small'), { textContent: `${INSTRUMENTS[t.instrument]?.name || t.instrument} · ${t.bpm} BPM` }));
    li.append(open, button('✕', 'btn small', () => {
      store.removeTab(t.id);
      if (TAB.editId === t.id) TAB.editId = null;
      renderTabList();
    }, { 'aria-label': `Apagar a tablatura ${t.name}` }));
    return li;
  }) : [Object.assign(document.createElement('li'), { className: 'empty-item', textContent: 'Nenhuma tablatura salva.' })]));
}

// ----- Biblioteca / Player / Editar (7d) -----
const tabPane = () => document.querySelector('.tabmod').dataset.tabview;
function showTabPane(pane) {
  const sec = document.querySelector('.tabmod');
  if (pane !== 'biblioteca' && !TAB.open) pane = 'biblioteca';
  if (pane === 'biblioteca') tabStop();
  sec.dataset.tabview = pane;
  $('tab-ver').setAttribute('aria-pressed', String(pane === 'player'));
  $('tab-editar').setAttribute('aria-pressed', String(pane === 'editar'));
  document.body.classList.toggle('tab-docked', pane !== 'biblioteca');
  if (pane === 'biblioteca') renderTabList();
  else if (pane === 'editar' && TAB.mode === 'grade') renderGrid();
  if (mobile() && document.body.dataset.view === 'tablatura') window.scrollTo({ top: 0 });
  dockResize();
}
function renderTabTitle() {
  $('tab-titulo').textContent = ($('tab-nome').value.trim() || 'Sem nome') + (TAB.dirty ? ' •' : '');
  $('tab-titulo').title = TAB.dirty ? 'Alterações não salvas' : '';
}
function setDirty(d = true) { TAB.dirty = d; renderTabTitle(); }
/** Altura do braço + transporte fixos (celular): reserva espaço e margem de rolagem. */
function dockResize() {
  document.body.style.setProperty('--dock-h', `${$('tab-dock').offsetHeight}px`);
}
if ('ResizeObserver' in window) new ResizeObserver(dockResize).observe($('tab-dock'));

/** Carrega uma tablatura no editor (salva, exemplo ou importada). */
function loadTab(t, { keepXML = false } = {}) {
  tabStop();
  TAB.open = true;
  if (!keepXML) { TAB.xml = null; $('tab-parte-box').hidden = true; }
  TAB.editId = t.id ?? null;
  TAB.a = TAB.b = TAB.cursor = -1;
  $('tab-nome').value = t.name;
  fillTabInstruments(`${t.instrument}/${t.tuning}`);
  $('tab-texto').value = t.text;
  if (t.bpm) $('tab-bpm').value = t.bpm;
  if (t.unit) $('tab-unidade').value = String(t.unit);
  tabParse();
  if (TAB.mode === 'grade') { gridFromText(); renderTabView(); }
  setDirty(false);
}

// ----- Importar MusicXML (6c) -----
async function importXML(file) {
  try {
    const buf = await file.arrayBuffer();
    const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
    const zip = head[0] === 0x50 && head[1] === 0x4b; // "PK": .mxl compactado
    const r = parseMusicXML(zip ? await unzipMXL(buf) : new TextDecoder().decode(buf));
    if (r.error) { $('tab-msg').textContent = r.error; return; }
    const parts = r.parts.map((p, k) => ({ p, k })).filter(x => x.p.notes.length);
    TAB.xml = { ...r, file: file.name.replace(/\.[^.]+$/, '') };
    $('tab-parte').replaceChildren(...parts.map(({ p, k }) => Object.assign(document.createElement('option'), {
      value: k, textContent: `${p.name}${hasTab(p) ? ' (tablatura)' : ' (partitura)'}`,
    })));
    $('tab-parte').value = String((parts.find(x => hasTab(x.p)) || parts[0]).k);
    $('tab-parte-box').hidden = parts.length < 2;
    loadXMLPart(+$('tab-parte').value);
    showTabPane('player');
  } catch (e) {
    $('tab-msg').textContent = `Não foi possível importar: ${e.message}`;
  }
}

function loadXMLPart(k, keepInstrument = false) {
  const x = TAB.xml, part = x.parts[k];
  const [ci, ct] = tabKey();
  const m = (!keepInstrument && matchInstrument(part, INSTRUMENTS)) || { instrument: ci, tuning: ct };
  const tn = INSTRUMENTS[m.instrument].tunings[m.tuning];
  const g = partToGrid(part, tn.courses.map(c => Math.min(...c.notes.map(noteToMidi))));
  const name = [x.title || x.file, x.parts.length > 1 ? part.name : ''].filter(Boolean).join(' — ');
  TAB.editId = null;
  loadTab({ name, instrument: m.instrument, tuning: m.tuning, unit: g.unit, text: gridToText(g.cols, tabLabels(tn), { measure: g.measure }),
    bpm: x.bpm ? Math.min(240, Math.max(40, x.bpm)) : 0 }, { keepXML: true });
  const notes = part.notes.length - g.dropped;
  $('tab-msg').textContent = [`Importado: ${notes} nota(s)${g.fromTab ? '' : ' — casas calculadas pela altura (a parte não tem corda/casa)'}`,
    g.dropped ? `${g.dropped} nota(s) fora do alcance do instrumento` : '', $('tab-msg').textContent].filter(Boolean).join(' · ');
  notify('MusicXML importado');
}

function openTab(t) {
  loadTab(t);
  showTabPane('player');
}

$('tab-play').addEventListener('click', () => (TAB.playing ? tabStop() : tabPlay(TAB.mode === 'grade' && TAB.cursor >= 0 ? TAB.cursor : null)));
$('tab-view').addEventListener('click', e => {
  const sp = e.target.closest('.tn');
  if (!sp) return;
  TAB.cursor = +sp.dataset.ev;
  tabPlay(TAB.cursor);
});
$('tab-texto').addEventListener('input', () => { tabStop(); tabParse(); setDirty(); });
$('tab-nome').addEventListener('input', () => setDirty());
$('tab-bpm').addEventListener('input', () => setDirty());
$('tab-ver').addEventListener('click', () => showTabPane('player'));
$('tab-editar').addEventListener('click', () => showTabPane('editar'));
$('tab-voltar').addEventListener('click', () => showTabPane('biblioteca'));
$('tab-nova').addEventListener('click', () => {
  loadTab({ name: '', instrument: state.instrument, tuning: state.tuning, text: '', bpm: 90, unit: 16 });
  setTabMode('texto');
  showTabPane('editar');
  $('tab-texto').focus();
});
$('tab-acordes').addEventListener('input', () => { tabStop(); tabParse(); });
$('tab-instrumento').addEventListener('input', () => {
  tabStop();
  setDirty();
  // Partitura importada sem corda/casa: recalcula as posições para o novo instrumento
  if (TAB.xml && !hasTab(TAB.xml.parts[+$('tab-parte').value])) { loadXMLPart(+$('tab-parte').value, true); return setDirty(); }
  if (tabParse() && TAB.mode === 'grade') { gridFromText(); renderTabView(); }
  else if (TAB.mode === 'grade') setTabMode('texto');
});
for (const id of ['tab-bpm', 'tab-unidade']) $(id).addEventListener('change', () => {
  if (id === 'tab-unidade' && TAB.mode === 'grade') renderGrid();
  if (TAB.playing) tabPlay(Math.max(0, TAB.on), { countIn: false });
});
$('tab-vel').addEventListener('input', () => { $('tab-vel-out').textContent = `${$('tab-vel').value}%`; });
$('tab-vel').addEventListener('change', () => { if (TAB.playing) tabPlay(Math.max(0, TAB.on), { countIn: false }); });
$('tab-a').addEventListener('click', () => setMark('a'));
$('tab-b').addEventListener('click', () => setMark('b'));
$('tab-ab-limpar').addEventListener('click', () => { TAB.a = TAB.b = -1; renderAB(); });
$('tab-exemplo').addEventListener('click', () => {
  loadTab({ name: 'Exemplo (C · G/B · Am · F)', instrument: 'violao', tuning: 'padrao', text: TAB_EXAMPLE });
  showTabPane('player');
});
$('tab-importar').addEventListener('click', () => $('tab-arquivo').click());
$('tab-arquivo').addEventListener('change', () => {
  const f = $('tab-arquivo').files[0];
  $('tab-arquivo').value = '';
  if (f) importXML(f);
});
$('tab-parte').addEventListener('change', () => loadXMLPart(+$('tab-parte').value));
$('tab-salvar').addEventListener('click', () => {
  if (!tabParse()) { $('tab-msg').textContent ||= 'Digite uma tablatura antes de salvar.'; return; }
  const [i, t] = tabKey();
  const saved = store.saveTab({
    id: TAB.editId, name: $('tab-nome').value.trim() || 'Sem nome', text: $('tab-texto').value,
    instrument: i, tuning: t, bpm: +$('tab-bpm').value, unit: +$('tab-unidade').value,
  });
  TAB.editId = saved?.id ?? null;
  renderTabList();
  if (!saved) return notify('Não foi possível salvar');
  setDirty(false);
  if (!store.prefs().saveWarn || !$('tab-salva').showModal) return notify('Tablatura salva neste aparelho');
  $('tab-salva-nao-avisar').checked = false;
  $('tab-salva').showModal();
});
// Aviso ao salvar: os dados ficam só no navegador deste aparelho → oferecer exportar
const slug = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'tablatura';
$('tab-salva-exportar').addEventListener('click', () => {
  const tab = store.tabs().find(t => t.id === TAB.editId);
  if (tab) downloadJSON(store.exportTabJSON(tab.id), `tablatura-${slug(tab.name)}-${today()}.json`);
});
$('tab-salva-backup').addEventListener('click', exportBackup);
$('tab-salva').addEventListener('close', () => {
  if ($('tab-salva-nao-avisar').checked) store.setPref('saveWarn', false);
});
fillTabInstruments();
setupGrid();
renderTabList();
renderAB();
renderBoard(null);

// ---------- Início ----------
$('anterior').addEventListener('click', () => move(-1));
$('tocar-dedilhar').addEventListener('click', () => playCurrent('dedilhar'));
$('tocar-batida').addEventListener('click', () => playCurrent('batida'));
// Desbloqueia o áudio no primeiro gesto VÁLIDO. Em tela de toque, pointerdown/touchstart não contam
// como ativação do usuário (Chrome/Safari): o contexto nasceria suspenso. Use touchend/click/keydown.
const UNLOCK_EVENTS = ['touchend', 'click', 'keydown'];
function firstGesture() {
  if (unlock()?.state === 'running') UNLOCK_EVENTS.forEach(ev => document.removeEventListener(ev, firstGesture, true));
}
UNLOCK_EVENTS.forEach(ev => document.addEventListener(ev, firstGesture, { capture: true, passive: true }));
// Ao voltar do segundo plano o iOS deixa o contexto 'interrupted': o próximo toque o retoma.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') UNLOCK_EVENTS.forEach(ev => document.addEventListener(ev, firstGesture, { capture: true, passive: true }));
});
$('proxima').addEventListener('click', () => move(1));
document.addEventListener('keydown', e => {
  if (stageOpen()) return stageKeys(e);
  if (e.target.closest('input, textarea, select, [role="tab"], .grid-wrap, dialog')) return;
  if (e.key === 'ArrowLeft') move(-1);
  if (e.key === 'ArrowRight') move(1);
});
setupSearch();
applyPrefs();
// Dica das cordas: só na 1ª visita
if (!seen('cordas')) { $('dica-cordas').hidden = false; markSeen('cordas'); }
renderLibrary();
window.addEventListener('hashchange', () => { if (applyRoute(location.hash)) showView('acordes'); });
if (!applyRoute(location.hash)) {
  routeMode = 'replace';
  selectChord(state.chord);
  routeMode = 'push';
}
renderReverse();
setupPWA();
if (!seen('tour') && document.body.dataset.view === 'acordes') showTour(0);
