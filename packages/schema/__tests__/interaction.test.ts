/**
 * Interaction Evidence Tests (v0.10.7+)
 *
 * Tests for InteractionEvidenceV01 schema, validators, and SDK accessors.
 */

import { describe, it, expect } from 'vitest';
import {
  // Zod Schemas
  DigestAlgSchema,
  DigestSchema,
  PayloadRefSchema,
  ExecutorSchema,
  ToolTargetSchema,
  ResourceTargetSchema,
  ResultSchema,
  PolicyContextSchema,
  RefsSchema,
  KindSchema,
  InteractionEvidenceV01Schema,
  // Constants
  INTERACTION_EXTENSION_KEY,
  CANONICAL_DIGEST_ALGS,
  DIGEST_SIZE_CONSTANTS,
  RESULT_STATUSES,
  REDACTION_MODES,
  POLICY_DECISIONS,
  WELL_KNOWN_KINDS,
  RESERVED_KIND_PREFIXES,
  INTERACTION_LIMITS,
  KIND_FORMAT_PATTERN,
  EXTENSION_KEY_PATTERN,
  DIGEST_VALUE_PATTERN,
  // Validation
  validateInteraction,
  validateInteractionOrdered,
  validateInteractionEvidence,
  isValidInteractionEvidence,
  // Helpers
  isWellKnownKind,
  isReservedKindPrefix,
  isDigestTruncated,
  // SDK Accessors
  getInteraction,
  setInteraction,
  hasInteraction,
  // Projection API
  createReceiptView,
  // Factory
  createInteractionEvidence,
  // Types
  type InteractionEvidenceV01,
  type PEACEnvelope,
} from '../src';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const VALID_DATETIME = '2024-02-01T10:00:00Z';
const VALID_DATETIME_LATER = '2024-02-01T10:00:01Z';
const VALID_DIGEST_VALUE = 'a'.repeat(64);
const VALID_DIGEST_VALUE_2 = 'b'.repeat(64);

const validDigest = {
  alg: 'sha-256' as const,
  value: VALID_DIGEST_VALUE,
  bytes: 1024,
};

const validPayloadRef = {
  digest: validDigest,
  redaction: 'hash_only' as const,
};

const validExecutor = {
  platform: 'openclaw',
  version: '0.2.0',
};

const validToolTarget = {
  name: 'web_search',
  provider: 'builtin',
};

const validResourceTarget = {
  uri: 'https://api.example.com/data',
  method: 'GET',
};

const validResult = {
  status: 'ok' as const,
};

const validEvidence: InteractionEvidenceV01 = {
  interaction_id: 'openclaw:run_abc:call_123',
  kind: 'tool.call',
  executor: validExecutor,
  tool: validToolTarget,
  started_at: VALID_DATETIME,
  completed_at: VALID_DATETIME_LATER,
  result: validResult,
};

const minimalEvidence: InteractionEvidenceV01 = {
  interaction_id: 'test-id-123',
  kind: 'message',
  executor: { platform: 'test' },
  started_at: VALID_DATETIME,
};

// =============================================================================
// CONSTANTS TESTS
// =============================================================================

describe('Constants', () => {
  describe('INTERACTION_EXTENSION_KEY', () => {
    it('should have correct value', () => {
      expect(INTERACTION_EXTENSION_KEY).toBe('org.peacprotocol/interaction@0.1');
    });
  });

  describe('CANONICAL_DIGEST_ALGS', () => {
    it('should have correct values', () => {
      expect(CANONICAL_DIGEST_ALGS).toEqual(['sha-256', 'sha-256:trunc-64k', 'sha-256:trunc-1m']);
    });
  });

  describe('DIGEST_SIZE_CONSTANTS', () => {
    it('should have correct binary values', () => {
      expect(DIGEST_SIZE_CONSTANTS.k).toBe(1024);
      expect(DIGEST_SIZE_CONSTANTS.m).toBe(1048576);
      expect(DIGEST_SIZE_CONSTANTS['trunc-64k']).toBe(65536);
      expect(DIGEST_SIZE_CONSTANTS['trunc-1m']).toBe(1048576);
    });
  });

  describe('RESULT_STATUSES', () => {
    it('should have correct values', () => {
      expect(RESULT_STATUSES).toEqual(['ok', 'error', 'timeout', 'canceled']);
    });
  });

  describe('REDACTION_MODES', () => {
    it('should have correct values', () => {
      expect(REDACTION_MODES).toEqual(['hash_only', 'redacted', 'plaintext_allowlisted']);
    });
  });

  describe('POLICY_DECISIONS', () => {
    it('should have correct values', () => {
      expect(POLICY_DECISIONS).toEqual(['allow', 'deny', 'constrained']);
    });
  });

  describe('WELL_KNOWN_KINDS', () => {
    it('should have correct values', () => {
      expect(WELL_KNOWN_KINDS).toEqual([
        'tool.call',
        'http.request',
        'fs.read',
        'fs.write',
        'message',
      ]);
    });
  });

  describe('RESERVED_KIND_PREFIXES', () => {
    it('should have correct values', () => {
      expect(RESERVED_KIND_PREFIXES).toEqual(['peac.', 'org.peacprotocol.']);
    });
  });

  describe('INTERACTION_LIMITS', () => {
    it('should have reasonable limits', () => {
      expect(INTERACTION_LIMITS.maxInteractionIdLength).toBe(256);
      expect(INTERACTION_LIMITS.maxKindLength).toBe(128);
      expect(INTERACTION_LIMITS.maxPlatformLength).toBe(64);
      expect(INTERACTION_LIMITS.maxToolNameLength).toBe(256);
      expect(INTERACTION_LIMITS.maxUriLength).toBe(2048);
    });
  });
});

// =============================================================================
// PATTERN TESTS
// =============================================================================

