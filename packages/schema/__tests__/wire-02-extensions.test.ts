/**
 * Wire 0.2 Typed Extension Group tests (DD-153 revised)
 *
 * Covers:
 *   - isValidExtensionKey(): grammar validation (DNS labels, lowercase, dots, segments)
 *   - CommerceExtensionSchema: amount_minor string grammar, .strict(), bounds
 *   - AccessExtensionSchema: decision enum, .strict()
 *   - ChallengeExtensionSchema: 7 challenge_type values, RFC 9457 problem, .strict()/.passthrough()
 *   - IdentityExtensionSchema: proof_ref only, no actor_binding, .strict()
 *   - CorrelationExtensionSchema: OTel trace/span lowercase hex, .strict()
 *   - Typed accessors: absent returns undefined, invalid throws PEACError with leaf-precise pointer
 *   - Wire02ClaimsSchema integration: extension validation in superRefine
 *   - EXTENSION_LIMITS constant export
 */

import { describe, it, expect } from 'vitest';
import {
  // Schemas
  CommerceExtensionSchema,
  AccessExtensionSchema,
  ChallengeExtensionSchema,
  ChallengeTypeSchema,
  ProblemDetailsSchema,
  IdentityExtensionSchema,
  CorrelationExtensionSchema,
  Wire02ClaimsSchema,
  // Constants
  COMMERCE_EXTENSION_KEY,
  ACCESS_EXTENSION_KEY,
  CHALLENGE_EXTENSION_KEY,
  IDENTITY_EXTENSION_KEY,
  CORRELATION_EXTENSION_KEY,
  CHALLENGE_TYPES,
  EXTENSION_LIMITS,
  ERROR_CODES,
  // Grammar validator
  isValidExtensionKey,
  // Typed accessors
  getCommerceExtension,
  getAccessExtension,
  getChallengeExtension,
  getIdentityExtension,
  getCorrelationExtension,
  // Types
  type Wire02Claims,
  type PEACError,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function minimalEvidence(overrides?: Partial<Wire02Claims>): object {
  return {
    peac_version: '0.2',
    kind: 'evidence',
    type: 'org.peacprotocol/commerce',
    iss: 'https://example.com',
    iat: 1700000000,
    jti: 'test-jti-ext-01',
    ...overrides,
  };
}

function minimalChallenge(overrides?: Partial<Wire02Claims>): object {
  return {
    peac_version: '0.2',
    kind: 'challenge',
    type: 'org.peacprotocol/challenge',
    iss: 'https://example.com',
    iat: 1700000000,
    jti: 'test-jti-ext-02',
    ...overrides,
  };
}

const VALID_COMMERCE = {
  payment_rail: 'stripe',
  amount_minor: '1000',
  currency: 'USD',
};

const VALID_ACCESS = {
  resource: 'https://api.example.com/data',
  action: 'read',
  decision: 'allow' as const,
};

const VALID_PROBLEM = {
  status: 402,
  type: 'https://example.com/problems/payment-required',
  title: 'Payment Required',
};

const VALID_CHALLENGE = {
  challenge_type: 'payment_required' as const,
  problem: VALID_PROBLEM,
};

const VALID_IDENTITY = {
  proof_ref: 'sha256:' + 'a'.repeat(64),
};

const VALID_CORRELATION = {
  trace_id: 'a'.repeat(32),
  span_id: 'b'.repeat(16),
};

// ---------------------------------------------------------------------------
// isValidExtensionKey: grammar validation
// ---------------------------------------------------------------------------

describe('isValidExtensionKey(): grammar validation', () => {
  const VALID_KEYS = [
    'org.peacprotocol/commerce',
    'org.peacprotocol/access',
    'org.peacprotocol/challenge',
    'org.peacprotocol/identity',
    'org.peacprotocol/correlation',
    'com.example/custom',
    'io.github.user/tool-name',
    'org.w3c/did-resolution',
    'net.example/my_ext',
  ];

  const INVALID_KEYS = [
    '',
    'commerce',
    'org/commerce', // no dot in domain
    '/commerce', // empty domain
    'org.peacprotocol/', // empty segment
    'org.peacprotocol', // no slash
    'Org.peacprotocol/commerce', // uppercase in domain
    'org.Peacprotocol/commerce', // uppercase in domain
    'org.peacprotocol/Commerce', // uppercase in segment
    'org.peacprotocol/COMMERCE', // all uppercase segment
    '.example.com/ext', // leading dot
    'example.com./ext', // trailing dot
    'org.peace protocol/ext', // space in domain
    'org.peacprotocol/ext group', // space in segment
    'org..peacprotocol/ext', // double dot (empty label)
    '-org.peacprotocol/ext', // leading hyphen in label
    'org-.peacprotocol/ext', // trailing hyphen in label
  ];

  for (const key of VALID_KEYS) {
    it(`accepts: ${key}`, () => {
      expect(isValidExtensionKey(key)).toBe(true);
    });
  }

  for (const key of INVALID_KEYS) {
    it(`rejects: ${JSON.stringify(key)}`, () => {
      expect(isValidExtensionKey(key)).toBe(false);
    });
  }

  // DNS length bounds (RFC 1035)
  it('rejects DNS label exceeding 63 chars', () => {
    const longLabel = 'a'.repeat(64);
    expect(isValidExtensionKey(`${longLabel}.example/ext`)).toBe(false);
  });

  it('accepts DNS label at exactly 63 chars', () => {
    const label63 = 'a'.repeat(63);
    expect(isValidExtensionKey(`${label63}.example/ext`)).toBe(true);
  });

  it('rejects domain exceeding 253 chars', () => {
    // Build a domain longer than 253 chars from valid 63-char labels
    // 4 labels of 63 chars + 3 dots = 255, which exceeds 253
    const label = 'a'.repeat(63);
    const domain = `${label}.${label}.${label}.${label}`;
    expect(domain.length).toBeGreaterThan(253);
    expect(isValidExtensionKey(`${domain}/ext`)).toBe(false);
  });

  it('rejects overall key exceeding maxExtensionKeyLength', () => {
    const longSegment = 'a'.repeat(EXTENSION_LIMITS.maxExtensionKeyLength);
    expect(isValidExtensionKey(`org.example/${longSegment}`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CommerceExtensionSchema
// ---------------------------------------------------------------------------

describe('CommerceExtensionSchema', () => {
  it('accepts valid commerce extension', () => {
    const result = CommerceExtensionSchema.safeParse(VALID_COMMERCE);
    expect(result.success).toBe(true);
  });

  it('accepts commerce with all optional fields', () => {
    const result = CommerceExtensionSchema.safeParse({
      ...VALID_COMMERCE,
      reference: 'ref-001',
      asset: 'ETH',
      env: 'live',
    });
    expect(result.success).toBe(true);
  });

  it('accepts negative amount_minor', () => {
    const result = CommerceExtensionSchema.safeParse({
      ...VALID_COMMERCE,
      amount_minor: '-500',
    });
    expect(result.success).toBe(true);
  });

  it('accepts zero amount_minor', () => {
    const result = CommerceExtensionSchema.safeParse({
      ...VALID_COMMERCE,
      amount_minor: '0',
    });
    expect(result.success).toBe(true);
  });

  it('accepts large amount_minor (arbitrary precision)', () => {
    const result = CommerceExtensionSchema.safeParse({
      ...VALID_COMMERCE,
      amount_minor: '99999999999999999999',
    });
    expect(result.success).toBe(true);
  });

  it('rejects decimal amount_minor', () => {
    const result = CommerceExtensionSchema.safeParse({
      ...VALID_COMMERCE,
      amount_minor: '10.50',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty amount_minor', () => {
    const result = CommerceExtensionSchema.safeParse({
      ...VALID_COMMERCE,
      amount_minor: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects amount_minor with leading space', () => {
    const result = CommerceExtensionSchema.safeParse({
      ...VALID_COMMERCE,
      amount_minor: ' 100',
    });
    expect(result.success).toBe(false);
  });

  it('rejects amount_minor with hex', () => {
    const result = CommerceExtensionSchema.safeParse({
      ...VALID_COMMERCE,
      amount_minor: '0xff',
    });
    expect(result.success).toBe(false);
  });

  it('rejects numeric amount_minor (must be string)', () => {
    const result = CommerceExtensionSchema.safeParse({
      ...VALID_COMMERCE,
      amount_minor: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects env value outside enum', () => {
    const result = CommerceExtensionSchema.safeParse({
      ...VALID_COMMERCE,
      env: 'staging',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys (strict mode)', () => {
    const result = CommerceExtensionSchema.safeParse({
      ...VALID_COMMERCE,
      unknown_field: 'should reject',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = CommerceExtensionSchema.safeParse({
      payment_rail: 'stripe',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AccessExtensionSchema
// ---------------------------------------------------------------------------

describe('AccessExtensionSchema', () => {
  it('accepts valid access extension', () => {
    const result = AccessExtensionSchema.safeParse(VALID_ACCESS);
    expect(result.success).toBe(true);
  });

  it('accepts deny decision', () => {
    const result = AccessExtensionSchema.safeParse({
      ...VALID_ACCESS,
      decision: 'deny',
    });
    expect(result.success).toBe(true);
  });

  it('accepts review decision', () => {
    const result = AccessExtensionSchema.safeParse({
      ...VALID_ACCESS,
      decision: 'review',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown decision value', () => {
    const result = AccessExtensionSchema.safeParse({
      ...VALID_ACCESS,
      decision: 'maybe',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys (strict mode)', () => {
    const result = AccessExtensionSchema.safeParse({
      ...VALID_ACCESS,
      extra: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty resource', () => {
    const result = AccessExtensionSchema.safeParse({
      ...VALID_ACCESS,
      resource: '',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ChallengeExtensionSchema + ProblemDetailsSchema
// ---------------------------------------------------------------------------

describe('ChallengeExtensionSchema', () => {
  it('accepts valid challenge extension', () => {
    const result = ChallengeExtensionSchema.safeParse(VALID_CHALLENGE);
    expect(result.success).toBe(true);
  });

  it('has exactly 7 challenge_type values', () => {
    expect(CHALLENGE_TYPES).toHaveLength(7);
    expect(CHALLENGE_TYPES).toContain('purpose_disallowed');
  });

  for (const ct of CHALLENGE_TYPES) {
    it(`accepts challenge_type: ${ct}`, () => {
      const result = ChallengeTypeSchema.safeParse(ct);
      expect(result.success).toBe(true);
    });
  }

  it('rejects unknown challenge_type', () => {
    const result = ChallengeExtensionSchema.safeParse({
      ...VALID_CHALLENGE,
      challenge_type: 'unknown_type',
    });
    expect(result.success).toBe(false);
  });

  it('accepts challenge with optional fields', () => {
    const result = ChallengeExtensionSchema.safeParse({
      ...VALID_CHALLENGE,
      resource: 'https://example.com/api',
      action: 'write',
      requirements: { min_amount: 100 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown keys on challenge (strict mode)', () => {
    const result = ChallengeExtensionSchema.safeParse({
      ...VALID_CHALLENGE,
      extra_field: 'should reject',
    });
    expect(result.success).toBe(false);
  });
});

describe('ProblemDetailsSchema: RFC 9457', () => {
  it('accepts minimal problem (status + type)', () => {
    const result = ProblemDetailsSchema.safeParse({
      status: 402,
      type: 'https://example.com/problems/payment',
    });
    expect(result.success).toBe(true);
  });

  it('accepts problem with all optional fields', () => {
    const result = ProblemDetailsSchema.safeParse({
      status: 403,
      type: 'https://example.com/problems/forbidden',
      title: 'Forbidden',
      detail: 'You do not have access to this resource',
      instance: 'https://example.com/problems/forbidden/instance/123',
    });
    expect(result.success).toBe(true);
  });

  it('accepts problem with extension members (passthrough)', () => {
    const result = ProblemDetailsSchema.safeParse({
      status: 429,
      type: 'https://example.com/problems/rate-limit',
      retry_after: 60,
      custom_field: 'allowed by passthrough',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).retry_after).toBe(60);
    }
  });

  it('rejects status below 100', () => {
    const result = ProblemDetailsSchema.safeParse({
      status: 99,
      type: 'https://example.com/problems/bad',
    });
    expect(result.success).toBe(false);
  });

  it('rejects status above 599', () => {
    const result = ProblemDetailsSchema.safeParse({
      status: 600,
      type: 'https://example.com/problems/bad',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer status', () => {
    const result = ProblemDetailsSchema.safeParse({
      status: 200.5,
      type: 'https://example.com/problems/bad',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing status', () => {
    const result = ProblemDetailsSchema.safeParse({
      type: 'https://example.com/problems/bad',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing type', () => {
    const result = ProblemDetailsSchema.safeParse({
      status: 400,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-URL type', () => {
    const result = ProblemDetailsSchema.safeParse({
      status: 400,
      type: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('accepts status 100 (lower bound)', () => {
    const result = ProblemDetailsSchema.safeParse({
      status: 100,
      type: 'https://example.com/problems/info',
    });
    expect(result.success).toBe(true);
  });

  it('accepts status 599 (upper bound)', () => {
    const result = ProblemDetailsSchema.safeParse({
      status: 599,
      type: 'https://example.com/problems/custom',
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// IdentityExtensionSchema
// ---------------------------------------------------------------------------

describe('IdentityExtensionSchema', () => {
  it('accepts valid identity extension with proof_ref', () => {
    const result = IdentityExtensionSchema.safeParse(VALID_IDENTITY);
    expect(result.success).toBe(true);
  });

  it('accepts empty object (proof_ref is optional)', () => {
    const result = IdentityExtensionSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects unknown keys (strict mode): no actor_binding field', () => {
    const result = IdentityExtensionSchema.safeParse({
      proof_ref: 'sha256:' + 'a'.repeat(64),
      actor_binding: { id: 'agent-001' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects proof_ref exceeding max length', () => {
    const result = IdentityExtensionSchema.safeParse({
      proof_ref: 'x'.repeat(EXTENSION_LIMITS.maxProofRefLength + 1),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CorrelationExtensionSchema
// ---------------------------------------------------------------------------

describe('CorrelationExtensionSchema', () => {
  it('accepts valid correlation extension', () => {
    const result = CorrelationExtensionSchema.safeParse(VALID_CORRELATION);
    expect(result.success).toBe(true);
  });

  it('accepts empty object (all fields optional)', () => {
    const result = CorrelationExtensionSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts correlation with workflow fields', () => {
    const result = CorrelationExtensionSchema.safeParse({
      ...VALID_CORRELATION,
      workflow_id: 'wf-001',
      parent_jti: 'parent-jti-001',
      depends_on: ['dep-001', 'dep-002'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects trace_id with uppercase hex', () => {
    const result = CorrelationExtensionSchema.safeParse({
      trace_id: 'A'.repeat(32),
    });
    expect(result.success).toBe(false);
  });

  it('rejects trace_id with mixed case', () => {
    const result = CorrelationExtensionSchema.safeParse({
      trace_id: 'aAbBcCdD' + 'e'.repeat(24),
    });
    expect(result.success).toBe(false);
  });

  it('rejects trace_id with wrong length (31 chars)', () => {
    const result = CorrelationExtensionSchema.safeParse({
      trace_id: 'a'.repeat(31),
    });
    expect(result.success).toBe(false);
  });

  it('rejects trace_id with wrong length (33 chars)', () => {
    const result = CorrelationExtensionSchema.safeParse({
      trace_id: 'a'.repeat(33),
    });
    expect(result.success).toBe(false);
  });

  it('rejects span_id with uppercase hex', () => {
    const result = CorrelationExtensionSchema.safeParse({
      span_id: 'A'.repeat(16),
    });
    expect(result.success).toBe(false);
  });

  it('rejects span_id with mixed case', () => {
    const result = CorrelationExtensionSchema.safeParse({
      span_id: 'aAbB' + 'c'.repeat(12),
    });
    expect(result.success).toBe(false);
  });

  it('rejects span_id with wrong length (15 chars)', () => {
    const result = CorrelationExtensionSchema.safeParse({
      span_id: 'a'.repeat(15),
    });
    expect(result.success).toBe(false);
  });

  it('rejects span_id with wrong length (17 chars)', () => {
    const result = CorrelationExtensionSchema.safeParse({
      span_id: 'a'.repeat(17),
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys (strict mode)', () => {
    const result = CorrelationExtensionSchema.safeParse({
      trace_id: 'a'.repeat(32),
      custom_field: 'should reject',
    });
    expect(result.success).toBe(false);
  });

  it('rejects depends_on exceeding max length', () => {
    const items = Array.from(
      { length: EXTENSION_LIMITS.maxDependsOnLength + 1 },
      (_, i) => `dep-${i}`
    );
    const result = CorrelationExtensionSchema.safeParse({
      depends_on: items,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Typed accessors: absent returns undefined
// ---------------------------------------------------------------------------

describe('Typed accessors: absent key returns undefined', () => {
  it('getCommerceExtension returns undefined for undefined extensions', () => {
    expect(getCommerceExtension(undefined)).toBeUndefined();
  });

  it('getCommerceExtension returns undefined when key absent', () => {
    expect(getCommerceExtension({})).toBeUndefined();
  });

  it('getAccessExtension returns undefined for undefined extensions', () => {
    expect(getAccessExtension(undefined)).toBeUndefined();
  });

  it('getChallengeExtension returns undefined for undefined extensions', () => {
    expect(getChallengeExtension(undefined)).toBeUndefined();
  });

  it('getIdentityExtension returns undefined for undefined extensions', () => {
    expect(getIdentityExtension(undefined)).toBeUndefined();
  });

  it('getCorrelationExtension returns undefined for undefined extensions', () => {
    expect(getCorrelationExtension(undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Typed accessors: valid value returns parsed data
// ---------------------------------------------------------------------------

describe('Typed accessors: valid value returns parsed data', () => {
  it('getCommerceExtension returns parsed CommerceExtension', () => {
    const result = getCommerceExtension({
      [COMMERCE_EXTENSION_KEY]: VALID_COMMERCE,
    });
    expect(result).toEqual(VALID_COMMERCE);
  });

  it('getAccessExtension returns parsed AccessExtension', () => {
    const result = getAccessExtension({
      [ACCESS_EXTENSION_KEY]: VALID_ACCESS,
    });
    expect(result).toEqual(VALID_ACCESS);
  });

  it('getChallengeExtension returns parsed ChallengeExtension', () => {
    const result = getChallengeExtension({
      [CHALLENGE_EXTENSION_KEY]: VALID_CHALLENGE,
    });
    expect(result).toEqual(VALID_CHALLENGE);
  });

  it('getIdentityExtension returns parsed IdentityExtension', () => {
    const result = getIdentityExtension({
      [IDENTITY_EXTENSION_KEY]: VALID_IDENTITY,
    });
    expect(result).toEqual(VALID_IDENTITY);
  });

  it('getCorrelationExtension returns parsed CorrelationExtension', () => {
    const result = getCorrelationExtension({
      [CORRELATION_EXTENSION_KEY]: VALID_CORRELATION,
    });
    expect(result).toEqual(VALID_CORRELATION);
  });
});

// ---------------------------------------------------------------------------
// Typed accessors: invalid value throws PEACError with leaf-precise pointer
// ---------------------------------------------------------------------------

describe('Typed accessors: invalid value throws PEACError with pointer', () => {
  it('getCommerceExtension throws with pointer to failing field', () => {
    try {
      getCommerceExtension({
        [COMMERCE_EXTENSION_KEY]: {
          payment_rail: 'stripe',
          amount_minor: '10.50', // decimal rejected
          currency: 'USD',
        },
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as PEACError;
      expect(e.code).toBe('E_INVALID_ENVELOPE');
      expect(e.pointer).toBe('/extensions/org.peacprotocol~1commerce/amount_minor');
    }
  });

  it('getAccessExtension throws with pointer to failing field', () => {
    try {
      getAccessExtension({
        [ACCESS_EXTENSION_KEY]: {
          resource: 'https://api.example.com',
          action: 'read',
          decision: 'maybe', // invalid enum
        },
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as PEACError;
      expect(e.code).toBe('E_INVALID_ENVELOPE');
      expect(e.pointer).toBe('/extensions/org.peacprotocol~1access/decision');
    }
  });

  it('getChallengeExtension throws with pointer to nested problem field', () => {
    try {
      getChallengeExtension({
        [CHALLENGE_EXTENSION_KEY]: {
          challenge_type: 'payment_required',
          problem: {
            status: 700, // out of range
            type: 'https://example.com/problems/bad',
          },
        },
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as PEACError;
      expect(e.code).toBe('E_INVALID_ENVELOPE');
      expect(e.pointer).toBe('/extensions/org.peacprotocol~1challenge/problem/status');
    }
  });

  it('getCorrelationExtension throws with pointer to trace_id', () => {
    try {
      getCorrelationExtension({
        [CORRELATION_EXTENSION_KEY]: {
          trace_id: 'UPPERCASE' + '0'.repeat(24), // uppercase rejected
        },
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as PEACError;
      expect(e.code).toBe('E_INVALID_ENVELOPE');
      expect(e.pointer).toBe('/extensions/org.peacprotocol~1correlation/trace_id');
    }
  });

  it('getCommerceExtension throws with group-level pointer when all required fields missing', () => {
    try {
      getCommerceExtension({
        [COMMERCE_EXTENSION_KEY]: {},
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as PEACError;
      expect(e.code).toBe('E_INVALID_ENVELOPE');
      // First missing field triggers the error; pointer includes path to that field
      expect(e.pointer).toMatch(/^\/extensions\/org\.peacprotocol~1commerce/);
    }
  });
});

// ---------------------------------------------------------------------------
// Wire02ClaimsSchema integration: extension validation in superRefine
// ---------------------------------------------------------------------------

describe('Wire02ClaimsSchema: extension validation', () => {
  it('accepts evidence with valid commerce extension', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        extensions: {
          [COMMERCE_EXTENSION_KEY]: VALID_COMMERCE,
        },
      })
    );
    expect(result.success).toBe(true);
  });

  it('accepts evidence with valid access extension', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        extensions: {
          [ACCESS_EXTENSION_KEY]: VALID_ACCESS,
        },
      })
    );
    expect(result.success).toBe(true);
  });

  it('accepts challenge with valid challenge extension', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalChallenge({
        extensions: {
          [CHALLENGE_EXTENSION_KEY]: VALID_CHALLENGE,
        },
      })
    );
    expect(result.success).toBe(true);
  });

  it('accepts evidence with valid identity extension', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        extensions: {
          [IDENTITY_EXTENSION_KEY]: VALID_IDENTITY,
        },
      })
    );
    expect(result.success).toBe(true);
  });

  it('accepts evidence with valid correlation extension', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        extensions: {
          [CORRELATION_EXTENSION_KEY]: VALID_CORRELATION,
        },
      })
    );
    expect(result.success).toBe(true);
  });

  it('accepts evidence with multiple valid extensions', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        extensions: {
          [COMMERCE_EXTENSION_KEY]: VALID_COMMERCE,
          [CORRELATION_EXTENSION_KEY]: VALID_CORRELATION,
        },
      })
    );
    expect(result.success).toBe(true);
  });

  it('accepts evidence with unknown extension key (valid grammar)', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        extensions: {
          'com.example/custom': { some: 'data' },
        },
      })
    );
    expect(result.success).toBe(true);
  });

  it('rejects malformed extension key (no dot in domain)', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        extensions: {
          'nodot/commerce': { some: 'data' },
        },
      })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.message === ERROR_CODES.E_INVALID_EXTENSION_KEY
      );
      expect(issue).toBeDefined();
    }
  });

  it('rejects malformed extension key (uppercase in domain)', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        extensions: {
          'Org.example/ext': { some: 'data' },
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects malformed extension key (no slash)', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        extensions: {
          'org.example.commerce': { some: 'data' },
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects invalid known extension value (commerce with bad amount_minor)', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        extensions: {
          [COMMERCE_EXTENSION_KEY]: {
            ...VALID_COMMERCE,
            amount_minor: '10.50',
          },
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects invalid known extension value (access with bad decision)', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        extensions: {
          [ACCESS_EXTENSION_KEY]: {
            ...VALID_ACCESS,
            decision: 'invalid',
          },
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects invalid known extension value (challenge with out-of-range status)', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalChallenge({
        extensions: {
          [CHALLENGE_EXTENSION_KEY]: {
            challenge_type: 'payment_required',
            problem: {
              status: 700,
              type: 'https://example.com/problems/bad',
            },
          },
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('accepts evidence without extensions (field itself optional)', () => {
    const result = Wire02ClaimsSchema.safeParse(minimalEvidence());
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// EXTENSION_LIMITS constant
// ---------------------------------------------------------------------------

describe('EXTENSION_LIMITS constants', () => {
  it('exports maxPaymentRailLength as 128', () => {
    expect(EXTENSION_LIMITS.maxPaymentRailLength).toBe(128);
  });

  it('exports maxAmountMinorLength as 64', () => {
    expect(EXTENSION_LIMITS.maxAmountMinorLength).toBe(64);
  });

  it('exports maxTraceIdLength as 32', () => {
    expect(EXTENSION_LIMITS.maxTraceIdLength).toBe(32);
  });

  it('exports maxSpanIdLength as 16', () => {
    expect(EXTENSION_LIMITS.maxSpanIdLength).toBe(16);
  });

  it('exports maxDependsOnLength as 64', () => {
    expect(EXTENSION_LIMITS.maxDependsOnLength).toBe(64);
  });

  it('exports maxProblemTypeLength as 2048', () => {
    expect(EXTENSION_LIMITS.maxProblemTypeLength).toBe(2048);
  });

  it('exports maxExtensionKeyLength as 512', () => {
    expect(EXTENSION_LIMITS.maxExtensionKeyLength).toBe(512);
  });

  it('exports maxDnsLabelLength as 63', () => {
    expect(EXTENSION_LIMITS.maxDnsLabelLength).toBe(63);
  });

  it('exports maxDnsDomainLength as 253', () => {
    expect(EXTENSION_LIMITS.maxDnsDomainLength).toBe(253);
  });
});

// ---------------------------------------------------------------------------
// Extension key constants
// ---------------------------------------------------------------------------

describe('Extension key constants', () => {
  it('COMMERCE_EXTENSION_KEY is org.peacprotocol/commerce', () => {
    expect(COMMERCE_EXTENSION_KEY).toBe('org.peacprotocol/commerce');
  });

  it('ACCESS_EXTENSION_KEY is org.peacprotocol/access', () => {
    expect(ACCESS_EXTENSION_KEY).toBe('org.peacprotocol/access');
  });

  it('CHALLENGE_EXTENSION_KEY is org.peacprotocol/challenge', () => {
    expect(CHALLENGE_EXTENSION_KEY).toBe('org.peacprotocol/challenge');
  });

  it('IDENTITY_EXTENSION_KEY is org.peacprotocol/identity', () => {
    expect(IDENTITY_EXTENSION_KEY).toBe('org.peacprotocol/identity');
  });

  it('CORRELATION_EXTENSION_KEY is org.peacprotocol/correlation', () => {
    expect(CORRELATION_EXTENSION_KEY).toBe('org.peacprotocol/correlation');
  });
});
