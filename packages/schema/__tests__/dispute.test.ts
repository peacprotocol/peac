/**
 * Dispute Attestation Tests (v0.9.27+)
 *
 * Comprehensive tests for dispute attestation types, state machine,
 * and schema invariants.
 */
import { describe, it, expect } from 'vitest';
import {
  DisputeIdSchema,
  DisputeTypeSchema,
  DisputeTargetTypeSchema,
  DisputeGroundsCodeSchema,
  DisputeGroundsSchema,
  DisputeStateSchema,
  DisputeOutcomeSchema,
  RemediationTypeSchema,
  RemediationSchema,
  DisputeResolutionSchema,
  ContactMethodSchema,
  DisputeContactSchema,
  DocumentRefSchema,
  DisputeEvidenceSchema,
  DisputeAttestationSchema,
  DISPUTE_TYPE,
  DISPUTE_LIMITS,
  DISPUTE_TYPES,
  DISPUTE_TARGET_TYPES,
  DISPUTE_GROUNDS_CODES,
  DISPUTE_STATES,
  TERMINAL_STATES,
  DISPUTE_TRANSITIONS,
  DISPUTE_OUTCOMES,
  REMEDIATION_TYPES,
  validateDisputeAttestation,
  isValidDisputeAttestation,
  isDisputeAttestation,
  validateDisputeResolution,
  validateDisputeContact,
  createDisputeAttestation,
  transitionDisputeState,
  canTransitionTo,
  isTerminalState,
  getValidTransitions,
  isDisputeExpired,
  isDisputeNotYetValid,
  type DisputeAttestation,
  type DisputeEvidence,
  type DisputeResolution,
  type DisputeGrounds,
  type DisputeState,
} from '../src/dispute';

// =============================================================================
// TEST FIXTURES
// =============================================================================

// Valid ULIDs: exactly 26 characters, Crockford Base32 (no I, L, O, U)
const VALID_ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const VALID_ULID_2 = '01H5KPT9QZA123456789VWXYZG';
const VALID_DATETIME = '2026-01-06T12:00:00Z';
const VALID_DATETIME_FUTURE = '2027-01-06T12:00:00Z';

const validGrounds: DisputeGrounds[] = [{ code: 'missing_receipt' }];

const validEvidence = {
  dispute_type: 'unauthorized_access' as const,
  target_ref: `jti:${VALID_ULID_2}`,
  target_type: 'receipt' as const,
  grounds: validGrounds,
  description: 'Content was accessed without a valid receipt.',
  state: 'filed' as const,
};

const validAttestation: DisputeAttestation = {
  type: 'peac/dispute',
  issuer: 'https://publisher.example.com',
  issued_at: VALID_DATETIME,
  ref: VALID_ULID,
  evidence: validEvidence,
};

const validResolution: DisputeResolution = {
  outcome: 'upheld',
  decided_at: VALID_DATETIME,
  decided_by: 'https://platform.example.com',
  rationale: 'The claim was substantiated by evidence.',
};

// =============================================================================
// ULID VALIDATION TESTS
// =============================================================================

