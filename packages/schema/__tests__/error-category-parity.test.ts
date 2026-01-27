/**
 * Error Category Parity Tests
 *
 * Ensures ErrorCategory type stays in sync with specs/kernel/errors.json.
 * This prevents category drift between TypeScript and the normative registry.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ERROR_CATEGORIES } from '@peac/kernel';
import { ERROR_CATEGORIES_CANONICAL } from '../src/errors';

// Load the normative error registry
const ERRORS_JSON_PATH = join(__dirname, '..', '..', '..', 'specs', 'kernel', 'errors.json');

interface ErrorEntry {
  code: string;
  category: string;
  http_status: number;
  title: string;
  description: string;
  retriable: boolean;
}

interface ErrorsRegistry {
  $schema: string;
  version: string;
  description: string;
  errors: ErrorEntry[];
}

describe('Error Category Parity', () => {
  let registry: ErrorsRegistry;
  let registryCategories: Set<string>;

  beforeAll(() => {
    const content = readFileSync(ERRORS_JSON_PATH, 'utf8');
    registry = JSON.parse(content) as ErrorsRegistry;
    registryCategories = new Set(registry.errors.map((e) => e.category));
  });

  it('generated categories exactly match registry categories', () => {
    const generatedSet = new Set(ERROR_CATEGORIES);

    // Print diff for easier debugging if test fails
    const missingInTS = [...registryCategories].filter((c) => !generatedSet.has(c));
    const extraInTS = [...generatedSet].filter((c) => !registryCategories.has(c));

    if (missingInTS.length > 0 || extraInTS.length > 0) {
      console.error('Category drift detected:');
      if (missingInTS.length > 0) {
        console.error('  Missing in generated file:', missingInTS);
      }
      if (extraInTS.length > 0) {
        console.error('  Extra in generated file (not in registry):', extraInTS);
      }
    }

    expect(generatedSet).toEqual(registryCategories);
  });

  it('deprecated ERROR_CATEGORIES_CANONICAL re-export matches kernel', () => {
    expect(ERROR_CATEGORIES_CANONICAL).toBe(ERROR_CATEGORIES);
  });

  it('registry version is valid semver', () => {
    // Future-proof: accepts any semver version
    expect(registry.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
