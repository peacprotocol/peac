#!/usr/bin/env node
/**
 * Bumps all workspace package versions to a target version.
 *
 * Reads workspace packages from pnpm, updates each package.json via
 * JSON parse/write (not regex), and bumps publish-manifest.json.
 *
 * Convention: examples/ stay at 0.0.0 (type-check only, not published).
 *
 * Usage:
 *   node scripts/bump-version.mjs 0.10.11
 *   node scripts/bump-version.mjs 0.10.11 --dry-run
 *
 * Exit codes:
 *   0 - All packages bumped (or --dry-run)
 *   1 - Error or missing argument
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const version = args.find((a) => !a.startsWith('--'));

if (!version) {
  console.error('Usage: node scripts/bump-version.mjs <version> [--dry-run]');
  process.exit(1);
}

// Validate semver-ish format
if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`ERROR: "${version}" does not look like a valid version`);
  process.exit(1);
}

console.log(`PEAC Protocol - Version Bump${dryRun ? ' (DRY RUN)' : ''}`);
console.log(`Target: ${version}`);
console.log('');

// Helper: update version in a package.json (preserves formatting)
function bumpPackageJson(filePath, targetVersion) {
  const raw = readFileSync(filePath, 'utf-8');
  const pkg = JSON.parse(raw);

  if (pkg.version === targetVersion) {
    return { status: 'already', name: pkg.name };
  }

  const oldVersion = pkg.version;
  pkg.version = targetVersion;

  // Preserve original formatting (detect indent)
  const indent = raw.match(/^(\s+)"/m)?.[1] || '  ';
  const newRaw = JSON.stringify(pkg, null, indent) + '\n';

  if (!dryRun) {
    writeFileSync(filePath, newRaw);
  }

  return { status: 'bumped', name: pkg.name, from: oldVersion };
}

// 1. Bump root package.json
const rootResult = bumpPackageJson(join(ROOT, 'package.json'), version);
console.log(`  root: ${rootResult.status === 'bumped' ? `${rootResult.from} -> ${version}` : 'already at ' + version}`);

// 2. Enumerate workspace packages via pnpm
let pnpmOutput;
try {
  pnpmOutput = execFileSync('pnpm', ['-r', 'list', '--json', '--depth', '-1'], {
    cwd: ROOT,
    encoding: 'utf-8',
  });
} catch {
  console.error('ERROR: Failed to run pnpm -r list --json');
  process.exit(1);
}

const workspacePackages = JSON.parse(pnpmOutput);
if (!Array.isArray(workspacePackages)) {
  console.error('ERROR: Unexpected pnpm output format');
  process.exit(1);
}

let bumped = 0;
let skippedExamples = 0;
let alreadyCurrent = 0;
let exampleErrors = 0;

// Read root name once (already bumped above)
const rootPkgName = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')).name;

for (const pkg of workspacePackages) {
  if (typeof pkg !== 'object' || pkg === null) continue;
  if (typeof pkg.name !== 'string' || typeof pkg.path !== 'string') continue;

  const relPath = relative(ROOT, pkg.path);
  const pkgJsonPath = join(pkg.path, 'package.json');

  if (!existsSync(pkgJsonPath)) continue;

  // Skip root (already bumped above)
  if (pkg.name === rootPkgName) continue;

  // Examples must stay at 0.0.0 (type-check only, not published)
  if (relPath.startsWith('examples/')) {
    const exPkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    if (exPkg.version === '0.0.0') {
      skippedExamples++;
    } else {
      console.error(`  ERROR: ${pkg.name} (${relPath}) has version "${exPkg.version}" -- examples must be 0.0.0`);
      exampleErrors++;
    }
    continue;
  }

  const result = bumpPackageJson(pkgJsonPath, version);
  if (result.status === 'bumped') {
    bumped++;
  } else {
    alreadyCurrent++;
  }
}

// 3. Bump publish-manifest.json
const manifestPath = join(__dirname, 'publish-manifest.json');
try {
  const raw = readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(raw);
  const oldManifestVersion = manifest.version;
  manifest.version = version;
  manifest.lastUpdated = new Date().toISOString().split('T')[0];

  if (!dryRun) {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, '  ') + '\n');
  }

  if (oldManifestVersion !== version) {
    console.log(`  publish-manifest.json: ${oldManifestVersion} -> ${version}`);
  }
} catch {
  // publish-manifest.json not found; skip
}

// 4. Bump MCP server distribution surface files (server.json, manifest.json)
const mcpSurfaceFiles = [
  join(ROOT, 'packages/mcp-server/server.json'),
  join(ROOT, 'packages/mcp-server/manifest.json'),
];

for (const surfacePath of mcpSurfaceFiles) {
  let raw;
  try {
    raw = readFileSync(surfacePath, 'utf-8');
  } catch {
    continue;
  }
  const surface = JSON.parse(raw);
  const fileName = relative(ROOT, surfacePath);
  let changed = false;

  // Top-level version
  if (surface.version && surface.version !== version) {
    surface.version = version;
    changed = true;
  }

  // server.json has packages[].version
  if (Array.isArray(surface.packages)) {
    for (const entry of surface.packages) {
      if (entry.version && entry.version !== version) {
        entry.version = version;
        changed = true;
      }
    }
  }

  if (changed) {
    const indent = raw.match(/^(\s+)"/m)?.[1] || '  ';
    if (!dryRun) {
      writeFileSync(surfacePath, JSON.stringify(surface, null, indent) + '\n');
    }
    console.log(`  ${fileName}: bumped to ${version}`);
  }
}

console.log('');
console.log(`Bumped: ${bumped} packages`);
console.log(`Already current: ${alreadyCurrent}`);
console.log(`Skipped examples (0.0.0): ${skippedExamples}`);

if (exampleErrors > 0) {
  console.log('');
  console.error(`FAIL: ${exampleErrors} example(s) have non-0.0.0 versions`);
}

if (dryRun) {
  console.log('');
  console.log('(dry run -- no files written)');
}

// 5. Bump spec JSON files that embed a version field
const specVersionFiles = [
  join(ROOT, 'specs/kernel/errors.json'),
  join(ROOT, 'specs/kernel/error-categories.json'),
  join(ROOT, 'docs/releases/current.json'),
];

// Also bump version and schema_version in conformance fixture files
const fixtureGlobs = [
  join(ROOT, 'specs/conformance/fixtures/manifest.json'),
  join(ROOT, 'specs/conformance/fixtures/wire-02/valid.json'),
  join(ROOT, 'specs/conformance/fixtures/wire-02/invalid.json'),
  join(ROOT, 'specs/conformance/fixtures/wire-02/warnings.json'),
  join(ROOT, 'specs/conformance/fixtures/wire-02/replay-prevention/boundary-jti-length.json'),
];

for (const specPath of [...specVersionFiles, ...fixtureGlobs]) {
  let raw;
  try {
    raw = readFileSync(specPath, 'utf-8');
  } catch {
    continue;
  }
  const data = JSON.parse(raw);
  const relName = relative(ROOT, specPath);
  let changed = false;

  if (data.version && data.version !== version) {
    data.version = version;
    changed = true;
  }
  if (data.schema_version && data.schema_version !== version) {
    data.schema_version = version;
    changed = true;
  }
  if (data.errors_version && data.errors_version !== version) {
    data.errors_version = version;
    changed = true;
  }

  if (changed && !dryRun) {
    const indent = raw.match(/^(\s+)"/m)?.[1] || '  ';
    writeFileSync(specPath, JSON.stringify(data, null, indent) + '\n');
    console.log(`  ${relName}: bumped to ${version}`);
  }
}

// 6. Regenerate codegen from updated specs (atomic: version bump + codegen are one step)
if (!dryRun) {
  console.log('');
  console.log('Regenerating codegen from updated specs...');
  try {
    execFileSync('pnpm', ['exec', 'tsx', 'scripts/codegen-errors.ts'], {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    execFileSync(
      'pnpm',
      [
        'exec',
        'prettier',
        '--write',
        'packages/kernel/src/errors.generated.ts',
        'packages/kernel/src/error-categories.generated.ts',
      ],
      { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' }
    );
    console.log('  Codegen regenerated and formatted.');
  } catch (_err) {
    console.error('  WARNING: Codegen regeneration failed. Run manually:');
    console.error('    pnpm exec tsx scripts/codegen-errors.ts');
  }

  // 7. Format version-bumped JSON files
  console.log('Formatting bumped JSON files...');
  try {
    execFileSync(
      'pnpm',
      [
        'exec',
        'prettier',
        '--write',
        'packages/mcp-server/manifest.json',
        'scripts/publish-manifest.json',
        'docs/releases/current.json',
      ],
      { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' }
    );
    console.log('  Formatted.');
  } catch {
    console.error('  WARNING: Prettier format failed. Run manually: pnpm format');
  }
}

console.log('');
console.log(`Bumped: ${bumped} packages`);
console.log(`Already current: ${alreadyCurrent}`);
console.log(`Skipped examples (0.0.0): ${skippedExamples}`);

if (exampleErrors > 0) {
  console.log('');
  console.error(`FAIL: ${exampleErrors} example(s) have non-0.0.0 versions`);
}

if (dryRun) {
  console.log('');
  console.log('(dry run -- no files written)');
}

console.log('');
console.log('Next: verify with node scripts/check-version-sync.mjs');

if (exampleErrors > 0) {
  process.exit(1);
}
