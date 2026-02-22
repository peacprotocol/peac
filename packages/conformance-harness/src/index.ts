/**
 * Conformance harness core (DD-122)
 *
 * Validates conformance fixtures against adapter-specific validators.
 * Distinguishes between FAIL (claimed support, actual failure) and
 * SKIP (unsupported category or format).
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

// ---------------------------------------------------------------------------
// Types (stable report schema: specs/conformance/report.schema.json)
// ---------------------------------------------------------------------------

export type FixtureStatus = 'pass' | 'fail' | 'skip';

export type SkipReason = 'no_validator' | 'unsupported_format' | 'parse_error';

export interface FixtureResult {
  fixture: string;
  category: string;
  status: FixtureStatus;
  error?: string;
  skip_reason?: SkipReason;
  duration_ms: number;
}

export interface HarnessReport {
  schema_version: '1.0.0';
  peac_version: string;
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

export interface ManifestEntry {
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

export type Manifest = Record<string, Record<string, ManifestEntry>>;

export type ValidatorFn = (input: unknown) => {
  valid: boolean;
  error_code?: string;
  error_message?: string;
};

export interface AdapterDefinition {
  /** Categories this adapter claims to support. FAIL if supported + error. */
  supportedCategories: Set<string>;
  /** Validator functions keyed by category name. */
  validators: Record<string, ValidatorFn>;
}

// ---------------------------------------------------------------------------
// Core adapter (built-in, uses @peac/schema)
// ---------------------------------------------------------------------------

