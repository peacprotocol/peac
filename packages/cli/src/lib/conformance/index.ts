/**
 * Conformance Runner Module
 *
 * Re-exports all conformance testing functionality.
 */

// Types
export type {
  ConformanceLevel,
  TestStatus,
  TestDiagnostics,
  TestResult,
  ProfileLevel,
  ProfileDetail,
  ConformanceReport,
  RunnerOptions,
  RunnerCallbacks,
  ValidationResult,
  ValidationResultWithPath,
  FixturePack,
  SingleFixture,
  ManifestEntry,
  Manifest,
  CategoryValidator,
} from './types.js';

// Manifest loading
export { loadManifest, getManifestEntry } from './manifest.js';

// Digest computation
export {
  sha256,
  zodPathToJsonPointer,
  computeCanonicalDigest,
  computeVectorsDigest,
} from './digest.js';

// Profile capabilities
export {
  PROFILE_CAPABILITIES,
  getCategoryCapability,
  getCategoryProfile,
  shouldRunAtLevel,
} from './profiles.js';

// Validators
export { validateReceiptPayload, CATEGORY_VALIDATORS, getValidator } from './validators.js';
