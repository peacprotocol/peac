/**
 * Bounded internal type-extension mapping validator.
 *
 * INTERNAL ONLY. This is the parity-observed counterpart of the
 * type/extension warning-emission block at verify-local.ts:477-540
 * (interop strictness branch). Both implementations consume the same
 * registries (REGISTERED_RECEIPT_TYPES, REGISTERED_EXTENSION_GROUP_KEYS,
 * TYPE_TO_EXTENSION_MAP) and the same warning-code constants from
 * @peac/schema; behavioral parity is proven byte-equal by the parity
 * tests, not by code copy.
 *
 * Existing canonical emission in @peac/protocol/verifyLocal remains
 * canonical. This module is observational only; it is NOT re-exported
 * from packages/protocol/src/index.ts and is NOT wired into runtime
 * paths (issue.ts, verify-local.ts) in v0.13.1.
 *
 * Output shape: a deterministically-ordered list of warning records,
 * each carrying only `code` and `pointer`. The canonical emission also
 * carries a `message` field; messages are intentionally omitted from
 * the parity comparison because the missing/mismatch messages embed
 * claim values (claims.type and the expected extension group), and
 * comparison on (code, pointer) is what the verifier output API
 * actually exposes to consumers via the warning code/pointer pair.
 *
 * Emission order (must mirror verify-local.ts exactly; tests assert):
 *   1. type_unregistered (when claims.type is not in REGISTERED_RECEIPT_TYPES)
 *   2. unknown_extension_preserved (one per unknown-but-well-formed
 *      extension key, in Object.keys iteration order)
 *   3. extension_group_missing OR extension_group_mismatch (when
 *      checkTypeExtensionMapping returns missing/mismatch; not emitted
 *      for kind === 'challenge' or for unmapped/custom types)
 */

import {
  REGISTERED_EXTENSION_GROUP_KEYS,
  REGISTERED_RECEIPT_TYPES,
  WARNING_EXTENSION_GROUP_MISMATCH,
  WARNING_EXTENSION_GROUP_MISSING,
  WARNING_TYPE_UNREGISTERED,
  WARNING_UNKNOWN_EXTENSION,
  isValidExtensionKey,
} from '@peac/schema';
import { TYPE_TO_EXTENSION_MAP } from '@peac/kernel';

/** Minimal claims shape required by the type-extension warning surface. */
export interface TypeExtensionMappingInput {
  readonly kind: string;
  readonly type: string;
  readonly extensions?: Record<string, unknown>;
}

/** Normalized warning entry. Comparison shape; canonical messages omitted. */
export interface TypeExtensionMappingWarning {
  readonly code: string;
  readonly pointer: string;
}

/** Escape `~` and `/` per RFC 6901 for JSON Pointer fragments. */
function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Mirror of @peac/protocol/src/type-extension-check.ts:checkTypeExtensionMapping.
 * Returns a status discriminator only; the bounded validator decides whether
 * the discriminator translates to a warning code.
 */
function classifyExpectedGroup(
  kind: string,
  type: string,
  extensions: Record<string, unknown> | undefined
): 'ok' | 'skip' | 'missing' | 'mismatch' {
  if (kind === 'challenge') return 'skip';
  const expectedGroup = TYPE_TO_EXTENSION_MAP.get(type);
  if (expectedGroup === undefined) return 'skip';
  if (extensions !== undefined && Object.prototype.hasOwnProperty.call(extensions, expectedGroup)) {
    return 'ok';
  }
  if (extensions !== undefined) {
    for (const key of Object.keys(extensions)) {
      if (key !== expectedGroup && REGISTERED_EXTENSION_GROUP_KEYS.has(key)) {
        return 'mismatch';
      }
    }
  }
  return 'missing';
}

/**
 * Evaluate the type-extension mapping warning surface for parsed Wire 0.2
 * claims. Returns warnings in canonical emission order; emits no warnings
 * when the claims are fully registered and the expected extension group
 * is present (or when no expected group exists for the given type).
 */
export function validateTypeExtensionMappingInternal(
  input: TypeExtensionMappingInput
): TypeExtensionMappingWarning[] {
  const warnings: TypeExtensionMappingWarning[] = [];

  // Step 1: type_unregistered
  if (!REGISTERED_RECEIPT_TYPES.has(input.type)) {
    warnings.push({ code: WARNING_TYPE_UNREGISTERED, pointer: '/type' });
  }

  // Step 2: unknown_extension_preserved (one per unknown well-formed key)
  if (input.extensions !== undefined) {
    for (const key of Object.keys(input.extensions)) {
      if (!REGISTERED_EXTENSION_GROUP_KEYS.has(key) && isValidExtensionKey(key)) {
        warnings.push({
          code: WARNING_UNKNOWN_EXTENSION,
          pointer: `/extensions/${escapeJsonPointerSegment(key)}`,
        });
      }
    }
  }

  // Step 3: extension_group_missing | extension_group_mismatch
  const status = classifyExpectedGroup(input.kind, input.type, input.extensions);
  if (status === 'missing') {
    warnings.push({ code: WARNING_EXTENSION_GROUP_MISSING, pointer: '/type' });
  } else if (status === 'mismatch') {
    warnings.push({ code: WARNING_EXTENSION_GROUP_MISMATCH, pointer: '/type' });
  }

  return warnings;
}
