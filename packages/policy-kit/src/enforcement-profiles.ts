/**
 * Enforcement Profiles (v0.9.24+)
 *
 * Pre-defined profiles for handling undeclared and unknown purposes.
 * These are distinct from use-case profiles (api-provider, news-media, etc.).
 *
 * Three canonical profiles:
 * - `strict`: Deny undeclared purposes (regulated data, private APIs)
 * - `balanced`: Review + constraints for undeclared (general web, DEFAULT)
 * - `open`: Allow undeclared purposes with recording (public content, research)
 *
 * @example
 * ```typescript
 * import {
 *   getEnforcementProfile,
 *   evaluateWithProfile,
 *   ENFORCEMENT_PROFILES,
 * } from '@peac/policy-kit';
 *
 * // Get the balanced profile (default)
 * const profile = getEnforcementProfile('balanced');
 *
 * // Evaluate with enforcement profile
 * const result = evaluateWithProfile(policy, context, 'balanced');
 * ```
 *
 * @packageDocumentation
 */

import type {
  EnforcementProfile,
  EnforcementProfileId,
  PolicyConstraints,
  ControlDecision,
} from './types';

// -----------------------------------------------------------------------------
// Canonical Enforcement Profiles
// -----------------------------------------------------------------------------

/**
 * Strict enforcement profile.
 *
 * Use for: Regulated data, private APIs, compliance-critical resources.
 * - Undeclared purposes: DENY
 * - Unknown purpose tokens: DENY
 * - Receipts: Required
 */
export const STRICT_PROFILE: EnforcementProfile = {
  id: 'strict',
  name: 'Strict',
  description:
    'Deny undeclared purposes. Use for regulated data, private APIs, or compliance-critical resources.',
  undeclared_decision: 'deny',
  unknown_decision: 'deny',
  purpose_reason: 'denied',
  receipts: 'required',
};

/**
 * Balanced enforcement profile (DEFAULT).
 *
 * Use for: General web, gradual compliance, typical publisher use case.
 * - Undeclared purposes: REVIEW + constraints
 * - Unknown purpose tokens: REVIEW + preserve
 * - Receipts: Optional (encouraged)
 */
export const BALANCED_PROFILE: EnforcementProfile = {
  id: 'balanced',
  name: 'Balanced',
  description: 'Review undeclared purposes with rate limits. Default for general web publishers.',
  undeclared_decision: 'review',
  unknown_decision: 'review',
  purpose_reason: 'undeclared_default',
  default_constraints: {
    rate_limit: {
      window_s: 3600, // 1 hour
      max: 100,
      retry_after_s: 60,
    },
  },
  receipts: 'optional',
};

/**
 * Open enforcement profile.
 *
 * Use for: Public content, research data, open access resources.
 * - Undeclared purposes: ALLOW (recorded)
 * - Unknown purpose tokens: ALLOW (preserved)
 * - Receipts: Optional (for attribution)
 */
export const OPEN_PROFILE: EnforcementProfile = {
  id: 'open',
  name: 'Open',
  description:
    'Allow undeclared purposes with recording. Use for public content and research data.',
  undeclared_decision: 'allow',
  unknown_decision: 'allow',
  purpose_reason: 'allowed',
  receipts: 'optional',
};

/**
 * All canonical enforcement profiles indexed by ID.
 */
export const ENFORCEMENT_PROFILES: Record<EnforcementProfileId, EnforcementProfile> = {
  strict: STRICT_PROFILE,
  balanced: BALANCED_PROFILE,
  open: OPEN_PROFILE,
};

/**
 * Default enforcement profile ID.
 *
 * `balanced` is the default to encourage adoption while maintaining some protection.
 */
export const DEFAULT_ENFORCEMENT_PROFILE: EnforcementProfileId = 'balanced';

/**
 * All enforcement profile IDs.
 */
export const ENFORCEMENT_PROFILE_IDS: readonly EnforcementProfileId[] = [
  'strict',
  'balanced',
  'open',
];

// -----------------------------------------------------------------------------
// Profile Lookup Functions
// -----------------------------------------------------------------------------

/**
 * Get an enforcement profile by ID.
 *
 * @param id - Profile ID
 * @returns Enforcement profile
 * @throws Error if profile ID is invalid
 *
 * @example
 * ```typescript
 * const profile = getEnforcementProfile('balanced');
 * console.log(profile.undeclared_decision); // 'review'
 * ```
 */
export function getEnforcementProfile(id: EnforcementProfileId): EnforcementProfile {
  const profile = ENFORCEMENT_PROFILES[id];
  if (!profile) {
    throw new Error(`Invalid enforcement profile ID: ${id}`);
  }
  return profile;
}

/**
 * Check if a string is a valid enforcement profile ID.
 *
 * @param id - String to check
 * @returns true if valid profile ID
 */
export function isEnforcementProfileId(id: string): id is EnforcementProfileId {
  return ENFORCEMENT_PROFILE_IDS.includes(id as EnforcementProfileId);
}

/**
 * Get the default enforcement profile.
 *
 * @returns The balanced profile (default)
 */
export function getDefaultEnforcementProfile(): EnforcementProfile {
  return ENFORCEMENT_PROFILES[DEFAULT_ENFORCEMENT_PROFILE];
}

// -----------------------------------------------------------------------------
// Purpose Evaluation with Enforcement Profile
// -----------------------------------------------------------------------------

/**
 * Result of purpose evaluation with enforcement profile.
 */