describe('DisputeIdSchema', () => {
  it('should accept valid ULIDs', () => {
    // Valid 26-character ULIDs using Crockford Base32
    expect(DisputeIdSchema.parse('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
    expect(DisputeIdSchema.parse('01H5KPT9QZA123456789VWXYZG')).toBe('01H5KPT9QZA123456789VWXYZG');
    expect(DisputeIdSchema.parse('7ZZZZZZZZZZZZZZZZZZZZZZZZZ')).toBe('7ZZZZZZZZZZZZZZZZZZZZZZZZZ');
  });

  it('should reject invalid ULIDs - wrong length', () => {
    expect(() => DisputeIdSchema.parse('01ARZ3NDEKT')).toThrow(); // Too short
    expect(() => DisputeIdSchema.parse('01ARZ3NDEKTSV4RRFFQ69G5FAVXYZ')).toThrow(); // Too long
  });

  it('should reject invalid ULIDs - invalid characters', () => {
    // ULID uses Crockford Base32 which excludes I, L, O, U
    expect(() => DisputeIdSchema.parse('01ARZ3NDEKTSV4RRFFQ69GIFAV')).toThrow(); // Contains I
    expect(() => DisputeIdSchema.parse('01ARZ3NDEKTSV4RRFFQ69GLFAV')).toThrow(); // Contains L
    expect(() => DisputeIdSchema.parse('01ARZ3NDEKTSV4RRFFQ69GOFAV')).toThrow(); // Contains O
    expect(() => DisputeIdSchema.parse('01ARZ3NDEKTSV4RRFFQ69GUFAV')).toThrow(); // Contains U
  });

  it('should reject lowercase ULIDs', () => {
    expect(() => DisputeIdSchema.parse('01arz3ndektsv4rrffq69g5fav')).toThrow();
  });

  it('should reject empty string', () => {
    expect(() => DisputeIdSchema.parse('')).toThrow();
  });
});

// =============================================================================
// DISPUTE TYPE TESTS
// =============================================================================

describe('DisputeTypeSchema', () => {
  it('should accept all valid dispute types', () => {
    DISPUTE_TYPES.forEach((type) => {
      expect(DisputeTypeSchema.parse(type)).toBe(type);
    });
  });

  it('should reject invalid dispute types', () => {
    expect(() => DisputeTypeSchema.parse('invalid_type')).toThrow();
    expect(() => DisputeTypeSchema.parse('')).toThrow();
    expect(() => DisputeTypeSchema.parse(123)).toThrow();
  });

  it('should have correct enum values', () => {
    expect(DISPUTE_TYPES).toEqual([
      'unauthorized_access',
      'attribution_missing',
      'attribution_incorrect',
      'receipt_invalid',
      'identity_spoofed',
      'purpose_mismatch',
      'policy_violation',
      'other',
    ]);
  });
});

// =============================================================================
// DISPUTE TARGET TYPE TESTS
// =============================================================================

describe('DisputeTargetTypeSchema', () => {
  it('should accept all valid target types', () => {
    DISPUTE_TARGET_TYPES.forEach((type) => {
      expect(DisputeTargetTypeSchema.parse(type)).toBe(type);
    });
  });

  it('should reject invalid target types', () => {
    expect(() => DisputeTargetTypeSchema.parse('invalid')).toThrow();
    expect(() => DisputeTargetTypeSchema.parse('')).toThrow();
  });

  it('should have correct enum values', () => {
    expect(DISPUTE_TARGET_TYPES).toEqual(['receipt', 'attribution', 'identity', 'policy']);
  });
});

// =============================================================================
// DISPUTE GROUNDS TESTS
// =============================================================================

describe('DisputeGroundsCodeSchema', () => {
  it('should accept all valid grounds codes', () => {
    DISPUTE_GROUNDS_CODES.forEach((code) => {
      expect(DisputeGroundsCodeSchema.parse(code)).toBe(code);
    });
  });

  it('should reject invalid grounds codes', () => {
    expect(() => DisputeGroundsCodeSchema.parse('invalid_ground')).toThrow();
  });

  it('should have correct number of grounds codes', () => {
    expect(DISPUTE_GROUNDS_CODES).toHaveLength(14);
  });
});

describe('DisputeGroundsSchema', () => {
  it('should accept minimal grounds', () => {
    const grounds = { code: 'missing_receipt' };
    expect(DisputeGroundsSchema.parse(grounds)).toEqual(grounds);
  });

  it('should accept grounds with evidence_ref', () => {
    const grounds = {
      code: 'forged_receipt',
      evidence_ref: 'https://example.com/evidence/123',
    };
    expect(DisputeGroundsSchema.parse(grounds)).toEqual(grounds);
  });

  it('should accept grounds with details', () => {
    const grounds = {
      code: 'purpose_exceeded',
      details: 'Content was used for training when only search was permitted.',
    };
    expect(DisputeGroundsSchema.parse(grounds)).toEqual(grounds);
  });

  it('should reject details exceeding max length', () => {
    const grounds = {
      code: 'missing_receipt',
      details: 'x'.repeat(DISPUTE_LIMITS.maxGroundDetailsLength + 1),
    };
    expect(() => DisputeGroundsSchema.parse(grounds)).toThrow();
  });

  it('should reject extra fields (strict mode)', () => {
    const grounds = {
      code: 'missing_receipt',
      unknown_field: 'should fail',
    };
    expect(() => DisputeGroundsSchema.parse(grounds)).toThrow();
  });
});

// =============================================================================
// DISPUTE STATE TESTS
// =============================================================================

describe('DisputeStateSchema', () => {
  it('should accept all valid states', () => {
    DISPUTE_STATES.forEach((state) => {
      expect(DisputeStateSchema.parse(state)).toBe(state);
    });
  });

  it('should reject invalid states', () => {
    expect(() => DisputeStateSchema.parse('pending')).toThrow();
    expect(() => DisputeStateSchema.parse('')).toThrow();
  });

  it('should have correct enum values', () => {
    expect(DISPUTE_STATES).toEqual([
      'filed',
      'acknowledged',
      'under_review',
      'escalated',
      'resolved',
      'rejected',
      'appealed',
      'final',
    ]);
  });
});

describe('TERMINAL_STATES', () => {
  it('should contain exactly resolved, rejected, and final', () => {
    expect(TERMINAL_STATES).toEqual(['resolved', 'rejected', 'final']);
  });
});

// =============================================================================
// STATE TRANSITION TABLE TESTS
// =============================================================================

describe('DISPUTE_TRANSITIONS', () => {
  it('should have entries for all states', () => {
    DISPUTE_STATES.forEach((state) => {
      expect(DISPUTE_TRANSITIONS).toHaveProperty(state);
    });
  });

  it('should have correct transitions from filed', () => {
    expect(DISPUTE_TRANSITIONS.filed).toEqual(['acknowledged', 'rejected']);
  });

  it('should have correct transitions from acknowledged', () => {
    expect(DISPUTE_TRANSITIONS.acknowledged).toEqual(['under_review', 'rejected']);
  });

  it('should have correct transitions from under_review', () => {
    expect(DISPUTE_TRANSITIONS.under_review).toEqual(['resolved', 'escalated']);
  });

  it('should have correct transitions from escalated', () => {
    expect(DISPUTE_TRANSITIONS.escalated).toEqual(['resolved']);
  });

  it('should have correct transitions from resolved', () => {
    expect(DISPUTE_TRANSITIONS.resolved).toEqual(['appealed', 'final']);
  });

  it('should have correct transitions from rejected', () => {
    expect(DISPUTE_TRANSITIONS.rejected).toEqual(['appealed', 'final']);
  });

  it('should have correct transitions from appealed', () => {
    expect(DISPUTE_TRANSITIONS.appealed).toEqual(['under_review', 'final']);
  });

  it('should have no transitions from final (terminal)', () => {
    expect(DISPUTE_TRANSITIONS.final).toEqual([]);
  });
});

describe('canTransitionTo', () => {
  it('should return true for valid transitions', () => {
    expect(canTransitionTo('filed', 'acknowledged')).toBe(true);
    expect(canTransitionTo('filed', 'rejected')).toBe(true);
    expect(canTransitionTo('acknowledged', 'under_review')).toBe(true);
    expect(canTransitionTo('under_review', 'resolved')).toBe(true);
    expect(canTransitionTo('resolved', 'appealed')).toBe(true);
    expect(canTransitionTo('appealed', 'final')).toBe(true);
  });

  it('should return false for invalid transitions', () => {
    expect(canTransitionTo('filed', 'resolved')).toBe(false);
    expect(canTransitionTo('filed', 'final')).toBe(false);
    expect(canTransitionTo('acknowledged', 'final')).toBe(false);
    expect(canTransitionTo('final', 'filed')).toBe(false);
    expect(canTransitionTo('resolved', 'filed')).toBe(false);
  });

  it('should return false for self-transitions', () => {
    DISPUTE_STATES.forEach((state) => {
      expect(canTransitionTo(state, state)).toBe(false);
    });
  });
});

describe('isTerminalState', () => {
  it('should return true for terminal states', () => {
    expect(isTerminalState('resolved')).toBe(true);
    expect(isTerminalState('rejected')).toBe(true);
    expect(isTerminalState('final')).toBe(true);
  });

  it('should return false for non-terminal states', () => {
    expect(isTerminalState('filed')).toBe(false);
    expect(isTerminalState('acknowledged')).toBe(false);
    expect(isTerminalState('under_review')).toBe(false);
    expect(isTerminalState('escalated')).toBe(false);
    expect(isTerminalState('appealed')).toBe(false);
  });
});

describe('getValidTransitions', () => {
  it('should return correct transitions for each state', () => {
    expect(getValidTransitions('filed')).toEqual(['acknowledged', 'rejected']);
    expect(getValidTransitions('final')).toEqual([]);
  });
});

// =============================================================================
// DISPUTE OUTCOME AND RESOLUTION TESTS
// =============================================================================

describe('DisputeOutcomeSchema', () => {
  it('should accept all valid outcomes', () => {
    DISPUTE_OUTCOMES.forEach((outcome) => {
      expect(DisputeOutcomeSchema.parse(outcome)).toBe(outcome);
    });
  });

  it('should have correct enum values', () => {
    expect(DISPUTE_OUTCOMES).toEqual(['upheld', 'dismissed', 'partially_upheld', 'settled']);
  });
});

describe('RemediationTypeSchema', () => {
  it('should accept all valid remediation types', () => {
    REMEDIATION_TYPES.forEach((type) => {
      expect(RemediationTypeSchema.parse(type)).toBe(type);
    });
  });

  it('should have correct enum values', () => {
    expect(REMEDIATION_TYPES).toEqual([
      'attribution_corrected',
      'receipt_revoked',
      'access_restored',
      'compensation',
      'policy_updated',
      'no_action',
      'other',
    ]);
  });
});

describe('RemediationSchema', () => {
  it('should accept valid remediation', () => {
    const remediation = {
      type: 'attribution_corrected',
      details: 'Attribution was updated to include correct source.',
    };
    expect(RemediationSchema.parse(remediation)).toEqual(remediation);
  });

  it('should accept remediation with deadline', () => {
    const remediation = {
      type: 'compensation',
      details: 'Payment of $500 agreed upon.',
      deadline: VALID_DATETIME_FUTURE,
    };
    expect(RemediationSchema.parse(remediation)).toEqual(remediation);
  });

  it('should reject empty details', () => {
    const remediation = {
      type: 'no_action',
      details: '',
    };
    expect(() => RemediationSchema.parse(remediation)).toThrow();
  });

  it('should reject details exceeding max length', () => {
    const remediation = {
      type: 'other',
      details: 'x'.repeat(DISPUTE_LIMITS.maxRemediationDetailsLength + 1),
    };
    expect(() => RemediationSchema.parse(remediation)).toThrow();
  });
});

describe('DisputeResolutionSchema', () => {
  it('should accept valid resolution', () => {
    expect(DisputeResolutionSchema.parse(validResolution)).toEqual(validResolution);
  });

  it('should accept resolution with remediation', () => {
    const resolution = {
      ...validResolution,
      remediation: {
        type: 'attribution_corrected',
        details: 'Attribution was fixed.',
      },
    };
    expect(DisputeResolutionSchema.parse(resolution).remediation).toBeDefined();
  });

  it('should reject invalid outcome', () => {
    const resolution = {
      ...validResolution,
      outcome: 'invalid_outcome',
    };
    expect(() => DisputeResolutionSchema.parse(resolution)).toThrow();
  });

  it('should reject invalid datetime format', () => {
    const resolution = {
      ...validResolution,
      decided_at: 'not-a-date',
    };
    expect(() => DisputeResolutionSchema.parse(resolution)).toThrow();
  });

  it('should reject empty rationale', () => {
    const resolution = {
      ...validResolution,
      rationale: '',
    };
    expect(() => DisputeResolutionSchema.parse(resolution)).toThrow();
  });
});

describe('validateDisputeResolution', () => {
  it('should return ok: true for valid resolution', () => {
    const result = validateDisputeResolution(validResolution);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.outcome).toBe('upheld');
    }
  });

  it('should return ok: false for invalid resolution', () => {
    const result = validateDisputeResolution({ outcome: 'invalid' });
    expect(result.ok).toBe(false);
  });
});

