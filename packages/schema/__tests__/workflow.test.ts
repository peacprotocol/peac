/**
 * Workflow Correlation Tests (v0.10.2+)
 *
 * Comprehensive tests for workflow correlation types, DAG semantics,
 * and schema invariants.
 */
import { describe, it, expect } from 'vitest';
import {
  WorkflowIdSchema,
  StepIdSchema,
  WorkflowStatusSchema,
  OrchestrationFrameworkSchema,
  WorkflowContextSchema,
  WorkflowErrorContextSchema,
  WorkflowSummaryEvidenceSchema,
  WorkflowSummaryAttestationSchema,
  WORKFLOW_EXTENSION_KEY,
  WORKFLOW_SUMMARY_TYPE,
  WORKFLOW_STATUSES,
  ORCHESTRATION_FRAMEWORKS,
  WORKFLOW_LIMITS,
  WORKFLOW_ID_PATTERN,
  STEP_ID_PATTERN,
  createWorkflowId,
  createStepId,
  validateWorkflowContext,
  isValidWorkflowContext,
  validateWorkflowSummaryAttestation,
  isWorkflowSummaryAttestation,
  isTerminalWorkflowStatus,
  hasValidDagSemantics,
  createWorkflowContext,
  createWorkflowSummaryAttestation,
  type WorkflowId,
  type StepId,
  type WorkflowStatus,
  type WorkflowContext,
  type WorkflowSummaryAttestation,
} from '../src/workflow';

// =============================================================================
// TEST FIXTURES
// =============================================================================

// Valid ULID: 26 characters, Crockford Base32
const VALID_ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const VALID_ULID_2 = '01H5KPT9QZA123456789VWXYZG';
const VALID_ULID_3 = '01H5KPT9QZA123456789VWXY00';
const VALID_DATETIME = '2026-01-20T12:00:00Z';
const VALID_DATETIME_FUTURE = '2027-01-20T12:00:00Z';

// Valid IDs with prefixes
const VALID_WORKFLOW_ID = `wf_${VALID_ULID}`;
const VALID_STEP_ID = `step_${VALID_ULID}`;
const VALID_STEP_ID_2 = `step_${VALID_ULID_2}`;
const VALID_STEP_ID_3 = `step_${VALID_ULID_3}`;

const validWorkflowContext: WorkflowContext = {
  workflow_id: VALID_WORKFLOW_ID as WorkflowId,
  step_id: VALID_STEP_ID as StepId,
  parent_step_ids: [],
};

const validWorkflowSummaryAttestation: WorkflowSummaryAttestation = {
  type: 'peac/workflow-summary',
  issuer: 'https://orchestrator.example.com',
  issued_at: VALID_DATETIME,
  evidence: {
    workflow_id: VALID_WORKFLOW_ID as WorkflowId,
    status: 'completed',
    started_at: VALID_DATETIME,
    completed_at: VALID_DATETIME_FUTURE,
    receipt_refs: ['jti:receipt1', 'jti:receipt2'],
    orchestrator_id: 'agent:orchestrator-001',
    agents_involved: ['agent:worker-001', 'agent:worker-002'],
  },
};

// =============================================================================
// CONSTANTS TESTS
// =============================================================================

describe('Workflow Constants', () => {
  it('should have correct extension key', () => {
    expect(WORKFLOW_EXTENSION_KEY).toBe('org.peacprotocol/workflow');
  });

  it('should have correct summary type', () => {
    expect(WORKFLOW_SUMMARY_TYPE).toBe('peac/workflow-summary');
  });

  it('should have all workflow statuses', () => {
    expect(WORKFLOW_STATUSES).toEqual(['in_progress', 'completed', 'failed', 'cancelled']);
  });

  it('should have all orchestration frameworks', () => {
    expect(ORCHESTRATION_FRAMEWORKS).toEqual([
      'mcp',
      'a2a',
      'crewai',
      'langgraph',
      'autogen',
      'custom',
    ]);
  });

  it('should have all workflow limits', () => {
    expect(WORKFLOW_LIMITS.maxParentSteps).toBe(16);
    expect(WORKFLOW_LIMITS.maxWorkflowIdLength).toBe(128);
    expect(WORKFLOW_LIMITS.maxStepIdLength).toBe(128);
    expect(WORKFLOW_LIMITS.maxToolNameLength).toBe(256);
    expect(WORKFLOW_LIMITS.maxAgentsInvolved).toBe(100);
    expect(WORKFLOW_LIMITS.maxReceiptRefs).toBe(10000);
    expect(WORKFLOW_LIMITS.maxErrorMessageLength).toBe(1024);
  });
});