export interface PurposeEvaluationResult {
  /** Decision from enforcement profile */
  decision: ControlDecision;

  /** Purpose enforced (for receipts) */
  purpose_enforced?: string;

  /** Reason for the decision */
  purpose_reason: string;

  /** Constraints to apply (for 'review' decisions) */
  constraints?: PolicyConstraints;

  /** Whether the purpose was declared */
  purpose_declared: boolean;

  /** Whether unknown purpose tokens were present */
  has_unknown_tokens: boolean;

  /** Preserved unknown tokens (for forward compatibility) */
  unknown_tokens: string[];

  /** The profile that was applied */
  profile_id: EnforcementProfileId;
}

/**
 * Canonical purpose tokens that PEAC defines semantics for.
 */
const CANONICAL_PURPOSES = new Set(['train', 'search', 'user_action', 'inference', 'index']);

/**
 * Legacy purpose tokens that map to canonical purposes.
 */
const LEGACY_PURPOSE_MAP: Record<string, string> = {
  crawl: 'index',
  ai_input: 'inference',
  ai_index: 'index',
};

/**
 * Check if a purpose token is canonical.
 */
function isCanonicalPurpose(token: string): boolean {
  return CANONICAL_PURPOSES.has(token);
}

/**
 * Check if a purpose token is a known legacy token.
 */
function isLegacyPurpose(token: string): boolean {
  return token in LEGACY_PURPOSE_MAP;
}

/**
 * Evaluate declared purposes against an enforcement profile.
 *
 * This determines what decision to make based on the declared purposes
 * and the enforcement profile's rules for undeclared/unknown purposes.
 *
 * @param declaredPurposes - Array of purpose tokens from PEAC-Purpose header
 * @param profileId - Enforcement profile ID (default: 'balanced')
 * @returns Purpose evaluation result
 *
 * @example
 * ```typescript
 * // No purposes declared - uses undeclared_decision from profile
 * const result1 = evaluatePurpose([], 'strict');
 * // { decision: 'deny', purpose_reason: 'denied', ... }
 *
 * // Known purpose declared
 * const result2 = evaluatePurpose(['train'], 'balanced');
 * // { decision: 'allow', purpose_enforced: 'train', ... }
 *
 * // Unknown purpose token
 * const result3 = evaluatePurpose(['vendor:custom'], 'balanced');
 * // { decision: 'review', has_unknown_tokens: true, unknown_tokens: ['vendor:custom'], ... }
 * ```
 */
export function evaluatePurpose(
  declaredPurposes: string[],
  profileId: EnforcementProfileId = DEFAULT_ENFORCEMENT_PROFILE
): PurposeEvaluationResult {
  const profile = getEnforcementProfile(profileId);

  // No purposes declared - apply undeclared handling
  if (declaredPurposes.length === 0) {
    return {
      decision: profile.undeclared_decision,
      purpose_reason: 'undeclared_default',
      constraints:
        profile.undeclared_decision === 'review' ? profile.default_constraints : undefined,
      purpose_declared: false,
      has_unknown_tokens: false,
      unknown_tokens: [],
      profile_id: profileId,
    };
  }

  // Categorize declared purposes
  const canonicalTokens: string[] = [];
  const legacyTokens: string[] = [];
  const unknownTokens: string[] = [];

  for (const token of declaredPurposes) {
    if (isCanonicalPurpose(token)) {
      canonicalTokens.push(token);
    } else if (isLegacyPurpose(token)) {
      legacyTokens.push(token);
    } else {
      unknownTokens.push(token);
    }
  }

  // If we have unknown tokens, apply unknown_decision
  if (unknownTokens.length > 0 && canonicalTokens.length === 0 && legacyTokens.length === 0) {
    // Only unknown tokens - apply unknown handling
    return {
      decision: profile.unknown_decision,
      purpose_reason: 'unknown_preserved',
      constraints: profile.unknown_decision === 'review' ? profile.default_constraints : undefined,
      purpose_declared: true,
      has_unknown_tokens: true,
      unknown_tokens: unknownTokens,
      profile_id: profileId,
    };
  }

  // We have at least some known tokens - allow with the first canonical/legacy purpose
  const enforcedPurpose = canonicalTokens[0] ?? LEGACY_PURPOSE_MAP[legacyTokens[0]];

  return {
    decision: 'allow',
    purpose_enforced: enforcedPurpose,
    purpose_reason: unknownTokens.length > 0 ? 'unknown_preserved' : 'allowed',
    purpose_declared: true,
    has_unknown_tokens: unknownTokens.length > 0,
    unknown_tokens: unknownTokens,
    profile_id: profileId,
  };
}

/**
 * Get the HTTP status code for a purpose evaluation result.
 *
 * NOTE: 402 is RESERVED for payment - purpose decisions never return 402.
 * - allow -> 200
 * - review -> 403 (NOT 402)
 * - deny -> 403
 *
 * @param result - Purpose evaluation result
 * @returns HTTP status code (200 or 403)
 */
export function getPurposeStatusCode(result: PurposeEvaluationResult): 200 | 403 {
  switch (result.decision) {
    case 'allow':
      return 200;
    case 'review':
    case 'deny':
      return 403;
  }
}

/**
 * Get the Retry-After header value from constraints.
 *
 * @param constraints - Policy constraints
 * @returns Retry-After seconds or undefined
 */
export function getRetryAfter(constraints: PolicyConstraints | undefined): number | undefined {
  return constraints?.rate_limit?.retry_after_s;
}
