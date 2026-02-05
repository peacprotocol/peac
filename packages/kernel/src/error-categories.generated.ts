/**
 * PEAC Protocol Error Categories
 *
 * AUTO-GENERATED from specs/kernel/errors.json
 * DO NOT EDIT MANUALLY - run: npx tsx scripts/codegen-errors.ts
 * Spec version: 0.10.7
 */

/**
 * Canonical error categories derived from specs/kernel/errors.json.
 * This is the single source of truth for all error category definitions.
 * Sorted alphabetically. This ordering is a codegen invariant.
 */
export const ERROR_CATEGORIES = [
  'attribution',
  'bundle',
  'control',
  'dispute',
  'identity',
  'infrastructure',
  'interaction',
  'ucp',
  'validation',
  'verification',
  'verifier',
  'workflow',
] as const;

/**
 * Error category type - union of all categories in specs/kernel/errors.json
 */
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];