// =============================================================================
// CONTACT VALIDATION TESTS
// =============================================================================

describe('DisputeContactSchema', () => {
  it('should accept valid email contact', () => {
    const contact = { method: 'email', value: 'disputes@example.com' };
    expect(DisputeContactSchema.parse(contact)).toEqual(contact);
  });

  it('should accept valid URL contact', () => {
    const contact = { method: 'url', value: 'https://example.com/disputes' };
    expect(DisputeContactSchema.parse(contact)).toEqual(contact);
  });

  it('should accept valid DID contact', () => {
    const contact = { method: 'did', value: 'did:web:example.com' };
    expect(DisputeContactSchema.parse(contact)).toEqual(contact);
  });

  it('should reject invalid email format', () => {
    const contact = { method: 'email', value: 'not-an-email' };
    expect(() => DisputeContactSchema.parse(contact)).toThrow();
  });

  it('should reject invalid URL format', () => {
    const contact = { method: 'url', value: 'not-a-url' };
    expect(() => DisputeContactSchema.parse(contact)).toThrow();
  });

  it('should reject DID not starting with did:', () => {
    const contact = { method: 'did', value: 'web:example.com' };
    expect(() => DisputeContactSchema.parse(contact)).toThrow();
  });
});

describe('validateDisputeContact', () => {
  it('should return ok: true for valid contact', () => {
    const result = validateDisputeContact({ method: 'email', value: 'test@example.com' });
    expect(result.ok).toBe(true);
  });

  it('should return ok: false for invalid contact', () => {
    const result = validateDisputeContact({ method: 'email', value: 'invalid' });
    expect(result.ok).toBe(false);
  });
});

