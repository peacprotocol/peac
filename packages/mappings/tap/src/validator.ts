/**
 * TAP-specific validation rules.
 *
 * These rules are enforced here (NOT in http-signatures):
 * - 8-minute window: expires - created <= 480
 * - Time validation: created <= now <= expires
 * - Tag allowlist: fail-closed by default
 * - Algorithm: ed25519 required
 */

import type { ParsedSignatureParams } from '@peac/http-signatures';
import { TAP_TAGS, TAP_CONSTANTS, type TapTag } from './types.js';
import { ErrorCodes, TapError } from './errors.js';

/**
 * Validate TAP-specific time constraints.
 *
 * @param params - Parsed signature parameters
 * @param now - Current Unix timestamp
 * @throws TapError if validation fails
 */
export function validateTapTimeConstraints(params: ParsedSignatureParams, now: number): void {
  // Validate expires is present for TAP
  if (params.expires === undefined) {
    throw new TapError(ErrorCodes.TAP_TIME_INVALID, 'TAP signatures must have expires parameter');
  }

  // Validate window size (8 minutes max)
  const windowSeconds = params.expires - params.created;
  if (windowSeconds > TAP_CONSTANTS.MAX_WINDOW_SECONDS) {
    throw new TapError(
      ErrorCodes.TAP_WINDOW_TOO_LARGE,
      `Window too large: ${windowSeconds}s > ${TAP_CONSTANTS.MAX_WINDOW_SECONDS}s`
    );
  }

  // Validate created <= now (with some tolerance for clock skew)
  if (params.created > now + TAP_CONSTANTS.CLOCK_SKEW_SECONDS) {
    throw new TapError(
      ErrorCodes.TAP_TIME_INVALID,
      `Signature created in future: ${params.created} > ${now}`
    );
  }

  // Validate now <= expires
  if (now > params.expires) {
    throw new TapError(
      ErrorCodes.TAP_TIME_INVALID,
      `Signature expired: ${params.expires} < ${now}`
    );
  }
}

/**
 * Validate TAP algorithm.
 *
 * @param alg - Algorithm from signature params
 * @throws TapError if algorithm is not ed25519
 */
export function validateTapAlgorithm(alg: string): void {
  if (alg !== TAP_CONSTANTS.REQUIRED_ALGORITHM) {
    throw new TapError(
      ErrorCodes.TAP_ALGORITHM_INVALID,
      `Invalid algorithm: ${alg} (must be ${TAP_CONSTANTS.REQUIRED_ALGORITHM})`
    );
  }
}

/**
 * Validate TAP tag.
 *
 * @param tag - Tag from signature params
 * @param allowUnknownTags - Whether to allow unknown tags
 * @throws TapError if tag is unknown and allowUnknownTags is false
 */
export function validateTapTag(tag: string | undefined, allowUnknownTags: boolean): void {
  if (!tag) {
    // Tag is optional in RFC 9421, but TAP should have one
    // For now, allow missing tag but log warning
    return;
  }

  if (!TAP_TAGS.includes(tag as TapTag) && !allowUnknownTags) {
    throw new TapError(
      ErrorCodes.TAP_TAG_UNKNOWN,
      `Unknown tag: ${tag} (allowed: ${TAP_TAGS.join(', ')})`
    );
  }
}

/**
 * Check if a tag is a known TAP tag.
 */
export function isKnownTapTag(tag: string): tag is TapTag {
  return TAP_TAGS.includes(tag as TapTag);
}
