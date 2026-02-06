/**
 * Conformance Runner Types
 *
 * Shared type definitions for the conformance testing system.
 */

/**
 * Conformance level determines which fixtures are run
 */
export type ConformanceLevel = 'basic' | 'standard' | 'full';

/**
 * Test result status
 */
export type TestStatus = 'pass' | 'fail' | 'skip';

/**
 * Diagnostic information for a test result
 */
export interface TestDiagnostics {
  error_code?: string;
  error_message?: string;
  skip_reason?: string;
  input_digest?: {
    alg: string;
    value: string;
  };
  warnings?: string[];
}

/**
 * Per-test result conforming to peac-conformance-report/0.1
 */
export interface TestResult {
  id: string;
  category: string;
  status: TestStatus;
  expected?: {
    valid: boolean;
    error_code?: string;
    error_path?: string;
    error_keyword?: string;
  };
  observed?: {
    valid: boolean;
    error_code?: string;
    error_path?: string;
    error_keyword?: string;
    error_message?: string;
  };
  diagnostics?: TestDiagnostics;
}

/**
 * Profile capability level
 */
export type ProfileLevel = 'shape' | 'semantic';

/**
 * Profile detail for capabilities reporting
 */
export interface ProfileDetail {
  profile: string;
  level: ProfileLevel;
  validator: string;
  notes?: string;
}

/**
 * Conformance report conforming to peac-conformance-report/0.1
 */
export interface ConformanceReport {
  report_version: 'peac-conformance-report/0.1';
  suite: {
    name: string;
    version: string;
    vectors_digest: {
      alg: string;
      value: string;
    };
    profiles: string[];
    /** Detailed capability information for each profile */
    capabilities?: ProfileDetail[];
  };
  implementation: {
    name: string;
    version: string;
    runtime?: string;
    commit?: string;
  };
  summary: {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    status: 'pass' | 'fail';
  };
  results: TestResult[];
  meta?: {
    generated_at?: string;
    runner?: {
      name: string;
      version: string;
      git_sha?: string;
    };
    duration_ms?: number;
  };
}

/**
 * Runner options
 */
export interface RunnerOptions {
  fixturesDir: string;
  level: ConformanceLevel;
  category?: string;
  implementationName?: string;
  implementationVersion?: string;
}

/**
 * Runner callback for progress reporting (pure runner, no console.log)
 */
export interface RunnerCallbacks {
  onTestStart?: (testId: string) => void;
  onTestComplete?: (result: TestResult) => void;
}

/**
 * Validation result from a category validator
 */
export interface ValidationResult {
  valid: boolean;
  error_code?: string;
  error_message?: string;
  warnings?: string[];
}

/**
 * Extended validation result with path information
 */
export interface ValidationResultWithPath extends ValidationResult {
  error_path?: string;
  error_keyword?: string;
}

/**
 * Fixture file structure (fixture pack format)
 */
export interface FixturePack {
  $schema?: string;
  $comment?: string;
  version: string;
  fixtures: Array<{
    name?: string;
    description?: string;
    type?: string;
    input: unknown;
    expected: {
      valid: boolean;
      error_code?: string;
      error?: string;
    };
  }>;
}

/**
 * Single fixture structure (valid/invalid/edge directories)
 */
export interface SingleFixture {
  $comment?: string;
  header?: unknown;
  payload?: unknown;
  expected_valid?: boolean;
  expected_error?: string;
}

/**
 * Manifest entry for fixture metadata (from manifest.json)
 */
export interface ManifestEntry {
  description?: string;
  expected_keyword?: string;
  expected_path?: string;
  expected_valid?: boolean;
  expected_error_code?: string;
  version?: string;
  fixture_count?: number;
  note?: string;
}

/**
 * Manifest structure
 */
export type Manifest = Record<string, Record<string, ManifestEntry>>;

/**
 * Category validator function type
 * Returns ValidationResultWithPath to include error_path and error_keyword
 */
export type CategoryValidator = (input: unknown) => ValidationResultWithPath;
