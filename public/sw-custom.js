// Custom service worker events with safe activation
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  // Do NOT skip waiting - wait for all tabs to close
  // self.skipWaiting(); // REMOVED to prevent data loss
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  // Do NOT claim clients immediately - let new pages use new SW
  // event.waitUntil(clients.claim()); // REMOVED to prevent data loss
});

self.addEventListener('fetch', (event) => {
  // For testing, just pass through
  console.log('[SW] Fetch:', event.request.url);
});