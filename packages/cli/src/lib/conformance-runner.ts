/**
 * PEAC Conformance Runner Library
 *
 * Category-aware validation using the same validators as tests/conformance/*.spec.ts:
 * - Receipt validation via @peac/schema (ReceiptClaimsSchema)
 * - Discovery validation via @peac/disc (parse, validate)
 * - Bundle verification via @peac/audit (verifyBundleIntegrity)
 * - Attestation validation via @peac/schema validators
 * - Interaction/Workflow validation via ordered validators
 *
 * This is the CLI's thin wrapper around the conformance suite.
 */

import * as fs from 'fs';
import * as path from 'path';

// Re-export types and utilities from modules
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
  FixturePack,
  SingleFixture,
} from './conformance/types.js';

export { zodPathToJsonPointer } from './conformance/digest.js';

// Import from modules
import type {
  ConformanceReport,
  RunnerOptions,
  RunnerCallbacks,
  TestResult,
  TestStatus,
  FixturePack,
  SingleFixture,
  ProfileDetail,
} from './conformance/types.js';

import { loadManifest, getManifestEntry } from './conformance/manifest.js';
import { sha256, computeCanonicalDigest, computeVectorsDigest } from './conformance/digest.js';
import { getCategoryCapability, getCategoryProfile, shouldRunAtLevel } from './conformance/profiles.js';
import { getValidator } from './conformance/validators.js';

/**
 * Run conformance tests and generate report
 * Pure function - no console output, uses callbacks for progress
 */
export function runConformance(
  options: RunnerOptions,
  callbacks?: RunnerCallbacks
): ConformanceReport {
  const { fixturesDir, level, category, implementationName, implementationVersion } = options;

  // Load manifest for reason checking
  const manifest = loadManifest(fixturesDir);

  // Collect categories to test
  const entries = fs.readdirSync(fixturesDir, { withFileTypes: true });
  let categories = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name);

  if (category) {
    if (!categories.includes(category)) {
      throw new Error(`Category not found: ${category}`);
    }
    categories = [category];
  }

  // Compute comprehensive vectors digest (includes manifest.json, recursive)
  const vectorsDigest = computeVectorsDigest(fixturesDir, categories);

  // Collect profiles
  const profiles = new Set<string>();

  // Run tests
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const cat of categories) {
    const categoryPath = path.join(fixturesDir, cat);
    const profile = getCategoryProfile(cat);
    profiles.add(profile);

    const validator = getValidator(cat);
    const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(categoryPath, file);
      const content = fs.readFileSync(filePath, 'utf8');
      let fixture: unknown;

      const baseTestId = `${cat}.${file.replace('.json', '')}`;
      callbacks?.onTestStart?.(baseTestId);

      try {
        fixture = JSON.parse(content);
      } catch (err) {
        // Invalid JSON is a test failure
        failed++;
        const result: TestResult = {
          id: `${baseTestId}.parse`,
          category: profile,
          status: 'fail',
          observed: {
            valid: false,
            error_code: 'E_INVALID_JSON',
            error_message: (err as Error).message,
          },
          diagnostics: {
            error_code: 'E_INVALID_JSON',
            error_message: (err as Error).message,
          },
        };
        results.push(result);
        callbacks?.onTestComplete?.(result);
        continue;
      }

      // Determine if this is a fixture pack or single fixture
      const fixtureObj = fixture as Record<string, unknown>;
      const isFixturePack = Array.isArray(fixtureObj.fixtures);

      if (isFixturePack) {
        // Process fixture pack
        const pack = fixture as FixturePack;

        if (!shouldRunAtLevel(pack.version, level)) {
          skipped++;
          const result: TestResult = {
            id: baseTestId,
            category: profile,
            status: 'skip',
            diagnostics: {
              skip_reason: `Fixture version ${pack.version} exceeds level ${level}`,
            },
          };
          results.push(result);
          callbacks?.onTestComplete?.(result);
          continue;
        }

        for (let i = 0; i < pack.fixtures.length; i++) {
          const f = pack.fixtures[i];
          const fixtureName = f.name ?? `fixture_${i}`;
          const testId = `${baseTestId}.${fixtureName.replace(/\s+/g, '_')}`;
          // Use JCS for canonical input digest (returns {alg, value})
          const inputDigest = computeCanonicalDigest(f.input);

          callbacks?.onTestStart?.(testId);

          const observed = validator(f.input);

          // Check if result matches expectation
          const expectedValid = f.expected.valid;
          const actualValid = observed.valid;
          const expectedError = f.expected.error_code ?? f.expected.error;
          const actualError = observed.error_code;

          let status: TestStatus;
          if (expectedValid && actualValid) {
            status = 'pass';
            passed++;
          } else if (!expectedValid && !actualValid) {
            // Both invalid - check if error codes match (if specified)
            if (expectedError && actualError && expectedError !== actualError) {
              status = 'fail';
              failed++;
            } else {
              status = 'pass';
              passed++;
            }
          } else {
            status = 'fail';
            failed++;
          }

          const result: TestResult = {
            id: testId,
            category: profile,
            status,
            expected: {
              valid: expectedValid,
              error_code: expectedError,
            },
            observed: {
              valid: actualValid,
              error_code: actualError,
              error_message: observed.error_message,
            },
            diagnostics: {
              input_digest: inputDigest,
              warnings: observed.warnings,
            },
          };
          results.push(result);
          callbacks?.onTestComplete?.(result);
        }
      } else {
        // Process single fixture
        const singleFixture = fixture as SingleFixture;
        const testId = baseTestId;

        // Get manifest entry for additional expectations
        const manifestEntry = getManifestEntry(manifest, cat, file);

        // Use JCS for payload if present, otherwise hash raw file content for single fixtures
        const inputToValidate = singleFixture.payload ?? fixture;
        const inputDigest = singleFixture.payload
          ? computeCanonicalDigest(inputToValidate)
          : { alg: 'sha-256', value: sha256(content) }; // Raw file hash for single fixtures without payload

        // Determine expected validity from (in order): fixture, manifest, category default
        const expectedValid =
          singleFixture.expected_valid ??
          manifestEntry?.expected_valid ??
          (cat === 'valid' || cat === 'edge');

        // Get expected error from fixture, manifest, or manifest keyword
        const expectedError =
          singleFixture.expected_error ??
          manifestEntry?.expected_error_code ??
          (manifestEntry?.expected_keyword ? `E_${manifestEntry.expected_keyword.toUpperCase()}` : undefined);

        const observed = validator(inputToValidate);

        let status: TestStatus;
        if (expectedValid && observed.valid) {
          status = 'pass';
          passed++;
        } else if (!expectedValid && !observed.valid) {
          // Both invalid - check if error codes match (if specified)
          if (expectedError && observed.error_code && expectedError !== observed.error_code) {
            status = 'fail';
            failed++;
          } else {
            status = 'pass';
            passed++;
          }
        } else {
          status = 'fail';
          failed++;
        }

        const result: TestResult = {
          id: testId,
          category: profile,
          status,
          expected: {
            valid: expectedValid,
            error_code: expectedError,
          },
          observed: {
            valid: observed.valid,
            error_code: observed.error_code,
            error_message: observed.error_message,
          },
          diagnostics: {
            input_digest: inputDigest,
            warnings: observed.warnings,
          },
        };
        results.push(result);
        callbacks?.onTestComplete?.(result);
      }
    }
  }

  // Build capabilities from tested categories
  const capabilities: ProfileDetail[] = [];
  for (const cat of categories) {
    const capability = getCategoryCapability(cat);
    // Deduplicate by profile name
    if (!capabilities.some((c) => c.profile === capability.profile)) {
      capabilities.push(capability);
    }
  }
  capabilities.sort((a, b) => a.profile.localeCompare(b.profile));

  // Build report
  const report: ConformanceReport = {
    report_version: 'peac-conformance-report/0.1',
    suite: {
      name: 'peac-core-conformance',
      version: '0.1.0',
      vectors_digest: {
        alg: 'sha-256',
        value: vectorsDigest,
      },
      profiles: Array.from(profiles).sort(),
      capabilities,
    },
    implementation: {
      name: implementationName ?? '@peac/cli',
      version: implementationVersion ?? '0.0.0',
    },
    summary: {
      passed,
      failed,
      skipped,
      total: passed + failed + skipped,
      status: failed === 0 ? 'pass' : 'fail',
    },
    results,
  };

  return report;
}

