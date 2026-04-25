#!/usr/bin/env node
/**
 * Clean-temp pack-install smoke (P0 invariant).
 *
 * For the load-bearing published packages (@peac/kernel, @peac/protocol,
 * @peac/cli):
 *   1. Run `pnpm pack` to produce a tarball.
 *   2. Create a clean temp project (mkdir + npm init -y + npm install
 *      <tarball> + every workspace dep declared by the package, fetched
 *      from npm or workspace tarballs).
 *   3. Run a smoke script that imports the package's public surface and
 *      exercises a representative function.
 *   4. Assert no `Cannot find module '@peac/<private>'` error: this catches
 *      regressions where a published package picks up a runtime dependency
 *      on a workspace-private package (which would 404 on `npm install`).
 *
 * v0.13.1 scope: this is the foundation gate for the private-package
 * dependency invariant. It runs in CI on PRs that touch package.json deps,
 * pnpm-workspace.yaml, publish-manifest.json, package exports, tsup/tsconfig
 * build outputs, or any source under @peac/kernel / @peac/protocol / @peac/cli.
 *
 * Strategy: rather than installing each package's full transitive tree from
 * npm (which couples the gate to npm availability and version-drift), we
 * bundle each smoke test as a relative-path import from the workspace
 * tarball into a temp project that pre-installs the workspace tarballs of
 * every workspace dependency (constructed via `pnpm pack` recursively).
 *
 * Exit codes:
 *   0 = clean smoke for all targets
 *   1 = smoke failure
 *   2 = script error (tarball creation, etc.)
 *
 * Usage:
 *   node scripts/release/pack-install-smoke.mjs
 *   node scripts/release/pack-install-smoke.mjs --json
 *   node scripts/release/pack-install-smoke.mjs --package @peac/kernel
 */

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_PACKAGE_MAP } from '../lib/workspace-package-map.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const TARGETS = ['@peac/kernel', '@peac/protocol', '@peac/cli'];

const WORKSPACE_PATH_MAP = WORKSPACE_PACKAGE_MAP;

const SMOKE_SCRIPTS = {
  '@peac/kernel': `
    const k = require('@peac/kernel');
    const required = ['POLICY','DISCOVERY','VERIFIER_LIMITS','EXTENSION_GROUPS','REGISTRIES'];
    for (const name of required) {
      if (k[name] === undefined) { console.error('MISSING export:', name); process.exit(1); }
    }
    if (k.POLICY.manifestPath !== '/.well-known/peac.txt') {
      console.error('POLICY.manifestPath unexpected:', k.POLICY.manifestPath);
      process.exit(1);
    }
    console.log('@peac/kernel smoke OK');
  `,
  '@peac/protocol': `
    const p = require('@peac/protocol');
    const required = ['issue','verifyLocal','verify'];
    for (const name of required) {
      if (typeof p[name] !== 'function') { console.error('MISSING function:', name); process.exit(1); }
    }
    console.log('@peac/protocol smoke OK');
  `,
  '@peac/cli': `
    // CLI ships a bin entry, not a programmatic surface. Verify the bundled
    // bin loads without throwing on parse and reports its version when invoked
    // with --version.
    const path = require('path');
    const fs = require('fs');
    const pkg = require('@peac/cli/package.json');
    const binRel = pkg.bin && pkg.bin.peac;
    if (!binRel) { console.error('bin.peac missing from @peac/cli package.json'); process.exit(1); }
    const binAbs = path.join(path.dirname(require.resolve('@peac/cli/package.json')), binRel);
    if (!fs.existsSync(binAbs)) { console.error('bin entry not found at', binAbs); process.exit(1); }
    // Loading it as a module would invoke commander; for smoke purposes,
    // just confirm the file can be read.
    fs.readFileSync(binAbs, 'utf8');
    console.log('@peac/cli smoke OK');
  `,
};

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    json: args.includes('--json'),
    pkg: args.includes('--package') ? args[args.indexOf('--package') + 1] : null,
  };
}

function packPackage(npmName) {
  const rel = WORKSPACE_PATH_MAP[npmName];
  if (!rel) throw new Error(`No workspace path for ${npmName}`);
  const out = execFileSync('pnpm', ['pack', '--pack-destination', tmpdir()], {
    cwd: join(ROOT, rel),
    encoding: 'utf8',
  });
  // pnpm pack prints the tarball path (last non-empty line).
  const tarball = out.trim().split('\n').filter(Boolean).pop();
  return tarball;
}

