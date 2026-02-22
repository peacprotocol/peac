#!/usr/bin/env node
/**
 * Conformance harness CLI (DD-122)
 *
 * Usage:
 *   pnpm --filter @peac/conformance-harness conformance -- --adapter core
 *   pnpm exec conformance-harness --adapter core --format pretty
 *
 * Exit code: 0 = all pass (ignoring skips), 1 = failures
 * Output: JSON report to stdout (default) or pretty-printed table
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  loadCoreAdapter,
  loadFixtures,
  runFixture,
  buildReport,
  formatJson,
  formatPretty,
} from './index.js';
import type { Manifest } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      adapter: { type: 'string', default: 'core' },
      fixtures: { type: 'string' },
      format: { type: 'string', default: 'json' },
    },
    allowPositionals: true,
  });

  const adapterName = values.adapter ?? 'core';
  const format = values.format ?? 'json';

  // Resolve repo root (packages/conformance-harness/src -> repo root)
  const repoRoot = join(__dirname, '..', '..', '..');
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

  // Load adapter
  let adapter;
  if (adapterName === 'core') {
    adapter = await loadCoreAdapter();
  } else {
    process.stderr.write(`ERROR: Unknown adapter: ${adapterName}. Available: core\n`);
    process.exit(1);
  }

  // Read PEAC version from root package.json
  const rootPkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
  const peacVersion = rootPkg.version as string;

  // Load and run fixtures
  const fixtures = loadFixtures(fixtureDir);
  const results = fixtures.map(({ category, file, data }) =>
    runFixture(category, file, data, manifest, adapter)
  );

  // Build report
  const report = buildReport(adapterName, peacVersion, results);

  // Output
  if (format === 'pretty') {
    process.stdout.write(formatPretty(report) + '\n');
  } else {
    process.stdout.write(formatJson(report) + '\n');
  }

  // Exit: fail only on actual failures, not skips
  process.exit(report.summary.failed > 0 ? 1 : 0);
}

void main();
