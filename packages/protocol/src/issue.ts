/**
 * Receipt issuance
 * Validates input, generates UUIDv7 rid, and signs with Ed25519
 */

import { uuidv7 } from 'uuidv7';
import { sign } from '@peac/crypto';
import type { JsonValue } from '@peac/kernel';
import { ZodError } from 'zod';
import {
  PEACReceiptClaims,
  ReceiptClaims,
  SubjectProfileSnapshot,
  validateSubjectSnapshot,
  createEvidenceNotJsonError,
  createWorkflowContextInvalidError,
  createWorkflowDagInvalidError,
  type PEACError,
  type PurposeToken,
  type CanonicalPurpose,
  type PurposeReason,
  isValidPurposeToken,
  isCanonicalPurpose,
  isValidPurposeReason,
  // Workflow correlation (v0.10.2+)
  type WorkflowContext,
  isValidWorkflowContext,
  hasValidDagSemantics,
  WORKFLOW_EXTENSION_KEY,
} from '@peac/schema';
import { providerRef } from '@peac/telemetry';
import { hashReceipt } from './telemetry.js';

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

  /** Rail-specific evidence (JSON-safe) - defaults to empty object if not provided */
  evidence?: JsonValue;

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

  /**
   * Purposes declared by the requesting agent (v0.9.24+, optional)
   *
   * From PEAC-Purpose request header. Accepts single token or array.
   * Unknown tokens are preserved for forward compatibility.
   */
  purpose?: PurposeToken | PurposeToken[];

  /**
   * Single purpose enforced by policy (v0.9.24+, optional)
   *
   * MUST be one of declared purposes OR a more restrictive downgrade.
   * Only canonical purposes have enforcement semantics.
   */
  purpose_enforced?: CanonicalPurpose;

  /**
   * Reason for enforcement decision (v0.9.24+, optional)
   *
   * The audit spine - explains WHY purpose was enforced as it was.
   */
  purpose_reason?: PurposeReason;

  /**
   * Workflow correlation context (v0.10.2+, optional)
   *
   * Links this receipt into a multi-step workflow DAG.
   * Added to ext['org.peacprotocol/workflow'].
   */
  workflow_context?: WorkflowContext;

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
 * Error thrown during receipt issuance
 *
 * Wraps a structured PEACError for programmatic handling.
 */
export class IssueError extends Error {
  /** Structured error details */
  readonly peacError: PEACError;

  constructor(peacError: PEACError) {
    const details = peacError.details as { message?: string } | undefined;
    super(details?.message ?? peacError.code);
    this.name = 'IssueError';
    this.peacError = peacError;
  }
}

/**
 * Issue a PEAC receipt
 *
 * @param options - Receipt options
 * @returns Issue result with JWS and optional subject_snapshot
 * @throws IssueError if evidence contains non-JSON-safe values
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

  // Normalize and validate purpose (v0.9.24+)
  let purposeDeclared: PurposeToken[] | undefined;
  if (options.purpose !== undefined) {
    // Normalize to array
    const rawPurposes = Array.isArray(options.purpose) ? options.purpose : [options.purpose];

    // Validate each token
    const invalidTokens: string[] = [];
    for (const token of rawPurposes) {
      if (!isValidPurposeToken(token)) {
        invalidTokens.push(token);
      }
    }
    if (invalidTokens.length > 0) {
      throw new Error(`Invalid purpose tokens: ${invalidTokens.join(', ')}`);
    }

    // Check for explicit 'undeclared' which is invalid on wire
    if (rawPurposes.includes('undeclared')) {
      throw new Error("Explicit 'undeclared' is not a valid purpose token (internal-only)");
    }

    purposeDeclared = rawPurposes;
  }

  // Validate purpose_enforced (must be canonical)
  if (options.purpose_enforced !== undefined) {
    if (!isCanonicalPurpose(options.purpose_enforced)) {
      throw new Error(
        `purpose_enforced must be a canonical purpose, got: ${options.purpose_enforced}`
      );
    }
  }

  // Validate purpose_reason
  if (options.purpose_reason !== undefined) {
    if (!isValidPurposeReason(options.purpose_reason)) {
      throw new Error(`Invalid purpose_reason: ${options.purpose_reason}`);
    }
  }

  // Validate workflow_context (v0.10.2+)
  if (options.workflow_context !== undefined) {
    if (!isValidWorkflowContext(options.workflow_context)) {
      throw new IssueError(createWorkflowContextInvalidError('Does not conform to WorkflowContextSchema'));
    }
    if (!hasValidDagSemantics(options.workflow_context)) {
      // Determine specific reason
      const ctx = options.workflow_context;
      const isSelfParent = ctx.parent_step_ids.includes(ctx.step_id);
      const hasDuplicates = new Set(ctx.parent_step_ids).size !== ctx.parent_step_ids.length;
      const reason = isSelfParent ? 'self_parent' : hasDuplicates ? 'duplicate_parent' : 'cycle';
      throw new IssueError(createWorkflowDagInvalidError(reason));
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
    // Build extensions (merge user-provided ext with workflow_context)
    ...((options.ext || options.workflow_context) && {
      ext: {
        ...options.ext,
        ...(options.workflow_context && {
          [WORKFLOW_EXTENSION_KEY]: options.workflow_context,
        }),
      },
    }),
    // Purpose claims (v0.9.24+)
    ...(purposeDeclared && { purpose_declared: purposeDeclared }),
    ...(options.purpose_enforced && { purpose_enforced: options.purpose_enforced }),
    ...(options.purpose_reason && { purpose_reason: options.purpose_reason }),
  };

  // Validate claims with Zod - map evidence errors to typed error
  try {
    ReceiptClaims.parse(claims);
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      // Check if any error path touches evidence
      const evidenceIssue = err.issues.find(
        (issue: { path: (string | number)[]; message: string }) =>
          issue.path.some((p: string | number) => p === 'evidence' || p === 'payment')
      );
      if (evidenceIssue && evidenceIssue.path.includes('evidence')) {
        const peacError = createEvidenceNotJsonError(evidenceIssue.message, evidenceIssue.path);
        throw new IssueError(peacError);
      }
    }
    throw err;
  }

  // Validate subject_snapshot if provided (v0.9.17+)
  // This validates schema and logs advisory PII warning if applicable
  const validatedSnapshot = validateSubjectSnapshot(options.subject_snapshot);

  // Track start time for telemetry
  const startTime = performance.now();

  // Sign with Ed25519
  const jws = await sign(claims, options.privateKey, options.kid);

  // Emit telemetry (no-throw guard)
  const p = providerRef.current;
  if (p) {
    try {
      const durationMs = performance.now() - startTime;
      p.onReceiptIssued({
        receiptHash: hashReceipt(jws),
        issuer: options.iss,
        kid: options.kid,
        durationMs,
      });
    } catch {
      // Telemetry MUST NOT break core flow
    }
  }

  return {
    jws,
    ...(validatedSnapshot && { subject_snapshot: validatedSnapshot }),
  };
}

/**
 * Issue a PEAC receipt and return just the JWS string
 *
 * Convenience wrapper for common header-centric flows where only the JWS is needed.
 * For access to validated subject_snapshot, use issue() instead.
 *
 * @param options - Receipt options
 * @returns JWS compact serialization
 */
export async function issueJws(options: IssueOptions): Promise<string> {
  const result = await issue(options);
  return result.jws;
}
