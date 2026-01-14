/**
 * Wire format constants - FROZEN
 *
 * These constants are now sourced from @peac/kernel
 * (normative source: specs/kernel/constants.json)
 */

import { WIRE_TYPE, ALGORITHMS, HEADERS, POLICY, ISSUER_CONFIG, DISCOVERY } from '@peac/kernel';

/**
 * Wire format version - peac-receipt/0.1
 * Normalized in v0.10.0 to peac-<artifact>/<major>.<minor> pattern
 */
export const PEAC_WIRE_TYP = WIRE_TYPE;

/**
 * Signature algorithm - FROZEN forever
 */
export const PEAC_ALG = ALGORITHMS.default;

/**
 * Canonical header name
 */
export const PEAC_RECEIPT_HEADER = HEADERS.receipt;

/**
 * Purpose header names (v0.9.24+)
 */
export const PEAC_PURPOSE_HEADER = HEADERS.purpose;
export const PEAC_PURPOSE_APPLIED_HEADER = HEADERS.purposeApplied;
export const PEAC_PURPOSE_REASON_HEADER = HEADERS.purposeReason;

/**
 * Policy manifest path (/.well-known/peac.txt)
 * @see docs/specs/PEAC-TXT.md
 */
export const PEAC_POLICY_PATH = POLICY.manifestPath;

/**
 * Policy manifest fallback path (/peac.txt)
 */
export const PEAC_POLICY_FALLBACK_PATH = POLICY.fallbackPath;

/**
 * Maximum policy manifest size
 */
export const PEAC_POLICY_MAX_BYTES = POLICY.maxBytes;

/**
 * Issuer configuration path (/.well-known/peac-issuer.json)
 * @see docs/specs/PEAC-ISSUER.md
 */
export const PEAC_ISSUER_CONFIG_PATH = ISSUER_CONFIG.configPath;

/**
 * Issuer configuration version
 */
export const PEAC_ISSUER_CONFIG_VERSION = ISSUER_CONFIG.configVersion;

/**
 * Maximum issuer configuration size
 */
export const PEAC_ISSUER_CONFIG_MAX_BYTES = ISSUER_CONFIG.maxBytes;

/**
 * @deprecated Use PEAC_POLICY_PATH instead. Will be removed in v1.0.
 */
export const PEAC_DISCOVERY_PATH = DISCOVERY.manifestPath;

/**
 * @deprecated Use PEAC_POLICY_MAX_BYTES instead. Will be removed in v1.0.
 */
export const PEAC_DISCOVERY_MAX_BYTES = 2000 as const;

/**
 * JSON Schema URL for PEAC receipt wire format v0.1
 *
 * This is the canonical $id for the root schema.
 * Use for schema references and cross-implementation validation.
 *
 * @since v0.10.0
 */
export const PEAC_RECEIPT_SCHEMA_URL =
  'https://peacprotocol.org/schemas/wire/0.1/peac-receipt.0.1.schema.json' as const;
