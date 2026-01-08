/**
 * PEAC Surface Error Contract (Re-export)
 *
 * DEPRECATED: Import from @peac/contracts directly in new code.
 * This re-export is kept for backwards compatibility only.
 *
 * @deprecated Import from @peac/contracts instead
 * @see https://www.npmjs.com/package/@peac/contracts
 */

export {
  CANONICAL_ERROR_CODES,
  CANONICAL_STATUS_MAPPINGS,
  CANONICAL_TITLES,
  PROBLEM_TYPE_BASE,
  MODE_BEHAVIOR,
  WWW_AUTHENTICATE_STATUSES,
  ERROR_CATALOG,
  problemTypeFor,
  getStatusForCode,
  requiresWwwAuthenticate,
  buildWwwAuthenticate,
  isPeacErrorCode,
  type PeacErrorCode,
  type PeacHttpStatus,
  type VerificationMode,
  type ErrorCatalogEntry,
  type HandlerAction,
  type ModeBehavior,
} from '@peac/contracts';
