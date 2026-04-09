#!/usr/bin/env node
/**
 * Generate cross-language golden vectors for Go SDK testing.
 *
 * Produces JCS canonical vectors and signed interaction records
 * using the TypeScript implementation, consumed by Go tests.
 *
 * Usage: node scripts/generate-go-fixtures.mjs
 * Output: specs/conformance/fixtures/go-interaction-record/
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'specs/conformance/fixtures/go-interaction-record');

mkdirSync(OUT_DIR, { recursive: true });

// Preflight: ensure built dist artifacts exist
import { existsSync } from 'node:fs';
const cryptoDist = join(ROOT, 'packages/crypto/dist/index.mjs');
const protocolDist = join(ROOT, 'packages/protocol/dist/index.mjs');
if (!existsSync(cryptoDist) || !existsSync(protocolDist)) {
  console.error('ERROR: Built dist artifacts not found. Run `pnpm build` first.');
  console.error(`  Missing: ${!existsSync(cryptoDist) ? cryptoDist : ''} ${!existsSync(protocolDist) ? protocolDist : ''}`);
  process.exit(1);
}

const crypto = await import('../packages/crypto/dist/index.mjs');
const { canonicalize } = crypto;
const { generateKeypair } = crypto;
const protocol = await import('../packages/protocol/dist/index.mjs');
const { issueWire02 } = protocol;

// ---- JCS Golden Vectors ----

const jcsVectors = [
  { id: 'sorted-object', input: { b: 1, a: 2 }, description: 'Simple key sorting' },
  { id: 'nested-object', input: { z: { b: 1, a: 2 }, a: 3 }, description: 'Nested key sorting' },
  { id: 'mixed-array', input: [3, 1, 'b', 'a', true, null], description: 'Array preserves order' },
  { id: 'empty-structures', input: { a: {}, b: [] }, description: 'Empty object and array' },
  { id: 'number-integer', input: { n: 1 }, description: 'Integer 1' },
  { id: 'number-float', input: { n: 0.5 }, description: 'Float 0.5' },
  { id: 'number-negative', input: { n: -1 }, description: 'Negative integer' },
  { id: 'number-zero', input: { n: 0 }, description: 'Zero' },
  { id: 'number-large', input: { n: 9007199254740991 }, description: 'MAX_SAFE_INTEGER' },
  { id: 'boolean-values', input: { t: true, f: false }, description: 'Booleans' },
  { id: 'null-value', input: { v: null }, description: 'Null' },
  {
    id: 'string-escaping',
    input: { s: 'hello\nworld\ttab"quote\\backslash' },
    description: 'String escaping',
  },
  {
    id: 'unicode',
    input: { emoji: '\u00e9', ascii: 'abc' },
    description: 'Unicode characters',
  },
  {
    id: 'real-policy',
    input: { rule: 'allow', scope: ['read', 'write'], version: '1.0' },
    description: 'Real policy document shape',
  },
  { id: 'number-negative-zero', input: { n: -0 }, description: '-0 must serialize as 0' },
  { id: 'number-small-exp', input: { n: 1e-7 }, description: 'Small exponent 1e-7' },
  { id: 'number-large-exp', input: { n: 1e+30 }, description: 'Large exponent 1e+30' },
  { id: 'number-precision', input: { n: 333333333.3333333 }, description: 'Precision boundary' },
  { id: 'number-small-frac', input: { n: 0.002 }, description: 'Small fraction 2e-3' },
  { id: 'number-trailing-zero', input: { n: 4.5 }, description: '4.50 -> 4.5' },
  {
    id: 'number-large-float',
    input: { n: 1.2345678901234568e+21 },
    description: 'Large float near precision boundary',
  },
  {
    id: 'unicode-key-ordering',
    input: { "\u00e9": 1, "a": 2, "\u00c0": 3, "z": 4 },
    description: 'Unicode key ordering (non-ASCII keys sorted by code point)',
  },
];

const jcsResults = jcsVectors.map((v) => ({
  id: v.id,
  description: v.description,
  input: v.input,
  canonical: canonicalize(v.input),
}));

writeFileSync(
  join(OUT_DIR, 'jcs-golden-vectors.json'),
  JSON.stringify({ description: 'JCS (RFC 8785) golden vectors from TypeScript', vectors: jcsResults }, null, 2) + '\n'
);

console.log(`Generated ${jcsResults.length} JCS vectors`);

// ---- Signed Interaction Record Vectors ----

const { privateKey, publicKey } = await generateKeypair();
const publicKeyB64url = Buffer.from(publicKey).toString('base64url');

const issueResult = await issueWire02({
  iss: 'https://crosslang-test.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/cross-language-test',
  privateKey,
  kid: 'crosslang-key-1',
});

writeFileSync(
  join(OUT_DIR, 'ts-issued-receipt.json'),
  JSON.stringify(
    {
      description: 'Interaction record issued by TypeScript, for Go VerifyLocal consumption',
      jws: issueResult.jws,
      public_key_b64url: publicKeyB64url,
      expected: {
        valid: true,
        iss: 'https://crosslang-test.example.com',
        kind: 'evidence',
        type: 'org.peacprotocol/cross-language-test',
        kid: 'crosslang-key-1',
        wire_version: '0.2',
      },
    },
    null,
    2
  ) + '\n'
);

console.log('Generated TS-issued receipt vector');

// ---- Policy Binding Vector ----

const policyDoc = { rule: 'allow', scope: ['read'] };
const policyCanonical = canonicalize(policyDoc);
const { createHash } = await import('node:crypto');
const policyDigest = 'sha256:' + createHash('sha256').update(policyCanonical).digest('hex');

const policyResult = await issueWire02({
  iss: 'https://crosslang-test.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/policy-binding-test',
  privateKey,
  kid: 'crosslang-key-1',
  policy: { digest: policyDigest },
});

writeFileSync(
  join(OUT_DIR, 'policy-binding-vector.json'),
  JSON.stringify(
    {
      description: 'Policy binding cross-language vector',
      jws: policyResult.jws,
      public_key_b64url: publicKeyB64url,
      policy_json: JSON.stringify(policyDoc),
      expected_digest: policyDigest,
      expected_binding: 'verified',
    },
    null,
    2
  ) + '\n'
);

console.log('Generated policy binding vector');
console.log(`All fixtures written to ${OUT_DIR}`);
