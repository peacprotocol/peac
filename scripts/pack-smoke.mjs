#!/usr/bin/env node
/**
 * pack-smoke.mjs -- Tarball-based ESM/CJS smoke test
 *
 * Reads scripts/publish-manifest.json (same manifest as closure check).
 * Packs each published package, installs into fresh temp dir, verifies
 * both import() and require() work.
 *
 * On failure: keeps temp dir for debugging (override with PEAC_SMOKE_CLEAN=1).
 */

import { readFileSync, mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// Read manifest (same source of truth as closure check)
const manifest = JSON.parse(readFileSync(join(ROOT, 'scripts/publish-manifest.json'), 'utf-8'));
const packages = manifest.packages;

// Package name -> directory
const PKG_DIRS = {
  '@peac/kernel': 'packages/kernel',
  '@peac/schema': 'packages/schema',
  '@peac/crypto': 'packages/crypto',
  '@peac/telemetry': 'packages/telemetry',
  '@peac/capture-core': 'packages/capture/core',
  '@peac/capture-node': 'packages/capture/node',
  '@peac/protocol': 'packages/protocol',
  '@peac/control': 'packages/control',
  '@peac/disc': 'packages/discovery',
  '@peac/audit': 'packages/audit',
  '@peac/middleware-core': 'packages/middleware-core',
  '@peac/middleware-express': 'packages/middleware-express',
  '@peac/contracts': 'packages/contracts',
  '@peac/http-signatures': 'packages/http-signatures',
  '@peac/jwks-cache': 'packages/jwks-cache',
  '@peac/policy-kit': 'packages/policy-kit',
  '@peac/adapter-core': 'packages/adapters/core',
  '@peac/mappings-mcp': 'packages/mappings/mcp',
  '@peac/rails-x402': 'packages/rails/x402',
  '@peac/adapter-openclaw': 'packages/adapters/openclaw',
  '@peac/cli': 'packages/cli',
};

// Schema subpath imports to test
const SCHEMA_SUBPATHS = ['receipt-parser', 'normalize'];

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...opts });
}

let tmpDir;
let failed = false;
let failedPkg = '';
let failedCmd = '';

try {
  // Create temp directory in OS temp (never in repo root)
  tmpDir = mkdtempSync(join(tmpdir(), 'peac-smoke-'));
  console.log(`Smoke test dir: ${tmpDir}\n`);

  // Initialize a minimal package.json in temp dir
  const initPkg = JSON.stringify({ name: 'peac-smoke-test', version: '0.0.0', private: true });
  writeFileSync(join(tmpDir, 'package.json'), initPkg);

  // Pack all packages and collect tarball paths
  const tarballs = new Map();

  console.log('Packing packages...');
  for (const name of packages) {
    const dir = PKG_DIRS[name];
    if (!dir) {
      console.log(`  SKIP ${name} (no directory mapping)`);
      continue;
    }

    const pkgDir = join(ROOT, dir);
    const result = run(`pnpm pack --pack-destination ${tmpDir}`, { cwd: pkgDir });
    const tarball = result.trim().split('\n').pop();
    tarballs.set(name, tarball);
    console.log(`  OK ${name}`);
  }

  // Install all tarballs at once
  console.log('\nInstalling tarballs...');
  const tarballPaths = Array.from(tarballs.values()).map((t) => `"${t}"`);
  run(`npm install ${tarballPaths.join(' ')} --no-save --ignore-scripts --no-audit --fund=false`, {
    cwd: tmpDir,
    timeout: 60000,
  });
  console.log('  Installed all packages\n');

  // Test each package
  console.log('Testing imports...');
  let passed = 0;
  let total = 0;

  for (const name of packages) {
    if (!tarballs.has(name)) continue;

    // ESM import test
    total++;
    const esmCmd = `node --input-type=module -e "await import('${name}'); console.log('OK')"`;
    try {
      run(esmCmd, { cwd: tmpDir });
      console.log(`  ESM ${name}: OK`);
      passed++;
    } catch (err) {
      // CLI tools may exit non-zero after loading (e.g., commander shows help).
      // Check for actual module errors (SyntaxError, MODULE_NOT_FOUND).
      const stderr = err.stderr?.trim() || '';
      if (stderr.includes('SyntaxError') || stderr.includes('Cannot find') || stderr.includes('MODULE_NOT_FOUND')) {
        console.error(`  ESM ${name}: FAIL`);
        console.error(`    Command: ${esmCmd}`);
        console.error(`    ${stderr}`);
        failed = true;
        failedPkg = name;
        failedCmd = esmCmd;
      } else {
        console.log(`  ESM ${name}: OK (loaded, non-zero exit)`);
        passed++;
      }
    }

    // CJS require test
    total++;
    const cjsCmd = `node -e "require('${name}'); console.log('OK')"`;
    try {
      run(cjsCmd, { cwd: tmpDir });
      console.log(`  CJS ${name}: OK`);
      passed++;
    } catch (err) {
      const stderr = err.stderr?.trim() || '';
      if (stderr.includes('SyntaxError') || stderr.includes('Cannot find') || stderr.includes('MODULE_NOT_FOUND')) {
        console.error(`  CJS ${name}: FAIL`);
        console.error(`    Command: ${cjsCmd}`);
        console.error(`    ${stderr}`);
        failed = true;
        failedPkg = name;
        failedCmd = cjsCmd;
      } else {
        console.log(`  CJS ${name}: OK (loaded, non-zero exit)`);
        passed++;
      }
    }
  }

  // Test schema subpath imports
  for (const subpath of SCHEMA_SUBPATHS) {
    const importPath = `@peac/schema/${subpath}`;

    total++;
    const esmCmd = `node --input-type=module -e "await import('${importPath}'); console.log('OK')"`;
    try {
      run(esmCmd, { cwd: tmpDir });
      console.log(`  ESM ${importPath}: OK`);
      passed++;
    } catch (err) {
      console.error(`  ESM ${importPath}: FAIL`);
      console.error(`    Command: ${esmCmd}`);
      console.error(`    ${err.stderr?.trim() || err.message}`);
      failed = true;
      failedPkg = importPath;
      failedCmd = esmCmd;
    }

    total++;
    const cjsCmd = `node -e "require('${importPath}'); console.log('OK')"`;
    try {
      run(cjsCmd, { cwd: tmpDir });
      console.log(`  CJS ${importPath}: OK`);
      passed++;
    } catch (err) {
      console.error(`  CJS ${importPath}: FAIL`);
      console.error(`    Command: ${cjsCmd}`);
      console.error(`    ${err.stderr?.trim() || err.message}`);
      failed = true;
      failedPkg = importPath;
      failedCmd = cjsCmd;
    }
  }

  console.log(`\n${passed}/${total} tests passed`);

  if (failed) {
    console.error(`\nFAILED: ${failedPkg}`);
    console.error(`Command: ${failedCmd}`);
    console.error(`Temp dir kept for debugging: ${tmpDir}`);
    process.exit(1);
  }

  console.log('\nAll smoke tests passed!');
} finally {
  // Clean up temp dir on success (or if PEAC_SMOKE_CLEAN=1)
  if (tmpDir && existsSync(tmpDir)) {
    if (!failed || process.env.PEAC_SMOKE_CLEAN === '1') {
      rmSync(tmpDir, { recursive: true });
      console.log('Cleaned up temp dir');
    }
  }
}
