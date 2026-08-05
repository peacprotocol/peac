/**
 * Binding between a displayed result and the inputs it describes.
 *
 * Verification and file reads are both asynchronous, so the inputs can change while a run is in
 * flight. A verification surface that shows a verdict beside inputs it did not evaluate is worse
 * than one that shows nothing, so each of these properties is asserted directly.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  installMiniDom,
  uninstallMiniDom,
  createContainer,
  findByText,
} from './helpers/mini-dom.js';
import type { MiniNode } from './helpers/mini-dom.js';

const flush = () => new Promise((r) => setTimeout(r, 0));
const enc = new TextEncoder();

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  uninstallMiniDom();
});

const accepted = {
  ok: true as const,
  mode: 'integrity-only' as const,
  signature: 'valid_under_supplied_key' as const,
  recordValidation: 'valid' as const,
  trustedKey: 'not_provided' as const,
  issuerConstraint: 'not_provided' as const,
  kidConstraint: 'not_provided' as const,
  recordTypeConstraint: 'not_provided' as const,
  claimTruth: 'not_evaluated' as const,
  claims: {} as never,
  limitations: [] as string[],
  report: { reportVersion: '1', outcome: 'accepted' } as never,
};

/** Mount the app with a verifier whose completions this test controls. */
async function mount(verify: (input: unknown) => Promise<unknown>) {
  installMiniDom();
  const verifyModule = await import('../src/verify.js');
  vi.spyOn(verifyModule, 'initializeLocalVerifier').mockResolvedValue({
    supported: true,
    verify,
  } as never);

  const { initApp } = await import('../src/ui/app.js');
  const root = createContainer() as unknown as HTMLElement;
  await initApp(root);
  await flush();

  const node = root as unknown as MiniNode;
  const button = findByText(node, 'button', /verify/i);
  if (!button) throw new Error('verify button was not rendered');
  return {
    root: node,
    button,
    textareas: node.querySelectorAll('textarea'),
    files: node.querySelectorAll('input'),
  };
}

/** A file whose read resolves when the returned `settle` is called. */
function deferredFile(bytes: Uint8Array) {
  let settle: () => void = () => {};
  const gate = new Promise<void>((r) => (settle = r));
  return {
    file: {
      async arrayBuffer() {
        await gate;
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      },
    },
    settle: () => settle(),
  };
}

function type(textarea: MiniNode, value: string): void {
  textarea.value = value;
  textarea.dispatchEvent('input');
}

function visible(root: MiniNode): string {
  return root
    .querySelectorAll('h2')
    .concat(root.querySelectorAll('p'), root.querySelectorAll('pre'))
    .map((n) => n.textContent)
    .join(' | ');
}

describe('verification is unavailable while a file read is pending', () => {
  it('the control is disabled for the duration of the read and restored afterwards', async () => {
    const { button, files } = await mount(async () => accepted);
    expect(button.disabled).toBe(false);

    const pending = deferredFile(enc.encode('RECORD'));
    files[0].files = [pending.file];
    files[0].dispatchEvent('change');
    await flush();
    expect(button.disabled).toBe(true);

    pending.settle();
    await flush();
    expect(button.disabled).toBe(false);
  });
});

describe('a run whose inputs changed does not render', () => {
  it('an input event during the run suppresses its completion', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { root, button, textareas } = await mount(async () => {
      await gate;
      return accepted;
    });

    type(textareas[0], 'ORIGINAL');
    button.dispatchEvent('click');
    await flush();

    // The controls are disabled, but an event that arrives regardless must still not be ignored.
    type(textareas[0], 'REPLACED');
    release();
    await flush();
    await flush();

    expect(visible(root)).not.toMatch(/Verification succeeded/);
    expect(root.querySelectorAll('pre')).toHaveLength(0);
  });

  it('a rejection whose inputs changed is also suppressed', async () => {
    let reject: () => void = () => {};
    const gate = new Promise<void>((_r, rej) => (reject = () => rej(new Error('failed'))));
    const { root, button, textareas } = await mount(async () => {
      await gate;
      return accepted;
    });

    button.dispatchEvent('click');
    await flush();
    type(textareas[0], 'REPLACED');
    reject();
    await flush();
    await flush();

    expect(visible(root)).not.toMatch(/failed unexpectedly/);
  });
});

