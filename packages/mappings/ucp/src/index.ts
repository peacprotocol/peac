/**
 * @peac/mappings-ucp
 *
 * Google Universal Commerce Protocol (UCP) mapping to PEAC receipts
 * and dispute evidence.
 *
 * Features:
 * - Webhook signature verification (raw-first, JCS fallback)
 * - UCP order to PEAC receipt mapping
 * - Dispute evidence generation for @peac/audit bundles
 *
 * @example
 * ```ts
 * import {
 *   verifyUcpWebhookSignature,
 *   mapUcpOrderToReceipt,
 *   createUcpDisputeEvidence,
 * } from '@peac/mappings-ucp';
 *
 * // Verify webhook signature
 * const result = await verifyUcpWebhookSignature({
 *   signature_header: req.headers['request-signature'],
 *   body_bytes: rawBody,
 *   profile_url: 'https://business.example.com/.well-known/ucp',
 * });
 *
 * if (result.valid) {
 *   // Map order to PEAC receipt
 *   const claims = mapUcpOrderToReceipt({
 *     order: body.order,
 *     issuer: 'https://platform.example.com',
 *     subject: 'buyer:123',
 *     currency: 'USD',
 *   });
 *
 *   // Sign with @peac/protocol
 *   const receipt = await issue(claims, privateKey, kid);
 * }
 * ```
 */

// Types
export type {
  // Core types
  UcpSignatureAlgorithm,
  MinorUnits,
  VerificationMode,
  B64Mode,
  // JWS types
  UcpJwsHeader,
  ParsedDetachedJws,
  // Profile types
  UcpSigningKey,
  UcpProfile,
  UcpCapability,
  // Evidence types
  VerificationAttempt,
  PayloadEvidence,
  SignatureEvidence,
  ProfileSnapshot,
  WebhookEventMeta,
  UcpWebhookEvidence,
  LinkedReceipt,
  // Verification types
  VerifyUcpWebhookOptions,
  VerifyUcpWebhookResult,
  // Order types
  UcpLineItem,
  UcpOrder,
  MapUcpOrderOptions,
  MappedReceiptClaims,
} from './types.js';

export { UCP_EVIDENCE_VERSION } from './types.js';

// Errors
export { ErrorCodes, ErrorHttpStatus, UcpError, ucpError } from './errors.js';
export type { ErrorCode } from './errors.js';

// Verification
export { verifyUcpWebhookSignature, parseDetachedJws, findSigningKey } from './verify.js';

// Mapping
export { mapUcpOrderToReceipt, extractLineItemSummary, calculateOrderStats } from './mapper.js';

// Evidence
export {
  createUcpWebhookEvidence,
  serializeEvidenceYaml,
  createPayloadEvidence,
  createSignatureEvidence,
  createProfileSnapshot,
} from './evidence.js';

export type { CreateEvidenceOptions } from './evidence.js';

// Bundle helpers
export {
  createUcpDisputeEvidence,
  parseWebhookEvent,
  determineReceiptRelationship,
} from './bundle.js';

export type { CreateUcpDisputeEvidenceOptions, CreateUcpDisputeEvidenceResult } from './bundle.js';
