#!/usr/bin/env node
/**
 * Measure raw Ed25519 primitive decisions for the conformance corpus.
 *
 * Records what each primitive decided for every corpus vector, independently of the PEAC profile.
 * Observations are informative evidence; peac_expected in vectors.json remains normative.
 *
 * Outcomes are exactly accept, reject or unsupported. An unexpected error aborts the run: a
 * misconfigured primitive rejects everything, and recording that as `reject` would fabricate
 * evidence.
 *
 * Usage:
 *   node measure-ed25519-runtimes.mjs [--vectors <path>] [--observed-on YYYY-MM-DD]
 *
 * Writes a JSON document to stdout. Never mutates the corpus.
 */
import { createHash, createPublicKey, verify as nodeVerify, webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ed from '@noble/ed25519';
import {
  CORPUS_PATH,
  LOCKFILE_PATH,
  fileDigest,
  resolveSourceRevision,
  sha256,
} from './evidence-provenance.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const CRYPTO_ROOT = resolve(HERE, '..', '..');
const REPO_ROOT = resolve(CRYPTO_ROOT, '..', '..');

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
};

const vectorsPath = resolve(
  opt(
    '--vectors',
    join(REPO_ROOT, 'specs', 'conformance', 'parity-corpus', 'ed25519-peac-profile', 'vectors.json')
  )
);
const observedOn = opt('--observed-on', new Date().toISOString().slice(0, 10));
if (!/^\d{4}-\d{2}-\d{2}$/.test(observedOn)) {
  throw new Error(`--observed-on must be YYYY-MM-DD, got: ${observedOn}`);
}
// Derived from Git, never taken on trust. A supplied value must equal the checked-out revision,
// and a dirty worktree is refused outright.
const sourceRevision = resolveSourceRevision(REPO_ROOT, opt('--source-revision', null));

/** An unexpected condition. Never recorded as a measurement. */
class HarnessError extends Error {}
const abort = (context, err) => {
  throw new HarnessError(`${context}: ${err?.name ?? 'Error'}: ${err?.message ?? String(err)}`);
};

// noble does not bundle a hash; the package under test uses it only for signing.
ed.hashes.sha512 = (...messages) => {
  const hash = createHash('sha512');
  for (const message of messages) hash.update(message);
  return Uint8Array.from(hash.digest());
};

const bytes = (hex) => Uint8Array.from(Buffer.from(hex, 'hex'));

/** DER SubjectPublicKeyInfo prefix for a raw Ed25519 public key (RFC 8410). */
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

// Measured on Node 22.13.0, 22.23.2, 24.18.0, 24.19.0, 26.4.0, 26.5.0, 26.6.0 and 26.7.0: no
// corpus vector raises an exception on either path. Only a returned boolean is a cryptographic
// decision. OperationError in particular is specified as "the operation failed for an
// operation-specific reason" and is not a synonym for an invalid signature, so it aborts rather
// than being recorded as a rejection.

async function nodeWebCrypto(vector) {
  const subtle = webcrypto?.subtle;
  if (!subtle) return 'unsupported';
  let key;
  try {
    key = await subtle.importKey('raw', bytes(vector.public_key_hex), { name: 'Ed25519' }, false, [
      'verify',
    ]);
  } catch (err) {
    if (err?.name === 'NotSupportedError') return 'unsupported';
    abort(`${vector.id}: node:webcrypto importKey`, err);
  }
  try {
    const ok = await subtle.verify(
      'Ed25519',
      key,
      bytes(vector.signature_hex),
      bytes(vector.message_hex)
    );
    if (typeof ok !== 'boolean')
      abort(`${vector.id}: node:webcrypto verify`, new Error('non-boolean'));
    return ok ? 'accept' : 'reject';
  } catch (err) {
    abort(`${vector.id}: node:webcrypto verify`, err);
  }
}

function nodeCrypto(vector) {
  let key;
  try {
    key = createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(vector.public_key_hex, 'hex')]),
      format: 'der',
      type: 'spki',
    });
  } catch (err) {
    if (err?.code === 'ERR_CRYPTO_UNSUPPORTED_OPERATION') return 'unsupported';
    abort(`${vector.id}: node:crypto createPublicKey`, err);
  }
  try {
    return nodeVerify(null, bytes(vector.message_hex), key, bytes(vector.signature_hex))
      ? 'accept'
      : 'reject';
  } catch (err) {
    if (err?.code === 'ERR_CRYPTO_UNSUPPORTED_OPERATION') return 'unsupported';
    abort(`${vector.id}: node:crypto verify`, err);
  }
}

