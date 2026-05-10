#!/usr/bin/env bash
# scripts/check-version-coherence.sh
# Verify the npm release version surface is internally coherent.
#
# All publishable packages in scripts/publish-manifest.json must match
# the root release version. Workspace-private packages are intentionally
# excluded from npm release-version coherence; private:true is the publish
# boundary, and private packages may carry independent version fields
# without affecting the npm release surface.

set -euo pipefail

echo "== Version coherence check =="

node - <<'NODE'
const fs = require('fs');
const path = require('path');

const root = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const ROOT_VERSION = root.version;
console.log(`  Root version: ${ROOT_VERSION}`);

const manifest = JSON.parse(fs.readFileSync('scripts/publish-manifest.json', 'utf8'));
if (!Array.isArray(manifest.packages)) {
  console.log('  FAIL: scripts/publish-manifest.json packages[] must be an array');
  process.exit(1);
}
const publishable = new Set(manifest.packages);

const found = new Map(); // name -> { version, file, private }
const parseErrors = [];
const duplicates = [];

function recordPackageManifest(file) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    parseErrors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  if (!pkg.name) return;

  if (found.has(pkg.name)) {
    duplicates.push(`${pkg.name}: ${found.get(pkg.name).file} and ${file}`);
    return;
  }

  found.set(pkg.name, {
    version: pkg.version || '',
    file,
    private: pkg.private === true,
  });
}

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (['node_modules', 'dist', '.turbo', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(p);
    } else if (e.isFile() && e.name === 'package.json') {
      recordPackageManifest(p);
    }
  }
}

for (const base of ['packages', 'apps', 'surfaces']) {
  if (fs.existsSync(base)) walk(base);
}

let bad = 0;
let ok = 0;

for (const error of parseErrors) {
  console.log(`  FAIL: malformed package.json: ${error}`);
  bad = 1;
}

for (const duplicate of duplicates) {
  console.log(`  FAIL: duplicate package name: ${duplicate}`);
  bad = 1;
}

for (const name of publishable) {
  const entry = found.get(name);
  if (!entry) {
    console.log(`  FAIL: ${name} listed in publish-manifest but not found in workspace`);
    bad = 1;
    continue;
  }
  if (entry.private) {
    console.log(`  FAIL: ${name} is private:true but listed in publish-manifest packages[]`);
    bad = 1;
    continue;
  }
  if (entry.version !== ROOT_VERSION) {
    console.log(
      `  FAIL: ${name} has version ${entry.version} (expected ${ROOT_VERSION}) at ${entry.file}`
    );
    bad = 1;
    continue;
  }
  ok += 1;
}

if (bad === 0) {
  console.log(`  OK: all ${ok} publish-manifest packages have version ${ROOT_VERSION}`);
} else {
  console.log('  Version coherence check FAILED');
}

process.exit(bad);
NODE
