/**
 * Wire 0.2 RepresentationFields + Actor promotion tests (DD-152, DD-146)
 *
 * Covers:
 *   - RepresentationFieldsSchema: valid/invalid content_hash, content_type, content_length
 *   - sha256-only enforcement (hmac-sha256 rejected for representation)
 *   - FingerprintRef round-trip in representation context
 *   - Object strictness (unknown keys rejected)
 *   - DoS bounds (max lengths, integer bounds)
 *   - Conservative MIME validation
 *   - ActorBinding promotion: Wire 0.2 top-level actor validates same as Wire 0.1 ext[]
 *   - Wire02ClaimsSchema with representation field integration
 */

import { describe, it, expect } from 'vitest';
import {
  RepresentationFieldsSchema,
  Wire02ClaimsSchema,
  ActorBindingSchema,
  stringToFingerprintRef,
  REPRESENTATION_LIMITS,
  type Wire02Claims,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_SHA256 = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const VALID_HMAC_SHA256 =
  'hmac-sha256:f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f';

function minimalEvidence(overrides?: Partial<Wire02Claims>): object {
  return {
    peac_version: '0.2',
    kind: 'evidence',
    type: 'org.peacprotocol/access',
    iss: 'https://example.com',
    iat: 1700000000,
    jti: 'test-jti-repr-01',
    ...overrides,
  };
}

const VALID_ACTOR = {
  id: 'agent-001',
  proof_type: 'did',
  origin: 'https://example.com',
};

// ---------------------------------------------------------------------------
// RepresentationFieldsSchema: content_hash
// ---------------------------------------------------------------------------

describe('RepresentationFieldsSchema: content_hash', () => {
  it('accepts valid sha256 FingerprintRef', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_hash: VALID_SHA256,
    });
    expect(result.success).toBe(true);
  });

  it('accepts sha256 with all-zero hash', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_hash: 'sha256:' + '0'.repeat(64),
    });
    expect(result.success).toBe(true);
  });

  it('accepts sha256 with all-f hash', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_hash: 'sha256:' + 'f'.repeat(64),
    });
    expect(result.success).toBe(true);
  });

  it('rejects hmac-sha256 (sha256-only for representation)', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_hash: VALID_HMAC_SHA256,
    });
    expect(result.success).toBe(false);
  });

  it('rejects uppercase hex', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_hash: 'sha256:E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
    });
    expect(result.success).toBe(false);
  });

  it('rejects truncated hex (63 chars)', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_hash: 'sha256:' + 'a'.repeat(63),
    });
    expect(result.success).toBe(false);
  });

  it('rejects overlong hex (65 chars)', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_hash: 'sha256:' + 'a'.repeat(65),
    });
    expect(result.success).toBe(false);
  });

  it('rejects md5 algorithm', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_hash: 'md5:d41d8cd98f00b204e9800998ecf8427e',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_hash: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing colon separator', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_hash: 'sha256' + 'a'.repeat(64),
    });
    expect(result.success).toBe(false);
  });

  it('is optional (absent content_hash is valid)', () => {
    const result = RepresentationFieldsSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RepresentationFieldsSchema: content_type (conservative MIME)
// ---------------------------------------------------------------------------

describe('RepresentationFieldsSchema: content_type', () => {
  it('accepts text/plain', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_type: 'text/plain',
    });
    expect(result.success).toBe(true);
  });

  it('accepts application/json', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_type: 'application/json',
    });
    expect(result.success).toBe(true);
  });

  it('accepts MIME with parameters', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_type: 'application/json; charset=utf-8',
    });
    expect(result.success).toBe(true);
  });

  it('accepts text/markdown', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_type: 'text/markdown',
    });
    expect(result.success).toBe(true);
  });

  it('accepts multipart/form-data', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_type: 'multipart/form-data',
    });
    expect(result.success).toBe(true);
  });

  it('rejects bare type without subtype', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_type: 'text',
    });
    expect(result.success).toBe(false);
  });

  it('rejects type with trailing slash', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_type: 'text/',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_type: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects leading whitespace', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_type: '  text/plain',
    });
    expect(result.success).toBe(false);
  });

  it('rejects trailing whitespace', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_type: 'text/plain  ',
    });
    expect(result.success).toBe(false);
  });

  it('rejects string exceeding 256 chars', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_type: 'application/' + 'x'.repeat(250),
    });
    expect(result.success).toBe(false);
  });

  it('is optional (absent content_type is valid)', () => {
    const result = RepresentationFieldsSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RepresentationFieldsSchema: content_length
// ---------------------------------------------------------------------------

describe('RepresentationFieldsSchema: content_length', () => {
  it('accepts zero', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_length: 0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts positive integer', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_length: 1048576,
    });
    expect(result.success).toBe(true);
  });

  it('accepts Number.MAX_SAFE_INTEGER', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_length: Number.MAX_SAFE_INTEGER,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative value', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_length: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects float', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_length: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects value exceeding MAX_SAFE_INTEGER', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_length: Number.MAX_SAFE_INTEGER + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects Infinity', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_length: Infinity,
    });
    expect(result.success).toBe(false);
  });

  it('rejects NaN', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_length: NaN,
    });
    expect(result.success).toBe(false);
  });

  it('is optional (absent content_length is valid)', () => {
    const result = RepresentationFieldsSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RepresentationFieldsSchema: object strictness
// ---------------------------------------------------------------------------

describe('RepresentationFieldsSchema: object strictness', () => {
  it('accepts empty object (all fields optional)', () => {
    const result = RepresentationFieldsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts all three fields present', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_hash: VALID_SHA256,
      content_type: 'text/plain',
      content_length: 42,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown key (strict mode)', () => {
    const result = RepresentationFieldsSchema.safeParse({
      content_hash: VALID_SHA256,
      unknown_field: 'should reject',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FingerprintRef round-trip in representation context
// ---------------------------------------------------------------------------

describe('FingerprintRef round-trip in representation context', () => {
  it('stringToFingerprintRef succeeds on valid representation content_hash', () => {
    const ref = stringToFingerprintRef(VALID_SHA256);
    expect(ref).not.toBeNull();
    expect(ref!.alg).toBe('sha256');
  });

  it('stringToFingerprintRef returns null for hmac-sha256 (parser accepts, but representation rejects)', () => {
    const ref = stringToFingerprintRef(VALID_HMAC_SHA256);
    // Parser accepts hmac-sha256 as a valid FingerprintRef
    expect(ref).not.toBeNull();
    expect(ref!.alg).toBe('hmac-sha256');
    // But RepresentationFieldsSchema rejects it (sha256-only)
    const result = RepresentationFieldsSchema.safeParse({
      content_hash: VALID_HMAC_SHA256,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Wire02ClaimsSchema integration: representation field
// ---------------------------------------------------------------------------

describe('Wire02ClaimsSchema: representation field integration', () => {
  it('accepts evidence with valid representation', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        representation: {
          content_hash: VALID_SHA256,
          content_type: 'application/json',
          content_length: 1024,
        },
      })
    );
    expect(result.success).toBe(true);
  });

  it('accepts evidence with empty representation (all fields optional)', () => {
    const result = Wire02ClaimsSchema.safeParse(minimalEvidence({ representation: {} }));
    expect(result.success).toBe(true);
  });

  it('accepts evidence without representation (field itself optional)', () => {
    const result = Wire02ClaimsSchema.safeParse(minimalEvidence());
    expect(result.success).toBe(true);
  });

  it('rejects evidence with invalid content_hash in representation', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        representation: { content_hash: 'md5:invalid' },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects evidence with hmac-sha256 content_hash in representation', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        representation: { content_hash: VALID_HMAC_SHA256 },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects representation with unknown keys (strict propagation)', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        representation: {
          content_hash: VALID_SHA256,
          extra_field: 'should reject',
        } as Record<string, unknown>,
      })
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Actor promotion: Wire 0.2 top-level actor validates same as Wire 0.1 ext[]
// ---------------------------------------------------------------------------

describe('Actor promotion: Wire 0.2 top-level actor', () => {
  it('accepts valid ActorBinding at top level', () => {
    const result = Wire02ClaimsSchema.safeParse(minimalEvidence({ actor: VALID_ACTOR }));
    expect(result.success).toBe(true);
  });

  it('validates same shape as standalone ActorBindingSchema', () => {
    // The same object must pass both the standalone schema and the envelope schema
    const standalone = ActorBindingSchema.safeParse(VALID_ACTOR);
    expect(standalone.success).toBe(true);

    const envelope = Wire02ClaimsSchema.safeParse(minimalEvidence({ actor: VALID_ACTOR }));
    expect(envelope.success).toBe(true);
  });

  it('rejects invalid actor (missing required fields)', () => {
    const result = Wire02ClaimsSchema.safeParse(minimalEvidence({ actor: { id: 'agent-001' } }));
    expect(result.success).toBe(false);
  });

  it('rejects actor with non-origin URL (path present)', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        actor: {
          ...VALID_ACTOR,
          origin: 'https://example.com/path',
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('accepts actor with intent_hash', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        actor: {
          ...VALID_ACTOR,
          intent_hash: 'sha256:' + 'a'.repeat(64),
        },
      })
    );
    expect(result.success).toBe(true);
  });

  it('is optional (absent actor is valid)', () => {
    const result = Wire02ClaimsSchema.safeParse(minimalEvidence());
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Frozen golden vectors: MIME pattern intent (prevents accidental loosening)
// ---------------------------------------------------------------------------

describe('Frozen golden vectors: MIME pattern', () => {
  const MUST_ACCEPT = [
    'application/json',
    'application/json; charset=utf-8',
    'text/plain',
    'text/html',
    'image/png',
    'application/octet-stream',
    'application/vnd.api+json',
    'multipart/form-data; boundary=something',
  ];

  const MUST_REJECT = [
    'text/',
    'text',
    '',
    '  text/plain',
    'text/plain  ',
    '/json',
    'application/ json',
  ];

  for (const mime of MUST_ACCEPT) {
    it(`accepts: ${mime}`, () => {
      const result = RepresentationFieldsSchema.safeParse({ content_type: mime });
      expect(result.success).toBe(true);
    });
  }

  for (const mime of MUST_REJECT) {
    it(`rejects: ${JSON.stringify(mime)}`, () => {
      const result = RepresentationFieldsSchema.safeParse({ content_type: mime });
      expect(result.success).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// REPRESENTATION_LIMITS export
// ---------------------------------------------------------------------------

describe('REPRESENTATION_LIMITS constants', () => {
  it('exports maxContentHashLength matching MAX_FINGERPRINT_REF_LENGTH (76)', () => {
    expect(REPRESENTATION_LIMITS.maxContentHashLength).toBe(76);
  });

  it('exports maxContentTypeLength as 256', () => {
    expect(REPRESENTATION_LIMITS.maxContentTypeLength).toBe(256);
  });
});
