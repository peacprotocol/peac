/**
 * P0 invariant: packages/protocol/src/** MUST NOT import from any
 * workspace-private package.
 *
 * Source-level guard. Catches private-package source dependencies BEFORE
 * the dist-leak gate would. The dist-leak gate (verify-dist-private-leaks.mjs)
 * is the runtime safety net; this test is the editor-time / commit-time
 * safety net.
 *
 * Forbidden imports anywhere under packages/protocol/src/** (including
 * _internal/):
 *   - @peac/compat
 *   - @peac/record-core
 *   - @peac/registries
 *   - @peac/resolver-http
 *
 * Allowed (not asserted; informational):
 *   - relative imports under packages/protocol/src/_internal/**
 *   - public packages already used by protocol: @peac/kernel, @peac/schema,
 *     @peac/crypto, @peac/policy-kit, @peac/net-node, third-party deps.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const PROTOCOL_SRC = join(ROOT, 'packages', 'protocol', 'src');

const FORBIDDEN_IMPORTS = [
  '@peac/compat',
  '@peac/record-core',
  '@peac/registries',
  '@peac/resolver-http',
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      // Skip dist / node_modules / build artifacts
      if (entry === 'dist' || entry === 'node_modules' || entry === '.tsbuildinfo') {
        continue;
      }
      out.push(...walk(full));
    } else if (st.isFile()) {
      const dot = entry.lastIndexOf('.');
      if (dot >= 0 && SOURCE_EXTENSIONS.has(entry.slice(dot))) {
        out.push(full);
      }
    }
  }
  return out;
}

function findForbiddenImports(file: string): Array<{ line: number; match: string }> {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const findings: Array<{ line: number; match: string }> = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const forbidden of FORBIDDEN_IMPORTS) {
      // Match both static `from '...'` / `from "..."` and dynamic `import('...')`.
      const escaped = forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`['"]${escaped}(?:/[^'"]*)?['"]`);
      if (re.test(line)) {
        // Filter out comments-only lines: line trimmed starts with `//` or `*`.
        const trimmed = line.trimStart();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
          continue;
        }
        findings.push({ line: i + 1, match: forbidden });
      }
    }
  }

  return findings;
}

describe('packages/protocol/src/**: source-import guard', () => {
  it('contains zero imports from workspace-private packages', () => {
    const files = walk(PROTOCOL_SRC);
    const allFindings: Array<{ file: string; line: number; match: string }> = [];

    for (const file of files) {
      const findings = findForbiddenImports(file);
      for (const f of findings) {
        allFindings.push({ file: file.slice(ROOT.length + 1), line: f.line, match: f.match });
      }
    }

    if (allFindings.length > 0) {
      const lines = allFindings.map((f) => `  ${f.file}:${f.line}: imports ${f.match}`);
      throw new Error(
        `packages/protocol/src/** must not import from workspace-private packages.\n` +
          `Found ${allFindings.length} violation(s):\n${lines.join('\n')}\n\n` +
          `Reason: published packages installed from npm by external consumers do not have ` +
          `access to workspace-private packages. A runtime import would fail at module ` +
          `resolution time.`
      );
    }

    expect(allFindings).toEqual([]);
  });
});
