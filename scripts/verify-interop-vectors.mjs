#!/usr/bin/env node

/**
 * Interop vector verifier.
 *
 * Walks specs/conformance/interop/<family>/{positive,negative}/ and
 * deterministically verifies every vector against the family-specific
 * derivation rules. Offline-only: no network, no subprocess, no
 * dynamic import from fixture paths, no dependency on test runners.
 *
 * Families covered:
 *
 *   erc8126-attestation-format/
 *     positive/  attestationFormat label is drawn from { jws, eip712, onchain }
 *                + canonical-bytes SHA-256 digest matches expected
 *     negative/  v04-unknown-format: attestationFormat present but not in label set
 *                v05-missing-format: attestationFormat field absent
 *
 *   ap2-open-mandate-hash/
 *     positive/  sha256_hex(JCS_RFC8785(input)) matches expected.open_mandate_hash
 *     negative/  v04-non-sha256-digest:  candidate_open_mandate_hash_via_sha1 !=
 *                                        sha256_hex(JCS_RFC8785(body))
 *                v05-non-jcs-canonicalization: candidate_non_jcs_bytes_utf8 !=
 *                                              JCS_RFC8785(body)
 *
 * Exit codes:
 *   0  all vectors verified
 *   1  one or more vectors failed verification
 *   2  script error (missing fixtures, malformed JSON, missing utility, etc.)
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const CRYPTO_DIST = join(ROOT, 'packages', 'crypto', 'dist', 'index.mjs');
if (!existsSync(CRYPTO_DIST)) {
  console.error(`SCRIPT ERROR: missing ${relative(ROOT, CRYPTO_DIST)}.`);
  console.error(`  Build @peac/crypto first:  pnpm --filter @peac/crypto build`);
  process.exit(2);
}
const { canonicalize, canonicalizeBytes } = await import(CRYPTO_DIST);
const INTEROP_ROOT = join(ROOT, 'specs', 'conformance', 'interop');

const ERC_FAMILY = 'erc8126-attestation-format';
const AP2_FAMILY = 'ap2-open-mandate-hash';

const RECOGNIZED_ATTESTATION_LABELS = new Set(['jws', 'eip712', 'onchain']);

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  '$schema',
  'vector_id',
  'description',
  'input',
  'expected',
  'expected_failure',
]);

const ALLOWED_FAILURE_KIND = new Set([
  'validation_failure',
  'canonicalization_failure',
  'digest_failure',
]);

const ALLOWED_EXPECTED_FAILURE_KEYS = new Set(['kind', 'reason']);

const VECTOR_ID_PATTERN = /^[a-z][a-z0-9-]*-v[0-9]{2}-[a-z0-9-]+$/;
const SNAKE_CASE_PATTERN = /^[a-z][a-z0-9_]*$/;

const EXPECTED_COUNTS = {
  [ERC_FAMILY]: { positive: 3, negative: 2 },
  [AP2_FAMILY]: { positive: 3, negative: 2 },
};

const EXPECTED_FAILURE_REASONS = {
  [ERC_FAMILY]: {
    'v04-unknown-format.json': 'unsupported_attestation_format',
    'v05-missing-format.json': 'missing_attestation_format',
  },
  [AP2_FAMILY]: {
    'v04-non-sha256-digest.json': 'non_sha256_digest',
    'v05-non-jcs-canonicalization.json': 'non_jcs_canonicalization',
  },
};

function readJson(path) {
  const text = readFileSync(path, 'utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON at ${relative(ROOT, path)}: ${err.message}`);
  }
}

function listJsonFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (err) {
    throw new Error(`Cannot read ${relative(ROOT, dir)}: ${err.message}`);
  }
  return entries
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile())
    .sort();
}

function sha256Hex(input) {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  return createHash('sha256').update(buf).digest('hex');
}

function sha1Hex(input) {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  return createHash('sha1').update(buf).digest('hex');
}

function verifyVectorEnvelope(vector, path) {
  const issues = [];
  const rel = relative(ROOT, path);
  if (typeof vector !== 'object' || vector === null) {
    issues.push(`${rel}: vector is not an object`);
    return issues;
  }
  // Mechanical enforcement of the allowed top-level key set.
  const unknownKeys = Object.keys(vector).filter((k) => !ALLOWED_TOP_LEVEL_KEYS.has(k));
  if (unknownKeys.length > 0) {
    issues.push(
      `${rel}: unexpected top-level key(s): ${unknownKeys.join(', ')} (allowed: ${[...ALLOWED_TOP_LEVEL_KEYS].join(', ')})`
    );
  }
  if (typeof vector.$schema !== 'string') {
    issues.push(`${rel}: missing $schema`);
  }
  if (typeof vector.vector_id !== 'string') {
    issues.push(`${rel}: missing vector_id`);
  } else if (!VECTOR_ID_PATTERN.test(vector.vector_id)) {
    issues.push(`${rel}: vector_id ${vector.vector_id} does not match ${VECTOR_ID_PATTERN}`);
  }
  if (typeof vector.description !== 'string' || vector.description.length === 0) {
    issues.push(`${rel}: missing or empty description`);
  }
  if (typeof vector.input !== 'object' || vector.input === null) {
    issues.push(`${rel}: missing input object`);
  }
  const hasExpected = Object.prototype.hasOwnProperty.call(vector, 'expected');
  const hasExpectedFailure = Object.prototype.hasOwnProperty.call(vector, 'expected_failure');
  if (hasExpected === hasExpectedFailure) {
    issues.push(
      `${rel}: must declare exactly one of expected (positive) or expected_failure (negative)`
    );
  }
  if (hasExpectedFailure) {
    const f = vector.expected_failure;
    if (typeof f !== 'object' || f === null) {
      issues.push(`${rel}: expected_failure must be an object`);
    } else {
      const unknownFailureKeys = Object.keys(f).filter(
        (k) => !ALLOWED_EXPECTED_FAILURE_KEYS.has(k)
      );
      if (unknownFailureKeys.length > 0) {
        issues.push(
          `${rel}: unexpected expected_failure key(s): ${unknownFailureKeys.join(', ')} (allowed: kind, reason)`
        );
      }
      if (!ALLOWED_FAILURE_KIND.has(f.kind)) {
        issues.push(
          `${rel}: expected_failure.kind must be one of validation_failure / canonicalization_failure / digest_failure`
        );
      }
      if (typeof f.reason !== 'string' || !SNAKE_CASE_PATTERN.test(f.reason)) {
        issues.push(`${rel}: expected_failure.reason must be snake_case`);
      }
    }
  }
  return issues;
}

function verifyErc8126Positive(vector, path) {
  const issues = [];
  const rel = relative(ROOT, path);
  const input = vector.input;
  if (typeof input.attestationFormat !== 'string') {
    issues.push(`${rel}: positive vector must declare attestationFormat`);
  } else if (!RECOGNIZED_ATTESTATION_LABELS.has(input.attestationFormat)) {
    issues.push(
      `${rel}: positive vector attestationFormat ${input.attestationFormat} not in recognized open-label set { jws, eip712, onchain }`
    );
  }
  const expected = vector.expected;
  if (typeof expected.canonical_bytes_sha256_hex !== 'string') {
    issues.push(`${rel}: positive vector must declare expected.canonical_bytes_sha256_hex`);
    return issues;
  }
  const canonical = canonicalizeBytes(input);
  if (
    typeof expected.canonical_bytes_utf8_length === 'number' &&
    canonical.length !== expected.canonical_bytes_utf8_length
  ) {
    issues.push(
      `${rel}: canonical-bytes UTF-8 length ${canonical.length} != expected ${expected.canonical_bytes_utf8_length}`
    );
  }
  const actual = sha256Hex(canonical);
  if (actual !== expected.canonical_bytes_sha256_hex) {
    issues.push(
      `${rel}: canonical-bytes SHA-256 mismatch (expected ${expected.canonical_bytes_sha256_hex}, got ${actual})`
    );
  }
  // Deterministic regeneration: canonicalize twice and assert byte-identical.
  const canonical2 = canonicalizeBytes(input);
  if (Buffer.compare(Buffer.from(canonical), Buffer.from(canonical2)) !== 0) {
    issues.push(`${rel}: canonical-bytes regeneration is non-deterministic`);
  }
  return issues;
}

function verifyErc8126Negative(vector, path) {
  const issues = [];
  const rel = relative(ROOT, path);
  const filename = basename(path);
  const declaredReason = vector.expected_failure?.reason;
  const expectedReason = EXPECTED_FAILURE_REASONS[ERC_FAMILY][filename];
  if (!expectedReason) {
    issues.push(`${rel}: unrecognized ERC-8126 negative vector filename`);
    return issues;
  }
  if (declaredReason !== expectedReason) {
    issues.push(`${rel}: expected_failure.reason ${declaredReason} != ${expectedReason}`);
  }
  const input = vector.input;
  if (filename === 'v04-unknown-format.json') {
    if (typeof input.attestationFormat !== 'string') {
      issues.push(`${rel}: v04 must declare attestationFormat to exercise unsupported-format path`);
    } else if (RECOGNIZED_ATTESTATION_LABELS.has(input.attestationFormat)) {
      issues.push(
        `${rel}: v04 attestationFormat ${input.attestationFormat} should not be in recognized open-label set`
      );
    }
  } else if (filename === 'v05-missing-format.json') {
    if (Object.prototype.hasOwnProperty.call(input, 'attestationFormat')) {
      issues.push(`${rel}: v05 must omit attestationFormat to exercise missing-format path`);
    }
  }
  return issues;
}

function verifyAp2Positive(vector, path) {
  const issues = [];
  const rel = relative(ROOT, path);
  const input = vector.input;
  const expected = vector.expected;
  if (typeof expected.open_mandate_hash !== 'string') {
    issues.push(`${rel}: positive vector must declare expected.open_mandate_hash`);
    return issues;
  }
  const canonical = canonicalizeBytes(input);
  if (
    typeof expected.canonical_bytes_utf8_length === 'number' &&
    canonical.length !== expected.canonical_bytes_utf8_length
  ) {
    issues.push(
      `${rel}: canonical-bytes UTF-8 length ${canonical.length} != expected ${expected.canonical_bytes_utf8_length}`
    );
  }
  const actual = sha256Hex(canonical);
  if (actual !== expected.open_mandate_hash) {
    issues.push(
      `${rel}: open_mandate_hash mismatch (expected ${expected.open_mandate_hash}, got ${actual})`
    );
  }
  const canonical2 = canonicalizeBytes(input);
  if (Buffer.compare(Buffer.from(canonical), Buffer.from(canonical2)) !== 0) {
    issues.push(`${rel}: canonical-bytes regeneration is non-deterministic`);
  }
  return issues;
}

function verifyAp2Negative(vector, path) {
  const issues = [];
  const rel = relative(ROOT, path);
  const filename = basename(path);
  const declaredReason = vector.expected_failure?.reason;
  const expectedReason = EXPECTED_FAILURE_REASONS[AP2_FAMILY][filename];
  if (!expectedReason) {
    issues.push(`${rel}: unrecognized AP2 negative vector filename`);
    return issues;
  }
  if (declaredReason !== expectedReason) {
    issues.push(`${rel}: expected_failure.reason ${declaredReason} != ${expectedReason}`);
  }
  const input = vector.input;
  if (typeof input.body !== 'object' || input.body === null) {
    issues.push(`${rel}: AP2 negative vector must include input.body`);
    return issues;
  }
  const jcsBytes = canonicalizeBytes(input.body);
  const sha256 = sha256Hex(jcsBytes);
  if (filename === 'v04-non-sha256-digest.json') {
    const candidate = input.candidate_open_mandate_hash_via_sha1;
    if (typeof candidate !== 'string') {
      issues.push(`${rel}: v04 must declare candidate_open_mandate_hash_via_sha1`);
      return issues;
    }
    if (candidate === sha256) {
      issues.push(
        `${rel}: candidate SHA-1 digest collides with SHA-256 derivation (vector is not negative)`
      );
    }
    const expectedSha1 = sha1Hex(jcsBytes);
    if (candidate !== expectedSha1) {
      issues.push(
        `${rel}: candidate_open_mandate_hash_via_sha1 ${candidate} != sha1_hex(JCS(body)) ${expectedSha1}`
      );
    }
  } else if (filename === 'v05-non-jcs-canonicalization.json') {
    const candidateBytes = input.candidate_non_jcs_bytes_utf8;
    const candidateHash = input.candidate_open_mandate_hash_via_non_jcs;
    if (typeof candidateBytes !== 'string') {
      issues.push(`${rel}: v05 must declare candidate_non_jcs_bytes_utf8`);
      return issues;
    }
    if (typeof candidateHash !== 'string') {
      issues.push(`${rel}: v05 must declare candidate_open_mandate_hash_via_non_jcs`);
      return issues;
    }
    const jcsString = canonicalize(input.body);
    if (candidateBytes === jcsString) {
      issues.push(
        `${rel}: candidate non-JCS bytes equal JCS canonical bytes (vector is not negative)`
      );
    }
    const candidateBytesHash = sha256Hex(candidateBytes);
    if (candidateHash !== candidateBytesHash) {
      issues.push(
        `${rel}: candidate_open_mandate_hash_via_non_jcs ${candidateHash} != sha256_hex(candidate_non_jcs_bytes_utf8) ${candidateBytesHash}`
      );
    }
    if (candidateHash === sha256) {
      issues.push(
        `${rel}: candidate non-JCS digest collides with SHA-256(JCS(body)) (vector is not negative)`
      );
    }
  }
  return issues;
}

function verifyFamily(family, positiveFn, negativeFn) {
  const familyDir = join(INTEROP_ROOT, family);
  const positiveDir = join(familyDir, 'positive');
  const negativeDir = join(familyDir, 'negative');
  const positives = listJsonFiles(positiveDir);
  const negatives = listJsonFiles(negativeDir);
  const expected = EXPECTED_COUNTS[family];
  const issues = [];
  if (positives.length !== expected.positive) {
    issues.push(
      `${family}: expected ${expected.positive} positive vectors, got ${positives.length}`
    );
  }
  if (negatives.length !== expected.negative) {
    issues.push(
      `${family}: expected ${expected.negative} negative vectors, got ${negatives.length}`
    );
  }
  for (const path of positives) {
    const vector = readJson(path);
    issues.push(...verifyVectorEnvelope(vector, path));
    if (vector.expected) {
      issues.push(...positiveFn(vector, path));
    }
  }
  for (const path of negatives) {
    const vector = readJson(path);
    issues.push(...verifyVectorEnvelope(vector, path));
    if (vector.expected_failure) {
      issues.push(...negativeFn(vector, path));
    }
  }
  return { positives: positives.length, negatives: negatives.length, issues };
}

function main() {
  const ercResult = verifyFamily(ERC_FAMILY, verifyErc8126Positive, verifyErc8126Negative);
  const ap2Result = verifyFamily(AP2_FAMILY, verifyAp2Positive, verifyAp2Negative);
  const allIssues = [...ercResult.issues, ...ap2Result.issues];
  const total =
    ercResult.positives + ercResult.negatives + ap2Result.positives + ap2Result.negatives;
  console.log(`Interop vector verifier:`);
  console.log(`  ${ERC_FAMILY}: ${ercResult.positives} positive, ${ercResult.negatives} negative`);
  console.log(`  ${AP2_FAMILY}: ${ap2Result.positives} positive, ${ap2Result.negatives} negative`);
  console.log(`  Total: ${total} vectors across 2 interop families`);
  if (allIssues.length > 0) {
    console.error(`\nFAIL: ${allIssues.length} issue(s):`);
    for (const issue of allIssues) {
      console.error(`  - ${issue}`);
    }
    process.exit(1);
  }
  console.log(`\nPASS: all interop vectors verified`);
}

try {
  main();
} catch (err) {
  console.error(`SCRIPT ERROR: ${err.message}`);
  process.exit(2);
}
