/**
 * App Shell
 *
 * DOM shell with tab switching between paste-verify and trust config.
 */

import { initPasteVerify } from './paste-verify.js';
import { initFileUpload } from './file-upload.js';
import { initTrustConfig } from './trust-config.js';

export function initApp(): void {
  const appEl = document.getElementById('app');
  if (!appEl) return;

  appEl.innerHTML = `
    <header>
      <h1>PEAC Receipt Verifier</h1>
      <p>Client-side receipt verification -- nothing leaves your browser.</p>
    </header>

    <nav class="tabs">
      <button class="tab active" data-tab="verify">Verify</button>
      <button class="tab" data-tab="trust">Trusted Keys</button>
    </nav>

    <section id="tab-verify" class="tab-content active">
      <div id="paste-verify"></div>
      <div id="file-upload"></div>
      <div id="results"></div>
    </section>

    <section id="tab-trust" class="tab-content">
      <div id="trust-config"></div>
    </section>
  `;

  // Tab switching
  const tabs = appEl.querySelectorAll<HTMLButtonElement>('.tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.tab-content').forEach((c) => {
        c.classList.remove('active');
      });
      const target = tab.dataset.tab;
      document.getElementById(`tab-${target}`)?.classList.add('active');
    });
  });

  // Initialize components
  initPasteVerify();
  initFileUpload();
  initTrustConfig();
}
