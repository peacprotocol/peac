#!/usr/bin/env node
/**
 * Package Exports Validation
 * Tests that published packages work with both CJS require() and ESM import()
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const PACKAGES_TO_TEST = [
  '@peac/kernel',
  '@peac/schema',
  '@peac/telemetry',
];

let failures = 0;

console.log('Testing package exports...\n');

for (const pkg of PACKAGES_TO_TEST) {
  const pkgPath = pkg.replace('@peac/', '');
  const distPath = join(rootDir, 'packages', pkgPath, 'dist', 'index.js');

  // Test CJS require
  try {
    const cjsModule = require(distPath);
    const exportCount = Object.keys(cjsModule).length;
    console.log(`[PASS] ${pkg} CJS require() - ${exportCount} exports`);
  } catch (err) {
    console.error(`[FAIL] ${pkg} CJS require() - ${err.message}`);
    failures++;
  }

  // Test ESM import
  try {
    const esmModule = await import(distPath);
    const exportCount = Object.keys(esmModule).length;
    console.log(`[PASS] ${pkg} ESM import() - ${exportCount} exports`);
  } catch (err) {
    console.error(`[FAIL] ${pkg} ESM import() - ${err.message}`);
    failures++;
  }
}

console.log(`\n${failures === 0 ? 'All tests passed!' : `${failures} failures`}`);
process.exit(failures > 0 ? 1 : 0);
