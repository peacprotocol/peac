#!/usr/bin/env node
/**
 * Test-only generator for the Ed25519 edge-point corpus.
 *
 * Every candidate is decoded per RFC 8032 section 5.1.3 and, when it decodes, placed in the
 * subgroup structure of edwards25519 by computing [8]P and [L]P.
 *
 * The corpus keeps four things apart that are easy to conflate and expensive to confuse:
 *   classification  what the encoding mathematically IS;
 *   precheck action what the bounded PEAC precheck DOES with it;
 *   mechanism       WHERE that decision is enforced;
 *   profile result  what the complete verifier ultimately returns.
 *
 * Usage:
 *   node generate-ed25519-edge-corpus.mjs                      rewrite the fixture
 *   node generate-ed25519-edge-corpus.mjs --check              compare against the committed fixture
 *   node generate-ed25519-edge-corpus.mjs --check --fixture P  compare against the file at P
 *
 * The --fixture override exists so a negative control can verify against a disposable copy. Tests
 * must never mutate the tracked fixture: parallel workers would read it mid-corruption, and an
 * abrupt exit would leave the worktree dirty.
 *
 * Not shipped. The production predicate is a bounded byte-level precheck with no curve arithmetic.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CRYPTO_ROOT = join(HERE, '..', '..');
const REPO_ROOT = join(CRYPTO_ROOT, '..', '..');
const FIXTURES = join(CRYPTO_ROOT, 'tests', 'fixtures');
const DEFAULT_FIXTURE = join(FIXTURES, 'ed25519-edge-point-encodings.json');

/**
 * Fixture path, overridable with --fixture.
 *
 * The override exists so a negative control can verify against a disposable copy. Tests must never
 * mutate the tracked fixture: parallel workers would read it mid-corruption, and an abrupt exit
 * would leave the worktree dirty.
 */
function resolveFixturePath(argv) {
  const at = argv.indexOf('--fixture');
  if (at === -1) return DEFAULT_FIXTURE;
  const value = argv[at + 1];
  if (!value) throw new Error('--fixture requires a path');
  return value;
}

const P = 2n ** 255n - 19n;
const L = 2n ** 252n + 27742317777372353535851937790883648493n;

const mod = (a) => ((a % P) + P) % P;
function modPow(base, exponent) {
  let result = 1n;
  let b = mod(base);
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return result;
}
function modInverse(a) {
  const v = mod(a);
  if (v === 0n) throw new Error('modular inverse of zero');
  return modPow(v, P - 2n);
}
const D = mod(-121665n * modInverse(121666n));
const IDENTITY = { x: 0n, y: 1n };
const isIdentity = (p) => p.x === IDENTITY.x && p.y === IDENTITY.y;

function add(p1, p2) {
  const k = mod(D * p1.x * p2.x * p1.y * p2.y);
  const dx = mod(1n + k);
  const dy = mod(1n - k);
  if (dx === 0n || dy === 0n) throw new Error('Edwards addition denominator is zero');
  return {
    x: mod((p1.x * p2.y + p2.x * p1.y) * modInverse(dx)),
    y: mod((p1.y * p2.y + p1.x * p2.x) * modInverse(dy)),
  };
}
function multiply(n, point) {
  let result = IDENTITY;
  let addend = point;
  let e = n;
  while (e > 0n) {
    if (e & 1n) result = add(result, addend);
    addend = add(addend, addend);
    e >>= 1n;
  }
  return result;
}

/**
 * RFC 8032 5.1.3 decoding, reporting each condition separately.
 *
 * There is deliberately no single "canonical" boolean: field-range validity, sign-encoding
 * validity and curve membership are three independent facts, and collapsing them into one flag
 * mislabels at least one case however the flag is defined.
 */
