#!/usr/bin/env node

/**
 * Spec Drift and Coherence Gate
 *
 * Verifies that documentation, code, and repo metadata match canonical truth.
 *
 * Existing checks (advisory):
 * 1. Header names in docs match canonical headers
 * 2. Purpose tokens in docs match canonical tokens
 * 3. Reason values in docs match canonical values
 *
 * Existing checks (blocking):
 * 4. Forbidden patterns (RFC 6648 violations, casing)
 *
 * New coherence checks (blocking, v0.12.7):
 * 5. Surface classification completeness (every workspace member in REPO_SURFACE_STATUS.json)
 * 6. Default-path truth (no doc/guide/example teaches peac-receipt/0.1 as default)
 * 7. x402 repo references (no coinbase/x402 in active scope)
 * 8. Release manifest consistency (current.json version matches package.json)
 * 9. Generated status doc drift (scripts/generate-surface-status.mjs --check)
 *
 * Exit codes:
 * - 0: All checks passed
 * - 1: Drift detected (blocking issues)
 * - 2: Script error (file not found, parse error)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function loadCanonicalConstants() {
  const constantsPath = join(ROOT, 'specs/kernel/constants.json');
  if (!existsSync(constantsPath)) {
    console.error(colors.red(`ERROR: ${constantsPath} not found`));
    process.exit(2);
  }
  try {
    return JSON.parse(readFileSync(constantsPath, 'utf-8'));
  } catch (error) {
    console.error(colors.red(`ERROR: Failed to parse constants.json: ${error.message}`));
    process.exit(2);
  }
}

function checkFileContains(filePath, expectedValues, valueName) {
  const fullPath = join(ROOT, filePath);
  if (!existsSync(fullPath)) {
    return { file: filePath, status: 'skip', reason: 'File not found' };
  }
  const content = readFileSync(fullPath, 'utf-8');
  const missing = expectedValues.filter((v) => !content.includes(v));
  if (missing.length > 0) {
    return { file: filePath, status: 'warn', reason: `Missing ${valueName}: ${missing.join(', ')}` };
  }
  return { file: filePath, status: 'pass' };
}

// --- Advisory checks (existing) ---

function verifyHeaders(constants) {
  console.log(colors.bold('\n--- Checking Header Names ---\n'));
  const headerNames = [
    constants.headers.receipt,
    constants.headers.purpose,
    constants.headers.purpose_applied,
    constants.headers.purpose_reason,
    constants.headers.dpop,
  ].filter(Boolean);
  for (const file of ['docs/specs/PROTOCOL-BEHAVIOR.md', 'packages/kernel/src/constants.ts']) {
    const result = checkFileContains(file, headerNames, 'headers');
    if (result.status === 'warn') console.log(colors.yellow(`  WARN: ${result.file} - ${result.reason}`));
    else if (result.status === 'skip') console.log(colors.yellow(`  SKIP: ${result.file} - ${result.reason}`));
    else console.log(colors.green(`  PASS: ${result.file}`));
  }
}

function verifyPurposeTokens(constants) {
  console.log(colors.bold('\n--- Checking Purpose Tokens ---\n'));
  if (!constants.purpose?.canonical_tokens) {
    console.log(colors.yellow('  SKIP: No purpose tokens in constants.json'));
    return;
  }
  for (const file of ['docs/specs/PROTOCOL-BEHAVIOR.md']) {
    const result = checkFileContains(file, constants.purpose.canonical_tokens, 'purpose tokens');
    if (result.status === 'warn') console.log(colors.yellow(`  WARN: ${result.file} - ${result.reason}`));
    else if (result.status === 'skip') console.log(colors.yellow(`  SKIP: ${result.file}`));
    else console.log(colors.green(`  PASS: ${result.file}`));
  }
}

function verifyReasonValues(constants) {
  console.log(colors.bold('\n--- Checking Reason Values ---\n'));
  if (!constants.purpose?.reason_values) {
    console.log(colors.yellow('  SKIP: No reason values in constants.json'));
    return;
  }
  for (const file of ['docs/specs/PROTOCOL-BEHAVIOR.md']) {
    const result = checkFileContains(file, constants.purpose.reason_values, 'reason values');
    if (result.status === 'warn') console.log(colors.yellow(`  WARN: ${result.file} - ${result.reason}`));
    else if (result.status === 'skip') console.log(colors.yellow(`  SKIP: ${result.file}`));
    else console.log(colors.green(`  PASS: ${result.file}`));
  }
}

// --- Blocking checks (existing) ---

function verifyNoForbiddenPatterns() {
  console.log(colors.bold('\n--- Checking Forbidden Patterns ---\n'));
  const forbiddenPatterns = [
    { pattern: 'Peac-Receipt', description: 'Incorrect casing (should be PEAC-Receipt)' },
    { pattern: 'X-PEAC-', description: 'RFC 6648 violation (no X- prefix)' },
  ];
  const filesToCheck = [
    'docs/specs/PROTOCOL-BEHAVIOR.md',
    'packages/kernel/src/constants.ts',
    'packages/protocol/src/issue.ts',
  ];
  let hasIssues = false;
  for (const { pattern, description } of forbiddenPatterns) {
    for (const file of filesToCheck) {
      const fullPath = join(ROOT, file);
      if (!existsSync(fullPath)) continue;
      if (readFileSync(fullPath, 'utf-8').includes(pattern)) {
        console.log(colors.red(`  FAIL: ${file} - Found "${pattern}" (${description})`));
        hasIssues = true;
      }
    }
  }
  if (!hasIssues) console.log(colors.green('  PASS: No forbidden patterns'));
  return hasIssues;
}

// --- New blocking checks (v0.12.7) ---

function verifySurfaceClassification() {
  console.log(colors.bold('\n--- Surface Classification Completeness ---\n'));
  const statusPath = join(ROOT, 'REPO_SURFACE_STATUS.json');
  if (!existsSync(statusPath)) {
    console.log(colors.yellow('  SKIP: REPO_SURFACE_STATUS.json not found (created in PR1)'));
    return false;
  }
  const status = JSON.parse(readFileSync(statusPath, 'utf-8'));
  const classified = new Set(Object.keys(status.surfaces));

  // Find all workspace members with package.json
  let workspaceMembers;
  try {
    const output = execSync(
      'find packages apps surfaces -name "package.json" -maxdepth 4 -not -path "*/node_modules/*" -not -path "*/dist/*" 2>/dev/null',
      { cwd: ROOT, encoding: 'utf-8' },
    );
    workspaceMembers = output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((p) => p.replace('/package.json', ''));
  } catch {
    console.log(colors.yellow('  SKIP: Could not enumerate workspace members'));
    return false;
  }

  const missing = workspaceMembers.filter((m) => !classified.has(m));
  if (missing.length > 0) {
    console.log(colors.red(`  FAIL: ${missing.length} unclassified workspace members:`));
    for (const m of missing) console.log(colors.red(`    - ${m}`));
    return true;
  }
  console.log(colors.green(`  PASS: ${classified.size} surfaces classified, 0 missing`));
  return false;
}

function verifyDefaultPathTruth() {
  console.log(colors.bold('\n--- Default Path Truth (no legacy default) ---\n'));
  // Check docs and guides for peac-receipt/0.1 taught as default (not marked legacy/frozen/compat)
  const docsToCheck = [
    'docs/guides/quickstart-api-provider.md',
    'docs/guides/quickstart-agent-operator.md',
    'docs/START_HERE.md',
    'docs/specs/PEAC-ISSUER.md',
    'docs/specs/DISCOVERY-PROFILE.md',
    'README.md',
  ];
  let hasIssues = false;
  for (const file of docsToCheck) {
    const fullPath = join(ROOT, file);
    if (!existsSync(fullPath)) continue;
    const content = readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('peac-receipt/0.1') && !line.toLowerCase().includes('legacy') && !line.toLowerCase().includes('frozen') && !line.toLowerCase().includes('compat')) {
        console.log(colors.red(`  FAIL: ${file}:${i + 1} teaches peac-receipt/0.1 without legacy/frozen context`));
        hasIssues = true;
      }
    }
  }

  // Check for old example path regression
  try {
    const output = execSync(
      "git grep -n 'wire-02-minimal' -- 'README.md' 'docs/**/*.md' 'integrator-kits/**/*.md' 2>/dev/null || true",
      { cwd: ROOT, encoding: 'utf-8' },
    );
    if (output.trim()) {
      console.log(colors.red('  FAIL: wire-02-minimal references found (renamed to examples/minimal):'));
      for (const line of output.trim().split('\n')) {
        console.log(colors.red(`    ${line}`));
      }
      hasIssues = true;
    }
  } catch {
    // git grep not available or no matches
  }

  if (!hasIssues) console.log(colors.green('  PASS: No legacy defaults or stale paths found'));
  return hasIssues;
}

