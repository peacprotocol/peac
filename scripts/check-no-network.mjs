#!/usr/bin/env node
/**
 * No-Network Guard (DD-55 SSRF hardening)
 *
 * Scans ALLOWLISTED directories for disallowed network I/O APIs.
 * All content in these paths must be pre-fetched; no runtime network
 * calls are permitted.
 *
 * Allowlist-based: only directories explicitly listed in MUST_BE_OFFLINE
 * are scanned. New examples or mapping packages that must be network-free
 * should be added to the allowlist. Directories not listed are not checked.
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

// -----------------------------------------------------------------------
// ALLOWLIST: directories that MUST be network-free.
// Add new observation examples and observation-layer mapping packages here.
// -----------------------------------------------------------------------
const MUST_BE_OFFLINE = [
  // Observation examples (pre-fetched content only, DD-55)
  'examples/content-signals',
  'examples/a2a-gateway-pattern',
  'examples/hello-world',

  // Observation-layer mapping packages (parsers, no I/O per DD-141)
  'packages/mappings/content-signals',
  'packages/mappings/aipref',
];

// Excluded subdirectories (never scan these)
const EXCLUDED = new Set(['node_modules', 'dist', '.turbo', '.next', 'coverage', '__snapshots__']);

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

// --- Main ---

console.log('PEAC Protocol - No-Network Guard (DD-55)');
console.log('=========================================');
console.log('');

const violations = [];
const scanned = [];

for (const dir of MUST_BE_OFFLINE) {
  const absDir = join(ROOT, dir);
  if (!existsSync(absDir)) continue;

  scanned.push(dir);
  const files = collectFiles(absDir);

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    const rel = relative(ROOT, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip comment lines (single-line, block comment start, and continuations)
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      for (const { regex, desc } of PATTERNS) {
        if (regex.test(line)) {
          violations.push({ file: rel, line: i + 1, api: desc, text: trimmed });
        }
      }
    }
  }
}

if (violations.length === 0) {
  console.log('OK: No network I/O APIs found in allowlisted paths.');
  console.log(`Scanned: ${scanned.join(', ')}`);
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
  console.log('To add a new directory to the allowlist, edit MUST_BE_OFFLINE in this script.');
  process.exit(1);
}
