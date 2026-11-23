// Network first, cache fallback (as in Bela Blok): always fresh when online, offline mode still loads without a connection.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname === '/events') return; // never cache the live game stream
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(r => { const c = r.clone(); caches.open('bela').then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