describe('Patterns', () => {
  describe('KIND_FORMAT_PATTERN', () => {
    it('should match valid kinds', () => {
      expect(KIND_FORMAT_PATTERN.test('tool.call')).toBe(true);
      expect(KIND_FORMAT_PATTERN.test('http.request')).toBe(true);
      expect(KIND_FORMAT_PATTERN.test('fs.read')).toBe(true);
      expect(KIND_FORMAT_PATTERN.test('message')).toBe(true);
      expect(KIND_FORMAT_PATTERN.test('custom:com.example.foo')).toBe(true);
      expect(KIND_FORMAT_PATTERN.test('ab')).toBe(true); // min 2 chars
    });

    it('should reject invalid kinds', () => {
      expect(KIND_FORMAT_PATTERN.test('A')).toBe(false); // min 2 chars
      expect(KIND_FORMAT_PATTERN.test('Tool.call')).toBe(false); // uppercase
      expect(KIND_FORMAT_PATTERN.test('1tool')).toBe(false); // starts with digit
      expect(KIND_FORMAT_PATTERN.test('tool-')).toBe(false); // ends with hyphen
    });
  });

  describe('EXTENSION_KEY_PATTERN', () => {
    it('should match valid extension keys', () => {
      expect(EXTENSION_KEY_PATTERN.test('com.example/foo')).toBe(true);
      expect(EXTENSION_KEY_PATTERN.test('org.peacprotocol/interaction@0.1')).toBe(true);
      expect(EXTENSION_KEY_PATTERN.test('io.vendor/custom-data')).toBe(true);
      expect(EXTENSION_KEY_PATTERN.test('org.openclaw/context')).toBe(true);
    });

    it('should reject invalid extension keys', () => {
      expect(EXTENSION_KEY_PATTERN.test('foo')).toBe(false); // no domain
      expect(EXTENSION_KEY_PATTERN.test('com/foo')).toBe(false); // single-part domain
      expect(EXTENSION_KEY_PATTERN.test('COM.EXAMPLE/FOO')).toBe(false); // uppercase
    });
  });

  describe('DIGEST_VALUE_PATTERN', () => {
    it('should match valid digest values', () => {
      expect(DIGEST_VALUE_PATTERN.test('a'.repeat(64))).toBe(true);
      expect(DIGEST_VALUE_PATTERN.test('0123456789abcdef'.repeat(4))).toBe(true);
    });

    it('should reject invalid digest values', () => {
      expect(DIGEST_VALUE_PATTERN.test('a'.repeat(63))).toBe(false); // too short
      expect(DIGEST_VALUE_PATTERN.test('a'.repeat(65))).toBe(false); // too long
      expect(DIGEST_VALUE_PATTERN.test('A'.repeat(64))).toBe(false); // uppercase
      expect(DIGEST_VALUE_PATTERN.test('g'.repeat(64))).toBe(false); // invalid hex
    });
  });
});

// =============================================================================
// ZOD SCHEMA TESTS
// =============================================================================

describe('DigestAlgSchema', () => {
  it('should accept canonical algorithms', () => {
    expect(DigestAlgSchema.parse('sha-256')).toBe('sha-256');
    expect(DigestAlgSchema.parse('sha-256:trunc-64k')).toBe('sha-256:trunc-64k');
    expect(DigestAlgSchema.parse('sha-256:trunc-1m')).toBe('sha-256:trunc-1m');
  });

  it('should reject non-canonical algorithms', () => {
    expect(() => DigestAlgSchema.parse('SHA-256')).toThrow(); // uppercase
    expect(() => DigestAlgSchema.parse('sha256')).toThrow(); // no hyphen
    expect(() => DigestAlgSchema.parse('sha-256:trunc-100k')).toThrow(); // non-standard
  });
});

describe('DigestSchema', () => {
  it('should accept valid digests', () => {
    const result = DigestSchema.parse(validDigest);
    expect(result.alg).toBe('sha-256');
    expect(result.value).toBe(VALID_DIGEST_VALUE);
    expect(result.bytes).toBe(1024);
  });

  it('should accept truncated digests', () => {
    const truncated = { ...validDigest, alg: 'sha-256:trunc-1m' as const };
    const result = DigestSchema.parse(truncated);
    expect(result.alg).toBe('sha-256:trunc-1m');
  });

  it('should reject invalid digest value', () => {
    expect(() => DigestSchema.parse({ ...validDigest, value: 'abc' })).toThrow();
  });

  it('should reject negative bytes', () => {
    expect(() => DigestSchema.parse({ ...validDigest, bytes: -1 })).toThrow();
  });

  it('should reject extra fields (strict mode)', () => {
    expect(() => DigestSchema.parse({ ...validDigest, extra: 'field' })).toThrow();
  });
});

describe('PayloadRefSchema', () => {
  it('should accept valid payload refs', () => {
    const result = PayloadRefSchema.parse(validPayloadRef);
    expect(result.redaction).toBe('hash_only');
  });

  it('should accept all redaction modes', () => {
    for (const mode of REDACTION_MODES) {
      const ref = { ...validPayloadRef, redaction: mode };
      expect(PayloadRefSchema.parse(ref).redaction).toBe(mode);
    }
  });

  it('should reject invalid redaction mode', () => {
    expect(() => PayloadRefSchema.parse({ ...validPayloadRef, redaction: 'invalid' })).toThrow();
  });
});

