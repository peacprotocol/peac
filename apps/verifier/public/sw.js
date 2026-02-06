/* eslint-env serviceworker */
/**
 * Service Worker -- App Shell Cache
 *
 * Caches static assets for offline use.
 */

const CACHE_NAME = 'peac-verifier-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(['/', '/index.html'])));
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
