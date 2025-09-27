/**
 * @peac/profiles-safety - PEIP-SAF safety profiles (experimental)
 * Safety policy validation and receipt generation
 */

// Core validation functions
export { validateSafetyPolicy, validateOverlayCompliance } from './validate.js';
export type { ValidationOptions, ValidationResult } from './validate.js';

// Receipt generation
export { issueSafetyReceipt, createReceiptSigner, validateReceiptStructure } from './receipt.js';
export type { ReceiptSigner, IssueReceiptOptions, IssuedReceipt } from './receipt.js';

// Event validation
export {
  validateSafetyEvent,
  validateEventTypeRequirements,
  validateCounterCompliance,
} from './validate-event.js';
export type { EventValidationResult } from './validate-event.js';

// Types
export type {
  SafetyIntent,
  SafetyEvent,
  SafetyEventReceipt,
  OverlayId,
  SafetyPolicy,
  SafetyPolicyCore,
  SafetyPolicySB243,
} from './types.js';

// Package metadata
export const PACKAGE_VERSION = '0.9.12.1';
export const STATUS = 'experimental' as const;