describe('ExecutorSchema', () => {
  it('should accept valid executor with all fields', () => {
    const executor = {
      platform: 'openclaw',
      version: '0.2.0',
      plugin_id: 'peac-receipts',
      plugin_digest: validDigest,
    };
    const result = ExecutorSchema.parse(executor);
    expect(result.platform).toBe('openclaw');
    expect(result.version).toBe('0.2.0');
    expect(result.plugin_id).toBe('peac-receipts');
    expect(result.plugin_digest).toBeDefined();
  });

  it('should accept minimal executor', () => {
    const result = ExecutorSchema.parse({ platform: 'test' });
    expect(result.platform).toBe('test');
    expect(result.version).toBeUndefined();
  });

  it('should reject empty platform', () => {
    expect(() => ExecutorSchema.parse({ platform: '' })).toThrow();
  });

  it('should reject platform exceeding max length', () => {
    expect(() => ExecutorSchema.parse({ platform: 'a'.repeat(65) })).toThrow();
  });
});

describe('ToolTargetSchema', () => {
  it('should accept valid tool target', () => {
    const result = ToolTargetSchema.parse(validToolTarget);
    expect(result.name).toBe('web_search');
    expect(result.provider).toBe('builtin');
  });

  it('should accept minimal tool target', () => {
    const result = ToolTargetSchema.parse({ name: 'my_tool' });
    expect(result.name).toBe('my_tool');
  });

  it('should reject empty name', () => {
    expect(() => ToolTargetSchema.parse({ name: '' })).toThrow();
  });
});

describe('ResourceTargetSchema', () => {
  it('should accept valid resource target', () => {
    const result = ResourceTargetSchema.parse(validResourceTarget);
    expect(result.uri).toBe('https://api.example.com/data');
    expect(result.method).toBe('GET');
  });

  it('should accept empty resource target', () => {
    const result = ResourceTargetSchema.parse({});
    expect(result.uri).toBeUndefined();
    expect(result.method).toBeUndefined();
  });
});

describe('ResultSchema', () => {
  it('should accept all status values', () => {
    for (const status of RESULT_STATUSES) {
      const result = ResultSchema.parse({ status });
      expect(result.status).toBe(status);
    }
  });

  it('should accept error with code', () => {
    const result = ResultSchema.parse({
      status: 'error',
      error_code: 'E_TEST_ERROR',
      retryable: true,
    });
    expect(result.status).toBe('error');
    expect(result.error_code).toBe('E_TEST_ERROR');
    expect(result.retryable).toBe(true);
  });
});

describe('PolicyContextSchema', () => {
  it('should accept all decision values', () => {
    for (const decision of POLICY_DECISIONS) {
      const result = PolicyContextSchema.parse({ decision });
      expect(result.decision).toBe(decision);
    }
  });

  it('should accept full policy context', () => {
    const policy = {
      decision: 'allow' as const,
      sandbox_enabled: true,
      elevated: false,
      effective_policy_digest: validDigest,
    };
    const result = PolicyContextSchema.parse(policy);
    expect(result.sandbox_enabled).toBe(true);
    expect(result.elevated).toBe(false);
  });
});

describe('KindSchema', () => {
  it('should accept well-known kinds', () => {
    for (const kind of WELL_KNOWN_KINDS) {
      expect(KindSchema.parse(kind)).toBe(kind);
    }
  });

  it('should accept custom kinds', () => {
    expect(KindSchema.parse('custom:com.example.foo')).toBe('custom:com.example.foo');
    expect(KindSchema.parse('my-custom-kind')).toBe('my-custom-kind');
  });

  it('should reject kinds that are too short', () => {
    expect(() => KindSchema.parse('a')).toThrow();
  });

  it('should reject kinds with invalid format', () => {
    expect(() => KindSchema.parse('Tool.Call')).toThrow();
    expect(() => KindSchema.parse('1invalid')).toThrow();
  });
});

