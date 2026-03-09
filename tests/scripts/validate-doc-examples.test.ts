/**
 * Tests for validate-doc-examples.mjs: annotation parsing, blank-line
 * tolerance, and language-specific validation dispatch.
 *
 * Tests run the script as a subprocess against temp markdown files.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'validate-doc-examples.mjs');

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'peac-doc-validate-test-'));
});

afterAll(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

function runValidator(mdContent: string): { exitCode: number; stdout: string; stderr: string } {
  const mdFile = join(tmpDir, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  writeFileSync(mdFile, mdContent);

  try {
    const stdout = execSync(`node "${SCRIPT}" "${mdFile}"`, {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      timeout: 30_000,
    }).toString();
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err: any) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

describe('validate-doc-examples', () => {
  describe('annotation detection', () => {
    it('validates annotated JSON block', () => {
      const result = runValidator(
        ['# Test', '<!-- peac:validate -->', '```json', '{"key": "value"}', '```'].join('\n')
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('1 annotated');
      expect(result.stdout).toContain('1 validated');
      expect(result.stdout).toContain('1 passed');
    });

    it('skips unannotated blocks', () => {
      const result = runValidator(['# Test', '```json', '{"key": "value"}', '```'].join('\n'));
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('0 annotated');
    });

    it('respects skip directive', () => {
      const result = runValidator(
        ['# Test', '<!-- peac:validate skip -->', '```json', 'not valid json at all', '```'].join(
          '\n'
        )
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('1 annotated');
    });
  });

  describe('blank-line tolerance', () => {
    it('detects annotation with blank line before fence', () => {
      const result = runValidator(
        ['# Test', '<!-- peac:validate -->', '', '```json', '{"key": "value"}', '```'].join('\n')
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('1 annotated');
      expect(result.stdout).toContain('1 validated');
      expect(result.stdout).toContain('1 passed');
    });

    it('detects annotation with blank line and language override', () => {
      const result = runValidator(
        ['# Test', '<!-- peac:validate json -->', '', '```', '{"hello": "world"}', '```'].join('\n')
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('1 annotated');
      expect(result.stdout).toContain('1 passed');
    });

    it('does not bridge across multiple blank lines', () => {
      const result = runValidator(
        ['# Test', '<!-- peac:validate -->', '', '', '```json', '{"key": "value"}', '```'].join(
          '\n'
        )
      );
      // Two blank lines: the annotation should NOT bridge to the fence.
      // The annotation consumes one blank line, then the next blank line
      // is not a fence, so annotated=false for that block.
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('0 annotated');
    });
  });

  describe('JSON schema-aware validation', () => {
    it('rejects invalid Wire 0.2 kind', () => {
      const result = runValidator(
        [
          '# Test',
          '<!-- peac:validate json -->',
          '```json',
          '{"kind": "invalid_kind", "peac_version": "0.2"}',
          '```',
        ].join('\n')
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('kind must be');
    });

    it('accepts valid Wire 0.2 payload', () => {
      const result = runValidator(
        [
          '# Test',
          '<!-- peac:validate -->',
          '```json',
          '{"kind": "evidence", "peac_version": "0.2", "type": "com.example/test"}',
          '```',
        ].join('\n')
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('1 passed');
    });
  });

  describe('bash validation', () => {
    it('accepts valid bash syntax', () => {
      const result = runValidator(
        [
          '# Test',
          '<!-- peac:validate -->',
          '```bash',
          'echo "hello world"',
          'if [ -f /tmp/test ]; then',
          '  echo "exists"',
          'fi',
          '```',
        ].join('\n')
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('1 passed');
    });

    it('rejects invalid bash syntax', () => {
      const result = runValidator(
        [
          '# Test',
          '<!-- peac:validate -->',
          '```bash',
          'if true; then',
          '  echo "missing fi"',
          '```',
        ].join('\n')
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('FAIL');
    });
  });
});
