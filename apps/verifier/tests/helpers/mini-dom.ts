/**
 * Minimal DOM stub for the UI lifecycle and concurrency tests.
 *
 * No DOM environment is installed in this workspace, and the properties under test are the
 * application's own bookkeeping: object-URL mint and revoke counts, run tokens, and file-read
 * generations. That logic is DOM-independent, so a full emulator would add a large dependency
 * without strengthening the assertions.
 *
 * It does not prove real browser download behaviour, real Blob retention or real event dispatch;
 * those belong to the browser smoke test.
 *
 * Only the surface the UI modules use is implemented. Anything else throws rather than returning
 * undefined and letting a test pass for the wrong reason.
 */
export interface MiniNode {
  tagName: string;
  textContent: string;
  id?: string;
  type?: string;
  rows?: number;
  value: string;
  disabled: boolean;
  htmlFor?: string;
  download?: string;
  href?: string;
  files?: unknown[];
  childNodes: MiniNode[];
  appendChild(n: MiniNode): MiniNode;
  append(...n: MiniNode[]): void;
  replaceChildren(...n: MiniNode[]): void;
  addEventListener(type: string, fn: () => void): void;
  dispatchEvent(type: string): void;
  getAttribute(name: string): string | undefined;
  querySelector(sel: string): MiniNode | undefined;
  querySelectorAll(sel: string): MiniNode[];
}

function node(tagName: string): MiniNode {
  const listeners = new Map<string, Array<() => void>>();
  const self: MiniNode = {
    tagName,
    textContent: '',
    value: '',
    disabled: false,
    childNodes: [],
    appendChild(n) {
      self.childNodes.push(n);
      return n;
    },
    append(...n) {
      self.childNodes.push(...n);
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
      if (name === 'id') return self.id;
      if (name === 'type') return self.type;
      throw new Error(`mini-dom: unsupported attribute ${name}`);
    },
    querySelector(sel) {
      return self.querySelectorAll(sel)[0];
    },
    querySelectorAll(sel) {
      const want = sel.toUpperCase();
      const out: MiniNode[] = [];
      const walk = (n: MiniNode): void => {
        for (const c of n.childNodes) {
          if (c.tagName.toUpperCase() === want) out.push(c);
          walk(c);
        }
      };
      walk(self);
      return out;
    },
  };
  return self;
}

export function installMiniDom(): { createElement: (t: string) => MiniNode } {
  const doc = {
    createElement: node,
    // Anything a module reaches for that is NOT implemented must fail loudly.
    get body(): never {
      throw new Error('mini-dom: document.body is not implemented');
    },
  };
  (globalThis as unknown as { document: unknown }).document = doc;
  return doc;
}

export function uninstallMiniDom(): void {
  delete (globalThis as { document?: unknown }).document;
}

export function createContainer(): MiniNode {
  return node('div');
}

/** First descendant whose text content matches, for locating a control by its label. */
export function findByText(root: MiniNode, tag: string, text: RegExp): MiniNode | undefined {
  return root.querySelectorAll(tag).find((n) => text.test(n.textContent));
}
