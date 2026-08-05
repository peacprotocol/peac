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

  /**
   * Per-field read generation.
   *
   * Reads are asynchronous, so selecting a second file before the first resolves leaves two reads in
   * flight. Whichever settles last would win, which can place the contents of a file the operator
   * has already replaced into the field. Each read captures the generation it started with and
   * applies its result only while that generation is still current.
   */
  let readGeneration = 0;

  file.addEventListener('change', () => {
    const f = file.files?.[0];
    if (!f) return;
    const generation = ++readGeneration;

    void f
      .arrayBuffer()
      .then((buf) => {
        if (generation !== readGeneration) return;
        try {
          ta.value = decodeFileBytesStrict(new Uint8Array(buf), 'E_VERIFIER_RECORD_MALFORMED');
          // Restore the field's own guidance after a successful read, so a previous failure notice
          // does not persist beside content that loaded correctly.
          p.textContent = hint;
        } catch {
          ta.value = '';
          p.textContent = 'That file is not valid UTF-8 and was not loaded.';
        }
      })
      .catch(() => {
        // arrayBuffer() rejects when the file is unreadable: removed, permission-denied, or a
        // hardware error mid-read. Without this the rejection would be unhandled and the operator
        // would see no indication that nothing was loaded.
        if (generation !== readGeneration) return;
        ta.value = '';
        p.textContent = 'That file could not be read and was not loaded.';
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
