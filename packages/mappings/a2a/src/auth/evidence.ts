/**
 * A2A auth event to PEAC evidence mapping.
 *
 * Maps A2A OAuth authentication events to access extension observations.
 * Auth success produces an **observation** receipt, never an automatic
 * access-decision receipt. The caller must explicitly construct
 * access-decision receipts when a business-level decision is made.
 */

import type { JsonObject } from '@peac/kernel';
import { ACCESS_EXTENSION_KEY } from '@peac/schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported A2A auth methods */
export type A2AAuthMethod = 'oauth2_pkce' | 'oauth2_device_code' | 'oauth2_client_credentials';

/**
 * Input event describing an A2A authentication occurrence.
 *
 * This represents what happened at the auth layer, not a business
 * decision about whether to grant access.
 */
export interface A2AAuthEvent {
  /** Auth method used */
  readonly method: A2AAuthMethod;
  /** Resource URI that was authenticated against */
  readonly resource: string;
  /** Action that was requested (e.g., 'authenticate', 'tasks/send') */
  readonly action: string;
  /** OAuth scopes that were granted (from token response) */
  readonly grantedScopes?: readonly string[];
  /** Authorization server that issued the token */
  readonly authServer?: string;
  /** Client identifier used */
  readonly clientId?: string;
  /** ISO 8601 timestamp of the auth event */
  readonly timestamp?: string;
}

/**
 * Output structure for the access extension in a Wire 0.2 receipt.
 *
 * Uses `org.peacprotocol/access` extension group with `auth_event`
 * set to `'observation'` to distinguish from access-decision receipts.
 */
export interface A2AAuthEvidenceResult {
  /** Extension key for receipt `ext` field */
  readonly extensionKey: typeof ACCESS_EXTENSION_KEY;
  /** Access extension fields for the receipt */
  readonly extension: {
    readonly resource: string;
    readonly action: string;
    readonly decision: 'review';
  };
  /** Additional evidence metadata for the receipt `evidence` field */
  readonly evidence: JsonObject;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Map an A2A auth event to access extension evidence.
 *
 * Produces an **observation** receipt: `decision` is always `'review'`,
 * indicating that authentication occurred but no access decision was
 * made by the evidence layer. Callers who need `'allow'` or `'deny'`
 * decisions must explicitly construct those receipts.
 *
 * Tokens are never included in the evidence. Only structural metadata
 * (method, scopes, server, client_id) is recorded.
 *
 * @param event - A2A auth event to map
 * @returns Extension data and evidence metadata for receipt construction
 */
export function fromA2AAuthEvent(event: A2AAuthEvent): A2AAuthEvidenceResult {
  if (!event.resource) {
    throw new Error('A2A auth event missing resource');
  }
  if (!event.action) {
    throw new Error('A2A auth event missing action');
  }

  const evidence: JsonObject = {
    auth_event: 'observation',
    auth_method: event.method,
  };

  if (event.grantedScopes && event.grantedScopes.length > 0) {
    evidence.granted_scopes = [...event.grantedScopes];
  }
  if (event.authServer) {
    evidence.auth_server = event.authServer;
  }
  if (event.clientId) {
    evidence.client_id = event.clientId;
  }
  if (event.timestamp) {
    evidence.timestamp = event.timestamp;
  }

  return {
    extensionKey: ACCESS_EXTENSION_KEY,
    extension: {
      resource: event.resource,
      action: event.action,
      decision: 'review',
    },
    evidence,
  };
}
