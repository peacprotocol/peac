#!/usr/bin/env node
/**
 * Error-emission audit.
 *
 * For every entry in `specs/kernel/errors.json`, classify whether the
 * code is referenced from production source, from tests only, or not at
 * all. The classification is informational; this audit does NOT remove
 * codes, renumber codes, or change public semantics. Error codes are
 * part of the public surface and removal requires its own deprecation
 * lifecycle.
 *
 * Inputs:
 *   - specs/kernel/errors.json (canonical registry)
 *
 * Scopes:
 *   - production: packages/<pkg>/src/**, apps/<app>/src/**, sdks/go/**
 *   - tests:      packages/<pkg>/{tests,__tests__}/**, apps/<app>/tests/**,
 *                 specs/conformance/**, tests/**
 *
 * Outputs (when run with --write):
 *   - docs/reboot/ERROR-EMISSION-AUDIT-v0.13.0.json (machine-readable)
 *   - docs/reboot/ERROR-EMISSION-AUDIT-v0.13.0.md (prose companion)
 *
 * Default: prints a short summary to stdout and exits 0. Failure is
 * limited to script errors; classifications never fail the run.
 *
 * Usage:
 *   node scripts/audit-error-emissions.mjs           # summary to stdout
 *   node scripts/audit-error-emissions.mjs --write   # also rewrite the docs/reboot/ artifacts
 *   node scripts/audit-error-emissions.mjs --json    # JSON to stdout (no docs write)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const JSON_OUT = args.includes('--json');

const errorsPath = join(REPO_ROOT, 'specs/kernel/errors.json');
if (!existsSync(errorsPath)) {
  console.error(`audit-error-emissions: cannot find ${errorsPath}`);
  process.exit(2);
}

const registry = JSON.parse(readFileSync(errorsPath, 'utf8'));
const errors = registry.errors ?? [];
if (errors.length === 0) {
  console.error('audit-error-emissions: registry is empty');
  process.exit(2);
}

// Build a list of tracked files we care about. We use git ls-files so the
// audit is deterministic across machines.
function listTracked() {
  const out = execSync('git ls-files', { cwd: REPO_ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

const tracked = listTracked();

// Production = source under packages/*/src/, apps/*/src/, sdks/go (excluding test files).
// Tests = tests/, __tests__/, specs/conformance/, *.test.*, *.spec.*
const TEST_PATH_RE =
  /(?:^|\/)(?:tests?|__tests__|specs\/conformance)\//;
const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|go)$/;
const SOURCE_EXT_RE = /\.(ts|tsx|js|jsx|mjs|cjs|go)$/;

function classifyFile(path) {
  if (!SOURCE_EXT_RE.test(path)) return null;
  if (path.startsWith('archive/')) return null;
  if (path.startsWith('node_modules/')) return null;
  if (path.startsWith('dist/') || path.includes('/dist/')) return null;
  if (path.startsWith('docs/')) return null; // doc fixtures stay out
  // generated files contain every code; skip so we measure handwritten emission
  if (path.endsWith('.generated.ts') || path.endsWith('.generated.js')) return null;
  if (path.includes('/__snapshots__/')) return null;

  if (TEST_PATH_RE.test(path) || TEST_FILE_RE.test(path)) return 'test';

  // Production candidate: under packages/*/src or apps/*/src or sdks/go
  if (
    /^packages\/[^/]+\/src\//.test(path) ||
    /^packages\/[^/]+\/[^/]+\/src\//.test(path) ||
    /^packages\/[^/]+\/[^/]+\/[^/]+\/src\//.test(path) ||
    /^apps\/[^/]+\/src\//.test(path) ||
    /^sdks\/go\//.test(path)
  ) {
    return 'production';
  }
  return null;
}

const productionFiles = [];
const testFiles = [];
for (const path of tracked) {
  const cls = classifyFile(path);
  if (cls === 'production') productionFiles.push(path);
  else if (cls === 'test') testFiles.push(path);
}

// Read every production / test file and look for each error code as a
// substring. We use word-boundary matching so E_FOO does not match
// E_FOO_BAR. Codes always look like /E_[A-Z0-9_]+/ in source.
function fileText(p) {
  try {
    return readFileSync(join(REPO_ROOT, p), 'utf8');
  } catch {
    return '';
  }
}

const productionText = productionFiles.map(fileText);
const testText = testFiles.map(fileText);

function countOccurrences(haystackList, code) {
  // Use a regex that matches the code as a whole identifier token.
  // Codes are uppercase letters, digits, underscores; preceded and followed
  // by anything that's not [A-Z0-9_].
  const re = new RegExp(`(?<![A-Z0-9_])${code}(?![A-Z0-9_])`);
  let n = 0;
  for (const text of haystackList) {
    if (re.test(text)) n += 1;
  }
  return n;
}

const rows = [];
for (const e of errors) {
  const code = e.code;
  const prodHits = countOccurrences(productionText, code);
  const testHits = countOccurrences(testText, code);
  let category;
  if (prodHits > 0) category = 'emitted-in-production';
  else if (testHits > 0) category = 'tests-only';
  else category = 'unemitted';
  rows.push({
    code,
    category,
    production_files: prodHits,
    test_files: testHits,
    spec_category: e.category ?? null,
    spec_severity: e.severity ?? null,
    spec_http_status: e.http_status ?? null,
  });
}

const summary = {
  total_codes: rows.length,
  emitted_in_production: rows.filter((r) => r.category === 'emitted-in-production').length,
  tests_only: rows.filter((r) => r.category === 'tests-only').length,
  unemitted: rows.filter((r) => r.category === 'unemitted').length,
};

const report = {
  generated_at: new Date().toISOString(),
  registry_path: 'specs/kernel/errors.json',
  registry_version: registry.version ?? null,
  scopes: {
    production_files_scanned: productionFiles.length,
    test_files_scanned: testFiles.length,
  },
  summary,
  details: rows,
};

if (JSON_OUT && !WRITE) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(0);
}

if (WRITE) {
  const jsonOut = join(REPO_ROOT, 'docs/reboot/ERROR-EMISSION-AUDIT-v0.13.0.json');
  writeFileSync(jsonOut, JSON.stringify(report, null, 2) + '\n');

  const lines = [];
  lines.push('# v0.13.0 error-emission audit');
  lines.push('');
  lines.push(
    '> **Status:** Informational. Catalogues every code in `specs/kernel/errors.json` and'
  );
  lines.push(
    '> classifies each by how it is referenced in the v0.13.0 tagged tree. No code is'
  );
  lines.push(
    '> renumbered, removed, or re-categorized in this release; error codes are part of'
  );
  lines.push(
    '> the public surface and changing them follows the deprecation lifecycle in'
  );
  lines.push(
    '> [`docs/DEPRECATION_POLICY.md`](../DEPRECATION_POLICY.md). Regenerate this report'
  );
  lines.push(
    '> by running `node scripts/audit-error-emissions.mjs --write`.'
  );
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total codes: ${summary.total_codes}`);
  lines.push(`- Emitted in production: ${summary.emitted_in_production}`);
  lines.push(`- Referenced in tests only: ${summary.tests_only}`);
  lines.push(`- Unreferenced: ${summary.unemitted}`);
  lines.push(`- Production files scanned: ${productionFiles.length}`);
  lines.push(`- Test files scanned: ${testFiles.length}`);
  lines.push('');
  lines.push('## Methodology');
  lines.push('');
  lines.push(
    '- Production scope: `packages/*/src/**`, `apps/*/src/**`, `sdks/go/**`. Generated'
  );
  lines.push(
    '  files (`*.generated.ts`), archive paths, and `node_modules/` are excluded.'
  );
  lines.push(
    '- Test scope: `tests/**`, `**/__tests__/**`, `**/tests/**`, `specs/conformance/**`,'
  );
  lines.push(
    '  and any `*.test.*` / `*.spec.*` file under the rest of the workspace.'
  );
  lines.push(
    '- A code is matched as a whole identifier token. `E_INVALID_FORMAT` does not match'
  );
  lines.push(
    '  `E_INVALID_FORMAT_X` and is not double-counted when the same file references it'
  );
  lines.push('  multiple times.');
  lines.push(
    '- "Production files" / "Test files" columns count distinct files that mention the'
  );
  lines.push(
    '  code, not raw occurrences. The categorization is per-code: a code is "emitted in'
  );
  lines.push(
    '  production" if any production file references it, "tests only" if only test files'
  );
  lines.push('  do, and "unreferenced" otherwise.');
  lines.push('');
  lines.push('## Recommendations (advisory; no removals in this release)');
  lines.push('');
  lines.push(
    'Codes flagged as `unreferenced` are candidates for one of:'
  );
  lines.push('');
  lines.push(
    '1. **keep**: the code is reserved for an edge surface (operator, infra, or'
  );
  lines.push(
    '   future-issuance path) and the registry slot is intentionally idle.'
  );
  lines.push(
    '2. **wire-up**: the code names a real condition that is currently emitting a'
  );
  lines.push(
    '   different code, and the wire-up is a small fix-forward.'
  );
  lines.push(
    '3. **deprecate**: the code names a condition that no longer occurs. Removing it'
  );
  lines.push(
    '   requires a deprecation horizon per `docs/DEPRECATION_POLICY.md`; never within'
  );
  lines.push('   the same release.');
  lines.push('');
  lines.push(
    'Codes flagged as `tests-only` typically describe negative-test conditions whose'
  );
  lines.push(
    'fixtures synthesize the failure shape. They are usually correct as-is.'
  );
  lines.push('');
  lines.push('## Per-category counts by spec category');
  lines.push('');
  lines.push('| Spec category | Total | Production | Tests-only | Unreferenced |');
  lines.push('| ------------- | ----- | ---------- | ---------- | ------------ |');
  const byCat = {};
  for (const r of rows) {
    const cat = r.spec_category ?? '(none)';
    byCat[cat] ??= { total: 0, prod: 0, test: 0, none: 0 };
    byCat[cat].total += 1;
    if (r.category === 'emitted-in-production') byCat[cat].prod += 1;
    else if (r.category === 'tests-only') byCat[cat].test += 1;
    else byCat[cat].none += 1;
  }
  for (const [cat, c] of Object.entries(byCat).sort()) {
    lines.push(`| ${cat} | ${c.total} | ${c.prod} | ${c.test} | ${c.none} |`);
  }
  lines.push('');
  lines.push('## Unreferenced codes (advisory list)');
  lines.push('');
  const unref = rows.filter((r) => r.category === 'unemitted');
  if (unref.length === 0) {
    lines.push('_No unreferenced codes._');
  } else {
    lines.push('| Code | Spec category | Severity | HTTP status |');
    lines.push('| ---- | ------------- | -------- | ----------- |');
    for (const r of unref.sort((a, b) => a.code.localeCompare(b.code))) {
      lines.push(
        `| \`${r.code}\` | ${r.spec_category ?? ''} | ${r.spec_severity ?? ''} | ${
          r.spec_http_status ?? ''
        } |`
      );
    }
  }
  lines.push('');
  lines.push('## Tests-only codes (advisory list)');
  lines.push('');
  const tonly = rows.filter((r) => r.category === 'tests-only');
  if (tonly.length === 0) {
    lines.push('_No tests-only codes._');
  } else {
    lines.push('| Code | Spec category | Test files |');
    lines.push('| ---- | ------------- | ---------- |');
    for (const r of tonly.sort((a, b) => a.code.localeCompare(b.code))) {
      lines.push(
        `| \`${r.code}\` | ${r.spec_category ?? ''} | ${r.test_files} |`
      );
    }
  }
  lines.push('');
  lines.push(
    '_For the full per-code data including production-file counts, see_'
  );
  lines.push('_`docs/reboot/ERROR-EMISSION-AUDIT-v0.13.0.json`._');
  lines.push('');

  const mdOut = join(REPO_ROOT, 'docs/reboot/ERROR-EMISSION-AUDIT-v0.13.0.md');
  writeFileSync(mdOut, lines.join('\n'));
  console.log(`audit-error-emissions: wrote ${jsonOut}`);
  console.log(`audit-error-emissions: wrote ${mdOut}`);
  console.log('');
}

console.log(`audit-error-emissions: ${summary.total_codes} codes scanned`);
console.log(`  emitted in production: ${summary.emitted_in_production}`);
console.log(`  tests-only:            ${summary.tests_only}`);
console.log(`  unreferenced:          ${summary.unemitted}`);
console.log(`  production files:      ${productionFiles.length}`);
console.log(`  test files:            ${testFiles.length}`);
