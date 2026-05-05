#!/usr/bin/env node
/**
 * v0.14.1: Reference fixture verifier for the A2A handoff integrator kit.
 *
 * Loads each observation fixture and validates it directly against
 * `validateA2AHandoff` from `@peac/schema`. Loads the Agent Card example
 * and validates it via `normalizeAgentCard` from `@peac/mappings-a2a`.
 *
 * Exit code 0 on success, 1 on any failure.
 *
 * Usage (from the repo root after `pnpm build`):
 *   node scripts/integrator-kits/verify-a2a-fixtures.mjs
 *
 * Modules are resolved via explicit relative paths into the built `dist/`
 * tree because the integrator-kit fixtures directory is a documentation
 * surface and intentionally has no package.json. This script lives under
 * `scripts/` so the dist-import guard rule allows it (per scripts/guard.sh
 * "forbid dist imports" allowlist).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const FIXTURES_DIR = join(REPO_ROOT, 'integrator-kits/a2a/fixtures');

const SCHEMA_DIST = join(REPO_ROOT, 'packages/schema/dist/index.mjs');
const MAPPINGS_A2A_DIST = join(REPO_ROOT, 'packages/mappings/a2a/dist/index.mjs');

const { validateA2AHandoff } = await import(SCHEMA_DIST);
const { normalizeAgentCard } = await import(MAPPINGS_A2A_DIST);

const OBSERVATION_FIXTURES = [
  'agent-card-observation.example.json',
  'task-submitted.example.json',
  'task-completed.example.json',
  'human-approved.example.json',
];

const AGENT_CARD_FIXTURE = 'agent-card.example.json';

function loadJson(rel) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, rel), 'utf8'));
}

let pass = 0;
let fail = 0;

for (const rel of OBSERVATION_FIXTURES) {
  const payload = loadJson(rel);
  const result = validateA2AHandoff(payload);
  if (result.ok) {
    console.log(`PASS  ${rel}`);
    pass += 1;
  } else {
    console.error(`FAIL  ${rel}`);
    for (const err of result.errors) {
      console.error(`        ${err.code}${err.path ? ` @ ${err.path}` : ''}: ${err.message ?? ''}`);
    }
    fail += 1;
  }
}

const card = loadJson(AGENT_CARD_FIXTURE);
const normalized = normalizeAgentCard(card);
if (normalized) {
  console.log(`PASS  ${AGENT_CARD_FIXTURE} (normalizes to ${normalized.url})`);
  pass += 1;
} else {
  console.error(`FAIL  ${AGENT_CARD_FIXTURE} (normalizeAgentCard returned null)`);
  fail += 1;
}

console.log(`\nSUMMARY: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
