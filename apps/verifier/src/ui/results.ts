/**
 * Text-only result rendering.
 *
 * Every node is created with document.createElement and filled with textContent. There is no
 * innerHTML anywhere -- not even as a reader -- so a claim value can never be interpreted as markup.
 * Claims are rendered ONLY on success.
 */
import type { BrowserVerificationResult, UiMode } from '../lib/verifier-types.js';
import { formatClaims } from '../lib/format-claims.js';

/**
 * Stable id of the message for an input-stage failure, so the field the operator can correct can
 * reference the concrete error through aria-describedby. Only input and key-selection failures carry
 * it; later stages describe the record's content, not a malformed input.
 */
export const INPUT_ERROR_MESSAGE_ID = 'verification-input-error';

const MODE_COPY: Record<UiMode, string> = {
  'integrity-only':
    'The signature is valid under the supplied key. The verifier did not independently establish that this key was expected for the reported issuer.',
  'constraints-checked':
    'The reported values matched the supplied constraints, but the signing key was not independently trusted.',
  'trusted-key':
    'The selected key matched a thumbprint in the supplied verification context. The verifier did not establish how that context was obtained.',
};

function el(tag: string, text?: string, cls?: string): HTMLElement {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

function row(dl: HTMLElement, label: string, value: string): void {
  dl.appendChild(el('dt', label));
  dl.appendChild(el('dd', value));
}

export function renderResults(result: BrowserVerificationResult, container: HTMLElement): void {
  container.replaceChildren();

  if ('capability' in result) {
    container.className = 'result--capability';
    container.appendChild(el('h2', 'This browser cannot verify'));
    container.appendChild(el('p', result.message));
    return;
  }

  if (result.ok) {
    container.className = 'result--ok';
    container.appendChild(el('h2', 'Verification succeeded'));
    container.appendChild(el('p', MODE_COPY[result.mode]));
    container.appendChild(el('p', `Mode: ${result.mode}`));

    const assessment = el('dl');
    row(assessment, 'Signature', result.signature);
    row(assessment, 'Record validation', result.recordValidation);
    row(assessment, 'Trusted key', result.trustedKey);
    row(assessment, 'Issuer constraint', result.issuerConstraint);
    row(assessment, 'Key id constraint', result.kidConstraint);
    row(assessment, 'Record type constraint', result.recordTypeConstraint);
    row(assessment, 'Claim truth', result.claimTruth);
    container.appendChild(assessment);

    container.appendChild(el('h3', 'Claims protected by this signature'));
    const claims = el('dl');
    for (const c of formatClaims({ ...result.claims })) {
      row(claims, c.label, c.value);
    }
    container.appendChild(claims);
    return;
  }

  // Failure: code and a neutral message only. No claims, no stack, no raw key, no echoed record.
  container.className = 'result--fail';
  container.appendChild(el('h2', 'Verification failed'));
  const message = el('p', result.message);
  // Give an input-stage error message a stable id so the offending field can point at it.
  if (result.failureStage === 'input' || result.failureStage === 'key_selection') {
    message.id = INPUT_ERROR_MESSAGE_ID;
  }
  container.appendChild(message);
  const d = el('dl');
  row(d, 'Stage', result.failureStage);
  row(d, 'Code', String(result.code));
  if (result.diagnostic) row(d, 'Diagnostic', result.diagnostic);
  container.appendChild(d);
}
