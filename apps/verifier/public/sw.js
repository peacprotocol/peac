/* eslint-env serviceworker */
/**
 * Service Worker -- App Shell Cache
 *
 * Intentionally minimal: caches only the app shell (index.html) for
 * offline use. Does NOT cache API responses, JWKS, or receipts --
 * verification must always use fresh cryptographic material.
 *
 * Strategy: cache-first for static assets, network-fallback.
 * Bump CACHE_NAME to invalidate on deploy.
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
