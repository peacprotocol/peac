/**
 * Wire 0.2 recommended receipt type and extension group registries.
 *
 * Single source of truth: specs/kernel/registries.json
 * Generated constants: @peac/kernel registries.generated.ts
 *
 * Used by @peac/protocol.verifyLocal() to emit type_unregistered and
 * unknown_extension_preserved warnings for valid-but-unrecognized values.
 */

import { RECEIPT_TYPES, EXTENSION_GROUPS } from '@peac/kernel';

// ---------------------------------------------------------------------------
// Recommended receipt types (derived from generated registry)
// ---------------------------------------------------------------------------

/**
 * Recommended receipt type values from the receipt_types registry.
 * A type NOT in this set triggers a type_unregistered warning (not an error).
 */
export const REGISTERED_RECEIPT_TYPES: ReadonlySet<string> = new Set(
  RECEIPT_TYPES.map((entry) => entry.id)
);

// ---------------------------------------------------------------------------
// Core extension group keys (derived from generated registry)
// ---------------------------------------------------------------------------

/**
 * Core extension group keys that have typed schemas in @peac/schema.
 * An extension key NOT in this set (but passing grammar validation)
 * triggers an unknown_extension_preserved warning (not an error).
 *
 * Derived from EXTENSION_GROUPS in @peac/kernel (generated from
 * specs/kernel/registries.json). No manual maintenance required.
 */
export const REGISTERED_EXTENSION_GROUP_KEYS: ReadonlySet<string> = new Set(
  EXTENSION_GROUPS.map((entry) => entry.id)
);
