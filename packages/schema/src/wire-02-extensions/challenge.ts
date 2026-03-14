/**
 * Challenge Extension Group (org.peacprotocol/challenge)
 *
 * Records challenge issuance with RFC 9457 Problem Details.
 * Shipped in v0.12.0-preview.1 (DD-153).
 */

import { z } from 'zod';
import { EXTENSION_LIMITS } from './limits.js';

export const CHALLENGE_EXTENSION_KEY = 'org.peacprotocol/challenge' as const;

/**
 * Challenge type values (7 total, P0-6).
 * Includes purpose_disallowed (reviewer fix: 7 not 6).
 */
export const CHALLENGE_TYPES = [
  'payment_required',
  'identity_required',
  'consent_required',
  'attestation_required',
  'rate_limited',
  'purpose_disallowed',
  'custom',
] as const;

export const ChallengeTypeSchema = z.enum(CHALLENGE_TYPES);
export type ChallengeType = z.infer<typeof ChallengeTypeSchema>;

/**
 * RFC 9457 Problem Details schema (P0-5).
 *
 * Uses .passthrough() for extension members per RFC 9457 Section 6.2.
 * Required fields: status (HTTP status code), type (problem type URI).
 * Optional fields: title, detail, instance.
 */
export const ProblemDetailsSchema = z
  .object({
    /** HTTP status code (100-599) */
    status: z.number().int().min(100).max(599),
    /** Problem type URI */
    type: z.string().min(1).max(EXTENSION_LIMITS.maxProblemTypeLength).url(),
    /** Short human-readable summary */
    title: z.string().max(EXTENSION_LIMITS.maxProblemTitleLength).optional(),
    /** Human-readable explanation specific to this occurrence */
    detail: z.string().max(EXTENSION_LIMITS.maxProblemDetailLength).optional(),
    /** URI reference identifying the specific occurrence */
    instance: z.string().max(EXTENSION_LIMITS.maxProblemInstanceLength).optional(),
  })
  .passthrough();

export const ChallengeExtensionSchema = z
  .object({
    /** Challenge type (7 values) */
    challenge_type: ChallengeTypeSchema,
    /** RFC 9457 Problem Details */
    problem: ProblemDetailsSchema,
    /** Resource that triggered the challenge */
    resource: z.string().max(EXTENSION_LIMITS.maxResourceLength).optional(),
    /** Action that triggered the challenge */
    action: z.string().max(EXTENSION_LIMITS.maxActionLength).optional(),
    /** Caller-defined requirements for resolving the challenge */
    requirements: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ChallengeExtension = z.infer<typeof ChallengeExtensionSchema>;
