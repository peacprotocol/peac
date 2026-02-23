#!/usr/bin/env node
/**
 * Zod single-major enforcement gate
 *
 * Ensures the workspace resolves to exactly one Zod major version.
 * Mixed Zod majors cause assignment-incompatible types at package boundaries
 * and break downstream TypeScript consumers.
 *
 * Usage: node scripts/check-zod-single-major.mjs
 * Exit code: 0 = single major, 1 = mixed majors detected
 *
 * CI integration: run after `pnpm install`, before `pnpm build`.
 */

import { execSync } from 'node:child_process';

function main() {
  console.log('=== Zod Single-Major Enforcement ===');

  // Step 1: Check resolved Zod versions across workspace
  let whyOutput;
  try {
    whyOutput = execSync('pnpm -r why zod 2>&1', {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    whyOutput = err.stdout ?? '';
  }

  // Extract all zod version lines (e.g., "zod 4.3.6", "zod 3.25.0")
  const versionPattern = /\bzod (\d+\.\d+\.\d+)/g;
  const versions = new Set();
  let match;
  while ((match = versionPattern.exec(whyOutput)) !== null) {
    versions.add(match[1]);
  }

  if (versions.size === 0) {
    console.log('WARNING: No Zod versions found in workspace. Is Zod installed?');
    process.exit(1);
  }

  // Extract major versions
  const majors = new Set([...versions].map((v) => v.split('.')[0]));
  console.log(`Resolved Zod versions: ${[...versions].join(', ')}`);
  console.log(`Major versions: ${[...majors].join(', ')}`);

  if (majors.size > 1) {
    console.log('');
    console.log('FAIL: Mixed Zod major versions detected!');
    console.log('Zod 3 and Zod 4 types are not assignment-compatible.');
    console.log('Fix: ensure pnpm.overrides in root package.json pins a single Zod major.');
    console.log('');
    // Show which packages resolve to which version
    for (const line of whyOutput.split('\n')) {
      if (/zod \d+\.\d+\.\d+/.test(line)) {
        console.log(`  ${line.trim()}`);
      }
    }
    process.exit(1);
  }

  console.log(`OK: single Zod major (v${[...majors][0]})`);

  // Step 2: Check for leaked Zod types in .d.ts exports
  console.log('');
  console.log('--- Zod type leakage in .d.ts exports ---');
  const publicPackages = [
    'packages/schema/dist',
    'packages/protocol/dist',
    'packages/control/dist',
    'packages/crypto/dist',
    'packages/kernel/dist',
  ];

  let leakCount = 0;
  for (const dir of publicPackages) {
    try {
      const grepResult = execSync(
        `grep -rl 'z\\.' ${dir}/ --include='*.d.ts' 2>/dev/null | head -20`,
        { encoding: 'utf-8' }
      );
      const files = grepResult.trim().split('\n').filter(Boolean);
      if (files.length > 0) {
        // Count actual Zod type references (not just "z." in strings)
        for (const file of files) {
          const zodRefs = execSync(
            `grep -cE "z\\.|ZodType|ZodSchema|ZodObject|from.*zod" "${file}" 2>/dev/null || echo 0`,
            { encoding: 'utf-8' }
          ).trim();
          const count = parseInt(zodRefs, 10);
          if (count > 0) {
            leakCount += count;
            console.log(`  ${file}: ${count} Zod type reference(s)`);
          }
        }
      }
    } catch {
      // No .d.ts files or grep not found: skip
    }
  }

  if (leakCount > 0) {
    console.log(`  Total: ${leakCount} Zod type reference(s) in public .d.ts files`);
    console.log('  (Informational: these exports are typed against the current Zod major)');
  } else {
    console.log('  No Zod type references found in public .d.ts exports');
  }

  console.log('');
  console.log('=== Zod Single-Major Check Complete ===');
}

main();
