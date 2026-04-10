/**
 * @peac/adapter-managed-agents constants
 *
 * Vendor-neutral type URIs and extension namespace for managed agent
 * runtime event families.
 */

/** Extension namespace for managed agent event metadata. */
export const EXTENSION_NAMESPACE = 'org.peacprotocol/managed-agent' as const;

/** Reverse-DNS type prefix for all managed agent event families. */
export const TYPE_PREFIX = 'org.peacprotocol/managed-agent-' as const;

/**
 * Canonical type URIs for the 6 managed agent event families.
 * Each maps to a distinct Interaction Record `type` value.
 */
export const EVENT_TYPES = {
  SESSION: `${TYPE_PREFIX}session`,
  TASK: `${TYPE_PREFIX}task`,
  TOOL_USE: `${TYPE_PREFIX}tool-use`,
  MCP_CALL: `${TYPE_PREFIX}mcp-call`,
  PERMISSION: `${TYPE_PREFIX}permission`,
  OUTCOME: `${TYPE_PREFIX}outcome`,
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
