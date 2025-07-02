// Custom service worker events to ensure immediate activation
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  // Skip waiting to activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  // Take control of all pages immediately
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // For testing, just pass through
  console.log('[SW] Fetch:', event.request.url);
});