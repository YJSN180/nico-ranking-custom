// Hard kill-switch Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    } catch (e) {
      // ignore
    }
    try {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      clientList.forEach((client) => client.navigate(client.url))
      await self.clients.claim()
      await self.registration.unregister()
    } catch (e) {
      // ignore
    }
  })())
})

self.addEventListener('fetch', () => {
  // no-op: network only
})