// =============================================================================
// DOCUMENT REFERENCE TESTS
// =============================================================================

describe('DocumentRefSchema', () => {
  it('should accept valid document reference', () => {
    const doc = {
      uri: 'https://example.com/doc/123',
      description: 'Screenshot of unauthorized access',
    };
    expect(DocumentRefSchema.parse(doc)).toEqual(doc);
  });

  it('should accept document with content hash', () => {
    const doc = {
      uri: 'https://example.com/doc/456',
      content_hash: {
        alg: 'sha-256',
        value: 'n4bQgYhMfWWaL28IoEbM8Qa8jG7x0QXJZJqL-w_zZdA',
        enc: 'base64url',
      },
    };
    expect(DocumentRefSchema.parse(doc).content_hash).toBeDefined();
  });

  it('should reject invalid URL', () => {
    const doc = { uri: 'not-a-url' };
    expect(() => DocumentRefSchema.parse(doc)).toThrow();
  });

  it('should reject description exceeding max length', () => {
    const doc = {
      uri: 'https://example.com/doc',
      description: 'x'.repeat(501),
    };
    expect(() => DocumentRefSchema.parse(doc)).toThrow();
  });
});

// =============================================================================
// DISPUTE EVIDENCE TESTS
// =============================================================================

describe('DisputeEvidenceSchema', () => {
  it('should accept valid minimal evidence', () => {
    expect(DisputeEvidenceSchema.parse(validEvidence)).toEqual(validEvidence);
  });

  it('should accept evidence with all optional fields', () => {
    const evidence = {
      ...validEvidence,
      supporting_receipts: ['jti:rec1', 'jti:rec2'],
      supporting_attributions: ['jti:attr1'],
      supporting_documents: [{ uri: 'https://example.com/doc' }],
      contact: { method: 'email', value: 'disputes@example.com' },
      state_changed_at: VALID_DATETIME,
      state_reason: 'Initial filing',
      window_hint_days: 90,
    };
    const result = DisputeEvidenceSchema.parse(evidence);
    expect(result.supporting_receipts).toHaveLength(2);
    expect(result.window_hint_days).toBe(90);
  });

  it('should reject empty grounds array', () => {
    const evidence = { ...validEvidence, grounds: [] };
    expect(() => DisputeEvidenceSchema.parse(evidence)).toThrow();
  });

  it('should reject too many grounds', () => {
    const grounds = Array(DISPUTE_LIMITS.maxGrounds + 1).fill({ code: 'missing_receipt' });
    const evidence = { ...validEvidence, grounds };
    expect(() => DisputeEvidenceSchema.parse(evidence)).toThrow();
  });

  it('should reject too many supporting receipts', () => {
    const receipts = Array(DISPUTE_LIMITS.maxSupportingReceipts + 1).fill('jti:rec');
    const evidence = { ...validEvidence, supporting_receipts: receipts };
    expect(() => DisputeEvidenceSchema.parse(evidence)).toThrow();
  });

  it('should reject description exceeding max length', () => {
    const evidence = {
      ...validEvidence,
      description: 'x'.repeat(DISPUTE_LIMITS.maxDescriptionLength + 1),
    };
    expect(() => DisputeEvidenceSchema.parse(evidence)).toThrow();
  });

  it('should reject negative window_hint_days', () => {
    const evidence = { ...validEvidence, window_hint_days: -1 };
    expect(() => DisputeEvidenceSchema.parse(evidence)).toThrow();
  });

  it('should reject window_hint_days exceeding 365', () => {
    const evidence = { ...validEvidence, window_hint_days: 366 };
    expect(() => DisputeEvidenceSchema.parse(evidence)).toThrow();
  });
});