// =============================================================================
// ID PATTERN TESTS
// =============================================================================

describe('WORKFLOW_ID_PATTERN', () => {
  it('should match valid workflow IDs with ULID', () => {
    expect(WORKFLOW_ID_PATTERN.test(`wf_${VALID_ULID}`)).toBe(true);
    expect(WORKFLOW_ID_PATTERN.test(`wf_${VALID_ULID_2}`)).toBe(true);
  });

  it('should match valid workflow IDs with UUID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(WORKFLOW_ID_PATTERN.test(`wf_${uuid}`)).toBe(true);
  });

  it('should reject IDs without wf_ prefix', () => {
    expect(WORKFLOW_ID_PATTERN.test(VALID_ULID)).toBe(false);
    expect(WORKFLOW_ID_PATTERN.test(`workflow_${VALID_ULID}`)).toBe(false);
  });

  it('should reject IDs that are too short', () => {
    expect(WORKFLOW_ID_PATTERN.test('wf_short')).toBe(false);
    expect(WORKFLOW_ID_PATTERN.test('wf_12345678901234567890')).toBe(true); // exactly 20
    expect(WORKFLOW_ID_PATTERN.test('wf_1234567890123456789')).toBe(false); // 19 chars
  });

  it('should reject IDs that are too long', () => {
    const longId = 'a'.repeat(50);
    expect(WORKFLOW_ID_PATTERN.test(`wf_${longId}`)).toBe(false);
  });
});

describe('STEP_ID_PATTERN', () => {
  it('should match valid step IDs with ULID', () => {
    expect(STEP_ID_PATTERN.test(`step_${VALID_ULID}`)).toBe(true);
    expect(STEP_ID_PATTERN.test(`step_${VALID_ULID_2}`)).toBe(true);
  });

  it('should match valid step IDs with UUID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(STEP_ID_PATTERN.test(`step_${uuid}`)).toBe(true);
  });

  it('should reject IDs without step_ prefix', () => {
    expect(STEP_ID_PATTERN.test(VALID_ULID)).toBe(false);
    expect(STEP_ID_PATTERN.test(`st_${VALID_ULID}`)).toBe(false);
  });

  it('should reject IDs that are too short', () => {
    expect(STEP_ID_PATTERN.test('step_short')).toBe(false);
  });
});

// =============================================================================
// WORKFLOW ID SCHEMA TESTS
// =============================================================================

describe('WorkflowIdSchema', () => {
  it('should accept valid workflow IDs', () => {
    expect(WorkflowIdSchema.parse(VALID_WORKFLOW_ID)).toBe(VALID_WORKFLOW_ID);
  });

  it('should reject invalid workflow IDs', () => {
    expect(() => WorkflowIdSchema.parse('invalid')).toThrow();
    expect(() => WorkflowIdSchema.parse('')).toThrow();
    expect(() => WorkflowIdSchema.parse('wf_short')).toThrow();
  });

  it('should reject IDs exceeding max length', () => {
    const longId = `wf_${'a'.repeat(130)}`;
    expect(() => WorkflowIdSchema.parse(longId)).toThrow();
  });
});

describe('StepIdSchema', () => {
  it('should accept valid step IDs', () => {
    expect(StepIdSchema.parse(VALID_STEP_ID)).toBe(VALID_STEP_ID);
  });

  it('should reject invalid step IDs', () => {
    expect(() => StepIdSchema.parse('invalid')).toThrow();
    expect(() => StepIdSchema.parse('')).toThrow();
    expect(() => StepIdSchema.parse('step_short')).toThrow();
  });
});

// =============================================================================
// WORKFLOW STATUS SCHEMA TESTS
// =============================================================================

