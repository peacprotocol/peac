#!/usr/bin/env node
/**
 * Public Artifact Linter
 *
 * Checks text content (commit messages, PR body files, staged files)
 * for non-technical language that should not appear in public artifacts.
 *
 * Usage:
 *   node scripts/check-public-artifacts.mjs                          # check staged files + commit msg
 *   node scripts/check-public-artifacts.mjs --body-file .tmp/pr.md   # check a PR body file
 *   node scripts/check-public-artifacts.mjs --text "some text"       # check inline text
 *
 * Pattern sources:
 *   1. Built-in patterns (objective checks, always active)
 *   2. reference/guard-denylist.txt (local-only, if present)
 *
 * Exit codes:
 *   0  No violations found
 *   1  One or more violations found
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DENYLIST_PATH = resolve(REPO_ROOT, 'reference/guard-denylist.txt');

// Built-in patterns: objective checks that are safe to have in a tracked file.
// These are standard OSS hygiene patterns, not strategy-revealing.
const BUILTIN_PATTERNS = [
  /reference\/.*_LOCAL\./i,
  /[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/, // hidden/bidi Unicode
  /MEMORY\.md/,
];

/**
 * Load additional patterns from the local-only denylist file.
 * Returns empty array if file doesn't exist (e.g., in CI).
 */
function loadDenylistPatterns() {
  if (!existsSync(DENYLIST_PATH)) {
    return [];
  }
  const content = readFileSync(DENYLIST_PATH, 'utf-8');
  const patterns = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    try {
      patterns.push(new RegExp(trimmed, 'i'));
    } catch {
      // Skip invalid regex lines
    }
  }
  return patterns;
}

/**
 * Check text against all patterns. Returns array of violations.
 */
function checkText(text, source, patterns) {
  const violations = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      if (pattern.test(lines[i])) {
        violations.push({
          source,
          line: i + 1,
          pattern: pattern.source,
          text: lines[i].trim().slice(0, 120),
        });
      }
    }
  }
  return violations;
}

/**
 * Get staged file contents (only text files).
 */
function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf-8',
      cwd: REPO_ROOT,
    });
    return output
      .split('\n')
      .filter(Boolean)
      .filter((f) => /\.(ts|js|mjs|cjs|md|json|yml|yaml|sh)$/.test(f));
  } catch {
    return [];
  }
}

function main() {
  const args = process.argv.slice(2);
  const allPatterns = [...BUILTIN_PATTERNS, ...loadDenylistPatterns()];
  const allViolations = [];

  // Check --body-file argument
  const bodyFileIdx = args.indexOf('--body-file');
  if (bodyFileIdx !== -1 && args[bodyFileIdx + 1]) {
    const bodyFile = resolve(args[bodyFileIdx + 1]);
    if (existsSync(bodyFile)) {
      const content = readFileSync(bodyFile, 'utf-8');
      allViolations.push(...checkText(content, `body-file: ${args[bodyFileIdx + 1]}`, allPatterns));
    }
  }

  // Check --text argument
  const textIdx = args.indexOf('--text');
  if (textIdx !== -1 && args[textIdx + 1]) {
    allViolations.push(...checkText(args[textIdx + 1], 'inline text', allPatterns));
  }

  // Check commit message if .git/COMMIT_EDITMSG exists
  const commitMsgPath = resolve(REPO_ROOT, '.git/COMMIT_EDITMSG');
  if (existsSync(commitMsgPath) && !args.includes('--no-commit-msg')) {
    const commitMsg = readFileSync(commitMsgPath, 'utf-8');
    allViolations.push(...checkText(commitMsg, 'commit message', allPatterns));
  }

  // Check staged files (unless --no-staged)
  if (!args.includes('--no-staged')) {
    const stagedFiles = getStagedFiles();
    for (const file of stagedFiles) {
      const fullPath = resolve(REPO_ROOT, file);
      if (!existsSync(fullPath)) continue;
      // Skip this script and the denylist
      if (file === 'scripts/check-public-artifacts.mjs') continue;
      if (file.startsWith('reference/')) continue;
      try {
        const content = readFileSync(fullPath, 'utf-8');
        allViolations.push(...checkText(content, file, allPatterns));
      } catch {
        // Skip binary or unreadable files
      }
    }
  }

  if (allViolations.length === 0) {
    if (allPatterns.length <= BUILTIN_PATTERNS.length) {
      console.log('Public artifact check: OK (built-in patterns only; local denylist not found)');
    } else {
      console.log('Public artifact check: OK');
    }
    process.exit(0);
  }

  console.error(`Public artifact check: ${allViolations.length} violation(s) found\n`);
  for (const v of allViolations) {
    console.error(`  ${v.source}:${v.line}: matched /${v.pattern}/i`);
    console.error(`    ${v.text}`);
  }
  console.error('\nFix: remove non-technical language from public artifacts.');
  process.exit(1);
}

main();
