/**
 * Bounded internal unknown-extension-grammar validator (canonical-composed).
 *
 * INTERNAL ONLY. Thin wrapper around `isValidExtensionKey` and
 * `REGISTERED_EXTENSION_GROUP_KEYS` from `@peac/schema`. Identifies
 * unknown-but-well-formed extension keys and surfaces them as
 * non-blocking warnings, mirroring the canonical
 * `unknown_extension_preserved` warning emitted by `verifyLocal`.
 *
 * Malformed extension keys (failing `isValidExtensionKey`) are NOT
 * surfaced here as warnings; they are hard errors at the canonical
 * schema-parse layer (`E_INVALID_EXTENSION_KEY`) and therefore never
 * reach this layer on an accepted record.
 *
 * Module is observational only; not re-exported from
 * `packages/protocol/src/index.ts` and not wired into the public
 * runtime path.
 *
 * SCOPE:
 *   - Walk `claims.extensions` keys.
 *   - For every key that is well-formed but not registered, emit a
 *     warning with code `unknown_extension_preserved` and an
 *     RFC 6901 JSON-pointer-encoded path.
 *   - Always accepted; this layer never rejects.
 *
 * Out of scope:
 *   - Malformed-key rejection (canonical schema-parse owns this).
 *   - Per-extension content validation (extension-specific schemas).
 */

import { REGISTERED_EXTENSION_GROUP_KEYS, isValidExtensionKey } from '@peac/schema';

export interface UnknownExtensionWarning {
  readonly code: string;
  readonly pointer: string;
}

export interface UnknownExtensionGrammarResult {
  readonly accepted: true;
  readonly warnings: readonly UnknownExtensionWarning[];
}

const ACCEPTED_EMPTY: UnknownExtensionGrammarResult = {
  accepted: true,
  warnings: [],
} as const;

/**
 * Encode a JSON-pointer reference token per RFC 6901: `~` -> `~0`,
 * `/` -> `~1`. Order matters: `~` must be replaced before `/`.
 */
function escapeJsonPointer(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function validateUnknownExtensionGrammarInternal(
  extensions: Record<string, unknown> | undefined
): UnknownExtensionGrammarResult {
  if (extensions === undefined) return ACCEPTED_EMPTY;
  const keys = Object.keys(extensions);
  if (keys.length === 0) return ACCEPTED_EMPTY;

  const warnings: UnknownExtensionWarning[] = [];
  for (const key of keys) {
    if (!REGISTERED_EXTENSION_GROUP_KEYS.has(key) && isValidExtensionKey(key)) {
      warnings.push({
        code: 'unknown_extension_preserved',
        pointer: `/extensions/${escapeJsonPointer(key)}`,
      });
    }
  }
  return { accepted: true, warnings };
}
