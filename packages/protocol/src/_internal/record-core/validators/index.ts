/**
 * Internal validator barrel for the bounded shadow-mode validator foundation.
 *
 * INTERNAL ONLY. Not re-exported from packages/protocol/src/index.ts.
 */
export type { ParityVerdict, ParityError, ParityWarning } from './types.js';
export { validateKernelConstraintsInternal } from './kernel-constraints.js';
export {
  validateTypeExtensionMappingInternal,
  type TypeExtensionMappingInput,
  type TypeExtensionMappingWarning,
} from './type-extension-mapping.js';
export {
  validateJoseHardeningInternal,
  type JoseHardeningInput,
  type JoseHardeningResult,
} from './jose-hardening.js';
