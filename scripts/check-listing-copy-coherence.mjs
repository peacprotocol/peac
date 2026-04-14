#!/usr/bin/env node
// Listing-copy coherence check.
// Verifies tracked listing-surface description fields match a single tracked
// canonical short description constant. Prevents drift in MCP Registry and
// related listing copy.
//
// Exit codes:
//   0 = aligned
//   1 = drift detected in one or more targets
//   2 = configuration error (canonical source unreadable when --canonical-source
//       is supplied)
//
// Optional flag:
//   --canonical-source <path>
//     Read the canonical short description from a JSON file at the given path,
//     specifically <path>.locked_strings.canonical_short_description. Intended
//     for maintainer-side verification against an authoritative source not
//     present in the tracked tree. Without this flag, the tracked constant
//     CANONICAL_SHORT_DESCRIPTION below is the source of truth.
//
// Scope: ONLY listing-copy surfaces (project-level descriptions on tracked
// metadata files). Does NOT touch per-package package.json descriptions; those
// are package-specific and remain distinct.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// Single tracked source of truth for the project-level short description.
// Update here when the canonical short description changes; the distribution
// gate and tracked listing surfaces will then re-verify on next run.
const CANONICAL_SHORT_DESCRIPTION =
  'Portable signed records for agent, API, MCP, and cross-runtime interactions.';

function parseArgs(argv) {
  const args = { canonicalSource: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--canonical-source' && i + 1 < argv.length) {
      args.canonicalSource = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function resolveCanonical(args) {
  if (!args.canonicalSource) {
    return { source: 'tracked-constant', value: CANONICAL_SHORT_DESCRIPTION };
  }
  const path = args.canonicalSource;
  if (!existsSync(path)) {
    console.error(`ERROR: --canonical-source path does not exist: ${path}`);
    process.exit(2);
  }
  let data;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`ERROR: --canonical-source is not valid JSON: ${err.message}`);
    process.exit(2);
  }
  const value = data?.locked_strings?.canonical_short_description;
  if (typeof value !== 'string' || value.length === 0) {
    console.error(
      'ERROR: --canonical-source JSON does not contain a non-empty ' +
        'locked_strings.canonical_short_description string.'
    );
    process.exit(2);
  }
  return { source: 'external', value };
}

const args = parseArgs(process.argv);
const { source, value: expected } = resolveCanonical(args);

const targets = [
  {
    file: 'packages/mcp-server/server.json',
    field: 'description',
    role: 'MCP Registry listing copy',
  },
];

let drift = 0;
for (const target of targets) {
  const path = join(repoRoot, target.file);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  const actual = json[target.field];
  if (actual !== expected) {
    drift += 1;
    console.error(`DRIFT: ${target.file} ${target.field} (${target.role})`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
  }
}

if (drift === 0) {
  console.log(
    `PASS: Listing copy coherent across ${targets.length} target(s) (source: ${source}).`
  );
  process.exit(0);
}
console.error(`\n${drift} listing-copy drift(s) detected (source: ${source}).`);
process.exit(1);
