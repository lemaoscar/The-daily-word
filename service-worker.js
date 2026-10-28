const CACHE_NAME = 'daily-word-shell-v6';
const CORE_FILES = [
  '/index.html',
  '/study.html',
  '/bible.html',
  '/prayer.html',
  '/sermon-notes.html',
  '/sync.html',
  '/discover.html',
  '/plan.html',
  '/game.html',
  '/assistant.html',
  '/video-studio.html',
  '/app.css',
  '/assistant.css',
  '/bible.css',
  '/bible-theme.css',
  '/discover.css',
  '/game.css',
  '/home.css',
  '/plan.css',
  '/prayer.css',
  '/study.css',
  '/video-studio.css',
  '/daily-word-theme.css',
  '/app.js',
  '/home.js',
  '/bible-interactions.js',
  '/bible-modern.css',
  '/data-protection.js',
  '/calendar-reminder.js',
  '/sermon-notes-core.js',
  '/sermon-notes.js',
  '/sermon-notes.css',
  '/cloud-sync.js',
  '/cloud-sync-core.js',
  '/cloud-sync.css',
  '/assets/year-plan.js',
  '/assets/bible-web.js',
  '/assets/my-logo.png',
  '/assets/daily-word-192.png',
  '/assets/daily-word-512.png',
  '/assets/quiet-morning.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('daily-word-shell-') && key !== CACHE_NAME).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(new URL(url.pathname, url.origin).href, response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return await cache.match(request) || await cache.match(url.pathname) || await cache.match('/index.html');
      }
    })());
    return;
  }

  if (['script', 'style', 'image', 'font'].includes(request.destination)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
