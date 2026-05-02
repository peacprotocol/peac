/**
 * Bounded internal type-extension-enforcement validator (canonical-composed).
 *
 * INTERNAL ONLY. Thin wrapper around `checkTypeExtensionMapping` from
 * `@peac/protocol/src/type-extension-check` plus the strictness-mode
 * routing performed by `verifyLocal`. Surfaces the canonical mapping
 * result projected into the bounded validator's accept/reject and
 * warning contract.
 *
 * Distinct from `type-extension-mapping.ts` (warnings-only) in this
 * module's directory: this layer covers the strictness-mode path that
 * promotes `missing` and `mismatch` to hard errors when
 * `strictness === 'strict'`. Both layers consume the same canonical
 * mapping result; they differ only in how they project it.
 *
 * Module is observational only; not re-exported from
 * `packages/protocol/src/index.ts` and not wired into the public
 * runtime path.
 *
 * SCOPE:
 *   - `skip` -> accepted, no warning, no error.
 *   - `ok` -> accepted, no warning, no error.
 *   - `missing` + strict -> rejected with E_EXTENSION_GROUP_REQUIRED.
 *   - `mismatch` + strict -> rejected with E_EXTENSION_GROUP_MISMATCH.
 *   - `missing` + interop -> accepted with extension_group_missing warning at /type.
 *   - `mismatch` + interop -> accepted with extension_group_mismatch warning at /type.
 */

import { TYPE_TO_EXTENSION_MAP } from '@peac/kernel';
import { REGISTERED_EXTENSION_GROUP_KEYS } from '@peac/schema';
import { checkTypeExtensionMapping } from '../../../type-extension-check.js';
import type { Strictness } from './jose-typ-strictness.js';

export interface TypeExtensionEnforcementWarning {
  readonly code: string;
  readonly pointer: string;
}

export type TypeExtensionEnforcementResult =
  | { readonly accepted: true; readonly warnings?: readonly TypeExtensionEnforcementWarning[] }
  | { readonly accepted: false; readonly errorCode: string; readonly pointer?: string };

const ACCEPTED_NO_WARN: TypeExtensionEnforcementResult = { accepted: true } as const;

export function validateTypeExtensionEnforcementInternal(
  kind: string,
  type: string,
  extensions: Record<string, unknown> | undefined,
  strictness: Strictness
): TypeExtensionEnforcementResult {
  const result = checkTypeExtensionMapping(
    kind,
    type,
    extensions,
    TYPE_TO_EXTENSION_MAP,
    REGISTERED_EXTENSION_GROUP_KEYS
  );

  if (result.status === 'ok' || result.status === 'skip') {
    return ACCEPTED_NO_WARN;
  }

  if (strictness === 'strict') {
    const errorCode =
      result.status === 'missing' ? 'E_EXTENSION_GROUP_REQUIRED' : 'E_EXTENSION_GROUP_MISMATCH';
    return { accepted: false, errorCode, pointer: '/type' };
  }

  // interop mode: surface as warning, accept the record.
  const warningCode =
    result.status === 'missing' ? 'extension_group_missing' : 'extension_group_mismatch';
  return {
    accepted: true,
    warnings: [{ code: warningCode, pointer: '/type' }],
  };
}
