/**
 * AST-based No-Network Audit
 *
 * Canonical semantic gate verifying that validation-only packages
 * contain zero runtime network I/O:
 *   - @peac/kernel  (Layer 0)
 *   - @peac/schema  (Layer 1)
 *   - @peac/crypto  (Layer 2)
 *
 * Core logic: scripts/lib/ast-no-network-core.ts (shared with tests)
 *
 * Usage: pnpm exec tsx scripts/ast-no-network-audit.ts
 * Exit codes: 0 = clean, 1 = violations found
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditSourceText } from './lib/ast-no-network-core';
import type { Violation } from './lib/ast-no-network-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// -------------------------------------------------------------------------
// Audit targets: validation-only packages (@peac/kernel, @peac/schema, @peac/crypto)
// -------------------------------------------------------------------------

const AUDIT_TARGETS = [
  { name: '@peac/kernel', srcDir: join(ROOT, 'packages/kernel/src') },
  { name: '@peac/schema', srcDir: join(ROOT, 'packages/schema/src') },
  { name: '@peac/crypto', srcDir: join(ROOT, 'packages/crypto/src') },
];

// -------------------------------------------------------------------------
// File collection
// -------------------------------------------------------------------------

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '__snapshots__', '.turbo', 'coverage']);

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  const stat = statSync(dir, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) return results;

  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    const entryStat = statSync(fullPath);
    if (entryStat.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (
      entryStat.isFile() &&
      extname(entry) === '.ts' &&
      !entry.endsWith('.d.ts') &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.bench.ts') &&
      !entry.endsWith('.spec.ts')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------

console.log(
  'AST no-network audit for validation-only packages (@peac/kernel, @peac/schema, @peac/crypto)'
);
console.log('='.repeat(92));
console.log('');

let totalViolations = 0;
let totalFiles = 0;

for (const target of AUDIT_TARGETS) {
  const files = collectTsFiles(target.srcDir);
  if (files.length === 0) {
    console.log(`  WARN: ${target.name} has no source files at ${relative(ROOT, target.srcDir)}`);
    continue;
  }

  totalFiles += files.length;
  const targetViolations: Violation[] = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const relPath = relative(ROOT, file);
    targetViolations.push(...auditSourceText(source, relPath));
  }

  if (targetViolations.length === 0) {
    console.log(`  OK: ${target.name} (${files.length} files, zero network I/O)`);
  } else {
    console.log(`  FAIL: ${target.name} (${targetViolations.length} violation(s))`);
    for (const v of targetViolations) {
      console.log(`    ${v.file}:${v.line}:${v.column} [${v.kind}] ${v.detail}`);
    }
    totalViolations += targetViolations.length;
  }
}

console.log('');
console.log(`Scanned ${totalFiles} source files across ${AUDIT_TARGETS.length} packages.`);

if (totalViolations > 0) {
  console.log(`FAIL: ${totalViolations} network I/O violation(s) found.`);
  console.log('Validation-only packages must contain zero network I/O.');
  process.exit(1);
} else {
  console.log('OK: Zero network I/O detected (AST-verified).');
  process.exit(0);
}