describe('InteractionEvidenceV01Schema', () => {
  it('should accept valid evidence', () => {
    const result = InteractionEvidenceV01Schema.parse(validEvidence);
    expect(result.interaction_id).toBe('openclaw:run_abc:call_123');
    expect(result.kind).toBe('tool.call');
    expect(result.executor.platform).toBe('openclaw');
  });

  it('should accept minimal evidence', () => {
    const result = InteractionEvidenceV01Schema.parse(minimalEvidence);
    expect(result.interaction_id).toBe('test-id-123');
    expect(result.kind).toBe('message');
  });

  it('should accept evidence with input/output', () => {
    const evidence = {
      ...minimalEvidence,
      input: validPayloadRef,
      output: validPayloadRef,
      result: validResult,
    };
    const result = InteractionEvidenceV01Schema.parse(evidence);
    expect(result.input).toBeDefined();
    expect(result.output).toBeDefined();
  });

  it('should accept evidence with duration_ms', () => {
    const evidence = { ...minimalEvidence, duration_ms: 150 };
    const result = InteractionEvidenceV01Schema.parse(evidence);
    expect(result.duration_ms).toBe(150);
  });

  it('should accept evidence with refs', () => {
    const evidence = {
      ...minimalEvidence,
      refs: {
        payment_reference: 'pay_abc123',
        related_receipt_rid: 'r_01HXYZ',
      },
    };
    const result = InteractionEvidenceV01Schema.parse(evidence);
    expect(result.refs?.payment_reference).toBe('pay_abc123');
  });

  describe('Schema invariants (superRefine)', () => {
    describe('Invariant 1: completed_at >= started_at', () => {
      it('should reject completed_at < started_at', () => {
        const evidence = {
          ...minimalEvidence,
          started_at: '2024-02-01T10:00:01Z',
          completed_at: '2024-02-01T10:00:00Z', // Before started_at
        };
        const result = InteractionEvidenceV01Schema.safeParse(evidence);
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.errors.map((e) => e.message);
          expect(messages).toContain('completed_at must be >= started_at');
        }
      });
    });

    describe('Invariant 2: output requires result.status', () => {
      it('should reject output without result', () => {
        const evidence = {
          ...minimalEvidence,
          output: validPayloadRef,
          // No result
        };
        const result = InteractionEvidenceV01Schema.safeParse(evidence);
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.errors.map((e) => e.message);
          expect(messages).toContain('result.status is required when output is present');
        }
      });
    });

    describe('Invariant 3: error status requires detail', () => {
      it('should reject error without error_code or extensions', () => {
        const evidence = {
          ...minimalEvidence,
          result: { status: 'error' as const },
          // No error_code, no extensions
        };
        const result = InteractionEvidenceV01Schema.safeParse(evidence);
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.errors.map((e) => e.message);
          expect(messages).toContain(
            'error_code or non-empty extensions required when status is error'
          );
        }
      });

      it('should reject error with empty extensions object', () => {
        const evidence = {
          ...minimalEvidence,
          result: { status: 'error' as const },
          extensions: {}, // Empty - not valid detail
        };
        const result = InteractionEvidenceV01Schema.safeParse(evidence);
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.errors.map((e) => e.message);
          expect(messages).toContain(
            'error_code or non-empty extensions required when status is error'
          );
        }
      });

      it('should accept error with error_code', () => {
        const evidence = {
          ...minimalEvidence,
          result: { status: 'error' as const, error_code: 'E_TEST' },
        };
        const result = InteractionEvidenceV01Schema.safeParse(evidence);
        expect(result.success).toBe(true);
      });

      it('should accept error with non-empty extensions', () => {
        const evidence = {
          ...minimalEvidence,
          result: { status: 'error' as const },
          extensions: { 'com.example/error-details': { message: 'test' } },
        };
        const result = InteractionEvidenceV01Schema.safeParse(evidence);
        expect(result.success).toBe(true);
      });
    });

    describe('Invariant 4: extension keys must be namespaced', () => {
      it('should reject invalid extension key format', () => {
        const evidence = {
          ...minimalEvidence,
          extensions: { 'invalid-key': { data: 'test' } },
        };
        const result = InteractionEvidenceV01Schema.safeParse(evidence);
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.errors.map((e) => e.message);
          expect(messages.some((m) => m.includes('Invalid extension key format'))).toBe(true);
        }
      });

      it('should accept valid extension keys', () => {
        const evidence = {
          ...minimalEvidence,
          extensions: {
            'com.example/data': { test: true },
            'org.openclaw/context': { channel: 'direct' },
          },
        };
        const result = InteractionEvidenceV01Schema.safeParse(evidence);
        expect(result.success).toBe(true);
      });
    });

    describe('Invariant 5: reserved kind prefixes', () => {
      it('should reject kind using reserved peac.* prefix not in registry', () => {
        const evidence = {
          ...minimalEvidence,
          kind: 'peac.custom-action',
        };
        const result = InteractionEvidenceV01Schema.safeParse(evidence);
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.errors.map((e) => e.message);
          expect(messages.some((m) => m.includes('uses reserved prefix'))).toBe(true);
        }
      });

      it('should reject kind using reserved org.peacprotocol.* prefix not in registry', () => {
        const evidence = {
          ...minimalEvidence,
          kind: 'org.peacprotocol.something',
        };
        const result = InteractionEvidenceV01Schema.safeParse(evidence);
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.errors.map((e) => e.message);
          expect(messages.some((m) => m.includes('uses reserved prefix'))).toBe(true);
        }
      });
    });

    describe('Invariant 6: target consistency', () => {
      it('should reject tool.call kind without tool field', () => {
        const evidence = {
          ...minimalEvidence,
          kind: 'tool.call',
          // No tool field
        };
        const result = InteractionEvidenceV01Schema.safeParse(evidence);
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.errors.map((e) => e.message);
          expect(messages.some((m) => m.includes('requires tool field'))).toBe(true);
        }
      });

      it('should reject http.request kind without resource field', () => {
        const evidence = {
          ...minimalEvidence,
          kind: 'http.request',
          // No resource field
        };
        const result = InteractionEvidenceV01Schema.safeParse(evidence);
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.errors.map((e) => e.message);
          expect(messages.some((m) => m.includes('requires resource field'))).toBe(true);
        }
      });

      it('should reject fs.read kind without resource field', () => {
        const evidence = {
          ...minimalEvidence,
          kind: 'fs.read',
          // No resource field
        };
        const result = InteractionEvidenceV01Schema.safeParse(evidence);
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.errors.map((e) => e.message);
          expect(messages.some((m) => m.includes('requires resource field'))).toBe(true);
        }
      });

      it('should accept tool.call kind with tool field', () => {
        const evidence = {
          ...minimalEvidence,
          kind: 'tool.call',
          tool: { name: 'test_tool' },
        };
        const result = InteractionEvidenceV01Schema.safeParse(evidence);
        expect(result.success).toBe(true);
      });

      it('should accept http.request kind with resource field', () => {
        const evidence = {
          ...minimalEvidence,
          kind: 'http.request',
          resource: { uri: 'https://example.com/api' },
        };
        const result = InteractionEvidenceV01Schema.safeParse(evidence);
        expect(result.success).toBe(true);
      });
    });
  });
});

// =============================================================================
// COMPATIBILITY API TESTS
// =============================================================================

describe('validateInteraction (compatibility API)', () => {
  it('should return { valid: true } for valid evidence', () => {
    const result = validateInteraction(validEvidence);
    expect(result.valid).toBe(true);
    expect(result.error_code).toBeUndefined();
    expect(result.error_field).toBeUndefined();
  });

  it('should return error_code for invalid evidence', () => {
    const result = validateInteraction({ invalid: 'data' });
    expect(result.valid).toBe(false);
    expect(result.error_code).toBeDefined();
  });

  it('should return E_INTERACTION_MISSING_ID for missing interaction_id', () => {
    const evidence = { ...minimalEvidence, interaction_id: undefined };
    const result = validateInteraction(evidence);
    expect(result.valid).toBe(false);
    expect(result.error_code).toBe('E_INTERACTION_MISSING_ID');
    expect(result.error_field).toBe('interaction_id');
  });

  it('should return E_INTERACTION_MISSING_TARGET for tool.call without tool', () => {
    const evidence = { ...minimalEvidence, kind: 'tool.call' };
    const result = validateInteraction(evidence);
    expect(result.valid).toBe(false);
    expect(result.error_code).toBe('E_INTERACTION_MISSING_TARGET');
  });
});

