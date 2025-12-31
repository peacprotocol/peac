/**
 * PEAC Policy Kit Types
 *
 * Deterministic policy format for CAL semantics.
 * Version: peac-policy/0.1
 *
 * Design principles:
 * - No scripting, no dynamic code
 * - Deterministic, auditable, side-effect free
 * - First-match-wins rule semantics
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import {
  ControlPurposeSchema,
  ControlLicensingModeSchema,
  ControlDecisionSchema,
  SubjectTypeSchema,
} from '@peac/schema';

/**
 * Policy format version
 */
export const POLICY_VERSION = 'peac-policy/0.1';

/**
 * Subject type (re-export from schema)
 */
export type SubjectType = z.infer<typeof SubjectTypeSchema>;

/**
 * Control purpose (re-export from schema)
 */
export type ControlPurpose = z.infer<typeof ControlPurposeSchema>;

/**
 * Control licensing mode (re-export from schema)
 */
export type ControlLicensingMode = z.infer<typeof ControlLicensingModeSchema>;

/**
 * Control decision (re-export from schema)
 */
export type ControlDecision = z.infer<typeof ControlDecisionSchema>;

/**
 * Subject matcher - criteria for matching a subject
 *
 * All fields are optional (omitted = any/wildcard).
 * When multiple fields are present, all must match (AND logic).
 */
export const SubjectMatcherSchema = z
  .object({
    /** Match by subject type(s) - single type or array */
    type: z.union([SubjectTypeSchema, z.array(SubjectTypeSchema)]).optional(),

    /** Match by label(s) - subject must have ALL specified labels */
    labels: z.array(z.string().min(1)).optional(),

    /** Match by subject ID pattern (exact match or prefix with *) */
    id: z.string().min(1).optional(),
  })
  .strict();

export type SubjectMatcher = z.infer<typeof SubjectMatcherSchema>;

/**
 * Policy rule - a single rule in the policy
 *
 * Evaluated in order; first match wins.
 */
export const PolicyRuleSchema = z
  .object({
    /** Rule name (for debugging/auditing) */
    name: z.string().min(1),

    /** Subject matcher (omit for any subject) */
    subject: SubjectMatcherSchema.optional(),

    /** Purpose(s) this rule applies to - single purpose or array */
    purpose: z.union([ControlPurposeSchema, z.array(ControlPurposeSchema)]).optional(),

    /** Licensing mode(s) this rule applies to */
    licensing_mode: z
      .union([ControlLicensingModeSchema, z.array(ControlLicensingModeSchema)])
      .optional(),

    /** Decision if rule matches */
    decision: ControlDecisionSchema,

    /** Reason for decision (for audit trail) */
    reason: z.string().optional(),
  })
  .strict();

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

/**
 * Policy defaults - fallback values when no rule matches
 */
export const PolicyDefaultsSchema = z
  .object({
    /** Default decision when no rule matches */
    decision: ControlDecisionSchema,

    /** Default reason for audit trail */
    reason: z.string().optional(),
  })
  .strict();

export type PolicyDefaults = z.infer<typeof PolicyDefaultsSchema>;

/**
 * Complete policy document
 */
export const PolicyDocumentSchema = z
  .object({
    /** Policy format version */
    version: z.literal(POLICY_VERSION),

    /** Policy name/description (optional) */
    name: z.string().optional(),

    /** Default decision (required) */
    defaults: PolicyDefaultsSchema,

    /** Rules evaluated in order (first match wins) */
    rules: z.array(PolicyRuleSchema),
  })
  .strict();

export type PolicyDocument = z.infer<typeof PolicyDocumentSchema>;

/**
 * Evaluation context - input to policy evaluation
 */
export interface EvaluationContext {
  /** Subject information */
  subject?: {
    /** Subject ID */
    id?: string;

    /** Subject type */
    type?: SubjectType;

    /** Subject labels */
    labels?: string[];
  };

  /** Purpose of access */
  purpose?: ControlPurpose;

  /** Licensing mode */
  licensing_mode?: ControlLicensingMode;
}

/**
 * Evaluation result
 */
export interface EvaluationResult {
  /** Decision from evaluation */
  decision: ControlDecision;

  /** Name of matched rule (undefined if default applied) */
  matched_rule?: string;

  /** Reason for decision */
  reason?: string;

  /** Whether default was applied (no rule matched) */
  is_default: boolean;
}

// -----------------------------------------------------------------------------
// Rate Limiting (v0.9.23+)
// -----------------------------------------------------------------------------

/**
 * Structured rate limit configuration.
 *
 * Uses `window_seconds` for future-proofing (avoids enum lock-in).
 * CLI parses human-friendly strings like "100/hour" to this format.
 *
 * @example
 * ```typescript
 * const limit: RateLimitConfig = {
 *   limit: 100,
 *   window_seconds: 3600, // 1 hour
 *   burst: 10,
 *   partition: 'agent',
 * };
 * ```
 */
