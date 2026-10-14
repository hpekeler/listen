/* Service-Worker für "Listen"
   - HTML-Navigation: erst Netz, dann Cache  -> Updates kommen an, offline geht trotzdem
   - Statik (Icons/Manifest): Cache-first
   - Sync-Aufrufe an den Cloudflare-Worker: gar nicht angefasst (immer Netz)
   - Push: das Betriebssystem weckt diesen Worker, auch wenn die App zu ist
   Bei Code-Änderungen CACHE hochzählen (v11 -> v12). */
const CACHE = 'listen-v19';
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
      // no-cache: am HTTP-Cache des Browsers vorbei nachfragen (ETag, meist 304).
      // Sonst liefert er bis zu 10 Minuten die alte Seite, obwohl schon eine
      // neue auf Pages liegt – und das Auto-Update lädt umsonst neu.
      // Eine Weiterleitung darf eine Navigation so nicht beantworten – dann
      // klassisch mit der Original-Anfrage.
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((res) => (res.redirected ? fetch(req) : res))
        .then((res) => { if (res.ok && res.type === 'basic') { const c = res.clone(); caches.open(CACHE).then((cc) => cc.put('./index.html', c)).catch(() => {}); } return res; })
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

/* ---- Push ------------------------------------------------------------------
   Hier MUSS immer eine sichtbare Meldung raus. Das Abo läuft mit
   `userVisibleOnly:true`; ein Push, der nichts anzeigt, gilt als stiller Push –
   iOS entzieht dafür im Zweifel das Abo. Deshalb kein früher return, sondern
   ein Fallback-Text, falls die Nutzlast fehlt oder kaputt ist. */
self.addEventListener('push', (e) => {
  let d = { title: 'Listen', body: 'Bitte Liste checken' };
  try { if (e.data) d = { ...d, ...e.data.json() }; } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: d.listId || 'listen',   // gleiche Liste ersetzt die alte Meldung
    data: d,
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const id = (e.notification.data && e.notification.data.listId) || '';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { c.postMessage({ type: 'open-list', id }); return c.focus(); }
    }
    // App war komplett zu: über den Hash starten, index.html liest ihn beim Start.
    if (self.clients.openWindow) return self.clients.openWindow(id ? './#list=' + id : './');
  })());
});

/* Nur als Ergänzung: Auf WebKit feuert das Ereignis unzuverlässig. Der
   verlässliche Weg ist der Abgleich per getSubscription() beim App-Start
   (siehe syncPushSub() in index.html). */
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) c.postMessage({ type: 'resub' });
  })());
});
