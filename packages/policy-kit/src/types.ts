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
