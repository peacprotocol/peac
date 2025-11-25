/**
 * Wire format constants - FROZEN
 *
 * These constants are now sourced from @peac/kernel
 * (normative source: specs/kernel/constants.json)
 */

import { WIRE_TYPE, ALGORITHMS, HEADERS, DISCOVERY } from '@peac/kernel';

/**
 * Wire format version - FROZEN at 0.9 with v1.0-equivalent semantics
 * Will flip to 1.0 at GA (Week 12)
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
 * Discovery file path
 */
export const PEAC_DISCOVERY_PATH = DISCOVERY.manifestPath;

/**
 * Maximum discovery file size (20 lines × ~100 chars/line)
 */
export const PEAC_DISCOVERY_MAX_BYTES = 2000 as const;
