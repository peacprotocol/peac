#!/usr/bin/env node
/**
 * scripts/fixtures-new.mjs
 *
 * Scaffold a new conformance fixture with correct structure and manifest entry.
 * Prevents the "forgot schema_version" and "forgot manifest entry" failure modes.
 *
 * Usage:
 *   node scripts/fixtures-new.mjs --category wire-02 --path replay-prevention/boundary-jti-length
 *   node scripts/fixtures-new.mjs --category valid --path new-fixture
 *
 * Options:
 *   --category    Top-level manifest category (e.g., wire-02, valid, invalid, edge)
 *   --path        Fixture path relative to category (e.g., replay-prevention/boundary-jti-length)
 *   --description Description for manifest entry (prompted if omitted)
 *   --version     Protocol version (default: read from publish-manifest.json)
 *   --count       Initial fixture_count for manifest (default: 1)
 *   --dry-run     Print what would be created without writing
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const FIXTURES_DIR = join(REPO_ROOT, 'specs', 'conformance', 'fixtures');
const MANIFEST_PATH = join(FIXTURES_DIR, 'manifest.json');
const PUBLISH_MANIFEST = join(REPO_ROOT, 'scripts', 'publish-manifest.json');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { count: 1, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--category': opts.category = args[++i]; break;
      case '--path': opts.path = args[++i]; break;
      case '--description': opts.description = args[++i]; break;
      case '--version': opts.version = args[++i]; break;
      case '--count': opts.count = parseInt(args[++i], 10); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--help': case '-h':
        console.log('Usage: node scripts/fixtures-new.mjs --category <cat> --path <path> [--description <desc>] [--version <ver>] [--count <n>] [--dry-run]');
        process.exit(0);
    }
  }
  return opts;
}

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function getDefaultVersion() {
  try {
    const manifest = JSON.parse(readFileSync(PUBLISH_MANIFEST, 'utf-8'));
    return manifest.version || '0.12.0-preview.1';
  } catch {
    return '0.12.0-preview.1';
  }
}

async function main() {
  const opts = parseArgs();

  if (!opts.category) {
    console.error('Error: --category is required');
    process.exit(1);
  }
  if (!opts.path) {
    console.error('Error: --path is required');
    process.exit(1);
  }

  const version = opts.version || getDefaultVersion();
  const description = opts.description || await prompt('Fixture description: ');

  if (!description) {
    console.error('Error: description is required');
    process.exit(1);
  }

  // Determine file path
  const fixturePath = opts.path.endsWith('.json') ? opts.path : `${opts.path}.json`;
  const fullFixturePath = join(FIXTURES_DIR, opts.category, fixturePath);
  const manifestKey = fixturePath;

  // Build fixture content
  const fixture = {
    $comment: description,
    version,
    schema_version: version,
    fixtures: [],
  };

  // Build manifest entry
  const manifestEntry = {
    description,
    version,
    fixture_count: opts.count,
  };

  if (opts.dryRun) {
    console.log('\n--- DRY RUN ---\n');
    console.log(`Fixture file: ${fullFixturePath}`);
    console.log(JSON.stringify(fixture, null, 2));
    console.log(`\nManifest entry [${opts.category}][${manifestKey}]:`);
    console.log(JSON.stringify(manifestEntry, null, 2));
    return;
  }

  // Create fixture file
  const fixtureDir = dirname(fullFixturePath);
  if (!existsSync(fixtureDir)) {
    mkdirSync(fixtureDir, { recursive: true });
    console.log(`Created directory: ${fixtureDir}`);
  }

  if (existsSync(fullFixturePath)) {
    console.error(`Error: fixture already exists at ${fullFixturePath}`);
    process.exit(1);
  }

  writeFileSync(fullFixturePath, JSON.stringify(fixture, null, 2) + '\n');
  console.log(`Created fixture: ${fullFixturePath}`);

  // Update manifest
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  if (!manifest[opts.category]) {
    manifest[opts.category] = {};
  }
  manifest[opts.category][manifestKey] = manifestEntry;
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Updated manifest: added [${opts.category}][${manifestKey}]`);

  // Validate
  console.log('\nRunning fixture validation...');
  const { execSync } = await import('child_process');
  try {
    execSync('node scripts/validate-fixtures.mjs', { cwd: REPO_ROOT, stdio: 'inherit' });
    console.log('\nFixture validation passed.');
  } catch {
    console.error('\nFixture validation failed. Please fix issues above.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