// =============================================================================
// SCHEMA INVARIANT TESTS (superRefine)
// =============================================================================

describe('DisputeEvidenceSchema invariants', () => {
  describe('Invariant 1: Terminal states require resolution', () => {
    it('should reject resolved state without resolution', () => {
      const evidence = { ...validEvidence, state: 'resolved' };
      const result = DisputeEvidenceSchema.safeParse(evidence);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.errors.map((e) => e.message);
        expect(errorMessages).toContain('Resolution is required when state is "resolved"');
      }
    });

    it('should reject rejected state without resolution', () => {
      const evidence = { ...validEvidence, state: 'rejected' };
      const result = DisputeEvidenceSchema.safeParse(evidence);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.errors.map((e) => e.message);
        expect(errorMessages).toContain('Resolution is required when state is "rejected"');
      }
    });

    it('should reject final state without resolution', () => {
      const evidence = { ...validEvidence, state: 'final' };
      const result = DisputeEvidenceSchema.safeParse(evidence);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.errors.map((e) => e.message);
        expect(errorMessages).toContain('Resolution is required when state is "final"');
      }
    });

    it('should accept resolved state with resolution', () => {
      const evidence = {
        ...validEvidence,
        state: 'resolved',
        resolution: validResolution,
      };
      expect(DisputeEvidenceSchema.parse(evidence).resolution).toBeDefined();
    });
  });

  describe('Invariant 2: Resolution requires terminal state', () => {
    it('should reject filed state with resolution', () => {
      const evidence = {
        ...validEvidence,
        state: 'filed',
        resolution: validResolution,
      };
      const result = DisputeEvidenceSchema.safeParse(evidence);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.errors.map((e) => e.message);
        expect(errorMessages.some((m) => m.includes('Resolution is only valid for terminal states'))).toBe(true);
      }
    });

    it('should reject acknowledged state with resolution', () => {
      const evidence = {
        ...validEvidence,
        state: 'acknowledged',
        resolution: validResolution,
      };
      const result = DisputeEvidenceSchema.safeParse(evidence);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.errors.map((e) => e.message);
        expect(errorMessages.some((m) => m.includes('Resolution is only valid for terminal states'))).toBe(true);
      }
    });

    it('should reject under_review state with resolution', () => {
      const evidence = {
        ...validEvidence,
        state: 'under_review',
        resolution: validResolution,
      };
      const result = DisputeEvidenceSchema.safeParse(evidence);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.errors.map((e) => e.message);
        expect(errorMessages.some((m) => m.includes('Resolution is only valid for terminal states'))).toBe(true);
      }
    });

    it('should reject appealed state with resolution', () => {
      const evidence = {
        ...validEvidence,
        state: 'appealed',
        resolution: validResolution,
      };
      const result = DisputeEvidenceSchema.safeParse(evidence);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.errors.map((e) => e.message);
        expect(errorMessages.some((m) => m.includes('Resolution is only valid for terminal states'))).toBe(true);
      }
    });
  });

  describe('Invariant 3: Other dispute type requires description >= 50 chars', () => {
    it('should reject other type with short description', () => {
      const evidence = {
        ...validEvidence,
        dispute_type: 'other' as const,
        description: 'Too short',
      };
      const result = DisputeEvidenceSchema.safeParse(evidence);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.errors.map((e) => e.message);
        expect(errorMessages.some((m) => m.includes('requires description of at least'))).toBe(true);
      }
    });

    it('should accept other type with long enough description', () => {
      const evidence = {
        ...validEvidence,
        dispute_type: 'other' as const,
        description: 'x'.repeat(DISPUTE_LIMITS.minOtherDescriptionLength),
      };
      expect(DisputeEvidenceSchema.parse(evidence).dispute_type).toBe('other');
    });

    it('should not require long description for non-other types', () => {
      const evidence = {
        ...validEvidence,
        dispute_type: 'unauthorized_access' as const,
        description: 'Short',
      };
      expect(DisputeEvidenceSchema.parse(evidence).description).toBe('Short');
    });
  });
});

// =============================================================================
// DISPUTE ATTESTATION TESTS
// =============================================================================

