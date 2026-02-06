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
const SANDBOX_JWKS_URI = 'http://127.0.0.1:3100/.well-known/jwks.json';

export function initTrustConfig(): void {
  const container = document.getElementById('trust-config');
  if (!container) return;

  render(container);
}

function render(container: HTMLElement): void {
  const issuers = getIssuers();

  let html = `
    <h2>Trusted Issuers</h2>
    <div class="trust-actions">
      <button id="load-sandbox" type="button">Load Sandbox JWKS</button>
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

  // Event: Load Sandbox JWKS
  document.getElementById('load-sandbox')?.addEventListener('click', async () => {
    await loadSandboxJwks(container);
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

async function loadSandboxJwks(container: HTMLElement): Promise<void> {
  try {
    const res = await fetch(SANDBOX_JWKS_URI);
    if (!res.ok) {
      alert(`Failed to fetch JWKS: ${res.status} ${res.statusText}`);
      return;
    }

    const jwks = (await res.json()) as { keys: TrustedKey[] };
    const issuer: TrustedIssuer = {
      issuer: SANDBOX_ISSUER,
      jwks_uri: SANDBOX_JWKS_URI,
      keys: jwks.keys,
    };

    addIssuer(issuer);
    render(container);
  } catch (err) {
    alert(
      `Could not connect to sandbox issuer at ${SANDBOX_JWKS_URI}. Is it running?\n\n` +
        `Start it with: pnpm --filter @peac/app-sandbox-issuer start`
    );
  }
}

function saveManualKey(container: HTMLElement): void {
  const issuerInput = document.getElementById('manual-issuer') as HTMLInputElement;
  const jwkInput = document.getElementById('manual-jwk') as HTMLTextAreaElement;

  const issuerUrl = issuerInput.value.trim();
  if (!issuerUrl) {
    alert('Issuer URL is required');
    return;
  }

  let key: TrustedKey;
  try {
    key = JSON.parse(jwkInput.value) as TrustedKey;
    if (!key.kid || !key.x || !key.crv) {
      alert('JWK must include kid, x, and crv fields');
      return;
    }
  } catch {
    alert('Invalid JSON in public key field');
    return;
  }

  const existing = getIssuers().find((i) => i.issuer === issuerUrl);
  const issuer: TrustedIssuer = existing
    ? { ...existing, keys: [...existing.keys.filter((k) => k.kid !== key.kid), key] }
    : { issuer: issuerUrl, keys: [key] };

  addIssuer(issuer);
  render(container);
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
