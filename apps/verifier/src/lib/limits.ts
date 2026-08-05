/**
 * Input bounds for the local record verifier.
 *
 * Values are fixed by the verification contract. Do not widen one here
 * without changing the machine contract first: the parity gate compares them.
 */

export const MAX_RECORD_BYTES = 64 * 1024;
export const MAX_JWK_BYTES = 16 * 1024;
export const MAX_JWKS_BYTES = 128 * 1024;
export const MAX_JWKS_KEYS = 32;
/**
 * The `kid` bound is NOT redefined here.
 *
 * It is re-exported from the package-private rule that the canonical verifier itself applies, so
 * this application cannot drift from the verifier it delegates to. A separately-declared bound here
 * would make it possible for routing to reject a kid the canonical verifier accepts.
 */
export { MAX_KID_UTF8_BYTES } from '../../../../packages/crypto/src/kid';
export const ED25519_PUBLIC_KEY_BYTES = 32;
export const MAX_CONTEXT_BYTES = 8 * 1024;
export const MAX_TRUSTED_THUMBPRINTS = 32;
export const MAX_ALLOWED_KIDS = 32;
export const MAX_ALLOWED_RECORD_TYPES = 32;
export const MAX_IDENTIFIER_BYTES = 256;
export const MAX_VERIFIER_BUILD_BYTES = 128;

/** Matches the canonical verifier's own default. */
export const DEFAULT_MAX_CLOCK_SKEW_SECONDS = 300;

/**
 * Hard ceiling on caller-supplied clock skew.
 *
 * Deliberately 1 hour, not 24. An unbounded (or day-long) skew silently disables temporal
 * validation while still producing a confident-looking deterministic report: a record a full day
 * outside its intended validity window would appear accepted.
 */
export const MAX_CLOCK_SKEW_SECONDS_LIMIT = 3600;
