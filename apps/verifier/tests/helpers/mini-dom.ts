/**
 * Minimal DOM stub for the report-panel lifecycle tests.
 *
 * WHY NOT jsdom: no DOM environment is installed in this workspace, and the property under test is
 * the verifier's own object-URL BOOKKEEPING -- mint counts, revoke counts, what survives a
 * re-render. That logic is DOM-independent; a full DOM emulator would add a large dependency without
 * strengthening the assertion.
 *
 * WHAT THIS DOES NOT PROVE: real browser download behaviour, real Blob retention, real event
 * dispatch. Those belong to the real-browser smoke test, not here.
 *
 * It implements only the surface report-panel.ts actually uses. Anything else throws loudly rather
 * than silently returning undefined and making a test pass for the wrong reason.
 */
export interface MiniNode {
  tagName: string;
  textContent: string;
  download?: string;
  href?: string;
  childNodes: MiniNode[];
  appendChild(n: MiniNode): MiniNode;
  replaceChildren(...n: MiniNode[]): void;
  addEventListener(type: string, fn: () => void): void;
  dispatchEvent(type: string): void;
  getAttribute(name: string): string | undefined;
  querySelector(sel: string): MiniNode | undefined;
}

function node(tagName: string): MiniNode {
  const listeners = new Map<string, Array<() => void>>();
  const self: MiniNode = {
    tagName,
    textContent: '',
    childNodes: [],
    appendChild(n) {
      self.childNodes.push(n);
      return n;
    },
    replaceChildren(...n) {
      self.childNodes = [...n];
    },
    addEventListener(type, fn) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    dispatchEvent(type) {
      for (const fn of listeners.get(type) ?? []) fn();
    },
    getAttribute(name) {
      if (name === 'href') return self.href;
      if (name === 'download') return self.download;
      throw new Error(`mini-dom: unsupported attribute ${name}`);
    },
    querySelector(sel) {
      const want = sel.toUpperCase();
      const walk = (n: MiniNode): MiniNode | undefined => {
        for (const c of n.childNodes) {
          if (c.tagName.toUpperCase() === want) return c;
          const hit = walk(c);
          if (hit) return hit;
        }
        return undefined;
      };
      return walk(self);
    },
  };
  return self;
}

export function installMiniDom(): { createElement: (t: string) => MiniNode } {
  const doc = {
    createElement: node,
    // Anything report-panel might reach for that is NOT implemented must fail loudly.
    get body(): never {
      throw new Error('mini-dom: document.body is not implemented');
    },
  };
  (globalThis as unknown as { document: unknown }).document = doc;
  return doc;
}

export function createContainer(): MiniNode {
  return node('div');
}
