/**
 * x402 challenge type mapping.
 *
 * Maps x402 HTTP 402 responses to a normalized challenge type taxonomy.
 * For x402, the challenge is always 'payment' since the protocol is
 * specifically designed for payment-gated resource access.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Normalized challenge types across protocols.
 *
 * This taxonomy enables cross-protocol comparison of access challenges:
 * - payment: Resource requires payment (x402, ACP checkout)
 * - auth: Resource requires authentication
 * - consent: Resource requires user consent
 * - rate_limit: Access throttled
 * - purpose_denied: Access denied based on declared purpose
 * - other: Unrecognized challenge type
 */
export type ChallengeType =
  | 'payment'
  | 'auth'
  | 'consent'
  | 'rate_limit'
  | 'purpose_denied'
  | 'other';

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/**
 * Map x402 response to a normalized challenge type.
 *
 * x402 is a payment protocol; the challenge is always 'payment'.
 * This function exists for cross-protocol normalization: other protocols
 * may return different challenge types from the same taxonomy.
 *
 * @returns 'payment' (always, for x402)
 */
export function mapX402ToChallengeType(): ChallengeType {
  return 'payment';
}
