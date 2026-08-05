/**
 * Asynchronous UI correctness.
 *
 * Verification and file reads are asynchronous, so two operations can be in flight at once and
 * settle out of order. Rendering whichever finishes last would show a verdict for inputs the
 * operator has already replaced, which is the one thing a verification surface must never do.
 *
 * These are correctness properties, not interaction design: each is asserted directly because none
 * of them is visible to type checking or to a test that only exercises one operation at a time.
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  uninstallMiniDom();
});

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
  return { root: node, button };
}

const accepted = (marker: string) => ({
  ok: true as const,
  signature: 'valid_under_supplied_key' as const,
  recordValidation: 'valid' as const,
  trustedKey: 'not_provided' as const,
  issuerConstraint: 'not_provided' as const,
  kidConstraint: 'not_provided' as const,
  recordTypeConstraint: 'not_provided' as const,
  claimTruth: 'not_evaluated' as const,
  claims: { marker } as never,
  limitations: [] as string[],
  report: undefined,
});

describe('a second submission cannot start while a run is active', () => {
  it('the button is disabled for the duration and only one run starts', async () => {
    let started = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));

    const { button } = await mount(async () => {
      started++;
      await gate;
      return accepted('a');
    });

    expect(button.disabled).toBe(false);
    button.dispatchEvent('click');
    await flush();

    expect(button.disabled).toBe(true);
    expect(started).toBe(1);

    // Further clicks while the run is active must not start anything.
    button.dispatchEvent('click');
    button.dispatchEvent('click');
    await flush();
    expect(started).toBe(1);

    release();
    await flush();
    expect(button.disabled).toBe(false);
  });
});

describe('a stale completion cannot overwrite the latest result', () => {
  it('only the most recent run renders', async () => {
    const releases: Array<() => void> = [];
    const { root, button } = await mount(async () => {
      const marker = `run-${releases.length + 1}`;
      await new Promise<void>((r) => releases.push(r));
      return accepted(marker);
    });

    // Start the first run, then force a second by re-enabling the control, so both are in flight.
    button.dispatchEvent('click');
    await flush();
    button.disabled = false;
    button.dispatchEvent('click');
    await flush();
    expect(releases).toHaveLength(2);

    // Settle them OUT OF ORDER: the newer first, the older second.
    releases[1]();
    await flush();
    const afterCurrent =
      root.textContent +
      root
        .querySelectorAll('dd')
        .map((n) => n.textContent)
        .join(' ');

    releases[0]();
    await flush();
    const afterStale =
      root.textContent +
      root
        .querySelectorAll('dd')
        .map((n) => n.textContent)
        .join(' ');

    // The stale completion must leave the rendering untouched.
    expect(afterStale).toBe(afterCurrent);
  });
});

describe('the button is restored on every path', () => {
  it('after a successful run', async () => {
    const { button } = await mount(async () => accepted('ok'));
    button.dispatchEvent('click');
    await flush();
    await flush();
    expect(button.disabled).toBe(false);
  });

  it('after a rejected run', async () => {
    const { button } = await mount(async () => {
      throw new Error('rejected run');
    });
    button.dispatchEvent('click');
    await flush();
    await flush();
    expect(button.disabled).toBe(false);
  });
});

describe('a rejected run clears stale report output', () => {
  it('leaves a visible neutral failure and no previous report', async () => {
    let fail = false;
    const { root, button } = await mount(async () => {
      if (fail) throw new Error('rejected run');
      return { ...accepted('ok'), report: { reportVersion: '1', outcome: 'accepted' } as never };
    });

    button.dispatchEvent('click');
    await flush();
    await flush();

    fail = true;
    button.dispatchEvent('click');
    await flush();
    await flush();

    const text = root
      .querySelectorAll('p')
      .map((n) => n.textContent)
      .join(' ');
    expect(text).toMatch(/failed unexpectedly/i);
    // No report content may survive beside the failure notice.
    expect(root.querySelectorAll('pre')).toHaveLength(0);
  });
});