describe('changing an input after a completed run clears what is on screen', () => {
  it('both the result and the report are removed', async () => {
    const { root, button, textareas } = await mount(async () => accepted);
    button.dispatchEvent('click');
    await flush();
    await flush();

    expect(visible(root)).toMatch(/Verification succeeded/);
    expect(root.querySelectorAll('pre').length).toBeGreaterThan(0);

    type(textareas[1], 'A DIFFERENT KEY');

    expect(visible(root)).not.toMatch(/Verification succeeded/);
    expect(root.querySelectorAll('pre')).toHaveLength(0);
  });

  it('a completed file read also clears it', async () => {
    const { root, button, files } = await mount(async () => accepted);
    button.dispatchEvent('click');
    await flush();
    await flush();
    expect(visible(root)).toMatch(/Verification succeeded/);

    const loaded = deferredFile(enc.encode('NEW-RECORD'));
    files[0].files = [loaded.file];
    files[0].dispatchEvent('change');
    loaded.settle();
    await flush();

    expect(visible(root)).not.toMatch(/Verification succeeded/);
  });
});

describe('a superseded run does not restore controls a newer run holds', () => {
  it('the older completion leaves every control disabled', async () => {
    const releases: Array<() => void> = [];
    const { button, textareas, files } = await mount(async () => {
      await new Promise<void>((r) => releases.push(r));
      return accepted;
    });

    button.dispatchEvent('click');
    await flush();
    // Force a second run past the interface guard, so two are genuinely in flight.
    button.disabled = false;
    button.dispatchEvent('click');
    await flush();
    expect(releases).toHaveLength(2);

    // Settle the SUPERSEDED run. Its `finally` must not hand the controls back.
    releases[0]();
    await flush();
    await flush();

    expect(textareas.every((t) => t.disabled)).toBe(true);
    expect(files.every((f) => f.disabled)).toBe(true);
    expect(button.disabled).toBe(true);

    // The current run still owns them and restores them normally.
    releases[1]();
    await flush();
    await flush();
    expect(textareas.some((t) => t.disabled)).toBe(false);
    expect(button.disabled).toBe(false);
  });
});

describe('only the captured snapshot reaches the verifier', () => {
  it('later edits to the fields do not change what was submitted', async () => {
    const seen: Array<Record<string, unknown>> = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { button, textareas } = await mount(async (input) => {
      seen.push(input as Record<string, unknown>);
      await gate;
      return accepted;
    });

    type(textareas[0], 'RECORD-AT-SUBMISSION');
    type(textareas[1], 'KEY-AT-SUBMISSION');
    type(textareas[2], 'CONTEXT-AT-SUBMISSION');
    button.dispatchEvent('click');
    await flush();

    type(textareas[0], 'RECORD-CHANGED');
    type(textareas[1], 'KEY-CHANGED');
    type(textareas[2], 'CONTEXT-CHANGED');
    release();
    await flush();

    expect(seen).toHaveLength(1);
    expect(seen[0].record).toBe('RECORD-AT-SUBMISSION');
    expect(seen[0].keyDocument).toBe('KEY-AT-SUBMISSION');
    expect(seen[0].contextDocument).toBe('CONTEXT-AT-SUBMISSION');
    // The submitted object is frozen, so nothing downstream can rewrite it either.
    expect(Object.isFrozen(seen[0])).toBe(true);
  });

  it('an absent context is omitted rather than submitted as an empty document', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const { button, textareas } = await mount(async (input) => {
      seen.push(input as Record<string, unknown>);
      return accepted;
    });
    type(textareas[0], 'RECORD');
    type(textareas[1], 'KEY');
    button.dispatchEvent('click');
    await flush();

    expect('contextDocument' in seen[0]).toBe(false);
  });
});

describe('controls are restored when the current run ends', () => {
  it.each([
    ['succeeds', async () => accepted],
    [
      'fails',
      async () => {
        throw new Error('rejected run');
      },
    ],
  ])('after the run %s', async (_label, verify) => {
    const { button, textareas, files } = await mount(verify as (i: unknown) => Promise<unknown>);
    // Submission disables the controls synchronously, before the run can settle.
    button.dispatchEvent('click');
    expect(textareas.every((t) => t.disabled)).toBe(true);
    expect(button.disabled).toBe(true);

    await flush();
    await flush();
    expect(textareas.some((t) => t.disabled)).toBe(false);
    expect(files.some((f) => f.disabled)).toBe(false);
    expect(button.disabled).toBe(false);
  });
});
