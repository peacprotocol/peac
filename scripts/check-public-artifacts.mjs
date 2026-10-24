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
 * Rules: the built-in patterns below are the only source of rules. No pattern file is
 * read from any path. A finding is reported as the rule id and the location
 * (source:line); neither the matched pattern nor the offending line is printed.
 *
 * Exit codes:
 *   0  No violations found
 *   1  One or more violations found
 *   2  An input could not be read (missing value, missing or unreadable file)
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// Built-in patterns: objective checks that are safe to have in a tracked file.
// These are standard OSS hygiene patterns, not strategy-revealing.
const BUILTIN_PATTERNS = [
  /reference\/.*_LOCAL\./i,
  /[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/, // hidden/bidi Unicode
  /MEMORY\.md/,
  // Retired category tagline; never valid on any tracked artifact.
  /cryptographic receipts for agentic commerce/i,
];

// Stable ids for the patterns above, in the same order. A finding reports the id, never the pattern.
const BUILTIN_RULE_IDS = [
  'local-reference-path',
  'hidden-unicode',
  'local-memory-file',
  'retired-tagline',
];
if (BUILTIN_RULE_IDS.length !== BUILTIN_PATTERNS.length) {
  throw new Error('rule id table is out of step with the built-in patterns');
}

/**
 * Run git in the repository root without a shell. Returns stdout.
 */
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf-8', cwd: REPO_ROOT });
}

/**
 * Resolve the commit message path through git, so linked worktrees (whose git
 * directory is not <root>/.git) are found. Returns null outside a repository.
 */
function commitMessagePath() {
  try {
    return resolve(
      REPO_ROOT,
      git('rev-parse', '--git-path', 'COMMIT_EDITMSG').replace(/\r?\n$/, '')
    );
  } catch {
    return null;
  }
}

/**
 * Check text against all rules. Returns array of violations (rule id and
 * location only; the matched text and the pattern are never retained).
 */
function checkText(text, source) {
  const violations = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    BUILTIN_PATTERNS.forEach((pattern, index) => {
      if (pattern.test(lines[i])) {
        violations.push({ source, line: i + 1, rule: BUILTIN_RULE_IDS[index] });
      }
    });
  }
  return violations;
}

/**
 * Get staged file contents (only text files).
 */
function getStagedFiles() {
  try {
    const output = git('diff', '--cached', '--name-only', '--diff-filter=ACM');
    return output
      .split('\n')
      .filter(Boolean)
      .filter((f) => /\.(ts|js|mjs|cjs|md|json|yml|yaml|sh)$/.test(f));
  } catch {
    return [];
  }
}

/**
 * Fail closed: an input that was asked for but cannot be read is an error, never a pass.
 */
function failInput(message) {
  console.error(`Public artifact check: ${message}`);
  process.exit(2);
}

function main() {
  const args = process.argv.slice(2);
  const allViolations = [];

  // Check --body-file argument
  const bodyFileIdx = args.indexOf('--body-file');
  if (bodyFileIdx !== -1) {
    const bodyFileArg = args[bodyFileIdx + 1];
    if (!bodyFileArg) failInput('--body-file needs a path');
    let content;
    try {
      content = readFileSync(resolve(bodyFileArg), 'utf-8');
    } catch {
      failInput(`cannot read body file: ${bodyFileArg}`);
    }
    allViolations.push(...checkText(content, `body-file: ${bodyFileArg}`));
  }

  // Check --text argument
  const textIdx = args.indexOf('--text');
  if (textIdx !== -1) {
    const text = args[textIdx + 1];
    if (text === undefined) failInput('--text needs a value');
    if (text) allViolations.push(...checkText(text, 'inline text'));
  }

  // Check the commit message if git has one for this worktree
  const commitMsgPath = commitMessagePath();
  if (commitMsgPath && existsSync(commitMsgPath) && !args.includes('--no-commit-msg')) {
    const commitMsg = readFileSync(commitMsgPath, 'utf-8');
    allViolations.push(...checkText(commitMsg, 'commit message'));
  }

  // Check staged files (unless --no-staged)
  if (!args.includes('--no-staged')) {
    const stagedFiles = getStagedFiles();
    for (const file of stagedFiles) {
      const fullPath = resolve(REPO_ROOT, file);
      if (!existsSync(fullPath)) continue;
      // Skip this script: it defines the rules
      if (file === 'scripts/check-public-artifacts.mjs') continue;
      // Skip generated lockfiles: their resolved-package integrity hashes are
      // base64 strings whose substrings can spuriously match pattern tokens
      // (e.g., "GTM" inside a sha512 hash). Lockfiles are auto-generated by
      // pnpm/npm/yarn and have no human-authored prose to lint.
      if (
        file === 'pnpm-lock.yaml' ||
        file === 'package-lock.json' ||
        file === 'yarn.lock' ||
        file === 'npm-shrinkwrap.json'
      ) {
        continue;
      }
      try {
        const content = readFileSync(fullPath, 'utf-8');
        allViolations.push(...checkText(content, file));
      } catch {
        // Skip binary or unreadable files
      }
    }
  }

  if (allViolations.length === 0) {
    console.log('Public artifact check: OK');
    process.exit(0);
  }

  console.error(`Public artifact check: ${allViolations.length} violation(s) found\n`);
  for (const v of allViolations) {
    console.error(`  ${v.source}:${v.line}: rule ${v.rule}`);
  }
  console.error(
    '\nFix: remove the flagged content from the artifact (the rule id names the check).'
  );
  process.exit(1);
}

main();
