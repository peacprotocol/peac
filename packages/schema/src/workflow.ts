/**
 * PEAC Workflow Correlation Types (v0.10.2+)
 *
 * Workflow correlation primitives for multi-agent orchestration.
 * These types enable tracking and verification of multi-step agentic workflows
 * across different frameworks (MCP, A2A, CrewAI, LangGraph, etc.).
 *
 * Design principles:
 * - Non-breaking: Uses extensions mechanism (auth.extensions['org.peacprotocol/workflow'])
 * - DAG semantics: Parent linking for execution graph reconstruction
 * - Framework-agnostic: Works with any orchestration layer
 * - Deterministic: Supports offline verification and audit
 *
 * @see docs/specs/WORKFLOW-CORRELATION.md
 */

import { z } from 'zod';

// ============================================================================
// Constants
// ============================================================================

/**
 * Extension key for workflow context
 * Used in auth.extensions['org.peacprotocol/workflow']
 */
export const WORKFLOW_EXTENSION_KEY = 'org.peacprotocol/workflow';

/**
 * Attestation type for workflow summaries
 */
export const WORKFLOW_SUMMARY_TYPE = 'peac/workflow-summary' as const;

/**
 * Workflow status values
 */
export const WORKFLOW_STATUSES = ['in_progress', 'completed', 'failed', 'cancelled'] as const;

/**
 * Well-known orchestration frameworks (informational, not normative)
 *
 * The framework field accepts any string matching the framework grammar.
 * These well-known values are listed in the PEAC registries for interop.
 * New frameworks do NOT require protocol updates - just use the name.
 *
 * @see docs/specs/registries.json - orchestration_frameworks section
 */
export const WELL_KNOWN_FRAMEWORKS = [
  'mcp',
  'a2a',
  'crewai',
  'langgraph',
  'autogen',
  'custom',
] as const;

/**
 * @deprecated Use WELL_KNOWN_FRAMEWORKS instead. Kept for backwards compatibility.
 */
export const ORCHESTRATION_FRAMEWORKS = WELL_KNOWN_FRAMEWORKS;

/**
 * Framework identifier grammar pattern
 *
 * Lowercase letters, digits, hyphens, underscores.
 * Must start with a letter. Max 64 characters.
 * Examples: "mcp", "a2a", "crewai", "langgraph", "dspy", "smolagents"
 */
export const FRAMEWORK_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

/**
 * Workflow correlation limits (DoS protection)
 */
export const WORKFLOW_LIMITS = {
  /** Maximum parent steps per step (DAG fan-in) */
  maxParentSteps: 16,
  /** Maximum workflow ID length */
  maxWorkflowIdLength: 128,
  /** Maximum step ID length */
  maxStepIdLength: 128,
  /** Maximum tool name length */
  maxToolNameLength: 256,
  /** Maximum framework identifier length */
  maxFrameworkLength: 64,
  /** Maximum agents in a workflow summary */
  maxAgentsInvolved: 100,
  /** Maximum receipt refs in a workflow summary */
  maxReceiptRefs: 10000,
  /** Maximum error message length */
  maxErrorMessageLength: 1024,
} as const;

// ============================================================================
// ID Format Patterns
// ============================================================================

/**
 * Workflow ID format: wf_{ulid} or wf_{uuid}
 * Examples:
 * - wf_01HXYZ... (ULID)
 * - wf_550e8400-e29b-41d4-a716-446655440000 (UUID)
 */
export const WORKFLOW_ID_PATTERN = /^wf_[a-zA-Z0-9_-]{20,48}$/;

/**
 * Step ID format: step_{ulid} or step_{uuid}
 * Examples:
 * - step_01HXYZ... (ULID)
 * - step_550e8400-e29b-41d4-a716-446655440000 (UUID)
 */
export const STEP_ID_PATTERN = /^step_[a-zA-Z0-9_-]{20,48}$/;

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Workflow ID schema
 */
export const WorkflowIdSchema = z
  .string()
  .regex(WORKFLOW_ID_PATTERN, 'Invalid workflow ID format (expected wf_{ulid|uuid})')
  .max(WORKFLOW_LIMITS.maxWorkflowIdLength);

/**
 * Step ID schema
 */
