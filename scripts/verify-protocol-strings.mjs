#!/usr/bin/env node

/**
 * Drift Guard: Protocol String Verification
 *
 * Ensures canonical protocol strings are used consistently across the codebase.
 * Fails CI if forbidden patterns are detected.
 *
 * Forbidden patterns:
 * - "Peac-Receipt" (incorrect casing - must be "PEAC-Receipt")
 * - "X-PEAC-" (RFC 6648 deprecates X- prefixes for new headers)
 *
 * @see docs/specs/PROTOCOL-BEHAVIOR.md Section 7 (Header Semantics)
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// Forbidden patterns and their explanations
const FORBIDDEN_PATTERNS = [
  {
    pattern: 'Peac-Receipt',
    message: 'Incorrect casing. Use "PEAC-Receipt" (all caps PEAC).',
    caseSensitive: true,
  },
  {
    pattern: 'X-PEAC-',
    message: 'RFC 6648 deprecates X- prefixes. Use "PEAC-" headers instead.',
    caseSensitive: false,
  },
];

// Directories/files to exclude from search
const EXCLUDE_GLOBS = [
  'node_modules/**',
  'dist/**',
  'build/**',
  '.git/**',
  'archive/**',
  '*.lock',
  'pnpm-lock.yaml',
  'package-lock.json',
  // Exclude verification scripts (they check FOR these patterns)
  'scripts/verify-protocol-strings.mjs',
  'scripts/verify-spec-drift.mjs',
  // Exclude historical documentation (CHANGELOG mentions removed headers)
  'CHANGELOG.md',
  // Exclude docs that explicitly say "don't use X-PEAC" (informational, not usage)
  'docs/api-reference.md',
  'docs/engineering-guide.md',
  // Private worker surfaces (pre-existing issues - tracked separately)
  'surfaces/workers/**',
  // Private Next.js middleware surface (pre-existing issues - tracked separately)
  'surfaces/nextjs/**',
  // Transport packages (gRPC metadata keys use lowercase - tracked separately)
  'packages/transport/**',
  // Pre-release verification script (checks FOR X-PEAC patterns)
  'scripts/pre-release-verify.sh',
];

/**
 * Search for a pattern using ripgrep (rg) or grep as fallback
 * @param {string} pattern - Pattern to search for
 * @param {boolean} caseSensitive - Whether search is case-sensitive
 * @returns {{ file: string, line: number, content: string }[]}
 */
function searchPattern(pattern, caseSensitive) {
  const excludeArgs = EXCLUDE_GLOBS.map((g) => `--glob '!${g}'`).join(' ');
  const caseFlag = caseSensitive ? '' : '-i';

  // Try ripgrep first (faster, respects .gitignore)
  try {
    const cmd = `rg ${caseFlag} --line-number --no-heading ${excludeArgs} '${pattern}' ${ROOT_DIR} 2>/dev/null || true`;
    const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    return parseRipgrepOutput(output);
  } catch {
    // Fallback to grep
    try {
      const grepCaseFlag = caseSensitive ? '' : '-i';
      const cmd = `grep -rn ${grepCaseFlag} '${pattern}' ${ROOT_DIR} --include='*.ts' --include='*.js' --include='*.mjs' --include='*.json' --include='*.md' --include='*.yaml' --include='*.yml' 2>/dev/null || true`;
      const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      return parseGrepOutput(output);
    } catch {
      return [];
    }
  }
}

/**
 * Parse ripgrep output format: "file:line:content"
 * @param {string} output
 * @returns {{ file: string, line: number, content: string }[]}
 */
function parseRipgrepOutput(output) {
  if (!output.trim()) return [];

  return output
    .trim()
    .split('\n')
    .filter((line) => line.includes(':'))
    .map((line) => {
      const [file, lineNum, ...rest] = line.split(':');
      return {
        file: file.replace(ROOT_DIR + '/', ''),
        line: parseInt(lineNum, 10),
        content: rest.join(':').trim().slice(0, 100), // Truncate long lines
      };
    })
    .filter((match) => {
      // Filter out excluded paths that might have slipped through
      return !EXCLUDE_GLOBS.some((glob) => {
        const baseGlob = glob.replace('/**', '').replace('/*', '');
        return match.file.startsWith(baseGlob);
      });
    });
}

/**
 * Parse grep output format: "file:line:content"
 * @param {string} output
 * @returns {{ file: string, line: number, content: string }[]}
 */
function parseGrepOutput(output) {
  // Same format as ripgrep
  return parseRipgrepOutput(output);
}

/**
 * Main verification function
 */
function main() {
  console.log('Verifying protocol strings...\n');

  let hasErrors = false;
  const allMatches = [];

  for (const { pattern, message, caseSensitive } of FORBIDDEN_PATTERNS) {
    const matches = searchPattern(pattern, caseSensitive);

    if (matches.length > 0) {
      hasErrors = true;
      console.log(`FAIL: Found forbidden pattern "${pattern}"`);
      console.log(`      ${message}\n`);

      for (const match of matches) {
        console.log(`  ${match.file}:${match.line}`);
        console.log(`    ${match.content}\n`);
        allMatches.push({ pattern, ...match });
      }
    } else {
      console.log(`OK: No occurrences of "${pattern}"`);
    }
  }

  console.log('');

  if (hasErrors) {
    console.log('----------------------------------------');
    console.log('VERIFICATION FAILED');
    console.log(`Found ${allMatches.length} forbidden pattern(s).`);
    console.log('');
    console.log('Fix these issues before committing:');
    console.log('- Replace "Peac-Receipt" with "PEAC-Receipt"');
    console.log('- Replace "X-PEAC-*" with "PEAC-*" (no X- prefix)');
    console.log('----------------------------------------');
    process.exit(1);
  } else {
    console.log('----------------------------------------');
    console.log('VERIFICATION PASSED');
    console.log('All protocol strings are canonical.');
    console.log('----------------------------------------');
    process.exit(0);
  }
}

main();
