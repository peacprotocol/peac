/**
 * Record, key and verification-context inputs.
 *
 * File reads go through the fatal UTF-8 decoder on raw bytes, never File.text(), because byte
 * identity matters for the record digest.
 *
 * Every value change advances a shared revision and every unresolved read is counted, so a caller
 * can bind a verification to the exact input state it submitted.
 */
import { decodeFileBytesStrict } from '../lib/strict-json.js';

export interface InputFields {
  readonly record: HTMLTextAreaElement;
  readonly keyDocument: HTMLTextAreaElement;
  readonly contextDocument: HTMLTextAreaElement;
  /** Monotonic across all three fields. Any change to any value advances it. */
  revision(): number;
  /** True while any field holds an unresolved file read. */
  hasPendingRead(): boolean;
  /** Disable or restore every mutable control. */
  setDisabled(disabled: boolean): void;
  /** Invoked after any value change or pending-read transition. */
  onChange(listener: () => void): void;
}

interface SharedState {
  /** Record a value change and notify listeners. */
  bump(): void;
  /** Adjust the count of unresolved reads. Apply before bump so listeners see settled state. */
  pendingDelta(delta: number): void;
  /** Register a control the caller may disable for the duration of a run. */
  register(control: { disabled: boolean }): void;
}

function field(
  parent: HTMLElement,
  id: string,
  label: string,
  hint: string,
  shared: SharedState
): HTMLTextAreaElement {
  const wrap = document.createElement('div');
  const l = document.createElement('label');
  l.htmlFor = id;
  l.textContent = label;
  const ta = document.createElement('textarea');
  ta.id = id;
  ta.rows = 6;
  ta.setAttribute('aria-describedby', `${id}-hint`);
  const p = document.createElement('p');
  p.id = `${id}-hint`;
  p.textContent = hint;
  const file = document.createElement('input');
  file.type = 'file';
  file.setAttribute('aria-label', `Load ${label} from a file`);
  shared.register(ta);
  shared.register(file);

  /**
   * Per-field read generation.
   *
   * Reads are asynchronous, so two can be in flight at once and settle out of order. Each read
   * captures the generation it started with and applies its result only while that generation is
   * still current. Anything that supersedes a read advances the generation.
   */
  let readGeneration = 0;
  let pending = false;

  function setPending(next: boolean): void {
    if (pending === next) return;
    pending = next;
    shared.pendingDelta(next ? 1 : -1);
  }

  ta.addEventListener('input', () => {
    // Manual text supersedes any read in flight: without this a file chosen moments earlier could
    // overwrite what the operator has since typed.
    readGeneration++;
    setPending(false);
    shared.bump();
  });

  file.addEventListener('change', () => {
    // Advance before inspecting the selection, so clearing it also invalidates reads in flight.
    const generation = ++readGeneration;
    const f = file.files?.[0];
    if (!f) {
      setPending(false);
      shared.bump();
      return;
    }
    setPending(true);
    shared.bump();

    void f
      .arrayBuffer()
      .then((buf) => {
        if (generation !== readGeneration) return;
        setPending(false);
        try {
          ta.value = decodeFileBytesStrict(new Uint8Array(buf), 'E_VERIFIER_RECORD_MALFORMED');
          // Restore the field's own guidance, so a previous failure notice does not persist beside
          // content that loaded correctly.
          p.textContent = hint;
        } catch {
          ta.value = '';
          p.textContent = 'That file is not valid UTF-8 and was not loaded.';
        }
        shared.bump();
      })
      .catch(() => {
        // arrayBuffer() rejects when the file is unreadable: removed, permission-denied, or a
        // hardware error mid-read. The notice is a fixed string; no file name or content is echoed.
        if (generation !== readGeneration) return;
        setPending(false);
        ta.value = '';
        p.textContent = 'That file could not be read and was not loaded.';
        shared.bump();
      });
  });
  wrap.append(l, ta, file, p);
  parent.appendChild(wrap);
  return ta;
}

export function renderInputs(container: HTMLElement): InputFields {
  let revision = 0;
  let pendingReads = 0;
  const listeners: Array<() => void> = [];
  const controls: Array<{ disabled: boolean }> = [];

  const shared: SharedState = {
    bump() {
      revision++;
      for (const listener of listeners) listener();
    },
    pendingDelta(delta) {
      pendingReads += delta;
    },
    register(control) {
      controls.push(control);
    },
  };

  const record = field(
    container,
    'record',
    'PEAC record (compact JWS)',
    'Paste the record exactly as received. Surrounding whitespace is rejected, not trimmed.',
    shared
  );
  const keyDocument = field(
    container,
    'key',
    'Public key (JWK or JWKS)',
    'Public Ed25519 key material only. Private key material is rejected.',
    shared
  );
  const contextDocument = field(
    container,
    'context',
    'Verification expectations (optional)',
    'A VerificationContextV1 document: trusted key thumbprints and/or issuer, key id and record ' +
      'type constraints. Obtain trusted thumbprints independently or out of band. This verifier ' +
      'does not establish where a supplied thumbprint came from.',
    shared
  );

  return {
    record,
    keyDocument,
    contextDocument,
    revision: () => revision,
    hasPendingRead: () => pendingReads > 0,
    setDisabled(disabled) {
      for (const control of controls) control.disabled = disabled;
    },
    onChange(listener) {
      listeners.push(listener);
    },
  };
}