// =============================================================================
// ORDERED VALIDATION TESTS
// =============================================================================

describe('validateInteractionOrdered', () => {
  it('should return valid for correct evidence', () => {
    const result = validateInteractionOrdered(validEvidence);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.interaction_id).toBe('openclaw:run_abc:call_123');
      expect(result.warnings).toHaveLength(0);
    }
  });

  it('should return valid for minimal evidence', () => {
    const result = validateInteractionOrdered(minimalEvidence);
    expect(result.valid).toBe(true);
    if (result.valid) {
      // Should have warning about missing target
      expect(result.warnings.some((w) => w.code === 'W_INTERACTION_MISSING_TARGET')).toBe(true);
    }
  });

  describe('Error code priority', () => {
    it('should return E_INTERACTION_INVALID_FORMAT for non-object', () => {
      const result = validateInteractionOrdered('not an object');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0].code).toBe('E_INTERACTION_INVALID_FORMAT');
      }
    });

    it('should return E_INTERACTION_MISSING_ID for missing interaction_id', () => {
      const evidence = { ...minimalEvidence, interaction_id: undefined };
      const result = validateInteractionOrdered(evidence);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === 'E_INTERACTION_MISSING_ID')).toBe(true);
      }
    });

    it('should return E_INTERACTION_MISSING_KIND for missing kind', () => {
      const evidence = { ...minimalEvidence, kind: undefined };
      const result = validateInteractionOrdered(evidence);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === 'E_INTERACTION_MISSING_KIND')).toBe(true);
      }
    });

    it('should return E_INTERACTION_INVALID_KIND_FORMAT for invalid kind', () => {
      const evidence = { ...minimalEvidence, kind: 'INVALID' };
      const result = validateInteractionOrdered(evidence);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === 'E_INTERACTION_INVALID_KIND_FORMAT')).toBe(
          true
        );
      }
    });

    it('should return E_INTERACTION_KIND_RESERVED for reserved prefix', () => {
      const evidence = { ...minimalEvidence, kind: 'peac.custom-kind' };
      const result = validateInteractionOrdered(evidence);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === 'E_INTERACTION_KIND_RESERVED')).toBe(true);
      }
    });

    it('should return E_INTERACTION_MISSING_EXECUTOR for missing executor', () => {
      const evidence = { ...minimalEvidence, executor: undefined };
      const result = validateInteractionOrdered(evidence);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === 'E_INTERACTION_MISSING_EXECUTOR')).toBe(true);
      }
    });

    it('should return E_INTERACTION_INVALID_TIMING for bad timing', () => {
      const evidence = {
        ...minimalEvidence,
        started_at: '2024-02-01T10:00:01Z',
        completed_at: '2024-02-01T10:00:00Z',
      };
      const result = validateInteractionOrdered(evidence);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === 'E_INTERACTION_INVALID_TIMING')).toBe(true);
      }
    });

    it('should return E_INTERACTION_MISSING_RESULT for output without result', () => {
      const evidence = {
        ...minimalEvidence,
        output: validPayloadRef,
      };
      const result = validateInteractionOrdered(evidence);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === 'E_INTERACTION_MISSING_RESULT')).toBe(true);
      }
    });

    it('should return E_INTERACTION_MISSING_ERROR_DETAIL for error without detail', () => {
      const evidence = {
        ...minimalEvidence,
        result: { status: 'error' as const },
      };
      const result = validateInteractionOrdered(evidence);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === 'E_INTERACTION_MISSING_ERROR_DETAIL')).toBe(
          true
        );
      }
    });

    it('should return E_INTERACTION_MISSING_ERROR_DETAIL for error with empty extensions', () => {
      const evidence = {
        ...minimalEvidence,
        result: { status: 'error' as const },
        extensions: {}, // Empty - not valid detail
      };
      const result = validateInteractionOrdered(evidence);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === 'E_INTERACTION_MISSING_ERROR_DETAIL')).toBe(
          true
        );
      }
    });

    it('should return E_INTERACTION_MISSING_TARGET for tool.* kind without tool', () => {
      const evidence = {
        ...minimalEvidence,
        kind: 'tool.call',
        // No tool field
      };
      const result = validateInteractionOrdered(evidence);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === 'E_INTERACTION_MISSING_TARGET')).toBe(true);
      }
    });

    it('should return E_INTERACTION_MISSING_TARGET for http.* kind without resource', () => {
      const evidence = {
        ...minimalEvidence,
        kind: 'http.request',
        // No resource field
      };
      const result = validateInteractionOrdered(evidence);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === 'E_INTERACTION_MISSING_TARGET')).toBe(true);
      }
    });

    it('should return E_INTERACTION_INVALID_EXTENSION_KEY for bad extension key', () => {
      const evidence = {
        ...minimalEvidence,
        extensions: { 'bad-key': {} },
      };
      const result = validateInteractionOrdered(evidence);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === 'E_INTERACTION_INVALID_EXTENSION_KEY')).toBe(
          true
        );
      }
    });

    it('should return E_INTERACTION_INVALID_DIGEST_ALG for bad digest alg', () => {
      const evidence = {
        ...minimalEvidence,
        input: {
          digest: { alg: 'sha512', value: VALID_DIGEST_VALUE, bytes: 100 },
          redaction: 'hash_only' as const,
        },
      };
      const result = validateInteractionOrdered(evidence);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.code === 'E_INTERACTION_INVALID_DIGEST_ALG')).toBe(true);
      }
    });
  });

  describe('Warnings', () => {
    it('should warn for unregistered kind', () => {
      const evidence = {
        ...minimalEvidence,
        kind: 'custom:com.example.foo',
      };
      const result = validateInteractionOrdered(evidence);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.warnings.some((w) => w.code === 'W_INTERACTION_KIND_UNREGISTERED')).toBe(
          true
        );
      }
    });

    it('should warn for missing target on non-strict kinds', () => {
      const result = validateInteractionOrdered(minimalEvidence);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.warnings.some((w) => w.code === 'W_INTERACTION_MISSING_TARGET')).toBe(true);
      }
    });

    it('should not warn for tool.call with tool', () => {
      const result = validateInteractionOrdered(validEvidence);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.warnings).toHaveLength(0);
      }
    });
  });
});