describe('WorkflowStatusSchema', () => {
  it('should accept all valid statuses', () => {
    WORKFLOW_STATUSES.forEach((status) => {
      expect(WorkflowStatusSchema.parse(status)).toBe(status);
    });
  });

  it('should reject invalid statuses', () => {
    expect(() => WorkflowStatusSchema.parse('pending')).toThrow();
    expect(() => WorkflowStatusSchema.parse('')).toThrow();
    expect(() => WorkflowStatusSchema.parse(123)).toThrow();
  });
});

// =============================================================================
// ORCHESTRATION FRAMEWORK SCHEMA TESTS
// =============================================================================

describe('OrchestrationFrameworkSchema', () => {
  it('should accept all valid frameworks', () => {
    ORCHESTRATION_FRAMEWORKS.forEach((framework) => {
      expect(OrchestrationFrameworkSchema.parse(framework)).toBe(framework);
    });
  });

  it('should reject invalid frameworks', () => {
    expect(() => OrchestrationFrameworkSchema.parse('invalid')).toThrow();
    expect(() => OrchestrationFrameworkSchema.parse('')).toThrow();
  });
});

// =============================================================================
// WORKFLOW CONTEXT SCHEMA TESTS
// =============================================================================

describe('WorkflowContextSchema', () => {
  it('should accept minimal valid context', () => {
    const context = {
      workflow_id: VALID_WORKFLOW_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: [],
    };
    const result = WorkflowContextSchema.parse(context);
    expect(result.workflow_id).toBe(VALID_WORKFLOW_ID);
    expect(result.step_id).toBe(VALID_STEP_ID);
    expect(result.parent_step_ids).toEqual([]);
  });

  it('should accept context with all optional fields', () => {
    const context = {
      workflow_id: VALID_WORKFLOW_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: [VALID_STEP_ID_2],
      orchestrator_id: 'agent:orchestrator-001',
      orchestrator_receipt_ref: 'jti:receipt-123',
      step_index: 0,
      step_total: 5,
      tool_name: 'mcp:tool-name',
      framework: 'mcp' as const,
      prev_receipt_hash: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    };
    const result = WorkflowContextSchema.parse(context);
    expect(result.orchestrator_id).toBe('agent:orchestrator-001');
    expect(result.step_index).toBe(0);
    expect(result.framework).toBe('mcp');
  });

  it('should accept context with multiple parents (fork/join)', () => {
    const context = {
      workflow_id: VALID_WORKFLOW_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: [VALID_STEP_ID_2, VALID_STEP_ID_3],
    };
    const result = WorkflowContextSchema.parse(context);
    expect(result.parent_step_ids).toHaveLength(2);
  });

  it('should reject context with too many parents', () => {
    const parents = Array.from({ length: 17 }, (_, i) => `step_${VALID_ULID.slice(0, -2)}${String(i).padStart(2, '0')}`);
    const context = {
      workflow_id: VALID_WORKFLOW_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: parents,
    };
    expect(() => WorkflowContextSchema.parse(context)).toThrow();
  });

  it('should reject invalid prev_receipt_hash format', () => {
    const context = {
      workflow_id: VALID_WORKFLOW_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: [],
      prev_receipt_hash: 'invalid-hash',
    };
    expect(() => WorkflowContextSchema.parse(context)).toThrow();
  });

  it('should reject extra fields (strict mode)', () => {
    const context = {
      workflow_id: VALID_WORKFLOW_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: [],
      unknown_field: 'should fail',
    };
    expect(() => WorkflowContextSchema.parse(context)).toThrow();
  });

  it('should default parent_step_ids to empty array', () => {
    const context = {
      workflow_id: VALID_WORKFLOW_ID,
      step_id: VALID_STEP_ID,
    };
    const result = WorkflowContextSchema.parse(context);
    expect(result.parent_step_ids).toEqual([]);
  });
});

// =============================================================================
// WORKFLOW ERROR CONTEXT SCHEMA TESTS
// =============================================================================

