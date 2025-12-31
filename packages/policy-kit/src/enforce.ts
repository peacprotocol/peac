/**
 * Decision Enforcement
 *
 * Helpers for enforcing policy decisions with explicit semantics.
 *
 * The `review` decision means "challenge unless requirement is satisfied".
 * By default, this means a valid receipt is required.
 *
 * @example
 * ```typescript
 * import { evaluate, enforceDecision } from '@peac/policy-kit';
 *
 * const result = evaluate(policy, context);
 * const enforcement = enforceDecision(result.decision, {
 *   receiptVerified: hasValidReceipt,
 * });
 *
 * if (enforcement.allowed) {
 *   // proceed
 * } else {
 *   // return enforcement.statusCode (402 or 403)
 * }
 * ```
 *
 * @packageDocumentation
 */

import type { ControlDecision } from './types';

/**
 * Context for enforcement decision
 */
export interface EnforcementContext {
  /**
   * Whether a valid PEAC receipt has been verified.
   * If true, `review` decisions are allowed.
   *
   * This is the only requirement for `review` decisions in v0.9.23.
   * Future versions may add additional attestation models.
   */
  receiptVerified?: boolean;
}

/**
 * Result of enforcement decision
 */
export interface EnforcementResult {
  /**
   * Whether access should be allowed
   */
  allowed: boolean;

  /**
   * Recommended HTTP status code
   * - 200: OK (allowed)
   * - 402: Payment Required (review decision, receipt needed)
   * - 403: Forbidden (deny decision)
   */
  statusCode: 200 | 402 | 403;

  /**
   * Reason for the decision
   */
  reason: string;

  /**
   * Whether a challenge should be issued (for review decisions)
   */
  challenge: boolean;

  /**
   * The original decision that was enforced
   */
  decision: ControlDecision;
}

/**
 * Enforce a policy decision with explicit semantics.
 *
 * Decision meanings:
 * - `allow`: Access is permitted (200)
 * - `deny`: Access is forbidden (403)
 * - `review`: Challenge unless requirement is satisfied (default: receipt required)
 *
 * The `review` decision is a "soft deny" that becomes "allow" when the
 * requirement (typically a valid receipt) is satisfied.
 *
 * @param decision - The policy decision to enforce
 * @param context - Enforcement context with requirement flags
 * @returns Enforcement result with allowed status and HTTP code
 *
 * @example
 * ```typescript
 * // Allow decision
 * enforceDecision('allow', {});
 * // { allowed: true, statusCode: 200, challenge: false }
 *
 * // Deny decision
 * enforceDecision('deny', {});
 * // { allowed: false, statusCode: 403, challenge: false }
 *
 * // Review without receipt
 * enforceDecision('review', { receiptVerified: false });
 * // { allowed: false, statusCode: 402, challenge: true }
 *
 * // Review with valid receipt
 * enforceDecision('review', { receiptVerified: true });
 * // { allowed: true, statusCode: 200, challenge: false }
 * ```
 */
export function enforceDecision(
  decision: ControlDecision,
  context: EnforcementContext = {}
): EnforcementResult {
  switch (decision) {
    case 'allow':
      return {
        allowed: true,
        statusCode: 200,
        reason: 'Access allowed by policy',
        challenge: false,
        decision,
      };

    case 'deny':
      return {
        allowed: false,
        statusCode: 403,
        reason: 'Access denied by policy',
        challenge: false,
        decision,
      };

    case 'review': {
      // review = "challenge unless receiptVerified === true"
      // This is the only requirement in v0.9.23
      if (context.receiptVerified === true) {
        return {
          allowed: true,
          statusCode: 200,
          reason: 'Access allowed - receipt verified',
          challenge: false,
          decision,
        };
      }

      // No valid receipt - return 402 Payment Required with challenge
      return {
        allowed: false,
        statusCode: 402,
        reason: 'Access requires verification - present valid receipt',
        challenge: true,
        decision,
      };
    }

    default: {
      // Exhaustive check - should never reach here
      const _exhaustive: never = decision;
      return {
        allowed: false,
        statusCode: 403,
        reason: `Unknown decision: ${_exhaustive}`,
        challenge: false,
        decision,
      };
    }
  }
}

/**
 * Check if an enforcement result requires a challenge response
 *
 * @param result - Enforcement result
 * @returns true if a challenge should be issued
 */
export function requiresChallenge(result: EnforcementResult): boolean {
  return result.challenge;
}

/**
 * Get the WWW-Authenticate header value for a challenge
 *
 * @param result - Enforcement result requiring challenge
 * @returns WWW-Authenticate header value or undefined if no challenge needed
 *
 * @example
 * ```typescript
 * const result = enforceDecision('review', { receiptVerified: false });
 * const header = getChallengeHeader(result);
 * // 'PEAC realm="receipt", error="receipt_required"'
 * ```
 */
export function getChallengeHeader(result: EnforcementResult): string | undefined {
  if (!result.challenge) {
    return undefined;
  }

  return 'PEAC realm="receipt", error="receipt_required"';
}

/**
 * Convenience function to enforce and get HTTP response details
 *
 * @param decision - Policy decision
 * @param context - Enforcement context
 * @returns Object with status code and headers for HTTP response
 *
 * @example
 * ```typescript
 * const { status, headers, allowed } = enforceForHttp('review', {
 *   receiptVerified: false,
 * });
 * // { status: 402, headers: { 'WWW-Authenticate': '...' }, allowed: false }
 * ```
 */
export function enforceForHttp(
  decision: ControlDecision,
  context: EnforcementContext = {}
): {
  status: number;
  headers: Record<string, string>;
  allowed: boolean;
  reason: string;
} {
  const result = enforceDecision(decision, context);
  const headers: Record<string, string> = {};

  if (result.challenge) {
    const challengeHeader = getChallengeHeader(result);
    if (challengeHeader) {
      headers['WWW-Authenticate'] = challengeHeader;
    }
  }

  return {
    status: result.statusCode,
    headers,
    allowed: result.allowed,
    reason: result.reason,
  };
}
