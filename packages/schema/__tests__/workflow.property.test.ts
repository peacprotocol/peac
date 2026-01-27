/**
 * Property-based tests for workflow correlation validation
 *
 * Uses fast-check to verify invariants for:
 * 1. Framework identifier grammar (acceptance and rejection)
 * 2. Workflow/Step ID format validation
 * 3. DAG constraint enforcement (self-parent, duplicate parents)
 * 4. WorkflowContext schema consistency
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import {
  FRAMEWORK_ID_PATTERN,
  WORKFLOW_ID_PATTERN,
  STEP_ID_PATTERN,
  WORKFLOW_LIMITS,
  WorkflowContextSchema,
  OrchestrationFrameworkSchema,
  WorkflowIdSchema,
  StepIdSchema,
  hasValidDagSemantics,
} from '../src/workflow';

// -----------------------------------------------------------------------------
// Arbitraries for generating test values
// -----------------------------------------------------------------------------

/**
 * Generate valid framework identifiers matching /^[a-z][a-z0-9_-]*$/ (max 64)
 */
const validFrameworkId = fc.stringMatching(/^[a-z][a-z0-9_-]{0,62}$/);

/**
 * Generate framework identifiers that violate the grammar
 */
const invalidFrameworkId = fc.oneof(
  // Starts with digit
  fc.stringMatching(/^[0-9][a-z]{1,10}$/),
  // Contains uppercase
  fc.constant('LangGraph'),
  fc.constant('CrewAI'),
  // Contains dot
  fc.stringMatching(/^[a-z]{1,5}\.[a-z]{1,5}$/),
  // Contains slash
  fc.constant('org/tool'),
  // Empty string
  fc.constant(''),
  // Starts with underscore
  fc.constant('_invalid'),
  // Starts with hyphen
  fc.constant('-invalid')
);

/**
 * Generate valid ULID payloads (26 uppercase alphanumeric chars)
 */
const validUlidPayload = fc.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/);

/**
 * Generate valid workflow IDs
 */
const validWorkflowId = validUlidPayload.map((ulid) => `wf_${ulid}`);

/**
 * Generate valid step IDs
 */
const validStepId = validUlidPayload.map((ulid) => `step_${ulid}`);

// -----------------------------------------------------------------------------
// Property Tests: Framework Identifier Grammar
// -----------------------------------------------------------------------------

describe('framework identifier grammar - property tests', () => {
  it('accepts all valid framework identifiers', () => {
    fc.assert(
      fc.property(validFrameworkId, (id) => {
        return FRAMEWORK_ID_PATTERN.test(id) && id.length <= WORKFLOW_LIMITS.maxFrameworkLength;
      }),
      { numRuns: 500 }
    );
  });

  it('valid framework IDs pass Zod schema', () => {
    fc.assert(
      fc.property(validFrameworkId, (id) => {
        const result = OrchestrationFrameworkSchema.safeParse(id);
        return result.success;
      }),
      { numRuns: 300 }
    );
  });

  it('rejects all invalid framework identifiers', () => {
    fc.assert(
      fc.property(invalidFrameworkId, (id) => {
        return !FRAMEWORK_ID_PATTERN.test(id) || id.length > WORKFLOW_LIMITS.maxFrameworkLength;
      }),
      { numRuns: 200 }
    );
  });

  it('rejects framework IDs exceeding max length', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{65,128}$/), (longId) => {
        const result = OrchestrationFrameworkSchema.safeParse(longId);
        return !result.success;
      }),
      { numRuns: 100 }
    );
  });

  it('framework grammar is case-sensitive (lowercase only)', () => {
    fc.assert(
      fc.property(validFrameworkId, (id) => {
        // Valid ID should pass
        const lowerResult = FRAMEWORK_ID_PATTERN.test(id);
        // Uppercased version should fail (unless already single char)
        const upper = id.toUpperCase();
        const upperResult = FRAMEWORK_ID_PATTERN.test(upper);
        // If they differ in case, upper must fail
        if (id !== upper) {
          return lowerResult && !upperResult;
        }
        return true;
      }),
      { numRuns: 200 }
    );
  });
});

// -----------------------------------------------------------------------------
// Property Tests: Workflow/Step ID Formats
// -----------------------------------------------------------------------------