describe('WorkflowErrorContextSchema', () => {
  it('should accept valid error context', () => {
    const errorContext = {
      failed_step_id: VALID_STEP_ID,
      error_code: 'E_TIMEOUT',
      error_message: 'Tool execution timed out after 30 seconds',
    };
    const result = WorkflowErrorContextSchema.parse(errorContext);
    expect(result.error_code).toBe('E_TIMEOUT');
  });

  it('should reject error message exceeding max length', () => {
    const errorContext = {
      failed_step_id: VALID_STEP_ID,
      error_code: 'E_LONG_ERROR',
      error_message: 'x'.repeat(WORKFLOW_LIMITS.maxErrorMessageLength + 1),
    };
    expect(() => WorkflowErrorContextSchema.parse(errorContext)).toThrow();
  });

  it('should reject extra fields (strict mode)', () => {
    const errorContext = {
      failed_step_id: VALID_STEP_ID,
      error_code: 'E_TEST',
      error_message: 'Test error',
      unknown_field: 'should fail',
    };
    expect(() => WorkflowErrorContextSchema.parse(errorContext)).toThrow();
  });
});

// =============================================================================
// WORKFLOW SUMMARY EVIDENCE SCHEMA TESTS
// =============================================================================

describe('WorkflowSummaryEvidenceSchema', () => {
  it('should accept valid summary with receipt_refs', () => {
    const evidence = {
      workflow_id: VALID_WORKFLOW_ID,
      status: 'completed' as const,
      started_at: VALID_DATETIME,
      completed_at: VALID_DATETIME_FUTURE,
      receipt_refs: ['jti:receipt1', 'jti:receipt2'],
      orchestrator_id: 'agent:orchestrator-001',
      agents_involved: ['agent:worker-001'],
    };
    const result = WorkflowSummaryEvidenceSchema.parse(evidence);
    expect(result.status).toBe('completed');
    expect(result.receipt_refs).toHaveLength(2);
  });

  it('should accept valid summary with receipt_merkle_root', () => {
    const evidence = {
      workflow_id: VALID_WORKFLOW_ID,
      status: 'completed' as const,
      started_at: VALID_DATETIME,
      receipt_merkle_root: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      receipt_count: 1000,
      orchestrator_id: 'agent:orchestrator-001',
      agents_involved: ['agent:worker-001'],
    };
    const result = WorkflowSummaryEvidenceSchema.parse(evidence);
    expect(result.receipt_merkle_root).toBeDefined();
    expect(result.receipt_count).toBe(1000);
  });

  it('should accept summary with both receipt_refs and merkle_root', () => {
    const evidence = {
      workflow_id: VALID_WORKFLOW_ID,
      status: 'completed' as const,
      started_at: VALID_DATETIME,
      receipt_refs: ['jti:receipt1'],
      receipt_merkle_root: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      receipt_count: 100,
      orchestrator_id: 'agent:orchestrator-001',
      agents_involved: ['agent:worker-001'],
    };
    expect(WorkflowSummaryEvidenceSchema.parse(evidence).receipt_refs).toHaveLength(1);
  });

  it('should reject summary without receipt_refs or merkle_root', () => {
    const evidence = {
      workflow_id: VALID_WORKFLOW_ID,
      status: 'completed' as const,
      started_at: VALID_DATETIME,
      orchestrator_id: 'agent:orchestrator-001',
      agents_involved: ['agent:worker-001'],
    };
    expect(() => WorkflowSummaryEvidenceSchema.parse(evidence)).toThrow(
      'Workflow summary must include receipt_refs or receipt_merkle_root'
    );
  });

  it('should reject merkle_root without receipt_count', () => {
    const evidence = {
      workflow_id: VALID_WORKFLOW_ID,
      status: 'completed' as const,
      started_at: VALID_DATETIME,
      receipt_merkle_root: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      orchestrator_id: 'agent:orchestrator-001',
      agents_involved: ['agent:worker-001'],
    };
    expect(() => WorkflowSummaryEvidenceSchema.parse(evidence)).toThrow(
      'receipt_count is required when using receipt_merkle_root'
    );
  });

  it('should accept summary with error_context for failed status', () => {
    const evidence = {
      workflow_id: VALID_WORKFLOW_ID,
      status: 'failed' as const,
      started_at: VALID_DATETIME,
      receipt_refs: ['jti:receipt1'],
      orchestrator_id: 'agent:orchestrator-001',
      agents_involved: ['agent:worker-001'],
      error_context: {
        failed_step_id: VALID_STEP_ID,
        error_code: 'E_TIMEOUT',
        error_message: 'Tool execution timed out',
      },
    };
    const result = WorkflowSummaryEvidenceSchema.parse(evidence);
    expect(result.error_context?.error_code).toBe('E_TIMEOUT');
  });

  it('should reject too many receipt_refs', () => {
    const evidence = {
      workflow_id: VALID_WORKFLOW_ID,
      status: 'completed' as const,
      started_at: VALID_DATETIME,
      receipt_refs: Array.from({ length: WORKFLOW_LIMITS.maxReceiptRefs + 1 }, (_, i) => `jti:receipt${i}`),
      orchestrator_id: 'agent:orchestrator-001',
      agents_involved: ['agent:worker-001'],
    };
    expect(() => WorkflowSummaryEvidenceSchema.parse(evidence)).toThrow();
  });

  it('should reject too many agents_involved', () => {
    const evidence = {
      workflow_id: VALID_WORKFLOW_ID,
      status: 'completed' as const,
      started_at: VALID_DATETIME,
      receipt_refs: ['jti:receipt1'],
      orchestrator_id: 'agent:orchestrator-001',
      agents_involved: Array.from({ length: WORKFLOW_LIMITS.maxAgentsInvolved + 1 }, (_, i) => `agent:worker-${i}`),
    };
    expect(() => WorkflowSummaryEvidenceSchema.parse(evidence)).toThrow();
  });
});