function verifyX402References() {
  console.log(colors.bold('\n--- x402 Repo References ---\n'));
  // Check active scope only (not reference/, archive/, node_modules/)
  const activeGlobs = [
    '.github/workflows/*.yml',
    'packages/adapters/x402/src/*.ts',
    'docs/specs/*.md',
    'integrator-kits/x402/README.md',
    'specs/upstream/x402/*.json',
  ];
  let found = false;
  for (const glob of activeGlobs) {
    try {
      const output = execSync(`git grep -n "coinbase/x402" -- '${glob}' 2>/dev/null || true`, {
        cwd: ROOT,
        encoding: 'utf-8',
      });
      if (output.trim()) {
        console.log(colors.red(`  FAIL: coinbase/x402 found in active scope (must use x402-foundation/x402):`));
        for (const line of output.trim().split('\n')) {
          console.log(colors.red(`    ${line}`));
        }
        found = true;
      }
    } catch {
      // git grep returns non-zero when no matches, that's fine
    }
  }
  if (!found) console.log(colors.green('  PASS: No coinbase/x402 in active scope'));
  return found;
}

function verifyReleaseManifest() {
  console.log(colors.bold('\n--- Release Manifest Consistency ---\n'));
  const currentPath = join(ROOT, 'docs/releases/current.json');
  const pkgPath = join(ROOT, 'package.json');
  if (!existsSync(currentPath)) {
    console.log(colors.yellow('  SKIP: docs/releases/current.json not found'));
    return false;
  }
  const current = JSON.parse(readFileSync(currentPath, 'utf-8'));
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  if (current.version !== pkg.version) {
    console.log(colors.red(`  FAIL: current.json version (${current.version}) != package.json version (${pkg.version})`));
    return true;
  }
  console.log(colors.green(`  PASS: versions match (${current.version})`));
  return false;
}

