#!/usr/bin/env node
/**
 * No-semantic-widening gate.
 *
 * Release-window gate with baselines anchored to the v0.13.0 published
 * state (36 packages after @peac/disc retirement, 12 extension groups,
 * 186 error codes, 0 emitted-on-primary-path codes). Subsequent v0.13.x
 * releases inherit these baselines unchanged because they ship no new
 * public package, extension key, or emitted error code; if a future
 * release widens any baseline, update the values here together with
 * the corresponding CHANGELOG entry.
 *
 * Verifies that the in-flight release has not widened the protocol
 * surface beyond what is documented as additive observational behavior.
 *
 * Checks:
 *   1. Wire format versions unchanged (peac-receipt/0.1 +
 *      interaction-record+jwt).
 *   2. No new public package beyond the 36 published at v0.13.0.
 *   3. No new extension key beyond the v0.13.0 baseline.
 *   4. OpenAPI contract still includes the established core fields
 *      and the additive bindings field; wire format unchanged.
 *   5. No new emitted error code on primary paths beyond baseline.
 *   6. Three workspace-private packages introduced by the v0.13.1 train
 *      (`@peac/compat`, `@peac/record-core`, `@peac/registries`) carry
 *      `"private": true` and are absent from the publish manifest.
 *   7. Internal-only flags
 *      (`PEAC_INTERNAL_SHADOW_CORE`, `_internal.shadowCore`,
 *      `PEAC_INTERNAL_LEGACY_PATH`, `_internal.legacyPath`,
 *      `PEAC_EXPERIMENTAL_CODEC`, `_internal.codec`) do not appear
 *      on any front-door tracked surface (README, START_HERE,
 *      PACKAGE_STATUS, examples, integrator-kits, surfaces, llms.txt,
 *      CHANGELOG). The internal wiring under
 *      `packages/protocol/src/_internal/` and the documentation in
 *      `docs/STABILITY-CONTRACT.md` are explicitly allowed.
 *
 * Exit codes:
 *   0  all checks pass
 *   1  one or more checks failed
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

let passed = 0;
let failed = 0;

function pass(msg) {
  console.log(`  OK: ${msg}`);
  passed++;
}
function fail(msg) {
  console.error(`  FAIL: ${msg}`);
  failed++;
}
function readJSON(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

console.log('No-semantic-widening gate');
console.log('=========================\n');

// ---------------------------------------------------------------------------
// 1. Wire format versions unchanged
// ---------------------------------------------------------------------------
console.log('--- Wire format ---');
const kernelConstants = readFileSync(join(ROOT, 'packages/kernel/src/constants.ts'), 'utf8');
const hasWire01 = kernelConstants.includes("'peac-receipt/0.1'");
const hasWire02 = kernelConstants.includes("'interaction-record+jwt'");
if (hasWire01 && hasWire02) {
  pass('Wire 0.1 typ (peac-receipt/0.1) present and unchanged');
  pass('Wire 0.2 typ (interaction-record+jwt) present and unchanged');
} else {
  if (!hasWire01) fail('Wire 0.1 typ missing or changed in kernel/constants.ts');
  if (!hasWire02) fail('Wire 0.2 typ missing or changed in kernel/constants.ts');
}

// ---------------------------------------------------------------------------
// 2. No new public package
// ---------------------------------------------------------------------------
console.log('\n--- Published packages ---');
const manifest = readJSON(join(ROOT, 'scripts/publish-manifest.json'));
if (!manifest) {
  fail('publish-manifest.json not found');
} else {
  const pkgs = manifest.packages ?? [];
  const BASELINE = 36;
  if (pkgs.length === BASELINE) {
    pass(`Published package count unchanged at ${BASELINE}`);
  } else if (pkgs.length < BASELINE) {
    fail(`Published packages dropped: expected ${BASELINE}, got ${pkgs.length}`);
  } else {
    fail(
      `New public package(s) added: expected ${BASELINE}, got ${pkgs.length} - new: ${pkgs.slice(BASELINE).join(', ')}`
    );
  }
}

// ---------------------------------------------------------------------------
// 3. No new extension key in registries beyond v0.13.0 baseline
// ---------------------------------------------------------------------------
console.log('\n--- Extension keys ---');
const regs = readJSON(join(ROOT, 'specs/kernel/registries.json'));
if (!regs) {
  fail('specs/kernel/registries.json not found');
} else {
  const BASELINE_EXT_GROUPS = 12;
  const groups = regs.extension_groups ?? regs.registries?.extension_groups ?? [];
  const groupCount = Array.isArray(groups)
    ? groups.length
    : Array.isArray(groups.values)
      ? groups.values.length
      : Object.keys(groups).length;
  if (groupCount === BASELINE_EXT_GROUPS) {
    pass(`Extension group count unchanged at ${BASELINE_EXT_GROUPS}`);
  } else if (groupCount > BASELINE_EXT_GROUPS) {
    fail(`New extension group(s) added: baseline ${BASELINE_EXT_GROUPS}, actual ${groupCount}`);
  } else {
    fail(`Extension groups removed: baseline ${BASELINE_EXT_GROUPS}, actual ${groupCount}`);
  }
}

// ---------------------------------------------------------------------------
// 4. OpenAPI contract: bindings is the only additive field
// ---------------------------------------------------------------------------
console.log('\n--- OpenAPI contract ---');
const openapiPath = join(ROOT, 'packages/schema/openapi/verify.yaml');
if (!existsSync(openapiPath)) {
  fail('packages/schema/openapi/verify.yaml not found');
} else {
  const openapi = readFileSync(openapiPath, 'utf8');
  const requiredFields = ['verified', 'receipt_ref', 'policy_binding'];
  for (const f of requiredFields) {
    if (openapi.includes(f)) {
      pass(`OpenAPI includes required field: ${f}`);
    } else {
      fail(`OpenAPI missing required field: ${f}`);
    }
  }
  if (openapi.includes('bindings')) {
    pass('OpenAPI includes bindings field (permitted additive report-only field)');
  } else {
    fail('OpenAPI missing bindings field (should have been added as additive)');
  }
  if (openapi.includes('interaction-record+jwt')) {
    pass('OpenAPI references interaction-record+jwt typ (unchanged)');
  } else {
    fail('OpenAPI does not reference interaction-record+jwt');
  }
}

// ---------------------------------------------------------------------------
// 5. No new error code on primary paths beyond baseline
// ---------------------------------------------------------------------------
console.log('\n--- Error codes ---');
const errors = readJSON(join(ROOT, 'specs/kernel/errors.json'));
if (!errors) {
  fail('specs/kernel/errors.json not found');
} else {
  const allErrors = errors.errors ?? [];
  const emitted = allErrors.filter((e) => e.emitted === true);
  const BASELINE_EMITTED = 0;
  if (emitted.length === BASELINE_EMITTED) {
    pass(`Emitted-on-primary-path error codes unchanged at ${BASELINE_EMITTED}`);
  } else {
    fail(
      `New emitted error codes: expected ${BASELINE_EMITTED}, got ${emitted.length} - new: ${emitted.map((e) => e.code).join(', ')}`
    );
  }
  const BASELINE_TOTAL = 186;
  if (allErrors.length === BASELINE_TOTAL) {
    pass(`Total error code count unchanged at ${BASELINE_TOTAL}`);
  } else if (allErrors.length < BASELINE_TOTAL) {
    fail(`Error codes removed: baseline ${BASELINE_TOTAL}, actual ${allErrors.length}`);
  } else {
    pass(
      `Error code count: ${allErrors.length} (${allErrors.length - BASELINE_TOTAL} added beyond baseline - additive OK)`
    );
  }
}

// ---------------------------------------------------------------------------
// 6. Three workspace-private packages confirmed private + absent from manifest
// ---------------------------------------------------------------------------
console.log('\n--- Workspace-private packages (v0.13.1) ---');
const PRIVATE_NAMES = ['@peac/compat', '@peac/record-core', '@peac/registries'];
const PRIVATE_PATHS = ['packages/compat', 'packages/record-core', 'packages/registries'];
for (const dir of PRIVATE_PATHS) {
  const pkgPath = join(ROOT, dir, 'package.json');
  const pkg = readJSON(pkgPath);
  if (!pkg) {
    fail(`${dir}/package.json not found`);
    continue;
  }
  if (pkg.private !== true) {
    fail(`${dir}/package.json must have "private": true (got ${JSON.stringify(pkg.private)})`);
  } else {
    pass(`${dir}/package.json has "private": true (name: ${pkg.name})`);
  }
}
if (manifest) {
  const pubNames = new Set((manifest.packages ?? []).map((p) => (typeof p === 'string' ? p : p.name)));
  for (const name of PRIVATE_NAMES) {
    if (pubNames.has(name)) {
      fail(`workspace-private ${name} appears in publish-manifest.json`);
    } else {
      pass(`workspace-private ${name} absent from publish-manifest.json`);
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Internal-flag front-door grep
// ---------------------------------------------------------------------------
console.log('\n--- Internal-flag front-door grep ---');
const FORBIDDEN_FLAGS = [
  'PEAC_INTERNAL_SHADOW_CORE',
  '_internal.shadowCore',
  'PEAC_INTERNAL_LEGACY_PATH',
  '_internal.legacyPath',
  'PEAC_EXPERIMENTAL_CODEC',
  '_internal.codec',
];
const FRONT_DOOR_FILES = [
  'README.md',
  'docs/START_HERE.md',
  'docs/PACKAGE_STATUS.md',
  'llms.txt',
  'CHANGELOG.md',
];
const FRONT_DOOR_DIRS = ['examples', 'integrator-kits', 'surfaces', 'docs/release-notes'];
const ALLOWED_DOC = 'docs/STABILITY-CONTRACT.md';

function walkText(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
      out.push(...walkText(full));
    } else if (e.isFile() && /\.(md|txt|json|ts|tsx|js|mjs|cjs|yaml|yml)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

const scanFiles = [];
for (const f of FRONT_DOOR_FILES) {
  const path = join(ROOT, f);
  if (existsSync(path)) scanFiles.push(path);
}
for (const dir of FRONT_DOOR_DIRS) {
  const path = join(ROOT, dir);
  try {
    if (statSync(path).isDirectory()) scanFiles.push(...walkText(path));
  } catch {
    /* directory may not exist; skip */
  }
}

const allowedPath = join(ROOT, ALLOWED_DOC);
const filteredFiles = scanFiles.filter((p) => p !== allowedPath);
let leakCount = 0;
for (const f of filteredFiles) {
  const content = readFileSync(f, 'utf8');
  for (const flag of FORBIDDEN_FLAGS) {
    if (content.includes(flag)) {
      fail(`front-door file ${relative(ROOT, f)} contains internal flag: ${flag}`);
      leakCount += 1;
    }
  }
}
if (leakCount === 0) {
  pass(
    `Internal flags absent from ${filteredFiles.length} front-door files (allowed: ${ALLOWED_DOC})`
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} checks - ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nSemantic-widening gate FAILED. Review the failures above before tagging.');
  process.exit(1);
} else {
  console.log('\nSemantic-widening gate PASSED. Safe to tag.');
  process.exit(0);
}
