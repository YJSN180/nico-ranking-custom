// Hard kill-switch Service Worker
// 目的: 既存のSWとキャッシュを確実に破棄する

self.addEventListener('install', (event) => {
  // 即座にこのSWを有効化
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
      // すべてのクライアントをリロードして新SWを適用
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      clientList.forEach((client) => client.navigate(client.url))
      await self.clients.claim()
      // 自身を登録解除
      await self.registration.unregister()
    } catch (e) {
      // ignore
    }
  })())
})

self.addEventListener('fetch', () => {
  // すべてネットワークへパススルー
})