// =============================================================================
// HELPER FUNCTION TESTS
// =============================================================================

describe('Helper Functions', () => {
  describe('validateInteractionEvidence', () => {
    it('should return parsed evidence for valid input', () => {
      const result = validateInteractionEvidence(validEvidence);
      expect(result.interaction_id).toBe('openclaw:run_abc:call_123');
    });

    it('should throw for invalid input', () => {
      expect(() => validateInteractionEvidence({})).toThrow();
    });
  });

  describe('isValidInteractionEvidence', () => {
    it('should return true for valid evidence', () => {
      expect(isValidInteractionEvidence(validEvidence)).toBe(true);
    });

    it('should return false for invalid evidence', () => {
      expect(isValidInteractionEvidence({})).toBe(false);
    });
  });

  describe('isWellKnownKind', () => {
    it('should return true for well-known kinds', () => {
      expect(isWellKnownKind('tool.call')).toBe(true);
      expect(isWellKnownKind('http.request')).toBe(true);
      expect(isWellKnownKind('message')).toBe(true);
    });

    it('should return false for unknown kinds', () => {
      expect(isWellKnownKind('custom:foo')).toBe(false);
      expect(isWellKnownKind('unknown')).toBe(false);
    });
  });

  describe('isReservedKindPrefix', () => {
    it('should return true for reserved prefixes', () => {
      expect(isReservedKindPrefix('peac.foo')).toBe(true);
      expect(isReservedKindPrefix('org.peacprotocol.bar')).toBe(true);
    });

    it('should return false for non-reserved prefixes', () => {
      expect(isReservedKindPrefix('tool.call')).toBe(false);
      expect(isReservedKindPrefix('custom:foo')).toBe(false);
    });
  });

  describe('isDigestTruncated', () => {
    it('should return true for truncated digests', () => {
      expect(
        isDigestTruncated({ alg: 'sha-256:trunc-64k', value: VALID_DIGEST_VALUE, bytes: 1000 })
      ).toBe(true);
      expect(
        isDigestTruncated({ alg: 'sha-256:trunc-1m', value: VALID_DIGEST_VALUE, bytes: 2000000 })
      ).toBe(true);
    });

    it('should return false for full digests', () => {
      expect(isDigestTruncated(validDigest)).toBe(false);
    });
  });
});

// =============================================================================
// SDK ACCESSOR TESTS
// =============================================================================

describe('SDK Accessors', () => {
  describe('getInteraction', () => {
    it('should return interaction from envelope', () => {
      const envelope: PEACEnvelope = {
        auth: {
          iss: 'https://issuer.example.com',
          aud: 'https://resource.example.com',
          sub: 'agent:test',
          iat: 1706745600,
          rid: 'r_test',
          policy_hash: 'sha256:abc',
          policy_uri: 'https://example.com/policy',
        },
        evidence: {
          extensions: {
            [INTERACTION_EXTENSION_KEY]: validEvidence,
          },
        },
      };

      const interaction = getInteraction(envelope);
      expect(interaction).toBeDefined();
      expect(interaction?.interaction_id).toBe('openclaw:run_abc:call_123');
    });

    it('should return undefined when no interaction', () => {
      const envelope: PEACEnvelope = {
        auth: {
          iss: 'https://issuer.example.com',
          aud: 'https://resource.example.com',
          sub: 'agent:test',
          iat: 1706745600,
          rid: 'r_test',
          policy_hash: 'sha256:abc',
          policy_uri: 'https://example.com/policy',
        },
      };

      const interaction = getInteraction(envelope);
      expect(interaction).toBeUndefined();
    });
  });

  describe('setInteraction', () => {
    it('should set interaction on envelope', () => {
      const envelope: PEACEnvelope = {
        auth: {
          iss: 'https://issuer.example.com',
          aud: 'https://resource.example.com',
          sub: 'agent:test',
          iat: 1706745600,
          rid: 'r_test',
          policy_hash: 'sha256:abc',
          policy_uri: 'https://example.com/policy',
        },
      };

      setInteraction(envelope, validEvidence);

      expect(envelope.evidence).toBeDefined();
      expect(envelope.evidence?.extensions).toBeDefined();
      expect(envelope.evidence?.extensions?.[INTERACTION_EXTENSION_KEY]).toBeDefined();
    });

    it('should overwrite existing interaction', () => {
      const envelope: PEACEnvelope = {
        auth: {
          iss: 'https://issuer.example.com',
          aud: 'https://resource.example.com',
          sub: 'agent:test',
          iat: 1706745600,
          rid: 'r_test',
          policy_hash: 'sha256:abc',
          policy_uri: 'https://example.com/policy',
        },
        evidence: {
          extensions: {
            [INTERACTION_EXTENSION_KEY]: minimalEvidence,
          },
        },
      };

      setInteraction(envelope, validEvidence);

      const interaction = getInteraction(envelope);
      expect(interaction?.interaction_id).toBe('openclaw:run_abc:call_123');
    });
  });

  describe('hasInteraction', () => {
    it('should return true when interaction exists', () => {
      const envelope: PEACEnvelope = {
        auth: {
          iss: 'https://issuer.example.com',
          aud: 'https://resource.example.com',
          sub: 'agent:test',
          iat: 1706745600,
          rid: 'r_test',
          policy_hash: 'sha256:abc',
          policy_uri: 'https://example.com/policy',
        },
        evidence: {
          extensions: {
            [INTERACTION_EXTENSION_KEY]: validEvidence,
          },
        },
      };

      expect(hasInteraction(envelope)).toBe(true);
    });

    it('should return false when no interaction', () => {
      const envelope: PEACEnvelope = {
        auth: {
          iss: 'https://issuer.example.com',
          aud: 'https://resource.example.com',
          sub: 'agent:test',
          iat: 1706745600,
          rid: 'r_test',
          policy_hash: 'sha256:abc',
          policy_uri: 'https://example.com/policy',
        },
      };

      expect(hasInteraction(envelope)).toBe(false);
    });
  });
});