describe('workflow/step ID formats - property tests', () => {
  it('valid workflow IDs match pattern', () => {
    fc.assert(
      fc.property(validWorkflowId, (id) => {
        return WORKFLOW_ID_PATTERN.test(id);
      }),
      { numRuns: 300 }
    );
  });

  it('valid workflow IDs pass Zod schema', () => {
    fc.assert(
      fc.property(validWorkflowId, (id) => {
        return WorkflowIdSchema.safeParse(id).success;
      }),
      { numRuns: 300 }
    );
  });

  it('valid step IDs match pattern', () => {
    fc.assert(
      fc.property(validStepId, (id) => {
        return STEP_ID_PATTERN.test(id);
      }),
      { numRuns: 300 }
    );
  });

  it('valid step IDs pass Zod schema', () => {
    fc.assert(
      fc.property(validStepId, (id) => {
        return StepIdSchema.safeParse(id).success;
      }),
      { numRuns: 300 }
    );
  });

  it('IDs without prefix are rejected', () => {
    fc.assert(
      fc.property(validUlidPayload, (payload) => {
        // Raw ULID without prefix should fail both patterns
        return !WORKFLOW_ID_PATTERN.test(payload) && !STEP_ID_PATTERN.test(payload);
      }),
      { numRuns: 200 }
    );
  });

  it('workflow IDs do not match step pattern and vice versa', () => {
    fc.assert(
      fc.property(fc.tuple(validWorkflowId, validStepId), ([wfId, stepId]) => {
        // Cross-pattern rejection: wf_ should not match step_ pattern
        const wfAsStep = STEP_ID_PATTERN.test(wfId);
        const stepAsWf = WORKFLOW_ID_PATTERN.test(stepId);
        return !wfAsStep && !stepAsWf;
      }),
      { numRuns: 200 }
    );
  });
});

// -----------------------------------------------------------------------------
// Property Tests: DAG Constraints
// -----------------------------------------------------------------------------