export const RateLimitConfigSchema = z
  .object({
    /** Maximum requests allowed in the window */
    limit: z.number().int().positive(),

    /** Window size in seconds (e.g., 3600 for 1 hour) */
    window_seconds: z.number().int().positive(),

    /** Optional burst allowance above the limit */
    burst: z.number().int().nonnegative().optional(),

    /** How to partition rate limits (default: per-agent) */
    partition: z.union([z.enum(['agent', 'ip', 'account']), z.string().min(1)]).optional(),
  })
  .strict();

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

/**
 * Parse a human-friendly rate limit string to RateLimitConfig.
 *
 * @example
 * ```typescript
 * parseRateLimit('100/hour');   // { limit: 100, window_seconds: 3600 }
 * parseRateLimit('1000/day');   // { limit: 1000, window_seconds: 86400 }
 * parseRateLimit('10/minute');  // { limit: 10, window_seconds: 60 }
 * ```
 */
export function parseRateLimit(input: string): RateLimitConfig {
  const match = input.match(/^(\d+)\/(second|minute|hour|day)$/i);
  if (!match) {
    throw new Error(
      `Invalid rate limit format: "${input}". Expected format: "100/hour", "1000/day", etc.`
    );
  }

  const limit = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const windowMap: Record<string, number> = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 86400,
  };

  return {
    limit,
    window_seconds: windowMap[unit],
  };
}

/**
 * Format a RateLimitConfig to human-friendly string.
 */
export function formatRateLimit(config: RateLimitConfig): string {
  const { limit, window_seconds } = config;

  if (window_seconds === 1) return `${limit}/second`;
  if (window_seconds === 60) return `${limit}/minute`;
  if (window_seconds === 3600) return `${limit}/hour`;
  if (window_seconds === 86400) return `${limit}/day`;

  return `${limit}/${window_seconds}s`;
}

// -----------------------------------------------------------------------------
// Decision Requirements (v0.9.23+)
// -----------------------------------------------------------------------------

/**
 * Requirements for 'review' decision (challenge-required semantics).
 *
 * When decision is 'review' and requirements are not met:
 * - Enforcement returns a challenge response (e.g., HTTP 402)
 * - Client provides proof (e.g., PEAC receipt)
 * - On valid proof, access is granted
 *
 * This differs from 'deny' which is unconditional rejection.
 *
 * @example
 * ```typescript
 * const rule: PolicyRule = {
 *   name: 'inference-needs-receipt',
 *   purpose: 'inference',
 *   decision: 'review',
 *   requirements: { receipt: true },
 * };
 * ```
 */
export const DecisionRequirementsSchema = z
  .object({
    /** Require a valid PEAC receipt */
    receipt: z.boolean().optional(),

    // Extensible: add more requirements as needed
    // attestation?: boolean;
    // kyc?: boolean;
  })
  .strict();

export type DecisionRequirements = z.infer<typeof DecisionRequirementsSchema>;

// -----------------------------------------------------------------------------
// Profile System (v0.9.23+)
// -----------------------------------------------------------------------------

/**
 * Profile parameter definition.
 *
 * Defines a configurable parameter for a profile.
 */
export const ProfileParameterSchema = z
  .object({
    /** Human-readable description */
    description: z.string().min(1),

    /** Whether this parameter is required */
    required: z.boolean().optional(),

    /** Default value if not provided */
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),

    /** Example value for documentation */
    example: z.string().optional(),

    /** Validation type for the parameter */
    validate: z.enum(['email', 'url', 'rate_limit']).optional(),
  })
  .strict();

export type ProfileParameter = z.infer<typeof ProfileParameterSchema>;

/**
 * Profile definition.
 *
 * A profile is a pre-configured policy template for a specific use case
 * (e.g., news publisher, SaaS docs, open source project).
 *
 * Profiles are compiled to TypeScript at build time for:
 * - Type safety
 * - No runtime YAML/fs dependencies
 * - Deterministic output
 *
 * @example
 * ```typescript
 * const profile: ProfileDefinition = {
 *   id: 'news-media',
 *   name: 'News Media Publisher',
 *   description: 'Policy for news and media publishers...',
 *   policy: { ... },
 *   parameters: {
 *     contact: { description: 'Contact email', required: true, validate: 'email' },
 *     rate_limit: { description: 'Rate limit', default: '100/hour', validate: 'rate_limit' },
 *   },
 *   defaults: {
 *     requirements: { receipt: true },
 *   },
 * };
 * ```
 */
export const ProfileDefinitionSchema = z
  .object({
    /** Unique profile identifier (e.g., 'news-media') */
    id: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9-]*$/),

    /** Human-readable profile name */
    name: z.string().min(1),

    /** Multi-line description of the profile */
    description: z.string().min(1),

    /** Base policy document */
    policy: PolicyDocumentSchema,

    /** Configurable parameters */
    parameters: z.record(z.string(), ProfileParameterSchema),

    /** Default values for profile instances */
    defaults: z
      .object({
        /** Default requirements for 'review' decisions */
        requirements: DecisionRequirementsSchema.optional(),

        /** Default rate limit */
        rate_limit: RateLimitConfigSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ProfileDefinition = z.infer<typeof ProfileDefinitionSchema>;
