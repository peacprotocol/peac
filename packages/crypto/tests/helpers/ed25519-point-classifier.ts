/**
 * Test-only Ed25519 point classifier.
 *
 * Derives the classification of a 32-byte point encoding from RFC 8032 decoding and group
 * arithmetic, independently of the corpus generator. Uses BigInt arithmetic and is not part of the
 * shipped package: nothing here is imported by src/.
 *
 * Field range, sign encoding and curve membership are reported as three separate facts. An encoding
 * with y >= p is out of range; one with x = 0 and the sign bit set is in range but illegally
 * signed; one with y < p may still be off the curve.
 *
 * The group order is 8L. Classification applies ordered, non-disjoint predicates:
 *   [8]P == O   an 8-torsion point, of exact order 1, 2, 4 or 8;
 *   [L]P == O   a prime-subgroup point, of exact order L;
 *   [tL]P == O  otherwise a mixed-order point, of exact order 2L, 4L or 8L.
 * The identity satisfies both [8]O == O and [L]O == O, so small-order classification takes
 * precedence and prime-subgroup membership is recorded as an independent field.
 */

const P = 2n ** 255n - 19n;
/** Prime order of the base-point subgroup. */
export const L = 2n ** 252n + 27742317777372353535851937790883648493n;

type Point = { x: bigint; y: bigint };
const IDENTITY: Point = { x: 0n, y: 1n };
const isIdentity = (p: Point): boolean => p.x === IDENTITY.x && p.y === IDENTITY.y;

function mod(a: bigint): bigint {
  const r = a % P;
  return r < 0n ? r + P : r;
}

