// app.js — orquestra interface, estado e eventos.
import { CATEGORIES, CHORD_TYPES, ROOT_GRID, TYPE_BY_Q, chordNotes, pcOf, spell, toPt } from './theory.js';
import { parseChord, suggest } from './parser.js';
import { INSTRUMENTS, DEFAULT_INSTRUMENT, DEFAULT_TUNING } from './instruments.js';
import { getVoicings, identifyChord } from './voicings.js';
import { renderDiagram, renderEditor } from './diagram.js';
import { play, unlock } from './audio.js';
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
  if (i < 0 || i >= state.voicings.length) return;
  state.idx = i;
  renderViewer();
  renderAnalysis();
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

// ---------- Rota na URL (#/violao/C7M/2) ----------
function syncHash() {
  const h = formatRoute({ instrument: state.instrument, tuning: state.tuning, symbol: state.chord.symbol, idx: state.idx }, INSTRUMENTS);
  if (location.hash !== h) history[routeMode === 'replace' ? 'replaceState' : 'pushState'](null, '', h);
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
  $('diagrama').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  if (store.isFavorite(f)) store.removeFavorite(favoriteId(f)); else store.addFavorite(f);
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
  $('prog-nome').value = $('prog-acordes').value = '';
  renderLibrary();
});

function startRehearsal(prog) {
  state.rehearsal = { prog, pos: 0 };
  goRehearsal(0);
  $('ensaio').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
}

$('ensaio-anterior').addEventListener('click', () => goRehearsal(state.rehearsal.pos - 1));
$('ensaio-proximo').addEventListener('click', () => goRehearsal(state.rehearsal.pos + 1));
$('ensaio-tocar').addEventListener('click', () => playCurrent('batida'));
$('ensaio-sair').addEventListener('click', () => { state.rehearsal = null; renderRehearsal(); });

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
    $('backup-msg').textContent = `Importados: ${n.favorites} favorito(s) e ${n.progressions} progressão(ões).`;
  } catch (err) {
    $('backup-msg').textContent = err.message;
  }
  applyPrefs(); renderLibrary(); renderViewer(); renderReverse();
});
$('apagar-tudo').addEventListener('click', () => {
  if (!confirm('Apagar todos os favoritos, progressões e preferências? Exporte um backup antes, se quiser guardá-los.')) return;
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

  const list = $('reverso-resultados');
  if (rev.frets.filter(f => f >= 0).length < 2) {
    list.replaceChildren(Object.assign(document.createElement('li'), { className: 'empty-item', textContent: 'Monte um shape com ao menos 2 cordas tocadas.' }));
    return;
  }
  const found = identifyChord(rev.frets, state.instrument, state.tuning);
  list.replaceChildren(...(found.length ? found.map(r => {
    const li = document.createElement('li');
    const b = button(r.symbol, 'chip', () => selectChord(r.chord, { frets: rev.frets }), { title: chordTitle(r.chord) });
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
