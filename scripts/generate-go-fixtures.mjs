#!/usr/bin/env node
/**
 * Generate cross-language golden vectors for Go SDK testing.
 *
 * Produces JCS canonical vectors and signed interaction records
 * using the TypeScript implementation, consumed by Go tests.
 *
 * Usage: node scripts/generate-go-fixtures.mjs [--jcs-only]
 * Output: specs/conformance/fixtures/go-interaction-record/
 *
 * jcs-golden-vectors.json is DETERMINISTIC: the vector list below is the authoritative input and
 * a second run must leave the file byte-identical (checked in tests/tooling). The two signed
 * vectors (ts-issued-receipt.json, policy-binding-vector.json) generate a fresh keypair each run
 * and are therefore NOT reproducible byte-for-byte by design; pass --jcs-only to regenerate the
 * JCS corpus without touching them.
 *
 * Adversarial vectors carry `expected_utf8_hex` / `expected_sha256`: constants fixed here from an
 * INDEPENDENT computation (Python, 2026-09-06), not from the implementation under test. The
 * generator refuses to write a corpus in which the TypeScript canonicalizer disagrees with them,
 * so the implementation can never become its own oracle for those cases.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'specs/conformance/fixtures/go-interaction-record');

mkdirSync(OUT_DIR, { recursive: true });

// The repository formats every tracked JSON file with prettier (`pnpm format`), and short
// arrays / exponent literals prettier collapses (e.g. `[3, 1, "b"]` on one line, `1e+30` -> `1e30`)
// differ from raw `JSON.stringify(value, null, 2)`. Formatting here, rather than relying on a
// separate manual prettier pass after generation, is what keeps a single
// `node scripts/generate-go-fixtures.mjs [--jcs-only]` invocation byte-identical to the
// committed fixture.
async function writeFormattedJson(filePath, value) {
  const raw = JSON.stringify(value, null, 2) + '\n';
  const config = (await prettier.resolveConfig(filePath)) ?? {};
  const formatted = await prettier.format(raw, { ...config, filepath: filePath, parser: 'json' });
  writeFileSync(filePath, formatted);
}

// Preflight: ensure built dist artifacts exist
import { existsSync } from 'node:fs';
const cryptoDist = join(ROOT, 'packages/crypto/dist/index.mjs');
const protocolDist = join(ROOT, 'packages/protocol/dist/index.mjs');
if (!existsSync(cryptoDist) || !existsSync(protocolDist)) {
  console.error('ERROR: Built dist artifacts not found. Run `pnpm build` first.');
  console.error(
    `  Missing: ${!existsSync(cryptoDist) ? cryptoDist : ''} ${!existsSync(protocolDist) ? protocolDist : ''}`
  );
  process.exit(1);
}

const crypto = await import('../packages/crypto/dist/index.mjs');
const { canonicalize } = crypto;
const { generateKeypair } = crypto;
const { createHash } = await import('node:crypto');
const JCS_ONLY = process.argv.includes('--jcs-only');
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
  { id: 'number-large-exp', input: { n: 1e30 }, description: 'Large exponent 1e+30' },
  { id: 'number-precision', input: { n: 333333333.3333333 }, description: 'Precision boundary' },
  { id: 'number-small-frac', input: { n: 0.002 }, description: 'Small fraction 2e-3' },
  { id: 'number-trailing-zero', input: { n: 4.5 }, description: '4.50 -> 4.5' },
  {
    id: 'number-large-float',
    input: { n: 1.2345678901234568e21 },
    description: 'Large float near precision boundary',
  },
  {
    id: 'unicode-key-ordering',
    input: { '\u00e9': 1, a: 2, '\u00c0': 3, z: 4 },
    // Wording corrected 2026-09-06: RFC 8785 Section 3.2.3 orders member names by UTF-16 code
    // unit, not by code point. For these BMP keys the two orderings coincide, so the vector's
    // identity and bytes are unchanged; only the description was wrong.
    description: 'Unicode key ordering (non-ASCII keys sorted by UTF-16 code unit, RFC 8785 3.2.3)',
  },
  // ---- UTF-16 code-unit ordering (added 2026-09-06 with the Go sdks/go/jcs.go fix) ----
  // The surrogate-vs-PUA pair is the discriminating case: code-point order and UTF-16
  // code-unit order disagree on it. The nested / in-array / prefix cases are structural
  // controls that must keep passing once the comparator is applied at every level.
  {
    id: 'utf16-order-surrogate-vs-pua',
    input: { '\u{1F600}': 1, '\uE000': 2 },
    description:
      'RFC 8785 Section 3.2.3 requires UTF-16 CODE UNIT ordering for object member names, not Unicode code point ordering; the two diverge exactly here. Key A is U+1F600 (encoded in UTF-16 as the surrogate pair D83D DE00). Key B is U+E000 (Private Use Area; a single BMP code unit E000 -- this character is typically rendered invisibly by editors/fonts). By CODE POINT, U+1F600 (0x1F600) > U+E000 (0xE000), so code-point order would place U+E000 first. By UTF-16 CODE UNIT order, the first (and only comparison-relevant) unit of key A is D83D, which is LESS than E000, so key A sorts first. The independently-computed expected UTF-8 bytes are hex 7b22f09f9880223a312c22ee8080223a327d, SHA-256 04208f6cdb854e2ab1b07dd3633a39dec854344fe72824cf7f2fdb4e2e33129e.',
    expected_utf8_hex: '7b22f09f9880223a312c22ee8080223a327d',
    expected_sha256: '04208f6cdb854e2ab1b07dd3633a39dec854344fe72824cf7f2fdb4e2e33129e',
  },
  {
    id: 'utf16-order-nested',
    input: { outer: { '\u{1F600}': 1, '\uE000': 2 } },
    description:
      'The same divergent key pair (U+1F600 surrogate pair vs U+E000) one level deep inside an object member. UTF-16 code-unit ordering must be applied independently at every nesting level, not only at the top level.',
    expected_utf8_hex: '7b226f75746572223a7b22f09f9880223a312c22ee8080223a327d7d',
    expected_sha256: 'e63d65b016c6388a97d0243bdd0422c913b72a0e8191b9a3f007640518c2a65a',
  },
  {
    id: 'utf16-order-in-array',
    input: [{ '\u{1F600}': 1, '\uE000': 2 }, { a: 1 }],
    description:
      "The same divergent key pair inside an object that is itself an array element. Array element order is preserved positionally; only the nested object's own member names are reordered by UTF-16 code unit value.",
    expected_utf8_hex: '5b7b22f09f9880223a312c22ee8080223a327d2c7b2261223a317d5d',
    expected_sha256: '6c9bbeb38add695c9d98cf64288e4cb14610d6624447366439030680c18f6336',
  },
  {
    id: 'utf16-order-prefix-names',
    input: { a: 1, ab: 2, 'a\u{1F600}': 3 },
    description:
      'Prefix-related key names under UTF-16 code-unit lexicographic order: "a" is a strict prefix of both "ab" and "a"+U+1F600, so it sorts first. Between "ab" and "a"+U+1F600, the second code unit decides: \'b\' is U+0062 (code unit 0x62), the leading surrogate of U+1F600 is 0xD83D, and 0x62 < 0xD83D, so "ab" sorts before "a"+U+1F600.',
    expected_utf8_hex: '7b2261223a312c226162223a322c2261f09f9880223a337d',
    expected_sha256: '2e265b2046ffbb55e607f7722799d4d9a0f3a320168f5526870ff862ec561e08',
  },
];

const jcsResults = jcsVectors.map((v) => {
  const canonical = canonicalize(v.input);
  const out = { id: v.id, description: v.description, input: v.input, canonical };
  if (v.expected_utf8_hex !== undefined || v.expected_sha256 !== undefined) {
    const bytes = Buffer.from(canonical, 'utf8');
    const hex = bytes.toString('hex');
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (hex !== v.expected_utf8_hex || sha !== v.expected_sha256) {
      console.error(
        `ERROR: vector ${v.id}: TypeScript canonicalize() disagrees with the independently fixed expectation`
      );
      console.error(`  expected hex ${v.expected_utf8_hex} sha256 ${v.expected_sha256}`);
      console.error(`  got      hex ${hex} sha256 ${sha}`);
      process.exit(1);
    }
    out.expected_utf8_hex = hex;
    out.expected_sha256 = sha;
  }
  return out;
});

await writeFormattedJson(join(OUT_DIR, 'jcs-golden-vectors.json'), {
  description: 'JCS (RFC 8785) golden vectors from TypeScript',
  vectors: jcsResults,
});

console.log(`Generated ${jcsResults.length} JCS vectors`);
if (JCS_ONLY) {
  console.log('--jcs-only: signed vectors left untouched');
  process.exit(0);
}

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
