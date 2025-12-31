#!/usr/bin/env npx tsx
/**
 * Tarball Smoke Test
 *
 * Verifies that the published package works correctly:
 * 1. Packs the package into a tarball
 * 2. Installs the tarball in a temp directory
 * 3. Imports and uses the package
 * 4. Verifies no runtime fs/YAML dependencies
 *
 * Usage:
 *   npx tsx scripts/tarball-smoke-test.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

const PACKAGE_DIR = path.join(__dirname, '..');

function log(msg: string): void {
  console.log(`[smoke-test] ${msg}`);
}

function fail(msg: string): never {
  console.error(`[smoke-test] FAIL: ${msg}`);
  process.exit(1);
}

async function main() {
  log('Starting tarball smoke test...');

  // 1. Build the package first
  log('Building package...');
  execSync('pnpm build', { cwd: PACKAGE_DIR, stdio: 'inherit' });

  // 2. Pack the package
  log('Packing package...');
  const packOutput = execSync('pnpm pack', {
    cwd: PACKAGE_DIR,
    encoding: 'utf-8',
  }).trim();

  // pnpm pack may output multiple lines; the tarball name is the last .tgz line
  const lines = packOutput.split('\n').map((l) => l.trim());
  const tarballName = lines.find((l) => l.endsWith('.tgz'));
  if (!tarballName) {
    fail(`No .tgz file found in pack output: ${packOutput}`);
  }

  const tarballPath = path.join(PACKAGE_DIR, tarballName);
  if (!fs.existsSync(tarballPath)) {
    fail(`Tarball not found: ${tarballPath}`);
  }
  log(`Created tarball: ${tarballName}`);

  // 3. Create temp directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-kit-smoke-'));
  log(`Created temp dir: ${tempDir}`);

  try {
    // 4. Create a minimal package.json
    const testPackageJson = {
      name: 'smoke-test',
      version: '1.0.0',
      type: 'module',
      dependencies: {
        '@peac/policy-kit': `file:${tarballPath}`,
      },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(testPackageJson, null, 2));

    // 5. Install the tarball
    log('Installing tarball...');
    execSync('npm install', { cwd: tempDir, stdio: 'inherit' });

    // 6. Create test script
    const testScript = `
import {
  listProfiles,
  loadProfile,
  evaluate,
  parsePolicy,
  enforceDecision,
  PROFILE_IDS,
  PROFILES,
} from '@peac/policy-kit';

// Test 1: List profiles (at least 1, matches PROFILE_IDS)
const profiles = listProfiles();
if (!Array.isArray(profiles) || profiles.length === 0) {
  console.error('FAIL: listProfiles() returned empty or invalid array');
  process.exit(1);
}
if (profiles.length !== PROFILE_IDS.length) {
  console.error('FAIL: listProfiles() count does not match PROFILE_IDS');
  process.exit(1);
}
console.log('PASS: listProfiles() returned', profiles.length, 'profiles');

// Test 2: Load a profile
const profile = loadProfile('news-media');
if (!profile || profile.id !== 'news-media') {
  console.error('FAIL: loadProfile("news-media") returned invalid data');
  process.exit(1);
}
console.log('PASS: loadProfile("news-media") returned valid profile');

// Test 3: Profile has expected structure
if (profile.policy.defaults.decision !== 'deny') {
  console.error('FAIL: news-media profile should have deny default');
  process.exit(1);
}
console.log('PASS: Profile has expected structure');

// Test 4: PROFILES constant is populated
if (!PROFILES['news-media'] || !PROFILES['open-source']) {
  console.error('FAIL: PROFILES constant not populated');
  process.exit(1);
}
console.log('PASS: PROFILES constant is populated');

// Test 5: Evaluate works
const policy = parsePolicy(\`
version: "peac-policy/0.1"
defaults:
  decision: allow
rules: []
\`);
const result = evaluate(policy, { purpose: 'crawl' });
if (result.decision !== 'allow') {
  console.error('FAIL: evaluate() returned wrong decision');
  process.exit(1);
}
console.log('PASS: evaluate() works correctly');

// Test 6: Enforce decision
const enforcement = enforceDecision('review', { receiptVerified: false });
if (enforcement.allowed !== false || enforcement.statusCode !== 402) {
  console.error('FAIL: enforceDecision() returned wrong result');
  process.exit(1);
}
console.log('PASS: enforceDecision() works correctly');

console.log('\\nAll smoke tests passed!');
`;

    fs.writeFileSync(path.join(tempDir, 'test.mjs'), testScript);

    // 7. Run test script
    log('Running smoke test...');
    execSync('node test.mjs', { cwd: tempDir, stdio: 'inherit' });

    log('Smoke test PASSED!');
  } finally {
    // Cleanup
    log('Cleaning up...');
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(tarballPath, { force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