function modPow(base: bigint, exponent: bigint): bigint {
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

/** Zero has no modular inverse; returning zero would corrupt every dependent result. */
function modInverse(a: bigint): bigint {
  const v = mod(a);
  if (v === 0n) throw new Error('modular inverse of zero');
  return modPow(v, P - 2n);
}

const D = mod(-121665n * modInverse(121666n));

function add(p1: Point, p2: Point): Point {
  const k = mod(D * p1.x * p2.x * p1.y * p2.y);
  const dx = mod(1n + k);
  const dy = mod(1n - k);
  if (dx === 0n || dy === 0n) throw new Error('Edwards addition denominator is zero');
  return {
    x: mod((p1.x * p2.y + p2.x * p1.y) * modInverse(dx)),
    y: mod((p1.y * p2.y + p1.x * p2.x) * modInverse(dy)),
  };
}

function multiply(n: bigint, point: Point): Point {
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

export type Classification =
  | 'canonical_small_order'
  | 'canonical_prime_subgroup'
  | 'canonical_mixed_order'
  | 'invalid_y_out_of_range'
  | 'invalid_x_zero_sign_set'
  | 'invalid_not_on_curve';

export interface PointFacts {
  /** Encoded y is strictly below the field prime. */
  readonly encodedYInRange: boolean;
  /** The sign bit is a legal encoding for this y. Null when y is out of range. */
  readonly signEncodingValid: boolean | null;
  /** The encoding decodes to a point on the curve. */
  readonly decodesToCurvePoint: boolean;
  readonly classification: Classification;
  /** [L]P == O. True for the identity, which is also a small-order point. */
  readonly primeSubgroupMember: boolean | null;
  /** 1 for prime-subgroup points, otherwise the order of the torsion component. */
  readonly torsionComponentOrder: number | null;
  /** Exact order: '1', '2', '4', '8', 'L', '2L', '4L' or '8L'. */
  readonly exactOrder: string | null;
}

type DecodeResult =
  | { point: Point; signEncodingValid: true }
  | { failure: Exclude<Classification, `canonical_${string}`>; signEncodingValid: boolean | null };

/** RFC 8032 section 5.1.3 point decoding. */
function decode(encoding: Uint8Array): DecodeResult {
  const signBit = encoding[31] >> 7;
  let y = 0n;
  for (let i = 31; i >= 0; i--) {
    y = (y << 8n) | BigInt(i === 31 ? encoding[31] & 0x7f : encoding[i]);
  }
  if (y >= P) return { failure: 'invalid_y_out_of_range', signEncodingValid: null };

  const v = mod(D * y * y + 1n);
  if (v === 0n) return { failure: 'invalid_not_on_curve', signEncodingValid: true };
  const xx = mod(mod(y * y - 1n) * modInverse(v));
  let x = modPow(xx, (P + 3n) / 8n);
  if (mod(x * x - xx) !== 0n) {
    x = mod(x * modPow(2n, (P - 1n) / 4n));
    if (mod(x * x - xx) !== 0n) {
      return { failure: 'invalid_not_on_curve', signEncodingValid: true };
    }
  }
  if (x === 0n && signBit === 1) {
    return { failure: 'invalid_x_zero_sign_set', signEncodingValid: false };
  }
  if (Number(x & 1n) !== signBit) x = mod(P - x);
  return { point: { x, y }, signEncodingValid: true };
}

/** Exact order within the 8-torsion subgroup, proven minimal. */
function smallOrderOf(point: Point, hex: string): number {
  let order = 1;
  let acc = point;
  while (!isIdentity(acc) && order <= 8) {
    acc = add(acc, point);
    order++;
  }
  if (!isIdentity(multiply(BigInt(order), point))) {
    throw new Error(`stated order ${order} does not annihilate ${hex}`);
  }
  for (const divisor of [1, 2, 4]) {
    if (divisor < order && order % divisor === 0 && isIdentity(multiply(BigInt(divisor), point))) {
      throw new Error(`order ${order} is not minimal for ${hex}: ${divisor} also annihilates it`);
    }
  }
  return order;
}

/** Classify one 32-byte encoding from first principles. */
export function classifyPointEncoding(hex: string): PointFacts {
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error(`expected exactly 64 lowercase hexadecimal characters, got: ${hex}`);
  }
  const encoding = Uint8Array.from(Buffer.from(hex, 'hex'));
  const decoded = decode(encoding);

  if ('failure' in decoded) {
    return {
      encodedYInRange: decoded.failure !== 'invalid_y_out_of_range',
      signEncodingValid: decoded.signEncodingValid,
      decodesToCurvePoint: false,
      classification: decoded.failure,
      primeSubgroupMember: null,
      torsionComponentOrder: null,
      exactOrder: null,
    };
  }

  const point = decoded.point;
  if (!isIdentity(multiply(8n * L, point))) {
    throw new Error(`point is not annihilated by the full group order 8L: ${hex}`);
  }
  const shape = {
    encodedYInRange: true,
    signEncodingValid: true as const,
    decodesToCurvePoint: true as const,
  };
  const primeSubgroupMember = isIdentity(multiply(L, point));

  if (isIdentity(multiply(8n, point))) {
    const order = smallOrderOf(point, hex);
    return {
      ...shape,
      classification: 'canonical_small_order',
      primeSubgroupMember,
      torsionComponentOrder: order,
      exactOrder: String(order),
    };
  }
  if (primeSubgroupMember) {
    return {
      ...shape,
      classification: 'canonical_prime_subgroup',
      primeSubgroupMember: true,
      torsionComponentOrder: 1,
      exactOrder: 'L',
    };
  }
  for (const t of [2, 4, 8]) {
    if (isIdentity(multiply(BigInt(t) * L, point))) {
      for (const smaller of [2, 4]) {
        if (smaller < t && isIdentity(multiply(BigInt(smaller) * L, point))) {
          throw new Error(`torsion order ${t} is not minimal for ${hex}`);
        }
      }
      return {
        ...shape,
        classification: 'canonical_mixed_order',
        primeSubgroupMember: false,
        torsionComponentOrder: t,
        exactOrder: `${t}L`,
      };
    }
  }
  throw new Error(`unclassifiable point: ${hex}`);
}
