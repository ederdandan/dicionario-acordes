// app.js — orquestra interface, estado e eventos.
import { CATEGORIES, CHORD_TYPES, ROOT_GRID, TYPE_BY_Q, chordNotes, pcOf, spell, toPt } from './theory.js';
import { parseChord, suggest } from './parser.js';
import { INSTRUMENTS, DEFAULT_INSTRUMENT, DEFAULT_TUNING } from './instruments.js';
import { getVoicings, identifyChord } from './voicings.js';
import { renderDiagram, renderEditor } from './diagram.js';
import { play, unlock, scheduleFrets, stopAll, audioNow, audioLatency } from './audio.js';
import { parseTab, stepSeconds, TAB_EXAMPLE } from './tab.js';
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
  panel.replaceChildren(...chords.map(c => button(c.symbol, 'chip', () => { selectChord(c); revealViewer(); }, {
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
    main.replaceChildren(renderDiagram(v, inst(), tun(), { leftHanded: lefty(), onString: course => playCurrent('dedilhar', course) }));
    $('posicao-rotulo').innerHTML = '';
    $('posicao-rotulo').append(v.label);
    if (v.nick && v.nick.toLowerCase() !== v.label.toLowerCase()) $('posicao-rotulo').append(Object.assign(document.createElement('small'), { textContent: v.nick }));
  }
  $('tocar-dedilhar').disabled = $('tocar-batida').disabled = !v;
  $('posicao-contador').textContent = `Posição ${voicings.length ? idx + 1 : 0}/${voicings.length}`;
  $('anterior').disabled = idx <= 0;
  $('proxima').disabled = idx >= voicings.length - 1;
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
  if (v) play(v, state.instrument, tun(), { mode, course });
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

// ---------- Preferências: tema e canhoto ----------
const THEMES = { auto: 'automático', light: 'claro', dark: 'escuro' };
const lefty = () => store.prefs().leftHanded;

function applyPrefs() {
  const { theme, leftHanded } = store.prefs();
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  $('tema').textContent = `Tema: ${THEMES[theme]}`;
  $('tema').setAttribute('aria-label', `Tema ${THEMES[theme]} (alternar)`);
  $('canhoto').setAttribute('aria-pressed', String(leftHanded));
}

$('tema').addEventListener('click', () => {
  const order = Object.keys(THEMES);
  store.setPref('theme', order[(order.indexOf(store.prefs().theme) + 1) % order.length]);
  applyPrefs();
});
$('canhoto').addEventListener('click', () => {
  store.setPref('leftHanded', !lefty());
  applyPrefs();
  renderViewer();
  renderReverse();
});

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
$('exportar').addEventListener('click', () => {
  const blob = new Blob([store.exportJSON()], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob), download: `dicionario-acordes-backup-${new Date().toISOString().slice(0, 10)}.json`,
  });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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

  const list = $('reverso-resultados');
  if (rev.frets.filter(f => f >= 0).length < 2) {
    list.replaceChildren(Object.assign(document.createElement('li'), { className: 'empty-item', textContent: 'Monte um shape com ao menos 2 cordas tocadas.' }));
    return;
  }
  const found = identifyChord(rev.frets, state.instrument, state.tuning);
  list.replaceChildren(...(found.length ? found.map(r => {
    const li = document.createElement('li');
    const b = button(r.symbol, 'chip', () => { selectChord(r.chord, { frets: rev.frets }); showView('acordes'); revealViewer(); }, { title: chordTitle(r.chord) });
    const notes = [r.rootInBass ? 'tônica no baixo' : `baixo em ${r.bassName}`];
    if (r.omitted) notes.push(`omite ${r.omitted} nota${r.omitted > 1 ? 's' : ''}`);
    li.append(b, Object.assign(document.createElement('small'), { textContent: `${chordTitle(r.chord)} · ${notes.join(' · ')}` }));
    return li;
  }) : [Object.assign(document.createElement('li'), { className: 'empty-item', textContent: 'Nenhum acorde conhecido com essas notas.' })]));
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
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
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
  if (mobile()) window.scrollTo({ top: 0 });
}
document.querySelectorAll('.bottom-nav [data-go]').forEach(b => b.addEventListener('click', () => showView(b.dataset.go)));

/** No celular o diagrama fica acima do seletor: depois de escolher, volta até ele. */
function revealViewer() {
  if (!mobile()) return;
  const top = document.querySelector('.viewer').getBoundingClientRect().top + window.scrollY - 8;
  if (Math.abs(window.scrollY - top) > 40) window.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
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
addSwipe($('diagrama'), d => move(d));
addSwipe($('palco-diagrama'), d => goRehearsal(state.rehearsal.pos + d));

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

// ---------- Tablatura (Fase 6a) ----------
// Agendador com antecedência no relógio do Web Audio + destaque por quadro (requestAnimationFrame).
const TAB = { parsed: null, playing: false, timer: 0, raf: 0, start: 0, next: 0, dt: 0.1, queue: [], spans: [], on: -1, editId: null };
const tabKey = () => $('tab-instrumento').value.split('/');

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
    r.ignored?.length ? `Anotações ignoradas: ${r.ignored.join(', ')}` : '',
  ].filter(Boolean).join(' · ');
  TAB.parsed = r.error === undefined ? r : null;
  renderTabView();
  return TAB.parsed;
}

function renderTabView() {
  const p = TAB.parsed;
  TAB.spans = [];
  TAB.on = -1;
  if (!p) return $('tab-view').replaceChildren();
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
        (TAB.spans[nt.ev] ||= []).push(sp);
        pre.append(sp);
        pos = nt.col + nt.len;
      }
      pre.append(line.slice(pos) + (li < b.lines.length - 1 ? '\n' : ''));
    });
    return pre;
  }));
}