function noble(vector, zip215) {
  // Measured against the pinned noble version, every corpus vector returns a boolean and none
  // throws. noble throws only for wrong-length input, which the corpus cannot contain and which
  // would be a harness fault. Any throw therefore aborts rather than being read as a rejection.
  let result;
  try {
    result = ed.verify(
      bytes(vector.signature_hex),
      bytes(vector.message_hex),
      bytes(vector.public_key_hex),
      { zip215 }
    );
  } catch (err) {
    abort(`${vector.id}: noble zip215=${zip215}`, err);
  }
  if (typeof result !== 'boolean') {
    abort(
      `${vector.id}: noble zip215=${zip215}`,
      new Error(`non-boolean result: ${typeof result}`)
    );
  }
  return result ? 'accept' : 'reject';
}

const corpus = JSON.parse(readFileSync(vectorsPath, 'utf8'));
const nobleVersion = createRequire(join(CRYPTO_ROOT, 'package.json'))(
  '@noble/ed25519/package.json'
).version;
const harnessSha256 = sha256(readFileSync(SELF));
const HARNESS_PATH = 'packages/crypto/tests/tools/measure-ed25519-runtimes.mjs';
// Bind the evidence to the inputs that determine it, not only to the harness.
const corpusSha256 = fileDigest(REPO_ROOT, CORPUS_PATH);
const lockfileSha256 = fileDigest(REPO_ROOT, LOCKFILE_PATH);
const platform = `${process.platform}/${process.arch}`;

const environments = {};
const define = (id, fields) => {
  environments[id] = {
    platform,
    os_release: release(),
    harness: HARNESS_PATH,
    harness_sha256: harnessSha256,
    corpus_sha256: corpusSha256,
    lockfile_sha256: lockfileSha256,
    ...fields,
  };
  return id;
};

const NODE_ENV_FIELDS = {
  runtime: 'node',
  runtime_version: process.versions.node,
  v8: process.versions.v8,
  openssl: process.versions.openssl,
};

const envWebCrypto = define(`node-${process.versions.node}-webcrypto-${process.arch}`, {
  implementation: 'node:webcrypto',
  version: process.versions.node,
  ...NODE_ENV_FIELDS,
});
const envNodeCrypto = define(`node-${process.versions.node}-crypto-${process.arch}`, {
  implementation: 'node:crypto',
  version: process.versions.node,
  ...NODE_ENV_FIELDS,
});
// The environment id carries the host Node version: noble is pure JavaScript, but it still runs on
// a specific engine, and two engines are two environments.
const envNobleZip = define(`noble-${nobleVersion}-zip215-node-${process.versions.node}`, {
  implementation: 'noble:zip215',
  version: nobleVersion,
  ...NODE_ENV_FIELDS,
});
const envNobleStrict = define(`noble-${nobleVersion}-strict-node-${process.versions.node}`, {
  implementation: 'noble:strict',
  version: nobleVersion,
  ...NODE_ENV_FIELDS,
});

const observations = [];
for (const vector of corpus.vectors) {
  observations.push({
    vector_id: vector.id,
    environment_id: envWebCrypto,
    outcome: await nodeWebCrypto(vector),
  });
  observations.push({
    vector_id: vector.id,
    environment_id: envNodeCrypto,
    outcome: nodeCrypto(vector),
  });
  observations.push({
    vector_id: vector.id,
    environment_id: envNobleZip,
    outcome: noble(vector, true),
  });
  observations.push({
    vector_id: vector.id,
    environment_id: envNobleStrict,
    outcome: noble(vector, false),
  });
}

// Controls. A run that accepts nothing, or rejects nothing, has not measured anything meaningful.
const ACCEPT_CONTROL = 'peac-sign-positive';
const REJECT_CONTROL = 'speccheck-4';
for (const [id, expected] of [
  [ACCEPT_CONTROL, 'accept'],
  [REJECT_CONTROL, 'reject'],
]) {
  const rows = observations.filter((o) => o.vector_id === id && o.outcome !== 'unsupported');
  if (rows.length === 0) throw new HarnessError(`no measurable observation for control ${id}`);
  const wrong = rows.filter((o) => o.outcome !== expected);
  // speccheck-4 verifies under cofactored semantics, so noble strict legitimately accepts it.
  const unexpected = wrong.filter((o) => !o.environment_id.startsWith('noble-'));
  if (id === ACCEPT_CONTROL && wrong.length > 0) {
    throw new HarnessError(
      `accept control ${id} not accepted by: ${wrong.map((o) => o.environment_id).join(', ')}`
    );
  }
  if (id === REJECT_CONTROL && unexpected.length > 0) {
    throw new HarnessError(
      `reject control ${id} not rejected by: ${unexpected.map((o) => o.environment_id).join(', ')}`
    );
  }
}

if (observations.length !== corpus.vectors.length * 4) {
  throw new HarnessError(
    `expected ${corpus.vectors.length * 4} observations, produced ${observations.length}`
  );
}

process.stdout.write(
  `${JSON.stringify(
    {
      observed_on: observedOn,
      measurement_source_revision: sourceRevision,
      environments,
      observations,
    },
    null,
    2
  )}\n`
);
