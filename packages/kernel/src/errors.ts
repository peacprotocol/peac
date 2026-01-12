/**
 * PEAC Protocol Error Codes
 *
 * Re-exports from auto-generated errors.generated.ts
 * Source of truth: specs/kernel/errors.json
 * Regenerate with: npx tsx scripts/codegen-errors.ts
 */

export {
  ERROR_CODES,
  ERRORS,
  BUNDLE_ERRORS,
  DISPUTE_ERRORS,
  getError,
  isRetriable,
  type ErrorCode,
} from './errors.generated.js';
