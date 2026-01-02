#!/usr/bin/env node

/**
 * Spec Drift Verifier
 *
 * Verifies that documentation and code match the canonical constants
 * defined in specs/kernel/constants.json.
 *
 * Checks:
 * 1. Header names in docs match canonical headers
 * 2. Purpose tokens in docs match canonical tokens
 * 3. Reason values in docs match canonical values
 *
 * Exit codes:
 * - 0: All checks passed
 * - 1: Drift detected
 * - 2: Script error (file not found, parse error)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Colors for terminal output
const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * Load canonical constants from specs/kernel/constants.json
 */
function loadCanonicalConstants() {
  const constantsPath = join(ROOT, 'specs/kernel/constants.json');

  if (!existsSync(constantsPath)) {
    console.error(colors.red(`ERROR: Canonical constants file not found: ${constantsPath}`));
    process.exit(2);
  }

  try {
    const content = readFileSync(constantsPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(colors.red(`ERROR: Failed to parse constants.json: ${error.message}`));
    process.exit(2);
  }
}

/**
 * Check if a file contains expected values
 */
function checkFileContains(filePath, expectedValues, valueName) {
  const fullPath = join(ROOT, filePath);

  if (!existsSync(fullPath)) {
    return { file: filePath, status: 'skip', reason: 'File not found' };
  }

  const content = readFileSync(fullPath, 'utf-8');
  const missing = [];
  const found = [];

  for (const value of expectedValues) {
    if (content.includes(value)) {
      found.push(value);
    } else {
      missing.push(value);
    }
  }

  if (missing.length > 0) {
    return {
      file: filePath,
      status: 'warn',
      reason: `Missing ${valueName}: ${missing.join(', ')}`,
      found,
      missing,
    };
  }

  return { file: filePath, status: 'pass', found };
}

/**
 * Verify header names are consistent
 */
function verifyHeaders(constants) {
  console.log(colors.bold('\n--- Checking Header Names ---\n'));

  const headerNames = [
    constants.headers.receipt,
    constants.headers.purpose,
    constants.headers.purpose_applied,
    constants.headers.purpose_reason,
    constants.headers.dpop,
  ].filter(Boolean);

  const filesToCheck = [
    'docs/specs/PROTOCOL-BEHAVIOR.md',
    'packages/kernel/src/constants.ts',
  ];

  let hasIssues = false;

  for (const file of filesToCheck) {
    const result = checkFileContains(file, headerNames, 'headers');

    if (result.status === 'skip') {
      console.log(colors.yellow(`  SKIP: ${result.file} - ${result.reason}`));
    } else if (result.status === 'warn') {
      console.log(colors.yellow(`  WARN: ${result.file}`));
      console.log(colors.yellow(`        ${result.reason}`));
      // This is advisory, not blocking
    } else {
      console.log(colors.green(`  PASS: ${result.file}`));
    }
  }

  return hasIssues;
}

/**
 * Verify purpose tokens are consistent
 */
function verifyPurposeTokens(constants) {
  console.log(colors.bold('\n--- Checking Purpose Tokens ---\n'));

  if (!constants.purpose || !constants.purpose.canonical_tokens) {
    console.log(colors.yellow('  SKIP: No purpose tokens defined in constants.json'));
    return false;
  }

  const canonicalTokens = constants.purpose.canonical_tokens;

  const filesToCheck = [
    'docs/specs/PROTOCOL-BEHAVIOR.md',
  ];

  let hasIssues = false;

  for (const file of filesToCheck) {
    const result = checkFileContains(file, canonicalTokens, 'purpose tokens');

    if (result.status === 'skip') {
      console.log(colors.yellow(`  SKIP: ${result.file} - ${result.reason}`));
    } else if (result.status === 'warn') {
      console.log(colors.yellow(`  WARN: ${result.file}`));
      console.log(colors.yellow(`        ${result.reason}`));
    } else {
      console.log(colors.green(`  PASS: ${result.file} - all tokens present`));
    }
  }

  return hasIssues;
}

/**
 * Verify reason values are consistent
 */
function verifyReasonValues(constants) {
  console.log(colors.bold('\n--- Checking Reason Values ---\n'));

  if (!constants.purpose || !constants.purpose.reason_values) {
    console.log(colors.yellow('  SKIP: No reason values defined in constants.json'));
    return false;
  }

  const reasonValues = constants.purpose.reason_values;

  const filesToCheck = [
    'docs/specs/PROTOCOL-BEHAVIOR.md',
  ];

  let hasIssues = false;

  for (const file of filesToCheck) {
    const result = checkFileContains(file, reasonValues, 'reason values');

    if (result.status === 'skip') {
      console.log(colors.yellow(`  SKIP: ${result.file} - ${result.reason}`));
    } else if (result.status === 'warn') {
      console.log(colors.yellow(`  WARN: ${result.file}`));
      console.log(colors.yellow(`        ${result.reason}`));
    } else {
      console.log(colors.green(`  PASS: ${result.file} - all reason values present`));
    }
  }

  return hasIssues;
}

/**
 * Check for forbidden patterns (incorrect casing, X- prefixes)
 */
function verifyNoForbiddenPatterns() {
  console.log(colors.bold('\n--- Checking Forbidden Patterns ---\n'));

  const forbiddenPatterns = [
    { pattern: 'Peac-Receipt', description: 'Incorrect casing (should be PEAC-Receipt)' },
    { pattern: 'X-PEAC-', description: 'RFC 6648 violation (no X- prefix for new headers)' },
  ];

  const filesToCheck = [
    'docs/specs/PROTOCOL-BEHAVIOR.md',
    'packages/kernel/src/constants.ts',
    'packages/protocol/src/issue.ts',
  ];

  let hasIssues = false;

  for (const { pattern, description } of forbiddenPatterns) {
    for (const file of filesToCheck) {
      const fullPath = join(ROOT, file);

      if (!existsSync(fullPath)) {
        continue;
      }

      const content = readFileSync(fullPath, 'utf-8');

      if (content.includes(pattern)) {
        console.log(colors.red(`  FAIL: ${file}`));
        console.log(colors.red(`        Found "${pattern}" - ${description}`));
        hasIssues = true;
      }
    }
  }

  if (!hasIssues) {
    console.log(colors.green('  PASS: No forbidden patterns found'));
  }

  return hasIssues;
}

/**
 * Main function
 */
function main() {
  console.log(colors.bold('PEAC Spec Drift Verifier'));
  console.log('========================\n');
  console.log(`Root: ${ROOT}`);

  const constants = loadCanonicalConstants();
  console.log(`Loaded constants.json (version ${constants.version})`);

  let hasBlockingIssues = false;

  // Run checks
  verifyHeaders(constants);
  verifyPurposeTokens(constants);
  verifyReasonValues(constants);

  // Forbidden patterns check is blocking
  if (verifyNoForbiddenPatterns()) {
    hasBlockingIssues = true;
  }

  // Summary
  console.log(colors.bold('\n--- Summary ---\n'));

  if (hasBlockingIssues) {
    console.log(colors.red('FAIL: Spec drift detected. Fix the issues above.'));
    process.exit(1);
  } else {
    console.log(colors.green('PASS: No spec drift detected.'));
    process.exit(0);
  }
}

main();