// =============================================================================
// PROJECTION API TESTS
// =============================================================================

describe('Projection API', () => {
  describe('createReceiptView', () => {
    it('should provide interaction from extension', () => {
      const envelope: PEACEnvelope = {
        auth: {
          iss: 'https://issuer.example.com',
          aud: 'https://resource.example.com',
          sub: 'agent:test',
          iat: 1706745600,
          rid: 'r_test',
          policy_hash: 'sha256:abc',
          policy_uri: 'https://example.com/policy',
        },
        evidence: {
          extensions: {
            [INTERACTION_EXTENSION_KEY]: validEvidence,
          },
        },
      };

      const view = createReceiptView(envelope);

      expect(view.envelope).toBe(envelope);
      expect(view.interaction).toBeDefined();
      expect(view.interaction?.interaction_id).toBe('openclaw:run_abc:call_123');
      expect(view.interactions).toHaveLength(1);
    });

    it('should provide empty interactions array when no interaction', () => {
      const envelope: PEACEnvelope = {
        auth: {
          iss: 'https://issuer.example.com',
          aud: 'https://resource.example.com',
          sub: 'agent:test',
          iat: 1706745600,
          rid: 'r_test',
          policy_hash: 'sha256:abc',
          policy_uri: 'https://example.com/policy',
        },
      };

      const view = createReceiptView(envelope);

      expect(view.interaction).toBeUndefined();
      expect(view.interactions).toHaveLength(0);
    });

    it('should provide workflow from auth.extensions', () => {
      const envelope: PEACEnvelope = {
        auth: {
          iss: 'https://issuer.example.com',
          aud: 'https://resource.example.com',
          sub: 'agent:test',
          iat: 1706745600,
          rid: 'r_test',
          policy_hash: 'sha256:abc',
          policy_uri: 'https://example.com/policy',
          extensions: {
            'org.peacprotocol/workflow': {
              workflow_id: 'wf_01234567890123456789abcd',
              step_id: 'step_01234567890123456789abcd',
              parent_step_ids: [],
            },
          },
        },
      };

      const view = createReceiptView(envelope);

      expect(view.workflow).toBeDefined();
      expect(view.workflow?.workflow_id).toBe('wf_01234567890123456789abcd');
    });
  });
});

// =============================================================================
// WARNINGS API BOUNDARY TESTS
// =============================================================================

/**
 * These tests pin the warnings API contract:
 * - validateInteraction() (compat API) MUST NOT return warnings
 * - validateInteractionOrdered() MUST return warnings
 *
 * This boundary exists so that:
 * 1. Stable consumers using the compat API are unaffected by warning changes
 * 2. Consumers who need warnings explicitly opt-in via validateInteractionOrdered()
 */