function decode(hex) {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error(`not 64 lowercase hex characters: ${hex}`);
  const bytes = Uint8Array.from(Buffer.from(hex, 'hex'));
  const signBit = bytes[31] >> 7;
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(i === 31 ? bytes[31] & 0x7f : bytes[i]);

  if (y >= P) {
    return {
      encoded_y_in_range: false,
      sign_encoding_valid: null,
      decodes_to_curve_point: false,
      primary_class: 'invalid_y_out_of_range',
    };
  }

  const u = mod(y * y - 1n);
  const v = mod(D * y * y + 1n);
  if (v === 0n) {
    return {
      encoded_y_in_range: true,
      sign_encoding_valid: true,
      decodes_to_curve_point: false,
      primary_class: 'invalid_not_on_curve',
    };
  }
  const xx = mod(u * modInverse(v));
  let x = modPow(xx, (P + 3n) / 8n);
  if (mod(x * x - xx) !== 0n) {
    x = mod(x * modPow(2n, (P - 1n) / 4n));
    if (mod(x * x - xx) !== 0n) {
      return {
        encoded_y_in_range: true,
        sign_encoding_valid: true,
        decodes_to_curve_point: false,
        primary_class: 'invalid_not_on_curve',
      };
    }
  }
  if (x === 0n && signBit === 1) {
    return {
      encoded_y_in_range: true,
      sign_encoding_valid: false,
      decodes_to_curve_point: false,
      primary_class: 'invalid_x_zero_sign_set',
    };
  }
  if (Number(x & 1n) !== signBit) x = mod(P - x);
  return {
    encoded_y_in_range: true,
    sign_encoding_valid: true,
    decodes_to_curve_point: true,
    point: { x, y },
  };
}

/** Mathematical facts only. Policy is decided separately. */
function classify(hex) {
  const decoded = decode(hex);
  const shape = {
    encoded_y_in_range: decoded.encoded_y_in_range,
    sign_encoding_valid: decoded.sign_encoding_valid,
    decodes_to_curve_point: decoded.decodes_to_curve_point,
  };
  if (!decoded.decodes_to_curve_point) {
    return {
      ...shape,
      primary_class: decoded.primary_class,
      prime_subgroup_member: null,
      torsion_component_order: null,
      exact_order: null,
    };
  }

  const point = decoded.point;
  if (!isIdentity(multiply(8n * L, point))) {
    throw new Error(`point is not annihilated by the full group order 8L: ${hex}`);
  }
  // Membership is its own predicate: the identity satisfies [L]O = O and is also small order,
  // so the two facts must never share a field.
  const primeSubgroupMember = isIdentity(multiply(L, point));

  if (isIdentity(multiply(8n, point))) {
    let order = 1;
    let acc = point;
    while (!isIdentity(acc) && order <= 8) {
      acc = add(acc, point);
      order++;
    }
    if (!isIdentity(multiply(BigInt(order), point))) {
      throw new Error(`stated order ${order} does not annihilate ${hex}`);
    }
    for (const divisor of [1, 2, 4].filter((d) => d < order && order % d === 0)) {
      if (isIdentity(multiply(BigInt(divisor), point))) {
        throw new Error(`order ${order} is not minimal for ${hex}: ${divisor} also annihilates it`);
      }
    }
    return {
      ...shape,
      primary_class: 'canonical_small_order',
      prime_subgroup_member: primeSubgroupMember,
      torsion_component_order: order,
      exact_order: String(order),
    };
  }
  if (primeSubgroupMember) {
    return {
      ...shape,
      primary_class: 'canonical_prime_subgroup',
      prime_subgroup_member: true,
      torsion_component_order: 1,
      exact_order: 'L',
    };
  }
  for (const t of [2, 4, 8]) {
    if (isIdentity(multiply(BigInt(t) * L, point))) {
      for (const smaller of [2, 4].filter((s) => s < t)) {
        if (isIdentity(multiply(BigInt(smaller) * L, point))) {
          throw new Error(`torsion order ${t} is not minimal for ${hex}`);
        }
      }
      return {
        ...shape,
        primary_class: 'canonical_mixed_order',
        prime_subgroup_member: false,
        torsion_component_order: t,
        exact_order: `${t}L`,
      };
    }
  }
  throw new Error(`unclassifiable point: ${hex}`);
}

/**
 * The 0.16.3 baseline, read from an immutable pinned snapshot rather than from the live source.
 *
 * Reading production files here would let a later implementation change silently redefine what the
 * historical baseline was, which is exactly the drift this field exists to record.
 */
