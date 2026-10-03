// Minimal Service Worker（UX改善計画 フェーズ5-1）
// 方針: データ/アセットのキャッシュは一切しない（過去のdplずれ・古いデータ
// 事故の再発防止）。プリキャッシュするのは offline.html のみで、
// fetch に介入するのは「ページ遷移(navigate)」だけ（失敗時にオフラインページを返す）。
// それ以外のリクエストはブラウザ標準のネットワーク動作に任せる。
// キャッシュ名は nr-offline- で始める（hooks/use-pull-to-refresh.ts はこの接頭辞を消さない）

const OFFLINE_CACHE = 'nr-offline-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // navigation preload: ページ遷移の通信を SW の起動と並行して始める。
      // 遷移を横取りする SW は、これが無いと遷移のたびに起動を待ってから通信する
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {})
      }
      // 自分の管理外・旧バージョンのキャッシュを掃除
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key !== OFFLINE_CACHE).map((key) => caches.delete(key)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  // ページ遷移のみ対象。API・画像・アセットには一切介入しない
  if (event.request.mode !== 'navigate') return

  event.respondWith(
    (async () => {
      try {
        // 先読み（navigation preload）の応答があればそれを使う。無ければ（未対応・未有効）取得する
        const preloaded = await event.preloadResponse
        if (preloaded) return preloaded
        return await fetch(event.request)
      } catch {
        const cached = await caches.match(OFFLINE_URL)
        return (
          cached ||
          new Response('オフラインです', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          })
        )
      }
    })()
  )
})
