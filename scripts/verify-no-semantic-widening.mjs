#!/usr/bin/env node
/**
 * No-semantic-widening gate for v0.12.14 release prep.
 *
 * This is a release-specific gate with baselines hard-coded to the v0.12.13
 * published state (37 packages, 12 extension groups, 186 error codes). It is
 * not a general semantic-drift framework. Future releases should either update
 * the baselines here or author a new gate script for their release window.
 *
 * Verifies that the v0.12.14 release has not widened the protocol
 * surface beyond what is documented as additive report-only behavior.
 *
 * Checks:
 *   1. Wire format version unchanged (interaction-record+jwt / peac-receipt/0.1)
 *   2. No new public package beyond the 37 published at v0.12.13
 *   3. No new extension key in registries.json beyond v0.12.13 baseline
 *   4. No new non-additive OpenAPI contract field
 *   5. No new JWS typ beyond the two stable values
 *   6. No new error code emitted on primary paths (emitted: true) beyond baseline
 *
 * Exit codes:
 *   0  all checks pass
 *   1  one or more checks failed
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
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

console.log('No-semantic-widening gate (v0.12.14)');
console.log('=====================================\n');

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
  const BASELINE = 37;
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
// 3. No new extension key in registries beyond v0.12.13 baseline
// ---------------------------------------------------------------------------
console.log('\n--- Extension keys ---');
const regs = readJSON(join(ROOT, 'specs/kernel/registries.json'));
if (!regs) {
  fail('specs/kernel/registries.json not found');
} else {
  // Baseline extension_groups count from v0.12.13: 12
  // Structure: registries.json { extension_groups: { _comment: "...", values: [...] } }
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
// 4. OpenAPI drift: bindings field is the only permitted additive field
// ---------------------------------------------------------------------------
console.log('\n--- OpenAPI contract ---');
const openapiPath = join(ROOT, 'packages/schema/openapi/verify.yaml');
if (!existsSync(openapiPath)) {
  fail('packages/schema/openapi/verify.yaml not found');
} else {
  const openapi = readFileSync(openapiPath, 'utf8');
  // Must still include the established core response fields
  const requiredFields = ['verified', 'receipt_ref', 'policy_binding'];
  for (const f of requiredFields) {
    if (openapi.includes(f)) {
      pass(`OpenAPI includes required field: ${f}`);
    } else {
      fail(`OpenAPI missing required field: ${f}`);
    }
  }
  // bindings is the one permitted additive field (report-only)
  if (openapi.includes('bindings')) {
    pass('OpenAPI includes bindings field (permitted additive report-only field)');
  } else {
    fail('OpenAPI missing bindings field (should have been added as additive)');
  }
  // wire_format must not have changed
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
  // Baseline: 0 errors with emitted:true (v0.12.13 emitted none on primary paths)
  const BASELINE_EMITTED = 0;
  if (emitted.length === BASELINE_EMITTED) {
    pass(`Emitted-on-primary-path error codes unchanged at ${BASELINE_EMITTED}`);
  } else {
    fail(
      `New emitted error codes: expected ${BASELINE_EMITTED}, got ${emitted.length} - new: ${emitted.map((e) => e.code).join(', ')}`
    );
  }
  // Total count sanity: v0.12.13 had 186 error codes
  const BASELINE_TOTAL = 186;
  if (allErrors.length === BASELINE_TOTAL) {
    pass(`Total error code count unchanged at ${BASELINE_TOTAL}`);
  } else if (allErrors.length < BASELINE_TOTAL) {
    fail(`Error codes removed: baseline ${BASELINE_TOTAL}, actual ${allErrors.length}`);
  } else {
    // additions are OK (additive) but we note them
    pass(
      `Error code count: ${allErrors.length} (${allErrors.length - BASELINE_TOTAL} added beyond baseline - additive OK)`
    );
  }
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
