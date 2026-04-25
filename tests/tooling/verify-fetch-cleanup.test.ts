/**
 * Self-test for scripts/verify-fetch-cleanup.mjs.
 *
 * Proves the gate catches:
 *   1. an untracked source file containing an UNSAFE safeFetchRaw call site
 *      (no close()-in-finally) — must FAIL with a non-zero exit.
 *   2. an untracked source file containing a SAFE safeFetchRaw call site
 *      (close() in finally) — must PASS.
 *
 * The temp file is created under packages/cli/__tests__/ (which is not
 * gitignored) but with a name that matches no test glob, so vitest does
 * not pick it up as a test. The file is removed in afterEach.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const TEMP = join(ROOT, 'packages', 'cli', '__tests__', '__verify_fetch_cleanup_selftest_TEMP.ts');

const UNSAFE_SOURCE = `
import { safeFetchRaw } from '@peac/net-node';
export async function leakyFetch(url: string): Promise<string> {
  const raw = await safeFetchRaw(url);
  if (!raw.ok) return '';
  // INTENTIONAL BUG: no try/finally; raw.close() is never called.
  const text = await raw.response.text();
  return text;
}
`;

const SAFE_SOURCE = `
import { safeFetchRaw } from '@peac/net-node';
export async function safeFetchExample(url: string): Promise<string> {
  const raw = await safeFetchRaw(url);
  if (!raw.ok) return '';
  try {
    return await raw.response.text();
  } finally {
    await raw.close();
  }
}
`;

function runGate(): { exit: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', ['scripts/verify-fetch-cleanup.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return { exit: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      exit: e.status ?? 1,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
    };
  }
}

describe('verify-fetch-cleanup.mjs: self-test', () => {
  afterEach(() => {
    if (existsSync(TEMP)) unlinkSync(TEMP);
  });

  it('catches an UNSAFE untracked safeFetchRaw call site (no close in finally)', () => {
    writeFileSync(TEMP, UNSAFE_SOURCE);
    const result = runGate();
    expect(result.exit).not.toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/FAIL: \d+ bare safeFetchRaw\(\) call site/);
    expect(combined).toContain('__verify_fetch_cleanup_selftest_TEMP.ts');
  });

  it('passes for a SAFE untracked safeFetchRaw call site (close in finally)', () => {
    writeFileSync(TEMP, SAFE_SOURCE);
    const result = runGate();
    expect(result.exit).toBe(0);
    expect(result.stdout).toContain('every call site has a paired close()');
  });
});
