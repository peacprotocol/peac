/**
 * Wire 0.2 verification warning codes and collector (v0.12.0-preview.1, DD-155)
 *
 * Warning codes are append-only stable string literals. Warnings do NOT affect
 * the allow/deny decision unless caller policy requires it.
 *
 * Warnings MUST be sorted by (pointer ascending, code ascending);
 * undefined pointer sorts before any string value.
 *
 * RFC 6901 JSON Pointer escaping: '/' in keys is escaped as '~1', '~' as '~0'.
 */

import type { VerificationWarning } from '@peac/kernel';

// ---------------------------------------------------------------------------
// Warning code constants (append-only)
// ---------------------------------------------------------------------------

/** type claim does not match any registered type in the receipt_types registry */
export const WARNING_TYPE_UNREGISTERED = 'type_unregistered' as const;

/** Unknown extension key was encountered and preserved (no schema validation) */
export const WARNING_UNKNOWN_EXTENSION = 'unknown_extension_preserved' as const;

/** occurred_at is after iat by more than zero but within the tolerance window */
export const WARNING_OCCURRED_AT_SKEW = 'occurred_at_skew' as const;

/** JWS typ header was absent; interop mode accepted the token without typ */
export const WARNING_TYP_MISSING = 'typ_missing' as const;

/** Registered type has a mapped extension group, but that group is absent from extensions */
export const WARNING_EXTENSION_GROUP_MISSING = 'extension_group_missing' as const;

/** Registered type has a mapped extension group, but a different registered group is present instead */
export const WARNING_EXTENSION_GROUP_MISMATCH = 'extension_group_mismatch' as const;

// ---------------------------------------------------------------------------
// Warning sorting
// ---------------------------------------------------------------------------

/**
 * Sort warnings by (pointer ascending, code ascending).
 * Warnings with undefined pointer sort before those with a defined pointer.
 *
 * @param warnings - Array of VerificationWarning objects to sort
 * @returns New array sorted in canonical order
 */
export function sortWarnings(warnings: VerificationWarning[]): VerificationWarning[] {
  return [...warnings].sort((a, b) => {
    const aHasPtr = a.pointer !== undefined;
    const bHasPtr = b.pointer !== undefined;

    // undefined pointer sorts before any defined pointer
    if (!aHasPtr && bHasPtr) return -1;
    if (aHasPtr && !bHasPtr) return 1;

    // Both have the same pointer presence; compare values if both defined
    if (aHasPtr && bHasPtr) {
      const cmp = (a.pointer as string).localeCompare(b.pointer as string);
      if (cmp !== 0) return cmp;
    }

    // Same pointer (or both undefined): sort by code
    return a.code.localeCompare(b.code);
  });
}
