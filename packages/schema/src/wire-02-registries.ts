/**
 * Wire 0.2 recommended receipt type and extension group registries.
 *
 * These are pure constants derived from the single source of truth:
 * specs/kernel/registries.json
 *
 * Used by @peac/protocol.verifyLocal() to emit type_unregistered and
 * unknown_extension_preserved warnings for valid-but-unrecognized values.
 */

// ---------------------------------------------------------------------------
// Recommended receipt types (10 pillars)
// ---------------------------------------------------------------------------

/**
 * Recommended receipt type values from the receipt_types registry.
 * A type NOT in this set triggers a type_unregistered warning (not an error).
 */
export const REGISTERED_RECEIPT_TYPES: ReadonlySet<string> = new Set([
  'org.peacprotocol/payment',
  'org.peacprotocol/access-decision',
  'org.peacprotocol/identity-attestation',
  'org.peacprotocol/consent-record',
  'org.peacprotocol/compliance-check',
  'org.peacprotocol/privacy-signal',
  'org.peacprotocol/safety-review',
  'org.peacprotocol/provenance-record',
  'org.peacprotocol/attribution-event',
  'org.peacprotocol/purpose-declaration',
]);

// ---------------------------------------------------------------------------
// Core extension group keys (5 groups)
// ---------------------------------------------------------------------------

/**
 * Core extension group keys that have typed schemas in @peac/schema.
 * An extension key NOT in this set (but passing grammar validation)
 * triggers an unknown_extension_preserved warning (not an error).
 */
export const REGISTERED_EXTENSION_GROUP_KEYS: ReadonlySet<string> = new Set([
  'org.peacprotocol/commerce',
  'org.peacprotocol/access',
  'org.peacprotocol/challenge',
  'org.peacprotocol/identity',
  'org.peacprotocol/correlation',
]);
