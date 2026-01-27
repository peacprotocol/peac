/**
 * Generate TypeScript error code constants from specs/kernel/errors.json
 *
 * This script is the single source of truth for error codes.
 * Run: npx tsx scripts/codegen-errors.ts
 *
 * CI should run this and assert `git diff --exit-code` to detect drift.
 */

import * as fs from 'fs';
import * as path from 'path';

const SPEC_PATH = path.join(__dirname, '../specs/kernel/errors.json');
const OUTPUT_PATH = path.join(__dirname, '../packages/kernel/src/errors.generated.ts');
const CATEGORIES_OUTPUT_PATH = path.join(
  __dirname,
  '../packages/kernel/src/error-categories.generated.ts'
);

// Valid HTTP status codes for errors
const VALID_HTTP_STATUSES = new Set([
  200,
  201,
  202,
  204, // Success (rarely used for errors)
  400,
  401,
  402,
  403,
  404,
  409, // Client errors
  429, // Rate limiting
  500,
  502,
  503,
  504, // Server errors
]);

// Categories are derived from errors.json at runtime (single source of truth).
// The codegen script validates these against the kernel types.ts union to prevent drift.

interface ErrorSpec {
  code: string;
  http_status: number;
  title: string;
  description: string;
  retriable: boolean;
  category: string;
}

interface ErrorsJson {
  $schema: string;
  version: string;
  description: string;
  errors: ErrorSpec[];
}

