/**
 * PEAC Protocol Constants
 * Derived from specs/kernel/constants.json
 *
 * NOTE: This file is manually synced for v0.9.15.
 * From v0.9.16+, this will be auto-generated via codegen.
 */

/**
 * Wire format type for PEAC receipts
 * Frozen at peac.receipt/0.9 until v1.0.0
 */
export const WIRE_TYPE = 'peac.receipt/0.9' as const;

/**
 * Wire format version (extracted from WIRE_TYPE)
 * Use this for wire_version fields in receipts
 */
export const WIRE_VERSION = '0.9' as const;

/**
 * Supported cryptographic algorithms
 */
export const ALGORITHMS = {
  supported: ['EdDSA'] as const,
  default: 'EdDSA' as const,
} as const;

/**
 * HTTP header names for PEAC protocol
 */
export const HEADERS = {
  receipt: 'PEAC-Receipt' as const,
  dpop: 'DPoP' as const,
  // Purpose headers (v0.9.24+)
  purpose: 'PEAC-Purpose' as const,
  purposeApplied: 'PEAC-Purpose-Applied' as const,
  purposeReason: 'PEAC-Purpose-Reason' as const,
} as const;

/**
 * Discovery manifest settings
 */
export const DISCOVERY = {
  manifestPath: '/.well-known/peac.txt' as const,
  manifestVersion: 'peac/0.9' as const,
  cacheTtlSeconds: 3600,
} as const;

/**
 * JWKS rotation and revocation settings
 */
export const JWKS = {
  rotationDays: 90,
  overlapDays: 7,
  emergencyRevocationHours: 24,
} as const;

/**
 * Receipt validation constants
 */
export const RECEIPT = {
  minReceiptIdLength: 16,
  maxReceiptIdLength: 64,
  defaultTtlSeconds: 86400, // 24 hours
} as const;

/**
 * Payment amount validation limits (in cents/smallest currency unit)
 */
export const LIMITS = {
  maxAmountCents: 999999999999,
  minAmountCents: 1,
} as const;

/**
 * All constants export
 */
export const CONSTANTS = {
  WIRE_TYPE,
  WIRE_VERSION,
  ALGORITHMS,
  HEADERS,
  DISCOVERY,
  JWKS,
  RECEIPT,
  LIMITS,
} as const;
