/**
 * Record, key and verification-context inputs.
 *
 * File reads go through the fatal UTF-8 decoder on raw bytes, never File.text(), because byte
 * identity matters for the record digest.
 */
import { decodeFileBytesStrict } from '../lib/strict-json.js';

export interface InputFields {
  readonly record: HTMLTextAreaElement;
  readonly keyDocument: HTMLTextAreaElement;
  readonly contextDocument: HTMLTextAreaElement;
}

function field(parent: HTMLElement, id: string, label: string, hint: string): HTMLTextAreaElement {
  const wrap = document.createElement('div');
  const l = document.createElement('label');
  l.htmlFor = id;
  l.textContent = label;
  const ta = document.createElement('textarea');
  ta.id = id;
  ta.rows = 6;
  const p = document.createElement('p');
  p.textContent = hint;
  const file = document.createElement('input');
  file.type = 'file';
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    if (!f) return;
    void f.arrayBuffer().then((buf) => {
      try {
        ta.value = decodeFileBytesStrict(new Uint8Array(buf), 'E_VERIFIER_RECORD_MALFORMED');
      } catch {
        ta.value = '';
        p.textContent = 'That file is not valid UTF-8 and was not loaded.';
      }
    });
  });
  wrap.append(l, ta, file, p);
  parent.appendChild(wrap);
  return ta;
}

export function renderInputs(container: HTMLElement): InputFields {
  return {
    record: field(
      container,
      'record',
      'PEAC record (compact JWS)',
      'Paste the record exactly as received. Surrounding whitespace is rejected, not trimmed.'
    ),
    keyDocument: field(
      container,
      'key',
      'Public key (JWK or JWKS)',
      'Public Ed25519 key material only. Private key material is rejected.'
    ),
    contextDocument: field(
      container,
      'context',
      'Verification expectations (optional)',
      'A VerificationContextV1 document: trusted key thumbprints and/or issuer, key id and record type constraints.'
    ),
  };
}