function main() {
  console.log('Reading specs/kernel/errors.json...');
  const specContent = fs.readFileSync(SPEC_PATH, 'utf-8');
  const spec: ErrorsJson = JSON.parse(specContent);

  console.log(`Found ${spec.errors.length} error codes (version ${spec.version})`);

  // Validate uniqueness
  const seenCodes = new Set<string>();
  for (const err of spec.errors) {
    if (seenCodes.has(err.code)) {
      throw new Error(`Duplicate error code: ${err.code}`);
    }
    seenCodes.add(err.code);

    // Validate HTTP status
    if (!VALID_HTTP_STATUSES.has(err.http_status)) {
      console.warn(`Warning: ${err.code} has unusual HTTP status ${err.http_status}`);
    }

    // Validate category format (lowercase, starts with letter)
    if (!/^[a-z][a-z0-9_]*$/.test(err.category)) {
      throw new Error(
        `Invalid category format: ${err.category} (must be lowercase alphanumeric, starting with letter)`
      );
    }

    // Validate code format
    if (!/^E_[A-Z][A-Z0-9_]*$/.test(err.code)) {
      throw new Error(`Invalid error code format: ${err.code} (must match E_[A-Z][A-Z0-9_]*)`);
    }
  }

  // Derive unique categories from spec data (single source of truth: errors.json)
  const derivedCategories = new Set(spec.errors.map((e) => e.category));
  const sortedDerivedCategories = Array.from(derivedCategories).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  console.log(`Derived categories: ${sortedDerivedCategories.join(', ')}`);

  // Generate error-categories.generated.ts (eliminates drift by generating from JSON)
  generateCategoriesFile(sortedDerivedCategories, spec.version);

  // Group errors by category for better organization
  const byCategory = new Map<string, ErrorSpec[]>();
  for (const err of spec.errors) {
    const list = byCategory.get(err.category) || [];
    list.push(err);
    byCategory.set(err.category, list);
  }

  // Sort errors by code within each category for deterministic output
  for (const [category, errors] of byCategory) {
    errors.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    byCategory.set(category, errors);
  }

  // Generate the TypeScript file
  const lines: string[] = [];

  // Header without volatile timestamps
  lines.push('/**');
  lines.push(' * PEAC Protocol Error Codes');
  lines.push(' *');
  lines.push(' * AUTO-GENERATED from specs/kernel/errors.json');
  lines.push(' * DO NOT EDIT MANUALLY - run: npx tsx scripts/codegen-errors.ts');
  lines.push(` * Spec version: ${spec.version}`);
  lines.push(' */');
  lines.push('');
  lines.push("import type { ErrorDefinition } from './types.js';");
  lines.push('');

  // Generate ERROR_CODES constant
  lines.push('/**');
  lines.push(' * Error code string constants');
  lines.push(' */');
  lines.push('export const ERROR_CODES = {');

  const categories = Array.from(byCategory.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  let first = true;
  for (const category of categories) {
    const errors = byCategory.get(category)!;
    if (!first) {
      lines.push('');
    }
    first = false;
    lines.push(`  // ${capitalizeCategory(category)} error codes`);
    for (const err of errors) {
      lines.push(`  ${err.code}: '${err.code}',`);
    }
  }

  lines.push('} as const;');
  lines.push('');

  // Generate type for error codes
  lines.push('/**');
  lines.push(' * Union type of all error codes');
  lines.push(' */');
  lines.push('export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];');
  lines.push('');

  // Generate ERRORS definitions map
  lines.push('/**');
  lines.push(' * Error definitions map with full metadata');
  lines.push(' */');
  lines.push('export const ERRORS: Record<string, ErrorDefinition> = {');

  first = true;
  for (const category of categories) {
    const errors = byCategory.get(category)!;
    if (!first) {
      lines.push('');
    }
    first = false;
    lines.push(`  // ${capitalizeCategory(category)} error codes`);
    for (const err of errors) {
      lines.push(`  ${err.code}: {`);
      lines.push(`    code: ${JSON.stringify(err.code)},`);
      lines.push(`    http_status: ${err.http_status},`);
      lines.push(`    title: ${JSON.stringify(err.title)},`);
      lines.push(`    description: ${JSON.stringify(err.description)},`);
      lines.push(`    retriable: ${err.retriable},`);
      lines.push(`    category: ${JSON.stringify(err.category)},`);
      lines.push('  },');
    }
  }

  lines.push('};');
  lines.push('');

  // Generate helper functions
  lines.push('/**');
  lines.push(' * Get error definition by code');
  lines.push(' */');
  lines.push('export function getError(code: string): ErrorDefinition | undefined {');
  lines.push('  return ERRORS[code];');
  lines.push('}');
  lines.push('');

  lines.push('/**');
  lines.push(' * Check if error is retriable');
  lines.push(' */');
  lines.push('export function isRetriable(code: string): boolean {');
  lines.push('  return ERRORS[code]?.retriable ?? false;');
  lines.push('}');
  lines.push('');

  // Generate category-specific exports (sorted by short name for determinism)
  lines.push('/**');
  lines.push(' * Bundle error codes (for @peac/audit)');
  lines.push(' */');
  lines.push('export const BUNDLE_ERRORS = {');
  const bundleErrors = byCategory.get('bundle') || [];
  for (const err of bundleErrors) {
    const shortName = err.code.replace('E_BUNDLE_', '');
    lines.push(`  ${shortName}: '${err.code}',`);
  }
  lines.push('} as const;');
  lines.push('');

  lines.push('/**');
  lines.push(' * Dispute error codes');
  lines.push(' */');
  lines.push('export const DISPUTE_ERRORS = {');
  const disputeErrors = byCategory.get('dispute') || [];
  for (const err of disputeErrors) {
    const shortName = err.code.replace('E_DISPUTE_', '');
    lines.push(`  ${shortName}: '${err.code}',`);
  }
  lines.push('} as const;');
  lines.push('');

  const content = lines.join('\n');

  console.log(`Writing ${OUTPUT_PATH}...`);
  fs.writeFileSync(OUTPUT_PATH, content);

  console.log('Done! Generated error codes:');
  for (const category of categories) {
    const count = byCategory.get(category)!.length;
    console.log(`  ${category}: ${count} codes`);
  }
}

const CATEGORIES_JSON_PATH = path.join(__dirname, '../specs/kernel/error-categories.json');

function generateCategoriesFile(categories: string[], specVersion: string) {
  const lines: string[] = [];

  lines.push('/**');
  lines.push(' * PEAC Protocol Error Categories');
  lines.push(' *');
  lines.push(' * AUTO-GENERATED from specs/kernel/errors.json');
  lines.push(' * DO NOT EDIT MANUALLY - run: npx tsx scripts/codegen-errors.ts');
  lines.push(` * Spec version: ${specVersion}`);
  lines.push(' */');
  lines.push('');
  lines.push('/**');
  lines.push(' * Canonical error categories derived from specs/kernel/errors.json.');
  lines.push(' * This is the single source of truth for all error category definitions.');
  lines.push(' * Sorted alphabetically. This ordering is a codegen invariant.');
  lines.push(' */');
  lines.push('export const ERROR_CATEGORIES = [');
  for (const cat of categories) {
    lines.push(`  '${cat}',`);
  }
  lines.push('] as const;');
  lines.push('');
  lines.push('/**');
  lines.push(' * Error category type - union of all categories in specs/kernel/errors.json');
  lines.push(' */');
  lines.push('export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];');
  lines.push('');

  const content = lines.join('\n');
  console.log(`Writing ${CATEGORIES_OUTPUT_PATH}...`);
  fs.writeFileSync(CATEGORIES_OUTPUT_PATH, content);
  console.log(`Generated ${categories.length} error categories`);

  // Generate language-neutral JSON artifact for non-TS SDKs
  const jsonArtifact = {
    $schema: 'https://www.peacprotocol.org/schemas/kernel/error-categories.schema.json',
    $comment: 'AUTO-GENERATED from specs/kernel/errors.json - DO NOT EDIT MANUALLY',
    version: specVersion,
    source_file: 'specs/kernel/errors.json',
    categories,
  };
  console.log(`Writing ${CATEGORIES_JSON_PATH}...`);
  fs.writeFileSync(CATEGORIES_JSON_PATH, JSON.stringify(jsonArtifact, null, 2) + '\n');
}

function capitalizeCategory(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

// Note: escapeString removed in favor of JSON.stringify for robust escaping of
// title/description fields. Error codes and categories use single quotes since
// they're validated to be alphanumeric (E_[A-Z][A-Z0-9_]*).

main();
