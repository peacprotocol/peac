#!/usr/bin/env node
/**
 * Guard: Ensure no WASM imports in core bundle
 *
 * v0.9.15 decision: WASM is slower than TypeScript for micro-ops.
 * This guard prevents accidental WASM imports until v0.9.16+ batch API.
 *
 * Fails CI if:
 * - Any file in packages/core imports from core/wasm or archive/wasm
 * - Any *.wasm files in core bundle
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = join(__dirname, '../..');

const FORBIDDEN_PATTERNS = [
  /from\s+['"].*\/wasm/, // import from '*/wasm'
  /require\s*\(['"].*\/wasm/, // require('*/wasm')
  /import\s*\(['"].*\.wasm/, // dynamic import('*.wasm')
  /from\s+['"].*archive\/wasm/, // import from archive
];

const errors = [];

function scanFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const relativePath = relative(rootDir, filePath);

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      errors.push({
        file: relativePath,
        pattern: pattern.toString(),
        line: content.split('\n').findIndex((line) => pattern.test(line)) + 1,
      });
    }
  }
}

function scanDir(dir, pattern = /\.(ts|js|mjs)$/) {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules, dist, archive
      if (!['node_modules', 'dist', 'archive', '.git'].includes(entry)) {
        scanDir(fullPath, pattern);
      }
    } else if (stat.isFile() && pattern.test(entry)) {
      scanFile(fullPath);
    }
  }
}

// Scan packages/core for WASM imports
console.log('Checking for WASM imports in core packages...');
const coreDir = join(rootDir, 'packages/core');
scanDir(coreDir);

// Check for .wasm files in dist
const distDir = join(coreDir, 'dist');
try {
  scanDir(distDir, /\.wasm$/);
  if (readdirSync(distDir).some((f) => f.endsWith('.wasm'))) {
    errors.push({
      file: 'packages/core/dist/',
      pattern: '*.wasm files found in bundle',
      line: 0,
    });
  }
} catch {
  // dist may not exist yet
}

if (errors.length > 0) {
  console.error('\n❌ WASM imports detected in core bundle!\n');
  console.error('v0.9.15 decision: WASM deferred to v0.9.16+ (batch API).\n');

  errors.forEach(({ file, pattern, line }) => {
    console.error(`  ${file}:${line}`);
    console.error(`    Pattern: ${pattern}\n`);
  });

  console.error('To fix:');
  console.error('  1. Remove WASM imports from packages/core/');
  console.error('  2. Use TypeScript implementations instead');
  console.error('  3. See: archive/wasm-exploration-v0.9.15/ for context\n');

  process.exit(1);
}

console.log('✓ No WASM imports in core bundle');
