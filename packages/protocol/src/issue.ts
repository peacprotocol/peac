/**
 * Receipt issuance
 * Validates input, generates UUIDv7 rid, and signs with Ed25519
 */

import { uuidv7 } from 'uuidv7';
import { sign } from '@peac/crypto';
import {
  PEACReceiptClaims,
  ReceiptClaims,
  SubjectProfileSnapshot,
  validateSubjectSnapshot,
} from '@peac/schema';

/**
 * Options for issuing a receipt
 */
export interface IssueOptions {
  /** Issuer URL (https://) */
  iss: string;

  /** Audience / resource URL (https://) */
  aud: string;

  /** Amount in smallest currency unit */
  amt: number;

  /** ISO 4217 currency code (uppercase) */
  cur: string;

  /** Payment rail identifier */
  rail: string;

  /** Rail-specific payment reference */
  reference: string;

  /** Asset transferred (e.g., "USD", "USDC", "BTC") - defaults to currency if not provided */
  asset?: string;

  /** Environment ("live" or "test") - defaults to "test" */
  env?: 'live' | 'test';

  /** Network/rail identifier (optional, SHOULD for crypto) */
  network?: string;

  /** Facilitator reference (optional) */
  facilitator_ref?: string;

  /** Rail-specific evidence (opaque) - defaults to empty object if not provided */
  evidence?: unknown;

  /** Idempotency key (optional) */
  idempotency_key?: string;

  /** Rail-specific metadata (optional) */
  metadata?: Record<string, unknown>;

  /** Subject URI (optional) */
  subject?: string;

  /** Extensions (optional) */
  ext?: PEACReceiptClaims['ext'];

  /** Expiry timestamp (Unix seconds, optional) */
  exp?: number;

  /** Subject profile snapshot for envelope (v0.9.17+, optional) */
  subject_snapshot?: SubjectProfileSnapshot;

  /** Ed25519 private key (32 bytes) */
  privateKey: Uint8Array;

  /** Key ID (ISO 8601 timestamp) */
  kid: string;
}

/**
 * Result of issuing a receipt
 */
export interface IssueResult {
  /** JWS compact serialization */
  jws: string;

  /** Validated subject snapshot (if provided) */
  subject_snapshot?: SubjectProfileSnapshot;
}

/**
 * Issue a PEAC receipt
 *
 * @param options - Receipt options
 * @returns Issue result with JWS and optional subject_snapshot
 */
export async function issue(options: IssueOptions): Promise<IssueResult> {
  // Validate URLs
  if (!options.iss.startsWith('https://')) {
    throw new Error('Issuer URL must start with https://');
  }
  if (!options.aud.startsWith('https://')) {
    throw new Error('Audience URL must start with https://');
  }
  if (options.subject && !options.subject.startsWith('https://')) {
    throw new Error('Subject URI must start with https://');
  }

  // Validate currency code
  if (!/^[A-Z]{3}$/.test(options.cur)) {
    throw new Error('Currency must be ISO 4217 uppercase (e.g., USD)');
  }

  // Validate amount
  if (!Number.isInteger(options.amt) || options.amt < 0) {
    throw new Error('Amount must be a non-negative integer');
  }

  // Validate expiry (if provided)
  if (options.exp !== undefined) {
    if (!Number.isInteger(options.exp) || options.exp < 0) {
      throw new Error('Expiry must be a non-negative integer');
    }
  }

  // Generate UUIDv7 for receipt ID
  const rid = uuidv7();

  // Get current timestamp
  const iat = Math.floor(Date.now() / 1000);

  // Build receipt claims
  const claims: PEACReceiptClaims = {
    iss: options.iss,
    aud: options.aud,
    iat,
    rid,
    amt: options.amt,
    cur: options.cur,
    payment: {
      rail: options.rail,
      reference: options.reference,
      amount: options.amt,
      currency: options.cur,
      asset: options.asset ?? options.cur, // Default asset to currency for backward compatibility
      env: options.env ?? 'test', // Default to test environment for backward compatibility
      evidence: options.evidence ?? {}, // Default to empty object for backward compatibility
      ...(options.network && { network: options.network }),
      ...(options.facilitator_ref && { facilitator_ref: options.facilitator_ref }),
      ...(options.idempotency_key && { idempotency_key: options.idempotency_key }),
      ...(options.metadata && { metadata: options.metadata }),
    },
    ...(options.exp && { exp: options.exp }),
    ...(options.subject && { subject: { uri: options.subject } }),
    ...(options.ext && { ext: options.ext }),
  };

  // Validate claims with Zod
  ReceiptClaims.parse(claims);

  // Validate subject_snapshot if provided (v0.9.17+)
  // This validates schema and logs advisory PII warning if applicable
  const validatedSnapshot = validateSubjectSnapshot(options.subject_snapshot);

  // Sign with Ed25519
  const jws = await sign(claims, options.privateKey, options.kid);

  return {
    jws,
    ...(validatedSnapshot && { subject_snapshot: validatedSnapshot }),
  };
}
