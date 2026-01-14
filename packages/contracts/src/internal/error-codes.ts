/**
 * Internal error code utilities.
 *
 * @internal - Not part of public API. Consumers should import from `@peac/contracts`.
 */

import { CANONICAL_ERROR_CODES, type PeacErrorCode } from '../codes.js';

/**
 * Set of all canonical PEAC error codes for O(1) validation.
 *
 * Typed as ReadonlySet to prevent accidental mutation.
 *
 * @internal
 */
const VALUES = Object.values(CANONICAL_ERROR_CODES) as PeacErrorCode[];
export const PEAC_ERROR_CODE_SET: ReadonlySet<PeacErrorCode> = new Set(VALUES);
