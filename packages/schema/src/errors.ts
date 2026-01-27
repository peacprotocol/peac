/**
 * PEAC Structured Error Model
 *
 * Standardized error responses for protocol failures.
 * See docs/specs/ERRORS.md for complete error registry.
 */

/**
 * Canonical error categories from specs/kernel/errors.json (single source of truth).
 * This list MUST match the categories in errors.json and the ErrorDefinition.category
 * union in packages/kernel/src/types.ts. The codegen script cross-validates at generation time.
 */
export const ERROR_CATEGORIES_CANONICAL = [
  'validation', // Schema/structure validation failures
  'verification', // Signature/authentication failures
  'infrastructure', // Network/transport failures
  'control', // Authorization/access control failures
  'attribution', // Attribution attestation failures
  'identity', // Agent identity attestation failures
  'dispute', // Dispute attestation failures
  'bundle', // Dispute bundle verification failures
  'ucp', // UCP (Universal Commerce Protocol) mapping failures
  'workflow', // Workflow correlation failures
] as const;

/**
 * Error category - broad classification of error type.
 * Categories match specs/kernel/errors.json (normative).
 */
export type ErrorCategory = (typeof ERROR_CATEGORIES_CANONICAL)[number];

/**
 * Error severity
 */
export type ErrorSeverity = 'error' | 'warning';

/**
 * Structured PEAC error
 *
 * Provides machine-readable error information with:
 * - Stable error codes
 * - Category classification
 * - Retryability hints
 * - Remediation guidance
 */
export interface PEACError {
  /**
   * Error code
   *
   * Stable identifier for this error type.
   * See docs/specs/ERRORS.md for registry.
   *
   * Examples:
   * - "E_CONTROL_REQUIRED"
   * - "E_INVALID_SIGNATURE"
   * - "E_SSRF_BLOCKED"
   * - "E_DPOP_REPLAY"
   */
  code: string;

  /**
   * Error category
   *
   * Broad classification for programmatic handling.
   */
  category: ErrorCategory;

  /**
   * Error severity
   *
   * - "error": Operation failed, cannot proceed
   * - "warning": Operation succeeded but with caveats
   */
  severity: ErrorSeverity;

  /**
   * Whether the operation is retryable
   *
   * - true: Client should retry (network, rate limit, transient)
   * - false: Client should not retry (validation, security, permanent)
   */
  retryable: boolean;

  /**
   * Suggested HTTP status code
   *
   * Maps error to appropriate HTTP response code.
   * Examples:
   * - 400: Validation errors
   * - 401: Verification failures (signature, attestation temporal)
   * - 403: Control denials (authorization)
   * - 502: Infrastructure failures (JWKS fetch, etc.)
   */
  http_status?: number;

  /**
   * JSON Pointer (RFC 6901) to problematic field
   *
   * Identifies the specific field that caused the error.
   * Examples:
   * - "/auth/control" - Missing control block
   * - "/evidence/payment/amount" - Invalid amount
   * - "/auth/control/chain/0/result" - Invalid result value
   */
  pointer?: string;

  /**
   * Human-readable remediation guidance
   *
   * Short hint for fixing the error.
   * Examples:
   * - "Add control{} block when payment{} is present"
   * - "Ensure JWS signature is valid"
   * - "Retry after 60 seconds"
   */
  remediation?: string;

  /**
   * Implementation-specific error details
   *
   * Additional context for debugging.
   * Structure varies by error code.
   */
  details?: unknown;
}

/**
 * Error code registry
 *
 * Well-known error codes. See docs/specs/ERRORS.md for complete list.
 */
