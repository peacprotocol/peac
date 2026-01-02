/**
 * PEAC Purpose Types (v0.9.24+)
 *
 * Purpose type hierarchy for forward-compatible purpose handling:
 * - PurposeToken: Wire format (string) - preserves unknown tokens
 * - CanonicalPurpose: PEAC's normative vocabulary - enforcement semantics
 * - PurposeReason: Audit spine for enforcement decisions
 *
 * @see specs/kernel/constants.json for canonical values
 */

/**
 * PurposeToken - Wire format string with validation grammar
 *
 * Allows unknown tokens for forward compatibility. Any valid token
 * that matches the grammar is accepted and preserved.
 *
 * Grammar: lowercase, max 64 chars, [a-z0-9_-] + optional vendor prefix (vendor:token)
 * Hyphens allowed for interop with external systems (Cloudflare, IETF AIPREF, etc.)
 *
 * Examples: "train", "search", "user_action", "user-action", "cf:ai_crawler", "cf:ai-crawler"
 */
export type PurposeToken = string;

/**
 * CanonicalPurpose - PEAC's normative vocabulary
 *
 * These are the only tokens PEAC enforces semantics for.
 * Matches specs/kernel/constants.json purpose.canonical_tokens.
 *
 * - train: Model training data collection
 * - search: Traditional search indexing
 * - user_action: Agent acting on user behalf (v0.9.24+)
 * - inference: Runtime inference / RAG
 * - index: Content indexing (store)
 */
export type CanonicalPurpose = 'train' | 'search' | 'user_action' | 'inference' | 'index';

/**
 * Internal-only purpose value (never valid on wire)
 *
 * Applied when PEAC-Purpose header is missing or empty.
 * Explicit "undeclared" in request -> 400 Bad Request.
 */
export type InternalPurpose = 'undeclared';

/**
 * PurposeReason - Audit spine for enforcement decisions
 *
 * Captures WHY a purpose was enforced differently than declared.
 * Matches specs/kernel/constants.json purpose.reason_values.
 */
export type PurposeReason =
  | 'allowed' // Purpose permitted as declared (happy path)
  | 'constrained' // Allowed with rate limits applied
  | 'denied' // Purpose rejected by policy
  | 'downgraded' // More restrictive purpose applied
  | 'undeclared_default' // No purpose declared, default applied
  | 'unknown_preserved'; // Unknown purpose token, preserved but flagged

/**
 * Legacy purpose tokens from pre-v0.9.24
 *
 * These are mapped to CanonicalPurpose via mapLegacyToCanonical().
 * Retained for backward compatibility with existing ControlPurpose usage.
 */
export type LegacyPurpose = 'crawl' | 'ai_input' | 'ai_index';

// ============================================================================
// Validation Constants
// ============================================================================

/**
 * Grammar validation for PurposeToken
 *
 * Pattern: lowercase letter followed by lowercase letters, digits, underscores,
 * or hyphens, with optional vendor prefix separated by colon.
 *
 * Hyphens are allowed for interoperability with external systems (Cloudflare,
 * IETF AIPREF, etc.) that use hyphenated tokens like "user-action" or "train-ai".
 *
 * Valid: "train", "user_action", "user-action", "cf:ai_crawler", "cf:ai-crawler"
 * Invalid: "Train", "USER_ACTION", "123abc", "", "-train", "train-"
 */
export const PURPOSE_TOKEN_REGEX = /^[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)?$/;

/** Maximum length for a purpose token */
export const MAX_PURPOSE_TOKEN_LENGTH = 64;

/** Maximum number of purpose tokens per request (RECOMMENDED, not MUST) */
export const MAX_PURPOSE_TOKENS_PER_REQUEST = 10;

/** Canonical purpose tokens (from constants.json) */
export const CANONICAL_PURPOSES: readonly CanonicalPurpose[] = [
  'train',
  'search',
  'user_action',
  'inference',
  'index',
] as const;

/** Purpose reason values (from constants.json) */
export const PURPOSE_REASONS: readonly PurposeReason[] = [
  'allowed',
  'constrained',
  'denied',
  'downgraded',
  'undeclared_default',
  'unknown_preserved',
] as const;

/** Internal-only purpose value */
export const INTERNAL_PURPOSE_UNDECLARED: InternalPurpose = 'undeclared';

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Check if a string is a valid PurposeToken
 *
 * Validates against the purpose token grammar:
 * - Lowercase letters, digits, underscores, hyphens
 * - Optional vendor prefix with colon
 * - Max 64 characters
 * - Must start with lowercase letter
 *
 * @param token - String to validate
 * @returns true if valid PurposeToken
 */
export function isValidPurposeToken(token: string): token is PurposeToken {
  if (typeof token !== 'string') return false;
  if (token.length === 0 || token.length > MAX_PURPOSE_TOKEN_LENGTH) return false;
  return PURPOSE_TOKEN_REGEX.test(token);
}

/**
 * Check if a PurposeToken is a CanonicalPurpose
 *
 * @param token - Token to check
 * @returns true if token is in canonical vocabulary
 */
export function isCanonicalPurpose(token: string): token is CanonicalPurpose {
  return (CANONICAL_PURPOSES as readonly string[]).includes(token);
}

/**
 * Check if a PurposeToken is a LegacyPurpose
 *
 * @param token - Token to check
 * @returns true if token is a legacy purpose
 */
