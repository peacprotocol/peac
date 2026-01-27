/**
 * Tests for validateWorkflowContextOrdered() - explicit validation sequencing
 *
 * Verifies:
 * 1. All emitted error codes exist in specs/kernel/errors.json
 * 2. Multi-failure precedence: when input has multiple failures, the first
 *    error code matches the documented evaluation order (Section 6.5.1)
 * 3. Valid inputs pass through to Zod schema
 * 4. Evaluation order is locked as a testable contract
 */

import { describe, it, expect } from 'vitest';
import { validateWorkflowContextOrdered, WORKFLOW_LIMITS } from '../src/workflow';

// Canonical error codes from specs/kernel/errors.json (workflow category)
const CANONICAL_WORKFLOW_CODES = [
  'E_WORKFLOW_CONTEXT_INVALID',
  'E_WORKFLOW_DAG_INVALID',
  'E_WORKFLOW_LIMIT_EXCEEDED',
  'E_WORKFLOW_ID_INVALID',
  'E_WORKFLOW_STEP_ID_INVALID',
  'E_WORKFLOW_PARENT_NOT_FOUND',
  'E_WORKFLOW_SUMMARY_INVALID',
  'E_WORKFLOW_CYCLE_DETECTED',
] as const;

// Valid IDs for constructing test inputs
const VALID_WF_ID = 'wf_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const VALID_STEP_ID = 'step_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const VALID_PARENT_ID = 'step_01H5KPT9QZA123456789VWXYZG';

// ---------------------------------------------------------------------------
// Canonical Error Code Verification
// ---------------------------------------------------------------------------

describe('ordered validation - canonical error codes', () => {
  it('emits only codes that exist in specs/kernel/errors.json', () => {
    // Collect all error codes that the validator can emit by testing
    // known-invalid inputs for each check path
    const emittedCodes = new Set<string>();

    // Non-object input
    const r1 = validateWorkflowContextOrdered(null);
    if (!r1.valid) emittedCodes.add(r1.error_code);

    // Invalid workflow ID
    const r2 = validateWorkflowContextOrdered({
      workflow_id: 'bad',
      step_id: VALID_STEP_ID,
      parent_step_ids: [],
    });
    if (!r2.valid) emittedCodes.add(r2.error_code);

    // Invalid step ID
    const r3 = validateWorkflowContextOrdered({
      workflow_id: VALID_WF_ID,
      step_id: 'bad',
      parent_step_ids: [],
    });
    if (!r3.valid) emittedCodes.add(r3.error_code);

    // Exceeds max parents
    const r4 = validateWorkflowContextOrdered({
      workflow_id: VALID_WF_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: Array.from(
        { length: 17 },
        (_, i) => `step_01ARZ3NDEKTSV4RRFFQ69G5F${String(i).padStart(2, '0')}`
      ),
    });
    if (!r4.valid) emittedCodes.add(r4.error_code);

    // Invalid framework
    const r5 = validateWorkflowContextOrdered({
      workflow_id: VALID_WF_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: [],
      framework: 'INVALID',
    });
    if (!r5.valid) emittedCodes.add(r5.error_code);

    // Invalid prev_receipt_hash
    const r6 = validateWorkflowContextOrdered({
      workflow_id: VALID_WF_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: [],
      prev_receipt_hash: 'not-a-hash',
    });
    if (!r6.valid) emittedCodes.add(r6.error_code);

    // Self-parent
    const r7 = validateWorkflowContextOrdered({
      workflow_id: VALID_WF_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: [VALID_STEP_ID],
    });
    if (!r7.valid) emittedCodes.add(r7.error_code);

    // Duplicate parents
    const r8 = validateWorkflowContextOrdered({
      workflow_id: VALID_WF_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: [VALID_PARENT_ID, VALID_PARENT_ID],
    });
    if (!r8.valid) emittedCodes.add(r8.error_code);

    // Every emitted code must be in the canonical registry
    for (const code of emittedCodes) {
      expect(CANONICAL_WORKFLOW_CODES).toContain(code);
    }
  });
});

// ---------------------------------------------------------------------------
// Multi-Failure Precedence (Evaluation Order Contract)
// ---------------------------------------------------------------------------

describe('ordered validation - multi-failure precedence', () => {
  it('bad workflow_id takes precedence over bad step_id', () => {
    const result = validateWorkflowContextOrdered({
      workflow_id: 'bad-id',
      step_id: 'also-bad',
      parent_step_ids: [],
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error_code).toBe('E_WORKFLOW_ID_INVALID');
    }
  });

  it('bad workflow_id takes precedence over self-parent', () => {
    const result = validateWorkflowContextOrdered({
      workflow_id: 'bad-id',
      step_id: VALID_STEP_ID,
      parent_step_ids: [VALID_STEP_ID],
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error_code).toBe('E_WORKFLOW_ID_INVALID');
    }
  });

  it('bad step_id takes precedence over limit exceeded', () => {
    const result = validateWorkflowContextOrdered({
      workflow_id: VALID_WF_ID,
      step_id: 'bad',
      parent_step_ids: Array.from(
        { length: 17 },
        (_, i) => `step_01ARZ3NDEKTSV4RRFFQ69G5F${String(i).padStart(2, '0')}`
      ),
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error_code).toBe('E_WORKFLOW_STEP_ID_INVALID');
    }
  });

  it('limit exceeded takes precedence over invalid framework', () => {
    const result = validateWorkflowContextOrdered({
      workflow_id: VALID_WF_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: Array.from(
        { length: 17 },
        (_, i) => `step_01ARZ3NDEKTSV4RRFFQ69G5F${String(i).padStart(2, '0')}`
      ),
      framework: 'INVALID',
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error_code).toBe('E_WORKFLOW_LIMIT_EXCEEDED');
    }
  });

  it('invalid framework takes precedence over self-parent', () => {
    const result = validateWorkflowContextOrdered({
      workflow_id: VALID_WF_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: [VALID_STEP_ID],
      framework: 'INVALID',
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error_code).toBe('E_WORKFLOW_CONTEXT_INVALID');
    }
  });

  it('invalid prev_receipt_hash takes precedence over self-parent', () => {
    const result = validateWorkflowContextOrdered({
      workflow_id: VALID_WF_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: [VALID_STEP_ID],
      prev_receipt_hash: 'bad-hash',
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error_code).toBe('E_WORKFLOW_CONTEXT_INVALID');
    }
  });

  it('self-parent takes precedence over duplicate parents', () => {
    // Input has both self-parent AND duplicates - self-parent check comes first
    const result = validateWorkflowContextOrdered({
      workflow_id: VALID_WF_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: [VALID_STEP_ID, VALID_PARENT_ID, VALID_PARENT_ID],
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error_code).toBe('E_WORKFLOW_DAG_INVALID');
    }
  });
});

