// Mimic's service worker: makes the app installable and opens instantly.
//
//  - The app shell (HTML, CSS, JS, icons) is cached and served at once, then
//    refreshed in the background, so a new version shows on the next launch.
//  - The pose tracker runtime (/vendor/mediapipe, several MB) is cached the
//    first time it's used, so later sessions don't download it again.
//  - Anything live is never cached: the API, videos, and party rooms.

const VERSION = 'mimic-v2';
const SHELL = [
  '/', '/index.html', '/styles.css', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png',
  '/js/main.js', '/js/dom.js', '/js/api.js', '/js/draw.js', '/js/judge.js', '/js/report.js', '/js/fitness.js',
  '/js/party-client.js', '/js/pwa.js',
  '/js/pose/skeleton.js', '/js/pose/timeline.js', '/js/pose/compare.js', '/js/pose/tracker.js',
  '/js/screens/home.js', '/js/screens/preparing.js', '/js/screens/studio.js', '/js/screens/battle.js',
  '/js/screens/results.js', '/js/screens/settings.js', '/js/screens/party.js', '/js/screens/scout.js', '/js/screens/related.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (/^\/(api|media|party)(\/|$)/.test(url.pathname)) return; // live: straight to the network

  if (url.pathname.startsWith('/vendor/')) {
    // Big and versioned by the pinned package: cache first.
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }

  // App shell: answer from cache straight away, refresh it in the background.
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => hit);
    return hit || fresh;
  }));
});
