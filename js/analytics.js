// analytics.js — métricas de uso anônimas no GoatCounter (dicionario-acordes.goatcounter.com).
// Sem script externo e sem cookies: envia direto ao endpoint /count (mesma API do count.js oficial).
// Páginas = seções do app (/acordes, /repertorio…); eventos = ações (tocar/batida, favorito/adicionar…).
// Não conta em localhost/file:, em navegador automatizado (testes), com localStorage.skipgc === 't'
// (convenção do GoatCounter) nem quando o usuário desliga em Ajustes. Offline: guarda na memória e
// reenvia ao voltar a conexão.

const ENDPOINT = 'https://dicionario-acordes.goatcounter.com/count';
const MAX_QUEUE = 50;

let enabled = true;
let firstView = true;
const queue = [];
const lastSent = new Map(); // nome → instante (para limitar eventos repetitivos)

function blocked() {
  try { if (localStorage.getItem('skipgc') === 't') return true; } catch { /* sem storage */ }
  const h = location.hostname;
  return location.protocol === 'file:' || h === 'localhost' || h === '[::1]' || /^127\.|^0\.0\.0\.0$|^192\.168\./.test(h)
    || navigator.webdriver === true;
}
const off = blocked();
// Depuração: localStorage.gcdebug = 't' mostra no console o que seria enviado (também em localhost).
const debug = (() => { try { return localStorage.getItem('gcdebug') === 't'; } catch { return false; } })();

/** Liga/desliga o envio (preferência do usuário). */
export function setEnabled(on) { enabled = !!on; if (!enabled) queue.length = 0; }

/** Limpa um trecho de caminho: sem espaços nem caracteres estranhos, tamanho limitado. */
export function slug(s, max = 40) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w#/()+.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || '-';
}

function send(params) {
  if (debug) console.info('[goatcounter]', params.e ? 'evento' : 'página', params.p, params);
  if (off) return;
  const q = new URLSearchParams({ ...params, s: `${screen.width},${screen.height},${devicePixelRatio || 1}`, rnd: Math.random().toString(36).slice(2, 8) });
  const url = `${ENDPOINT}?${q}`;
  if (!navigator.onLine) { enqueue(url); return; }
  fetch(url, { mode: 'no-cors', keepalive: true, credentials: 'omit' }).catch(() => enqueue(url));
}
function enqueue(url) { if (queue.length < MAX_QUEUE) queue.push(url); }
addEventListener('online', () => {
  const urls = queue.splice(0);
  urls.forEach(u => fetch(u, { mode: 'no-cors', keepalive: true, credentials: 'omit' }).catch(() => enqueue(u)));
});

/** Visualização de página (seção do app). `path` sem a base do site, ex.: '/acordes'. */
export function trackView(path, title = document.title) {
  if (!enabled) return;
  const p = { p: path, t: title };
  if (firstView) {
    firstView = false;
    if (document.referrer && !document.referrer.startsWith(location.origin)) p.r = document.referrer;
    const qs = location.search.slice(1); // campanhas: ?utm_source=… / ?ref=…
    if (qs) p.q = qs;
  }
  send(p);
}

/**
 * Evento (ação do usuário). `name` vira o "caminho" do evento no painel, ex.: 'tocar/batida'.
 * `throttleMs`: o mesmo nome não é reenviado antes desse intervalo (para ações muito repetidas).
 */
export function trackEvent(name, { title = '', throttleMs = 0 } = {}) {
  if (!enabled) return;
  const now = Date.now();
  if (throttleMs && now - (lastSent.get(name) ?? -Infinity) < throttleMs) return;
  lastSent.set(name, now);
  send({ p: name, t: title || name, e: 'true' });
}

/** Igual a trackEvent, mas só envia depois de `ms` sem nova chamada com a mesma chave (ex.: acorde escolhido). */
const timers = new Map();
export function trackEventDebounced(key, name, ms = 1500, opts = {}) {
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => { timers.delete(key); trackEvent(name, opts); }, ms));
}
