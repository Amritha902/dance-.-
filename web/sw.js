// Mimic's service worker: makes the app installable and opens instantly.
//
//  - The app shell (HTML, CSS, JS, icons) comes from the network first, so a
//    new deploy shows at once and old and new files never mix; the cached copy
//    is only used offline (or if the server takes too long to answer).
//  - The pose tracker runtime (/vendor/mediapipe, several MB) is cached the
//    first time it's used, so later sessions don't download it again.
//  - Anything live is never cached: the API, videos, and party rooms.

const VERSION = 'mimic-v9';
const SHELL = [
  '/', '/index.html', '/styles.css', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png',
  '/js/main.js', '/js/dom.js', '/js/api.js', '/js/draw.js', '/js/judge.js', '/js/report.js', '/js/fitness.js',
  '/js/party-client.js', '/js/pwa.js',
  '/js/pose/skeleton.js', '/js/pose/timeline.js', '/js/pose/compare.js', '/js/pose/tracker.js',
  '/js/screens/home.js', '/js/screens/preparing.js', '/js/screens/studio.js', '/js/screens/battle.js',
  '/js/screens/results.js', '/js/screens/settings.js', '/js/screens/party.js', '/js/screens/scout.js', '/js/screens/related.js', '/js/screens/trending.js', '/js/screens/more.js', '/js/region.js', '/js/screens/search.js', '/js/screens/watch.js', '/js/badges.js', '/js/share.js', '/js/profile.js', '/js/screens/account.js',
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

  // App shell: network first (fresh deploys win, no old/new mix), falling
  // back to the cache when offline or when a sleeping server is slow to wake.
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const net = fetch(e.request, { cache: 'no-cache' }).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; });
    const slow = new Promise((r) => setTimeout(r, 6000)).then(() => c.match(e.request, { ignoreSearch: true }));
    try {
      const first = await Promise.race([net, slow]);
      return first || await net;
    } catch {
      return (await c.match(e.request, { ignoreSearch: true })) || Response.error();
    }
  }));
});
