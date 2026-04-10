/**
 * @peac/adapter-managed-agents event issuance
 *
 * Factory functions for issuing managed agent events as signed
 * Interaction Records. Each function wraps @peac/protocol issue()
 * with the correct type URI and extension namespace.
 *
 * All functions are vendor-neutral: the `provider` field is always
 * caller-supplied and never hardcoded.
 */

import { issue } from '@peac/protocol';
import { EXTENSION_NAMESPACE } from './constants.js';
import { EVENT_FAMILIES } from './event-families.js';
import { EventFamily, type IssueEventOptions, type IssueEventResult } from './types.js';

/**
 * Issue a signed Interaction Record for a managed agent event.
 *
 * @param options - Issuance options including key material, session, and event
 * @returns Signed JWS, type URI, and event family
 */
export async function issueEvent(options: IssueEventOptions): Promise<IssueEventResult> {
  const { privateKey, kid, issuer, sessionId, agentId, provider, event } = options;
  const entry = EVENT_FAMILIES[event.family];

  const { jws } = await issue({
    iss: issuer,
    kind: entry.kind,
    type: entry.type,
    privateKey,
    kid,
    extensions: {
      [EXTENSION_NAMESPACE]: {
        session_id: sessionId,
        event: event.event,
        agent_id: agentId,
        provider,
        ...event.details,
      },
    },
  });

  return { jws, type: entry.type, family: event.family };
}

/** Issue a session lifecycle event. */
export async function issueSessionEvent(
  options: Omit<IssueEventOptions, 'event'> & {
    event: string;
    details?: Record<string, unknown>;
  }
): Promise<IssueEventResult> {
  return issueEvent({
    ...options,
    event: { family: EventFamily.Session, event: options.event, details: options.details },
  });
}

/** Issue a task submission event. */
export async function issueTaskEvent(
  options: Omit<IssueEventOptions, 'event'> & {
    event: string;
    details?: Record<string, unknown>;
  }
): Promise<IssueEventResult> {
  return issueEvent({
    ...options,
    event: { family: EventFamily.Task, event: options.event, details: options.details },
  });
}

/** Issue a tool use event. */
export async function issueToolUseEvent(
  options: Omit<IssueEventOptions, 'event'> & {
    event: string;
    details?: Record<string, unknown>;
  }
): Promise<IssueEventResult> {
  return issueEvent({
    ...options,
    event: { family: EventFamily.ToolUse, event: options.event, details: options.details },
  });
}

/** Issue an MCP invocation event. */
export async function issueMcpCallEvent(
  options: Omit<IssueEventOptions, 'event'> & {
    event: string;
    details?: Record<string, unknown>;
  }
): Promise<IssueEventResult> {
  return issueEvent({
    ...options,
    event: { family: EventFamily.McpCall, event: options.event, details: options.details },
  });
}

/** Issue a permission confirmation event. */
export async function issuePermissionEvent(
  options: Omit<IssueEventOptions, 'event'> & {
    event: string;
    details?: Record<string, unknown>;
  }
): Promise<IssueEventResult> {
  return issueEvent({
    ...options,
    event: { family: EventFamily.Permission, event: options.event, details: options.details },
  });
}

/** Issue an outcome evaluation event. */
export async function issueOutcomeEvent(
  options: Omit<IssueEventOptions, 'event'> & {
    event: string;
    details?: Record<string, unknown>;
  }
): Promise<IssueEventResult> {
  return issueEvent({
    ...options,
    event: { family: EventFamily.Outcome, event: options.event, details: options.details },
  });
}
