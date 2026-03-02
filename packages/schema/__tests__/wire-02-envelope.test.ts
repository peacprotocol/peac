/**
 * Wire 0.2 envelope schema tests (v0.12.0-preview.1, DD-156)
 *
 * Covers:
 *   - isCanonicalIss() full attacker-grade test matrix
 *   - Wire02ClaimsSchema validation (valid + invalid cases)
 *   - PillarsSchema (sorted, unique, closed vocabulary)
 *   - ReceiptTypeSchema (reverse-DNS + URI forms)
 *   - checkOccurredAtSkew() skew rules (Correction 5)
 *   - occurred_at prohibited on challenge kind
 */

import { describe, it, expect } from 'vitest';
import {
  Wire02ClaimsSchema,
  EvidencePillarSchema,
  PillarsSchema,
  Wire02KindSchema,
  PolicyBlockSchema,
  isCanonicalIss,
  isValidReceiptType,
  checkOccurredAtSkew,
  type Wire02Claims,
} from '../src/wire-02-envelope.js';

// ---------------------------------------------------------------------------
// Minimal valid evidence fixture
// ---------------------------------------------------------------------------

function minimalEvidence(overrides?: Partial<Wire02Claims>): object {
  return {
    peac_version: '0.2',
    kind: 'evidence',
    type: 'org.peacprotocol/access',
    iss: 'https://example.com',
    iat: 1700000000,
    jti: 'test-jti-01',
    ...overrides,
  };
}

