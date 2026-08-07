/**
 * Verifier entry point.
 *
 * No service worker: caching a verification surface offers nothing and adds a persistence and
 * update-integrity surface the trust model does not want.
 *
 * Note for deployment: a service worker that a browser has already registered is not removed by
 * deleting this application's. An origin that previously served one must ship an unregistration
 * path before this build can be considered the only code running there.
 *
 * Every failure here is made VISIBLE. A verification tool that renders a blank page tells the
 * operator nothing, and "nothing happened" is the one outcome a verifier must never produce
 * silently.
 */
import './lib/schema-runtime.js';
import { initApp } from './ui/app.js';

function fatal(message: string): void {
  const p = document.createElement('p');
  p.textContent = message;
  document.body.appendChild(p);
}

const root = document.getElementById('app');
if (!root) {
  fatal('The verifier could not start: its mount point is missing from the page.');
} else {
  void initApp(root).catch(() => {
    // initApp handles its own initialization failure; this covers anything else, so a rejected
    // promise can never become a blank screen.
    root.replaceChildren();
    fatal('The verifier could not start.');
  });
}
