#!/usr/bin/env node
/**
 * No-Network Guard (DD-55 SSRF hardening)
 *
 * Scans example source files and observation-layer mapping packages for
 * disallowed network I/O APIs. All content in these paths must be
 * pre-fetched; no runtime network calls are permitted.
 *
 * Usage:
 *   node scripts/check-no-network.mjs
 *
 * Exit codes:
 *   0 - Clean (no network APIs found)
 *   1 - Violations found
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Directories to scan
const SCAN_DIRS = [
  'examples',
  'packages/mappings',
];

// Excluded directories (never scan these)
const EXCLUDED = new Set([
  'node_modules',
  'dist',
  '.turbo',
  '.next',
  'coverage',
  '__snapshots__',
]);

// File extensions to check
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

// Disallowed network API patterns (regex + description)
const PATTERNS = [
  { regex: /\bfetch\s*\(/, desc: 'fetch()' },
  { regex: /\bXMLHttpRequest\b/, desc: 'XMLHttpRequest' },
  { regex: /\bhttp\.request\s*\(/, desc: 'http.request()' },
  { regex: /\bhttps\.request\s*\(/, desc: 'https.request()' },
  { regex: /\bhttp\.get\s*\(/, desc: 'http.get()' },
  { regex: /\bhttps\.get\s*\(/, desc: 'https.get()' },
  { regex: /\bnet\.connect\s*\(/, desc: 'net.connect()' },
  { regex: /\bnet\.createConnection\s*\(/, desc: 'net.createConnection()' },
  { regex: /\bundici\b/, desc: 'undici' },
  { regex: /\baxios\b/, desc: 'axios' },
  { regex: /\bgot\s*\(/, desc: 'got()' },
  { regex: /\bky\s*\(/, desc: 'ky()' },
];

// Directories explicitly exempt from the no-network rule.
// Server examples and webhook demos legitimately need HTTP.
// Layer 4 adapter/mapping packages that resolve external resources are exempt.
const EXEMPT_DIRS = new Set([
  'examples/ucp-webhook-express',
  'packages/mappings/ucp',
]);

/**
 * Recursively collect source files from a directory.
 */
function collectFiles(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, files);
    } else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Check if a file path falls under an exempt directory.
 */
function isExempt(filePath) {
  const rel = relative(ROOT, filePath);
  for (const exempt of EXEMPT_DIRS) {
    if (rel.startsWith(exempt + '/') || rel === exempt) return true;
  }
  return false;
}

// --- Main ---

console.log('PEAC Protocol - No-Network Guard (DD-55)');
console.log('=========================================');
console.log('');

const violations = [];

for (const scanDir of SCAN_DIRS) {
  const absDir = join(ROOT, scanDir);
  const files = collectFiles(absDir);

  for (const file of files) {
    if (isExempt(file)) continue;

    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    const rel = relative(ROOT, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip comment lines (single-line and block comment continuations)
      const trimmed = line.trim();
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*')
      ) continue;

      for (const { regex, desc } of PATTERNS) {
        if (regex.test(line)) {
          violations.push({ file: rel, line: i + 1, api: desc, text: trimmed });
        }
      }
    }
  }
}

if (violations.length === 0) {
  console.log('OK: No network I/O APIs found in scanned paths.');
  console.log(`Scanned: ${SCAN_DIRS.join(', ')}`);
  console.log(`Exempt: ${[...EXEMPT_DIRS].join(', ')}`);
  process.exit(0);
} else {
  console.log(`FAIL: ${violations.length} network I/O violation(s) found:`);
  console.log('');
  for (const v of violations) {
    console.log(`  ${v.file}:${v.line} - ${v.api}`);
    console.log(`    ${v.text}`);
  }
  console.log('');
  console.log('All content must be pre-fetched per DD-55 (SSRF hardening).');
  console.log('If a directory legitimately needs network, add it to EXEMPT_DIRS.');
  process.exit(1);
}
