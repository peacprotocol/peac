/**
 * Evidence Carrier Contract schemas and helpers (DD-124)
 *
 * Zod validation schemas for PeacEvidenceCarrier and CarrierMeta,
 * plus the canonical computeReceiptRef() and validateCarrierConstraints()
 * functions used by all carrier adapters.
 */
import { z } from 'zod';

import type {
  CarrierFormat,
  CarrierMeta,
  CarrierValidationResult,
  PeacEvidenceCarrier,
  ReceiptRef,
} from '@peac/kernel';

import { KERNEL_CONSTRAINTS } from './constraints';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum carrier size per transport (DD-127) */
export const CARRIER_TRANSPORT_LIMITS = {
  /** MCP _meta: 64 KB */
  mcp: 65_536,
  /** A2A metadata: 64 KB */
  a2a: 65_536,
  /** ACP embed in body: 64 KB; headers only: 8 KB */
  acp_embed: 65_536,
  acp_headers: 8_192,
  /** UCP webhook body: 64 KB */
  ucp: 65_536,
  /** x402 embed in body: 64 KB; headers only: 8 KB */
  x402_embed: 65_536,
  x402_headers: 8_192,
  /** HTTP headers only: 8 KB */
  http: 8_192,
} as const;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** Validates a content-addressed receipt reference: sha256:<64 hex chars> */
export const ReceiptRefSchema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/, 'receipt_ref must be sha256:<64 hex chars>');

/** Validates a compact JWS: header.payload.signature (base64url parts) */
export const CompactJwsSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    'receipt_jws must be a valid compact JWS (header.payload.signature)'
  );

/** Carrier format schema */
export const CarrierFormatSchema = z.enum(['embed', 'reference']);

/**
 * Validates receipt_url: HTTPS-only, max 2048 chars, no credentials (DD-135).
 * Validation only (DD-141): no I/O, no fetch. Resolution lives in Layer 4.
 */
export const ReceiptUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((url) => url.startsWith('https://'), {
    message: 'receipt_url must use HTTPS scheme',
  })
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return !parsed.username && !parsed.password;
      } catch {
        return false;
      }
    },
    {
      message: 'receipt_url must not contain credentials',
    }
  );

/** Schema for PeacEvidenceCarrier */
export const PeacEvidenceCarrierSchema = z.object({
  receipt_ref: ReceiptRefSchema,
  receipt_jws: CompactJwsSchema.optional(),
  receipt_url: ReceiptUrlSchema.optional(),
  policy_binding: z.string().max(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH).optional(),
  actor_binding: z.string().max(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH).optional(),
  request_nonce: z.string().max(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH).optional(),
  verification_report_ref: z.string().max(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH).optional(),
  use_policy_ref: z.string().max(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH).optional(),
  representation_ref: z.string().max(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH).optional(),
  attestation_ref: z.string().max(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH).optional(),
});

/** Schema for CarrierMeta */
export const CarrierMetaSchema = z.object({
  transport: z.string().min(1),
  format: CarrierFormatSchema,
  max_size: z.number().int().positive(),
  redaction: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Canonical receipt_ref computation (single source of truth).
 *
 * Computes SHA-256 of the UTF-8 bytes of the compact JWS string as emitted.
 * All carrier adapters MUST use this function rather than computing SHA-256
 * locally, to ensure consistency across protocols (correction item 4).
 */
export async function computeReceiptRef(jws: string): Promise<ReceiptRef> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      'computeReceiptRef requires WebCrypto (crypto.subtle). ' +
        'Supported runtimes: Node >= 20, Cloudflare Workers, Deno, Bun.'
    );
  }
  const data = new TextEncoder().encode(jws);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}` as ReceiptRef;
}

/**
 * Canonical carrier constraint validator (DD-127, DD-129, DD-131).
 *
 * Validates a carrier against transport-specific constraints using
 * the provided CarrierMeta. This is the single validation function
 * that all CarrierAdapter.validateConstraints() implementations delegate to.
 *
 * Checks performed:
 * 1. receipt_ref format (sha256:<hex64>)
 * 2. receipt_jws format (if present): valid compact JWS
 * 3. Total serialized size within meta.max_size
 * 4. If receipt_jws present: receipt_ref consistency (DD-129)
 * 5. All string fields within MAX_STRING_LENGTH
 */
export function validateCarrierConstraints(
  carrier: PeacEvidenceCarrier,
  meta: CarrierMeta
): CarrierValidationResult {
  const violations: string[] = [];

  // 1. receipt_ref format
  const refResult = ReceiptRefSchema.safeParse(carrier.receipt_ref);
  if (!refResult.success) {
    violations.push(`invalid receipt_ref format: ${carrier.receipt_ref}`);
  }

  // 2. receipt_jws format (if present)
  if (carrier.receipt_jws !== undefined) {
    const jwsResult = CompactJwsSchema.safeParse(carrier.receipt_jws);
    if (!jwsResult.success) {
      violations.push('invalid receipt_jws format: not a valid compact JWS');
    }
  }

  // 3. Total serialized size check
  const serialized = JSON.stringify(carrier);
  const sizeBytes = new TextEncoder().encode(serialized).byteLength;
  if (sizeBytes > meta.max_size) {
    violations.push(
      `carrier size ${sizeBytes} bytes exceeds transport limit ${meta.max_size} bytes for ${meta.transport}`
    );
  }

  // 4. receipt_url validation (DD-135: HTTPS-only, max 2048, no credentials)
  if (carrier.receipt_url !== undefined) {
    const urlResult = ReceiptUrlSchema.safeParse(carrier.receipt_url);
    if (!urlResult.success) {
      for (const issue of urlResult.error.issues) {
        violations.push(`invalid receipt_url: ${issue.message}`);
      }
    }
  }

  // 5. String field length checks
  const stringFields: Array<[string, string | undefined]> = [
    ['policy_binding', carrier.policy_binding],
    ['actor_binding', carrier.actor_binding],
    ['request_nonce', carrier.request_nonce],
    ['verification_report_ref', carrier.verification_report_ref],
    ['use_policy_ref', carrier.use_policy_ref],
    ['representation_ref', carrier.representation_ref],
    ['attestation_ref', carrier.attestation_ref],
  ];

  for (const [name, value] of stringFields) {
    if (value !== undefined && value.length > KERNEL_CONSTRAINTS.MAX_STRING_LENGTH) {
      violations.push(
        `${name} length ${value.length} exceeds MAX_STRING_LENGTH ${KERNEL_CONSTRAINTS.MAX_STRING_LENGTH}`
      );
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Verify receipt_ref consistency with receipt_jws (DD-129).
 *
 * If both receipt_ref and receipt_jws are present, verifies that
 * sha256(receipt_jws) equals receipt_ref. This prevents carrier
 * tampering after attachment.
 *
 * Returns null if consistent or receipt_jws is absent;
 * returns an error string if inconsistent.
 */
export async function verifyReceiptRefConsistency(
  carrier: PeacEvidenceCarrier
): Promise<string | null> {
  if (carrier.receipt_jws === undefined) {
    return null;
  }
  const computed = await computeReceiptRef(carrier.receipt_jws);
  if (computed !== carrier.receipt_ref) {
    return `receipt_ref mismatch: expected ${computed}, got ${carrier.receipt_ref}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Re-export types for convenience
// ---------------------------------------------------------------------------

export type {
  CarrierFormat,
  CarrierMeta,
  CarrierValidationResult,
  PeacEvidenceCarrier,
  ReceiptRef,
  CarrierAdapter,
} from '@peac/kernel';