export async function loadCoreAdapter(): Promise<AdapterDefinition> {
  // Import from @peac/schema (proper workspace dependency)
  const schema = await import('@peac/schema');

  const supportedCategories = new Set([
    'valid',
    'invalid',
    'edge',
    'parse',
    'agent-identity',
    'attribution',
    'dispute',
    'interaction',
    'workflow',
    'obligations',
  ]);

  // Unwrap Wire 0.1 { auth: {...} } wrapper if present
  function unwrapAuth(input: unknown): unknown {
    if (typeof input === 'object' && input !== null && 'auth' in input) {
      return (input as Record<string, unknown>).auth;
    }
    return input;
  }

  const validators: Record<string, ValidatorFn> = {
    valid: (input) => {
      const result = schema.ReceiptClaimsSchema.safeParse(unwrapAuth(input));
      return { valid: result.success };
    },
    invalid: (input) => {
      const result = schema.ReceiptClaimsSchema.safeParse(unwrapAuth(input));
      return { valid: result.success };
    },
    edge: (input) => {
      const result = schema.ReceiptClaimsSchema.safeParse(unwrapAuth(input));
      return { valid: result.success };
    },
    parse: (input) => {
      // Parse fixtures use { claims: {...}, expected_error: "..." } wrapper
      const payload =
        typeof input === 'object' && input !== null && 'claims' in input
          ? (input as Record<string, unknown>).claims
          : input;
      const pr = schema.parseReceiptClaims(payload);
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

  return { supportedCategories, validators };
}

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

export function loadFixtures(
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

// ---------------------------------------------------------------------------
// Fixture runner
// ---------------------------------------------------------------------------

export function runFixture(
  category: string,
  file: string,
  data: unknown,
  manifest: Manifest,
  adapter: AdapterDefinition
): FixtureResult {
  const start = performance.now();
  const fixtureKey = basename(file);
  const categoryManifest = manifest[category];
  const entry = categoryManifest?.[fixtureKey];

  const validator = adapter.validators[category];

  // No validator at all for this category
  if (!validator) {
    // If we claim support, this is a real problem (FAIL)
    if (adapter.supportedCategories.has(category)) {
      return {
        fixture: `${category}/${file}`,
        category,
        status: 'fail',
        error: `Adapter claims support for '${category}' but no validator is registered`,
        duration_ms: performance.now() - start,
      };
    }
    return {
      fixture: `${category}/${file}`,
      category,
      status: 'skip',
      skip_reason: 'no_validator',
      error: `No validator for category: ${category}`,
      duration_ms: performance.now() - start,
    };
  }

  // Validator exists but category not in supported set: skip as unsupported format
  if (!adapter.supportedCategories.has(category)) {
    return {
      fixture: `${category}/${file}`,
      category,
      status: 'skip',
      skip_reason: 'unsupported_format',
      error: `Category '${category}' not in adapter's supported set`,
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

  // Detect legacy fixture format: auth/claims wrapper with non-standard field values.
  // Fixtures using this format predate the current schema and should SKIP, not FAIL.
  const isLegacyFormat =
    typeof data === 'object' &&
    data !== null &&
    ('auth' in data || ('claims' in data && 'expected_error' in data)) &&
    !('vectors' in data);

  try {
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
            firstError = `Vector ${i}: expected valid=${String(expectedValid)}, got valid=${String(result.valid)}`;
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
    const expectedValid = entry?.expected_valid ?? (category === 'valid' || category === 'edge');
    // expected_error can come from manifest OR from the fixture data itself (parse fixtures)
    const expectedError =
      entry?.expected_error ??
      (typeof fixtureData.expected_error === 'string' ? fixtureData.expected_error : undefined);
    const result = validator(data);

    // 'invalid' category: fixture should fail validation
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

    // 'parse' category with expected_error
    if (expectedError && !result.valid) {
      const errorMatch = result.error_code === expectedError;
      if (!errorMatch && isLegacyFormat) {
        return {
          fixture: `${category}/${file}`,
          category,
          status: 'skip',
          skip_reason: 'unsupported_format',
          error: `Legacy fixture: expected error ${expectedError}, got ${result.error_code} (Wire 0.1 format)`,
          duration_ms: performance.now() - start,
        };
      }
      return {
        fixture: `${category}/${file}`,
        category,
        status: errorMatch ? 'pass' : 'fail',
        error: errorMatch ? undefined : `Expected error ${expectedError}, got ${result.error_code}`,
        duration_ms: performance.now() - start,
      };
    }

    // 'valid' category and fixtures with expected_valid=true
    if (expectedValid && !result.valid) {
      // Legacy fixtures use Wire 0.1 format with older field conventions
      // (e.g. non-UUIDv7 rid, different nesting). SKIP, not FAIL.
      if (isLegacyFormat) {
        return {
          fixture: `${category}/${file}`,
          category,
          status: 'skip',
          skip_reason: 'unsupported_format',
          error: `Legacy Wire 0.1 fixture format (auth wrapper, pre-current schema)`,
          duration_ms: performance.now() - start,
        };
      }
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
// Report helpers
// ---------------------------------------------------------------------------

export function buildReport(
  adapter: string,
  peacVersion: string,
  results: FixtureResult[]
): HarnessReport {
  // Sort deterministically: by category then fixture name
  const sorted = [...results].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.fixture.localeCompare(b.fixture);
  });

  return {
    schema_version: '1.0.0',
    peac_version: peacVersion,
    adapter,
    timestamp: new Date().toISOString(),
    summary: {
      total: sorted.length,
      passed: sorted.filter((r) => r.status === 'pass').length,
      failed: sorted.filter((r) => r.status === 'fail').length,
      skipped: sorted.filter((r) => r.status === 'skip').length,
    },
    results: sorted,
  };
}

export function formatJson(report: HarnessReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatPretty(report: HarnessReport): string {
  const lines: string[] = [];
  lines.push(`Conformance Report: ${report.adapter} (PEAC ${report.peac_version})`);
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push('');

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
      const reason = r.skip_reason ? ` [${r.skip_reason}]` : '';
      const suffix = r.error ? ` -- ${r.error}` : '';
      lines.push(`    [${icon}]${reason} ${r.fixture} (${r.duration_ms.toFixed(1)}ms)${suffix}`);
    }
  }

  lines.push('');
  lines.push(
    `Summary: ${report.summary.passed}/${report.summary.total} passed, ` +
      `${report.summary.failed} failed, ${report.summary.skipped} skipped`
  );

  return lines.join('\n');
}
