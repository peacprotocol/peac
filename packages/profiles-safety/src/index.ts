/**
 * @peac/profiles-safety - PEIP-SAF safety profiles (experimental)
 * Safety policy validation and receipt generation
 */

// Core validation functions
export { validateSafetyPolicy, validateOverlayCompliance } from './validate';
export type { ValidationOptions, ValidationResult } from './validate';

// Receipt generation
export { issueSafetyReceipt, createReceiptSigner, validateReceiptStructure } from './receipt';
export type { ReceiptSigner, IssueReceiptOptions, IssuedReceipt } from './receipt';

// Event validation
export {
  validateSafetyEvent,
  validateEventTypeRequirements,
  validateCounterCompliance,
} from './validate-event';
export type { EventValidationResult } from './validate-event';

// Types
export type {
  SafetyIntent,
  SafetyEvent,
  SafetyEventReceipt,
  OverlayId,
  SafetyPolicy,
  SafetyPolicyCore,
  SafetyPolicySB243,
} from './types';

// Package metadata
export const PACKAGE_VERSION = '0.9.12.1';
export const STATUS = 'experimental' as const;
