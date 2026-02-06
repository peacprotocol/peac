/**
 * Verifier Entry Point
 *
 * Initializes the app shell and registers the service worker.
 */

import { initApp } from './ui/app.js';

// Initialize app
initApp();

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Service worker registration failed -- app still works without it
  });
}
