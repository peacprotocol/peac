#!/usr/bin/env node
/**
 * Single source of truth Unicode scanner for PEAC repository.
 *
 * Uses `git ls-files` to enumerate tracked files -- no hardcoded directories.
 * This prevents scanner drift where files in .github/, dotfiles, or new
 * directories escape the check.
 *
 * Usage:
 *   node scripts/sanitize-unicode.mjs          # check only (exit 1 if found)
 *   node scripts/sanitize-unicode.mjs --fix    # strip in place
 *
 * Characters detected/stripped:
 *   U+200B-200F  ZWSP, ZWNJ, ZWJ, LRM, RLM
 *   U+202A-202E  Bidi embedding controls
 *   U+2066-2069  Bidi isolate controls
 *   U+00A0       NBSP (replaced with normal space in --fix mode)
 *   U+00AD       Soft hyphen
 *   U+FEFF       BOM / ZWNBSP
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { extname } from 'node:path';

// Text file extensions to scan (binary files are skipped)
const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.yml', '.yaml',
  '.sh', '.bash',
  '.html', '.css',
  '.toml', '.cfg', '.conf',
  '.env', '.env.example',
  '.txt',
]);

// Files with no extension that should be scanned
const DOTFILES = new Set([
  '.prettierignore', '.gitignore', '.eslintignore',
  '.npmignore', '.dockerignore', '.editorconfig',
]);

// Regex matching problematic invisible/bidi characters
const PROBLEMATIC_RE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u00A0\u00AD\uFEFF]/g;

const fix = process.argv.includes('--fix');

// Enumerate all git-tracked files
let gitFiles;
try {
  gitFiles = execSync('git ls-files', { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    .trim()
    .split('\n')
    .filter(Boolean);
} catch {
  console.error('ERROR: git ls-files failed. Are you in a git repository?');
  process.exit(2);
}

// Filter to text files
const files = gitFiles.filter((f) => {
  const ext = extname(f);
  const basename = f.split('/').pop() || '';
  if (TEXT_EXTS.has(ext)) return true;
  if (DOTFILES.has(basename)) return true;
  // Also check files with no extension if they look like config
  if (!ext && basename.startsWith('.')) return true;
  return false;
});

let found = 0;
let filesAffected = 0;

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf-8');
  } catch {
    continue; // Skip unreadable files
  }

  const matches = content.match(PROBLEMATIC_RE);
  if (!matches) continue;

  found += matches.length;
  filesAffected++;

  if (fix) {
    const cleaned = content
      .replace(/\u00A0/g, ' ') // NBSP -> normal space
      .replace(PROBLEMATIC_RE, ''); // strip the rest
    writeFileSync(file, cleaned, 'utf-8');
    console.log(`  fixed: ${file} (${matches.length} chars)`);
  } else {
    // Show locations for debugging
    const lines = content.split('\n');
    const locations = [];
    for (let ln = 0; ln < lines.length; ln++) {
      for (let col = 0; col < lines[ln].length; col++) {
        if (PROBLEMATIC_RE.test(lines[ln][col])) {
          PROBLEMATIC_RE.lastIndex = 0; // Reset regex state
          locations.push(`${ln + 1}:${col + 1} U+${lines[ln].charCodeAt(col).toString(16).toUpperCase().padStart(4, '0')}`);
        }
      }
    }
    console.log(`  ${file}: ${matches.length} problematic char(s)`);
    for (const loc of locations.slice(0, 5)) {
      console.log(`    ${loc}`);
    }
    if (locations.length > 5) {
      console.log(`    ... and ${locations.length - 5} more`);
    }
  }
}

if (found === 0) {
  console.log(`OK: No hidden/bidi Unicode characters found (scanned ${files.length} files)`);
  process.exit(0);
} else if (fix) {
  console.log(`Sanitized ${found} character(s) across ${filesAffected} file(s)`);
  process.exit(0);
} else {
  console.log(`ERROR: ${found} hidden/bidi Unicode character(s) in ${filesAffected} file(s). Run with --fix to strip.`);
  process.exit(1);
}
