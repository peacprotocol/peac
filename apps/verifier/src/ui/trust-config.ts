/**
 * Trust Configuration Component
 *
 * Manage trusted issuers and their public keys.
 * Includes a "Load Sandbox JWKS" button for quick setup.
 */

import {
  getIssuers,
  addIssuer,
  removeIssuer,
  type TrustedIssuer,
  type TrustedKey,
} from '../lib/trust-store.js';

const SANDBOX_ISSUER = 'https://sandbox.peacprotocol.org';
const SANDBOX_JWKS_URI = 'https://sandbox.peacprotocol.org/.well-known/jwks.json';
const LOCAL_JWKS_URI = 'http://127.0.0.1:3100/.well-known/jwks.json';

export function initTrustConfig(): void {
  const container = document.getElementById('trust-config');
  if (!container) return;

  render(container);
}

function render(container: HTMLElement): void {
  const issuers = getIssuers();

  let html = `
    <h2>Trusted Issuers</h2>
    <div id="trust-message" class="trust-message"></div>
    <div class="trust-actions">
      <button id="load-sandbox" type="button">Load Sandbox JWKS</button>
      <button id="load-local" type="button">Load Local Issuer</button>
      <button id="add-manual" type="button">Add Key Manually</button>
    </div>
  `;

  if (issuers.length === 0) {
    html +=
      '<p class="empty">No trusted issuers configured. Load sandbox keys or add manually.</p>';
  } else {
    html += '<ul class="issuer-list">';
    for (const issuer of issuers) {
      html += `
        <li class="issuer-item">
          <div class="issuer-header">
            <strong>${escapeHtml(issuer.issuer)}</strong>
            <button class="remove-btn" data-issuer="${escapeHtml(issuer.issuer)}">Remove</button>
          </div>
          <ul class="key-list">
            ${issuer.keys.map((k) => `<li>kid: ${escapeHtml(k.kid)} (${escapeHtml(k.crv)})</li>`).join('')}
          </ul>
        </li>
      `;
    }
    html += '</ul>';
  }

  // Manual add form (hidden by default)
  html += `
    <div id="manual-form" class="manual-form" style="display:none">
      <h3>Add Public Key</h3>
      <label for="manual-issuer">Issuer URL:</label>
      <input id="manual-issuer" type="url" placeholder="https://issuer.example.com" />
      <label for="manual-jwk">Public Key (JWK JSON):</label>
      <textarea id="manual-jwk" rows="4" placeholder='{"kty":"OKP","crv":"Ed25519","x":"...","kid":"..."}'></textarea>
      <button id="manual-save" type="button">Save</button>
    </div>
  `;

  container.innerHTML = html;

  // Event: Load Sandbox JWKS (HTTPS)
  document.getElementById('load-sandbox')?.addEventListener('click', async () => {
    await loadJwks(container, SANDBOX_JWKS_URI, SANDBOX_ISSUER);
  });

  // Event: Load Local Issuer (dev)
  document.getElementById('load-local')?.addEventListener('click', async () => {
    await loadJwks(container, LOCAL_JWKS_URI, 'http://127.0.0.1:3100');
  });

  // Event: Toggle manual form
  document.getElementById('add-manual')?.addEventListener('click', () => {
    const form = document.getElementById('manual-form')!;
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  // Event: Save manual key
  document.getElementById('manual-save')?.addEventListener('click', () => {
    saveManualKey(container);
  });

  // Event: Remove issuer
  container.querySelectorAll<HTMLButtonElement>('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const issuerUrl = btn.dataset.issuer;
      if (issuerUrl) {
        removeIssuer(issuerUrl);
        render(container);
      }
    });
  });
}

function showMessage(msg: string, type: 'error' | 'success'): void {
  const el = document.getElementById('trust-message');
  if (!el) return;
  el.textContent = msg;
  el.className = `trust-message ${type}`;
  // Auto-clear success messages
  if (type === 'success') {
    setTimeout(() => {
      el.textContent = '';
      el.className = 'trust-message';
    }, 3000);
  }
}

async function loadJwks(container: HTMLElement, jwksUri: string, issuerUrl: string): Promise<void> {
  try {
    const res = await fetch(jwksUri);
    if (!res.ok) {
      showMessage(`Failed to fetch JWKS: ${res.status} ${res.statusText}`, 'error');
      return;
    }

    const jwks = (await res.json()) as { keys: TrustedKey[] };
    const issuer: TrustedIssuer = {
      issuer: issuerUrl,
      jwks_uri: jwksUri,
      keys: jwks.keys,
    };

    addIssuer(issuer);
    showMessage(`Loaded ${jwks.keys.length} key(s) from ${issuerUrl}`, 'success');
    render(container);
  } catch {
    showMessage(
      `Could not connect to ${jwksUri}. ` +
        (jwksUri.includes('127.0.0.1')
          ? 'Is the local issuer running? Start it with: pnpm --filter @peac/app-sandbox-issuer start'
          : 'Check that the issuer is reachable.'),
      'error'
    );
  }
}

function saveManualKey(container: HTMLElement): void {
  const issuerInput = document.getElementById('manual-issuer') as HTMLInputElement;
  const jwkInput = document.getElementById('manual-jwk') as HTMLTextAreaElement;

  const issuerUrl = issuerInput.value.trim();
  if (!issuerUrl) {
    showMessage('Issuer URL is required', 'error');
    return;
  }

  let key: TrustedKey;
  try {
    key = JSON.parse(jwkInput.value) as TrustedKey;
    if (!key.kid || !key.x || !key.crv) {
      showMessage('JWK must include kid, x, and crv fields', 'error');
      return;
    }
  } catch {
    showMessage('Invalid JSON in public key field', 'error');
    return;
  }

  const existing = getIssuers().find((i) => i.issuer === issuerUrl);
  const issuer: TrustedIssuer = existing
    ? { ...existing, keys: [...existing.keys.filter((k) => k.kid !== key.kid), key] }
    : { issuer: issuerUrl, keys: [key] };

  addIssuer(issuer);
  showMessage(`Added key ${key.kid} for ${issuerUrl}`, 'success');
  render(container);
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
