/**
 * Agent Identity Attestation Tests (v0.9.25+)
 */
import { describe, it, expect } from 'vitest';
import {
  ControlTypeSchema,
  ProofMethodSchema,
  BindingDetailsSchema,
  AgentProofSchema,
  AgentIdentityEvidenceSchema,
  AgentIdentityAttestationSchema,
  IdentityBindingSchema,
  AgentIdentityVerifiedSchema,
  AGENT_IDENTITY_TYPE,
  CONTROL_TYPES,
  PROOF_METHODS,
  validateAgentIdentityAttestation,
  isAgentIdentityAttestation,
  createAgentIdentityAttestation,
  validateIdentityBinding,
  isAttestationExpired,
  isAttestationNotYetValid,
  type AgentIdentityAttestation,
  type AgentIdentityEvidence,
  type AgentProof,
  type IdentityBinding,
} from '../src/agent-identity';

describe('ControlTypeSchema', () => {
  it('should accept valid control types', () => {
    expect(ControlTypeSchema.parse('operator')).toBe('operator');
    expect(ControlTypeSchema.parse('user-delegated')).toBe('user-delegated');
  });

  it('should reject invalid control types', () => {
    expect(() => ControlTypeSchema.parse('unknown')).toThrow();
    expect(() => ControlTypeSchema.parse('')).toThrow();
    expect(() => ControlTypeSchema.parse(123)).toThrow();
  });

  it('should match CONTROL_TYPES constant', () => {
    expect(CONTROL_TYPES).toEqual(['operator', 'user-delegated']);
  });
});

describe('ProofMethodSchema', () => {
  it('should accept valid proof methods', () => {
    expect(ProofMethodSchema.parse('http-message-signature')).toBe('http-message-signature');
    expect(ProofMethodSchema.parse('dpop')).toBe('dpop');
    expect(ProofMethodSchema.parse('mtls')).toBe('mtls');
    expect(ProofMethodSchema.parse('jwk-thumbprint')).toBe('jwk-thumbprint');
  });

  it('should reject invalid proof methods', () => {
    expect(() => ProofMethodSchema.parse('unknown')).toThrow();
    expect(() => ProofMethodSchema.parse('signature')).toThrow();
  });

  it('should match PROOF_METHODS constant', () => {
    expect(PROOF_METHODS).toEqual([
      'http-message-signature',
      'dpop',
      'mtls',
      'jwk-thumbprint',
    ]);
  });
});

describe('BindingDetailsSchema', () => {
  it('should accept valid binding details', () => {
    const binding = {
      method: 'POST',
      target: 'https://example.com/api',
      headers_included: ['host', 'content-type'],
      body_hash: 'abcd1234',
      signed_at: '2026-01-03T12:00:00Z',
    };
    expect(BindingDetailsSchema.parse(binding)).toEqual(binding);
  });

  it('should accept binding without body_hash', () => {
    const binding = {
      method: 'GET',
      target: 'https://example.com/api',
      headers_included: ['host'],
      signed_at: '2026-01-03T12:00:00Z',
    };
    const result = BindingDetailsSchema.parse(binding);
    expect(result.body_hash).toBeUndefined();
  });

  it('should reject invalid datetime', () => {
    const binding = {
      method: 'GET',
      target: 'https://example.com',
      headers_included: [],
      signed_at: 'not-a-date',
    };
    expect(() => BindingDetailsSchema.parse(binding)).toThrow();
  });
});

describe('AgentProofSchema', () => {
  it('should accept minimal proof', () => {
    const proof: AgentProof = {
      method: 'http-message-signature',
      key_id: 'key-2026-01',
    };
    const result = AgentProofSchema.parse(proof);
    expect(result.method).toBe('http-message-signature');
    expect(result.key_id).toBe('key-2026-01');
    expect(result.alg).toBe('EdDSA'); // default
  });

  it('should accept proof with signature and binding', () => {
    const proof: AgentProof = {
      method: 'http-message-signature',
      key_id: 'key-2026-01',
      alg: 'EdDSA',
      signature: 'base64url-signature',
      binding: {
        method: 'POST',
        target: 'https://example.com/api',
        headers_included: ['host', 'content-type'],
        signed_at: '2026-01-03T12:00:00Z',
      },
    };
    expect(AgentProofSchema.parse(proof)).toBeTruthy();
  });

  it('should accept dpop proof', () => {
    const proof: AgentProof = {
      method: 'dpop',
      key_id: 'dpop-key',
      dpop_proof: 'eyJ0eXAiOiJkcG9wK2p3dCIsImFsZyI6IkVkRFNBIn0...',
    };
    expect(AgentProofSchema.parse(proof)).toBeTruthy();
  });

  it('should accept mtls proof', () => {
    const proof: AgentProof = {
      method: 'mtls',
      key_id: 'cert-123',
      cert_thumbprint: 'sha256-thumbprint',
    };
    expect(AgentProofSchema.parse(proof)).toBeTruthy();
  });
});

