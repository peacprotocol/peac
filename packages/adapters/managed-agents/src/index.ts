/**
 * @peac/adapter-managed-agents
 *
 * Vendor-neutral adapter for managed agent runtime event evidence.
 * Maps 6 event families (session, task, tool-use, mcp-call, permission,
 * outcome) to signed PEAC Interaction Records.
 *
 * This package is provider-neutral: the `provider` field is always
 * caller-supplied. No vendor SDK dependencies.
 */

// =============================================================================
// Constants
// =============================================================================
export { EXTENSION_NAMESPACE, TYPE_PREFIX, EVENT_TYPES, type EventType } from './constants.js';

// =============================================================================
// Types
// =============================================================================
export {
  EventFamily,
  type ManagedAgentEvent,
  type IssueEventOptions,
  type IssueEventResult,
  type SessionSummary,
} from './types.js';

// =============================================================================
// Event family registry
// =============================================================================
export { EVENT_FAMILIES, type EventFamilyEntry } from './event-families.js';

// =============================================================================
// Issuance (factory functions per event family)
// =============================================================================
export {
  issueEvent,
  issueSessionEvent,
  issueTaskEvent,
  issueToolUseEvent,
  issueMcpCallEvent,
  issuePermissionEvent,
  issueOutcomeEvent,
} from './issue-event.js';

// =============================================================================
// Session summary builder
// =============================================================================
export { buildSessionSummary } from './session-summary.js';