// =============================================================================
// WORKFLOW SUMMARY ATTESTATION SCHEMA TESTS
// =============================================================================

describe('WorkflowSummaryAttestationSchema', () => {
  it('should accept valid attestation', () => {
    expect(WorkflowSummaryAttestationSchema.parse(validWorkflowSummaryAttestation)).toEqual(
      validWorkflowSummaryAttestation
    );
  });

  it('should reject wrong type', () => {
    const attestation = { ...validWorkflowSummaryAttestation, type: 'peac/wrong' };
    expect(() => WorkflowSummaryAttestationSchema.parse(attestation)).toThrow();
  });

  it('should reject non-https issuer', () => {
    const attestation = {
      ...validWorkflowSummaryAttestation,
      issuer: 'http://insecure.example.com',
    };
    expect(() => WorkflowSummaryAttestationSchema.parse(attestation)).toThrow();
  });

  it('should accept attestation with expires_at', () => {
    const attestation = {
      ...validWorkflowSummaryAttestation,
      expires_at: VALID_DATETIME_FUTURE,
    };
    expect(WorkflowSummaryAttestationSchema.parse(attestation).expires_at).toBe(VALID_DATETIME_FUTURE);
  });

  it('should reject extra fields (strict mode)', () => {
    const attestation = { ...validWorkflowSummaryAttestation, unknown_field: 'should fail' };
    expect(() => WorkflowSummaryAttestationSchema.parse(attestation)).toThrow();
  });
});

// =============================================================================
// HELPER FUNCTION TESTS - ID CREATION
// =============================================================================

describe('createWorkflowId', () => {
  it('should create valid workflow ID from ULID', () => {
    const workflowId = createWorkflowId(VALID_ULID);
    expect(workflowId).toBe(`wf_${VALID_ULID}`);
  });

  it('should create valid workflow ID from UUID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const workflowId = createWorkflowId(uuid);
    expect(workflowId).toBe(`wf_${uuid}`);
  });

  it('should throw for invalid ID payload', () => {
    expect(() => createWorkflowId('short')).toThrow();
  });
});

describe('createStepId', () => {
  it('should create valid step ID from ULID', () => {
    const stepId = createStepId(VALID_ULID);
    expect(stepId).toBe(`step_${VALID_ULID}`);
  });

  it('should throw for invalid ID payload', () => {
    expect(() => createStepId('short')).toThrow();
  });
});

// =============================================================================
// HELPER FUNCTION TESTS - VALIDATION
// =============================================================================

describe('validateWorkflowContext', () => {
  it('should return validated context for valid input', () => {
    const result = validateWorkflowContext(validWorkflowContext);
    expect(result.workflow_id).toBe(VALID_WORKFLOW_ID);
  });

  it('should throw for invalid input', () => {
    expect(() => validateWorkflowContext({ invalid: 'data' })).toThrow();
  });
});

