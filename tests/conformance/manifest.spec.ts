/**
 * Global Conformance Manifest Hygiene Tests
 *
 * Validates manifest.json integrity for **tracked categories** only.
 * Some legacy categories are explicitly untracked (see UNTRACKED_CATEGORIES).
 *
 * For tracked categories, ensures:
 * - fixture_count matches actual fixtures.length
 * - Versions are consistent within categories
 * - Fixture names are unique per file
 * - No orphaned manifest entries
 *
 * For untracked categories:
 * - Lists them as visible debt in a non-failing test
 * - Each must have an explicit reason in UNTRACKED_CATEGORIES
 *
 * Individual suite tests should NOT duplicate these checks.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import {
  CONFORMANCE_ROOT,
  loadManifest,
  assertUniqueNames,
  assertSemverVersion,
  type BaseFixture,
  type BaseFixtureFile,
} from './_harness';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManifestEntry {
  description?: string;
  version?: string;
  fixture_count?: number;
  note?: string;
  [key: string]: unknown;
}

type ManifestCategory = Record<string, ManifestEntry>;
type Manifest = Record<string, ManifestCategory>;

interface FixtureFileInfo {
  category: string;
  filename: string;
  path: string;
  fixtures?: BaseFixture[];
  version?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get all fixture JSON files from the conformance fixtures directory.
 * Excludes manifest.json and schema files.
 */
function getAllFixtureFiles(): FixtureFileInfo[] {
  const files: FixtureFileInfo[] = [];
  const categories = readdirSync(CONFORMANCE_ROOT).filter((name) => {
    const fullPath = join(CONFORMANCE_ROOT, name);
    return statSync(fullPath).isDirectory();
  });

  for (const category of categories) {
    const categoryPath = join(CONFORMANCE_ROOT, category);
    const jsonFiles = readdirSync(categoryPath).filter(
      (f) => f.endsWith('.json') && f !== 'manifest.json' && !f.endsWith('.schema.json')
    );

    for (const filename of jsonFiles) {
      const filePath = join(categoryPath, filename);
      const info: FixtureFileInfo = { category, filename, path: filePath };

      try {
        const content = JSON.parse(readFileSync(filePath, 'utf-8'));
        // Only process files that have a fixtures array (fixture packs)
        if (Array.isArray(content.fixtures)) {
          info.fixtures = content.fixtures;
          info.version = content.version;
        }
      } catch (e) {
        info.error = e instanceof Error ? e.message : String(e);
      }

      files.push(info);
    }
  }

  return files;
}

/**
 * Check if a category uses fixture packs (files with fixtures array)
 * vs single-receipt fixtures (standalone JSON files).
 */
