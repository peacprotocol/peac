#!/usr/bin/env node
/**
 * bench-capture.mjs -- Run benchmarks and capture JSON output
 *
 * Runs vitest bench for crypto, schema, and protocol packages,
 * writing JSON results to reference/bench/ for diffable comparison.
 *
 * Usage: node scripts/bench-capture.mjs
 */

import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const outDir = join(ROOT, 'reference', 'bench');

mkdirSync(outDir, { recursive: true });

const packages = [
  { filter: '@peac/crypto', file: 'crypto.json' },
  { filter: '@peac/schema', file: 'schema.json' },
  { filter: '@peac/protocol', file: 'protocol.json' },
];

let hasErrors = false;

for (const { filter, file } of packages) {
  const outPath = join(outDir, file);
  console.log(`Running benchmarks for ${filter}...`);

  try {
    execSync(
      `pnpm --filter ${filter} exec vitest bench --run --outputJson "${outPath}"`,
      { cwd: ROOT, stdio: 'inherit', timeout: 120_000 }
    );
    console.log(`  Output: ${outPath}\n`);
  } catch (err) {
    console.error(`  FAILED: ${filter}`);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error('\nSome benchmarks failed.');
  process.exit(1);
}

console.log('All benchmark results captured in reference/bench/');
