#!/usr/bin/env tsx
/**
 * Conformance harness CLI (DD-122)
 *
 * Runs conformance fixtures against validators and produces a structured report.
 *
 * Usage:
 *   pnpm exec tsx scripts/conformance-harness.ts --adapter core
 *   pnpm exec tsx scripts/conformance-harness.ts --adapter core --format pretty
 *
 * Exit code: 0 = all pass, 1 = failures
 * Output: JSON report to stdout (default) or pretty-printed table
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FixtureResult {
  fixture: string;
  category: string;
  status: 'pass' | 'fail' | 'skip';
  error?: string;
  duration_ms: number;
}

interface HarnessReport {
  adapter: string;
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  results: FixtureResult[];
}

interface ManifestEntry {
  description?: string;
  expected_valid?: boolean;
  expected_keyword?: string;
  expected_path?: string;
  expected_error?: string;
  expected_variant?: string;
  version?: string;
  fixture_count?: number;
  note?: string;
}

type Manifest = Record<string, Record<string, ManifestEntry>>;

// ---------------------------------------------------------------------------
// Validator imports (lazy, adapter-specific)
// ---------------------------------------------------------------------------

type ValidatorFn = (input: unknown) => {
  valid: boolean;
  error_code?: string;
  error_message?: string;
};

async function loadCoreValidators(): Promise<Record<string, ValidatorFn>> {
  // Use relative path to built dist to avoid pnpm strict module resolution issues
  const schemaPath = join(__dirname, '..', 'packages', 'schema', 'dist', 'index.mjs');
  const schema = await import(schemaPath);

  return {
    valid: (input) => {
      const result = schema.ReceiptClaimsSchema.safeParse(input);
      return { valid: result.success };
    },
    invalid: (input) => {
      const result = schema.ReceiptClaimsSchema.safeParse(input);
      return { valid: result.success };
    },
    edge: (input) => {
      const result = schema.ReceiptClaimsSchema.safeParse(input);
      return { valid: result.success };
    },
    parse: (input) => {
      const pr = schema.parseReceiptClaims(input);
      if (pr.ok) return { valid: true };
      return { valid: false, error_code: pr.error.code, error_message: pr.error.message };
    },
    'agent-identity': (input) => {
      const r = schema.validateAgentIdentityAttestation(input);
      return { valid: r.ok };
    },
    attribution: (input) => {
      const r = schema.validateAttributionAttestation(input);
      return { valid: r.ok };
    },
    dispute: (input) => {
      const r = schema.validateDisputeAttestation(input);
      return { valid: r.ok };
    },
    interaction: (input) => {
      const r = schema.validateInteractionOrdered(input);
      return { valid: r.valid };
    },
    workflow: (input) => {
      const r = schema.validateWorkflowContextOrdered(input);
      return { valid: r.valid };
    },
    obligations: (input) => {
      const r = schema.validateObligationsExtension(input);
      return { valid: r.ok };
    },
  };
}

// ---------------------------------------------------------------------------
// Fixture runner
// ---------------------------------------------------------------------------

function loadFixtures(
  fixtureDir: string
): Array<{ category: string; file: string; data: unknown }> {
  const fixtures: Array<{ category: string; file: string; data: unknown }> = [];

  if (!existsSync(fixtureDir)) {
    return fixtures;
  }

  const categories = readdirSync(fixtureDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const category of categories) {
    const catDir = join(fixtureDir, category);
    const files = readdirSync(catDir).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      try {
        const raw = readFileSync(join(catDir, file), 'utf-8');
        const data = JSON.parse(raw);
        fixtures.push({ category, file, data });
      } catch {
        fixtures.push({ category, file, data: null });
      }
    }
  }

  return fixtures;
}

function runFixture(
  category: string,
  file: string,
  data: unknown,
  manifest: Manifest,
  validators: Record<string, ValidatorFn>
): FixtureResult {
  const start = performance.now();
  const fixtureKey = basename(file);

  // Get manifest entry for this fixture
  const categoryManifest = manifest[category];
  const entry = categoryManifest?.[fixtureKey];

  // Get validator for this category
  const validator = validators[category];

  if (!validator) {
    return {
      fixture: `${category}/${file}`,
      category,
      status: 'skip',
      error: `No validator for category: ${category}`,
      duration_ms: performance.now() - start,
    };
  }

  if (data === null) {
    return {
      fixture: `${category}/${file}`,
      category,
      status: 'fail',
      error: 'Failed to parse fixture JSON',
      duration_ms: performance.now() - start,
    };
  }

  try {
    // Determine what to validate: fixture packs have nested vectors,
    // simple fixtures are validated directly
    const fixtureData = data as Record<string, unknown>;
    const vectors = fixtureData.vectors ?? fixtureData.fixtures ?? fixtureData.cases;

    if (Array.isArray(vectors)) {
      // Fixture pack: validate each vector
      let allPassed = true;
      let firstError: string | undefined;

      for (let i = 0; i < vectors.length; i++) {
        const vector = vectors[i] as Record<string, unknown>;
        const input = vector.input ?? vector.claims ?? vector.payload ?? vector;
        const expectedValid = vector.expected_valid ?? vector.valid;
        const expectedError = vector.expected_error as string | undefined;

        const result = validator(input);

        if (expectedValid !== undefined) {
          if (result.valid !== expectedValid) {
            allPassed = false;
            firstError = `Vector ${i}: expected valid=${expectedValid}, got valid=${result.valid}`;
            break;
          }
        }

        if (expectedError && !result.valid && result.error_code !== expectedError) {
          allPassed = false;
          firstError = `Vector ${i}: expected error=${expectedError}, got error=${result.error_code}`;
          break;
        }
      }

      return {
        fixture: `${category}/${file}`,
        category,
        status: allPassed ? 'pass' : 'fail',
        error: firstError,
        duration_ms: performance.now() - start,
      };
    }

    // Simple fixture: validate directly
    // Determine expected outcome from manifest or category name
    const expectedValid = entry?.expected_valid ?? (category === 'valid' || category === 'edge');
    const expectedError = entry?.expected_error;

    // Extract the payload to validate
    const input = (fixtureData.payload ?? fixtureData.claims ?? fixtureData.auth) ? data : data;
    const result = validator(input);

    // For 'invalid' category, the fixture should fail validation
    if (category === 'invalid') {
      if (result.valid) {
        return {
          fixture: `${category}/${file}`,
          category,
          status: 'fail',
          error: 'Expected invalid fixture to fail validation, but it passed',
          duration_ms: performance.now() - start,
        };
      }
      return {
        fixture: `${category}/${file}`,
        category,
        status: 'pass',
        duration_ms: performance.now() - start,
      };
    }

    // For 'parse' category with expected_error
    if (expectedError && !result.valid) {
      const errorMatch = result.error_code === expectedError;
      return {
        fixture: `${category}/${file}`,
        category,
        status: errorMatch ? 'pass' : 'fail',
        error: errorMatch ? undefined : `Expected error ${expectedError}, got ${result.error_code}`,
        duration_ms: performance.now() - start,
      };
    }

    // For 'valid' category and fixtures with expected_valid=true
    if (expectedValid && !result.valid) {
      return {
        fixture: `${category}/${file}`,
        category,
        status: 'fail',
        error: `Expected valid fixture to pass, but got: ${result.error_code ?? result.error_message}`,
        duration_ms: performance.now() - start,
      };
    }

    return {
      fixture: `${category}/${file}`,
      category,
      status: 'pass',
      duration_ms: performance.now() - start,
    };
  } catch (err) {
    return {
      fixture: `${category}/${file}`,
      category,
      status: 'fail',
      error: err instanceof Error ? err.message : String(err),
      duration_ms: performance.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// Output formatters
// ---------------------------------------------------------------------------

function formatJson(report: HarnessReport): string {
  return JSON.stringify(report, null, 2);
}

function formatPretty(report: HarnessReport): string {
  const lines: string[] = [];
  lines.push(`Conformance Report: ${report.adapter}`);
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push('');

  // Group by category
  const byCategory = new Map<string, FixtureResult[]>();
  for (const r of report.results) {
    const cat = byCategory.get(r.category) ?? [];
    cat.push(r);
    byCategory.set(r.category, cat);
  }

  for (const [category, results] of byCategory) {
    const passed = results.filter((r) => r.status === 'pass').length;
    const failed = results.filter((r) => r.status === 'fail').length;
    const skipped = results.filter((r) => r.status === 'skip').length;
    lines.push(`  ${category}: ${passed} pass, ${failed} fail, ${skipped} skip`);

    for (const r of results) {
      const icon = r.status === 'pass' ? 'OK' : r.status === 'fail' ? 'FAIL' : 'SKIP';
      const suffix = r.error ? ` -- ${r.error}` : '';
      lines.push(`    [${icon}] ${r.fixture} (${r.duration_ms.toFixed(1)}ms)${suffix}`);
    }
  }

  lines.push('');
  lines.push(
    `Summary: ${report.summary.passed}/${report.summary.total} passed, ` +
      `${report.summary.failed} failed, ${report.summary.skipped} skipped`
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      adapter: { type: 'string', default: 'core' },
      fixtures: { type: 'string' },
      format: { type: 'string', default: 'json' },
    },
  });

  const adapter = values.adapter ?? 'core';
  const format = values.format ?? 'json';

  // Determine fixture directory (relative to repo root, not script location)
  const repoRoot = join(__dirname, '..');
  const defaultFixtureDir = join(repoRoot, 'specs', 'conformance', 'fixtures');
  const fixtureDir = values.fixtures ?? defaultFixtureDir;

  if (!existsSync(fixtureDir)) {
    process.stderr.write(`ERROR: Fixture directory not found: ${fixtureDir}\n`);
    process.exit(1);
  }

  // Load manifest
  const manifestPath = join(fixtureDir, 'manifest.json');
  let manifest: Manifest = {};
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Manifest;
  }

  // Load validators
  let validators: Record<string, ValidatorFn>;
  if (adapter === 'core') {
    validators = await loadCoreValidators();
  } else {
    process.stderr.write(`ERROR: Unknown adapter: ${adapter}. Available: core\n`);
    process.exit(1);
  }

  // Load and run fixtures
  const fixtures = loadFixtures(fixtureDir);
  const results: FixtureResult[] = [];

  for (const { category, file, data } of fixtures) {
    results.push(runFixture(category, file, data, manifest, validators));
  }

  // Sort deterministically: by category then fixture name
  results.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.fixture.localeCompare(b.fixture);
  });

  // Build report
  const report: HarnessReport = {
    adapter,
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: results.filter((r) => r.status === 'pass').length,
      failed: results.filter((r) => r.status === 'fail').length,
      skipped: results.filter((r) => r.status === 'skip').length,
    },
    results,
  };

  // Output
  if (format === 'pretty') {
    process.stdout.write(formatPretty(report) + '\n');
  } else {
    process.stdout.write(formatJson(report) + '\n');
  }

  // Exit code
  process.exit(report.summary.failed > 0 ? 1 : 0);
}

void main();
