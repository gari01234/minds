const CACHE_NAME = 'isabella-shell-v88';
const SHELL = [
  './',
  './index.html',
  './app.css?v=54',
  './shell.js?v=78',
  './app.js?v=84',
  './work.js?v=5',
  './sync.js?v=pwa27',
  './ai.js?v=47',
  './manifest.webmanifest?v=2',
  './icon.svg?v=2',
  './apple-touch-icon.png?v=2',
  './icon-192.png?v=2',
  './icon-512.png?v=2',
  '../shared/supabase-client.js',
  '../shared/human-surface.js?v=1'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isFreshAsset =
    event.request.mode === 'navigate' ||
    ['script','style','document','manifest'].includes(event.request.destination) ||
    /\.(?:js|css|html|webmanifest)(?:\?|$)/.test(url.pathname + url.search);

  if (isFreshAsset) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(x => x || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});


self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data?.json?.() || {};
  } catch {
    payload = { body: event.data?.text?.() || '' };
  }
  const title = String(payload.title || 'Isabella');
  const options = {
    body: String(payload.body || 'Hay algo que merece tu atención.'),
    icon: './icon-192.png?v=2',
    badge: './icon-192.png?v=2',
    tag: payload.tag ? String(payload.tag) : undefined,
    renotify: true,
    data: { url: String(payload.url || './') }
  };
  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => self.navigator?.setAppBadge?.(1))
      .catch(() => undefined)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.location.origin).href;
  event.waitUntil((async () => {
    try { await self.navigator?.clearAppBadge?.(); } catch {}
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const base = new URL('./', self.location.href).href;
    const existing = windows.find(client => client.url.startsWith(base));
    if (existing) {
      try { await existing.navigate(target); } catch {}
      await existing.focus();
      return;
    }
    await self.clients.openWindow(target);
  })());
});