describe('DAG constraints - property tests', () => {
  it('non-self-parent contexts have valid DAG semantics', () => {
    fc.assert(
      fc.property(
        validWorkflowId,
        validStepId,
        fc.array(validStepId, { minLength: 0, maxLength: 5 }),
        (wfId, stepId, parentIds) => {
          // Filter out the step itself to guarantee no self-parent
          const filteredParents = parentIds.filter((p) => p !== stepId);
          // Deduplicate
          const uniqueParents = [...new Set(filteredParents)];

          const ctx = {
            workflow_id: wfId,
            step_id: stepId,
            parent_step_ids: uniqueParents,
          };

          return hasValidDagSemantics(ctx);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('self-parent always fails DAG semantics', () => {
    fc.assert(
      fc.property(validWorkflowId, validStepId, (wfId, stepId) => {
        const ctx = {
          workflow_id: wfId,
          step_id: stepId,
          parent_step_ids: [stepId], // Self-parent
        };

        return !hasValidDagSemantics(ctx);
      }),
      { numRuns: 200 }
    );
  });

  it('duplicate parents fail DAG semantics', () => {
    fc.assert(
      fc.property(validWorkflowId, validStepId, validStepId, (wfId, stepId, parentId) => {
        // Skip if parentId equals stepId (that's a self-parent, different rule)
        if (parentId === stepId) return true;

        const ctx = {
          workflow_id: wfId,
          step_id: stepId,
          parent_step_ids: [parentId, parentId], // Duplicate
        };

        return !hasValidDagSemantics(ctx);
      }),
      { numRuns: 200 }
    );
  });

  it('empty parent_step_ids always passes (root step)', () => {
    fc.assert(
      fc.property(validWorkflowId, validStepId, (wfId, stepId) => {
        const ctx = {
          workflow_id: wfId,
          step_id: stepId,
          parent_step_ids: [],
        };

        return hasValidDagSemantics(ctx);
      }),
      { numRuns: 200 }
    );
  });
});

// -----------------------------------------------------------------------------
// Property Tests: Boundary Coverage (Limits)
// -----------------------------------------------------------------------------

describe('boundary coverage - property tests', () => {
  it('accepts exactly maxParentSteps (16) parents', () => {
    fc.assert(
      fc.property(
        validWorkflowId,
        validStepId,
        fc.array(validStepId, { minLength: 16, maxLength: 16 }),
        (wfId, stepId, parentIds) => {
          // Ensure all parents are unique and none equal stepId
          const uniqueParents = [...new Set(parentIds.filter((p) => p !== stepId))];
          // Only test when we have exactly 16 unique non-self parents
          if (uniqueParents.length !== WORKFLOW_LIMITS.maxParentSteps) return true;

          const result = WorkflowContextSchema.safeParse({
            workflow_id: wfId,
            step_id: stepId,
            parent_step_ids: uniqueParents,
          });

          return result.success;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('rejects maxParentSteps + 1 (17) parents', () => {
    fc.assert(
      fc.property(
        validWorkflowId,
        validStepId,
        fc.array(validStepId, { minLength: 17, maxLength: 17 }),
        (wfId, stepId, parentIds) => {
          // Ensure all parents are unique and none equal stepId
          const uniqueParents = [...new Set(parentIds.filter((p) => p !== stepId))];
          // Only test when we have exactly 17 unique non-self parents
          if (uniqueParents.length !== WORKFLOW_LIMITS.maxParentSteps + 1) return true;

          const result = WorkflowContextSchema.safeParse({
            workflow_id: wfId,
            step_id: stepId,
            parent_step_ids: uniqueParents,
          });

          return !result.success;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('accepts framework at exactly maxFrameworkLength (64) characters', () => {
    // Generate exactly 64-char framework IDs: 1 leading [a-z] + 63 trailing [a-z0-9_-]
    const exactMaxFramework = fc.stringMatching(/^[a-z][a-z0-9_-]{63}$/);

    fc.assert(
      fc.property(validWorkflowId, validStepId, exactMaxFramework, (wfId, stepId, framework) => {
        if (framework.length !== WORKFLOW_LIMITS.maxFrameworkLength) return true;

        const result = WorkflowContextSchema.safeParse({
          workflow_id: wfId,
          step_id: stepId,
          parent_step_ids: [],
          framework,
        });

        return result.success;
      }),
      { numRuns: 200 }
    );
  });

  it('rejects framework at maxFrameworkLength + 1 (65) characters', () => {
    // Generate exactly 65-char framework IDs
    const overMaxFramework = fc.stringMatching(/^[a-z][a-z0-9_-]{64}$/);

    fc.assert(
      fc.property(validWorkflowId, validStepId, overMaxFramework, (wfId, stepId, framework) => {
        if (framework.length !== WORKFLOW_LIMITS.maxFrameworkLength + 1) return true;

        const result = WorkflowContextSchema.safeParse({
          workflow_id: wfId,
          step_id: stepId,
          parent_step_ids: [],
          framework,
        });

        return !result.success;
      }),
      { numRuns: 200 }
    );
  });

  it('accepts tool_name at exactly maxToolNameLength (256) characters', () => {
    fc.assert(
      fc.property(validWorkflowId, validStepId, (wfId, stepId) => {
        const toolName = 'a'.repeat(WORKFLOW_LIMITS.maxToolNameLength);

        const result = WorkflowContextSchema.safeParse({
          workflow_id: wfId,
          step_id: stepId,
          parent_step_ids: [],
          tool_name: toolName,
        });

        return result.success;
      }),
      { numRuns: 100 }
    );
  });

  it('rejects tool_name at maxToolNameLength + 1 (257) characters', () => {
    fc.assert(
      fc.property(validWorkflowId, validStepId, (wfId, stepId) => {
        const toolName = 'a'.repeat(WORKFLOW_LIMITS.maxToolNameLength + 1);

        const result = WorkflowContextSchema.safeParse({
          workflow_id: wfId,
          step_id: stepId,
          parent_step_ids: [],
          tool_name: toolName,
        });

        return !result.success;
      }),
      { numRuns: 100 }
    );
  });
});

// -----------------------------------------------------------------------------
// Property Tests: WorkflowContext Schema Round-Trip
// -----------------------------------------------------------------------------

describe('WorkflowContext schema - property tests', () => {
  it('valid minimal context passes schema', () => {
    fc.assert(
      fc.property(validWorkflowId, validStepId, (wfId, stepId) => {
        const result = WorkflowContextSchema.safeParse({
          workflow_id: wfId,
          step_id: stepId,
          parent_step_ids: [],
        });

        return result.success;
      }),
      { numRuns: 300 }
    );
  });

  it('valid context with framework passes schema', () => {
    fc.assert(
      fc.property(validWorkflowId, validStepId, validFrameworkId, (wfId, stepId, framework) => {
        const result = WorkflowContextSchema.safeParse({
          workflow_id: wfId,
          step_id: stepId,
          parent_step_ids: [],
          framework,
        });

        return result.success;
      }),
      { numRuns: 200 }
    );
  });

  it('schema parse is idempotent for valid inputs', () => {
    fc.assert(
      fc.property(validWorkflowId, validStepId, (wfId, stepId) => {
        const input = {
          workflow_id: wfId,
          step_id: stepId,
          parent_step_ids: [],
        };

        const first = WorkflowContextSchema.safeParse(input);
        if (!first.success) return false;

        const second = WorkflowContextSchema.safeParse(first.data);
        if (!second.success) return false;

        return JSON.stringify(first.data) === JSON.stringify(second.data);
      }),
      { numRuns: 200 }
    );
  });

  it('schema rejects unknown fields (strict mode)', () => {
    fc.assert(
      fc.property(
        validWorkflowId,
        validStepId,
        fc.string({ minLength: 1, maxLength: 20 }),
        (wfId, stepId, extraValue) => {
          const result = WorkflowContextSchema.safeParse({
            workflow_id: wfId,
            step_id: stepId,
            parent_step_ids: [],
            unknown_extra_field: extraValue,
          });

          return !result.success;
        }
      ),
      { numRuns: 100 }
    );
  });
});
