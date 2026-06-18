/**
 * @peac/mappings-ucp
 *
 * Universal Commerce Protocol (UCP) mapping to PEAC receipts and dispute
 * evidence.
 *
 * Signature verification:
 * - `verifyUcpHttpSignature` verifies the current UCP signing model:
 *   request-shaped RFC 9421 HTTP Message Signatures (ES256/ES384) with an
 *   RFC 9530 Content-Digest over raw body bytes. Response signatures (which use
 *   `@status`) are out of scope.
 * - `verifyUcpWebhookSignature` remains for the legacy `Request-Signature`
 *   detached-JWS (RFC 7797) compatibility path; the two never silently fall back
 *   to each other.
 *
 * Also: UCP order to PEAC receipt mapping and dispute evidence generation for
 * @peac/audit bundles.
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

// Evidence Carrier Contract (v0.11.1+ )
export type { UcpWebhookPayload, UcpExtractResult, UcpExtractAsyncResult } from './carrier.js';

export {
  UCP_MAX_CARRIER_SIZE,
  UCP_LEGACY_EXTENSION_KEY,
  attachCarrierToWebhookPayload,
  extractCarrierFromWebhookPayload,
  extractCarrierFromWebhookPayloadAsync,
  UcpCarrierAdapter,
} from './carrier.js';

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
  // RFC 9421 HTTP Message Signature verification types
  UcpHttpSignatureAlgorithm,
  UcpComponentPolicy,
  VerifyUcpHttpSignatureOptions,
  VerifyUcpHttpSignatureResult,
  // Order types
  UcpLineItem,
  UcpOrder,
  MapUcpOrderOptions,
  MappedReceiptClaims,
  // DD-187: Order-vs-payment semantic separation (v0.12.4+)
  UcpOrderState,
  UcpPaymentState,
} from './types.js';

export { UCP_EVIDENCE_VERSION } from './types.js';

// Errors
export { ErrorCodes, ErrorHttpStatus, UcpError, ucpError } from './errors.js';
export type { ErrorCode } from './errors.js';

// Verification (legacy Request-Signature / RFC 7797 detached JWS)
export { verifyUcpWebhookSignature, parseDetachedJws, findSigningKey } from './verify.js';

// Verification (current UCP model: RFC 9421 HTTP Message Signatures)
export { verifyUcpHttpSignature } from './http-signature.js';

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
