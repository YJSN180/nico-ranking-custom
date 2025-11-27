// Kill-switch Service Worker: immediately unregister and wipe caches
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
      await self.clients.claim()
      await self.registration.unregister()
    } catch (e) {
      // ignore
    }
  })())
})

self.addEventListener('fetch', () => {
  // no-op: let network handle everything
})
