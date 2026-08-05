/**
 * File-read correctness for the input fields.
 *
 * A read is asynchronous, so selecting a second file before the first resolves leaves two reads in
 * flight. Whichever settles last would win, which can place the contents of a file the operator has
 * already replaced into the field that a verification then consumes.
 *
 * Reads can also fail outright: `arrayBuffer()` rejects when a file is removed, permission-denied or
 * unreadable mid-read. An unhandled rejection there would leave the field silently empty.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { installMiniDom, uninstallMiniDom, createContainer } from './helpers/mini-dom.js';
import type { MiniNode } from './helpers/mini-dom.js';

const flush = () => new Promise((r) => setTimeout(r, 0));
const enc = new TextEncoder();

afterEach(() => {
  vi.resetModules();
  uninstallMiniDom();
});

/** A file whose read resolves when the returned `settle` is called. */
function deferredFile(bytes: Uint8Array | null) {
  let settle: () => void = () => {};
  const gate = new Promise<void>((r) => (settle = r));
  const file = {
    async arrayBuffer() {
      await gate;
      if (bytes === null) throw new Error('file could not be read');
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
  return { file, settle: () => settle() };
}

async function mountInputs() {
  installMiniDom();
  const { renderInputs } = await import('../src/ui/inputs.js');
  const container = createContainer() as unknown as HTMLElement;
  const fields = renderInputs(container);
  const node = container as unknown as MiniNode;
  const inputs = node.querySelectorAll('input');
  const hints = node.querySelectorAll('p');
  return { fields, node, inputs, hints };
}

/** Drive one field's file input with a prepared file. */
function selectFile(input: MiniNode, file: unknown) {
  input.files = [file];
  input.dispatchEvent('change');
}

describe('a stale read cannot overwrite a newer selection', () => {
  it('the newer selection wins even when the older read settles last', async () => {
    const { fields, inputs } = await mountInputs();
    const recordInput = inputs[0];
    const target = fields.record as unknown as MiniNode;

    const first = deferredFile(enc.encode('FIRST-FILE'));
    const second = deferredFile(enc.encode('SECOND-FILE'));

    selectFile(recordInput, first.file);
    await flush();
    selectFile(recordInput, second.file);
    await flush();

    // Settle OUT OF ORDER: the newer read first, then the older one.
    second.settle();
    await flush();
    expect(target.value).toBe('SECOND-FILE');

    first.settle();
    await flush();
    expect(target.value).toBe('SECOND-FILE');
  });
});

describe('a read rejection is handled', () => {
  it('clears the field and states that nothing was loaded', async () => {
    const { fields, inputs, hints } = await mountInputs();
    const target = fields.record as unknown as MiniNode;

    const ok = deferredFile(enc.encode('LOADED'));
    selectFile(inputs[0], ok.file);
    ok.settle();
    await flush();
    expect(target.value).toBe('LOADED');

    const broken = deferredFile(null);
    selectFile(inputs[0], broken.file);
    broken.settle();
    await flush();

    expect(target.value).toBe('');
    expect(hints[0].textContent).toMatch(/could not be read/i);
  });

  it('does not leave an unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    try {
      const { inputs } = await mountInputs();
      const broken = deferredFile(null);
      selectFile(inputs[0], broken.file);
      broken.settle();
      await flush();
      await flush();
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

describe('malformed UTF-8 is reported, not loaded', () => {
  it('rejects an overlong sequence without throwing out of the handler', async () => {
    const { fields, inputs, hints } = await mountInputs();
    const target = fields.record as unknown as MiniNode;

    // 0xC0 0x80 is an overlong encoding of U+0000 and is invalid UTF-8.
    const malformed = deferredFile(new Uint8Array([0xc0, 0x80]));
    selectFile(inputs[0], malformed.file);
    malformed.settle();
    await flush();

    expect(target.value).toBe('');
    expect(hints[0].textContent).toMatch(/not valid UTF-8/i);
  });

  it('rejects a lone continuation byte', async () => {
    const { fields, inputs } = await mountInputs();
    const target = fields.record as unknown as MiniNode;
    const malformed = deferredFile(new Uint8Array([0x80]));
    selectFile(inputs[0], malformed.file);
    malformed.settle();
    await flush();
    expect(target.value).toBe('');
  });
});

describe('the normal hint returns after a successful read', () => {
  it('a failure notice does not persist beside content that loaded correctly', async () => {
    const { fields, inputs, hints } = await mountInputs();
    const target = fields.record as unknown as MiniNode;
    const originalHint = hints[0].textContent;
    expect(originalHint.length).toBeGreaterThan(0);

    const malformed = deferredFile(new Uint8Array([0xc0, 0x80]));
    selectFile(inputs[0], malformed.file);
    malformed.settle();
    await flush();
    expect(hints[0].textContent).not.toBe(originalHint);

    const good = deferredFile(enc.encode('RECOVERED'));
    selectFile(inputs[0], good.file);
    good.settle();
    await flush();

    expect(target.value).toBe('RECOVERED');
    expect(hints[0].textContent).toBe(originalHint);
  });
});

describe('a superseded read cannot apply', () => {
  it('clearing the selection invalidates a read already in flight', async () => {
    const { fields, inputs } = await mountInputs();
    const target = fields.record as unknown as MiniNode;
    const recordInput = inputs[0];

    const inFlight = deferredFile(enc.encode('FILE-BYTES'));
    selectFile(recordInput, inFlight.file);
    await flush();
    expect(fields.hasPendingRead()).toBe(true);

    // Clearing the control is a change event with no file. The read must not land afterwards.
    recordInput.files = [];
    recordInput.dispatchEvent('change');
    await flush();
    expect(fields.hasPendingRead()).toBe(false);

    inFlight.settle();
    await flush();
    expect(target.value).toBe('');
  });

  it('manual input invalidates a read already in flight', async () => {
    const { fields, node, inputs } = await mountInputs();
    const target = fields.record as unknown as MiniNode;
    const textarea = node.querySelectorAll('textarea')[0];

    const inFlight = deferredFile(enc.encode('FILE-BYTES'));
    selectFile(inputs[0], inFlight.file);
    await flush();
    expect(fields.hasPendingRead()).toBe(true);

    textarea.value = 'TYPED-BY-OPERATOR';
    textarea.dispatchEvent('input');
    expect(fields.hasPendingRead()).toBe(false);

    inFlight.settle();
    await flush();
    expect(target.value).toBe('TYPED-BY-OPERATOR');
  });

  it('a read cannot overwrite text typed after it started', async () => {
    const { fields, node, inputs } = await mountInputs();
    const target = fields.record as unknown as MiniNode;
    const textarea = node.querySelectorAll('textarea')[0];

    const slow = deferredFile(enc.encode('FROM-FILE'));
    selectFile(inputs[0], slow.file);
    await flush();

    textarea.value = 'TYPED-LATER';
    textarea.dispatchEvent('input');
    slow.settle();
    await flush();
    await flush();

    expect(target.value).toBe('TYPED-LATER');
  });
});

describe('the shared revision advances on every value change', () => {
  it('covers manual input, a completed read and a failed read', async () => {
    const { fields, node, inputs } = await mountInputs();
    const textarea = node.querySelectorAll('textarea')[0];

    const start = fields.revision();
    textarea.value = 'x';
    textarea.dispatchEvent('input');
    const afterTyping = fields.revision();
    expect(afterTyping).toBeGreaterThan(start);

    const ok = deferredFile(enc.encode('LOADED'));
    selectFile(inputs[0], ok.file);
    ok.settle();
    await flush();
    const afterRead = fields.revision();
    expect(afterRead).toBeGreaterThan(afterTyping);

    const broken = deferredFile(null);
    selectFile(inputs[1], broken.file);
    broken.settle();
    await flush();
    expect(fields.revision()).toBeGreaterThan(afterRead);
  });
});

describe('each field tracks its own reads', () => {
  it('a read on one field does not disturb another', async () => {
    const { fields, inputs } = await mountInputs();
    const record = fields.record as unknown as MiniNode;
    const key = fields.keyDocument as unknown as MiniNode;

    const a = deferredFile(enc.encode('RECORD-BYTES'));
    const b = deferredFile(enc.encode('KEY-BYTES'));
    selectFile(inputs[0], a.file);
    selectFile(inputs[1], b.file);
    await flush();

    b.settle();
    await flush();
    a.settle();
    await flush();

    expect(record.value).toBe('RECORD-BYTES');
    expect(key.value).toBe('KEY-BYTES');
  });
});
