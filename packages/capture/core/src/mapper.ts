/**
 * @peac/capture-core - Evidence Mapper
 *
 * Transforms SpoolEntry into InteractionEvidenceV01.
 * This is a pure transformation with no side effects.
 */

import type {
  InteractionEvidenceV01,
  Digest,
  PayloadRef,
  Executor,
  ToolTarget,
  ResourceTarget,
  Result,
  PolicyContext,
} from '@peac/schema';
import type { SpoolEntry, SpoolAnchor } from './types';

// =============================================================================
// Mapper Types
// =============================================================================

/**
 * Stored action type (action without raw bytes).
 * This is the exact type stored in SpoolEntry.action.
 */
type StoredAction = SpoolEntry['action'];

/**
 * Options for mapping SpoolEntry to InteractionEvidence.
 */
export interface MapperOptions {
  /**
   * Default redaction mode for payloads.
   * @default 'hash_only'
   */
  defaultRedaction?: 'hash_only' | 'redacted' | 'plaintext_allowlisted';

  /**
   * Include spool anchor in evidence extensions.
   * @default false
   */
  includeSpoolAnchor?: boolean;
}

// =============================================================================
// Pure Transformation Functions
// =============================================================================

/**
 * Build executor from action.
 */
function buildExecutor(action: StoredAction): Executor {
  const executor: Executor = {
    platform: action.platform,
  };

  if (action.platform_version) {
    executor.version = action.platform_version;
  }

  if (action.plugin_id) {
    executor.plugin_id = action.plugin_id;
  }

  return executor;
}

/**
 * Build tool target from action (if applicable).
 */
function buildToolTarget(action: StoredAction): ToolTarget | undefined {
  if (!action.tool_name) {
    return undefined;
  }

  const tool: ToolTarget = {
    name: action.tool_name,
  };

  if (action.tool_provider) {
    tool.provider = action.tool_provider;
  }

  return tool;
}

/**
 * Build resource target from action (if applicable).
 */
function buildResourceTarget(action: StoredAction): ResourceTarget | undefined {
  if (!action.resource_uri && !action.resource_method) {
    return undefined;
  }

  const resource: ResourceTarget = {};

  if (action.resource_uri) {
    resource.uri = action.resource_uri;
  }

  if (action.resource_method) {
    resource.method = action.resource_method;
  }

  return resource;
}

/**
 * Build payload reference from digest.
 */
function buildPayloadRef(
  digest: Digest | undefined,
  redaction: 'hash_only' | 'redacted' | 'plaintext_allowlisted'
): PayloadRef | undefined {
  if (!digest) {
    return undefined;
  }

  return {
    digest,
    redaction,
  };
}

/**
 * Build result from action.
 */
function buildResult(action: StoredAction): Result | undefined {
  if (!action.status) {
    return undefined;
  }

  const result: Result = {
    status: action.status,
  };

  if (action.error_code) {
    result.error_code = action.error_code;
  }

  if (action.retryable !== undefined) {
    result.retryable = action.retryable;
  }

  return result;
}

/**
 * Build policy context from action.
 */
function buildPolicyContext(action: StoredAction): PolicyContext | undefined {
  if (!action.policy) {
    return undefined;
  }

  const policy: PolicyContext = {
    decision: action.policy.decision,
  };

  if (action.policy.sandbox_enabled !== undefined) {
    policy.sandbox_enabled = action.policy.sandbox_enabled;
  }

  if (action.policy.elevated !== undefined) {
    policy.elevated = action.policy.elevated;
  }

  // Note: effective_policy_digest would require converting the string to Digest
  // This is left for the adapter to handle if needed

  return policy;
}

// =============================================================================
// Main Mapper
// =============================================================================

/**
 * Convert a SpoolEntry to InteractionEvidenceV01.
 *
 * This is a pure, deterministic transformation.
 * The same SpoolEntry will always produce the same InteractionEvidence.
 */
export function toInteractionEvidence(
  entry: SpoolEntry,
  options: MapperOptions = {}
): InteractionEvidenceV01 {
  const { defaultRedaction = 'hash_only', includeSpoolAnchor = false } = options;

  const { action } = entry;

  // Build the evidence object
  const evidence: InteractionEvidenceV01 = {
    interaction_id: action.id,
    kind: action.kind,
    executor: buildExecutor(action),
    started_at: action.started_at,
  };

  // Optional tool target
  const tool = buildToolTarget(action);
  if (tool) {
    evidence.tool = tool;
  }

  // Optional resource target
  const resource = buildResourceTarget(action);
  if (resource) {
    evidence.resource = resource;
  }

  // Optional input payload reference
  const input = buildPayloadRef(entry.input_digest, defaultRedaction);
  if (input) {
    evidence.input = input;
  }

  // Optional output payload reference
  const output = buildPayloadRef(entry.output_digest, defaultRedaction);
  if (output) {
    evidence.output = output;
  }

  // Optional completed_at
  if (action.completed_at) {
    evidence.completed_at = action.completed_at;
  }

  // Optional duration
  if (action.duration_ms !== undefined) {
    evidence.duration_ms = action.duration_ms;
  }

  // Optional result
  const result = buildResult(action);
  if (result) {
    evidence.result = result;
  }

  // Optional policy context
  const policy = buildPolicyContext(action);
  if (policy) {
    evidence.policy = policy;
  }

  // Build extensions
  const extensions: Record<string, unknown> = {};

  // Add platform-specific metadata if present
  if (action.metadata && Object.keys(action.metadata).length > 0) {
    // Platform metadata should be namespaced by the adapter
    // We store it under a generic key that adapters can refine
    extensions['org.peacprotocol/capture-metadata@0.1'] = action.metadata;
  }

  // Add spool anchor if requested
  if (includeSpoolAnchor) {
    const anchor: SpoolAnchor = {
      spool_head_digest: entry.entry_digest,
      sequence: entry.sequence,
      anchored_at: entry.captured_at,
    };
    extensions['org.peacprotocol/spool-anchor@0.1'] = anchor;
  }

  // Only add extensions if non-empty
  if (Object.keys(extensions).length > 0) {
    evidence.extensions = extensions;
  }

  return evidence;
}

/**
 * Batch convert SpoolEntries to InteractionEvidence array.
 */
export function toInteractionEvidenceBatch(
  entries: SpoolEntry[],
  options: MapperOptions = {}
): InteractionEvidenceV01[] {
  return entries.map((entry) => toInteractionEvidence(entry, options));
}
