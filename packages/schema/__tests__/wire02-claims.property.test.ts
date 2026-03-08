/**
 * Property-based tests for Wire02ClaimsSchema (DD-156, DD-158)
 *
 * Uses fast-check to verify invariants across generated inputs:
 * 1. Valid Wire 0.2 claims always parse successfully (roundtrip)
 * 2. Random unknown values never crash the parser (only parse errors)
 * 3. Kind enum is closed: only 'evidence' and 'challenge' accepted
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Wire02ClaimsSchema, isCanonicalIss, isValidReceiptType } from '../src/index';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generate a valid canonical issuer (https:// origin) */
const validIss = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{0,20}$/),
    fc.constantFrom('.com', '.org', '.net', '.io', '.dev')
  )
  .map(([host, tld]) => `https://${host}${tld}`)
  .filter(isCanonicalIss);

/** Generate a valid reverse-DNS receipt type */
const validType = fc
  .tuple(
    fc.constantFrom('org.peacprotocol', 'com.example', 'io.test', 'net.demo'),
    fc.stringMatching(/^[a-z][a-z0-9_-]{0,20}$/)
  )
  .map(([domain, segment]) => `${domain}/${segment}`);

/** Generate a valid Wire 0.2 kind */
const validKind = fc.constantFrom('evidence', 'challenge');

/** Generate valid pillars (sorted, unique, from closed set) */
const allPillars = [
  'access',
  'attribution',
  'commerce',
  'compliance',
  'consent',
  'identity',
  'privacy',
  'provenance',
  'purpose',
  'safety',
] as const;

const validPillars = fc.subarray([...allPillars], { minLength: 1 }).map((arr) => [...arr].sort());

/** Generate a valid jti (UUIDv4-like) */
const validJti = fc.uuid();

/** Generate a valid iat (Unix seconds) */
const validIat = fc.integer({ min: 1_600_000_000, max: 2_000_000_000 });

/** Generate valid minimal Wire 0.2 claims */
const validWire02Claims = fc
  .record({
    kind: validKind,
    type: validType,
    iss: validIss,
    iat: validIat,
    jti: validJti,
  })
  .map((base) => ({
    peac_version: '0.2' as const,
    ...base,
  }));

/** Generate valid Wire 0.2 claims with optional fields */
const validWire02ClaimsFull = fc
  .record({
    kind: validKind,
    type: validType,
    iss: validIss,
    iat: validIat,
    jti: validJti,
    hasSub: fc.boolean(),
    hasPillars: fc.boolean(),
    hasPurpose: fc.boolean(),
  })
  .chain((base) =>
    fc
      .record({
        sub: base.hasSub ? fc.webUrl().map((u) => u.slice(0, 2048)) : fc.constant(undefined),
        pillars: base.hasPillars ? validPillars : fc.constant(undefined),
        purpose_declared: base.hasPurpose
          ? fc.string({ minLength: 1, maxLength: 100 })
          : fc.constant(undefined),
      })
      .map((extras) => ({
        peac_version: '0.2' as const,
        kind: base.kind,
        type: base.type,
        iss: base.iss,
        iat: base.iat,
        jti: base.jti,
        ...(extras.sub !== undefined && { sub: extras.sub }),
        ...(extras.pillars !== undefined && { pillars: extras.pillars }),
        ...(extras.purpose_declared !== undefined && {
          purpose_declared: extras.purpose_declared,
        }),
      }))
  );

/** Generate arbitrary unknown values for crash testing */
const anyValue = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant({}),
  fc.array(fc.string(), { maxLength: 3 }),
  fc.dictionary(fc.string({ maxLength: 10 }), fc.string(), { maxKeys: 5 })
);

// ---------------------------------------------------------------------------
// Property 1: Valid claims roundtrip
// ---------------------------------------------------------------------------

describe('Property: Wire02ClaimsSchema valid claims roundtrip', () => {
  it('valid minimal claims always parse successfully', () => {
    fc.assert(
      fc.property(validWire02Claims, (claims) => {
        const result = Wire02ClaimsSchema.safeParse(claims);
        expect(result.success).toBe(true);
      }),
      { numRuns: 1000 }
    );
  });

  it('valid claims with optional fields parse successfully', () => {
    fc.assert(
      fc.property(validWire02ClaimsFull, (claims) => {
        const result = Wire02ClaimsSchema.safeParse(claims);
        expect(result.success).toBe(true);
      }),
      { numRuns: 1000 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Random values never crash
// ---------------------------------------------------------------------------

describe('Property: Wire02ClaimsSchema never crashes on arbitrary input', () => {
  it('arbitrary unknown values produce parse result, never throw', () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        // safeParse must not throw for any input
        const result = Wire02ClaimsSchema.safeParse(value);
        expect(typeof result.success).toBe('boolean');
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      }),
      { numRuns: 1000 }
    );
  });

  it('random objects with partial fields produce typed parse errors', () => {
    fc.assert(
      fc.property(
        fc.record({
          peac_version: fc.oneof(fc.constant('0.2'), fc.string()),
          kind: fc.oneof(fc.constant('evidence'), fc.constant('challenge'), fc.string()),
          type: fc.string(),
          iss: fc.string(),
          iat: fc.oneof(fc.integer(), fc.string()),
          jti: fc.string(),
        }),
        (partial) => {
          const result = Wire02ClaimsSchema.safeParse(partial);
          expect(typeof result.success).toBe('boolean');
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Kind is closed
// ---------------------------------------------------------------------------

describe('Property: Wire 0.2 kind is a closed 2-value enum', () => {
  it('only evidence and challenge are accepted', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s !== 'evidence' && s !== 'challenge'),
        validType,
        validIss,
        validIat,
        validJti,
        (kind, type, iss, iat, jti) => {
          const result = Wire02ClaimsSchema.safeParse({
            peac_version: '0.2',
            kind,
            type,
            iss,
            iat,
            jti,
          });
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 500 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: isCanonicalIss rejects all non-canonical forms
// ---------------------------------------------------------------------------

describe('Property: isCanonicalIss invariants', () => {
  it('valid https origins are canonical', () => {
    fc.assert(
      fc.property(validIss, (iss) => {
        expect(isCanonicalIss(iss)).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  it('non-https, non-did schemes are never canonical', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('http://', 'ftp://', 'ws://', 'file://'),
        fc.stringMatching(/^[a-z][a-z0-9]{2,10}\.[a-z]{2,4}$/),
        (scheme, host) => {
          expect(isCanonicalIss(`${scheme}${host}`)).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: isValidReceiptType grammar
// ---------------------------------------------------------------------------

describe('Property: isValidReceiptType grammar', () => {
  it('valid reverse-DNS types are accepted', () => {
    fc.assert(
      fc.property(validType, (type) => {
        expect(isValidReceiptType(type)).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  it('empty strings are rejected', () => {
    expect(isValidReceiptType('')).toBe(false);
  });

  it('single-label domains (no dot) are rejected', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9]{1,10}$/),
        fc.stringMatching(/^[a-z][a-z0-9]{1,10}$/),
        (label, seg) => {
          expect(isValidReceiptType(`${label}/${seg}`)).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });
});