function verifyGeneratedStatusDocs() {
  console.log(colors.bold('\n--- Generated Status Doc Drift ---\n'));
  const generatorPath = join(ROOT, 'scripts/generate-surface-status.mjs');
  if (!existsSync(generatorPath)) {
    console.log(colors.yellow('  SKIP: scripts/generate-surface-status.mjs not found (created in PR1)'));
    return false;
  }
  try {
    execSync('node scripts/generate-surface-status.mjs --check', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
    console.log(colors.green('  PASS: Generated status docs match JSON'));
    return false;
  } catch (e) {
    console.log(colors.red('  FAIL: Generated status docs have drifted from REPO_SURFACE_STATUS.json'));
    console.log(colors.red(`  ${e.stderr || e.stdout || 'Run: node scripts/generate-surface-status.mjs'}`));
    return true;
  }
}

// --- Main ---

function main() {
  console.log(colors.bold('PEAC Coherence Gate'));
  console.log('===================\n');
  console.log(`Root: ${ROOT}`);

  const constants = loadCanonicalConstants();
  console.log(`Loaded constants.json (version ${constants.version})`);

  let hasBlockingIssues = false;

  // Advisory checks (existing)
  verifyHeaders(constants);
  verifyPurposeTokens(constants);
  verifyReasonValues(constants);

  // Blocking checks (existing)
  if (verifyNoForbiddenPatterns()) hasBlockingIssues = true;

  // Blocking checks (new, v0.12.7)
  if (verifySurfaceClassification()) hasBlockingIssues = true;
  if (verifyDefaultPathTruth()) hasBlockingIssues = true;
  if (verifyX402References()) hasBlockingIssues = true;
  if (verifyReleaseManifest()) hasBlockingIssues = true;
  if (verifyGeneratedStatusDocs()) hasBlockingIssues = true;

  // Summary
  console.log(colors.bold('\n--- Summary ---\n'));
  if (hasBlockingIssues) {
    console.log(colors.red('FAIL: Coherence issues detected. Fix the blocking issues above.'));
    process.exit(1);
  } else {
    console.log(colors.green('PASS: All coherence checks passed.'));
    process.exit(0);
  }
}

main();
