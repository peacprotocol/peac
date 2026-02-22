/**
 * Regression tests for the invisible unicode scanner (find-invisible-unicode.mjs).
 *
 * These tests spawn the actual CLI script to prove the contract:
 * - Detection of known bidi/invisible codepoints
 * - Fix mode strips dangerous characters
 * - Clean files pass without error
 *
 * Temp files with injected codepoints use Buffer.from() for byte-accuracy.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = join(import.meta.dirname, '..', '..', 'scripts', 'find-invisible-unicode.mjs');

function runScanner(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', [SCRIPT, ...args], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

describe('find-invisible-unicode.mjs (CLI)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'unicode-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects LEFT-TO-RIGHT EMBEDDING (U+202A)', () => {
    const file = join(tmpDir, 'lre.ts');
    // "const x = '\u202A';" with actual U+202A byte
    writeFileSync(file, Buffer.from("const x = '\xe2\x80\xaa';\n", 'binary'));

    const result = runScanner([file]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('U+202A');
    expect(result.stdout).toContain('LEFT-TO-RIGHT EMBEDDING');
  });

  it('detects RIGHT-TO-LEFT ISOLATE (U+2067)', () => {
    const file = join(tmpDir, 'rli.ts');
    writeFileSync(file, Buffer.from("const y = '\xe2\x81\xa7';\n", 'binary'));

    const result = runScanner([file]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('U+2067');
    expect(result.stdout).toContain('RIGHT-TO-LEFT ISOLATE');
  });

  it('detects ZERO WIDTH SPACE (U+200B)', () => {
    const file = join(tmpDir, 'zwsp.ts');
    writeFileSync(file, Buffer.from("const z = '\xe2\x80\x8b';\n", 'binary'));

    const result = runScanner([file]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('U+200B');
    expect(result.stdout).toContain('ZERO WIDTH SPACE');
  });

  it('detects BYTE ORDER MARK (U+FEFF)', () => {
    const file = join(tmpDir, 'bom.ts');
    writeFileSync(file, Buffer.from('\xef\xbb\xbfconst a = 1;\n', 'binary'));

    const result = runScanner([file]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('U+FEFF');
    expect(result.stdout).toContain('BYTE ORDER MARK');
  });

  it('detects NO-BREAK SPACE (U+00A0)', () => {
    const file = join(tmpDir, 'nbsp.ts');
    writeFileSync(file, Buffer.from('const\xc2\xa0b = 2;\n', 'binary'));

    const result = runScanner([file]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('U+00A0');
    expect(result.stdout).toContain('NO-BREAK SPACE');
  });

  it('reports multiple codepoints in a single file', () => {
    const file = join(tmpDir, 'multi.ts');
    // U+202A + U+200B on separate lines
    writeFileSync(file, Buffer.from('line1\xe2\x80\xaa\nline2\xe2\x80\x8b\n', 'binary'));

    const result = runScanner([file]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('U+202A');
    expect(result.stdout).toContain('U+200B');
  });

  it('clean file passes with exit code 0', () => {
    const file = join(tmpDir, 'clean.ts');
    writeFileSync(file, 'const x = 42;\n');

    const result = runScanner([file]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No dangerous Unicode');
  });

  it('--fix strips bidi controls and replaces NBSP with space', () => {
    const file = join(tmpDir, 'fixme.ts');
    // "const\u00A0x = '\u202A';" -- NBSP between const and x, LRE in string
    writeFileSync(file, Buffer.from("const\xc2\xa0x = '\xe2\x80\xaa';\n", 'binary'));

    // First: confirm detection
    const detect = runScanner([file]);
    expect(detect.exitCode).toBe(1);

    // Fix
    const fix = runScanner(['--fix', file]);
    expect(fix.exitCode).toBe(0);

    // Verify content: NBSP replaced with space, LRE stripped
    const fixed = readFileSync(file, 'utf-8');
    expect(fixed).toBe("const x = '';\n");

    // Second scan: clean
    const rescan = runScanner([file]);
    expect(rescan.exitCode).toBe(0);
    expect(rescan.stdout).toContain('No dangerous Unicode');
  });

  // Trojan Source regression: proves scanner catches the exact bidi attack
  // pattern (RLO/LRI/PDI) that GitHub flags in diff views. This test exists
  // so we can confidently label GitHub bidi warnings as false positives when
  // the scanner passes on our codebase.
  it('catches Trojan Source attack pattern (RLO + LRI + PDI)', () => {
    const file = join(tmpDir, 'trojan-source.ts');
    // Simulated Trojan Source: RLO (U+202E) hides code reordering,
    // LRI (U+2066) + PDI (U+2069) bracket the deceptive region
    const rlo = '\xe2\x80\xae'; // U+202E RIGHT-TO-LEFT OVERRIDE
    const lri = '\xe2\x81\xa6'; // U+2066 LEFT-TO-RIGHT ISOLATE
    const pdi = '\xe2\x81\xa9'; // U+2069 POP DIRECTIONAL ISOLATE
    const trojan = `const isAdmin = false;${rlo}${lri}// check access${pdi}\n`;
    writeFileSync(file, Buffer.from(trojan, 'binary'));

    const result = runScanner([file]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('U+202E');
    expect(result.stdout).toContain('RIGHT-TO-LEFT OVERRIDE');
    expect(result.stdout).toContain('U+2066');
    expect(result.stdout).toContain('U+2069');
  });

  it('reports file path in output', () => {
    const file = join(tmpDir, 'path-check.ts');
    writeFileSync(file, Buffer.from('\xe2\x80\xaa\n', 'binary'));

    const result = runScanner([file]);
    expect(result.stdout).toContain(file);
  });
});