describe('Warnings API Boundary (PINNED)', () => {
  describe('validateInteraction (compat API)', () => {
    it('MUST NOT have warnings property in result type', () => {
      const validResult = validateInteraction(validEvidence);
      const invalidResult = validateInteraction({});

      // TypeScript enforces this, but we also test at runtime
      expect(validResult).not.toHaveProperty('warnings');
      expect(invalidResult).not.toHaveProperty('warnings');
    });

    it('MUST NOT expose warnings even for inputs that would generate warnings', () => {
      // This input would generate W_INTERACTION_KIND_UNREGISTERED
      const resultWithWarningInput = validateInteraction({
        ...minimalEvidence,
        kind: 'custom:com.example.foo',
      });

      expect(resultWithWarningInput.valid).toBe(true);
      expect(resultWithWarningInput).not.toHaveProperty('warnings');

      // This input would generate W_INTERACTION_MISSING_TARGET
      const resultWithTargetWarning = validateInteraction(minimalEvidence);

      expect(resultWithTargetWarning.valid).toBe(true);
      expect(resultWithTargetWarning).not.toHaveProperty('warnings');
    });

    it('result shape MUST be { valid, error_code?, error_field? } only', () => {
      const validResult = validateInteraction(validEvidence);
      const invalidResult = validateInteraction({});

      // Valid result should only have 'valid' property
      expect(Object.keys(validResult).sort()).toEqual(['valid']);

      // Invalid result should only have valid, error_code, and optionally error_field
      const invalidKeys = Object.keys(invalidResult).filter(
        (k) => invalidResult[k as keyof typeof invalidResult] !== undefined
      );
      expect(invalidKeys.every((k) => ['valid', 'error_code', 'error_field'].includes(k))).toBe(
        true
      );
    });
  });

  describe('validateInteractionOrdered (detailed API)', () => {
    it('MUST return warnings array for valid inputs', () => {
      const result = validateInteractionOrdered(validEvidence);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result).toHaveProperty('warnings');
        expect(Array.isArray(result.warnings)).toBe(true);
      }
    });

    it('MUST return warnings even when empty', () => {
      const result = validateInteractionOrdered(validEvidence);

      expect(result.valid).toBe(true);
      if (result.valid) {
        // May have warnings or may not, but must have the property
        expect(result.warnings).toBeDefined();
      }
    });

    it('MUST populate warnings for W_INTERACTION_KIND_UNREGISTERED', () => {
      const result = validateInteractionOrdered({
        ...minimalEvidence,
        kind: 'custom:com.example.foo',
      });

      expect(result.valid).toBe(true);
      if (result.valid) {
        const warningCodes = result.warnings.map((w) => w.code);
        expect(warningCodes).toContain('W_INTERACTION_KIND_UNREGISTERED');
      }
    });

    it('MUST populate warnings for W_INTERACTION_MISSING_TARGET', () => {
      const result = validateInteractionOrdered(minimalEvidence);

      expect(result.valid).toBe(true);
      if (result.valid) {
        const warningCodes = result.warnings.map((w) => w.code);
        expect(warningCodes).toContain('W_INTERACTION_MISSING_TARGET');
      }
    });

    it('warnings MUST include code and field properties', () => {
      const result = validateInteractionOrdered({
        ...minimalEvidence,
        kind: 'custom:com.example.foo',
      });

      expect(result.valid).toBe(true);
      if (result.valid) {
        for (const warning of result.warnings) {
          expect(warning).toHaveProperty('code');
          // field is optional
          expect(typeof warning.code).toBe('string');
          expect(warning.code.startsWith('W_INTERACTION_')).toBe(true);
        }
      }
    });

    it('MUST return errors array for invalid inputs', () => {
      const result = validateInteractionOrdered({});

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.errors)).toBe(true);
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it('errors MUST include code, message, and optional field', () => {
      const result = validateInteractionOrdered({});

      expect(result.valid).toBe(false);
      if (!result.valid) {
        for (const error of result.errors) {
          expect(error).toHaveProperty('code');
          expect(error).toHaveProperty('message');
          expect(typeof error.code).toBe('string');
          expect(typeof error.message).toBe('string');
          expect(error.code.startsWith('E_INTERACTION_')).toBe(true);
        }
      }
    });
  });

  describe('API Parity', () => {
    it('both APIs MUST agree on validity', () => {
      const testCases = [
        validEvidence,
        minimalEvidence,
        { ...minimalEvidence, kind: 'custom:com.example.foo' },
        {},
        'not an object',
        null,
        { interaction_id: 'test', kind: 'INVALID' },
      ];

      for (const testCase of testCases) {
        const compatResult = validateInteraction(testCase);
        const orderedResult = validateInteractionOrdered(testCase);

        expect(
          compatResult.valid,
          `APIs disagree on validity for ${JSON.stringify(testCase).slice(0, 50)}`
        ).toBe(orderedResult.valid);
      }
    });

    it('both APIs MUST return same error_code for invalid inputs', () => {
      const invalidCases = [
        {},
        'not an object',
        null,
        { interaction_id: 'test', kind: 'INVALID' },
        { ...minimalEvidence, kind: 'tool.call' }, // Missing tool
        { ...minimalEvidence, result: { status: 'error' } }, // Missing error detail
      ];

      for (const testCase of invalidCases) {
        const compatResult = validateInteraction(testCase);
        const orderedResult = validateInteractionOrdered(testCase);

        expect(compatResult.valid).toBe(false);
        expect(orderedResult.valid).toBe(false);

        if (!compatResult.valid && !orderedResult.valid) {
          expect(
            compatResult.error_code,
            `Error codes differ for ${JSON.stringify(testCase).slice(0, 50)}`
          ).toBe(orderedResult.errors[0].code);
        }
      }
    });
  });
});

// =============================================================================
// FACTORY FUNCTION TESTS
// =============================================================================

describe('Factory Functions', () => {
  describe('createInteractionEvidence', () => {
    it('should create valid evidence with required fields', () => {
      const evidence = createInteractionEvidence({
        interaction_id: 'test-123',
        kind: 'tool.call',
        executor: { platform: 'test' },
        tool: { name: 'my_tool' },
        started_at: VALID_DATETIME,
      });

      expect(evidence.interaction_id).toBe('test-123');
      expect(evidence.kind).toBe('tool.call');
      expect(evidence.executor.platform).toBe('test');
    });

    it('should create evidence with all optional fields', () => {
      const evidence = createInteractionEvidence({
        interaction_id: 'test-123',
        kind: 'tool.call',
        executor: {
          platform: 'openclaw',
          version: '0.2.0',
          plugin_id: 'peac-receipts',
          plugin_digest: validDigest,
        },
        tool: { name: 'web_search', provider: 'builtin', version: '1.0' },
        resource: { uri: 'https://api.example.com', method: 'GET' },
        input: validPayloadRef,
        output: validPayloadRef,
        started_at: VALID_DATETIME,
        completed_at: VALID_DATETIME_LATER,
        duration_ms: 150,
        result: { status: 'ok', retryable: false },
        policy: { decision: 'allow', sandbox_enabled: true },
        refs: { payment_reference: 'pay_123' },
        extensions: { 'com.example/data': { test: true } },
      });

      expect(evidence.executor.version).toBe('0.2.0');
      expect(evidence.tool?.provider).toBe('builtin');
      expect(evidence.resource?.uri).toBe('https://api.example.com');
      expect(evidence.duration_ms).toBe(150);
      expect(evidence.policy?.sandbox_enabled).toBe(true);
      expect(evidence.refs?.payment_reference).toBe('pay_123');
      expect(evidence.extensions?.['com.example/data']).toEqual({ test: true });
    });

    it('should throw for invalid evidence', () => {
      expect(() =>
        createInteractionEvidence({
          interaction_id: '',
          kind: 'tool.call',
          executor: { platform: 'test' },
          tool: { name: 'tool' },
          started_at: VALID_DATETIME,
        })
      ).toThrow();
    });
  });
});
