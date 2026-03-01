/**
 * ActorBinding and MVIS Schema Tests (v0.11.3+, DD-142, DD-143, DD-144)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ProofTypeSchema,
  PROOF_TYPES,
  ActorBindingSchema,
  MVISFieldsSchema,
  ACTOR_BINDING_EXTENSION_KEY,
  isOriginOnly,
  validateActorBinding,
  validateMVIS,
  type ProofType,
  type ActorBinding,
  type MVISFields,
} from '../src/actor-binding';

// =============================================================================
// PROOF TYPE SCHEMA (DD-143)
// =============================================================================

describe('ProofTypeSchema', () => {
  it('should accept all 8 proof types', () => {
    const types: ProofType[] = [
      'ed25519-cert-chain',
      'eat-passport',
      'eat-background-check',
      'sigstore-oidc',
      'did',
      'spiffe',
      'x509-pki',
      'custom',
    ];
    for (const t of types) {
      expect(ProofTypeSchema.parse(t)).toBe(t);
    }
  });

  it('should reject unknown proof types', () => {
    expect(() => ProofTypeSchema.parse('unknown')).toThrow();
    expect(() => ProofTypeSchema.parse('rsa-chain')).toThrow();
    expect(() => ProofTypeSchema.parse('')).toThrow();
  });

  it('should match PROOF_TYPES constant', () => {
    expect(PROOF_TYPES).toHaveLength(8);
    expect(PROOF_TYPES).toContain('ed25519-cert-chain');
    expect(PROOF_TYPES).toContain('custom');
  });

  it('should be separate from ProofMethodSchema (no overlap with transport methods)', () => {
    // ProofTypeSchema covers trust root models, not transport mechanisms
    // ProofMethodSchema covers: http-message-signature, dpop, mtls, jwk-thumbprint
    expect(() => ProofTypeSchema.parse('http-message-signature')).toThrow();
    expect(() => ProofTypeSchema.parse('dpop')).toThrow();
    expect(() => ProofTypeSchema.parse('mtls')).toThrow();
    expect(() => ProofTypeSchema.parse('jwk-thumbprint')).toThrow();
  });
});

// =============================================================================
// ORIGIN VALIDATION
// =============================================================================

describe('isOriginOnly', () => {
  it('should accept valid origins', () => {
    expect(isOriginOnly('https://example.com')).toBe(true);
    expect(isOriginOnly('https://example.com:8443')).toBe(true);
    expect(isOriginOnly('http://localhost')).toBe(true);
    expect(isOriginOnly('http://localhost:3000')).toBe(true);
    expect(isOriginOnly('https://sub.domain.example.com')).toBe(true);
  });

  it('should reject URLs with path', () => {
    expect(isOriginOnly('https://example.com/api')).toBe(false);
    expect(isOriginOnly('https://example.com/api/v1')).toBe(false);
    expect(isOriginOnly('https://example.com/api/v1/users')).toBe(false);
  });

  it('should reject URLs with query', () => {
    expect(isOriginOnly('https://example.com?q=1')).toBe(false);
    expect(isOriginOnly('https://example.com?token=abc&scope=read')).toBe(false);
  });

  it('should reject URLs with fragment', () => {
    expect(isOriginOnly('https://example.com#section')).toBe(false);
    expect(isOriginOnly('https://example.com#')).toBe(false);
  });

  it('should reject non-HTTP schemes', () => {
    expect(isOriginOnly('ftp://example.com')).toBe(false);
    expect(isOriginOnly('file:///etc/passwd')).toBe(false);
    expect(isOriginOnly('data:text/plain,hello')).toBe(false);
  });

  it('should reject invalid URLs', () => {
    expect(isOriginOnly('')).toBe(false);
    expect(isOriginOnly('not-a-url')).toBe(false);
    expect(isOriginOnly('://missing-scheme')).toBe(false);
  });
});

// =============================================================================
// ACTOR BINDING SCHEMA (DD-142)
// =============================================================================

describe('ActorBindingSchema', () => {
  const validBinding: ActorBinding = {
    id: 'agent:crawler-prod-001',
    proof_type: 'ed25519-cert-chain',
    origin: 'https://crawler.example.com',
  };

  it('should accept valid minimal binding', () => {
    expect(ActorBindingSchema.parse(validBinding)).toEqual(validBinding);
  });

  it('should accept binding with all optional fields', () => {
    const full: ActorBinding = {
      ...validBinding,
      proof_ref: 'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      intent_hash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };
    expect(ActorBindingSchema.parse(full)).toEqual(full);
  });

  it('should accept binding with port in origin', () => {
    const withPort = { ...validBinding, origin: 'https://crawler.example.com:8443' };
    expect(ActorBindingSchema.parse(withPort)).toEqual(withPort);
  });

  it('should reject binding with path in origin', () => {
    const withPath = { ...validBinding, origin: 'https://example.com/api/v1' };
    expect(() => ActorBindingSchema.parse(withPath)).toThrow();
  });

  it('should reject binding with query in origin', () => {
    const withQuery = { ...validBinding, origin: 'https://example.com?token=abc' };
    expect(() => ActorBindingSchema.parse(withQuery)).toThrow();
  });

  it('should reject binding with empty id', () => {
    expect(() => ActorBindingSchema.parse({ ...validBinding, id: '' })).toThrow();
  });

  it('should reject binding with unknown proof_type', () => {
    expect(() => ActorBindingSchema.parse({ ...validBinding, proof_type: 'rsa-2048' })).toThrow();
  });

  it('should reject malformed intent_hash', () => {
    expect(() => ActorBindingSchema.parse({ ...validBinding, intent_hash: 'md5:abc' })).toThrow();
    expect(() =>
      ActorBindingSchema.parse({ ...validBinding, intent_hash: 'sha256:tooshort' })
    ).toThrow();
    expect(() => ActorBindingSchema.parse({ ...validBinding, intent_hash: 'abc123' })).toThrow();
  });

  it('should reject extra fields (strict mode)', () => {
    expect(() => ActorBindingSchema.parse({ ...validBinding, extra_field: 'bad' })).toThrow();
  });

  it('should have correct extension key constant', () => {
    expect(ACTOR_BINDING_EXTENSION_KEY).toBe('org.peacprotocol/actor_binding');
  });
});

// =============================================================================
// MVIS FIELDS SCHEMA (DD-144)
// =============================================================================

describe('MVISFieldsSchema', () => {
  const validMVIS: MVISFields = {
    issuer: 'https://issuer.example.com',
    subject: 'agent:test-001',
    key_binding: 'kid:key-2026-01',
    time_bounds: {
      not_before: '2026-01-01T00:00:00Z',
      not_after: '2026-12-31T23:59:59Z',
    },
    replay_protection: {
      jti: 'unique-token-id-001',
    },
  };

  it('should accept valid MVIS with all 5 required fields', () => {
    expect(MVISFieldsSchema.parse(validMVIS)).toEqual(validMVIS);
  });

  it('should accept MVIS with optional nonce in replay_protection', () => {
    const withNonce = {
      ...validMVIS,
      replay_protection: { jti: 'token-001', nonce: 'random-nonce-value' },
    };
    expect(MVISFieldsSchema.parse(withNonce)).toEqual(withNonce);
  });

  it('should reject MVIS missing issuer', () => {
    const { issuer: _, ...noIssuer } = validMVIS;
    expect(() => MVISFieldsSchema.parse(noIssuer)).toThrow();
  });

  it('should reject MVIS missing subject', () => {
    const { subject: _, ...noSubject } = validMVIS;
    expect(() => MVISFieldsSchema.parse(noSubject)).toThrow();
  });

  it('should reject MVIS missing key_binding', () => {
    const { key_binding: _, ...noKeyBinding } = validMVIS;
    expect(() => MVISFieldsSchema.parse(noKeyBinding)).toThrow();
  });

  it('should reject MVIS missing time_bounds', () => {
    const { time_bounds: _, ...noTimeBounds } = validMVIS;
    expect(() => MVISFieldsSchema.parse(noTimeBounds)).toThrow();
  });

  it('should reject MVIS missing replay_protection', () => {
    const { replay_protection: _, ...noReplay } = validMVIS;
    expect(() => MVISFieldsSchema.parse(noReplay)).toThrow();
  });

  it('should reject invalid datetime in time_bounds', () => {
    const badDate = {
      ...validMVIS,
      time_bounds: { not_before: 'bad', not_after: '2026-12-31T23:59:59Z' },
    };
    expect(() => MVISFieldsSchema.parse(badDate)).toThrow();
  });

  it('should reject empty jti in replay_protection', () => {
    const emptyJti = { ...validMVIS, replay_protection: { jti: '' } };
    expect(() => MVISFieldsSchema.parse(emptyJti)).toThrow();
  });
});

// =============================================================================
// VALIDATE HELPERS
// =============================================================================

describe('validateActorBinding', () => {
  it('should return ok for valid binding', () => {
    const result = validateActorBinding({
      id: 'agent:test',
      proof_type: 'did',
      origin: 'https://example.com',
    });
    expect(result.ok).toBe(true);
  });

  it('should return error for invalid binding', () => {
    const result = validateActorBinding({ id: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });
});

describe('validateMVIS', () => {
  const validMVIS = {
    issuer: 'https://issuer.example.com',
    subject: 'agent:test-001',
    key_binding: 'kid:key-2026-01',
    time_bounds: {
      not_before: '2026-01-01T00:00:00Z',
      not_after: '2026-12-31T23:59:59Z',
    },
    replay_protection: {
      jti: 'unique-token-id-001',
    },
  };

  it('should return ok for valid MVIS', () => {
    const result = validateMVIS(validMVIS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.issuer).toBe('https://issuer.example.com');
      expect(result.value.subject).toBe('agent:test-001');
    }
  });

  it('should reject reversed time bounds (not_before >= not_after)', () => {
    const reversed = {
      ...validMVIS,
      time_bounds: {
        not_before: '2026-12-31T23:59:59Z',
        not_after: '2026-01-01T00:00:00Z',
      },
    };
    const result = validateMVIS(reversed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not_before must be before not_after');
    }
  });

  it('should reject equal time bounds', () => {
    const equal = {
      ...validMVIS,
      time_bounds: {
        not_before: '2026-06-15T12:00:00Z',
        not_after: '2026-06-15T12:00:00Z',
      },
    };
    const result = validateMVIS(equal);
    expect(result.ok).toBe(false);
  });

  it('should reject incomplete MVIS (missing key_binding)', () => {
    const { key_binding: _, ...incomplete } = validMVIS;
    const result = validateMVIS(incomplete);
    expect(result.ok).toBe(false);
  });

  it('should reject non-object input', () => {
    expect(validateMVIS(null).ok).toBe(false);
    expect(validateMVIS(undefined).ok).toBe(false);
    expect(validateMVIS('string').ok).toBe(false);
    expect(validateMVIS(42).ok).toBe(false);
  });
});

// =============================================================================
// CONFORMANCE FIXTURES
// =============================================================================

describe('conformance fixtures', () => {
  const fixturesDir = resolve(__dirname, '../../../specs/conformance/fixtures/agent-identity');

  describe('valid-actor-binding fixtures', () => {
    const validFixtures = JSON.parse(
      readFileSync(resolve(fixturesDir, 'valid-actor-binding.json'), 'utf-8')
    );

    for (const fixture of validFixtures.fixtures) {
      it(`should validate: ${fixture.name}`, () => {
        const result = ActorBindingSchema.safeParse(fixture.input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.proof_type).toBe(fixture.expected.proof_type);
        }
      });
    }

    it('should have exactly 8 valid fixtures (one per proof_type)', () => {
      expect(validFixtures.fixtures).toHaveLength(8);
      const proofTypes = validFixtures.fixtures.map(
        (f: { input: { proof_type: string } }) => f.input.proof_type
      );
      expect(new Set(proofTypes).size).toBe(8);
      for (const pt of PROOF_TYPES) {
        expect(proofTypes).toContain(pt);
      }
    });
  });

  describe('invalid-actor-binding fixtures', () => {
    const invalidFixtures = JSON.parse(
      readFileSync(resolve(fixturesDir, 'invalid-actor-binding.json'), 'utf-8')
    );

    for (const fixture of invalidFixtures.fixtures) {
      if (fixture.input) {
        it(`should reject: ${fixture.name}`, () => {
          const result = ActorBindingSchema.safeParse(fixture.input);
          expect(result.success).toBe(false);
        });
      }
      if (fixture.input_mvis) {
        it(`should reject MVIS: ${fixture.name}`, () => {
          const result = validateMVIS(fixture.input_mvis);
          expect(result.ok).toBe(false);
          if (!result.ok && fixture.expected.error_contains) {
            expect(result.error).toContain(fixture.expected.error_contains);
          }
        });
      }
    }
  });
});
