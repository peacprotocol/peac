/**
 * PEAC Surface Contracts
 *
 * Shared contracts that all surface implementations must adhere to.
 * Used for parity testing across Cloudflare Worker, Next.js, and future surfaces.
 */

export {
  CANONICAL_ERROR_CODES,
  CANONICAL_STATUS_MAPPINGS,
  CANONICAL_TITLES,
  PROBLEM_TYPE_BASE,
  MODE_BEHAVIOR,
} from './error-contract.js';