function baselineTable() {
  const pinned = JSON.parse(readFileSync(join(FIXTURES, 'ed25519-baseline-0.16.3.json'), 'utf8'));
  if (!pinned.tables_identical) throw new Error('pinned baseline tables are not identical');
  return pinned.typescript_table;
}

/**
 * Candidate encodings rejected by Node during one-shot EdDSA verification.
 *
 *   repository:  github.com/nodejs/node
 *   pull request: 64026 ("crypto: reject small-order EdDSA points during verify")
 *   commit:      0908d76ef6, authored 2026-07-03
 *   file:        src/crypto/crypto_sig.cc
 *   constant:    kEd25519SmallOrderPoints
 *   released in: v26.5.0 (2026-07-08)
 *   retrieved:   2026-08-05
 *   status:      COMPARATIVE evidence and provenance only. Not normative for PEAC, and not a
 *                specification. Every value here is independently classified below; none is
 *                accepted into the profile on the strength of Node's table alone.
 *
 * Transcribed rather than fetched: CI must not depend on network retrieval of external vectors.
 */
const NODE_CANDIDATES = [
  '0100000000000000000000000000000000000000000000000000000000000000',
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  '0000000000000000000000000000000000000000000000000000000000000080',
  '0000000000000000000000000000000000000000000000000000000000000000',
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa',
  '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
  '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85',
  '0100000000000000000000000000000000000000000000000000000000000080',
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
];

/** Ordinary inputs the profile must continue to accept, so the corpus proves preservation too. */
function positiveControls() {
  const vectors = JSON.parse(
    readFileSync(
      join(
        REPO_ROOT,
        'specs',
        'conformance',
        'parity-corpus',
        'ed25519-peac-profile',
        'vectors.json'
      ),
      'utf8'
    )
  ).vectors;
  const pick = (id) => {
    const v = vectors.find((entry) => entry.id === id);
    if (!v) throw new Error(`positive-control vector not found: ${id}`);
    return v;
  };
  const rfc = pick('rfc8032-vector-1');
  const peac = pick('peac-sign-positive');
  return [
    [rfc.public_key_hex.toLowerCase(), `public key, ${rfc.source}`],
    [rfc.signature_hex.slice(0, 64).toLowerCase(), `signature R, ${rfc.source}`],
    [peac.public_key_hex.toLowerCase(), `public key, ${peac.source}`],
    [peac.signature_hex.slice(0, 64).toLowerCase(), `signature R, ${peac.source}`],
  ];
}

/** Smallest y < p that decodes to no curve point, so the corpus covers that failure too. */
function offCurveControl() {
  for (let y = 2n; y < 4096n; y++) {
    const le = Buffer.alloc(32);
    let rest = y;
    for (let i = 0; i < 32 && rest > 0n; i++) {
      le[i] = Number(rest & 0xffn);
      rest >>= 8n;
    }
    const hex = le.toString('hex');
    if (decode(hex).primary_class === 'invalid_not_on_curve') {
      return [hex, `smallest y < p that is not on the curve (y = ${y})`];
    }
  }
  throw new Error('no off-curve control found below y = 4096');
}

/** Named encoded-y boundaries, in both sign-bit variants, so the corpus shows them explicitly. */
function boundaryControls() {
  const encode = (y, signBit) => {
    const le = Buffer.alloc(32);
    let rest = y;
    for (let i = 0; i < 32 && rest > 0n; i++) {
      le[i] = Number(rest & 0xffn);
      rest >>= 8n;
    }
    if (signBit) le[31] |= 0x80;
    return le.toString('hex');
  };
  const named = [
    [P - 1n, 'encoded y = p - 1'],
    [P, 'encoded y = p'],
    [P + 1n, 'encoded y = p + 1'],
    [2n ** 255n - 1n, 'maximum 255-bit encoded y'],
  ];
  const out = [];
  for (const [y, label] of named) {
    for (const signBit of [0, 1]) {
      // A y at or above p has no legal sign variant to distinguish, but both encodings exist as
      // byte strings and both must be classified.
      out.push([encode(y & (2n ** 255n - 1n), signBit), `${label}, sign bit ${signBit}`]);
    }
  }
  return out;
}

