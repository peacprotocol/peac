/**
 * Static no-fetch audit (DD-55, DD-141)
 *
 * Verifies that core packages (@peac/core, @peac/schema, @peac/crypto,
 * @peac/adapter-eat) contain zero network I/O paths in their source.
 *
 * These packages are validation-only (DD-141) and must never perform
 * implicit fetch (DD-55). Any receipt resolution or network access
 * belongs in Layer 4+ (@peac/net-node).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

// -------------------------------------------------------------------------
// Forbidden patterns: network I/O indicators in source code
// -------------------------------------------------------------------------

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bfetch\s*\(/, label: 'fetch() call' },
  { pattern: /\bglobalThis\.fetch\b/, label: 'globalThis.fetch reference' },
  { pattern: /\brequire\s*\(\s*['"]node:http['"]/, label: "require('node:http')" },
  { pattern: /\brequire\s*\(\s*['"]node:https['"]/, label: "require('node:https')" },
  { pattern: /\brequire\s*\(\s*['"]http['"]/, label: "require('http')" },
  { pattern: /\brequire\s*\(\s*['"]https['"]/, label: "require('https')" },
  { pattern: /\bimport\b.*from\s+['"]node:http['"]/, label: "import from 'node:http'" },
  { pattern: /\bimport\b.*from\s+['"]node:https['"]/, label: "import from 'node:https'" },
  { pattern: /\bimport\b.*from\s+['"]http['"]/, label: "import from 'http'" },
  { pattern: /\bimport\b.*from\s+['"]https['"]/, label: "import from 'https'" },
  { pattern: /\bimport\b.*from\s+['"]undici['"]/, label: "import from 'undici'" },
  { pattern: /\brequire\s*\(\s*['"]undici['"]/, label: "require('undici')" },
  { pattern: /\bimport\b.*from\s+['"]node-fetch['"]/, label: "import from 'node-fetch'" },
  { pattern: /\brequire\s*\(\s*['"]node-fetch['"]/, label: "require('node-fetch')" },
  { pattern: /\bXMLHttpRequest\b/, label: 'XMLHttpRequest reference' },
  { pattern: /\bnew\s+WebSocket\b/, label: 'WebSocket constructor' },
  { pattern: /\.listen\s*\(/, label: '.listen() (server binding)' },
  { pattern: /\bcreateServer\b/, label: 'createServer (server creation)' },
];

// -------------------------------------------------------------------------
// Packages under audit (source directories only, not dist)
// -------------------------------------------------------------------------

interface AuditTarget {
  name: string;
  srcDir: string;
}

const REPO_ROOT = join(import.meta.dirname!, '..', '..');

const AUDIT_TARGETS: AuditTarget[] = [
  { name: '@peac/kernel', srcDir: join(REPO_ROOT, 'packages/kernel/src') },
  { name: '@peac/schema', srcDir: join(REPO_ROOT, 'packages/schema/src') },
  { name: '@peac/crypto', srcDir: join(REPO_ROOT, 'packages/crypto/src') },
  { name: '@peac/adapter-eat', srcDir: join(REPO_ROOT, 'packages/adapters/eat/src') },
];

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (
      stat.isFile() &&
      extname(entry) === '.ts' &&
      !entry.endsWith('.d.ts') &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.js.map')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

interface Violation {
  file: string;
  line: number;
  label: string;
  content: string;
}

function auditFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // Skip comment lines (single-line //, JSDoc /** ... */, block * continuation)
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/**') ||
      trimmed.startsWith('/*')
    )
      continue;

    for (const { pattern, label } of FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({
          file: filePath.replace(REPO_ROOT + '/', ''),
          line: i + 1,
          label,
          content: line.trim().substring(0, 120),
        });
      }
    }
  }
  return violations;
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('No-fetch audit: core packages have zero network I/O', () => {
  for (const target of AUDIT_TARGETS) {
    it(`${target.name}: zero fetch/http/https paths in source`, () => {
      const files = collectTsFiles(target.srcDir);
      expect(files.length).toBeGreaterThan(0);

      const allViolations: Violation[] = [];
      for (const file of files) {
        allViolations.push(...auditFile(file));
      }

      if (allViolations.length > 0) {
        const report = allViolations
          .map((v) => `  ${v.file}:${v.line} [${v.label}] ${v.content}`)
          .join('\n');
        expect.fail(
          `${target.name} has ${allViolations.length} network I/O violation(s):\n${report}`
        );
      }
    });
  }

  it('audit covers all 4 target packages', () => {
    expect(AUDIT_TARGETS).toHaveLength(4);
    const names = AUDIT_TARGETS.map((t) => t.name);
    expect(names).toContain('@peac/kernel');
    expect(names).toContain('@peac/schema');
    expect(names).toContain('@peac/crypto');
    expect(names).toContain('@peac/adapter-eat');
  });

  it('each target has source files to audit', () => {
    for (const target of AUDIT_TARGETS) {
      const files = collectTsFiles(target.srcDir);
      expect(files.length, `${target.name} should have source files`).toBeGreaterThan(0);
    }
  });
});
