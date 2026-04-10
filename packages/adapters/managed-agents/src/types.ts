/**
 * @peac/adapter-managed-agents types
 *
 * Vendor-neutral types for managed agent runtime events.
 * No runtime-specific logic; provider identity is caller-supplied.
 */

import type { EventType } from './constants.js';

/**
 * Enum of the 6 managed agent event families.
 */
export enum EventFamily {
  Session = 'session',
  Task = 'task',
  ToolUse = 'tool-use',
  McpCall = 'mcp-call',
  Permission = 'permission',
  Outcome = 'outcome',
}

/**
 * Input event from a managed agent runtime.
 * Provider-neutral: no vendor-specific fields.
 */
export interface ManagedAgentEvent {
  /** Event family classification. */
  family: EventFamily;
  /** Specific event name within the family (e.g., 'session.created'). */
  event: string;
  /** Additional event-specific details. JSON-serializable. */
  details?: Record<string, unknown>;
}

/**
 * Options for issuing a managed agent event as a signed Interaction Record.
 */
export interface IssueEventOptions {
  /** Ed25519 private key (32 bytes). Caller-provided; never stored. */
  privateKey: Uint8Array;
  /** Key ID (max 256 chars). */
  kid: string;
  /** Canonical issuer URL (HTTPS or DID). */
  issuer: string;
  /** Session identifier for event correlation. */
  sessionId: string;
  /** Agent identifier. */
  agentId: string;
  /** Provider name. Caller-supplied; never hardcoded. */
  provider: string;
  /** The event to issue. */
  event: ManagedAgentEvent;
}

/**
 * Result of issuing a managed agent event.
 */
export interface IssueEventResult {
  /** Compact JWS (signed Interaction Record). */
  jws: string;
  /** PEAC event type URI used. */
  type: EventType;
  /** Event family. */
  family: EventFamily;
}

/**
 * Session evidence summary aggregated from verified receipts.
 */
export interface SessionSummary {
  /** Session identifier. */
  sessionId: string;
  /** Total receipts in the session. */
  receipts: number;
  /** Distinct event families represented. */
  families: EventFamily[];
  /** Issuer (from the first receipt, or empty if no receipts). */
  issuer: string;
}
