/**
 * PEAC Policy Kit
 *
 * Deterministic policy evaluation for Control Abstraction Layer (CAL) semantics.
 *
 * Features:
 * - File-based policy format (YAML or JSON)
 * - First-match-wins rule semantics
 * - Subject matching by type, labels, and ID patterns
 * - Purpose and licensing mode matching
 * - No scripting, no dynamic code
 * - Deterministic, auditable, side-effect free
 *
 * @example
 * ```typescript
 * import { loadPolicy, evaluate } from '@peac/policy-kit';
 *
 * const policy = loadPolicy('peac-policy.yaml');
 *
 * const result = evaluate(policy, {
 *   subject: { type: 'human', labels: ['subscribed'] },
 *   purpose: 'crawl',
 *   licensing_mode: 'subscription',
 * });
 *
 * console.log(result.decision); // 'allow' | 'deny' | 'review'
 * ```
 *
 * @packageDocumentation
 */

// Types
export {
  POLICY_VERSION,
  type SubjectType,
  type ControlPurpose,
  type ControlLicensingMode,
  type ControlDecision,
  type SubjectMatcher,
  type PolicyRule,
  type PolicyDefaults,
  type PolicyDocument,
  type EvaluationContext,
  type EvaluationResult,
  // Rate limiting (v0.9.23+)
  type RateLimitConfig,
  parseRateLimit,
  formatRateLimit,
  // Decision requirements (v0.9.23+)
  type DecisionRequirements,
  // Profile system (v0.9.23+)
  type ProfileParameter,
  type ProfileDefinition,
  // Policy constraints (v0.9.24+)
  type PolicyConstraints,
  // Enforcement profiles (v0.9.24+)
  type EnforcementProfileId,
  type EnforcementProfile,
  // Schemas for advanced validation
  SubjectMatcherSchema,
  PolicyRuleSchema,
  PolicyDefaultsSchema,
  PolicyDocumentSchema,
  RateLimitConfigSchema,
  DecisionRequirementsSchema,
  ProfileParameterSchema,
  ProfileDefinitionSchema,
  PolicyConstraintsSchema,
  EnforcementProfileSchema,
} from './types';

// Loader
export {
  loadPolicy,
  parsePolicy,
  validatePolicy,
  policyFileExists,
  createExamplePolicy,
  serializePolicyYaml,
  serializePolicyJson,
  PolicyLoadError,
  PolicyValidationError,
} from './loader';

// Evaluation
export {
  evaluate,
  explainMatches,
  findEffectiveRule,
  isAllowed,
  isDenied,
  requiresReview,
  evaluateBatch,
} from './evaluate';

// Compiler (artifact generation)
export {
  PEAC_PROTOCOL_VERSION,
  compilePeacTxt,
  compileRobotsSnippet,
  compileAiprefTemplates,
  renderPolicyMarkdown,
  type CompileOptions,
  type AiprefTemplate,
} from './compiler';

// Generated profiles (v0.9.23+)
export { PROFILES, PROFILE_IDS, type ProfileId } from './generated/profiles';

// Profile loader API (v0.9.23+)
export {
  listProfiles,
  hasProfile,
  loadProfile,
  getProfile,
  validateProfileParams,
  customizeProfile,
  getAllProfiles,
  getProfileSummary,
  ProfileError,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type CustomizeResult,
} from './profiles';

// Decision enforcement (v0.9.23+)
export {
  enforceDecision,
  requiresChallenge,
  getChallengeHeader,
  enforceForHttp,
  type EnforcementContext,
  type EnforcementResult,
  // Purpose-specific enforcement (v0.9.24+)
  // These functions NEVER return 402 - that is reserved for payment/receipts
  enforcePurposeDecision,
  getPurposeDecisionStatusCode, // Low-level: (decision, purposeValid) -> status
  type PurposeEnforcementContext,
  type PurposeEnforcementResult,
} from './enforce';

// Enforcement profiles (v0.9.24+)
export {
  // Profile definitions
  STRICT_PROFILE,
  BALANCED_PROFILE,
  OPEN_PROFILE,
  ENFORCEMENT_PROFILES,
  ENFORCEMENT_PROFILE_IDS,
  DEFAULT_ENFORCEMENT_PROFILE,
  // Profile lookup
  getEnforcementProfile,
  isEnforcementProfileId,
  getDefaultEnforcementProfile,
  // Purpose evaluation
  evaluatePurpose,
  getPurposeStatusCode,
  getRetryAfter,
  type PurposeEvaluationResult,
} from './enforcement-profiles';
