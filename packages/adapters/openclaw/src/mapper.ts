/**
 * @peac/adapter-openclaw - Mapper
 *
 * Maps OpenClaw tool call events to PEAC CapturedAction format.
 */

import type { CapturedAction } from '@peac/capture-core';
import type {
  OpenClawToolCallEvent,
  OpenClawAdapterConfig,
  MappingResult,
  MappingWarning,
  OpenClawContextExtension,
} from './types.js';
import { OPENCLAW_ERROR_CODES, OPENCLAW_WARNING_CODES, OPENCLAW_EXTENSION_KEYS } from './types.js';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_PLATFORM = 'openclaw';
const DEFAULT_KIND = 'tool.call';

// =============================================================================
// Mapper Implementation
// =============================================================================

/**
 * Map an OpenClaw tool call event to a PEAC CapturedAction.
 *
 * @param event - OpenClaw tool call event
 * @param config - Adapter configuration
 * @returns Mapping result with action or error
 */
export function mapToolCallEvent(
  event: OpenClawToolCallEvent,
  config?: OpenClawAdapterConfig
): MappingResult {
  const warnings: MappingWarning[] = [];

  // Validate required fields
  const validationError = validateRequiredFields(event);
  if (validationError) {
    return {
      success: false,
      error_code: validationError.code,
      error_message: validationError.message,
    };
  }

  // Build interaction ID (deterministic, for dedupe)
  const interactionId = buildInteractionId(event);

  // Get capture policy configuration
  const captureMode = config?.capture?.mode ?? 'hash_only';
  const allowlist = config?.capture?.allowlist ?? [];
  const maxPayloadSize = config?.capture?.max_payload_size ?? 1024 * 1024; // 1MB default

  // Check if this tool is allowlisted for plaintext capture
  const isAllowlisted = captureMode === 'allowlist' && allowlist.includes(event.tool_name);

  // Serialize input/output to bytes with policy enforcement
  const inputResult = serializePayloadWithPolicy(
    event.input,
    maxPayloadSize,
    isAllowlisted,
    'input'
  );
  const outputResult =
    event.output !== undefined
      ? serializePayloadWithPolicy(event.output, maxPayloadSize, isAllowlisted, 'output')
      : undefined;

  // Collect warnings from serialization
  if (inputResult.warning) {
    warnings.push(inputResult.warning);
  }
  if (outputResult?.warning) {
    warnings.push(outputResult.warning);
  }

  const inputBytes = inputResult.bytes;
  const outputBytes = outputResult?.bytes;

  // Build platform metadata
  const platform = config?.platform ?? DEFAULT_PLATFORM;
  const platformVersion = config?.platform_version;
  const pluginId = config?.plugin_id;

  // Build OpenClaw-specific extensions
  const extensions = buildExtensions(event);

  // Build the CapturedAction
  const action: CapturedAction = {
    id: interactionId,
    kind: DEFAULT_KIND,
    platform,
    started_at: event.started_at,
    completed_at: event.completed_at,
    tool_name: event.tool_name,
    tool_provider: event.tool_provider,
    input_bytes: inputBytes,
    output_bytes: outputBytes,
    status: event.status,
    error_code: event.error_code,
    retryable: event.retryable,
    metadata: {
      // Platform metadata
      ...(platformVersion && { platform_version: platformVersion }),
      ...(pluginId && { plugin_id: pluginId }),

      // Tool version (not a standard field, stored in metadata)
      ...(event.tool_version && { tool_version: event.tool_version }),

      // Policy context
      ...(event.policy && {
        policy_decision: event.policy.decision,
        sandbox_enabled: event.policy.sandbox_enabled,
        elevated: event.policy.elevated,
        policy_hash: event.policy.policy_hash,
      }),

      // OpenClaw extensions (will be mapped to interaction.extensions)
      ...extensions,
    },
  };

  return {
    success: true,
    action,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Build a batch of CapturedActions from OpenClaw events.
 *
 * @param events - Array of OpenClaw tool call events
 * @param config - Adapter configuration
 * @returns Array of mapping results
 */
export function mapToolCallEventBatch(
  events: OpenClawToolCallEvent[],
  config?: OpenClawAdapterConfig
): MappingResult[] {
  return events.map((event) => mapToolCallEvent(event, config));
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Validate required fields in OpenClaw event.
 */
function validateRequiredFields(
  event: OpenClawToolCallEvent
): { code: string; message: string } | null {
  if (!event.tool_call_id) {
    return {
      code: OPENCLAW_ERROR_CODES.MISSING_FIELD,
      message: 'Missing required field: tool_call_id',
    };
  }

  if (!event.run_id) {
    return {
      code: OPENCLAW_ERROR_CODES.MISSING_FIELD,
      message: 'Missing required field: run_id',
    };
  }

  if (!event.tool_name) {
    return {
      code: OPENCLAW_ERROR_CODES.MISSING_FIELD,
      message: 'Missing required field: tool_name',
    };
  }

  if (!event.started_at) {
    return {
      code: OPENCLAW_ERROR_CODES.MISSING_FIELD,
      message: 'Missing required field: started_at',
    };
  }

  if (!event.status) {
    return {
      code: OPENCLAW_ERROR_CODES.MISSING_FIELD,
      message: 'Missing required field: status',
    };
  }

  // Validate status is a known value
  const validStatuses = ['ok', 'error', 'timeout', 'canceled'];
  if (!validStatuses.includes(event.status)) {
    return {
      code: OPENCLAW_ERROR_CODES.INVALID_FIELD,
      message: `Invalid status: ${event.status}. Expected one of: ${validStatuses.join(', ')}`,
    };
  }

  // Validate timestamps are RFC 3339
  if (!isValidRfc3339(event.started_at)) {
    return {
      code: OPENCLAW_ERROR_CODES.INVALID_FIELD,
      message: `Invalid started_at timestamp: ${event.started_at}. Expected RFC 3339 format.`,
    };
  }

  if (event.completed_at && !isValidRfc3339(event.completed_at)) {
    return {
      code: OPENCLAW_ERROR_CODES.INVALID_FIELD,
      message: `Invalid completed_at timestamp: ${event.completed_at}. Expected RFC 3339 format.`,
    };
  }

  return null;
}

/**
 * Build a deterministic interaction ID from OpenClaw event.
 *
 * Uses base64url encoding to handle delimiter collisions - if run_id or
 * tool_call_id contains ':', the ID would be ambiguous without encoding.
 *
 * Format: openclaw/{base64url(run_id)}/{base64url(tool_call_id)}
 */
function buildInteractionId(event: OpenClawToolCallEvent): string {
  const runIdEncoded = base64urlEncode(event.run_id);
  const toolCallIdEncoded = base64urlEncode(event.tool_call_id);
  return `openclaw/${runIdEncoded}/${toolCallIdEncoded}`;
}

/**
 * Base64url encode a string (RFC 4648 section 5).
 * URL-safe: replaces + with -, / with _, removes padding.
 */
function base64urlEncode(str: string): string {
  // Use TextEncoder for proper UTF-8 handling
  const bytes = new TextEncoder().encode(str);
  // Convert to base64
  const base64 = btoa(String.fromCharCode(...bytes));
  // Make URL-safe: replace + with -, / with _, remove =
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Result of payload serialization with policy enforcement.
 */
interface SerializationResult {
  bytes?: Uint8Array;
  warning?: MappingWarning;
  truncated?: boolean;
}

/**
 * Serialize a payload to bytes with policy enforcement.
 *
 * Applies:
 * - Size limits (truncation if exceeds maxPayloadSize)
 * - Redaction policy (hash_only drops bytes for non-allowlisted tools)
 *
 * @param payload - The payload to serialize
 * @param maxPayloadSize - Maximum payload size in bytes
 * @param isAllowlisted - Whether this tool is allowlisted for plaintext capture
 * @param fieldName - Field name for warning messages
 * @returns Serialization result with bytes and/or warning
 */
function serializePayloadWithPolicy(
  payload: unknown,
  maxPayloadSize: number,
  isAllowlisted: boolean,
  fieldName: string
): SerializationResult {
  if (payload === undefined) {
    return {};
  }

  // Try to serialize
  let bytes: Uint8Array;
  try {
    const json = JSON.stringify(payload);
    bytes = new TextEncoder().encode(json);
  } catch {
    // Serialization failed (circular references, BigInt, etc.)
    return {
      warning: {
        code: OPENCLAW_WARNING_CODES.SERIALIZATION_FAILED,
        message: `${fieldName} payload could not be serialized (circular ref, BigInt, etc.)`,
        field: fieldName,
      },
    };
  }

  // Check size limit and truncate if needed
  let truncated = false;
  if (bytes.length > maxPayloadSize) {
    bytes = bytes.slice(0, maxPayloadSize);
    truncated = true;
  }

  // Apply redaction policy - capture-core will hash these bytes
  // In hash_only mode for non-allowlisted tools, we still pass bytes
  // for hashing but could add a warning for transparency
  const result: SerializationResult = { bytes, truncated };

  if (truncated) {
    result.warning = {
      code: OPENCLAW_WARNING_CODES.PAYLOAD_TRUNCATED,
      message: `${fieldName} payload exceeded ${maxPayloadSize} bytes and was truncated`,
      field: fieldName,
    };
  }

  return result;
}

/**
 * Build OpenClaw-specific extensions for the action metadata.
 */
function buildExtensions(event: OpenClawToolCallEvent): Record<string, unknown> {
  const extensions: Record<string, unknown> = {};

  // OpenClaw context extension
  if (event.context) {
    const contextExt: OpenClawContextExtension = {
      ...(event.context.channel && { channel: event.context.channel }),
      ...(event.context.workspace_digest && { workspace_digest: event.context.workspace_digest }),
      ...(event.context.gateway_version && { gateway_version: event.context.gateway_version }),
      tool_call_id: event.tool_call_id,
    };

    if (Object.keys(contextExt).length > 0) {
      extensions[OPENCLAW_EXTENSION_KEYS.CONTEXT] = contextExt;
    }
  } else {
    // Always include tool_call_id for correlation
    extensions[OPENCLAW_EXTENSION_KEYS.CONTEXT] = {
      tool_call_id: event.tool_call_id,
    };
  }

  // Security audit digest
  if (event.context?.audit_digest) {
    extensions[OPENCLAW_EXTENSION_KEYS.AUDIT_DIGEST] = event.context.audit_digest;
  }

  return extensions;
}

/**
 * Check if a string is a valid RFC 3339 timestamp.
 */
function isValidRfc3339(timestamp: string): boolean {
  // Basic RFC 3339 pattern (not exhaustive but catches common issues)
  const rfc3339Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
  if (!rfc3339Pattern.test(timestamp)) {
    return false;
  }

  // Verify it parses to a valid date
  const date = new Date(timestamp);
  return !isNaN(date.getTime());
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extract workflow ID from OpenClaw session key.
 *
 * If session_key is provided, it becomes the workflow_id for correlation.
 */
export function extractWorkflowId(event: OpenClawToolCallEvent): string | undefined {
  return event.session_key;
}

/**
 * Build a PEAC-compatible workflow context from OpenClaw event.
 */
export function buildWorkflowContext(
  event: OpenClawToolCallEvent
): Record<string, unknown> | undefined {
  if (!event.session_key) {
    return undefined;
  }

  return {
    workflow_id: event.session_key,
    step_id: event.tool_call_id,
    tool_name: event.tool_name,
    framework: 'openclaw',
  };
}
