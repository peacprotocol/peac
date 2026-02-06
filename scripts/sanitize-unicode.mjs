#!/usr/bin/env node
/**
 * Strip problematic hidden/bidi Unicode characters from source files.
 *
 * Usage:
 *   node scripts/sanitize-unicode.mjs          # check only (exit 1 if found)
 *   node scripts/sanitize-unicode.mjs --fix    # strip in place
 *
 * Targets: .ts, .tsx, .js, .json, .md, .yml, .yaml files in tracked dirs.
 * Characters removed: ZWSP, bidi controls, NBSP, soft hyphen, BOM/ZWNBSP.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOTS = ['package.json', 'packages', 'apps', 'specs', 'docs'];
const EXTS = new Set(['.ts', '.tsx', '.js', '.json', '.md', '.yml', '.yaml']);

// Regex matching problematic invisible/bidi characters
// eslint-disable-next-line no-control-regex
const PROBLEMATIC_RE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u00A0\u00AD\uFEFF]/g;

const fix = process.argv.includes('--fix');

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      results.push(...walk(full));
    } else if (entry.isFile() && EXTS.has(extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

let found = 0;
const files = [];

for (const root of ROOTS) {
  try {
    const st = statSync(root);
    if (st.isFile()) {
      files.push(root);
    } else if (st.isDirectory()) {
      files.push(...walk(root));
    }
  } catch {
    // Root does not exist, skip
  }
}

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const matches = content.match(PROBLEMATIC_RE);
  if (!matches) continue;

  found += matches.length;

  if (fix) {
    const cleaned = content
      .replace(/\u00A0/g, ' ') // NBSP -> normal space
      .replace(PROBLEMATIC_RE, ''); // strip the rest
    writeFileSync(file, cleaned, 'utf-8');
    console.log(`  fixed: ${file} (${matches.length} chars)`);
  } else {
    console.log(`  ${file}: ${matches.length} problematic char(s)`);
  }
}

if (found === 0) {
  console.log('OK: No hidden/bidi Unicode characters found');
  process.exit(0);
} else if (fix) {
  console.log(`Sanitized ${found} character(s) across ${files.length} file(s)`);
  process.exit(0);
} else {
  console.log(`ERROR: ${found} hidden/bidi Unicode character(s) found. Run with --fix to strip.`);
  process.exit(1);
}
