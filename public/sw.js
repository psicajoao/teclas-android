const C = 'teclas-v1'
self.addEventListener('install', (e) => { self.skipWaiting() })
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
// Arquivos pesados e com hash: do cache primeiro. Página e manifesto: rede primeiro, cache se estiver sem rede.
self.addEventListener('fetch', (e) => {
  const r = e.request
  if (r.method !== 'GET' || !r.url.startsWith(self.location.origin)) return
  const url = new URL(r.url)
  if (url.pathname.includes('/sounds/library/')) return // biblioteca: só baixa sob demanda, quem guarda é o IndexedDB
  const heavy = /\.(sf2|js|css|png|svg|woff2?)$/.test(url.pathname)
  if (heavy) {
    e.respondWith(caches.open(C).then(async (c) => {
      const hit = await c.match(r, { ignoreSearch: true })
      if (hit) return hit
      const res = await fetch(r)
      if (res.ok) c.put(r, res.clone())
      return res
    }))
  } else {
    e.respondWith(fetch(r).then((res) => { if (res.ok) caches.open(C).then((c) => c.put(r, res.clone())); return res }).catch(() => caches.match(r, { ignoreSearch: true }).then((h) => h || caches.match(self.registration.scope))))
  }
})