describe('DisputeAttestationSchema', () => {
  it('should accept valid attestation', () => {
    expect(DisputeAttestationSchema.parse(validAttestation)).toEqual(validAttestation);
  });

  it('should have correct type constant', () => {
    expect(DISPUTE_TYPE).toBe('peac/dispute');
  });

  it('should reject wrong type', () => {
    const attestation = { ...validAttestation, type: 'peac/wrong' };
    expect(() => DisputeAttestationSchema.parse(attestation)).toThrow();
  });

  it('should reject invalid ULID ref', () => {
    const attestation = { ...validAttestation, ref: 'invalid-ref' };
    expect(() => DisputeAttestationSchema.parse(attestation)).toThrow('Invalid ULID');
  });

  it('should accept attestation with expires_at', () => {
    const attestation = { ...validAttestation, expires_at: VALID_DATETIME_FUTURE };
    expect(DisputeAttestationSchema.parse(attestation).expires_at).toBe(VALID_DATETIME_FUTURE);
  });

  it('should reject invalid datetime for issued_at', () => {
    const attestation = { ...validAttestation, issued_at: 'not-a-date' };
    expect(() => DisputeAttestationSchema.parse(attestation)).toThrow();
  });

  it('should reject extra fields (strict mode)', () => {
    const attestation = { ...validAttestation, unknown_field: 'should fail' };
    expect(() => DisputeAttestationSchema.parse(attestation)).toThrow();
  });
});

// =============================================================================
// VALIDATION HELPER TESTS
// =============================================================================

describe('validateDisputeAttestation', () => {
  it('should return ok: true for valid attestation', () => {
    const result = validateDisputeAttestation(validAttestation);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ref).toBe(VALID_ULID);
    }
  });

  it('should return ok: false for invalid attestation', () => {
    const result = validateDisputeAttestation({ type: 'invalid' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeDefined();
    }
  });
});

describe('isValidDisputeAttestation', () => {
  it('should return true for valid attestation', () => {
    expect(isValidDisputeAttestation(validAttestation)).toBe(true);
  });

  it('should return false for invalid attestation', () => {
    expect(isValidDisputeAttestation({ type: 'invalid' })).toBe(false);
    expect(isValidDisputeAttestation(null)).toBe(false);
    expect(isValidDisputeAttestation(undefined)).toBe(false);
  });
});

describe('isDisputeAttestation', () => {
  it('should return true for peac/dispute type', () => {
    expect(isDisputeAttestation({ type: 'peac/dispute' })).toBe(true);
  });

  it('should return false for other types', () => {
    expect(isDisputeAttestation({ type: 'peac/attribution' })).toBe(false);
    expect(isDisputeAttestation({ type: 'peac/agent-identity' })).toBe(false);
  });
});

// =============================================================================
// FACTORY HELPER TESTS
// =============================================================================

describe('createDisputeAttestation', () => {
  it('should create attestation with current timestamp', () => {
    const before = new Date().toISOString();
    const attestation = createDisputeAttestation({
      issuer: 'https://publisher.example.com',
      ref: VALID_ULID,
      dispute_type: 'unauthorized_access',
      target_ref: `jti:${VALID_ULID_2}`,
      target_type: 'receipt',
      grounds: [{ code: 'missing_receipt' }],
      description: 'Test dispute',
    });
    const after = new Date().toISOString();

    expect(attestation.type).toBe('peac/dispute');
    expect(attestation.evidence.state).toBe('filed');
    expect(attestation.issued_at >= before).toBe(true);
    expect(attestation.issued_at <= after).toBe(true);
  });

  it('should include optional fields when provided', () => {
    const attestation = createDisputeAttestation({
      issuer: 'https://publisher.example.com',
      ref: VALID_ULID,
      dispute_type: 'attribution_missing',
      target_ref: `jti:${VALID_ULID_2}`,
      target_type: 'attribution',
      grounds: [{ code: 'content_not_used' }],
      description: 'Content was not used',
      contact: { method: 'email', value: 'disputes@example.com' },
      expires_at: VALID_DATETIME_FUTURE,
      supporting_receipts: ['jti:rec1', 'jti:rec2'],
      window_hint_days: 90,
    });

    expect(attestation.expires_at).toBe(VALID_DATETIME_FUTURE);
    expect(attestation.evidence.contact?.method).toBe('email');
    expect(attestation.evidence.supporting_receipts).toHaveLength(2);
    expect(attestation.evidence.window_hint_days).toBe(90);
  });
});

// =============================================================================
// STATE TRANSITION HELPER TESTS
// =============================================================================

describe('transitionDisputeState', () => {
  it('should transition from filed to acknowledged', () => {
    const result = transitionDisputeState(validAttestation, 'acknowledged', 'Received and reviewing');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.evidence.state).toBe('acknowledged');
      expect(result.value.evidence.state_reason).toBe('Received and reviewing');
      expect(result.value.evidence.state_changed_at).toBeDefined();
    }
  });

  it('should transition to terminal state with resolution', () => {
    const underReview = {
      ...validAttestation,
      evidence: { ...validEvidence, state: 'under_review' as const },
    };
    const result = transitionDisputeState(
      underReview,
      'resolved',
      'Investigation complete',
      validResolution
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.evidence.state).toBe('resolved');
      expect(result.value.evidence.resolution).toEqual(validResolution);
    }
  });

  it('should reject invalid transition', () => {
    const result = transitionDisputeState(validAttestation, 'final');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_TRANSITION');
    }
  });

  it('should reject terminal state without resolution', () => {
    const underReview = {
      ...validAttestation,
      evidence: { ...validEvidence, state: 'under_review' as const },
    };
    const result = transitionDisputeState(underReview, 'resolved');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('RESOLUTION_REQUIRED');
    }
  });

  it('should reject non-terminal state with resolution', () => {
    const result = transitionDisputeState(
      validAttestation,
      'acknowledged',
      'Test',
      validResolution
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('RESOLUTION_NOT_ALLOWED');
    }
  });
});

