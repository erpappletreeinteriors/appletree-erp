// Minimal service worker — required for PWA installability (Android TWA
// packaging via PWABuilder checks for a registered service worker). Caches
// only the app shell so the icon/name show up and the app can cold-start
// offline to a "reconnecting" state; all real data comes from Supabase over
// the network as before, so no business data is cached here.
const CACHE_NAME = 'appletree-erp-shell-v1';
const SHELL_FILES = [
  './',
  './appletree_erp_v2_1.html',
  './manifest.json',
  './logo.png',
  './icon-192.png',
  './icon-512.png',
  './vendor/supabase.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Network-first for everything (this app is online-first / Supabase-backed);
// fall back to the cached shell only if the network request fails entirely,
// so a reopened tab with no connectivity still shows something instead of
// a browser error page.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
