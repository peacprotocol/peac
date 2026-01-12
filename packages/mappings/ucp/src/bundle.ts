/**
 * @peac/mappings-ucp - Dispute bundle helpers
 *
 * Helpers for creating UCP dispute evidence using the existing
 * @peac/audit DisputeBundle format.
 *
 * Evidence is stored in policy/policy.yaml with a hardened schema
 * that cannot be misinterpreted as executable policy.
 */

import type {
  UcpWebhookEvidence,
  UcpProfile,
  UcpSigningKey,
  VerifyUcpWebhookResult,
  LinkedReceipt,
  WebhookEventMeta,
} from './types.js';
import {
  createUcpWebhookEvidence,
  serializeEvidenceYaml,
  createPayloadEvidence,
  createSignatureEvidence,
  createProfileSnapshot,
} from './evidence.js';
import { verifyUcpWebhookSignature, parseDetachedJws } from './verify.js';

/**
 * Options for creating UCP dispute evidence.
 */
export interface CreateUcpDisputeEvidenceOptions {
  /** Request-Signature header value */
  signature_header: string;

  /** Raw request body bytes */
  body_bytes: Uint8Array;

  /** HTTP method */
  method: string;

  /** Request path */
  path: string;

  /** When request was received (ISO 8601) - REQUIRED for deterministic output */
  received_at: string;

  /** Profile URL for key discovery */
  profile_url: string;

  /** When profile was fetched (ISO 8601) - REQUIRED for deterministic output */
  profile_fetched_at: string;

  /** Optional: pre-fetched profile (skips fetch) */
  profile?: UcpProfile;

  /** Optional: event metadata from payload */
  event?: WebhookEventMeta;

  /** Optional: linked PEAC receipts */
  linked_receipts?: LinkedReceipt[];

  /** Optional: maximum body size to include as base64url (default 256KB) */
  max_body_evidence_bytes?: number;

  /** Optional: include JCS text in evidence (default false, saves space) */
  include_jcs_text?: boolean;
}

/**
 * Result of creating UCP dispute evidence.
 */
export interface CreateUcpDisputeEvidenceResult {
  /** Whether webhook signature was valid */
  signature_valid: boolean;

  /** Verification result details */
  verification: VerifyUcpWebhookResult;

  /** Serialized evidence YAML (for policy/policy.yaml in DisputeBundle) */
  evidence_yaml: string;

  /** Structured evidence object */
  evidence: UcpWebhookEvidence;
}

/**
 * Create UCP dispute evidence for a webhook request.
 *
 * This function:
 * 1. Verifies the webhook signature (raw-first, JCS fallback)
 * 2. Creates evidence with both raw and JCS payload representations
 * 3. Serializes to deterministic YAML for the dispute bundle
 *
 * The resulting evidence_yaml can be passed as the `policy` parameter
 * to @peac/audit's createDisputeBundle().
 *
 * @example
 * ```ts
 * import { createUcpDisputeEvidence } from '@peac/mappings-ucp';
 * import { createDisputeBundle } from '@peac/audit';
 *
 * // Create evidence from webhook
 * const evidence = await createUcpDisputeEvidence({
 *   signature_header: req.headers['request-signature'],
 *   body_bytes: rawBody,
 *   method: 'POST',
 *   path: '/webhooks/ucp/orders',
 *   received_at: new Date().toISOString(),
 *   profile_url: 'https://business.example.com/.well-known/ucp',
 *   profile_fetched_at: new Date().toISOString(),
 * });
 *
 * // Create dispute bundle with evidence
 * const bundle = await createDisputeBundle({
 *   dispute_ref: 'dispute_123',
 *   created_by: 'platform:example.com',
 *   receipts: [receiptJws],
 *   keys: jwks,
 *   policy: evidence.evidence_yaml, // <- UCP evidence goes here
 * });
 * ```
 */
export async function createUcpDisputeEvidence(
  options: CreateUcpDisputeEvidenceOptions
): Promise<CreateUcpDisputeEvidenceResult> {
  const {
    signature_header,
    body_bytes,
    method,
    path,
    received_at,
    profile_url,
    profile_fetched_at,
    profile: providedProfile,
    event,
    linked_receipts,
    max_body_evidence_bytes,
    include_jcs_text = false,
  } = options;

  // Verify the webhook signature
  const verification = await verifyUcpWebhookSignature({
    signature_header,
    body_bytes,
    profile_url,
    profile: providedProfile,
    fetched_at: profile_fetched_at,
    max_body_evidence_bytes,
  });

  // Get the profile for snapshot (use provided or refetch)
  let profile: UcpProfile;
  if (providedProfile) {
    profile = providedProfile;
  } else {
    // Fetch profile for snapshot
    const response = await fetch(profile_url);
    profile = (await response.json()) as UcpProfile;
  }

  // Parse the signature header for evidence
  const parsed = parseDetachedJws(signature_header);

  // Create payload evidence
  const payloadEvidence = createPayloadEvidence(body_bytes, {
    maxBodyEvidenceBytes: max_body_evidence_bytes,
    includeJcsText: include_jcs_text,
  });

  // Create signature evidence
  const signatureEvidence = createSignatureEvidence(
    signature_header,
    {
      kid: parsed.header.kid,
      alg: parsed.header.alg,
      b64: parsed.header.b64,
      crit: parsed.header.crit,
    },
    verification.valid,
    verification.attempts,
    verification.mode_used
  );

  // Get the key used (if found)
  const keyUsed = verification.key as UcpSigningKey | undefined;

  // Create profile snapshot
  const profileSnapshot = keyUsed
    ? createProfileSnapshot(
        profile_url,
        profile as unknown as Record<string, unknown>,
        keyUsed,
        profile_fetched_at
      )
    : {
        url: profile_url,
        fetched_at: profile_fetched_at,
        profile_jcs_sha256_hex: '', // Cannot compute without key
      };

  // Create structured evidence
  const evidence = createUcpWebhookEvidence({
    method,
    path,
    received_at,
    payload: payloadEvidence,
    signature: signatureEvidence,
    profile: profileSnapshot,
    event,
    linked_receipts,
  });

  // Serialize to YAML
  const evidence_yaml = serializeEvidenceYaml(evidence);

  return {
    signature_valid: verification.valid,
    verification,
    evidence_yaml,
    evidence,
  };
}

/**
 * Parse event metadata from UCP webhook payload.
 *
 * @param bodyBytes - Raw request body bytes
 * @returns Event metadata or undefined if not parseable
 */
export function parseWebhookEvent(bodyBytes: Uint8Array): WebhookEventMeta | undefined {
  try {
    const bodyText = new TextDecoder().decode(bodyBytes);
    const payload = JSON.parse(bodyText) as Record<string, unknown>;

    // UCP order events typically have these fields
    const eventType = payload.event_type as string | undefined;
    const orderId = (payload.order as Record<string, unknown>)?.id as string | undefined;
    const timestamp = payload.timestamp as string | undefined;

    if (!eventType) {
      return undefined;
    }

    return {
      type: eventType,
      resource_id: orderId,
      timestamp,
    };
  } catch {
    return undefined;
  }
}

/**
 * Determine the linked receipt relationship based on event type.
 */
export function determineReceiptRelationship(eventType: string): LinkedReceipt['relationship'] {
  if (eventType.startsWith('order.')) {
    return 'issued_for_order';
  }
  if (eventType.startsWith('checkout.')) {
    return 'issued_for_checkout';
  }
  if (eventType.startsWith('adjustment.') || eventType.startsWith('refund.')) {
    return 'issued_for_adjustment';
  }
  return 'issued_for_order'; // Default
}
