/**
 * Shared Conformance Test Harness
 *
 * Common utilities for loading fixtures, validating fixture hygiene,
 * and checking digest formats across conformance test suites.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export const CONFORMANCE_ROOT = join(__dirname, '..', '..', 'specs', 'conformance', 'fixtures');

// ---------------------------------------------------------------------------
// Fixture Types (Generic)
// ---------------------------------------------------------------------------

export interface BaseFixture {
  name: string;
  description: string;
  type: string;
  input: unknown;
  expected: {
    valid: boolean;
    error_code?: string;
    error?: string;
    warnings?: Array<{ code: string; field?: string }>;
    meta?: Record<string, unknown>;
  };
}

export interface BaseFixtureFile<T extends BaseFixture = BaseFixture> {
  $schema?: string;
  $comment?: string;
  version: string;
  fixtures: T[];
}

// ---------------------------------------------------------------------------
// Fixture Loading
// ---------------------------------------------------------------------------

/**
 * Load a fixture file from the conformance fixtures directory
 */
export function loadFixtureFile<T extends BaseFixture = BaseFixture>(
  category: string,
  filename: string
): BaseFixtureFile<T> {
  const filePath = join(CONFORMANCE_ROOT, category, filename);
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as BaseFixtureFile<T>;
}

/**
 * Load the conformance manifest
 */
export function loadManifest(): Record<
  string,
  Record<string, { fixture_count?: number; version?: string }>
> {
  const manifestPath = join(CONFORMANCE_ROOT, 'manifest.json');
  return JSON.parse(readFileSync(manifestPath, 'utf-8'));
}

// ---------------------------------------------------------------------------
// Fixture Hygiene Checks
// ---------------------------------------------------------------------------

/**
 * Check that all fixture names in a file are unique
 */
export function assertUniqueNames(fixtures: BaseFixture[], context: string): void {
  const names = fixtures.map((f) => f.name);
  const uniqueNames = new Set(names);
  if (uniqueNames.size !== names.length) {
    const duplicates = names.filter((name, idx) => names.indexOf(name) !== idx);
    throw new Error(`${context}: Duplicate fixture names found: ${duplicates.join(', ')}`);
  }
}

/**
 * Verify manifest fixture_count matches actual count
 */
export function assertManifestCount(
  manifest: Record<string, { fixture_count?: number }>,
  filename: string,
  actualCount: number
): void {
  const expected = manifest[filename]?.fixture_count;
  if (expected !== undefined && expected !== actualCount) {
    throw new Error(
      `Manifest drift: ${filename} has ${actualCount} fixtures but manifest says ${expected}`
    );
  }
}

// ---------------------------------------------------------------------------
// Digest Validation
// ---------------------------------------------------------------------------

const HEX_64_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Recursively check all digest values in an object are 64 lowercase hex chars
 */
export function checkDigestValues(obj: unknown, path: string, errors: string[]): void {
  if (!obj || typeof obj !== 'object') return;
  const record = obj as Record<string, unknown>;

  // Check if this is a digest object (has alg, value, bytes)
  if (record.alg && typeof record.value === 'string' && typeof record.bytes === 'number') {
    if (!HEX_64_PATTERN.test(record.value)) {
      errors.push(`${path}.value: "${record.value}" is not 64 lowercase hex chars`);
    }
  }

  // Recurse into nested objects
  for (const [key, value] of Object.entries(record)) {
    if (value && typeof value === 'object') {
      checkDigestValues(value, `${path}.${key}`, errors);
    }
  }
}

/**
 * Assert all digests in fixtures are valid
 */
export function assertValidDigests(fixtures: BaseFixture[], includeInvalid = false): void {
  const errors: string[] = [];

  for (const fixture of fixtures) {
    // Skip invalid fixtures unless explicitly included
    if (!includeInvalid && !fixture.expected.valid) continue;

    checkDigestValues(fixture.input, fixture.name, errors);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid digest values found:\n${errors.join('\n')}`);
  }
}

// ---------------------------------------------------------------------------
// Version Validation
// ---------------------------------------------------------------------------

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * Assert fixture file versions are valid semver
 */
export function assertSemverVersion(version: string, context: string): void {
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`${context}: Version "${version}" is not valid semver`);
  }
}

/**
 * Assert all fixture file versions are consistent
 */
export function assertConsistentVersions(files: BaseFixtureFile[], context: string): void {
  if (files.length < 2) return;

  const firstVersion = files[0].version;
  for (let i = 1; i < files.length; i++) {
    if (files[i].version !== firstVersion) {
      throw new Error(
        `${context}: Version mismatch - file 0 has ${firstVersion}, file ${i} has ${files[i].version}`
      );
    }
  }
}