// ---------------------------------------------------------------------------
// Valid Inputs
// ---------------------------------------------------------------------------

describe('ordered validation - valid inputs', () => {
  it('accepts minimal valid context', () => {
    const result = validateWorkflowContextOrdered({
      workflow_id: VALID_WF_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: [],
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.workflow_id).toBe(VALID_WF_ID);
    }
  });

  it('accepts context with all optional fields', () => {
    const result = validateWorkflowContextOrdered({
      workflow_id: VALID_WF_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: [VALID_PARENT_ID],
      framework: 'langgraph',
      tool_name: 'search-web',
      orchestrator_id: 'orch-123',
      step_index: 0,
      step_total: 5,
    });

    expect(result.valid).toBe(true);
  });

  it('accepts context with exactly maxParentSteps parents', () => {
    const parents = Array.from(
      { length: WORKFLOW_LIMITS.maxParentSteps },
      (_, i) => `step_01ARZ3NDEKTSV4RRFFQ69G5F${String(i).padStart(2, '0')}`
    );

    const result = validateWorkflowContextOrdered({
      workflow_id: VALID_WF_ID,
      step_id: VALID_STEP_ID,
      parent_step_ids: parents,
    });

    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Evaluation Order Contract (Snapshot)
// ---------------------------------------------------------------------------

describe('ordered validation - evaluation order contract', () => {
  // This test documents the exact evaluation order as a snapshot.
  // If someone changes the order, this test fails, forcing explicit review.
  it('follows Section 6.5.1 evaluation order', () => {
    // The documented order is:
    // Step 1: Required field format (workflow_id, step_id)
    // Step 2: Structural constraints (parent count limit)
    // Step 3: Optional field format (framework, prev_receipt_hash)
    // Step 4: Semantic DAG checks (self-parent, duplicate parents)
    //
    // We verify this by constructing inputs that fail at each step
    // and confirming the returned code matches expectations.

    const cases: Array<{
      description: string;
      input: Record<string, unknown>;
      expected_code: string;
    }> = [
      {
        description: 'Step 1a: bad workflow_id',
        input: { workflow_id: 'bad', step_id: VALID_STEP_ID, parent_step_ids: [] },
        expected_code: 'E_WORKFLOW_ID_INVALID',
      },
      {
        description: 'Step 1b: bad step_id',
        input: { workflow_id: VALID_WF_ID, step_id: 'bad', parent_step_ids: [] },
        expected_code: 'E_WORKFLOW_STEP_ID_INVALID',
      },
      {
        description: 'Step 2: parent count exceeds limit',
        input: {
          workflow_id: VALID_WF_ID,
          step_id: VALID_STEP_ID,
          parent_step_ids: Array.from(
            { length: 17 },
            (_, i) => `step_01ARZ3NDEKTSV4RRFFQ69G5F${String(i).padStart(2, '0')}`
          ),
        },
        expected_code: 'E_WORKFLOW_LIMIT_EXCEEDED',
      },
      {
        description: 'Step 3a: invalid framework grammar',
        input: {
          workflow_id: VALID_WF_ID,
          step_id: VALID_STEP_ID,
          parent_step_ids: [],
          framework: 'UPPER_CASE',
        },
        expected_code: 'E_WORKFLOW_CONTEXT_INVALID',
      },
      {
        description: 'Step 3b: invalid prev_receipt_hash format',
        input: {
          workflow_id: VALID_WF_ID,
          step_id: VALID_STEP_ID,
          parent_step_ids: [],
          prev_receipt_hash: 'not-sha256-format',
        },
        expected_code: 'E_WORKFLOW_CONTEXT_INVALID',
      },
      {
        description: 'Step 4a: self-parent',
        input: {
          workflow_id: VALID_WF_ID,
          step_id: VALID_STEP_ID,
          parent_step_ids: [VALID_STEP_ID],
        },
        expected_code: 'E_WORKFLOW_DAG_INVALID',
      },
      {
        description: 'Step 4b: duplicate parents',
        input: {
          workflow_id: VALID_WF_ID,
          step_id: VALID_STEP_ID,
          parent_step_ids: [VALID_PARENT_ID, VALID_PARENT_ID],
        },
        expected_code: 'E_WORKFLOW_DAG_INVALID',
      },
    ];

    for (const { description, input, expected_code } of cases) {
      const result = validateWorkflowContextOrdered(input);
      expect(result.valid, description).toBe(false);
      if (!result.valid) {
        expect(result.error_code, description).toBe(expected_code);
      }
    }
  });
});
