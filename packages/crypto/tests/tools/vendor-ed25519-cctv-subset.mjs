#!/usr/bin/env node
/**
 * Test-only re-vendoring tool for the external Ed25519 oracle subset.
 *
 * Regenerates the CCTV subset and its integrity manifest from a LOCAL copy of the complete upstream
 * file. Never fetches: required CI must not depend on network retrieval of external vectors.
 *
 * Usage:
 *   node vendor-ed25519-cctv-subset.mjs --source <path to upstream ed25519vectors.json>
 *   node vendor-ed25519-cctv-subset.mjs --check
 *
 * --check recomputes the committed subset and licence hashes from their bytes and compares them
 * with the manifest. It needs no upstream copy, so it can run in ordinary CI.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXTERNAL = join(HERE, '..', 'fixtures', 'external');
const SUBSET = join(EXTERNAL, 'ed25519-cctv-subset.json');
const LICENCE = join(EXTERNAL, 'ed25519-cctv-LICENSE.txt');
const MANIFEST = join(EXTERNAL, 'ed25519-cctv-subset.manifest.json');

const UPSTREAM_REPOSITORY = 'https://github.com/C2SP/CCTV';
const UPSTREAM_PATH = 'ed25519/ed25519vectors.json';
const UPSTREAM_COMMIT = '3ec4d716e80597545ed285cf62af3dded3a14f65';
const UPSTREAM_SOURCE_SHA256 = 'b38e84caf3e7e89170ff520292dbeae421b0a794c27408ce5ce973018fe3d7f9';
const SELECTION_ALGORITHM_VERSION = '1';

/** Flag families the subset must represent, each contributing its first three vectors by number. */
const FLAG_FAMILIES = [
  'low_order_A',
  'low_order_R',
  'low_order_component_A',
  'low_order_component_R',
  'non_canonical_A',
  'non_canonical_R',
];
const PER_FAMILY = 3;

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

function select(upstream) {
  const picked = new Map();
  for (const family of FLAG_FAMILIES) {
    for (const vector of upstream
      .filter((v) => (v.flags ?? []).includes(family))
      .slice(0, PER_FAMILY)) {
      picked.set(vector.number, vector);
    }
  }
  // All available unflagged ordinary controls. The pinned source contains one.
  for (const vector of upstream.filter((v) => (v.flags ?? []).length === 0)) {
    picked.set(vector.number, vector);
  }
  return [...picked.keys()].sort((a, b) => a - b).map((n) => picked.get(n));
}

function buildSubset(vectors) {
  return `${JSON.stringify(
    {
      corpus: 'c2sp-cctv-ed25519-subset',
      form:
        'DERIVED SUBSET. A transformed selection of upstream vectors, not a copy of the upstream ' +
        'file. Externally sourced test material with pinned provenance: formatting is controlled ' +
        'locally to preserve stable reviewable bytes, and the selection is reproducible from the ' +
        'pinned upstream commit and the deterministic rules recorded in the manifest. The ' +
        'accompanying licence file IS an exact upstream copy.',
      oracle_role:
        'External mathematical oracle. Upstream flags are an INDEPENDENT classification: ' +
        'low_order_* means the point itself has small order, while low_order_component_* without ' +
        'low_order_* means the point carries a low-order component, that is, mixed order. That is ' +
        'the distinction a finite blocklist cannot make in general, and the reason this corpus ' +
        'cross-checks the PEAC classifier rather than being trusted alone.',
      license: 'BSD-3-Clause',
      copyright: ['Copyright 2019 Google LLC', 'Copyright 2022 Filippo Valsorda'],
      vectors: vectors.map((v) => ({
        number: v.number,
        key: v.key,
        sig: v.sig,
        msg: v.msg,
        flags: v.flags ?? [],
      })),
    },
    null,
    2
  )}\n`;
}

function buildManifest(vectors, subsetBytes, licenceBytes) {
  return `${JSON.stringify(
    {
      manifest: 'ed25519-cctv-subset-integrity',
      upstream_repository: UPSTREAM_REPOSITORY,
      upstream_path: UPSTREAM_PATH,
      upstream_commit: UPSTREAM_COMMIT,
      upstream_source_sha256: UPSTREAM_SOURCE_SHA256,
      retrieved: '2026-08-06',
      selection_algorithm_version: SELECTION_ALGORITHM_VERSION,
      selection:
        `First ${PER_FAMILY} vectors by ascending upstream number for each of ` +
        `${FLAG_FAMILIES.join(', ')}, plus all available unflagged ordinary controls from the ` +
        'pinned source; one exists at the pinned commit. Duplicates collapse by upstream number.',
      selected_vector_numbers: vectors.map((v) => v.number),
      subset_path: 'ed25519-cctv-subset.json',
      subset_sha256: sha256(subsetBytes),
      license_path: 'ed25519-cctv-LICENSE.txt',
      license_sha256: sha256(licenceBytes),
    },
    null,
    2
  )}\n`;
}

if (process.argv.includes('--check')) {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const subsetActual = sha256(readFileSync(SUBSET));
  const licenceActual = sha256(readFileSync(LICENCE));
  let failed = false;
  if (subsetActual !== manifest.subset_sha256) {
    console.error(`subset sha256 mismatch: ${subsetActual} != ${manifest.subset_sha256}`);
    failed = true;
  }
  if (licenceActual !== manifest.license_sha256) {
    console.error(`licence sha256 mismatch: ${licenceActual} != ${manifest.license_sha256}`);
    failed = true;
  }
  if (failed) process.exit(1);
  console.log('ed25519 CCTV subset: OK -- committed bytes match the integrity manifest.');
} else {
  const at = process.argv.indexOf('--source');
  if (at === -1) {
    console.error('usage: vendor-ed25519-cctv-subset.mjs --source <upstream json> | --check');
    process.exit(2);
  }
  const raw = readFileSync(process.argv[at + 1]);
  const actual = sha256(raw);
  if (actual !== UPSTREAM_SOURCE_SHA256) {
    console.error(`upstream source sha256 mismatch: ${actual} != ${UPSTREAM_SOURCE_SHA256}`);
    process.exit(1);
  }
  const vectors = select(JSON.parse(raw.toString('utf8')));
  const subsetBytes = Buffer.from(buildSubset(vectors), 'utf8');
  writeFileSync(SUBSET, subsetBytes);
  writeFileSync(MANIFEST, buildManifest(vectors, subsetBytes, readFileSync(LICENCE)));
  console.log(`ed25519 CCTV subset: wrote ${vectors.length} vectors and the integrity manifest.`);
}