function tabHighlight(ev) {
  if (ev < TAB.on) { TAB.spans.flat().forEach(s => s.classList.remove('on', 'done')); TAB.on = -1; } // recomeço (repetir)
  (TAB.spans[TAB.on] || []).forEach(s => { s.classList.remove('on'); s.classList.add('done'); });
  const cur = TAB.spans[ev] || [];
  cur.forEach(s => { s.classList.remove('done'); s.classList.add('on'); });
  const sp = cur[0], pre = sp?.parentElement;
  if (pre) {
    pre.scrollLeft = sp.offsetLeft - pre.clientWidth / 2;
    if (TAB.parsed.events[TAB.on]?.block !== TAB.parsed.events[ev].block) pre.scrollIntoView({ block: 'nearest' });
  }
  TAB.on = ev;
}

function tabSchedule() {
  const p = TAB.parsed, ev = p.events;
  const ahead = audioNow() + (document.hidden ? 1.5 : 0.3); // em segundo plano o setInterval é atrasado
  for (;;) {
    if (TAB.next >= ev.length) {
      const end = TAB.start + p.steps * TAB.dt;
      if (!$('tab-repetir').checked) { if (audioNow() > end && !TAB.queue.length) tabStop(false); return; }
      if (end > ahead) return;
      TAB.start = end; TAB.next = 0; // repete do início, emendado no tempo
    }
    const e = ev[TAB.next], when = TAB.start + e.step * TAB.dt;
    if (when > ahead) return;
    scheduleFrets(e.frets, TAB.inst, TAB.tun, when, e.chord ? { strum: 0.018, gain: 0.6 } : undefined);
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

function tabPlay(from = 0) {
  tabStop();
  const p = tabParse();
  if (!p || !unlock()) return;
  const [i, t] = tabKey();
  Object.assign(TAB, {
    inst: i, tun: INSTRUMENTS[i].tunings[t], dt: stepSeconds(+$('tab-bpm').value, +$('tab-unidade').value),
    next: from, queue: [], playing: true,
  });
  TAB.start = audioNow() + 0.12 - p.events[from].step * TAB.dt;
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

function renderTabList() {
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

function openTab(t) {
  tabStop();
  TAB.editId = t.id;
  $('tab-nome').value = t.name;
  fillTabInstruments(`${t.instrument}/${t.tuning}`);
  $('tab-texto').value = t.text;
  $('tab-bpm').value = t.bpm;
  $('tab-unidade').value = String(t.unit);
  tabParse();
  $('tab-texto').scrollIntoView({ block: 'nearest' });
}

$('tab-play').addEventListener('click', () => (TAB.playing ? tabStop() : tabPlay(0)));
$('tab-view').addEventListener('click', e => {
  const sp = e.target.closest('.tn');
  if (sp) tabPlay(+sp.dataset.ev);
});
for (const id of ['tab-texto', 'tab-instrumento', 'tab-acordes']) $(id).addEventListener('input', () => { tabStop(); tabParse(); });
for (const id of ['tab-bpm', 'tab-unidade']) $(id).addEventListener('change', () => { if (TAB.playing) tabPlay(Math.max(0, TAB.on)); });
$('tab-exemplo').addEventListener('click', () => {
  tabStop();
  TAB.editId = null;
  $('tab-nome').value = 'Exemplo (C · G/B · Am · F)';
  fillTabInstruments('violao/padrao');
  $('tab-texto').value = TAB_EXAMPLE;
  tabParse();
});
$('tab-salvar').addEventListener('click', () => {
  if (!tabParse()) { $('tab-msg').textContent ||= 'Digite uma tablatura antes de salvar.'; return; }
  const [i, t] = tabKey();
  const saved = store.saveTab({
    id: TAB.editId, name: $('tab-nome').value.trim() || 'Sem nome', text: $('tab-texto').value,
    instrument: i, tuning: t, bpm: +$('tab-bpm').value, unit: +$('tab-unidade').value,
  });
  TAB.editId = saved?.id ?? null;
  notify(saved ? 'Tablatura salva' : 'Não foi possível salvar');
  renderTabList();
});
fillTabInstruments();
renderTabList();

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
  if (e.target.closest('input, [role="tab"]')) return;
  if (e.key === 'ArrowLeft') move(-1);
  if (e.key === 'ArrowRight') move(1);
});
setupSearch();
applyPrefs();
renderLibrary();
window.addEventListener('hashchange', () => applyRoute(location.hash));
if (!applyRoute(location.hash)) {
  routeMode = 'replace';
  selectChord(state.chord);
  routeMode = 'push';
}
renderReverse();
setupPWA();
