/**
 * @peac/adapter-managed-agents event family registry
 *
 * Maps each EventFamily to its canonical PEAC Interaction Record type
 * and structural kind. All event families produce `evidence` kind records.
 */

import { EVENT_TYPES, type EventType } from './constants.js';
import { EventFamily } from './types.js';

export interface EventFamilyEntry {
  /** PEAC Interaction Record type URI. */
  type: EventType;
  /** Structural kind (always 'evidence' for managed agent events). */
  kind: 'evidence';
}

/**
 * Registry of all 6 managed agent event families.
 * Each entry maps a family to its canonical type URI and kind.
 */
export const EVENT_FAMILIES: Record<EventFamily, EventFamilyEntry> = {
  [EventFamily.Session]: { type: EVENT_TYPES.SESSION, kind: 'evidence' },
  [EventFamily.Task]: { type: EVENT_TYPES.TASK, kind: 'evidence' },
  [EventFamily.ToolUse]: { type: EVENT_TYPES.TOOL_USE, kind: 'evidence' },
  [EventFamily.McpCall]: { type: EVENT_TYPES.MCP_CALL, kind: 'evidence' },
  [EventFamily.Permission]: { type: EVENT_TYPES.PERMISSION, kind: 'evidence' },
  [EventFamily.Outcome]: { type: EVENT_TYPES.OUTCOME, kind: 'evidence' },
};
