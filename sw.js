/* Service-Worker für "Listen"
   - HTML-Navigation: erst Netz, dann Cache  -> Updates kommen an, offline geht trotzdem
   - Statik (Icons/Manifest): Cache-first
   - Sync-Aufrufe an den Cloudflare-Worker: gar nicht angefasst (immer Netz)
   Bei Code-Änderungen CACHE hochzählen (v10 -> v11). */
const CACHE = 'listen-v10';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map((u) => c.add(u)));  // einzeln, scheitert nicht komplett
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    // Netz zuerst, Cache als Offline-Fallback
    e.respondWith(
      fetch(req)
        .then((res) => { const c = res.clone(); caches.open(CACHE).then((cc) => cc.put('./index.html', c)).catch(() => {}); return res; })
        .catch(() => caches.match('./index.html').then((h) => h || caches.match('./')))
    );
    return;
  }
  // Statik: Cache zuerst
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const c = res.clone(); caches.open(CACHE).then((cc) => cc.put(req, c)).catch(() => {}); return res;
    }))
  );
});
