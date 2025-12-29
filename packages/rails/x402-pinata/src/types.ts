/**
 * x402+Pinata private IPFS objects adapter types
 *
 * Maps Pinata private object access events to PEAC PaymentEvidence
 * using PEIP-OBJ/private@1 subject profile.
 */

/**
 * Result type for parse operations - "never throws" invariant
 */
export type AdapterResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code: AdapterErrorCode };

/**
 * Error codes for adapter operations
 */
export type AdapterErrorCode =
  | 'missing_required_field'
  | 'invalid_amount'
  | 'invalid_currency'
  | 'invalid_cid'
  | 'invalid_visibility'
  | 'parse_error'
  | 'validation_error';

/**
 * Pinata private object access event
 */
export interface PinataAccessEvent {
  /** Unique access event ID */
  accessId: string;
  /** IPFS Content Identifier (CID) */
  cid: string;
  /** Amount in minor units (cents, sats) */
  amount: number;
  /** Currency code (ISO 4217) */
  currency: string;
  /** Object visibility */
  visibility?: 'private' | 'public';
  /** Gateway used for access */
  gateway?: string;
  /** User or agent identifier */
  userId?: string;
  /** Content type (MIME) */
  contentType?: string;
  /** Content size in bytes */
  contentSize?: number;
  /** Access expiration (ISO 8601) */
  expiresAt?: string;
  /** Time-to-live in seconds */
  ttl?: number;
  /** Environment */
  env?: 'live' | 'test';
  /** Timestamp */
  timestamp?: string;
  /** Pin metadata */
  pinMetadata?: Record<string, unknown>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Pinata webhook event wrapper
 */
export interface PinataWebhookEvent {
  type: 'access.granted' | 'access.expired' | 'payment.captured';
  data: PinataAccessEvent;
  signature?: string;
  webhookId?: string;
}

/**
 * Evidence structure for Pinata access
 * Nested inside PaymentEvidence.evidence
 */
export interface PinataEvidence {
  access_id: string;
  cid: string;
  /** Store identifier for PEIP-OBJ/private@1 */
  store: 'ipfs';
  /** Object ID is the CID */
  object_id: string;
  visibility: 'private' | 'public';
  gateway?: string;
  user_id?: string;
  content_type?: string;
  content_size?: number;
  expires_at?: string;
  ttl?: number;
  timestamp?: string;
  /** PEIP-OBJ/private@1 profile marker */
  profile: 'PEIP-OBJ/private@1';
}

/**
 * Adapter configuration
 */
export interface PinataConfig {
  /** Default environment if not specified in event */
  defaultEnv?: 'live' | 'test';
  /** Default visibility if not specified */
  defaultVisibility?: 'private' | 'public';
  /** Allowed gateways (if set, validates against this list) */
  allowedGateways?: string[];
}