export const ERROR_CODES = {
  // Validation errors (400)
  E_CONTROL_REQUIRED: 'E_CONTROL_REQUIRED',
  E_INVALID_ENVELOPE: 'E_INVALID_ENVELOPE',
  E_INVALID_CONTROL_CHAIN: 'E_INVALID_CONTROL_CHAIN',
  E_INVALID_PAYMENT: 'E_INVALID_PAYMENT',
  E_INVALID_POLICY_HASH: 'E_INVALID_POLICY_HASH',
  E_EXPIRED_RECEIPT: 'E_EXPIRED_RECEIPT',
  E_EVIDENCE_NOT_JSON: 'E_EVIDENCE_NOT_JSON',

  // Verification errors (401)
  E_INVALID_SIGNATURE: 'E_INVALID_SIGNATURE',
  E_SSRF_BLOCKED: 'E_SSRF_BLOCKED',
  E_DPOP_REPLAY: 'E_DPOP_REPLAY',
  E_DPOP_INVALID: 'E_DPOP_INVALID',

  // Control errors (403)
  E_CONTROL_DENIED: 'E_CONTROL_DENIED',

  // Infrastructure errors (502/503)
  E_JWKS_FETCH_FAILED: 'E_JWKS_FETCH_FAILED',
  E_POLICY_FETCH_FAILED: 'E_POLICY_FETCH_FAILED',
  E_NETWORK_ERROR: 'E_NETWORK_ERROR',

  // Workflow errors (400)
  E_WORKFLOW_CONTEXT_INVALID: 'E_WORKFLOW_CONTEXT_INVALID',
  E_WORKFLOW_DAG_INVALID: 'E_WORKFLOW_DAG_INVALID',
  E_WORKFLOW_LIMIT_EXCEEDED: 'E_WORKFLOW_LIMIT_EXCEEDED',
  E_WORKFLOW_ID_INVALID: 'E_WORKFLOW_ID_INVALID',
  E_WORKFLOW_STEP_ID_INVALID: 'E_WORKFLOW_STEP_ID_INVALID',
  E_WORKFLOW_PARENT_NOT_FOUND: 'E_WORKFLOW_PARENT_NOT_FOUND',
  E_WORKFLOW_SUMMARY_INVALID: 'E_WORKFLOW_SUMMARY_INVALID',
  E_WORKFLOW_CYCLE_DETECTED: 'E_WORKFLOW_CYCLE_DETECTED',
} as const;

/**
 * Error code type
 */
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Helper to create a structured error
 */
export function createPEACError(
  code: ErrorCode,
  category: ErrorCategory,
  severity: ErrorSeverity,
  retryable: boolean,
  options?: {
    http_status?: number;
    pointer?: string;
    remediation?: string;
    details?: unknown;
  }
): PEACError {
  return {
    code,
    category,
    severity,
    retryable,
    ...options,
  };
}

/**
 * Create an evidence validation error
 *
 * Used when evidence contains non-JSON-safe values like NaN, Infinity,
 * undefined, Date, Map, Set, BigInt, functions, or class instances.
 */
export function createEvidenceNotJsonError(message: string, path?: (string | number)[]): PEACError {
  return createPEACError(ERROR_CODES.E_EVIDENCE_NOT_JSON, 'validation', 'error', false, {
    http_status: 400,
    pointer: path ? '/' + path.join('/') : undefined,
    remediation:
      'Ensure evidence contains only JSON-safe values (strings, finite numbers, booleans, null, arrays, plain objects)',
    details: { message },
  });
}

// ============================================================================
// Workflow Error Helpers (v0.10.2+)
// ============================================================================

/**
 * Create a workflow context validation error
 *
 * Used when workflow_context does not conform to WorkflowContextSchema.
 */
export function createWorkflowContextInvalidError(details?: string): PEACError {
  return createPEACError(ERROR_CODES.E_WORKFLOW_CONTEXT_INVALID, 'validation', 'error', false, {
    http_status: 400,
    pointer: '/ext/org.peacprotocol~1workflow',
    remediation: 'Ensure workflow_context conforms to WorkflowContextSchema',
    details: { message: details ?? 'Invalid workflow context' },
  });
}

/**
 * Create a workflow DAG validation error
 *
 * Used when workflow DAG semantics are violated (self-parent, duplicate parents, cycle).
 */
export function createWorkflowDagInvalidError(
  reason: 'self_parent' | 'duplicate_parent' | 'cycle'
): PEACError {
  const messages = {
    self_parent: 'Step cannot be its own parent',
    duplicate_parent: 'Parent step IDs must be unique',
    cycle: 'Workflow DAG contains a cycle',
  };
  return createPEACError(ERROR_CODES.E_WORKFLOW_DAG_INVALID, 'validation', 'error', false, {
    http_status: 400,
    pointer: '/ext/org.peacprotocol~1workflow/parent_step_ids',
    remediation: 'Ensure workflow forms a valid directed acyclic graph (DAG)',
    details: { reason, message: messages[reason] },
  });
}
