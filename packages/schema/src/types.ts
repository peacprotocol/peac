/**
 * PEAC Protocol TypeScript types
 */

import { PEAC_WIRE_TYP, PEAC_ALG } from './constants';
import type { ControlBlock } from './control';
import type { PaymentEvidence, PaymentRailId } from './evidence';
import type { PurposeToken, CanonicalPurpose, PurposeReason } from './purpose';

/**
 * Subject of the receipt (what was paid for)
 */
export interface Subject {
  /** URI of the resource being paid for */
  uri: string;
}

/**
 * AIPREF snapshot (if applicable)
 */
export interface AIPREFSnapshot {
  /** URL of the AIPREF document */
  url: string;

  /** JCS+SHA-256 hash of the AIPREF document */
  hash: string;
}

/**
 * Extension fields (additive-only growth path)
 */
export interface ReceiptExtensions {
  /** AIPREF snapshot at time of issuance */
  aipref_snapshot?: AIPREFSnapshot;

  /** Control block for mandate management (CAL) */
  control?: ControlBlock;

  /** Additional extensions (PEIP-defined) */
  [key: string]: unknown;
}

/**
 * JWS Header for PEAC receipts
 */
export interface PEACReceiptHeader {
  /** Wire format version - FROZEN at 0.9 until GA */
  typ: typeof PEAC_WIRE_TYP;

  /** Signature algorithm - Ed25519 */
  alg: typeof PEAC_ALG;

  /** Key ID (ISO 8601 timestamp) */
  kid: string;
}

/**
 * PEAC Receipt Claims (JWS payload)
 */
export interface PEACReceiptClaims {
  /** Issuer URL (https://) */
  iss: string;

  /** Audience / resource URL */
  aud: string;

  /** Issued at (Unix timestamp seconds) */
  iat: number;

  /** Expiry (Unix timestamp seconds, optional) */
  exp?: number;

  /** Receipt ID (UUIDv7) */
  rid: string;

  /** Amount (smallest currency unit) */
  amt: number;

  /** Currency (ISO 4217 uppercase) */
  cur: string;

  /** Normalized payment details */
  payment: PaymentEvidence;

  /** Subject (what was paid for) */
  subject?: Subject;

  /** Extensions (additive-only) */
  ext?: ReceiptExtensions;

  /**
   * Purposes declared by requester (v0.9.24+)
   *
   * ALWAYS array, even for single purpose: ["train"]
   * Empty array if header missing/empty (internal 'undeclared' state)
   * Uses PurposeToken (string) to preserve unknown tokens (forward-compat)
   */
  purpose_declared?: PurposeToken[];

  /**
   * Single purpose enforced by policy (v0.9.24+)
   *
   * MUST be one of declared purposes OR a downgrade
   * Uses CanonicalPurpose (enforcement requires semantics)
   */
  purpose_enforced?: CanonicalPurpose;

  /**
   * Reason for enforcement decision (v0.9.24+)
   *
   * The audit spine - explains WHY purpose was enforced as it was
   */
  purpose_reason?: PurposeReason;
}

/**
 * Complete PEAC Receipt (header + claims)
 */
export interface PEACReceipt {
  header: PEACReceiptHeader;
  claims: PEACReceiptClaims;
}

/**
 * Verify request body
 */
export interface VerifyRequest {
  /** JWS compact serialization */
  receipt_jws: string;
}

/**
 * Verify response (success)
 */
export interface VerifyResponseSuccess {
  /** Verification succeeded */
  ok: true;

  /** JWS header (decoded) */
  header: PEACReceiptHeader;

  /** Claims (decoded and validated) */
  claims: PEACReceiptClaims;

  /** Performance metrics */
  perf?: {
    verify_ms: number;
    jwks_fetch_ms?: number;
  };
}

/**
 * Verify response (failure)
 */
export interface VerifyResponseFailure {
  /** Verification failed */
  ok: false;

  /** Error reason */
  reason: string;

  /** Error details */
  details?: string;
}

/**
 * Verify response (union)
 */
export type VerifyResponse = VerifyResponseSuccess | VerifyResponseFailure;

/**
 * Issuer Configuration (/.well-known/peac-issuer.json)
 *
 * Enables verifiers to discover cryptographic keys and verification
 * endpoints for validating PEAC receipts.
 *
 * @see docs/specs/PEAC-ISSUER.md
 */
export interface PEACIssuerConfig {
  /** Configuration format version (e.g., "peac-issuer/0.1") */
  version: string;

  /** Issuer identifier URL (MUST match receipt iss claim) */
  issuer: string;

  /** JWKS endpoint URL */
  jwks_uri: string;

  /** Verification endpoint URL (optional) */
  verify_endpoint?: string;

  /** Supported receipt versions (default: ["peac.receipt/0.9"]) */
  receipt_versions?: string[];

  /** Supported signing algorithms (default: ["EdDSA"]) */
  algorithms?: string[];

  /** Supported payment rails (optional) */
  payment_rails?: string[];

  /** Security contact email or URL (optional) */
  security_contact?: string;
}

/**
 * Policy Manifest (/.well-known/peac.txt)
 *
 * Declares machine-readable access terms for automated interactions:
 * allowed purposes, receipt requirements, rate limits, and payment terms.
 *
 * @see docs/specs/PEAC-TXT.md
 */
export interface PEACPolicyManifest {
  /** Policy format version (e.g., "0.9") */
  version: string;

  /** Access model: "open" or "conditional" */
  usage: 'open' | 'conditional';

  /** Allowed purposes (optional) */
  purposes?: string[];

  /** Receipt requirement: "required", "optional", or "omit" */
  receipts?: 'required' | 'optional' | 'omit';

  /** Attribution requirement (optional) */
  attribution?: 'required' | 'optional' | 'none';

  /** Rate limit string (e.g., "100/hour", "unlimited") */
  rate_limit?: string;

  /** Daily request limit (optional) */
  daily_limit?: number;

  /** Negotiation endpoint URL (optional) */
  negotiate?: string;

  /** Contact email or URL (optional) */
  contact?: string;

  /** License identifier (e.g., "Apache-2.0") */
  license?: string;

  /** Price per request in minor units (optional) */
  price?: number;

  /** Currency code ISO 4217 (optional) */
  currency?: string;

  /** Supported payment methods (optional) */
  payment_methods?: string[];

  /** Payment endpoint URL (optional) */
  payment_endpoint?: string;
}

/**
 * @deprecated Use PEACIssuerConfig instead. Will be removed in v1.0.
 */
export type PEACDiscovery = PEACIssuerConfig;