describe('AgentIdentityEvidenceSchema', () => {
  it('should accept minimal evidence', () => {
    const evidence: AgentIdentityEvidence = {
      agent_id: 'bot:crawler-001',
      control_type: 'operator',
    };
    expect(AgentIdentityEvidenceSchema.parse(evidence)).toEqual(evidence);
  });

  it('should accept full evidence', () => {
    const evidence: AgentIdentityEvidence = {
      agent_id: 'bot:crawler-001',
      control_type: 'operator',
      capabilities: ['crawl', 'index'],
      operator: 'Example Corp',
      key_directory_url: 'https://example.com/.well-known/jwks.json',
      proof: {
        method: 'http-message-signature',
        key_id: 'key-2026-01',
      },
      metadata: {
        version: '1.0',
      },
    };
    expect(AgentIdentityEvidenceSchema.parse(evidence)).toBeTruthy();
  });

  it('should accept user-delegated agent', () => {
    const evidence: AgentIdentityEvidence = {
      agent_id: 'agent:assistant-001',
      control_type: 'user-delegated',
      delegation_chain: ['user:alice', 'app:myapp'],
      user_id: 'user:alice-opaque-id',
      capabilities: ['inference'],
    };
    expect(AgentIdentityEvidenceSchema.parse(evidence)).toBeTruthy();
  });

  it('should reject missing required fields', () => {
    expect(() => AgentIdentityEvidenceSchema.parse({})).toThrow();
    expect(() => AgentIdentityEvidenceSchema.parse({ agent_id: 'test' })).toThrow();
    expect(() => AgentIdentityEvidenceSchema.parse({ control_type: 'operator' })).toThrow();
  });

  it('should reject extra properties (strict mode)', () => {
    const evidence = {
      agent_id: 'bot:test',
      control_type: 'operator',
      unknown_field: 'should fail',
    };
    expect(() => AgentIdentityEvidenceSchema.parse(evidence)).toThrow();
  });
});

describe('AgentIdentityAttestationSchema', () => {
  const validAttestation: AgentIdentityAttestation = {
    type: 'peac/agent-identity',
    issuer: 'https://crawler.example.com',
    issued_at: '2026-01-03T12:00:00Z',
    evidence: {
      agent_id: 'bot:crawler-001',
      control_type: 'operator',
    },
  };

  it('should accept valid attestation', () => {
    expect(AgentIdentityAttestationSchema.parse(validAttestation)).toEqual(validAttestation);
  });

  it('should accept attestation with optional fields', () => {
    const attestation: AgentIdentityAttestation = {
      ...validAttestation,
      expires_at: '2026-01-04T12:00:00Z',
      ref: 'https://crawler.example.com/verify',
    };
    expect(AgentIdentityAttestationSchema.parse(attestation)).toBeTruthy();
  });

  it('should reject wrong type literal', () => {
    const invalid = {
      ...validAttestation,
      type: 'peac/other-type',
    };
    expect(() => AgentIdentityAttestationSchema.parse(invalid)).toThrow();
  });

  it('should reject invalid datetime format', () => {
    const invalid = {
      ...validAttestation,
      issued_at: 'not-a-date',
    };
    expect(() => AgentIdentityAttestationSchema.parse(invalid)).toThrow();
  });

  it('should have correct type constant', () => {
    expect(AGENT_IDENTITY_TYPE).toBe('peac/agent-identity');
  });
});

describe('IdentityBindingSchema', () => {
  const validBinding: IdentityBinding = {
    binding_message_hash: 'sha256-base64url-hash',
    signature: 'ed25519-signature',
    key_id: 'key-2026-01',
    signed_at: '2026-01-03T12:00:00Z',
  };

  it('should accept valid binding', () => {
    expect(IdentityBindingSchema.parse(validBinding)).toEqual(validBinding);
  });

  it('should reject missing fields', () => {
    expect(() => IdentityBindingSchema.parse({})).toThrow();
    expect(() => IdentityBindingSchema.parse({ binding_message_hash: 'hash' })).toThrow();
  });
});

describe('AgentIdentityVerifiedSchema', () => {
  const validVerified = {
    agent_id: 'bot:crawler-001',
    control_type: 'operator' as const,
    verified_at: '2026-01-03T12:00:00Z',
    key_id: 'key-2026-01',
    binding_hash: 'sha256-hash',
  };

  it('should accept valid verified block', () => {
    expect(AgentIdentityVerifiedSchema.parse(validVerified)).toEqual(validVerified);
  });

  it('should reject missing fields', () => {
    expect(() => AgentIdentityVerifiedSchema.parse({})).toThrow();
  });
});

describe('validateAgentIdentityAttestation', () => {
  it('should return ok for valid attestation', () => {
    const attestation = {
      type: 'peac/agent-identity',
      issuer: 'https://example.com',
      issued_at: '2026-01-03T12:00:00Z',
      evidence: {
        agent_id: 'bot:test',
        control_type: 'operator',
      },
    };
    const result = validateAgentIdentityAttestation(attestation);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.evidence.agent_id).toBe('bot:test');
    }
  });

  it('should return error for invalid attestation', () => {
    const result = validateAgentIdentityAttestation({ type: 'wrong' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });
});

