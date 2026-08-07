/**
 * Accessible structure and state announcement.
 *
 * The verification surface must be operable and understandable without sight: a single main
 * landmark, each control with a programmatic name and description, a polite live region that
 * announces state transitions, and focus moved to the outcome once a run completes. These are the
 * DOM-level guarantees; real assistive-technology behaviour is exercised by the browser smoke test.
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
  return root as unknown as MiniNode;
}

function byAttr(root: MiniNode, tag: string, name: string, value: string): MiniNode | undefined {
  return root.querySelectorAll(tag).find((n) => {
    try {
      return n.getAttribute(name) === value;
    } catch {
      return false;
    }
  });
}

describe('landmark and heading structure', () => {
  it('mounts a single main landmark holding the page heading', async () => {
    const root = await mount(async () => accepted);
    const mains = root.querySelectorAll('main');
    expect(mains).toHaveLength(1);
    const h1 = mains[0].querySelectorAll('h1');
    expect(h1).toHaveLength(1);
    expect(h1[0].textContent).toMatch(/verify a peac record/i);
  });

  it('states, always, what a successful verification does and does not establish', async () => {
    const root = await mount(async () => accepted);
    const items = root.querySelectorAll('li').map((n) => n.textContent);
    // Present without running anything: guidance is not gated on a result.
    expect(items.some((t) => /matching the public key you supplied/i.test(t))).toBe(true);
    expect(items.some((t) => /not changed since it was signed/i.test(t))).toBe(true);
    expect(items.some((t) => /the key, or its holder, is one you should trust/i.test(t))).toBe(
      true
    );
    expect(items.some((t) => /factually true/i.test(t))).toBe(true);
  });
});

describe('footer', () => {
  it('links to the project site and source with safe external attributes', async () => {
    const root = await mount(async () => accepted);
    const footers = root.querySelectorAll('footer');
    expect(footers).toHaveLength(1);
    const links = footers[0].querySelectorAll('a');
    const hrefs = links.map((a) => a.href);
    expect(hrefs).toContain('https://www.peacprotocol.org/');
    expect(hrefs).toContain('https://github.com/peacprotocol/peac');
    for (const a of links) {
      expect(a.getAttribute('aria-label')).toMatch(/opens in a new tab/i);
    }
  });
});

describe('control names and descriptions', () => {
  it('associates every textarea with a label and a description', async () => {
    const root = await mount(async () => accepted);
    const labels = root.querySelectorAll('label');
    for (const textarea of root.querySelectorAll('textarea')) {
      const id = textarea.id;
      expect(id).toBeTruthy();
      expect(labels.some((l) => l.htmlFor === id)).toBe(true);
      const describedby = textarea.getAttribute('aria-describedby');
      expect(describedby).toBe(`${id}-hint`);
      expect(byAttr(root, 'p', 'id', describedby as string)).toBeDefined();
    }
  });

  it('gives every file control an accessible name', async () => {
    const root = await mount(async () => accepted);
    const files = root.querySelectorAll('input').filter((n) => n.type === 'file');
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(file.getAttribute('aria-label')).toMatch(/load .* from a file/i);
    }
  });
});

describe('state announcement and focus', () => {
  it('exposes a polite status region', async () => {
    const root = await mount(async () => accepted);
    const status = byAttr(root, 'p', 'role', 'status');
    expect(status).toBeDefined();
    expect((status as MiniNode).getAttribute('aria-live')).toBe('polite');
  });

  it('announces progress then outcome, and moves focus to the result', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const root = await mount(async () => {
      await gate;
      return accepted;
    });
    const status = byAttr(root, 'p', 'role', 'status') as MiniNode;
    const results = byAttr(root, 'section', 'aria-label', 'Verification result') as MiniNode;
    expect(results.tabIndex).toBe(-1);
    let focusMoves = 0;
    results.focus = () => {
      focusMoves += 1;
    };

    const button = findByText(root, 'button', /verify/i) as MiniNode;
    button.dispatchEvent('click');
    await flush();
    expect(status.textContent).toMatch(/verifying/i);
    expect(focusMoves).toBe(0);

    release();
    await flush();
    await flush();
    expect(status.textContent).toMatch(/verification succeeded/i);
    expect(focusMoves).toBe(1);
  });

  it('clears the announcement when inputs change', async () => {
    const root = await mount(async () => accepted);
    const status = byAttr(root, 'p', 'role', 'status') as MiniNode;
    const button = findByText(root, 'button', /verify/i) as MiniNode;
    button.dispatchEvent('click');
    await flush();
    expect(status.textContent).toMatch(/verification succeeded/i);

    const textarea = root.querySelectorAll('textarea')[0];
    textarea.value = 'changed';
    textarea.dispatchEvent('input');
    expect(status.textContent).toBe('');
  });
});
