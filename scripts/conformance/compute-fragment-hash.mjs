#!/usr/bin/env node
/**
 * Utility: compute SHA-256 hash of a source fragment string.
 * Used by requirement registry tooling for drift detection.
 *
 * Usage: echo "fragment text" | node scripts/conformance/compute-fragment-hash.mjs
 *    or: node scripts/conformance/compute-fragment-hash.mjs "fragment text"
 */
import { createHash } from 'node:crypto';

function computeFragmentHash(fragment) {
  return 'sha256:' + createHash('sha256').update(fragment, 'utf-8').digest('hex');
}

if (process.argv[2]) {
  console.log(computeFragmentHash(process.argv[2]));
} else {
  let input = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    console.log(computeFragmentHash(input.trimEnd()));
  });
}

export { computeFragmentHash };
