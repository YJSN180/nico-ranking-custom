// Minimal pass-through Service Worker for PWA install prompt
// - 不要なキャッシュは行わない（dplずれ防止）
// - オフライン対応はしないが、SW登録でPWAインストールを可能にする

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// fetchは触らずブラウザ標準のネットワーク動作に任せる
