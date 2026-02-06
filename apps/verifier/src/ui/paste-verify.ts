/**
 * Paste + Verify Component
 *
 * Textarea for pasting JWS receipts with a Verify button.
 */

import { verifyReceipt } from '../verify.js';
import { renderResults } from './results.js';

export function initPasteVerify(): void {
  const container = document.getElementById('paste-verify');
  if (!container) return;

  container.innerHTML = `
    <label for="receipt-input">Paste a JWS receipt:</label>
    <textarea id="receipt-input" rows="6"
      placeholder="eyJ0eXAiOiJQRUFDLXJlY2VpcHQvMC4xIi..."></textarea>
    <button id="verify-btn" type="button">Verify</button>
  `;

  const textarea = document.getElementById('receipt-input') as HTMLTextAreaElement;
  const btn = document.getElementById('verify-btn') as HTMLButtonElement;

  btn.addEventListener('click', async () => {
    const jws = textarea.value.trim();
    if (!jws) return;

    btn.disabled = true;
    btn.textContent = 'Verifying...';

    try {
      const result = await verifyReceipt(jws);
      renderResults(result);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Verify';
    }
  });
}
