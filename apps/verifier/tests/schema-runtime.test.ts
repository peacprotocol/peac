/**
 * Validator compilation is disabled application-wide, and the module that disables it is loaded
 * before any schema is constructed. Zod's fast path builds a validator with the Function
 * constructor behind a probe that itself calls Function(""); under the verifier's CSP that call
 * is refused, so the fast path must never be reached.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '..', 'src');
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf8');

describe('validator compilation is disabled before schemas load', () => {
  it('the runtime module configures jitless mode', () => {
    const module = read('lib/schema-runtime.ts');
    expect(module).toMatch(/config\(\s*\{\s*jitless:\s*true\s*\}\s*\)/);
    expect(module).toMatch(/from 'zod'/);
  });

  it('every entry point imports it before anything that builds a schema', () => {
    for (const entry of ['main.ts', 'verify.ts']) {
      const lines = read(entry).split('\n');
      const preludeAt = lines.findIndex((l) => l.includes("schema-runtime.js'"));
      const firstOtherImport = lines.findIndex(
        (l) => /^import /.test(l) && !l.includes('schema-runtime.js')
      );
      expect(preludeAt, `${entry}: schema-runtime prelude is imported`).toBeGreaterThanOrEqual(0);
      expect(preludeAt, `${entry}: the prelude must be the first import`).toBeLessThan(
        firstOtherImport
      );
    }
  });

  it('leaves construct and parse free of dynamic-code construction once configured', async () => {
    // With the runtime module loaded, a freshly constructed object schema builds and parses
    // without any Function-constructor call. The integrated application graph is covered by the
    // browser matrix; this pins the mechanism on the verifier's own Zod import.
    await import('../src/lib/schema-runtime.js');
    const { z } = await import('zod');
    const RealFunction = globalThis.Function;
    let calls = 0;
    globalThis.Function = new Proxy(RealFunction, {
      apply: (t, s, a) => (calls++, Reflect.apply(t, s, a)),
      construct: (t, a, n) => (calls++, Reflect.construct(t, a, n)),
    });
    try {
      const schema = z.object({ a: z.string() });
      schema.safeParse({ a: 'x' });
    } finally {
      globalThis.Function = RealFunction;
    }
    expect(calls, 'no Function() construction during construct + parse').toBe(0);
  });
});