// =============================================================================
// TIME VALIDATION TESTS
// =============================================================================

describe('isDisputeExpired', () => {
  it('should return false when no expires_at', () => {
    expect(isDisputeExpired(validAttestation)).toBe(false);
  });

  it('should return false when not expired', () => {
    const attestation = {
      ...validAttestation,
      expires_at: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    };
    expect(isDisputeExpired(attestation)).toBe(false);
  });

  it('should return true when expired', () => {
    const attestation = {
      ...validAttestation,
      expires_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
    };
    expect(isDisputeExpired(attestation)).toBe(true);
  });

  it('should respect clock skew tolerance', () => {
    const attestation = {
      ...validAttestation,
      expires_at: new Date(Date.now() - 20000).toISOString(), // 20 seconds ago
    };
    // With 30s skew, should not be expired yet
    expect(isDisputeExpired(attestation, 30000)).toBe(false);
    // With 10s skew, should be expired
    expect(isDisputeExpired(attestation, 10000)).toBe(true);
  });
});

describe('isDisputeNotYetValid', () => {
  it('should return false for past issued_at', () => {
    expect(isDisputeNotYetValid(validAttestation)).toBe(false);
  });

  it('should return true for future issued_at', () => {
    const attestation = {
      ...validAttestation,
      issued_at: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    };
    expect(isDisputeNotYetValid(attestation)).toBe(true);
  });

  it('should respect clock skew tolerance', () => {
    const attestation = {
      ...validAttestation,
      issued_at: new Date(Date.now() + 20000).toISOString(), // 20 seconds in future
    };
    // With 30s skew, should be valid
    expect(isDisputeNotYetValid(attestation, 30000)).toBe(false);
    // With 10s skew, should not be valid yet
    expect(isDisputeNotYetValid(attestation, 10000)).toBe(true);
  });
});

// =============================================================================
// LIMITS CONSTANT TEST
// =============================================================================

describe('DISPUTE_LIMITS', () => {
  it('should have all expected limits', () => {
    expect(DISPUTE_LIMITS.maxGrounds).toBe(10);
    expect(DISPUTE_LIMITS.maxSupportingReceipts).toBe(50);
    expect(DISPUTE_LIMITS.maxSupportingAttributions).toBe(50);
    expect(DISPUTE_LIMITS.maxSupportingDocuments).toBe(20);
    expect(DISPUTE_LIMITS.maxDescriptionLength).toBe(4000);
    expect(DISPUTE_LIMITS.maxGroundDetailsLength).toBe(1000);
    expect(DISPUTE_LIMITS.maxRationaleLength).toBe(4000);
    expect(DISPUTE_LIMITS.maxRemediationDetailsLength).toBe(4000);
    expect(DISPUTE_LIMITS.minOtherDescriptionLength).toBe(50);
  });
});

// =============================================================================
// COMPREHENSIVE STATE MACHINE COVERAGE
// =============================================================================

describe('State machine comprehensive coverage', () => {
  // Test all valid transitions in the state machine
  const allTransitions: Array<{ from: DisputeState; to: DisputeState; needsResolution: boolean }> = [
    { from: 'filed', to: 'acknowledged', needsResolution: false },
    { from: 'filed', to: 'rejected', needsResolution: true },
    { from: 'acknowledged', to: 'under_review', needsResolution: false },
    { from: 'acknowledged', to: 'rejected', needsResolution: true },
    { from: 'under_review', to: 'resolved', needsResolution: true },
    { from: 'under_review', to: 'escalated', needsResolution: false },
    { from: 'escalated', to: 'resolved', needsResolution: true },
    { from: 'resolved', to: 'appealed', needsResolution: false },
    { from: 'resolved', to: 'final', needsResolution: true },
    { from: 'rejected', to: 'appealed', needsResolution: false },
    { from: 'rejected', to: 'final', needsResolution: true },
    { from: 'appealed', to: 'under_review', needsResolution: false },
    { from: 'appealed', to: 'final', needsResolution: true },
  ];

  allTransitions.forEach(({ from, to, needsResolution }) => {
    it(`should allow transition from ${from} to ${to}`, () => {
      const evidence: DisputeEvidence = needsResolution
        ? { ...validEvidence, state: from, resolution: from === 'filed' ? undefined : validResolution }
        : { ...validEvidence, state: from };

      // Remove resolution if starting from 'filed' since it's non-terminal
      if (!isTerminalState(from)) {
        delete (evidence as Partial<DisputeEvidence>).resolution;
      }

      const attestation: DisputeAttestation = {
        ...validAttestation,
        evidence,
      };

      const resolution = needsResolution ? validResolution : undefined;
      const result = transitionDisputeState(attestation, to, 'Test transition', resolution);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.evidence.state).toBe(to);
      }
    });
  });
});

// =============================================================================
// TRANSITION OUTPUT SCHEMA VALIDATION (v0.9.27+ critical tests)
// =============================================================================

