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
 * Discovery manifest (peac.txt parsed)
 */
export interface PEACDiscovery {
  /** PEAC protocol version */
  version: string;

  /** Issuer URL */
  issuer: string;

  /** Verify endpoint URL */
  verify: string;

  /** JWKS URL */
  jwks: string;

  /** Supported payment rails */
  payments: Array<{
    rail: string;
    info?: string;
  }>;

  /** AIPREF URL (optional) */
  aipref?: string;

  /** SLO endpoint (optional) */
  slos?: string;

  /** Security contact (optional) */
  security?: string;
}
