/**
 * @peac/adapter-openclaw - OpenClaw Types
 *
 * Types for OpenClaw tool call events and PEAC integration.
 */

// =============================================================================
// OpenClaw Event Types (Input from OpenClaw)
// =============================================================================

/**
 * OpenClaw tool call event - represents a single tool invocation.
 *
 * This is the input format from OpenClaw hooks (after_tool_call, etc.).
 */
export interface OpenClawToolCallEvent {
  /** OpenClaw's internal tool call ID */
  tool_call_id: string;

  /** Run ID (conversation/session scope) */
  run_id: string;

  /** Session key (optional, for workflow correlation) */
  session_key?: string;

  /** Tool name */
  tool_name: string;

  /** Tool provider (e.g., "builtin", "mcp", "custom") */
  tool_provider?: string;

  /** Tool version (if versioned) */
  tool_version?: string;

  /** Input parameters (JSON-serializable) */
  input: unknown;

  /** Output result (JSON-serializable) */
  output?: unknown;

  /** Execution start time (RFC 3339) */
  started_at: string;

  /** Execution end time (RFC 3339) */
  completed_at?: string;

  /** Duration in milliseconds (from monotonic clock) */
  duration_ms?: number;

  /** Execution status */
  status: 'ok' | 'error' | 'timeout' | 'canceled';

  /** Error code (if status is error) */
  error_code?: string;

  /** Error message (if status is error) */
  error_message?: string;

  /** Whether the error is retryable */
  retryable?: boolean;

  /** Policy context at execution time */
  policy?: OpenClawPolicyContext;

  /** OpenClaw-specific context */
  context?: OpenClawContext;
}

/**
 * OpenClaw policy context at execution time.
 */
export interface OpenClawPolicyContext {
  /** Policy decision (allow/deny/constrained) */
  decision: 'allow' | 'deny' | 'constrained';

  /** Whether sandbox mode was enabled */
  sandbox_enabled?: boolean;

  /** Whether elevated permissions were used */
  elevated?: boolean;

  /** Hash of the effective policy (for audit) */
  policy_hash?: string;
}

/**
 * OpenClaw-specific context (channel, workspace, etc.).
 */
export interface OpenClawContext {
  /** Channel information */
  channel?: {
    kind: 'direct' | 'group' | 'api';
    id?: string;
  };

  /** Workspace configuration hash */
  workspace_digest?: string;

  /** OpenClaw gateway version */
  gateway_version?: string;

  /** Security audit digest (hash of full audit report) */
  audit_digest?: string;
}

// =============================================================================
// Adapter Configuration
// =============================================================================

/**
 * OpenClaw adapter configuration.
 */
export interface OpenClawAdapterConfig {
  /** Platform identifier (default: "openclaw") */
  platform?: string;

  /** Platform version (e.g., "0.2.0") */
  platform_version?: string;

  /** Plugin ID for provenance tracking */
  plugin_id?: string;

  /** Plugin digest for integrity verification */
  plugin_digest?: string;

  /** Capture mode configuration */
  capture?: {
    /** Redaction mode for payloads */
    mode: 'hash_only' | 'allowlist';

    /** Tool names for plaintext capture (only when mode=allowlist) */
    allowlist?: string[];

    /** Maximum payload size to hash (bytes, default: 1MB) */
    max_payload_size?: number;
  };

  /** Signing configuration (for background emitter) */
  signing?: {
    /** Key reference (env var, keychain path, sidecar socket) */
    key_ref: string;

    /** Issuer URI */
    issuer: string;

    /** Audience URI (optional) */
    audience?: string;
  };

  /** Correlation options */
  correlation?: {
    /** Include workflow context from session */
    include_workflow?: boolean;

    /** Include agent identity attestation */
    include_identity?: boolean;

    /** Reference to identity attestation */
    identity_attestation_ref?: string;
  };
}

// =============================================================================
// Mapper Output Types
// =============================================================================

/**
 * Result of mapping an OpenClaw event to a CapturedAction.
 * Includes validation status and any warnings.
 */
export interface MappingResult {
  /** Whether the mapping succeeded */
  success: boolean;