export function isLegacyPurpose(token: string): token is LegacyPurpose {
  return token === 'crawl' || token === 'ai_input' || token === 'ai_index';
}

/**
 * Check if a string is a valid PurposeReason
 *
 * @param reason - String to check
 * @returns true if valid PurposeReason
 */
export function isValidPurposeReason(reason: string): reason is PurposeReason {
  return (PURPOSE_REASONS as readonly string[]).includes(reason);
}

/**
 * Check if a purpose token is the internal-only "undeclared" value
 *
 * Used to reject explicit "undeclared" on wire (400 Bad Request).
 *
 * @param token - Token to check
 * @returns true if token is "undeclared"
 */
export function isUndeclaredPurpose(token: string): boolean {
  return token === INTERNAL_PURPOSE_UNDECLARED;
}

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Normalize a purpose token
 *
 * Applies normalization rules:
 * - Trim whitespace
 * - Lowercase
 *
 * @param token - Raw token from header
 * @returns Normalized token
 */
export function normalizePurposeToken(token: string): string {
  return token.trim().toLowerCase();
}

/**
 * Parse PEAC-Purpose header value into array of tokens
 *
 * Applies parsing rules:
 * - Split on commas
 * - Trim optional whitespace (OWS) around tokens
 * - Lowercase all tokens
 * - Drop empty tokens
 * - Deduplicate
 * - Preserve input order
 *
 * @param headerValue - Raw PEAC-Purpose header value
 * @returns Array of normalized PurposeToken values
 */
export function parsePurposeHeader(headerValue: string): PurposeToken[] {
  if (!headerValue || typeof headerValue !== 'string') {
    return [];
  }

  const seen = new Set<string>();
  const tokens: PurposeToken[] = [];

  for (const part of headerValue.split(',')) {
    const normalized = normalizePurposeToken(part);
    if (normalized.length > 0 && !seen.has(normalized)) {
      seen.add(normalized);
      tokens.push(normalized);
    }
  }

  return tokens;
}

/**
 * Validate parsed purpose tokens
 *
 * Returns validation result with:
 * - valid: All tokens pass grammar validation
 * - tokens: All normalized tokens (including invalid ones)
 * - invalidTokens: Tokens that failed grammar validation
 * - undeclaredPresent: true if explicit "undeclared" was found (should reject)
 *
 * @param tokens - Array of parsed tokens
 * @returns Validation result
 */
export interface PurposeValidationResult {
  valid: boolean;
  tokens: PurposeToken[];
  invalidTokens: string[];
  undeclaredPresent: boolean;
}

export function validatePurposeTokens(tokens: PurposeToken[]): PurposeValidationResult {
  const invalidTokens: string[] = [];
  let undeclaredPresent = false;

  for (const token of tokens) {
    if (isUndeclaredPurpose(token)) {
      undeclaredPresent = true;
    }
    if (!isValidPurposeToken(token)) {
      invalidTokens.push(token);
    }
  }

  return {
    valid: invalidTokens.length === 0 && !undeclaredPresent,
    tokens,
    invalidTokens,
    undeclaredPresent,
  };
}

/**
 * Derive known canonical purposes from declared tokens
 *
 * Filters purpose_declared to get only canonical purposes.
 * This is a helper derivation, NOT stored on wire.
 *
 * @param declared - Array of declared PurposeTokens
 * @returns Array of CanonicalPurpose tokens
 */
export function deriveKnownPurposes(declared: PurposeToken[]): CanonicalPurpose[] {
  return declared.filter(isCanonicalPurpose);
}

// ============================================================================
// Legacy Mapping
// ============================================================================

/**
 * Legacy purpose to canonical mapping
 */
const LEGACY_TO_CANONICAL: Record<LegacyPurpose, CanonicalPurpose> = {
  crawl: 'index', // Crawl implies indexing
  ai_input: 'inference', // RAG/grounding -> inference context
  ai_index: 'index', // AI-powered indexing -> index
};

/**
 * Map legacy purpose to canonical purpose
 *
 * Used for backward compatibility with pre-v0.9.24 ControlPurpose values.
 *
 * @param legacy - Legacy purpose token
 * @returns Mapping result with canonical purpose and audit note
 */
export interface LegacyMappingResult {
  canonical: CanonicalPurpose;
  mapping_note: string;
}

export function mapLegacyToCanonical(legacy: LegacyPurpose): LegacyMappingResult {
  const canonical = LEGACY_TO_CANONICAL[legacy];
  return {
    canonical,
    mapping_note: `Mapped legacy '${legacy}' to canonical '${canonical}'`,
  };
}

/**
 * Normalize any purpose token (canonical, legacy, or unknown)
 *
 * Returns the canonical form if known, otherwise preserves the token.
 *
 * @param token - Any valid PurposeToken
 * @returns Canonical purpose if mapped, otherwise original token
 */
export function normalizeToCanonicalOrPreserve(
  token: PurposeToken
):
  | { purpose: CanonicalPurpose; mapped: false }
  | { purpose: PurposeToken; mapped: true; from: LegacyPurpose }
  | { purpose: PurposeToken; mapped: false; unknown: true } {
  if (isCanonicalPurpose(token)) {
    return { purpose: token, mapped: false };
  }
  if (isLegacyPurpose(token)) {
    return { purpose: LEGACY_TO_CANONICAL[token], mapped: true, from: token };
  }
  return { purpose: token, mapped: false, unknown: true };
}
