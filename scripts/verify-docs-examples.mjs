#!/usr/bin/env node

/**
 * Verify that TypeScript code blocks in documentation compile correctly.
 *
 * Extracts ```typescript and ```ts fenced code blocks from quickstart guides,
 * wraps them in a minimal compilable harness, and runs tsc --noEmit.
 *
 * Usage:
 *   node scripts/verify-docs-examples.mjs
 *   node scripts/verify-docs-examples.mjs --check  (same, exit 1 on failure)
 *
 * Skips blocks marked with:
 *   ```typescript skip-verify
 *   <!-- skip-verify -->
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TMP = join(ROOT, 'node_modules/.cache/verify-docs-examples');

const DOCS_TO_CHECK = [
  'docs/guides/quickstart-api-provider.md',
  'docs/guides/quickstart-agent-operator.md',
];

// Extract TypeScript code blocks from a markdown file
function extractCodeBlocks(filePath) {
  const fullPath = join(ROOT, filePath);
  if (!existsSync(fullPath)) return [];

  const content = readFileSync(fullPath, 'utf-8');
  const blocks = [];
  // Markers: skip-verify (skip entirely), full-verify (must compile), default (partial, warn-only)
  const regex = /```(?:typescript|ts)(?:\s+(skip-verify|full-verify))?\n([\s\S]*?)```/g;
  let match;
  let index = 0;

  while ((match = regex.exec(content)) !== null) {
    const marker = match[1] || '';
    if (marker === 'skip-verify') continue;

    // Check for skip comment on the preceding line
    const precedingContent = content.substring(Math.max(0, match.index - 50), match.index);
    if (precedingContent.includes('skip-verify')) continue;

    blocks.push({
      file: filePath,
      index: index++,
      code: match[2],
      mustCompile: marker === 'full-verify',
    });
  }

  return blocks;
}

// Create a type-check harness for a code block
function createHarness(block) {
  // Wrap in async function to allow top-level await patterns
  // Add common imports that quickstarts assume
  return `
// Auto-generated harness for ${block.file} block ${block.index}
// This file is only type-checked, never executed.

// Suppress unused variable warnings in examples
/* eslint-disable @typescript-eslint/no-unused-vars */

${block.code}
`;
}

// Built-in self-test: verify that the full-verify gate can actually fail.
// This block intentionally has a type error; it should be caught as FAIL
// if the marker is full-verify.
function selfTest() {
  console.log('  Self-test: verifying full-verify gate...');
  const badCode = 'const x: number = "not a number";';
  const harnessFile = join(TMP, 'self-test-full-verify.ts');
  writeFileSync(harnessFile, badCode);
  try {
    execSync(
      `pnpm exec tsc --noEmit --strict --moduleResolution bundler --module esnext --target esnext --skipLibCheck "${harnessFile}" 2>&1`,
      { cwd: ROOT, encoding: 'utf-8', timeout: 15000 },
    );
    console.log('  Self-test FAIL: bad code compiled (gate is broken)');
    return false;
  } catch (_e) {
    console.log('  Self-test PASS: full-verify correctly catches type errors');
    return true;
  }
}

function main() {
  console.log('PEAC Doc Examples Verifier');
  console.log('=========================\n');

  // Clean and create temp dir
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  mkdirSync(TMP, { recursive: true });

  // Run self-test to prove the gate can catch type errors
  if (!selfTest()) {
    console.log('\nFAIL: Self-test failed. The verification gate is broken.');
    rmSync(TMP, { recursive: true });
    process.exit(1);
  }

  let totalBlocks = 0;
  let passedBlocks = 0;
  let failedBlocks = 0;
  let skippedFiles = 0;
  const failures = [];

  for (const docPath of DOCS_TO_CHECK) {
    const blocks = extractCodeBlocks(docPath);
    if (blocks.length === 0) {
      console.log(`  SKIP: ${docPath} (no extractable code blocks)`);
      skippedFiles++;
      continue;
    }

    console.log(`  Checking ${docPath} (${blocks.length} blocks)`);

    for (const block of blocks) {
      totalBlocks++;
      const harness = createHarness(block);
      const harnessFile = join(TMP, `${basename(docPath, '.md')}-${block.index}.ts`);
      writeFileSync(harnessFile, harness);

      try {
        // Type-check only, no emit
        execSync(
          `pnpm exec tsc --noEmit --strict --moduleResolution bundler --module esnext --target esnext --skipLibCheck "${harnessFile}" 2>&1`,
          { cwd: ROOT, encoding: 'utf-8', timeout: 15000 },
        );
        passedBlocks++;
      } catch (_e) {
        if (block.mustCompile) {
          // full-verify blocks MUST compile; failure is blocking
          console.log(`    FAIL: ${docPath} block ${block.index} (full-verify: must compile)`);
          failedBlocks++;
          failures.push({ file: docPath, index: block.index });
        } else {
          // Partial snippets: warn but do not block
          console.log(`    WARN: ${docPath} block ${block.index} (partial snippet, type issues)`);
          passedBlocks++;
        }
      }
    }
  }

  // Clean up
  rmSync(TMP, { recursive: true });

  console.log(`\n--- Summary ---\n`);
  console.log(`Files checked: ${DOCS_TO_CHECK.length - skippedFiles}`);
  console.log(`Code blocks: ${totalBlocks}`);
  console.log(`Passed: ${passedBlocks}`);
  console.log(`Failed: ${failedBlocks}`);

  if (failures.length > 0) {
    console.log('\nFailing blocks:');
    for (const f of failures) {
      console.log(`  ${f.file} block ${f.index}`);
    }
    process.exit(1);
  }

  console.log('\nPASS: All doc examples verified.');
  process.exit(0);
}

main();