/**
 * Format report as text
 */
export function formatReportText(report: ConformanceReport): string {
  const lines: string[] = [];

  lines.push('PEAC Conformance Test Results');
  lines.push('=============================');
  lines.push('');
  lines.push(`Status: ${report.summary.status.toUpperCase()}`);
  lines.push(`Profiles: ${report.suite.profiles.join(', ')}`);
  lines.push('');
  lines.push('Summary:');
  lines.push(`  Passed:  ${report.summary.passed}`);
  lines.push(`  Failed:  ${report.summary.failed}`);
  lines.push(`  Skipped: ${report.summary.skipped}`);
  lines.push(`  Total:   ${report.summary.total}`);

  const failures = report.results.filter((r) => r.status === 'fail');
  if (failures.length > 0) {
    lines.push('');
    lines.push('Failures:');
    for (const f of failures) {
      lines.push(`  - ${f.id}`);
      if (f.expected) {
        lines.push(
          `    Expected: valid=${f.expected.valid}${f.expected.error_code ? `, error=${f.expected.error_code}` : ''}`
        );
      }
      if (f.observed) {
        lines.push(
          `    Observed: valid=${f.observed.valid}${f.observed.error_code ? `, error=${f.observed.error_code}` : ''}`
        );
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format report as markdown
 */
export function formatReportMarkdown(report: ConformanceReport): string {
  const lines: string[] = [];

  lines.push('# PEAC Conformance Report');
  lines.push('');
  lines.push(`**Status:** ${report.summary.status.toUpperCase()}`);
  lines.push(`**Profiles:** ${report.suite.profiles.join(', ')}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|--------|-------|');
  lines.push(`| Passed | ${report.summary.passed} |`);
  lines.push(`| Failed | ${report.summary.failed} |`);
  lines.push(`| Skipped | ${report.summary.skipped} |`);
  lines.push(`| Total | ${report.summary.total} |`);

  const failures = report.results.filter((r) => r.status === 'fail');
  if (failures.length > 0) {
    lines.push('');
    lines.push('## Failures');
    lines.push('');
    for (const f of failures) {
      lines.push(`### ${f.id}`);
      lines.push('');
      if (f.expected) {
        lines.push(
          `- **Expected:** valid=${f.expected.valid}${f.expected.error_code ? `, error=${f.expected.error_code}` : ''}`
        );
      }
      if (f.observed) {
        lines.push(
          `- **Observed:** valid=${f.observed.valid}${f.observed.error_code ? `, error=${f.observed.error_code}` : ''}`
        );
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
