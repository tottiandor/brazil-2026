// Offline: a saját fájlok hálózat-először (hogy a frissítés megjöjjön), offline a gyorsítótárból.
// Térkép-csempék, Leaflet és a Commons-fotók: gyorsítótár-először. Időjárás: az app maga tárolja.
const VERSION = 'v5-2026-11-09';
const SHELL = `shell-${VERSION}`;
const RUNTIME = 'runtime-v1';
const SHELL_FILES = [
  './', 'index.html', 'app.js', 'data.js', 'places.js', 'config.js', 'manifest.webmanifest',
  'maps-food.json', 'maps-sights.json',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'img/places/th_steak.jpg', 'img/places/th_coffee.jpg', 'img/places/th_beer.jpg', 'img/places/th_icecream.jpg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(SHELL).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }

  // A szinkronizált listák a raw.githubusercontent.com-ról: hálózat először, offline a legutóbbi.
  if (url.hostname === 'raw.githubusercontent.com') {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      caches.open(RUNTIME).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req)));
    return;
  }

  if (/tile\.openstreetmap\.org|cdnjs\.cloudflare\.com|commons\.wikimedia\.org|upload\.wikimedia\.org/.test(url.hostname)) {
    e.respondWith(caches.open(RUNTIME).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
  }
  // Minden más (MET Norway, YouTube) közvetlenül a hálózatra megy.
});
