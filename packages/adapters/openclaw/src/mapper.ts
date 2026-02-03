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

  // Serialize input/output to bytes
  const inputBytes = serializePayload(event.input);
  const outputBytes = event.output !== undefined ? serializePayload(event.output) : undefined;

  // Check for serialization warnings
  if (event.input !== undefined && inputBytes === undefined) {
    warnings.push({
      code: OPENCLAW_WARNING_CODES.PAYLOAD_TRUNCATED,
      message: 'Input payload could not be serialized',
      field: 'input',
    });
  }
  if (event.output !== undefined && outputBytes === undefined) {
    warnings.push({
      code: OPENCLAW_WARNING_CODES.PAYLOAD_TRUNCATED,
      message: 'Output payload could not be serialized',
      field: 'output',
    });
  }

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
 * Format: openclaw:{run_id}:{tool_call_id}
 */
function buildInteractionId(event: OpenClawToolCallEvent): string {
  return `openclaw:${event.run_id}:${event.tool_call_id}`;
}

/**
 * Serialize a payload to bytes (UTF-8 JSON).
 *
 * Returns undefined if serialization fails.
 */
function serializePayload(payload: unknown): Uint8Array | undefined {
  if (payload === undefined) {
    return undefined;
  }

  try {
    const json = JSON.stringify(payload);
    return new TextEncoder().encode(json);
  } catch {
    // Serialization failed (circular references, BigInt, etc.)
    return undefined;
  }
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