describe('isAgentIdentityAttestation', () => {
  it('should return true for agent identity type', () => {
    expect(isAgentIdentityAttestation({ type: 'peac/agent-identity' })).toBe(true);
  });

  it('should return false for other types', () => {
    expect(isAgentIdentityAttestation({ type: 'peac/other' })).toBe(false);
    expect(isAgentIdentityAttestation({ type: '' })).toBe(false);
  });
});

describe('createAgentIdentityAttestation', () => {
  it('should create attestation with required fields', () => {
    const attestation = createAgentIdentityAttestation({
      issuer: 'https://example.com',
      agent_id: 'bot:test',
      control_type: 'operator',
    });

    expect(attestation.type).toBe('peac/agent-identity');
    expect(attestation.issuer).toBe('https://example.com');
    expect(attestation.evidence.agent_id).toBe('bot:test');
    expect(attestation.evidence.control_type).toBe('operator');
    expect(attestation.issued_at).toBeTruthy();
    // Verify it parses as valid ISO 8601
    expect(() => new Date(attestation.issued_at)).not.toThrow();
  });

  it('should create attestation with optional fields', () => {
    const attestation = createAgentIdentityAttestation({
      issuer: 'https://example.com',
      agent_id: 'bot:test',
      control_type: 'operator',
      capabilities: ['crawl', 'index'],
      operator: 'Example Corp',
      expires_at: '2026-12-31T23:59:59Z',
      ref: 'https://example.com/verify',
    });

    expect(attestation.evidence.capabilities).toEqual(['crawl', 'index']);
    expect(attestation.evidence.operator).toBe('Example Corp');
    expect(attestation.expires_at).toBe('2026-12-31T23:59:59Z');
    expect(attestation.ref).toBe('https://example.com/verify');
  });

  it('should create user-delegated attestation', () => {
    const attestation = createAgentIdentityAttestation({
      issuer: 'https://assistant.example.com',
      agent_id: 'agent:claude-001',
      control_type: 'user-delegated',
      delegation_chain: ['user:alice'],
      user_id: 'user:alice-opaque',
    });

    expect(attestation.evidence.control_type).toBe('user-delegated');
    expect(attestation.evidence.delegation_chain).toEqual(['user:alice']);
    expect(attestation.evidence.user_id).toBe('user:alice-opaque');
  });

  it('should validate against schema', () => {
    const attestation = createAgentIdentityAttestation({
      issuer: 'https://example.com',
      agent_id: 'bot:test',
      control_type: 'operator',
    });

    // Created attestation should be schema-valid
    expect(() => AgentIdentityAttestationSchema.parse(attestation)).not.toThrow();
  });
});

describe('validateIdentityBinding', () => {
  it('should validate correct binding', () => {
    const binding = {
      binding_message_hash: 'hash123',
      signature: 'sig123',
      key_id: 'key-001',
      signed_at: '2026-01-03T12:00:00Z',
    };
    const result = validateIdentityBinding(binding);
    expect(result.ok).toBe(true);
  });

  it('should reject invalid binding', () => {
    const result = validateIdentityBinding({ incomplete: true });
    expect(result.ok).toBe(false);
  });
});

describe('isAttestationExpired', () => {
  it('should return false for non-expiring attestation', () => {
    const attestation = createAgentIdentityAttestation({
      issuer: 'https://example.com',
      agent_id: 'bot:test',
      control_type: 'operator',
    });
    expect(isAttestationExpired(attestation)).toBe(false);
  });

  it('should return true for expired attestation', () => {
    const attestation = createAgentIdentityAttestation({
      issuer: 'https://example.com',
      agent_id: 'bot:test',
      control_type: 'operator',
      expires_at: '2020-01-01T00:00:00Z', // Past date
    });
    expect(isAttestationExpired(attestation)).toBe(true);
  });

  it('should return false for future expiry', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString(); // +1 day
    const attestation = createAgentIdentityAttestation({
      issuer: 'https://example.com',
      agent_id: 'bot:test',
      control_type: 'operator',
      expires_at: futureDate,
    });
    expect(isAttestationExpired(attestation)).toBe(false);
  });
});

describe('isAttestationNotYetValid', () => {
  it('should return false for attestation issued now', () => {
    const attestation = createAgentIdentityAttestation({
      issuer: 'https://example.com',
      agent_id: 'bot:test',
      control_type: 'operator',
    });
    expect(isAttestationNotYetValid(attestation)).toBe(false);
  });

  it('should return false for past issued_at', () => {
    const attestation: AgentIdentityAttestation = {
      type: 'peac/agent-identity',
      issuer: 'https://example.com',
      issued_at: '2020-01-01T00:00:00Z', // Past
      evidence: {
        agent_id: 'bot:test',
        control_type: 'operator',
      },
    };
    expect(isAttestationNotYetValid(attestation)).toBe(false);
  });

  it('should return true for future issued_at', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString(); // +1 day
    const attestation: AgentIdentityAttestation = {
      type: 'peac/agent-identity',
      issuer: 'https://example.com',
      issued_at: futureDate,
      evidence: {
        agent_id: 'bot:test',
        control_type: 'operator',
      },
    };
    expect(isAttestationNotYetValid(attestation)).toBe(true);
  });
});
