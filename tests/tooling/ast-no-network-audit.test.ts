/**
 * Tests for the AST no-network audit.
 *
 * Uses the shared core from scripts/lib/ast-no-network-core.ts.
 * Fixture files in tests/fixtures/ast-audit/pass/ and fail/.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditSourceText } from '../../scripts/lib/ast-no-network-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', 'fixtures', 'ast-audit');

function readFixture(category: 'pass' | 'fail', name: string): string {
  return readFileSync(join(FIXTURES, category, name), 'utf8');
}

// -------------------------------------------------------------------------
// Fixture-based tests
// -------------------------------------------------------------------------

describe('AST audit fixture files', () => {
  it('pass/type-only-import.ts: type-only imports from forbidden modules pass', () => {
    const source = readFixture('pass', 'type-only-import.ts');
    expect(auditSourceText(source)).toHaveLength(0);
  });

  it('pass/comment-mentions-fetch.ts: comments mentioning forbidden APIs pass', () => {
    const source = readFixture('pass', 'comment-mentions-fetch.ts');
    expect(auditSourceText(source)).toHaveLength(0);
  });

  it('fail/dynamic-import.ts: dynamic import of https fails', () => {
    const source = readFixture('fail', 'dynamic-import.ts');
    const violations = auditSourceText(source);
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].kind).toBe('dynamic-import');
  });

  it('fail/global-fetch.ts: globalThis.fetch access fails', () => {
    const source = readFixture('fail', 'global-fetch.ts');
    const violations = auditSourceText(source);
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations.some((v) => v.kind === 'forbidden-property-access')).toBe(true);
  });

  it('fail/require-http.ts: require of http fails', () => {
    const source = readFixture('fail', 'require-http.ts');
    const violations = auditSourceText(source);
    expect(violations.some((v) => v.kind === 'require-call')).toBe(true);
  });

  it('fail/new-websocket.ts: new WebSocket() fails', () => {
    const source = readFixture('fail', 'new-websocket.ts');
    const violations = auditSourceText(source);
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].kind).toBe('forbidden-constructor');
  });
});

// -------------------------------------------------------------------------
// Inline unit tests (edge cases)
// -------------------------------------------------------------------------

describe('AST audit: safe patterns (inline)', () => {
  it('string literal mentioning fetch passes', () => {
    expect(auditSourceText(`const msg = "Do not call fetch()";`)).toHaveLength(0);
  });

  it('import from allowed module passes', () => {
    expect(auditSourceText(`import { readFileSync } from 'node:fs';`)).toHaveLength(0);
  });

  it('import from workspace package passes', () => {
    expect(
      auditSourceText(`import { validateKernelConstraints } from '@peac/schema';`)
    ).toHaveLength(0);
  });

  it('type-only export from forbidden module passes', () => {
    expect(auditSourceText(`export type { IncomingMessage } from 'node:http';`)).toHaveLength(0);
  });

  it('zod schema referencing URL strings passes', () => {
    const source = `import { z } from 'zod';\nconst U = z.string().url();`;
    expect(auditSourceText(source)).toHaveLength(0);
  });
});

describe('AST audit: unsafe patterns (inline)', () => {
  it('import from node:http fails', () => {
    const v = auditSourceText(`import { createServer } from 'node:http';`);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('import-declaration');
    expect(v[0].detail).toContain('node:http');
  });

  it('fetch() call fails', () => {
    const v = auditSourceText(`const res = fetch('https://example.com');`);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('forbidden-call');
  });

  it('window.fetch access fails', () => {
    const v = auditSourceText(`const f = window.fetch;`);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('forbidden-property-access');
  });

  it('new XMLHttpRequest() fails', () => {
    const v = auditSourceText(`const xhr = new XMLHttpRequest();`);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('forbidden-constructor');
  });

  it('createServer() fails', () => {
    const v = auditSourceText(`const s = createServer(handler);`);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('server-creation');
  });

  it('import from undici fails', () => {
    const v = auditSourceText(`import { request } from 'undici';`);
    expect(v).toHaveLength(1);
  });

  it('import from node:dns fails', () => {
    const v = auditSourceText(`import dns from 'node:dns';`);
    expect(v).toHaveLength(1);
  });

  it('require of node:child_process fails', () => {
    const v = auditSourceText(`const cp = require('node:child_process');`);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('require-call');
  });

  it('multiple violations in one file are all reported', () => {
    const source = [
      `import http from 'node:http';`,
      `const f = globalThis.fetch;`,
      `const ws = new WebSocket('wss://x');`,
    ].join('\n');
    const v = auditSourceText(source);
    expect(v).toHaveLength(3);
  });
});

// -------------------------------------------------------------------------
// End-to-end
// -------------------------------------------------------------------------

describe('AST audit: end-to-end script execution', () => {
  it('script exits 0 on current codebase', async () => {
    const { execSync } = await import('node:child_process');
    const result = execSync('pnpm exec tsx scripts/ast-no-network-audit.ts', {
      cwd: join(__dirname, '..', '..'),
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(result).toContain('OK: Zero network I/O detected');
  });
});