  /** The mapped action (if success) */
  action?: import('@peac/capture-core').CapturedAction;

  /** Error code (if failed) */
  error_code?: string;

  /** Error message (if failed) */
  error_message?: string;

  /** Warnings (non-fatal issues) */
  warnings?: MappingWarning[];
}

/**
 * Mapping warning (non-fatal issue).
 */
export interface MappingWarning {
  code: string;
  message: string;
  field?: string;
}

// =============================================================================
// Emitter Types
// =============================================================================

/**
 * Receipt emitter interface.
 *
 * Responsible for converting captured actions to signed PEAC receipts.
 */
export interface ReceiptEmitter {
  /** Emit a receipt from a spool entry */
  emit(entry: import('@peac/capture-core').SpoolEntry): Promise<EmitResult>;

  /** Flush any pending receipts */
  flush(): Promise<void>;

  /** Close the emitter */
  close(): Promise<void>;
}

/**
 * Result of emitting a receipt.
 */
export interface EmitResult {
  /** Whether emission succeeded */
  success: boolean;

  /** Receipt file path (if success) */
  receipt_path?: string;

  /** Receipt ID (rid) */
  receipt_id?: string;

  /** Error code (if failed) */
  error_code?: string;

  /** Error message (if failed) */
  error_message?: string;
}

// =============================================================================
// OpenClaw Extension Keys (for nested extensions)
// =============================================================================

/**
 * OpenClaw-specific extension keys used in interaction.extensions.
 */
export const OPENCLAW_EXTENSION_KEYS = {
  /** OpenClaw context extension */
  CONTEXT: 'org.openclaw/context',

  /** Security audit digest */
  AUDIT_DIGEST: 'org.openclaw/audit_digest',
} as const;

/**
 * OpenClaw context extension data.
 */
export interface OpenClawContextExtension {
  channel?: {
    kind: 'direct' | 'group' | 'api';
    id?: string;
  };
  workspace_digest?: string;
  tool_call_id?: string;
  gateway_version?: string;
}

// =============================================================================
// Error Codes
// =============================================================================

/**
 * OpenClaw adapter error codes.
 */
export const OPENCLAW_ERROR_CODES = {
  /** Missing required field in OpenClaw event */
  MISSING_FIELD: 'E_OPENCLAW_MISSING_FIELD',

  /** Invalid field value in OpenClaw event */
  INVALID_FIELD: 'E_OPENCLAW_INVALID_FIELD',

  /** Payload serialization failed */
  SERIALIZATION_FAILED: 'E_OPENCLAW_SERIALIZATION_FAILED',

  /** Signing failed */
  SIGNING_FAILED: 'E_OPENCLAW_SIGNING_FAILED',

  /** Emitter not configured */
  EMITTER_NOT_CONFIGURED: 'E_OPENCLAW_EMITTER_NOT_CONFIGURED',
} as const;

export type OpenClawErrorCode = (typeof OPENCLAW_ERROR_CODES)[keyof typeof OPENCLAW_ERROR_CODES];

// =============================================================================
// Warning Codes
// =============================================================================

/**
 * OpenClaw adapter warning codes.
 */
export const OPENCLAW_WARNING_CODES = {
  /** Payload exceeded size limit and was truncated for hashing */
  PAYLOAD_TRUNCATED: 'W_OPENCLAW_PAYLOAD_TRUNCATED',

  /** Payload serialization failed (circular refs, BigInt, etc.) */
  SERIALIZATION_FAILED: 'W_OPENCLAW_SERIALIZATION_FAILED',

  /** Optional field missing (non-critical) */
  OPTIONAL_FIELD_MISSING: 'W_OPENCLAW_OPTIONAL_FIELD_MISSING',

  /** Unknown tool provider */
  UNKNOWN_PROVIDER: 'W_OPENCLAW_UNKNOWN_PROVIDER',

  /** Payload dropped due to redaction policy (hash_only mode for non-allowlisted tool) */
  PAYLOAD_REDACTED: 'W_OPENCLAW_PAYLOAD_REDACTED',
} as const;

export type OpenClawWarningCode =
  (typeof OPENCLAW_WARNING_CODES)[keyof typeof OPENCLAW_WARNING_CODES];
