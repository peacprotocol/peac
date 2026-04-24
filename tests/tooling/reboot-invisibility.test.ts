/**
 * v0.13.0 reboot-package invisibility audit (PR A).
 *
 * Per plan §2 invariants and Revision 4 §19, the reboot packages
 * @peac/record-core, @peac/resolver-http, @peac/compat, @peac/registries
 * are workspace-private throughout v0.13.1 and v0.13.2. They MUST NOT
 * appear on any tracked public surface until they are explicitly promoted
 * via a dedicated roadmap decision with its own gate review.
 *
 * This test greps tracked files under public surfaces for those four names
 * and fails if any appears outside allowed contexts.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const REBOOT_NAMES = [
  '@peac/record-core',
  '@peac/resolver-http',
  '@peac/compat',
  '@peac/registries',
];

// Surfaces that are externally visible on the public repo. If a reboot
// package name appears in any of these paths in a tracked file, v0.13.x
// reboot invisibility is broken.
const FORBIDDEN_PATHS = [
  'docs',
  'examples',
  'integrator-kits',
  'surfaces',
  'README.md',
  'llms.txt',
  'CHANGELOG.md',
];

// Paths that may legitimately mention the names (local planning, test
// infrastructure that enforces the rule, or this test itself).
const ALLOWED_SUBSTRINGS = [
  'reference/', // gitignored local planning (excluded from grep anyway)
  'tests/tooling/reboot-invisibility.test.ts', // this test
  'CLAUDE.md', // local operating manual
];

function runGrep(pattern: string, paths: string[]): string[] {
  try {
    // git ls-files ensures we only inspect tracked files. Archive and
    // node_modules are naturally excluded.
    const fileList = execSync(`git ls-files -- ${paths.join(' ')}`, {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);

    if (fileList.length === 0) return [];

    // Split the file list into chunks to avoid shell arg length limits.
    const chunks: string[][] = [];
    const CHUNK = 200;
    for (let i = 0; i < fileList.length; i += CHUNK) {
      chunks.push(fileList.slice(i, i + CHUNK));
    }

    const hits: string[] = [];
    for (const chunk of chunks) {
      try {
        const out = execSync(
          `grep -Hn --fixed-strings -- ${JSON.stringify(pattern)} ${chunk.map((f) => JSON.stringify(f)).join(' ')}`,
          { cwd: ROOT, encoding: 'utf8' }
        );
        hits.push(...out.split('\n').filter(Boolean));
      } catch (e: any) {
        // grep exits non-zero when no match; treat as empty.
        if (e.status === 1) continue;
        throw e;
      }
    }
    // Post-filter: grep --fixed-strings matches @peac/compat inside
    // @peac/compat-wire01 / @peac/compat-v1 / etc. Reject any hit whose
    // match is immediately followed by an identifier-continuation char
    // (letter, digit, hyphen, underscore).
    return hits.filter((line) => {
      // Each line shape: "<file>:<lineno>:<text>"
      const colonIdx = line.indexOf(':', line.indexOf(':') + 1);
      const text = colonIdx >= 0 ? line.slice(colonIdx + 1) : line;
      const patIdx = text.indexOf(pattern);
      if (patIdx === -1) return true; // keep; unexpected shape
      const next = text.charAt(patIdx + pattern.length);
      if (next === '' || /[^a-zA-Z0-9_-]/.test(next)) return true;
      return false;
    });
  } catch (e: any) {
    if (e.status === 1) return [];
    throw e;
  }
}

describe('v0.13.x reboot-package invisibility', () => {
  for (const name of REBOOT_NAMES) {
    it(`${name} does not appear on any tracked public surface`, () => {
      const hits = runGrep(name, FORBIDDEN_PATHS);
      const leaked = hits.filter((line) => {
        const [file] = line.split(':');
        if (!file) return false;
        return !ALLOWED_SUBSTRINGS.some((ok) => file.includes(ok));
      });
      expect(leaked, leaked.join('\n')).toEqual([]);
    });
  }

  it('scripts/publish-manifest.json does not list any reboot package', () => {
    const manifest = JSON.parse(
      execSync('cat scripts/publish-manifest.json', { cwd: ROOT, encoding: 'utf8' })
    ) as { packages: string[] };
    const leaked = manifest.packages.filter((n) => REBOOT_NAMES.includes(n));
    expect(leaked).toEqual([]);
  });
});
