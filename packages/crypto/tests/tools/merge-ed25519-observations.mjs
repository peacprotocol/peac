#!/usr/bin/env node
/**
 * Merge measurement-harness output into the informative runtime-observations artifact.
 *
 * Each input is one harness document: { observed_on, environments, observations }. The merge is
 * fail-closed: a duplicate observation identity with a different outcome, an observation naming an
 * undefined environment, an unknown vector, or incomplete coverage all abort.
 *
 * Usage:
 *   node merge-ed25519-observations.mjs <harness-output.json>... [--out <path>] [--check]
 *
 * --check compares against the committed artifact instead of writing it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CRYPTO_ROOT = resolve(HERE, '..', '..');
const REPO_ROOT = resolve(CRYPTO_ROOT, '..', '..');
const CORPUS_DIR = join(REPO_ROOT, 'specs', 'conformance', 'parity-corpus', 'ed25519-peac-profile');

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const outIndex = argv.indexOf('--out');
const outPath = resolve(
  outIndex === -1 ? join(CORPUS_DIR, 'runtime-observations.json') : argv[outIndex + 1]
);
const inputs = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out');

if (inputs.length === 0) {
  console.error(
    'usage: merge-ed25519-observations.mjs <harness-output.json>... [--out path] [--check]'
  );
  process.exit(2);
}

const fail = (message) => {
  console.error(`merge-ed25519-observations: ${message}`);
  process.exit(1);
};

const corpus = JSON.parse(readFileSync(join(CORPUS_DIR, 'vectors.json'), 'utf8'));
const vectorIds = new Set(corpus.vectors.map((v) => v.id));
const OUTCOMES = new Set(['accept', 'reject', 'unsupported']);

const environments = {};
const byIdentity = new Map();
const observedOn = new Set();

for (const input of inputs) {
  const doc = JSON.parse(readFileSync(resolve(input), 'utf8'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.observed_on ?? ''))
    fail(`${input}: observed_on is missing or malformed`);
  observedOn.add(doc.observed_on);

  for (const [id, env] of Object.entries(doc.environments ?? {})) {
    for (const field of ['implementation', 'version', 'platform', 'harness', 'harness_sha256']) {
      if (!env[field]) fail(`${input}: environment ${id} is missing ${field}`);
    }
    const existing = environments[id];
    if (existing && JSON.stringify(existing) !== JSON.stringify(env)) {
      fail(`environment ${id} is defined twice with different values`);
    }
    environments[id] = env;
  }

  for (const o of doc.observations ?? []) {
    if (!vectorIds.has(o.vector_id)) fail(`${input}: unknown vector ${o.vector_id}`);
    if (!environments[o.environment_id])
      fail(`${input}: undefined environment ${o.environment_id}`);
    if (!OUTCOMES.has(o.outcome)) fail(`${input}: ${o.vector_id}: invalid outcome ${o.outcome}`);
    const identity = `${o.vector_id} ${o.environment_id}`;
    const prior = byIdentity.get(identity);
    if (prior && prior.outcome !== o.outcome) {
      fail(
        `conflicting outcomes for ${o.vector_id} in ${o.environment_id}: ${prior.outcome} vs ${o.outcome}`
      );
    }
    byIdentity.set(identity, o);
  }
}

const environmentIds = Object.keys(environments).sort();
if (environmentIds.length === 0) fail('no environments were merged');

// Every environment must cover every vector, so a partial run cannot look like a complete matrix.
for (const environmentId of environmentIds) {
  const missing = [...vectorIds].filter((v) => !byIdentity.has(`${v} ${environmentId}`));
  if (missing.length > 0) fail(`${environmentId} is missing vectors: ${missing.join(', ')}`);
}

const observations = [...byIdentity.values()].sort(
  (a, b) =>
    a.vector_id.localeCompare(b.vector_id) || a.environment_id.localeCompare(b.environment_id)
);

const outcomes = new Set(observations.map((o) => o.outcome));
if (!outcomes.has('accept') || !outcomes.has('reject')) {
  fail(`merged set has no ${!outcomes.has('accept') ? 'accepted' : 'rejected'} observation`);
}

// This artifact is one snapshot. Merging runs measured on different days would produce a document
// whose single date is true of only part of it.
if (observedOn.size !== 1) {
  fail(`inputs were measured on different dates: ${[...observedOn].sort().join(', ')}`);
}

const document = {
  $schema: './runtime-observations.schema.json',
  family: corpus.family,
  status: 'Informative',
  description:
    'Measured Ed25519 primitive decisions per implementation version. Evidence only: no ' +
    'conformance decision reads this file. The normative outcome is peac_expected in vectors.json.',
  observed_on: [...observedOn][0],
  environments,
  observations,
};

const serialized = `${JSON.stringify(document, null, 2)}\n`;

if (check) {
  const committed = readFileSync(outPath, 'utf8');
  if (committed !== serialized) fail(`${outPath} differs from a fresh merge`);
  process.stderr.write(
    `merge-ed25519-observations: OK, ${observations.length} observations across ${environmentIds.length} environments\n`
  );
} else {
  writeFileSync(outPath, serialized);
  process.stderr.write(
    `merge-ed25519-observations: wrote ${observations.length} observations across ${environmentIds.length} environments\n`
  );
}