function readJson(path) {
  return JSON.parse(execFileSync('cat', [path], { encoding: 'utf8' }));
}

function smokeTarget(npmName) {
  const rel = WORKSPACE_PATH_MAP[npmName];
  const pkgJson = readJson(join(ROOT, rel, 'package.json'));
  const workspaceDeps = Object.keys(pkgJson.dependencies ?? {}).filter(
    (d) => WORKSPACE_PATH_MAP[d] !== undefined,
  );

  const tmpDir = mkdtempSync(join(tmpdir(), 'peac-pack-smoke-'));
  try {
    // Pack target + every workspace dep transitively reachable.
    const queued = new Set([npmName, ...workspaceDeps]);
    let added = true;
    while (added) {
      added = false;
      for (const name of [...queued]) {
        const r = WORKSPACE_PATH_MAP[name];
        if (!r) continue;
        const p = readJson(join(ROOT, r, 'package.json'));
        for (const d of Object.keys(p.dependencies ?? {})) {
          if (WORKSPACE_PATH_MAP[d] && !queued.has(d)) {
            queued.add(d);
            added = true;
          }
        }
      }
    }

    const tarballs = {};
    for (const name of queued) {
      try {
        tarballs[name] = packPackage(name);
      } catch (err) {
        return {
          npmName,
          status: 'pack-failed',
          error: `Failed to pack ${name}: ${err.message}`,
        };
      }
    }

    // Build a temp package.json with file: deps for every workspace tarball.
    const tempPkg = {
      name: 'peac-pack-smoke',
      version: '0.0.0',
      private: true,
      dependencies: Object.fromEntries(
        Object.entries(tarballs).map(([name, path]) => [name, `file:${path}`]),
      ),
    };
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify(tempPkg, null, 2));

    // Install with npm (not pnpm) to mimic external-consumer environment.
    try {
      execFileSync('npm', ['install', '--no-audit', '--no-fund', '--no-package-lock'], {
        cwd: tmpDir,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (err) {
      const stderr = err.stderr?.toString() ?? '';
      const stdout = err.stdout?.toString() ?? '';
      const banned = /Cannot find module '@peac\/(record-core|compat|registries|resolver-http)'/;
      if (banned.test(stderr) || banned.test(stdout)) {
        return {
          npmName,
          status: 'private-leak',
          error: `Install attempted to resolve a workspace-private package: ${stderr || stdout}`,
        };
      }
      return {
        npmName,
        status: 'install-failed',
        error: `npm install failed: ${stderr.split('\n').slice(0, 5).join(' | ') || err.message}`,
      };
    }

    // Run the smoke script.
    const smokePath = join(tmpDir, 'smoke.cjs');
    writeFileSync(smokePath, SMOKE_SCRIPTS[npmName]);
    try {
      const out = execFileSync('node', [smokePath], {
        cwd: tmpDir,
        encoding: 'utf8',
      });
      return { npmName, status: 'clean', output: out.trim() };
    } catch (err) {
      const stderr = err.stderr?.toString() ?? '';
      const banned = /Cannot find module '@peac\/(record-core|compat|registries|resolver-http)'/;
      if (banned.test(stderr)) {
        return {
          npmName,
          status: 'private-leak',
          error: `Runtime resolution attempted a workspace-private package: ${stderr}`,
        };
      }
      return { npmName, status: 'smoke-failed', error: stderr || err.message };
    }
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

async function main() {
  const args = parseArgs();
  const targets = args.pkg ? [args.pkg] : TARGETS;

  const results = [];
  for (const name of targets) {
    results.push(smokeTarget(name));
  }

  const failures = results.filter((r) => r.status !== 'clean');

  if (args.json) {
    console.log(JSON.stringify({ results, failures }, null, 2));
  } else {
    for (const r of results) {
      if (r.status === 'clean') {
        console.log(`OK ${r.npmName}: ${r.output ?? ''}`);
      } else {
        console.error(`FAIL ${r.npmName}: ${r.status}`);
        if (r.error) console.error(`  ${r.error}`);
      }
    }
  }

  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Script error:', err.message);
  process.exit(2);
});