describe('transitionDisputeState schema safety', () => {
  // Every valid transition output MUST pass DisputeAttestationSchema
  const allTransitions: Array<{ from: DisputeState; to: DisputeState; needsResolution: boolean }> = [
    { from: 'filed', to: 'acknowledged', needsResolution: false },
    { from: 'filed', to: 'rejected', needsResolution: true },
    { from: 'acknowledged', to: 'under_review', needsResolution: false },
    { from: 'acknowledged', to: 'rejected', needsResolution: true },
    { from: 'under_review', to: 'resolved', needsResolution: true },
    { from: 'under_review', to: 'escalated', needsResolution: false },
    { from: 'escalated', to: 'resolved', needsResolution: true },
    { from: 'resolved', to: 'appealed', needsResolution: false },
    { from: 'resolved', to: 'final', needsResolution: true },
    { from: 'rejected', to: 'appealed', needsResolution: false },
    { from: 'rejected', to: 'final', needsResolution: true },
    { from: 'appealed', to: 'under_review', needsResolution: false },
    { from: 'appealed', to: 'final', needsResolution: true },
  ];

  allTransitions.forEach(({ from, to, needsResolution }) => {
    it(`transition ${from} -> ${to} produces schema-valid output`, () => {
      // Build a valid attestation in the 'from' state
      const evidence: DisputeEvidence = { ...validEvidence, state: from };

      // Terminal states require resolution
      if (isTerminalState(from)) {
        evidence.resolution = validResolution;
      }

      const attestation: DisputeAttestation = {
        ...validAttestation,
        evidence,
      };

      const resolution = needsResolution ? validResolution : undefined;
      const result = transitionDisputeState(attestation, to, 'Test transition', resolution);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // CRITICAL: Validate the output against the schema
        const parseResult = DisputeAttestationSchema.safeParse(result.value);
        expect(parseResult.success).toBe(true);
        if (!parseResult.success) {
          // Helpful debug output if test fails
          console.error('Schema validation failed:', parseResult.error.errors);
        }
      }
    });
  });

  it('should clear resolution when transitioning from resolved to appealed', () => {
    // Build a dispute in resolved state WITH resolution
    const resolvedDispute: DisputeAttestation = {
      ...validAttestation,
      evidence: {
        ...validEvidence,
        state: 'resolved',
        resolution: validResolution,
      },
    };

    // Transition to appealed (non-terminal, must NOT have resolution)
    const result = transitionDisputeState(resolvedDispute, 'appealed', 'Appealing decision');

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Resolution must be cleared
      expect(result.value.evidence.resolution).toBeUndefined();
      expect(result.value.evidence.state).toBe('appealed');

      // CRITICAL: Must pass schema validation
      const parseResult = DisputeAttestationSchema.safeParse(result.value);
      expect(parseResult.success).toBe(true);
    }
  });

  it('should clear resolution when transitioning from rejected to appealed', () => {
    // Build a dispute in rejected state WITH resolution
    const rejectedDispute: DisputeAttestation = {
      ...validAttestation,
      evidence: {
        ...validEvidence,
        state: 'rejected',
        resolution: validResolution,
      },
    };

    // Transition to appealed (non-terminal, must NOT have resolution)
    const result = transitionDisputeState(rejectedDispute, 'appealed', 'Appealing rejection');

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Resolution must be cleared
      expect(result.value.evidence.resolution).toBeUndefined();
      expect(result.value.evidence.state).toBe('appealed');

      // CRITICAL: Must pass schema validation
      const parseResult = DisputeAttestationSchema.safeParse(result.value);
      expect(parseResult.success).toBe(true);
    }
  });

  it('should preserve resolution when transitioning from resolved to final', () => {
    // Build a dispute in resolved state WITH resolution
    const resolvedDispute: DisputeAttestation = {
      ...validAttestation,
      evidence: {
        ...validEvidence,
        state: 'resolved',
        resolution: validResolution,
      },
    };

    // Transition to final (terminal, needs new resolution)
    const finalResolution: DisputeResolution = {
      ...validResolution,
      rationale: 'Final decision - no further appeals.',
    };
    const result = transitionDisputeState(resolvedDispute, 'final', 'Closing dispute', finalResolution);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // New resolution must be present
      expect(result.value.evidence.resolution).toEqual(finalResolution);
      expect(result.value.evidence.state).toBe('final');

      // CRITICAL: Must pass schema validation
      const parseResult = DisputeAttestationSchema.safeParse(result.value);
      expect(parseResult.success).toBe(true);
    }
  });

  it('should clear resolution when transitioning from appealed to under_review', () => {
    // Build a dispute in appealed state (non-terminal, no resolution)
    const appealedDispute: DisputeAttestation = {
      ...validAttestation,
      evidence: {
        ...validEvidence,
        state: 'appealed',
      },
    };

    // Transition to under_review (non-terminal)
    const result = transitionDisputeState(appealedDispute, 'under_review', 'Re-opening review');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.evidence.resolution).toBeUndefined();
      expect(result.value.evidence.state).toBe('under_review');

      // CRITICAL: Must pass schema validation
      const parseResult = DisputeAttestationSchema.safeParse(result.value);
      expect(parseResult.success).toBe(true);
    }
  });
});
