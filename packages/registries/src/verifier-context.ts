// Internal facade: re-export verifier-context constants from public @peac/kernel.
// Identity is preserved (constants are the SAME object references); no duplication.
// Internal consumers import from this module for clearer intent ("these are
// the verifier-context constants the resolver / record-core uses").
// Public consumers MUST continue to import from @peac/kernel directly.

export {
  VERIFIER_LIMITS,
  VERIFIER_NETWORK,
  PRIVATE_IP_RANGES,
  VERIFIER_POLICY_VERSION,
  VERIFICATION_MODES,
  RECEIPT,
  POLICY,
  ISSUER_CONFIG,
  DISCOVERY,
  JWKS,
  HEADERS,
} from '@peac/kernel';
