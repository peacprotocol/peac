/**
 * Wire 0.2 Typed Extension Group Schemas and Accessors
 *
 * BACKWARD-COMPATIBILITY BARREL: This file re-exports everything from
 * the per-group module directory `wire-02-extensions/`. All import paths
 * that previously resolved to this file continue to work.
 *
 * v0.12.2 (DD-173): restructured from monolithic file to per-group modules
 * to reduce merge conflicts and improve maintainability.
 *
 * @see wire-02-extensions/index.ts for the canonical module barrel
 */

export {
  // Limits and byte-budget
  EXTENSION_LIMITS,
  EXTENSION_BUDGET,
  // Grammar validator
  isValidExtensionKey,
  // Commerce
  COMMERCE_EXTENSION_KEY,
  CommerceExtensionSchema,
  getCommerceExtension,
  // Access
  ACCESS_EXTENSION_KEY,
  AccessExtensionSchema,
  getAccessExtension,
  // Challenge
  CHALLENGE_EXTENSION_KEY,
  CHALLENGE_TYPES,
  ChallengeTypeSchema,
  ProblemDetailsSchema,
  ChallengeExtensionSchema,
  getChallengeExtension,
  // Identity
  IDENTITY_EXTENSION_KEY,
  IdentityExtensionSchema,
  getIdentityExtension,
  // Correlation
  CORRELATION_EXTENSION_KEY,
  CorrelationExtensionSchema,
  getCorrelationExtension,
  // Envelope validation helper
  validateKnownExtensions,
  // Shared validators (DD-173.2)
  Sha256DigestSchema,
  HttpsUriHintSchema,
  Iso8601DurationSchema,
  Iso8601DateStringSchema,
  Iso8601DateSchema,
  Iso8601OffsetDateTimeSchema,
  Rfc3339DateTimeSchema,
  Rfc3339TimestampSchema,
  SpdxExpressionSchema,
} from './wire-02-extensions/index.js';

export type {
  CommerceExtension,
  AccessExtension,
  ChallengeType,
  ChallengeExtension,
  IdentityExtension,
  CorrelationExtension,
} from './wire-02-extensions/index.js';