describe('isValidWorkflowContext', () => {
  it('should return true for valid context', () => {
    expect(isValidWorkflowContext(validWorkflowContext)).toBe(true);
  });

  it('should return false for invalid context', () => {
    expect(isValidWorkflowContext({ invalid: 'data' })).toBe(false);
    expect(isValidWorkflowContext(null)).toBe(false);
    expect(isValidWorkflowContext(undefined)).toBe(false);
  });
});

describe('validateWorkflowSummaryAttestation', () => {
  it('should return validated attestation for valid input', () => {
    const result = validateWorkflowSummaryAttestation(validWorkflowSummaryAttestation);
    expect(result.type).toBe('peac/workflow-summary');
  });

  it('should throw for invalid input', () => {
    expect(() => validateWorkflowSummaryAttestation({ invalid: 'data' })).toThrow();
  });
});

describe('isWorkflowSummaryAttestation', () => {
  it('should return true for valid attestation', () => {
    expect(isWorkflowSummaryAttestation(validWorkflowSummaryAttestation)).toBe(true);
  });

  it('should return false for invalid attestation', () => {
    expect(isWorkflowSummaryAttestation({ type: 'peac/other' })).toBe(false);
    expect(isWorkflowSummaryAttestation(null)).toBe(false);
  });
});

// =============================================================================
// HELPER FUNCTION TESTS - STATUS
// =============================================================================

describe('isTerminalWorkflowStatus', () => {
  it('should return true for terminal statuses', () => {
    expect(isTerminalWorkflowStatus('completed')).toBe(true);
    expect(isTerminalWorkflowStatus('failed')).toBe(true);
    expect(isTerminalWorkflowStatus('cancelled')).toBe(true);
  });

  it('should return false for non-terminal statuses', () => {
    expect(isTerminalWorkflowStatus('in_progress')).toBe(false);
  });
});

// =============================================================================
// HELPER FUNCTION TESTS - DAG SEMANTICS
// =============================================================================

describe('hasValidDagSemantics', () => {
  it('should return true for valid DAG context (root step)', () => {
    expect(hasValidDagSemantics(validWorkflowContext)).toBe(true);
  });

  it('should return true for valid DAG context (with parents)', () => {
    const context: WorkflowContext = {
      ...validWorkflowContext,
      parent_step_ids: [VALID_STEP_ID_2 as StepId],
    };
    expect(hasValidDagSemantics(context)).toBe(true);
  });

  it('should return false for self-parent', () => {
    const context: WorkflowContext = {
      ...validWorkflowContext,
      parent_step_ids: [VALID_STEP_ID as StepId], // Same as step_id
    };
    expect(hasValidDagSemantics(context)).toBe(false);
  });

  it('should return false for duplicate parents', () => {
    const context: WorkflowContext = {
      ...validWorkflowContext,
      parent_step_ids: [VALID_STEP_ID_2 as StepId, VALID_STEP_ID_2 as StepId],
    };
    expect(hasValidDagSemantics(context)).toBe(false);
  });
});

// =============================================================================
// HELPER FUNCTION TESTS - FACTORY FUNCTIONS
// =============================================================================

describe('createWorkflowContext', () => {
  it('should create minimal context', () => {
    const context = createWorkflowContext({
      workflow_id: VALID_WORKFLOW_ID,
      step_id: VALID_STEP_ID,
    });
    expect(context.workflow_id).toBe(VALID_WORKFLOW_ID);
    expect(context.step_id).toBe(VALID_STEP_ID);
    expect(context.parent_step_ids).toEqual([]);
  });

  it('should create context with all optional fields', () => {
    const context = createWorkflowContext({
      workflow_id: VALID_WORKFLOW_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: [VALID_STEP_ID_2],
      orchestrator_id: 'agent:orch-001',
      step_index: 0,
      step_total: 5,
      tool_name: 'mcp:tool',
      framework: 'mcp',
    });
    expect(context.orchestrator_id).toBe('agent:orch-001');
    expect(context.framework).toBe('mcp');
  });

  it('should throw for self-parent', () => {
    expect(() =>
      createWorkflowContext({
        workflow_id: VALID_WORKFLOW_ID,
        step_id: VALID_STEP_ID,
        parent_step_ids: [VALID_STEP_ID],
      })
    ).toThrow('Invalid DAG semantics');
  });

  it('should throw for duplicate parents', () => {
    expect(() =>
      createWorkflowContext({
        workflow_id: VALID_WORKFLOW_ID,
        step_id: VALID_STEP_ID,
        parent_step_ids: [VALID_STEP_ID_2, VALID_STEP_ID_2],
      })
    ).toThrow('Invalid DAG semantics');
  });
});

