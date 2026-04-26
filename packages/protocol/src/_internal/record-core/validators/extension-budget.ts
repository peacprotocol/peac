/**
 * Bounded internal extension-budget validator.
 *
 * INTERNAL ONLY. This is the parity-observed counterpart of the
 * byte-budget portion (steps 4 + 5) of validateKnownExtensions in
 * @peac/schema/src/wire-02-extensions/validation.ts. Both sides import
 * EXTENSION_BUDGET from @peac/kernel; behavioral parity is proven
 * byte-equal by the parity tests, not by code copy.
 *
 * Existing canonical validateKnownExtensions in @peac/schema remains
 * canonical. This module is observational only; it is NOT re-exported
 * from packages/protocol/src/index.ts and is NOT wired into runtime
 * paths (issue.ts, verify-local.ts) in v0.13.1.
 *
 * SCOPE (deliberately narrow):
 *   - byte-budget enforcement on the extensions record only
 *   - the other three steps in validateKnownExtensions (key grammar,
 *     plain-JSON guard, typed extension schema parse) are NOT in
 *     scope here; they belong to other parity work and would require
 *     their own validators
 *
 * Measurement basis (must mirror canonical exactly):
 *   - bytes = TextEncoder.encode(JSON.stringify(value)).byteLength
 *     (UTF-8 byte length of ECMAScript JSON.stringify output)
 *   - serialization failure (circular references, BigInt, etc.) yields
 *     Infinity, which the comparison treats as over-budget
 *
 * Order of checks (must mirror canonical exactly):
 *   1. Total: jsonUtf8ByteLength(extensions) > maxTotalBytes
 *      -> violation at path '/extensions'; EARLY STOP (no per-group)
 *   2. Per-group, in Object.keys(extensions) iteration order:
 *      jsonUtf8ByteLength(extensions[key]) > maxGroupBytes
 *      -> violation at path '/extensions/<escaped-key>'
 *
 * Comparison uses '>' (strictly greater than), so values exactly equal
 * to the limit are accepted.
 */

import { EXTENSION_BUDGET } from '@peac/kernel';

export interface ExtensionBudgetViolation {
  readonly code: string;
  readonly path: string;
}

export interface ExtensionBudgetResult {
  readonly accepted: boolean;
  readonly violations: readonly ExtensionBudgetViolation[];
}

const ACCEPTED: ExtensionBudgetResult = { accepted: true, violations: [] } as const;
const SIZE_EXCEEDED = 'E_EXTENSION_SIZE_EXCEEDED' as const;

const textEncoder = new TextEncoder();

/**
 * UTF-8 byte length of JSON.stringify(value). Returns Infinity if
 * serialization fails (circular references, BigInt, etc.); callers
 * treat Infinity as over-budget.
 */
function jsonUtf8ByteLength(value: unknown): number {
  try {
    return textEncoder.encode(JSON.stringify(value)).byteLength;
  } catch {
    return Infinity;
  }
}

/** RFC 6901 JSON pointer segment escape: '~' -> '~0', '/' -> '~1'. */
function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function validateExtensionBudgetInternal(
  extensions: Record<string, unknown> | undefined
): ExtensionBudgetResult {
  if (extensions === undefined) return ACCEPTED;

  const totalBytes = jsonUtf8ByteLength(extensions);
  if (totalBytes > EXTENSION_BUDGET.maxTotalBytes) {
    // Early stop: canonical returns immediately after pushing the
    // total-budget violation; per-group checks are not reached.
    return {
      accepted: false,
      violations: [{ code: SIZE_EXCEEDED, path: '/extensions' }],
    };
  }

  const violations: ExtensionBudgetViolation[] = [];
  for (const key of Object.keys(extensions)) {
    const groupBytes = jsonUtf8ByteLength(extensions[key]);
    if (groupBytes > EXTENSION_BUDGET.maxGroupBytes) {
      violations.push({
        code: SIZE_EXCEEDED,
        path: `/extensions/${escapeJsonPointerSegment(key)}`,
      });
    }
  }

  if (violations.length === 0) return ACCEPTED;
  return { accepted: false, violations };
}