function minimalChallenge(overrides?: Partial<Wire02Claims>): object {
  return {
    peac_version: '0.2',
    kind: 'challenge',
    type: 'org.peacprotocol/access',
    iss: 'https://example.com',
    iat: 1700000000,
    jti: 'test-jti-01',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isCanonicalIss(): https:// branch
// ---------------------------------------------------------------------------

describe('isCanonicalIss(): https:// branch', () => {
  it('accepts plain https:// origin', () => {
    expect(isCanonicalIss('https://example.com')).toBe(true);
  });

  it('accepts non-standard port', () => {
    expect(isCanonicalIss('https://example.com:8443')).toBe(true);
  });

  it('accepts punycode IDN', () => {
    // xn--mnchen-3ya is the punycode for münchen
    expect(isCanonicalIss('https://xn--mnchen-3ya.de')).toBe(true);
  });

  it('accepts IPv6 well-formed', () => {
    expect(isCanonicalIss('https://[::1]')).toBe(true);
  });

  it('rejects mixed-case host', () => {
    expect(isCanonicalIss('https://EXAMPLE.COM')).toBe(false);
  });

  it('rejects default port :443', () => {
    expect(isCanonicalIss('https://example.com:443')).toBe(false);
  });

  it('rejects trailing slash', () => {
    expect(isCanonicalIss('https://example.com/')).toBe(false);
  });

  it('rejects path present', () => {
    expect(isCanonicalIss('https://example.com/path')).toBe(false);
  });

  it('rejects query string', () => {
    expect(isCanonicalIss('https://example.com?q=1')).toBe(false);
  });

  it('rejects fragment', () => {
    expect(isCanonicalIss('https://example.com#frag')).toBe(false);
  });

  it('rejects userinfo', () => {
    expect(isCanonicalIss('https://user:pass@example.com')).toBe(false);
  });

  it('rejects raw Unicode host', () => {
    // Raw Unicode domain: münchen.de: the URL constructor normalizes to punycode,
    // so the reconstructed origin differs from the raw input.
    expect(isCanonicalIss('https://münchen.de')).toBe(false);
  });

  it('rejects http:// scheme', () => {
    expect(isCanonicalIss('http://example.com')).toBe(false);
  });

  it('rejects double slash in path', () => {
    expect(isCanonicalIss('https://example.com//path')).toBe(false);
  });

  it('rejects empty host', () => {
    expect(isCanonicalIss('https://')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isCanonicalIss(): did: branch
// ---------------------------------------------------------------------------

describe('isCanonicalIss(): did: branch', () => {
  it('accepts did:web:example.com', () => {
    expect(isCanonicalIss('did:web:example.com')).toBe(true);
  });

  it('accepts did:key with z6Mk prefix', () => {
    expect(isCanonicalIss('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK')).toBe(true);
  });

  it('accepts did:web with colon-based path (did:web:example.com:path:to)', () => {
    expect(isCanonicalIss('did:web:example.com:path:to')).toBe(true);
  });

  it('rejects did: with fragment', () => {
    expect(isCanonicalIss('did:web:example.com#key-1')).toBe(false);
  });

  it('rejects did: with path using slash', () => {
    expect(isCanonicalIss('did:web:example.com/path')).toBe(false);
  });

  it('rejects did: with query', () => {
    expect(isCanonicalIss('did:web:example.com?v=1')).toBe(false);
  });

  it('rejects did: with uppercase method', () => {
    expect(isCanonicalIss('did:WEB:example.com')).toBe(false);
  });

  it('rejects did: with empty method-specific-id', () => {
    expect(isCanonicalIss('did:web:')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isCanonicalIss(): other schemes
// ---------------------------------------------------------------------------

describe('isCanonicalIss(): other schemes rejected', () => {
  it('rejects spiffe://', () => {
    expect(isCanonicalIss('spiffe://cluster.local/ns/default')).toBe(false);
  });

  it('rejects urn:', () => {
    expect(isCanonicalIss('urn:example:a')).toBe(false);
  });

  it('rejects bare domain (no scheme)', () => {
    expect(isCanonicalIss('example.com')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isCanonicalIss('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidReceiptType()
// ---------------------------------------------------------------------------

describe('isValidReceiptType()', () => {
  it('accepts reverse-DNS type', () => {
    expect(isValidReceiptType('org.peacprotocol/commerce')).toBe(true);
  });

  it('accepts custom reverse-DNS type', () => {
    expect(isValidReceiptType('com.example/custom-flow')).toBe(true);
  });

  it('accepts absolute URI type', () => {
    expect(isValidReceiptType('https://example.com/types/access')).toBe(true);
  });

  it('rejects empty type', () => {
    expect(isValidReceiptType('')).toBe(false);
  });

  it('rejects single label without dot (no slash)', () => {
    expect(isValidReceiptType('not-valid')).toBe(false);
  });

  it('rejects single label with slash but no dot in domain', () => {
    expect(isValidReceiptType('example/something')).toBe(false);
  });

  it('rejects type exceeding maxLength', () => {
    expect(isValidReceiptType('o'.repeat(257))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// EvidencePillarSchema
// ---------------------------------------------------------------------------

describe('EvidencePillarSchema', () => {
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
  ];

  it.each(allPillars)('accepts pillar: %s', (pillar) => {
    expect(EvidencePillarSchema.safeParse(pillar).success).toBe(true);
  });

  it('rejects unknown pillar value', () => {
    expect(EvidencePillarSchema.safeParse('unknown').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PillarsSchema
// ---------------------------------------------------------------------------

describe('PillarsSchema', () => {
  it('accepts sorted unique pillars', () => {
    expect(PillarsSchema.safeParse(['access', 'commerce']).success).toBe(true);
  });

  it('accepts single pillar', () => {
    expect(PillarsSchema.safeParse(['identity']).success).toBe(true);
  });

  it('accepts all 10 pillars in order', () => {
    const result = PillarsSchema.safeParse([
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
    ]);
    expect(result.success).toBe(true);
  });

  it('rejects unsorted pillars', () => {
    expect(PillarsSchema.safeParse(['commerce', 'access']).success).toBe(false);
  });

  it('rejects duplicate pillars', () => {
    expect(PillarsSchema.safeParse(['access', 'access']).success).toBe(false);
  });

  it('rejects empty array', () => {
    expect(PillarsSchema.safeParse([]).success).toBe(false);
  });

  it('rejects unknown pillar value', () => {
    expect(PillarsSchema.safeParse(['access', 'unknown']).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PolicyBlockSchema
// ---------------------------------------------------------------------------

describe('PolicyBlockSchema', () => {
  const validDigest = 'sha256:' + 'a'.repeat(64);

  it('accepts valid policy block', () => {
    expect(PolicyBlockSchema.safeParse({ digest: validDigest }).success).toBe(true);
  });

  it('accepts with optional uri and version', () => {
    expect(
      PolicyBlockSchema.safeParse({
        digest: validDigest,
        uri: 'https://example.com/policy.json',
        version: '1.0.0',
      }).success
    ).toBe(true);
  });

  it('rejects invalid digest format', () => {
    expect(PolicyBlockSchema.safeParse({ digest: 'not-a-digest' }).success).toBe(false);
  });

  it('rejects missing digest', () => {
    expect(PolicyBlockSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Wire02ClaimsSchema: valid cases
// ---------------------------------------------------------------------------

describe('Wire02ClaimsSchema: valid', () => {
  it('accepts minimal evidence receipt', () => {
    const result = Wire02ClaimsSchema.safeParse(minimalEvidence());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.peac_version).toBe('0.2');
      expect(result.data.kind).toBe('evidence');
    }
  });

  it('accepts minimal challenge receipt', () => {
    const result = Wire02ClaimsSchema.safeParse(minimalChallenge());
    expect(result.success).toBe(true);
  });

  it('accepts evidence with pillars', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({ pillars: ['access', 'identity'] })
    );
    expect(result.success).toBe(true);
  });

  it('accepts evidence with did: iss', () => {
    const result = Wire02ClaimsSchema.safeParse(minimalEvidence({ iss: 'did:web:example.com' }));
    expect(result.success).toBe(true);
  });

  it('accepts evidence with occurred_at', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({ occurred_at: '2024-01-15T10:00:00Z' })
    );
    expect(result.success).toBe(true);
  });

  it('accepts evidence with policy block', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        policy: { digest: 'sha256:' + 'b'.repeat(64) },
      })
    );
    expect(result.success).toBe(true);
  });

  it('accepts evidence with extensions', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        extensions: { 'org.peacprotocol/commerce': { amount_minor: '1000', currency: 'USD' } },
      })
    );
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Wire02ClaimsSchema: invalid cases
// ---------------------------------------------------------------------------

describe('Wire02ClaimsSchema: invalid', () => {
  it('rejects missing peac_version', () => {
    const obj = {
      kind: 'evidence',
      type: 'org.peacprotocol/access',
      iss: 'https://example.com',
      iat: 1700000000,
      jti: 'x',
    };
    expect(Wire02ClaimsSchema.safeParse(obj).success).toBe(false);
  });

  it('rejects wrong peac_version', () => {
    expect(
      Wire02ClaimsSchema.safeParse(minimalEvidence({ peac_version: '0.1' as '0.2' })).success
    ).toBe(false);
  });

  it('rejects unknown kind', () => {
    expect(Wire02ClaimsSchema.safeParse({ ...minimalEvidence(), kind: 'unknown' }).success).toBe(
      false
    );
  });

  it('rejects non-canonical iss', () => {
    expect(
      Wire02ClaimsSchema.safeParse(minimalEvidence({ iss: 'http://example.com' })).success
    ).toBe(false);
  });

  it('rejects iss with uppercase host', () => {
    expect(
      Wire02ClaimsSchema.safeParse(minimalEvidence({ iss: 'https://EXAMPLE.COM' })).success
    ).toBe(false);
  });

  it('rejects iss with default port :443', () => {
    expect(
      Wire02ClaimsSchema.safeParse(minimalEvidence({ iss: 'https://example.com:443' })).success
    ).toBe(false);
  });

  it('rejects invalid type (empty string)', () => {
    expect(Wire02ClaimsSchema.safeParse(minimalEvidence({ type: '' })).success).toBe(false);
  });

  it('rejects unsorted pillars', () => {
    expect(
      Wire02ClaimsSchema.safeParse(minimalEvidence({ pillars: ['commerce', 'access'] })).success
    ).toBe(false);
  });

  it('rejects duplicate pillars', () => {
    expect(
      Wire02ClaimsSchema.safeParse(minimalEvidence({ pillars: ['access', 'access'] })).success
    ).toBe(false);
  });

  it('rejects unknown extra fields (strict mode)', () => {
    const obj = { ...minimalEvidence(), unknown_field: 'x' };
    expect(Wire02ClaimsSchema.safeParse(obj).success).toBe(false);
  });

  it('rejects occurred_at on challenge kind (E_OCCURRED_AT_ON_CHALLENGE)', () => {
    const obj = minimalChallenge({ occurred_at: '2024-01-15T10:00:00Z' });
    const result = Wire02ClaimsSchema.safeParse(obj);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes('E_OCCURRED_AT_ON_CHALLENGE'))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// checkOccurredAtSkew(): Correction 5 skew rules
// ---------------------------------------------------------------------------

describe('checkOccurredAtSkew()', () => {
  const IAT = 1700000000;
  const TOLERANCE = 300;

  it('returns null when occurred_at is undefined', () => {
    expect(checkOccurredAtSkew(undefined, IAT, IAT, TOLERANCE)).toBeNull();
  });

  it('returns null when occurred_at <= iat (valid, no skew)', () => {
    const occurredAt = new Date((IAT - 100) * 1000).toISOString();
    expect(checkOccurredAtSkew(occurredAt, IAT, IAT, TOLERANCE)).toBeNull();
  });

  it('returns null when occurred_at == iat', () => {
    const occurredAt = new Date(IAT * 1000).toISOString();
    expect(checkOccurredAtSkew(occurredAt, IAT, IAT, TOLERANCE)).toBeNull();
  });

  it('returns occurred_at_skew warning when occurred_at > iat but within tolerance of now', () => {
    const now = IAT;
    // occurred_at is 100s after iat but only 100s after now (within tolerance 300)
    const occurredAt = new Date((IAT + 100) * 1000).toISOString();
    const result = checkOccurredAtSkew(occurredAt, IAT, now, TOLERANCE);
    expect(result).not.toBeNull();
    expect(result).not.toBe('future_error');
    if (result && result !== 'future_error') {
      expect(result.code).toBe('occurred_at_skew');
      expect(result.pointer).toBe('/occurred_at');
    }
  });

  it('returns future_error when occurred_at > now + tolerance', () => {
    const now = IAT;
    // occurred_at is 400s after now (beyond tolerance 300)
    const occurredAt = new Date((now + 400) * 1000).toISOString();
    expect(checkOccurredAtSkew(occurredAt, IAT, now, TOLERANCE)).toBe('future_error');
  });

  it('returns occurred_at_skew (not future_error) when at exactly now + tolerance', () => {
    const now = IAT;
    // exactly at tolerance boundary: not strictly >
    const occurredAt = new Date((now + TOLERANCE) * 1000).toISOString();
    // ts = now + tolerance, which is NOT > now + tolerance (it's equal), so no future error
    const result = checkOccurredAtSkew(occurredAt, IAT, now, TOLERANCE);
    // occurred_at > iat (IAT + TOLERANCE > IAT) so it's a skew warning
    expect(result).not.toBe('future_error');
    if (result && result !== 'future_error') {
      expect(result.code).toBe('occurred_at_skew');
    }
  });
});

// ---------------------------------------------------------------------------
// Wire02KindSchema
// ---------------------------------------------------------------------------

describe('Wire02KindSchema', () => {
  it('accepts evidence', () => {
    expect(Wire02KindSchema.safeParse('evidence').success).toBe(true);
  });

  it('accepts challenge', () => {
    expect(Wire02KindSchema.safeParse('challenge').success).toBe(true);
  });

  it('rejects unknown kind', () => {
    expect(Wire02KindSchema.safeParse('observation').success).toBe(false);
  });
});