function isFixturePackCategory(category: string, manifest: Manifest): boolean {
  const categoryManifest = manifest[category];
  if (!categoryManifest) return false;

  // If any entry has fixture_count, it's a fixture pack category
  return Object.values(categoryManifest).some((entry) => typeof entry.fixture_count === 'number');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Global Conformance Manifest Hygiene', () => {
  let manifest: Manifest;
  let allFiles: FixtureFileInfo[];

  beforeAll(() => {
    manifest = loadManifest() as Manifest;
    allFiles = getAllFixtureFiles();
  });

  // -------------------------------------------------------------------------
  // Manifest Structure
  // -------------------------------------------------------------------------

  describe('Manifest Structure', () => {
    it('manifest.json exists and is valid JSON', () => {
      const manifestPath = join(CONFORMANCE_ROOT, 'manifest.json');
      expect(existsSync(manifestPath)).toBe(true);

      const content = readFileSync(manifestPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('manifest has expected top-level categories', () => {
      // Categories that should exist based on current fixtures
      const expectedCategories = [
        'valid',
        'invalid',
        'edge',
        'purpose',
        'agent-identity',
        'obligations',
        'dispute',
        'issue',
        'policy',
        'bundle',
        'discovery',
        'workflow',
        'interaction',
      ];

      for (const category of expectedCategories) {
        expect(manifest[category], `Missing category: ${category}`).toBeDefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // File-Manifest Correspondence
  // -------------------------------------------------------------------------

  describe('File-Manifest Correspondence', () => {
    // NOTE: Some legacy categories (x402, attribution) have fixture files but
    // aren't tracked in manifest.json. This test checks fixture-pack categories
    // (those with fixture_count) for completeness.
    it('fixture-pack files in filesystem are represented in manifest', () => {
      const missing: string[] = [];

      for (const file of allFiles) {
        // Skip non-fixture-pack files (single receipts, etc.)
        if (!file.fixtures) continue;

        const categoryManifest = manifest[file.category];
        if (!categoryManifest) {
          // Legacy category not tracked - skip for now
          continue;
        }

        if (!categoryManifest[file.filename]) {
          missing.push(`${file.category}/${file.filename}`);
        }
      }

      expect(missing, `Fixture pack files not in manifest:\n${missing.join('\n')}`).toHaveLength(0);
    });

    it('no orphaned manifest entries (entries without corresponding files)', () => {
      const orphaned: string[] = [];

      for (const [category, entries] of Object.entries(manifest)) {
        if (category.startsWith('$')) continue; // Skip meta fields like $comment

        const categoryPath = join(CONFORMANCE_ROOT, category);
        if (!existsSync(categoryPath)) {
          orphaned.push(`${category}/ (category directory missing)`);
          continue;
        }

        for (const filename of Object.keys(entries)) {
          const filePath = join(categoryPath, filename);
          if (!existsSync(filePath)) {
            orphaned.push(`${category}/${filename}`);
          }
        }
      }

      expect(orphaned, `Orphaned manifest entries:\n${orphaned.join('\n')}`).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Category Tracking Registry
  // -------------------------------------------------------------------------

  /**
   * Categories with accurate manifest tracking (fixture_count, unique names).
   * These are actively maintained and enforced by this test.
   */
  const TRACKED_CATEGORIES = ['interaction', 'agent-identity'];

  /**
   * Categories explicitly NOT tracked in manifest.json.
   * Each entry documents the reason for exclusion.
   * To graduate a category: fix the issues and move to TRACKED_CATEGORIES.
   */
  const UNTRACKED_CATEGORIES: Record<string, string> = {
    x402: 'Single-receipt fixtures, not fixture packs; manifest not updated',
    attribution: 'Category not in manifest.json; needs manifest entry',
    bundle: 'fixture_count drift (manifest=12, actual=20); needs update',
    dispute: 'fixture_count drift (edge-cases: manifest=22, actual=20)',
    workflow: 'fixture_count drift across multiple files; needs audit',
    obligations: 'Duplicate fixture names in valid.json and invalid.json',
    issue: 'Moderate drift; not yet audited',
    policy: 'Moderate drift; not yet audited',
    discovery: 'Not yet audited for fixture pack hygiene',
    purpose: 'Legacy category; no fixture_count tracking',
    valid: 'Single-receipt fixtures, not fixture packs',
    invalid: 'Single-receipt fixtures, not fixture packs',
    edge: 'Single-receipt fixtures, not fixture packs',
    verifier: 'New v0.10.8 fixtures; not yet tracked in manifest.json',
    crypto: 'Deterministic golden vectors (Ed25519 sign/verify); not fixture packs',
    parse:
      'Single-receipt fixtures (v0.10.9+); tracked via expected_error/expected_variant in manifest.json, not fixture_count',
  };

  // -------------------------------------------------------------------------
  // Fixture Count Validation
  // -------------------------------------------------------------------------

  describe('Fixture Count Validation', () => {
    it('fixture_count matches actual fixtures.length for tracked categories', () => {
      const mismatches: string[] = [];

      for (const file of allFiles) {
        if (!file.fixtures) continue; // Not a fixture pack
        if (!TRACKED_CATEGORIES.includes(file.category)) continue; // Skip legacy

        const categoryManifest = manifest[file.category];
        if (!categoryManifest) continue;

        const entry = categoryManifest[file.filename];
        if (!entry) continue;

        const expectedCount = entry.fixture_count;
        if (expectedCount === undefined) continue; // Count not tracked

        const actualCount = file.fixtures.length;
        if (actualCount !== expectedCount) {
          mismatches.push(
            `${file.category}/${file.filename}: actual=${actualCount}, manifest=${expectedCount}`
          );
        }
      }

      expect(mismatches, `Fixture count mismatches:\n${mismatches.join('\n')}`).toHaveLength(0);
    });

    it('fixture pack categories have fixture_count for all files', () => {
      const missing: string[] = [];

      for (const [category, entries] of Object.entries(manifest)) {
        if (category.startsWith('$')) continue;
        if (!isFixturePackCategory(category, manifest)) continue;

        for (const [filename, entry] of Object.entries(entries)) {
          if (entry.fixture_count === undefined) {
            missing.push(`${category}/${filename}`);
          }
        }
      }

      // Some categories intentionally don't track counts (valid/invalid/edge for legacy receipts)
      // Only fail if fixture pack categories are missing counts
      if (missing.length > 0) {
        const fixturePackMissing = missing.filter((path) => {
          const category = path.split('/')[0];
          return [
            'agent-identity',
            'obligations',
            'dispute',
            'issue',
            'policy',
            'bundle',
            'workflow',
            'interaction',
          ].includes(category);
        });

        expect(
          fixturePackMissing,
          `Fixture pack categories missing fixture_count:\n${fixturePackMissing.join('\n')}`
        ).toHaveLength(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Version Consistency
  // -------------------------------------------------------------------------

  describe('Version Consistency', () => {
    it('versions within each category are consistent', () => {
      const inconsistent: string[] = [];

      for (const [category, entries] of Object.entries(manifest)) {
        if (category.startsWith('$')) continue;

        const versions = new Set<string>();
        for (const entry of Object.values(entries)) {
          if (entry.version) {
            versions.add(entry.version);
          }
        }

        if (versions.size > 1) {
          inconsistent.push(`${category}: ${Array.from(versions).join(', ')}`);
        }
      }

      expect(
        inconsistent,
        `Categories with inconsistent versions:\n${inconsistent.join('\n')}`
      ).toHaveLength(0);
    });

    it('all fixture file versions are valid semver', () => {
      const invalid: string[] = [];

      for (const file of allFiles) {
        if (!file.version) continue;

        try {
          assertSemverVersion(file.version, `${file.category}/${file.filename}`);
        } catch (e) {
          invalid.push(`${file.category}/${file.filename}: ${file.version}`);
        }
      }

      expect(invalid, `Files with invalid semver versions:\n${invalid.join('\n')}`).toHaveLength(0);
    });

    it('fixture file versions match manifest versions', () => {
      const mismatches: string[] = [];

      for (const file of allFiles) {
        if (!file.version) continue;

        const categoryManifest = manifest[file.category];
        if (!categoryManifest) continue;

        const entry = categoryManifest[file.filename];
        if (!entry?.version) continue;

        if (file.version !== entry.version) {
          mismatches.push(
            `${file.category}/${file.filename}: file=${file.version}, manifest=${entry.version}`
          );
        }
      }

      expect(mismatches, `Version mismatches:\n${mismatches.join('\n')}`).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Fixture Name Uniqueness
  // -------------------------------------------------------------------------

  describe('Fixture Name Uniqueness', () => {
    it('all fixture names are unique within each file (tracked categories)', () => {
      const duplicates: string[] = [];

      for (const file of allFiles) {
        if (!file.fixtures) continue;
        if (!TRACKED_CATEGORIES.includes(file.category)) continue;

        try {
          assertUniqueNames(file.fixtures, `${file.category}/${file.filename}`);
        } catch (e) {
          duplicates.push(e instanceof Error ? e.message : String(e));
        }
      }

      expect(
        duplicates,
        `Files with duplicate fixture names:\n${duplicates.join('\n')}`
      ).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Untracked Category Registry (Visible Debt)
  // -------------------------------------------------------------------------

  describe('Untracked Category Registry', () => {
    it('all fixture directories are either tracked or explicitly untracked', () => {
      const allCategories = readdirSync(CONFORMANCE_ROOT).filter((name) => {
        const fullPath = join(CONFORMANCE_ROOT, name);
        return statSync(fullPath).isDirectory();
      });

      const unknownCategories: string[] = [];
      for (const category of allCategories) {
        if (!TRACKED_CATEGORIES.includes(category) && !UNTRACKED_CATEGORIES[category]) {
          unknownCategories.push(category);
        }
      }

      expect(
        unknownCategories,
        `Categories without tracking status (add to TRACKED_CATEGORIES or UNTRACKED_CATEGORIES):\n${unknownCategories.join('\n')}`
      ).toHaveLength(0);
    });

    it('documents untracked categories with reasons (non-failing visibility)', () => {
      // This test always passes but logs untracked categories for visibility
      const untrackedList = Object.entries(UNTRACKED_CATEGORIES)
        .map(([cat, reason]) => `  ${cat}: ${reason}`)
        .join('\n');

      // Log to console for CI visibility (non-failing)
      if (Object.keys(UNTRACKED_CATEGORIES).length > 0) {
        console.log(
          `\n[DEBT] Untracked fixture categories (${Object.keys(UNTRACKED_CATEGORIES).length}):\n${untrackedList}\n`
        );
      }

      // Always passes - this is for visibility only
      expect(true).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Ordering Lock Fixtures
  // -------------------------------------------------------------------------

  describe('Ordering Lock Fixtures', () => {
    it('fixtures with meta.ordering_lock have valid error expectations', () => {
      const issues: string[] = [];

      for (const file of allFiles) {
        if (!file.fixtures) continue;

        for (const fixture of file.fixtures) {
          const orderingLock = fixture.expected?.meta?.ordering_lock;
          if (!orderingLock) continue;

          // Ordering lock fixtures MUST have expected.valid = false and error_code
          if (fixture.expected.valid !== false) {
            issues.push(
              `${file.category}/${file.filename}:${fixture.name} has ordering_lock but expected.valid !== false`
            );
          }

          if (!fixture.expected.error_code) {
            issues.push(
              `${file.category}/${file.filename}:${fixture.name} has ordering_lock but no error_code`
            );
          }
        }
      }

      expect(
        issues,
        `Ordering lock fixtures with invalid expectations:\n${issues.join('\n')}`
      ).toHaveLength(0);
    });

    it('ordering lock fixtures document the precedence rule', () => {
      const missing: string[] = [];

      for (const file of allFiles) {
        if (!file.fixtures) continue;

        for (const fixture of file.fixtures) {
          const orderingLock = fixture.expected?.meta?.ordering_lock;
          if (!orderingLock) continue;

          // Ordering lock must be a non-empty string explaining the rule
          if (typeof orderingLock !== 'string' || orderingLock.length < 10) {
            missing.push(
              `${file.category}/${file.filename}:${fixture.name} has insufficient ordering_lock description`
            );
          }
        }
      }

      expect(
        missing,
        `Ordering lock fixtures missing proper documentation:\n${missing.join('\n')}`
      ).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Parse Errors
  // -------------------------------------------------------------------------

  describe('Parse Errors', () => {
    it('all fixture files parse without errors', () => {
      const errors = allFiles
        .filter((f) => f.error)
        .map((f) => `${f.category}/${f.filename}: ${f.error}`);

      expect(errors, `Fixture files with parse errors:\n${errors.join('\n')}`).toHaveLength(0);
    });
  });
});