describe('createWorkflowSummaryAttestation', () => {
  it('should create attestation with receipt_refs', () => {
    const attestation = createWorkflowSummaryAttestation({
      workflow_id: VALID_WORKFLOW_ID,
      status: 'completed',
      started_at: VALID_DATETIME,
      completed_at: VALID_DATETIME_FUTURE,
      orchestrator_id: 'agent:orch-001',
      agents_involved: ['agent:worker-001'],
      receipt_refs: ['jti:receipt1'],
      issuer: 'https://orchestrator.example.com',
      issued_at: VALID_DATETIME,
    });

    expect(attestation.type).toBe('peac/workflow-summary');
    expect(attestation.evidence.status).toBe('completed');
    expect(attestation.evidence.receipt_refs).toHaveLength(1);
  });

  it('should create attestation with merkle_root', () => {
    const attestation = createWorkflowSummaryAttestation({
      workflow_id: VALID_WORKFLOW_ID,
      status: 'completed',
      started_at: VALID_DATETIME,
      orchestrator_id: 'agent:orch-001',
      agents_involved: ['agent:worker-001'],
      receipt_merkle_root: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      receipt_count: 1000,
      issuer: 'https://orchestrator.example.com',
      issued_at: VALID_DATETIME,
    });

    expect(attestation.evidence.receipt_merkle_root).toBeDefined();
    expect(attestation.evidence.receipt_count).toBe(1000);
  });

  it('should create attestation with error_context for failed status', () => {
    const attestation = createWorkflowSummaryAttestation({
      workflow_id: VALID_WORKFLOW_ID,
      status: 'failed',
      started_at: VALID_DATETIME,
      orchestrator_id: 'agent:orch-001',
      agents_involved: ['agent:worker-001'],
      receipt_refs: ['jti:receipt1'],
      error_context: {
        failed_step_id: VALID_STEP_ID as StepId,
        error_code: 'E_TIMEOUT',
        error_message: 'Tool execution timed out',
      },
      issuer: 'https://orchestrator.example.com',
      issued_at: VALID_DATETIME,
    });

    expect(attestation.evidence.status).toBe('failed');
    expect(attestation.evidence.error_context?.error_code).toBe('E_TIMEOUT');
  });

  it('should include expires_at when provided', () => {
    const attestation = createWorkflowSummaryAttestation({
      workflow_id: VALID_WORKFLOW_ID,
      status: 'completed',
      started_at: VALID_DATETIME,
      orchestrator_id: 'agent:orch-001',
      agents_involved: ['agent:worker-001'],
      receipt_refs: ['jti:receipt1'],
      issuer: 'https://orchestrator.example.com',
      issued_at: VALID_DATETIME,
      expires_at: VALID_DATETIME_FUTURE,
    });

    expect(attestation.expires_at).toBe(VALID_DATETIME_FUTURE);
  });
});

// =============================================================================
// EDGE CASES AND INTEGRATION TESTS
// =============================================================================

