// sw.js — service worker offline-first.
// Ao publicar qualquer mudança nos arquivos abaixo, incremente CACHE_NAME: o app mostra
// "Nova versão disponível — Atualizar" e só troca de versão quando o usuário confirmar.
const CACHE_NAME = 'dicionario-acordes-v29';
// Amostras gravadas (samples/): cache próprio, guardadas na 1ª vez que tocam e mantidas entre versões do app.
// Ao trocar os arquivos de samples/, incremente SAMPLES_CACHE.
const SAMPLES_CACHE = 'acordes-amostras-v1';

// Caminhos relativos ao escopo do SW (funciona em usuario.github.io/repo/).
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/theory.js',
  './js/parser.js',
  './js/instruments.js',
  './js/voicings.js',
  './js/curated.js',
  './js/diagram.js',
  './js/audio.js',
  './js/storage.js',
  './js/progressions.js',
  './js/rhythms.js',
  './js/band.js',
  './js/analytics.js',
  './icons/logo.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];
const INDEX = new URL('./index.html', self.registration.scope).href;
const SAMPLES = new URL('./samples/', self.registration.scope).href;

self.addEventListener('install', event => {
  // Sem skipWaiting aqui: a versão nova espera o usuário clicar em "Atualizar".
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => (k.startsWith('dicionario-acordes-') && k !== CACHE_NAME) || (k.startsWith('acordes-amostras-') && k !== SAMPLES_CACHE)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

/** index.html: rede primeiro (para receber atualizações), cache como reserva. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(INDEX, res.clone());
    return res;
  } catch {
    return (await cache.match(INDEX)) || (await cache.match(request)) || Response.error();
  }
}

/** Demais arquivos: cache primeiro; o que não estiver no pré-cache vai à rede e é guardado. */
async function cacheFirst(request, name = CACHE_NAME) {
  const cache = await caches.open(name);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  const isPage = request.mode === 'navigate' || url.href === INDEX || url.href === self.registration.scope;
  if (url.pathname.endsWith('tests.html')) return; // testes sempre da rede
  event.respondWith(isPage ? networkFirst(request) : cacheFirst(request, url.href.startsWith(SAMPLES) ? SAMPLES_CACHE : CACHE_NAME));
});
