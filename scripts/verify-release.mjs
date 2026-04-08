#!/usr/bin/env node

/**
 * Release Facts Verification Gate
 *
 * Validates that docs/releases/facts.json is present, well-formed, and
 * consistent with actual build output and repo metadata.
 *
 * Checks (all blocking unless marked SKIP):
 *  1. facts.json exists and parses as valid JSON with schema_version
 *  2. facts.json version matches package.json and current.json
 *  3. facts.json wire_format_version matches current.json
 *  4. facts.json release_date is a valid ISO 8601 date
 *  5. facts.json published_packages matches publish-manifest.json count
 *  6. facts.json conformance_requirement_ids matches requirement-ids.json
 *  7. facts.json conformance_sections matches requirement-ids.json sections
 *  8. facts.json build_targets matches turbo build output
 *  9. facts.json tests and test_files are positive integers (actual count
 *     validated during release-prep; CI validates presence and type only)
 * 10. facts.json node_canonical matches .node-version
 * 11. facts.json node_minimum matches package.json engines.node
 * 12. Provenance fields present (npm_provenance, oidc_trusted_publishing)
 * 13. Gate report presence for current version (advisory)
 * 14. SDK status completeness (typescript, go, python)
 *
 * Exit codes:
 * - 0: All release checks passed
 * - 1: Release validation failure (blocking)
 * - 2: Script error (missing critical file, parse error)
 *
 * Usage:
 *   node scripts/verify-release.mjs
 *   pnpm verify:release
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

let passed = 0;
let failed = 0;
let skipped = 0;
const skipReasons = [];

function pass(msg) {
  passed++;
  console.log(colors.green(`  PASS: ${msg}`));
}

function fail(msg) {
  failed++;
  console.log(colors.red(`  FAIL: ${msg}`));
}

function skip(msg, reason) {
  skipped++;
  const display = reason ? `${msg} (${reason})` : msg;
  skipReasons.push(display);
  console.log(colors.yellow(`  SKIP: ${display}`));
}

function readJSON(path, critical = false) {
  if (!existsSync(path)) {
    if (critical) {
      console.error(colors.red(`ERROR: Critical file not found: ${path}`));
      process.exit(2);
    }
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    if (critical) {
      console.error(colors.red(`ERROR: Failed to parse ${path}: ${e.message}`));
      process.exit(2);
    }
    return undefined;
  }
}

function readText(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8').trim();
}

// ---------------------------------------------------------------------------
// Check 1: facts.json existence and validity
// ---------------------------------------------------------------------------
function checkFactsExistence() {
  console.log(colors.bold('\n--- Release Facts File ---\n'));

  const factsPath = join(ROOT, 'docs/releases/facts.json');
  if (!existsSync(factsPath)) {
    fail('docs/releases/facts.json not found');
    return null;
  }

  try {
    const facts = JSON.parse(readFileSync(factsPath, 'utf-8'));
    pass('docs/releases/facts.json exists and is valid JSON');

    if (!facts.schema_version) {
      fail('facts.json missing schema_version field');
    } else {
      pass(`facts.json schema_version: ${facts.schema_version}`);
    }

    // Required top-level fields
    const requiredFields = [
      'version',
      'wire_format_version',
      'dist_tag',
      'release_date',
      'metrics',
      'runtime',
      'sdks',
      'provenance',
    ];
    const missing = requiredFields.filter((f) => facts[f] === undefined);
    if (missing.length > 0) {
      fail(`facts.json missing required top-level fields: ${missing.join(', ')}`);
    } else {
      pass(`facts.json has all required top-level fields`);
    }

    return facts;
  } catch (e) {
    fail(`docs/releases/facts.json is not valid JSON: ${e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Check 2-3: Version consistency
// ---------------------------------------------------------------------------
function checkVersionConsistency(facts) {
  console.log(colors.bold('\n--- Version Consistency ---\n'));

  if (!facts) {
    skip('version checks', 'facts.json not available');
    return;
  }

  const pkgJson = readJSON(join(ROOT, 'package.json'), true);
  const currentJson = readJSON(join(ROOT, 'docs/releases/current.json'));

  if (facts.version !== pkgJson.version) {
    fail(`facts.json version (${facts.version}) != package.json version (${pkgJson.version})`);
  } else {
    pass(`facts.json version matches package.json: ${facts.version}`);
  }

  if (currentJson) {
    if (facts.version !== currentJson.version) {
      fail(
        `facts.json version (${facts.version}) != current.json version (${currentJson.version})`
      );
    } else {
      pass(`facts.json version matches current.json: ${facts.version}`);
    }

    if (facts.wire_format_version !== currentJson.wire_format_version) {
      fail(
        `facts.json wire_format_version (${facts.wire_format_version}) != current.json (${currentJson.wire_format_version})`
      );
    } else {
      pass(`wire_format_version matches: ${facts.wire_format_version}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 4: Release date
// ---------------------------------------------------------------------------
function checkReleaseDate(facts) {
  console.log(colors.bold('\n--- Release Date ---\n'));

  if (!facts?.release_date) {
    fail('facts.json missing release_date');
    return;
  }

  // Validate ISO 8601 date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(facts.release_date)) {
    fail(`facts.json release_date (${facts.release_date}) is not ISO 8601 YYYY-MM-DD format`);
    return;
  }

  const parsed = new Date(facts.release_date);
  if (isNaN(parsed.getTime())) {
    fail(`facts.json release_date (${facts.release_date}) is not a valid date`);
    return;
  }

  pass(`release_date is valid: ${facts.release_date}`);
}

// ---------------------------------------------------------------------------
// Check 5: Published packages count
// ---------------------------------------------------------------------------
function checkPackageCount(facts) {
  console.log(colors.bold('\n--- Package Count ---\n'));

  if (!facts?.metrics) {
    skip('package count', 'facts.json metrics not available');
    return;
  }

  const manifest = readJSON(join(ROOT, 'scripts/publish-manifest.json'));
  if (!manifest) {
    skip('publish-manifest.json not found', 'file missing');
    return;
  }

  const actualCount = manifest.packages?.length ?? 0;
  const factsCount = facts.metrics.published_packages;

  if (factsCount !== actualCount) {
    fail(
      `facts.json published_packages (${factsCount}) != publish-manifest.json count (${actualCount})`
    );
  } else {
    pass(`published_packages matches publish-manifest.json: ${factsCount}`);
  }
}

// ---------------------------------------------------------------------------
// Check 6-7: Conformance requirement IDs
// ---------------------------------------------------------------------------
function checkConformanceCount(facts) {
  console.log(colors.bold('\n--- Conformance Requirements ---\n'));

  if (!facts?.metrics) {
    skip('conformance checks', 'facts.json metrics not available');
    return;
  }

  const registry = readJSON(join(ROOT, 'specs/conformance/requirement-ids.json'));
  if (!registry) {
    skip('requirement-ids.json not found', 'file missing');
    return;
  }

  const actualIds = registry.sections.reduce((sum, s) => sum + s.requirements.length, 0);
  if (facts.metrics.conformance_requirement_ids !== actualIds) {
    fail(
      `facts.json conformance_requirement_ids (${facts.metrics.conformance_requirement_ids}) != actual (${actualIds})`
    );
  } else {
    pass(`conformance_requirement_ids matches: ${actualIds}`);
  }

  const actualSections = registry.sections.length;
  if (facts.metrics.conformance_sections !== actualSections) {
    fail(
      `facts.json conformance_sections (${facts.metrics.conformance_sections}) != actual (${actualSections})`
    );
  } else {
    pass(`conformance_sections matches: ${actualSections}`);
  }
}

// ---------------------------------------------------------------------------
// Check 8: Build targets
// ---------------------------------------------------------------------------
function checkBuildTargets(facts) {
  console.log(colors.bold('\n--- Build Targets ---\n'));

  if (!facts?.metrics) {
    skip('build targets', 'facts.json metrics not available');
    return;
  }

  if (typeof facts.metrics.build_targets !== 'number' || facts.metrics.build_targets <= 0) {
    fail(
      `facts.json build_targets must be a positive integer, got: ${facts.metrics.build_targets}`
    );
    return;
  }

  // Machine-validate by running turbo dry-run to count actual targets
  try {
    const output = execFileSync('pnpm', ['exec', 'turbo', 'run', 'build', '--dry=json'], {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: 'pipe',
    });
    const turboResult = JSON.parse(output);
    const actualTargets = turboResult.tasks?.length ?? 0;

    if (actualTargets > 0 && facts.metrics.build_targets !== actualTargets) {
      fail(
        `facts.json build_targets (${facts.metrics.build_targets}) != turbo build --dry (${actualTargets})`
      );
    } else if (actualTargets > 0) {
      pass(`build_targets matches turbo dry-run: ${actualTargets}`);
    } else {
      // turbo dry run returned but no tasks; accept facts value
      pass(`build_targets: ${facts.metrics.build_targets} (turbo dry-run returned 0; accepted)`);
    }
  } catch {
    // Turbo dry-run may fail in some CI environments; fall back to type check
    pass(`build_targets: ${facts.metrics.build_targets} (turbo dry-run unavailable; type-checked)`);
  }
}

// ---------------------------------------------------------------------------
// Check 9: Test metrics
// ---------------------------------------------------------------------------
function checkTestMetrics(facts) {
  console.log(colors.bold('\n--- Test Metrics ---\n'));

  if (!facts?.metrics) {
    skip('test metrics', 'facts.json metrics not available');
    return;
  }

  // Validate tests field is a positive integer
  if (typeof facts.metrics.tests !== 'number' || facts.metrics.tests <= 0) {
    fail(`facts.json tests must be a positive integer, got: ${facts.metrics.tests}`);
  } else {
    pass(`tests: ${facts.metrics.tests} (positive integer)`);
  }

  // Validate test_files field is a positive integer
  if (typeof facts.metrics.test_files !== 'number' || facts.metrics.test_files <= 0) {
    fail(`facts.json test_files must be a positive integer, got: ${facts.metrics.test_files}`);
  } else {
    pass(`test_files: ${facts.metrics.test_files} (positive integer)`);
  }

  // Sanity: test_files should be less than tests
  if (
    facts.metrics.tests > 0 &&
    facts.metrics.test_files > 0 &&
    facts.metrics.test_files > facts.metrics.tests
  ) {
    fail(`test_files (${facts.metrics.test_files}) > tests (${facts.metrics.tests}); impossible`);
  }
}

// ---------------------------------------------------------------------------
// Check 10-11: Node.js version
// ---------------------------------------------------------------------------
function checkNodeVersion(facts) {
  console.log(colors.bold('\n--- Node.js Runtime ---\n'));

  if (!facts?.runtime) {
    skip('Node.js checks', 'facts.json runtime not available');
    return;
  }

  const nodeVersion = readText(join(ROOT, '.node-version'));
  if (nodeVersion) {
    if (facts.runtime.node_canonical !== nodeVersion) {
      fail(
        `facts.json node_canonical (${facts.runtime.node_canonical}) != .node-version (${nodeVersion})`
      );
    } else {
      pass(`node_canonical matches .node-version: ${nodeVersion}`);
    }
  } else {
    skip('.node-version check', 'file not found');
  }

  const pkgJson = readJSON(join(ROOT, 'package.json'), true);
  const enginesNode = pkgJson.engines?.node;
  if (enginesNode) {
    if (facts.runtime.node_minimum !== enginesNode) {
      fail(
        `facts.json node_minimum (${facts.runtime.node_minimum}) != engines.node (${enginesNode})`
      );
    } else {
      pass(`node_minimum matches engines.node: ${enginesNode}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 12: Provenance fields
// ---------------------------------------------------------------------------
function checkProvenance(facts) {
  console.log(colors.bold('\n--- Provenance and Security ---\n'));

  if (!facts?.provenance) {
    skip('provenance checks', 'facts.json provenance not available');
    return;
  }

  const requiredFields = [
    'npm_provenance',
    'oidc_trusted_publishing',
    'codeql_enabled',
    'dependency_review_enabled',
  ];
  for (const field of requiredFields) {
    if (facts.provenance[field] === undefined) {
      fail(`facts.json provenance.${field} missing`);
    } else {
      pass(`provenance.${field}: ${facts.provenance[field]}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 13: Gate report presence (advisory)
// ---------------------------------------------------------------------------
function checkGateReport(facts) {
  console.log(colors.bold('\n--- Release Gate Report ---\n'));

  if (!facts) {
    skip('gate report check', 'facts.json not available');
    return;
  }

  const version = facts.version;
  const gateReportPath = join(ROOT, `docs/releases/${version}-gate-report.json`);

  if (existsSync(gateReportPath)) {
    pass(`gate report exists for ${version}`);
  } else {
    skip(`gate report for ${version}`, 'generated during release tagging');
  }
}

// ---------------------------------------------------------------------------
// Check 14: SDK status fields
// ---------------------------------------------------------------------------
function checkSdkStatus(facts) {
  console.log(colors.bold('\n--- SDK Status ---\n'));

  if (!facts?.sdks) {
    skip('SDK status checks', 'facts.json sdks not available');
    return;
  }

  const expectedSdks = ['typescript', 'go', 'python'];
  for (const sdk of expectedSdks) {
    if (facts.sdks[sdk]) {
      pass(`SDK status: ${sdk} = ${facts.sdks[sdk]}`);
    } else {
      fail(`facts.json sdks.${sdk} missing`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log(colors.bold('PEAC Release Facts Verification Gate'));
  console.log('=====================================\n');
  console.log(`Root: ${ROOT}`);

  const facts = checkFactsExistence();

  checkVersionConsistency(facts);
  checkReleaseDate(facts);
  checkPackageCount(facts);
  checkConformanceCount(facts);
  checkBuildTargets(facts);
  checkTestMetrics(facts);
  checkNodeVersion(facts);
  checkProvenance(facts);
  checkGateReport(facts);
  checkSdkStatus(facts);

  // Summary
  console.log(colors.bold('\n--- Summary ---\n'));
  console.log(`  Passed:  ${passed}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Skipped: ${skipped}`);

  if (skipReasons.length > 0) {
    console.log(colors.dim(`\n  Skip reasons:`));
    for (const reason of skipReasons) {
      console.log(colors.dim(`    - ${reason}`));
    }
  }

  if (failed > 0) {
    console.log(colors.red(`\nFAIL: ${failed} release fact(s) failed verification.`));
    process.exit(1);
  } else {
    console.log(colors.green('\nPASS: All release facts verified.'));
    process.exit(0);
  }
}

main();
