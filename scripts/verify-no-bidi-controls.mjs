#!/usr/bin/env node
/**
 * verify-no-bidi-controls.mjs
 *
 * CI gate: no Unicode bidi controls or zero-width / invisible characters in
 * tracked source, docs, or configuration. Thin wrapper around
 * `scripts/find-invisible-unicode.mjs` with a tighter CI-facing summary.
 *
 * Scans every tracked `.ts` / `.tsx` / `.js` / `.jsx` / `.mjs` / `.cjs` /
 * `.json` / `.md` / `.yaml` / `.yml` file except `archive/` and
 * `node_modules/`, and exits non-zero on the first dangerous codepoint
 * (Trojan Source, zero-width, bidi controls, etc.).
 *
 * Exit codes:
 *   0 - no dangerous Unicode found
 *   1 - one or more dangerous codepoints detected
 *   2 - script error (missing underlying scanner, unexpected I/O failure)
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCANNER = join(HERE, 'find-invisible-unicode.mjs');

if (!existsSync(SCANNER)) {
  console.error(`verify-no-bidi-controls: missing scanner at ${SCANNER}`);
  process.exit(2);
}

const EXTS = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.cjs', '*.json', '*.md', '*.yaml', '*.yml'];

const ls = spawnSync('git', ['ls-files', '--', ...EXTS], { encoding: 'utf8' });
if (ls.status !== 0) {
  console.error('verify-no-bidi-controls: git ls-files failed');
  console.error(ls.stderr);
  process.exit(2);
}

const files = ls.stdout
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.length > 0 && !l.startsWith('archive/') && !l.startsWith('node_modules/'));

if (files.length === 0) {
  console.log('verify-no-bidi-controls: no tracked files to scan');
  process.exit(0);
}

const scan = spawnSync('node', [SCANNER, '--stdin'], {
  input: files.join('\n') + '\n',
  encoding: 'utf8',
});

if (scan.status === 0) {
  console.log(`verify-no-bidi-controls: clean (${files.length} files scanned)`);
  process.exit(0);
}

if (scan.stdout) process.stdout.write(scan.stdout);
if (scan.stderr) process.stderr.write(scan.stderr);
console.error(
  '\nverify-no-bidi-controls: dangerous Unicode detected. ' +
    'Re-run with `node scripts/find-invisible-unicode.mjs --fix <files>` to remediate.'
);
process.exit(1);