export const StepIdSchema = z
  .string()
  .regex(STEP_ID_PATTERN, 'Invalid step ID format (expected step_{ulid|uuid})')
  .max(WORKFLOW_LIMITS.maxStepIdLength);

/**
 * Workflow status schema
 */
export const WorkflowStatusSchema = z.enum(WORKFLOW_STATUSES);

/**
 * Orchestration framework schema
 *
 * Open string field with constrained grammar. Any lowercase identifier
 * matching the framework grammar is valid. Well-known values are listed
 * in WELL_KNOWN_FRAMEWORKS and the PEAC registries.
 *
 * Grammar: /^[a-z][a-z0-9_-]*$/ (max 64 chars)
 */
export const OrchestrationFrameworkSchema = z
  .string()
  .regex(
    FRAMEWORK_ID_PATTERN,
    'Invalid framework identifier (must be lowercase alphanumeric with hyphens/underscores, starting with a letter)'
  )
  .max(WORKFLOW_LIMITS.maxFrameworkLength);

/**
 * Workflow context schema - attached to individual receipts
 *
 * This is the core primitive that links receipts into a workflow DAG.
 * Place in auth.extensions['org.peacprotocol/workflow']
 */
export const WorkflowContextSchema = z
  .object({
    // Correlation
    /** Globally unique workflow/run ID */
    workflow_id: WorkflowIdSchema,

    /** This step's unique ID */
    step_id: StepIdSchema,

    /** DAG parent step IDs (empty array for root step) */
    parent_step_ids: z.array(StepIdSchema).max(WORKFLOW_LIMITS.maxParentSteps).default([]),

    // Orchestration identity
    /** Agent identity ref of the orchestrator (optional) */
    orchestrator_id: z.string().max(256).optional(),

    /** Receipt ID that initiated this workflow (optional) */
    orchestrator_receipt_ref: z.string().max(256).optional(),

    // Sequencing (for linear workflows)
    /** 0-based position in sequential runs (optional) */
    step_index: z.number().int().nonnegative().optional(),

    /** Total steps if known upfront (optional) */
    step_total: z.number().int().positive().optional(),

    // Metadata
    /** Tool or skill name (MCP tool, A2A skill, etc.) */
    tool_name: z.string().max(WORKFLOW_LIMITS.maxToolNameLength).optional(),

    /** Orchestration framework */
    framework: OrchestrationFrameworkSchema.optional(),

    // Hash chain (for streaming/progressive receipts)
    /** SHA-256 hash of previous receipt in chain (for ordering) */
    prev_receipt_hash: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

/**
 * Error context for failed workflows
 */
export const WorkflowErrorContextSchema = z
  .object({
    /** Step ID where failure occurred */
    failed_step_id: StepIdSchema,

    /** Error code (E_* format preferred) */
    error_code: z.string().max(64),

    /** Human-readable error message */
    error_message: z.string().max(WORKFLOW_LIMITS.maxErrorMessageLength),
  })
  .strict();

/**
 * Workflow summary evidence - the "proof of run" artifact
 *
 * Used in peac/workflow-summary attestations.
 * This is the single handle auditors use to verify an entire workflow.
 */
export const WorkflowSummaryEvidenceSchema = z
  .object({
    /** Workflow ID this summary describes */
    workflow_id: WorkflowIdSchema,

    /** Workflow status */
    status: WorkflowStatusSchema,

    /** When the workflow started (ISO 8601) */
    started_at: z.string().datetime(),

    /** When the workflow completed (ISO 8601, undefined if in_progress) */
    completed_at: z.string().datetime().optional(),

    // Receipt commitment
    /** Ordered list of receipt IDs (for small workflows) */
    receipt_refs: z.array(z.string().max(256)).max(WORKFLOW_LIMITS.maxReceiptRefs).optional(),

    /** Merkle root of receipt digests (for large workflows, RFC 6962 style) */
    receipt_merkle_root: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .optional(),

    /** Total receipt count (required if using Merkle root) */
    receipt_count: z.number().int().nonnegative().optional(),

    // Orchestration
    /** Agent identity ref of the orchestrator */
    orchestrator_id: z.string().max(256),

    /** List of agent IDs involved in the workflow */
    agents_involved: z.array(z.string().max(256)).max(WORKFLOW_LIMITS.maxAgentsInvolved),

    // Outcome
    /** SHA-256 hash of final output artifact (optional) */
    final_result_hash: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .optional(),

    /** Error context if workflow failed */
    error_context: WorkflowErrorContextSchema.optional(),
  })
  .strict()
  .refine(
    (data) => {
      // Must have either receipt_refs or receipt_merkle_root (or both)
      return data.receipt_refs !== undefined || data.receipt_merkle_root !== undefined;
    },
    {
      message: 'Workflow summary must include receipt_refs or receipt_merkle_root',
    }
  )
  .refine(
    (data) => {
      // If using Merkle root, must include receipt_count
      if (data.receipt_merkle_root !== undefined && data.receipt_count === undefined) {
        return false;
      }
      return true;
    },
    {
      message: 'receipt_count is required when using receipt_merkle_root',
    }
  );

/**
 * Workflow summary attestation schema
 *
 * A signed attestation containing the workflow summary evidence.
 */
export const WorkflowSummaryAttestationSchema = z
  .object({
    /** Attestation type (must be 'peac/workflow-summary') */
    type: z.literal(WORKFLOW_SUMMARY_TYPE),

    /** Who issued this attestation (HTTPS URL) */
    issuer: z.string().url().startsWith('https://'),

    /** When this attestation was issued (ISO 8601) */
    issued_at: z.string().datetime(),

    /** When this attestation expires (ISO 8601, optional) */
    expires_at: z.string().datetime().optional(),

    /** The workflow summary evidence */
    evidence: WorkflowSummaryEvidenceSchema,
  })
  .strict();

// ============================================================================
// TypeScript Types (inferred from Zod schemas)
// ============================================================================

export type WorkflowId = z.infer<typeof WorkflowIdSchema>;
export type StepId = z.infer<typeof StepIdSchema>;
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;
export type OrchestrationFramework = z.infer<typeof OrchestrationFrameworkSchema>;
export type WorkflowContext = z.infer<typeof WorkflowContextSchema>;
export type WorkflowErrorContext = z.infer<typeof WorkflowErrorContextSchema>;
export type WorkflowSummaryEvidence = z.infer<typeof WorkflowSummaryEvidenceSchema>;
export type WorkflowSummaryAttestation = z.infer<typeof WorkflowSummaryAttestationSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a workflow ID with the wf_ prefix
 *
 * @param id - ULID or UUID payload (without prefix)
 * @returns Prefixed workflow ID
 */
export function createWorkflowId(id: string): WorkflowId {
  const workflowId = `wf_${id}`;
  return WorkflowIdSchema.parse(workflowId);
}

/**
 * Generate a step ID with the step_ prefix
 *
 * @param id - ULID or UUID payload (without prefix)
 * @returns Prefixed step ID
 */
export function createStepId(id: string): StepId {
  const stepId = `step_${id}`;
  return StepIdSchema.parse(stepId);
}

/**
 * Validate a workflow context object
 *
 * @param context - Object to validate
 * @returns Validated WorkflowContext
 * @throws ZodError if validation fails
 */
export function validateWorkflowContext(context: unknown): WorkflowContext {
  return WorkflowContextSchema.parse(context);
}

/**
 * Check if an object is a valid workflow context (non-throwing)
 *
 * @param context - Object to check
 * @returns True if valid WorkflowContext
 */
export function isValidWorkflowContext(context: unknown): context is WorkflowContext {
  return WorkflowContextSchema.safeParse(context).success;
}

/**
 * Validate a workflow summary attestation
 *
 * @param attestation - Object to validate
 * @returns Validated WorkflowSummaryAttestation
 * @throws ZodError if validation fails
 */
export function validateWorkflowSummaryAttestation(
  attestation: unknown
): WorkflowSummaryAttestation {
  return WorkflowSummaryAttestationSchema.parse(attestation);
}

/**
 * Check if an object is a workflow summary attestation (non-throwing)
 *
 * @param attestation - Object to check
 * @returns True if valid WorkflowSummaryAttestation
 */
export function isWorkflowSummaryAttestation(
  attestation: unknown
): attestation is WorkflowSummaryAttestation {
  return WorkflowSummaryAttestationSchema.safeParse(attestation).success;
}

/**
 * Check if a workflow summary is in a terminal state
 *
 * @param status - Workflow status
 * @returns True if completed, failed, or cancelled
 */
export function isTerminalWorkflowStatus(status: WorkflowStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

/**
 * Check if workflow context has valid DAG semantics (no self-parent)
 *
 * @param context - Workflow context to check
 * @returns True if DAG semantics are valid
 */
export function hasValidDagSemantics(context: WorkflowContext): boolean {
  // Step cannot be its own parent
  if (context.parent_step_ids.includes(context.step_id)) {
    return false;
  }
  // No duplicate parents
  const uniqueParents = new Set(context.parent_step_ids);
  if (uniqueParents.size !== context.parent_step_ids.length) {
    return false;
  }
  return true;
}

/**
 * Create a workflow context for attaching to a receipt
 *
 * @param params - Workflow context parameters
 * @returns Validated WorkflowContext
 */
export function createWorkflowContext(params: {
  workflow_id: string;
  step_id: string;
  parent_step_ids?: string[];
  orchestrator_id?: string;
  orchestrator_receipt_ref?: string;
  step_index?: number;
  step_total?: number;
  tool_name?: string;
  framework?: string;
  prev_receipt_hash?: string;
}): WorkflowContext {
  const context: WorkflowContext = {
    workflow_id: params.workflow_id as WorkflowId,
    step_id: params.step_id as StepId,
    parent_step_ids: (params.parent_step_ids ?? []) as StepId[],
    ...(params.orchestrator_id && { orchestrator_id: params.orchestrator_id }),
    ...(params.orchestrator_receipt_ref && {
      orchestrator_receipt_ref: params.orchestrator_receipt_ref,
    }),
    ...(params.step_index !== undefined && { step_index: params.step_index }),
    ...(params.step_total !== undefined && { step_total: params.step_total }),
    ...(params.tool_name && { tool_name: params.tool_name }),
    ...(params.framework && { framework: params.framework }),
    ...(params.prev_receipt_hash && { prev_receipt_hash: params.prev_receipt_hash }),
  };

  // Validate
  const validated = validateWorkflowContext(context);

  // Check DAG semantics
  if (!hasValidDagSemantics(validated)) {
    throw new Error(
      'Invalid DAG semantics: step cannot be its own parent or have duplicate parents'
    );
  }

  return validated;
}

/**
 * Create parameters for a workflow summary attestation
 */
export interface CreateWorkflowSummaryParams {
  workflow_id: string;
  status: WorkflowStatus;
  started_at: string;
  completed_at?: string;
  orchestrator_id: string;
  agents_involved: string[];
  receipt_refs?: string[];
  receipt_merkle_root?: string;
  receipt_count?: number;
  final_result_hash?: string;
  error_context?: WorkflowErrorContext;
  issuer: string;
  issued_at: string;
  expires_at?: string;
}

/**
 * Create a workflow summary attestation
 *
 * @param params - Attestation parameters
 * @returns Validated WorkflowSummaryAttestation
 */
export function createWorkflowSummaryAttestation(
  params: CreateWorkflowSummaryParams
): WorkflowSummaryAttestation {
  const attestation: WorkflowSummaryAttestation = {
    type: WORKFLOW_SUMMARY_TYPE,
    issuer: params.issuer,
    issued_at: params.issued_at,
    ...(params.expires_at && { expires_at: params.expires_at }),
    evidence: {
      workflow_id: params.workflow_id as WorkflowId,
      status: params.status,
      started_at: params.started_at,
      ...(params.completed_at && { completed_at: params.completed_at }),
      ...(params.receipt_refs && { receipt_refs: params.receipt_refs }),
      ...(params.receipt_merkle_root && { receipt_merkle_root: params.receipt_merkle_root }),
      ...(params.receipt_count !== undefined && { receipt_count: params.receipt_count }),
      orchestrator_id: params.orchestrator_id,
      agents_involved: params.agents_involved,
      ...(params.final_result_hash && { final_result_hash: params.final_result_hash }),
      ...(params.error_context && { error_context: params.error_context }),
    },
  };

  return validateWorkflowSummaryAttestation(attestation);
}
