/**
 * Type-to-extension enforcement check (Layer 3)
 *
 * Pure helper: given a receipt kind, type, extensions record, and
 * registry data, determines whether the expected extension group is
 * present, absent, or replaced by a different registered group.
 *
 * This module has no side effects, no I/O, and no strictness logic.
 * Strictness (error vs warning) is decided by the caller (verifyLocal).
 *
 * Decision tree:
 *   1. challenge-kind receipt          -> skip
 *   2. unmapped/custom type            -> skip
 *   3. expected extension present      -> ok
 *   4. expected absent + other registered present -> mismatch
 *   5. expected absent + none present  -> missing
 *
 * Unknown third-party extension keys never count as mismatch.
 */

/** Result of the type-to-extension mapping check */
export type TypeExtensionCheckResult =
  | { status: 'ok' }
  | { status: 'skip' }
  | {
      status: 'missing' | 'mismatch';
      expected_extension_group: string;
      present_registered_extension_groups: string[];
    };

/**
 * Check whether a receipt's extensions match the expected extension
 * group for its registered type.
 *
 * Performance: O(1) lookup for the common ok/skip paths. Only iterates
 * extension keys when the expected group is absent (error path).
 *
 * @param kind - Receipt kind (evidence or challenge)
 * @param type - Receipt type value (e.g., org.peacprotocol/payment)
 * @param extensions - Extensions record from receipt claims (may be undefined)
 * @param typeToExtensionMap - Generated TYPE_TO_EXTENSION_MAP
 * @param registeredExtensionGroupKeys - Generated REGISTERED_EXTENSION_GROUP_KEYS set
 */
export function checkTypeExtensionMapping(
  kind: string,
  type: string,
  extensions: Record<string, unknown> | undefined,
  typeToExtensionMap: ReadonlyMap<string, string>,
  registeredExtensionGroupKeys: ReadonlySet<string>
): TypeExtensionCheckResult {
  // Challenge-kind receipts skip: they indicate requirements, not evidence
  if (kind === 'challenge') {
    return { status: 'skip' };
  }

  const expectedGroup = typeToExtensionMap.get(type);

  // Unmapped/custom type: no check
  if (expectedGroup === undefined) {
    return { status: 'skip' };
  }

  // Expected group present: pass (O(1) check)
  if (extensions !== undefined && Object.prototype.hasOwnProperty.call(extensions, expectedGroup)) {
    return { status: 'ok' };
  }

  // Expected group absent: determine missing vs mismatch
  // Only build the present-registered list on this (uncommon) path
  const presentRegistered: string[] = [];
  if (extensions !== undefined) {
    for (const key of Object.keys(extensions)) {
      if (key !== expectedGroup && registeredExtensionGroupKeys.has(key)) {
        presentRegistered.push(key);
      }
    }
  }

  return {
    status: presentRegistered.length > 0 ? 'mismatch' : 'missing',
    expected_extension_group: expectedGroup,
    present_registered_extension_groups: presentRegistered,
  };
}