describe('Workflow correlation edge cases', () => {
  describe('Linear workflow (sequential steps)', () => {
    it('should support step_index and step_total for linear workflows', () => {
      const steps: WorkflowContext[] = [];
      const workflowId = VALID_WORKFLOW_ID as WorkflowId;

      // Create 3 sequential steps
      for (let i = 0; i < 3; i++) {
        const stepId = `step_01ARZ3NDEKTSV4RRFFQ69G5F${String(i).padStart(2, 'A')}` as StepId;
        const parentStepIds = i === 0 ? [] : [steps[i - 1].step_id];

        const context = createWorkflowContext({
          workflow_id: workflowId,
          step_id: stepId,
          parent_step_ids: parentStepIds,
          step_index: i,
          step_total: 3,
        });

        steps.push(context);
      }

      expect(steps).toHaveLength(3);
      expect(steps[0].parent_step_ids).toEqual([]);
      expect(steps[1].parent_step_ids).toEqual([steps[0].step_id]);
      expect(steps[2].parent_step_ids).toEqual([steps[1].step_id]);
    });
  });

  describe('Fork/join workflow (parallel steps)', () => {
    it('should support multiple parents for join steps', () => {
      const workflowId = VALID_WORKFLOW_ID as WorkflowId;

      // Root step
      const rootStep = createWorkflowContext({
        workflow_id: workflowId,
        step_id: `step_${VALID_ULID}`,
      });

      // Two parallel branches from root
      const branch1 = createWorkflowContext({
        workflow_id: workflowId,
        step_id: `step_${VALID_ULID_2}`,
        parent_step_ids: [rootStep.step_id],
      });

      const branch2 = createWorkflowContext({
        workflow_id: workflowId,
        step_id: `step_${VALID_ULID_3}`,
        parent_step_ids: [rootStep.step_id],
      });

      // Join step
      const joinStep = createWorkflowContext({
        workflow_id: workflowId,
        step_id: 'step_01H5KPT9QZA123456789JOINSS' as StepId,
        parent_step_ids: [branch1.step_id, branch2.step_id],
      });

      expect(joinStep.parent_step_ids).toHaveLength(2);
      expect(joinStep.parent_step_ids).toContain(branch1.step_id);
      expect(joinStep.parent_step_ids).toContain(branch2.step_id);
    });
  });

  describe('Hash chaining (streaming receipts)', () => {
    it('should support prev_receipt_hash for streaming', () => {
      const context = createWorkflowContext({
        workflow_id: VALID_WORKFLOW_ID,
        step_id: VALID_STEP_ID,
        prev_receipt_hash: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      });

      expect(context.prev_receipt_hash).toBeDefined();
      expect(context.prev_receipt_hash?.startsWith('sha256:')).toBe(true);
    });
  });

  describe('Framework-specific metadata', () => {
    it('should support MCP tool names', () => {
      const context = createWorkflowContext({
        workflow_id: VALID_WORKFLOW_ID,
        step_id: VALID_STEP_ID,
        tool_name: 'mcp:github/create-issue',
        framework: 'mcp',
      });

      expect(context.tool_name).toBe('mcp:github/create-issue');
      expect(context.framework).toBe('mcp');
    });

    it('should support A2A skill names', () => {
      const context = createWorkflowContext({
        workflow_id: VALID_WORKFLOW_ID,
        step_id: VALID_STEP_ID,
        tool_name: 'a2a:research/deep-search',
        framework: 'a2a',
      });

      expect(context.framework).toBe('a2a');
    });

    it('should support custom framework', () => {
      const context = createWorkflowContext({
        workflow_id: VALID_WORKFLOW_ID,
        step_id: VALID_STEP_ID,
        framework: 'custom',
      });

      expect(context.framework).toBe('custom');
    });
  });
});

// =============================================================================
// SCHEMA OUTPUT VALIDATION (CRITICAL TESTS)
// =============================================================================

describe('Schema output validation', () => {
  it('createWorkflowContext output should always pass schema validation', () => {
    const context = createWorkflowContext({
      workflow_id: VALID_WORKFLOW_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: [VALID_STEP_ID_2],
      orchestrator_id: 'agent:orch',
      framework: 'mcp',
    });

    const parseResult = WorkflowContextSchema.safeParse(context);
    expect(parseResult.success).toBe(true);
  });

  it('createWorkflowSummaryAttestation output should always pass schema validation', () => {
    const attestation = createWorkflowSummaryAttestation({
      workflow_id: VALID_WORKFLOW_ID,
      status: 'completed',
      started_at: VALID_DATETIME,
      completed_at: VALID_DATETIME_FUTURE,
      orchestrator_id: 'agent:orch',
      agents_involved: ['agent:worker'],
      receipt_refs: ['jti:receipt1'],
      issuer: 'https://example.com',
      issued_at: VALID_DATETIME,
    });

    const parseResult = WorkflowSummaryAttestationSchema.safeParse(attestation);
    expect(parseResult.success).toBe(true);
  });
});
