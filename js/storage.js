// storage.js — favoritos, progressões e preferências no localStorage (sempre em try/catch),
// backup em JSON e rota na URL (#/instrumento[/afinação]/acorde/posição). Sem DOM.

const KEY = 'dicionario-acordes:v1';
const FORMAT = 'dicionario-acordes-backup';
const DEFAULT_PREFS = { theme: 'auto', leftHanded: false, saveWarn: true, seen: {}, studyKey: 'C', stats: true };

const empty = () => ({ favorites: [], progressions: [], tabs: [], prefs: { ...DEFAULT_PREFS, seen: {} } });

function getBackend(backend) {
  if (backend) return backend;
  try { return globalThis.localStorage ?? null; } catch { return null; } // acesso pode lançar (cookies bloqueados)
}

/** Higieniza dados vindos do storage ou de um arquivo importado. */
function sanitize(raw) {
  const out = empty();
  if (!raw || typeof raw !== 'object') return out;
  const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
  for (const f of Array.isArray(raw.favorites) ? raw.favorites : []) {
    if (!f || !str(f.symbol) || !str(f.instrument) || !str(f.tuning)) continue;
    const frets = Array.isArray(f.frets) ? f.frets.map(Number).filter(Number.isInteger) : [];
    out.favorites.push({
      id: favoriteId({ ...f, frets }), symbol: str(f.symbol), instrument: str(f.instrument), tuning: str(f.tuning),
      idx: Number.isInteger(f.idx) && f.idx >= 0 ? f.idx : 0, frets, created: Number(f.created) || 0,
    });
  }
  for (const p of Array.isArray(raw.progressions) ? raw.progressions : []) {
    if (!p || !Array.isArray(p.chords)) continue;
    const chords = p.chords.map(c => str(c, 40)).filter(Boolean);
    if (!chords.length) continue;
    out.progressions.push({ id: str(p.id, 60) || newId(), name: str(p.name, 80) || 'Sem nome', chords, created: Number(p.created) || 0 });
  }
  for (const t of Array.isArray(raw.tabs) ? raw.tabs : []) {
    const text = str(t?.text, 20000);
    if (!text.trim()) continue;
    out.tabs.push({
      id: str(t.id, 60) || newId(), name: str(t.name, 80) || 'Sem nome', text,
      instrument: str(t.instrument, 30) || 'violao', tuning: str(t.tuning, 30) || 'padrao',
      bpm: Math.min(240, Math.max(40, Math.round(Number(t.bpm)) || 90)), unit: [8, 32].includes(t.unit) ? t.unit : 16, created: Number(t.created) || 0,
    });
  }
  if (raw.prefs && typeof raw.prefs === 'object') {
    if (['auto', 'light', 'dark'].includes(raw.prefs.theme)) out.prefs.theme = raw.prefs.theme;
    out.prefs.leftHanded = raw.prefs.leftHanded === true;
    out.prefs.stats = raw.prefs.stats !== false; // métricas de uso anônimas (GoatCounter)
    out.prefs.saveWarn = raw.prefs.saveWarn !== false; // aviso "fica só neste aparelho" ao salvar tablatura
    if (typeof raw.prefs.studyKey === 'string' && /^[A-G][#b]?$/.test(raw.prefs.studyKey)) out.prefs.studyKey = raw.prefs.studyKey; // tom das progressões de estudo
    // dicas de 1ª visita já vistas (tour, "deslize para trocar"…): { chave: true }
    const seen = raw.prefs.seen && typeof raw.prefs.seen === 'object' ? raw.prefs.seen : {};
    out.prefs.seen = Object.fromEntries(Object.keys(seen).filter(k => /^\w{1,24}$/.test(k) && seen[k] === true).slice(0, 32).map(k => [k, true]));
  }
  return out;
}

let counter = 0;
const newId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;
export const favoriteId = f => `${f.instrument}/${f.tuning}/${f.symbol}/${(f.frets || []).join(',')}`;

/**
 * Cria um repositório. Os dados ficam em memória e são gravados a cada mudança;
 * se o localStorage estiver indisponível, o app continua funcionando só na sessão.
 */
export function createStorage({ key = KEY, backend } = {}) {
  const be = getBackend(backend);
  let data = empty();
  try {
    const txt = be?.getItem(key);
    if (txt) data = sanitize(JSON.parse(txt));
  } catch (e) { console.warn('[storage] leitura falhou', e); }

  const persist = () => {
    try { be?.setItem(key, JSON.stringify(data)); return true; } catch (e) { console.warn('[storage] gravação falhou', e); return false; }
  };

  return {
    // Favoritos
    favorites: () => data.favorites.slice(),
    isFavorite: f => data.favorites.some(x => x.id === favoriteId(f)),
    addFavorite(f) {
      const fav = sanitize({ favorites: [{ ...f, created: Date.now() }] }).favorites[0];
      if (!fav || data.favorites.some(x => x.id === fav.id)) return false;
      data.favorites.push(fav);
      return persist();
    },
    removeFavorite(id) { data.favorites = data.favorites.filter(f => f.id !== id); return persist(); },
    // Progressões
    progressions: () => data.progressions.slice(),
    saveProgression(p) {
      const prog = sanitize({ progressions: [{ ...p, id: p.id || newId(), created: p.created || Date.now() }] }).progressions[0];
      if (!prog) return null;
      const i = data.progressions.findIndex(x => x.id === prog.id);
      if (i >= 0) data.progressions[i] = prog; else data.progressions.push(prog);
      persist();
      return prog;
    },
    removeProgression(id) { data.progressions = data.progressions.filter(p => p.id !== id); return persist(); },
    // Tablaturas
    tabs: () => data.tabs.slice(),
    saveTab(t) {
      const tab = sanitize({ tabs: [{ ...t, id: t.id || newId(), created: t.created || Date.now() }] }).tabs[0];
      if (!tab) return null;
      const i = data.tabs.findIndex(x => x.id === tab.id);
      if (i >= 0) data.tabs[i] = tab; else data.tabs.push(tab);
      persist();
      return tab;
    },
    removeTab(id) { data.tabs = data.tabs.filter(t => t.id !== id); return persist(); },
    // Preferências
    prefs: () => ({ ...data.prefs, seen: { ...data.prefs.seen } }),
    setPref(k, v) { data.prefs = sanitize({ prefs: { ...data.prefs, [k]: v } }).prefs; return persist(); },
    // Backup
    exportJSON() {
      return JSON.stringify({ format: FORMAT, version: 1, exported: new Date().toISOString(), ...data }, null, 2);
    },
    /** Backup com uma só tablatura (sem preferências): importável pelo mesmo "Importar JSON". */
    exportTabJSON(id) {
      const tab = data.tabs.find(t => t.id === id);
      return tab ? JSON.stringify({ format: FORMAT, version: 1, exported: new Date().toISOString(), tabs: [tab] }, null, 2) : null;
    },
    /** Mescla um backup (itens com o mesmo id são substituídos). Lança erro se o arquivo for inválido. */
    importJSON(text) {
      let raw;
      try { raw = JSON.parse(text); } catch { throw new Error('Arquivo não é um JSON válido.'); }
      if (!raw || raw.format !== FORMAT) throw new Error('Arquivo não é um backup do Dicionário de Acordes.');
      const inc = sanitize(raw);
      const merge = (cur, add) => [...cur.filter(c => !add.some(a => a.id === c.id)), ...add];
      data.favorites = merge(data.favorites, inc.favorites);
      data.progressions = merge(data.progressions, inc.progressions);
      data.tabs = merge(data.tabs, inc.tabs);
      if (raw.prefs) data.prefs = inc.prefs;
      persist();
      return { favorites: inc.favorites.length, progressions: inc.progressions.length, tabs: inc.tabs.length };
    },
    clear() { data = empty(); try { be?.removeItem(key); } catch { /* ignora */ } },
  };
}

/** Separa o texto de uma progressão em cifras ("C7M → A7, Dm7 | G7(b9)"). */
export function splitProgression(text, parse) {
  const out = [];
  for (const part of String(text).split(/\s*(?:→|->|,|;|\|)\s*/)) {
    const p = part.trim();
    if (!p) continue;
    if (parse(p)) { out.push(p); continue; }
    // Sem separador explícito: tenta separar por espaços ("C Am F G")
    for (const w of p.split(/\s+/)) if (w) out.push(w);
  }
  return out;
}

// ---------- Rota na URL ----------
/** { instrument, tuning, symbol, idx } → '#/violao/C7M/2' (afinação omitida se for a padrão). */
export function formatRoute({ instrument, tuning, symbol, idx }, instruments) {
  const tunings = Object.keys(instruments[instrument]?.tunings || {});
  const parts = [instrument];
  if (tuning && tuning !== tunings[0]) parts.push(tuning);
  parts.push(encodeURIComponent(symbol), String((idx || 0) + 1));
  return '#/' + parts.join('/');
}

/** '#/viola/rioAbaixo/G%2FB/2' → { instrument, tuning, symbol, idx } | null */
export function parseRoute(hash, instruments) {
  const m = /^#?\/(.+)$/.exec(hash || '');
  if (!m) return null;
  const seg = m[1].split('/');
  const inst = instruments[seg.shift()];
  if (!inst) return null;
  const tids = Object.keys(inst.tunings);
  const tuning = seg.length >= 2 && tids.includes(seg[0]) ? seg.shift() : tids[0];
  let symbol;
  try { symbol = decodeURIComponent(seg.shift() || ''); } catch { return null; }
  if (!symbol) return null;
  const n = parseInt(seg.shift(), 10);
  return { instrument: inst.id, tuning, symbol, idx: Number.isFinite(n) && n > 0 ? n - 1 : 0 };
}
