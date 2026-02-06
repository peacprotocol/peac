/**
 * Results Component
 *
 * Renders verification results with claims breakdown.
 */

import type { VerifyResult } from '../verify.js';
import { formatClaims } from '../lib/format-claims.js';

const STATUS_LABELS: Record<string, string> = {
  valid: 'VALID',
  invalid: 'INVALID',
  error: 'ERROR',
  'no-key': 'NO KEY',
};

export function renderResults(result: VerifyResult): void {
  const container = document.getElementById('results');
  if (!container) return;

  const statusClass = result.status;
  const statusLabel = STATUS_LABELS[result.status] ?? 'UNKNOWN';

  let html = `
    <div class="result ${statusClass}">
      <div class="result-status">${statusLabel}</div>
      <div class="result-message">${escapeHtml(result.message)}</div>
  `;

  if (result.kid) {
    html += `<div class="result-kid">Key ID: ${escapeHtml(result.kid)}</div>`;
  }

  if (result.claims) {
    const formatted = formatClaims(result.claims);
    html += '<table class="claims-table">';
    html += '<thead><tr><th>Claim</th><th>Value</th></tr></thead><tbody>';
    for (const claim of formatted) {
      html += `<tr>
        <td class="claim-label">${escapeHtml(claim.label)}</td>
        <td class="claim-value ${claim.type}">${escapeHtml(claim.value)}</td>
      </tr>`;
    }
    html += '</tbody></table>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
