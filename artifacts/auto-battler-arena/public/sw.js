// Only public, versioned identity assets are stored. Auth, game state, and API
// requests are never intercepted or cached.
const CACHE = 'fwa-public-v1';
const ASSETS = ['fantasy-logo.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']
  .map(path => new URL(path, self.registration.scope).pathname);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const path = new URL(event.request.url).pathname;
  if (!ASSETS.includes(path)) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});