const PEAC_MIXED_ORDER_REJECTIONS = [
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac0305',
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac0385',
];

function mechanism(facts, isTorsion, isMixed) {
  if (facts.primary_class === 'invalid_y_out_of_range') return 'encoded_y_range_check';
  if (facts.primary_class === 'invalid_x_zero_sign_set') return 'x_zero_sign_check';
  if (isTorsion) return 'torsion_table';
  if (isMixed) return 'mixed_order_profile_table';
  return 'runtime_primitive';
}

function build() {
  const baseline = baselineTable();
  const provenance = new Map();
  const record = (hex, source) => {
    const key = hex.toLowerCase();
    provenance.set(key, [...(provenance.get(key) ?? []), source]);
  };

  for (const hex of baseline) record(hex, 'peac 0.16.3 pinned baseline table');
  for (const hex of NODE_CANDIDATES) record(hex, 'nodejs/node#64026');
  for (const [hex, source] of positiveControls()) record(hex, source);
  const [offCurve, offCurveSource] = offCurveControl();
  record(offCurve, offCurveSource);
  const offCurveSigned = Buffer.from(offCurve, 'hex');
  offCurveSigned[31] |= 0x80;
  record(offCurveSigned.toString('hex'), `${offCurveSource}, sign bit 1`);
  for (const [hex, label] of boundaryControls()) record(hex, label);

  const entries = [...provenance.keys()].sort().map((hex) => {
    const facts = classify(hex);
    const isTorsion = facts.primary_class === 'canonical_small_order';
    const isMixed = PEAC_MIXED_ORDER_REJECTIONS.includes(hex);
    const prechecked =
      isTorsion ||
      isMixed ||
      facts.primary_class === 'invalid_y_out_of_range' ||
      facts.primary_class === 'invalid_x_zero_sign_set';
    // An off-curve encoding is inadmissible, but the bounded precheck does not detect it: the
    // runtime primitive rejects it. Precheck action and profile result therefore differ.
    const profileResult =
      !facts.decodes_to_curve_point || isTorsion || isMixed
        ? 'reject'
        : 'accept_when_signature_valid';
    return {
      encoding_hex: hex,
      ...facts,
      baseline_0_16_3_table_membership: baseline.includes(hex),
      // Position-aware, because 0.16.3 applied its table to the public key ONLY. Recording one
      // action per encoding would erase the very asymmetry this change repairs.
      baseline_0_16_3_precheck: {
        public_key_A: baseline.includes(hex) ? 'reject' : 'delegate',
        signature_R: 'delegate',
      },
      target_precheck: {
        public_key_A: prechecked ? 'reject' : 'delegate',
        signature_R: prechecked ? 'reject' : 'delegate',
      },
      target_enforcement_mechanism: mechanism(facts, isTorsion, isMixed),
      expected_profile_result: profileResult,
      provenance: provenance.get(hex),
    };
  });

  return {
    corpus: 'ed25519-edge-point-encodings',
    version: '2',
    description:
      'Ed25519 point encodings at the edges of admissibility, together with ordinary inputs the ' +
      'profile must continue to accept. Mathematical fields state what an encoding IS, derived ' +
      'from RFC 8032 decoding and group arithmetic. The precheck-action fields state what the ' +
      'bounded PEAC precheck DOES, the mechanism field states WHERE it is enforced, and ' +
      'expected_profile_result states what the complete verifier returns. Those differ: an ' +
      'off-curve encoding is delegated by the precheck and rejected by the runtime primitive. ' +
      'Regenerate with tests/tools/generate-ed25519-edge-corpus.mjs.',
    entries,
  };
}

const fixturePath = resolveFixturePath(process.argv);
const serialized = `${JSON.stringify(build(), null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(fixturePath, 'utf8') !== serialized) {
    console.error(`ed25519 edge corpus: ${fixturePath} differs from a fresh generation.`);
    process.exit(1);
  }
  console.log('ed25519 edge corpus: OK -- the fixture matches a fresh generation.');
} else {
  writeFileSync(fixturePath, serialized);
  console.log(`ed25519 edge corpus: wrote ${JSON.parse(serialized).entries.length} entries.`);
}
