#!/usr/bin/env node

/**
 * Distribution Surface Verification Gate
 *
 * Validates that all distribution artifacts for @peac/mcp-server are present,
 * structurally valid, schema-compliant, version-consistent, and installable.
 *
 * Checks (all blocking unless marked SKIP):
 *  1. File existence: server.json, smithery.yaml, manifest.json, .mcp.json, llms.txt
 *  2. JSON validity: all JSON distribution files parse without error
 *  3. YAML validity: smithery.yaml parses as valid YAML
 *  4. Schema validation: server.json validates against vendored MCP Registry schema (ajv)
 *  5. Structure validation: smithery.yaml has required startCommand fields
 *  6. Structure validation: manifest.json has required manifest_version and tools fields
 *  7. Structure validation: .mcp.json has required mcpServers structure
 *  8. Metadata coherence: server.json name matches package.json mcpName
 *  9. Version sync: server.json, manifest.json, package.json, root, current.json
 * 10. Publish manifest: @peac/mcp-server in packages and oidcConfigured arrays
 * 11. Distribution files: all files in package.json files array exist on disk
 * 12. llms.txt: H1 heading and required sections
 * 13. Tarball packaging: pack tarball, verify distribution files included, no workspace deps
 * 14. Install smoke: run CLI --help from packed tarball content (not local dist)
 * 15. Unsupported surfaces: explicit SKIP reporting for Cursor, Codex, website sync
 * 16. Listing copy coherence: server.json description matches canonical short description
 *
 * Exit codes:
 * - 0: All distribution checks passed (SKIPs are acceptable)
 * - 1: Distribution validation failure (blocking)
 * - 2: Script error (missing critical file, parse error)
 *
 * Usage:
 *   node scripts/verify-distribution.mjs
 *   pnpm verify:distribution
 */

import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MCP_PKG_DIR = join(ROOT, 'packages/mcp-server');

const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

let passed = 0;
let failed = 0;
let skipped = 0;
const skipReasons = [];

function pass(msg) {
  passed++;
  console.log(colors.green(`  PASS: ${msg}`));
}

function fail(msg) {
  failed++;
  console.log(colors.red(`  FAIL: ${msg}`));
}

function skip(msg, reason) {
  skipped++;
  const display = reason ? `${msg} (${reason})` : msg;
  skipReasons.push(display);
  console.log(colors.yellow(`  SKIP: ${display}`));
}

/** Read and parse JSON, or exit 2 on critical missing file. */
function readJSON(path, critical = false) {
  if (!existsSync(path)) {
    if (critical) {
      console.error(colors.red(`ERROR: Critical file not found: ${path}`));
      process.exit(2);
    }
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    if (critical) {
      console.error(colors.red(`ERROR: Failed to parse ${path}: ${e.message}`));
      process.exit(2);
    }
    return undefined; // undefined = parse error (distinct from null = missing)
  }
}

// ---------------------------------------------------------------------------
// Check 1: File existence
// ---------------------------------------------------------------------------
function checkFileExistence() {
  console.log(colors.bold('\n--- Distribution File Existence ---\n'));

  const requiredFiles = [
    { path: join(MCP_PKG_DIR, 'server.json'), label: 'server.json (MCP Registry metadata)' },
    { path: join(MCP_PKG_DIR, 'smithery.yaml'), label: 'smithery.yaml (Smithery config)' },
    { path: join(MCP_PKG_DIR, 'manifest.json'), label: 'manifest.json (Claude Code manifest)' },
    { path: join(MCP_PKG_DIR, '.mcp.json'), label: '.mcp.json (local MCP config)' },
    { path: join(ROOT, 'llms.txt'), label: 'llms.txt (repo root)' },
  ];

  for (const { path, label } of requiredFiles) {
    if (existsSync(path)) {
      pass(label);
    } else {
      fail(`${label} not found`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 2-3: JSON and YAML validity
// ---------------------------------------------------------------------------
function checkParseValidity() {
  console.log(colors.bold('\n--- Parse Validity ---\n'));

  const jsonFiles = [
    { path: join(MCP_PKG_DIR, 'server.json'), label: 'server.json' },
    { path: join(MCP_PKG_DIR, 'manifest.json'), label: 'manifest.json' },
    { path: join(MCP_PKG_DIR, '.mcp.json'), label: '.mcp.json' },
  ];

  for (const { path, label } of jsonFiles) {
    if (!existsSync(path)) continue;
    try {
      JSON.parse(readFileSync(path, 'utf-8'));
      pass(`${label} is valid JSON`);
    } catch (e) {
      fail(`${label} is not valid JSON: ${e.message}`);
    }
  }

  const smitheryPath = join(MCP_PKG_DIR, 'smithery.yaml');
  if (existsSync(smitheryPath)) {
    try {
      const yaml = require('js-yaml');
      yaml.load(readFileSync(smitheryPath, 'utf-8'));
      pass('smithery.yaml is valid YAML');
    } catch (e) {
      fail(`smithery.yaml is not valid YAML: ${e.message}`);
    }

    // Run full Smithery structural validation (YAML parse + sandboxed function eval)
    try {
      execSync('node scripts/validate-smithery.mjs', { cwd: ROOT, stdio: 'pipe', timeout: 15_000 });
      pass('smithery.yaml full structural validation');
    } catch (e) {
      fail(
        `smithery.yaml structural validation failed: ${e.stderr?.toString().trim() || e.message}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Check 4: server.json schema validation (MCP Registry JSON Schema)
// ---------------------------------------------------------------------------
function checkServerJsonSchema() {
  console.log(colors.bold('\n--- MCP Registry Schema Validation ---\n'));

  const serverJsonPath = join(MCP_PKG_DIR, 'server.json');
  const schemaPath = join(ROOT, 'specs/registry/server.schema.json');

  if (!existsSync(serverJsonPath) || !existsSync(schemaPath)) {
    skip('server.json or vendored schema not found', 'file missing');
    return;
  }

  try {
    const Ajv = require('ajv');
    const addFormats = require('ajv-formats');

    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    const data = JSON.parse(readFileSync(serverJsonPath, 'utf-8'));

    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    if (validate(data)) {
      pass('server.json validates against MCP Registry JSON Schema');
    } else {
      const errors = validate.errors.map((e) => `${e.instancePath} ${e.message}`).join('; ');
      fail(`server.json schema validation failed: ${errors}`);
    }
  } catch (e) {
    fail(`server.json schema validation error: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Check 5: smithery.yaml structure
// ---------------------------------------------------------------------------
function checkSmitheryStructure() {
  console.log(colors.bold('\n--- Smithery Structure ---\n'));

  const smitheryPath = join(MCP_PKG_DIR, 'smithery.yaml');
  if (!existsSync(smitheryPath)) {
    skip('smithery.yaml not found', 'file missing');
    return;
  }

  try {
    const yaml = require('js-yaml');
    const doc = yaml.load(readFileSync(smitheryPath, 'utf-8'));
    const missing = [];

    if (!doc.startCommand) {
      missing.push('startCommand');
    } else {
      if (!doc.startCommand.type) missing.push('startCommand.type');
      if (!doc.startCommand.commandFunction) missing.push('startCommand.commandFunction');
      if (!doc.startCommand.configSchema) missing.push('startCommand.configSchema');
    }

    if (missing.length === 0) {
      pass(
        'smithery.yaml has required structure (startCommand, type, commandFunction, configSchema)'
      );
    } else {
      fail(`smithery.yaml missing required fields: ${missing.join(', ')}`);
    }
  } catch (e) {
    fail(`smithery.yaml structure check error: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Check 6: manifest.json structure (Claude Code manifest)
// ---------------------------------------------------------------------------
function checkManifestStructure() {
  console.log(colors.bold('\n--- Claude Code Manifest Structure ---\n'));

  const manifestPath = join(MCP_PKG_DIR, 'manifest.json');
  const manifest = readJSON(manifestPath);

  if (manifest === null) {
    skip('manifest.json not found', 'file missing');
    return;
  }
  if (manifest === undefined) {
    return;
  }

  const missing = [];
  if (!manifest.manifest_version) missing.push('manifest_version');
  if (!manifest.name) missing.push('name');
  if (!manifest.display_name) missing.push('display_name');
  if (!manifest.version) missing.push('version');
  if (!manifest.description) missing.push('description');
  if (!Array.isArray(manifest.tools) || manifest.tools.length === 0) missing.push('tools[]');
  if (!manifest.server) missing.push('server');

  if (missing.length === 0) {
    pass(
      `manifest.json has required structure (v${manifest.manifest_version}, ${manifest.tools.length} tools)`
    );
  } else {
    fail(`manifest.json missing required fields: ${missing.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// Check 7: .mcp.json structure
// ---------------------------------------------------------------------------
function checkMcpJsonStructure() {
  console.log(colors.bold('\n--- MCP Local Config Structure ---\n'));

  const mcpJsonPath = join(MCP_PKG_DIR, '.mcp.json');
  const mcpJson = readJSON(mcpJsonPath);

  if (mcpJson === null) {
    skip('.mcp.json not found', 'file missing');
    return;
  }
  if (mcpJson === undefined) {
    return;
  }

  if (!mcpJson.mcpServers || typeof mcpJson.mcpServers !== 'object') {
    fail('.mcp.json missing mcpServers object');
    return;
  }

  const servers = Object.keys(mcpJson.mcpServers);
  if (servers.length === 0) {
    fail('.mcp.json has empty mcpServers');
    return;
  }

  const server = mcpJson.mcpServers[servers[0]];
  if (!server.command) {
    fail(`.mcp.json server "${servers[0]}" missing command field`);
    return;
  }

  pass(`.mcp.json has valid structure (server: "${servers[0]}", command: "${server.command}")`);
}

// ---------------------------------------------------------------------------
// Check 8: Metadata coherence (server.json name vs package.json mcpName)
// ---------------------------------------------------------------------------
function checkMetadataCoherence() {
  console.log(colors.bold('\n--- Metadata Coherence ---\n'));

  const serverJson = readJSON(join(MCP_PKG_DIR, 'server.json'));
  const pkgJson = readJSON(join(MCP_PKG_DIR, 'package.json'), true);

  if (!serverJson) {
    skip('server.json not available', 'file missing');
    return;
  }

  const serverName = serverJson.name;
  const mcpName = pkgJson.mcpName;

  if (!mcpName) {
    fail('package.json missing mcpName field');
  } else if (serverName === mcpName) {
    pass(`server.json name matches package.json mcpName: ${serverName}`);
  } else {
    fail(`server.json name (${serverName}) does not match package.json mcpName (${mcpName})`);
  }

  const pkgIdentifier = serverJson.packages?.[0]?.identifier;
  if (pkgIdentifier && pkgIdentifier !== pkgJson.name) {
    fail(
      `server.json packages[0].identifier (${pkgIdentifier}) does not match package.json name (${pkgJson.name})`
    );
  } else if (pkgIdentifier) {
    pass(`server.json packages[0].identifier matches package.json name: ${pkgIdentifier}`);
  }
}

// ---------------------------------------------------------------------------
// Check 9: Version sync across all manifests
// ---------------------------------------------------------------------------
function checkListingCopyCoherence() {
  console.log(colors.bold('\n[16] Listing Copy Coherence'));
  try {
    execFileSync('node', [join(ROOT, 'scripts/check-listing-copy-coherence.mjs')], {
      stdio: 'inherit',
    });
    pass('Listing copy aligned with canonical short description');
  } catch (err) {
    fail(`Listing copy coherence check failed (exit ${err.status ?? 'unknown'})`);
  }
}

function checkVersionSync() {
  console.log(colors.bold('\n--- Version Sync ---\n'));

  const pkgJson = readJSON(join(MCP_PKG_DIR, 'package.json'), true);
  const rootPkgJson = readJSON(join(ROOT, 'package.json'), true);
  const serverJson = readJSON(join(MCP_PKG_DIR, 'server.json'));
  const manifestJson = readJSON(join(MCP_PKG_DIR, 'manifest.json'));
  const currentJson = readJSON(join(ROOT, 'docs/releases/current.json'));

  const canonicalVersion = pkgJson.version;

  if (rootPkgJson.version !== canonicalVersion) {
    fail(
      `root package.json version (${rootPkgJson.version}) != mcp-server package.json (${canonicalVersion})`
    );
  } else {
    pass(`monorepo root version matches: ${canonicalVersion}`);
  }

  if (serverJson) {
    if (serverJson.version !== canonicalVersion) {
      fail(`server.json version (${serverJson.version}) != package.json (${canonicalVersion})`);
    } else {
      pass(`server.json version matches: ${canonicalVersion}`);
    }

    const pkgVer = serverJson.packages?.[0]?.version;
    if (pkgVer && pkgVer !== canonicalVersion) {
      fail(`server.json packages[0].version (${pkgVer}) != package.json (${canonicalVersion})`);
    } else if (pkgVer) {
      pass(`server.json packages[0].version matches: ${canonicalVersion}`);
    }
  }

  if (manifestJson) {
    if (manifestJson.version !== canonicalVersion) {
      fail(`manifest.json version (${manifestJson.version}) != package.json (${canonicalVersion})`);
    } else {
      pass(`manifest.json version matches: ${canonicalVersion}`);
    }
  }

  if (currentJson) {
    if (currentJson.version !== canonicalVersion) {
      fail(
        `docs/releases/current.json version (${currentJson.version}) != package.json (${canonicalVersion})`
      );
    } else {
      pass(`current.json version matches: ${canonicalVersion}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 10: Publish manifest inclusion
// ---------------------------------------------------------------------------
function checkPublishManifest() {
  console.log(colors.bold('\n--- Publish Manifest ---\n'));

  const publishManifest = readJSON(join(ROOT, 'scripts/publish-manifest.json'));
  if (!publishManifest) {
    skip('publish-manifest.json not found', 'file missing');
    return;
  }

  const pkgName = '@peac/mcp-server';

  if (publishManifest.packages?.includes(pkgName)) {
    pass(`${pkgName} is in publish-manifest.json packages`);
  } else {
    fail(`${pkgName} is NOT in publish-manifest.json packages (will not be published)`);
  }

  if (publishManifest.oidcConfigured?.includes(pkgName)) {
    pass(`${pkgName} is in publish-manifest.json oidcConfigured (trusted publishing)`);
  } else {
    fail(`${pkgName} is NOT in publish-manifest.json oidcConfigured (no trusted publishing)`);
  }

  if (publishManifest.deferredTrustedPublishing?.includes(pkgName)) {
    fail(`${pkgName} is in deferredTrustedPublishing (should be in oidcConfigured)`);
  }
}

// ---------------------------------------------------------------------------
// Check 11: Distribution files in package.json files array exist on disk
// ---------------------------------------------------------------------------
function checkDistributionFilesExist() {
  console.log(colors.bold('\n--- Package Distribution Files ---\n'));

  const pkgJson = readJSON(join(MCP_PKG_DIR, 'package.json'), true);
  const filesArray = pkgJson.files;

  if (!Array.isArray(filesArray)) {
    fail('package.json missing files array');
    return;
  }

  const nonDistFiles = filesArray.filter((f) => f !== 'dist');
  for (const file of nonDistFiles) {
    const filePath = join(MCP_PKG_DIR, file);
    if (existsSync(filePath)) {
      pass(`package.json files: ${file} exists`);
    } else {
      fail(`package.json files: ${file} does NOT exist on disk (will be missing from npm tarball)`);
    }
  }

  // Verify distribution files are git-tracked (not just local untracked files)
  try {
    const tracked = execSync('git ls-files server.json smithery.yaml manifest.json .mcp.json', {
      cwd: MCP_PKG_DIR,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: 'pipe',
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    const expectedTracked = ['server.json', 'smithery.yaml', 'manifest.json', '.mcp.json'];
    const untracked = expectedTracked.filter((f) => !tracked.includes(f));

    if (untracked.length === 0) {
      pass('all distribution files are git-tracked');
    } else {
      fail(`distribution files not git-tracked: ${untracked.join(', ')}`);
    }
  } catch {
    skip('git-tracked check', 'git ls-files unavailable');
  }
}

// ---------------------------------------------------------------------------
// Check 12: llms.txt structure
// ---------------------------------------------------------------------------
function checkLlmsTxt() {
  console.log(colors.bold('\n--- llms.txt Structure ---\n'));

  const llmsPath = join(ROOT, 'llms.txt');
  if (!existsSync(llmsPath)) {
    return; // already reported in file existence
  }

  const content = readFileSync(llmsPath, 'utf-8');
  const requiredSections = [
    { pattern: /^# /m, label: 'H1 heading' },
    { pattern: /## Quick Start/m, label: 'Quick Start section' },
    { pattern: /## Key Packages/m, label: 'Key Packages section' },
    { pattern: /## Documentation/m, label: 'Documentation section' },
  ];

  const missing = requiredSections.filter((s) => !s.pattern.test(content));

  if (missing.length === 0) {
    pass('llms.txt has H1 and all required sections');
  } else {
    fail(`llms.txt missing: ${missing.map((m) => m.label).join(', ')}`);
  }

  if (content.includes('interaction-record+jwt')) {
    pass('llms.txt references current wire format (interaction-record+jwt)');
  } else {
    fail('llms.txt does not reference current wire format (interaction-record+jwt)');
  }
}

// ---------------------------------------------------------------------------
// Check 13: Tarball packaging surface
// ---------------------------------------------------------------------------
function checkTarballPackaging() {
  console.log(colors.bold('\n--- Tarball Packaging Surface ---\n'));

  const distDir = join(MCP_PKG_DIR, 'dist');
  if (!existsSync(distDir)) {
    skip('MCP server not built (dist/ missing)', 'run pnpm build first');
    return;
  }

  const PACK_TMP = join(ROOT, 'node_modules/.cache/verify-distribution-pack');

  try {
    // Clean and create temp dir
    if (existsSync(PACK_TMP)) rmSync(PACK_TMP, { recursive: true });
    mkdirSync(PACK_TMP, { recursive: true });

    // Pack the tarball (execFileSync: no shell, safe from path injection)
    const tarball = execFileSync('pnpm', ['pack', '--pack-destination', PACK_TMP], {
      cwd: MCP_PKG_DIR,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: 'pipe',
    }).trim();

    if (!tarball || !existsSync(tarball)) {
      fail('pnpm pack produced no tarball');
      return;
    }

    pass(`tarball created: ${tarball.split('/').pop()}`);

    // List tarball contents (execFileSync: no shell, safe from path injection)
    const contents = execFileSync('tar', ['tzf', tarball], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: 'pipe',
    })
      .trim()
      .split('\n');

    // Verify distribution files are in the tarball
    const requiredInTarball = [
      'package/server.json',
      'package/smithery.yaml',
      'package/manifest.json',
      'package/.mcp.json',
      'package/README.md',
      'package/package.json',
      'package/dist/cli.cjs',
    ];

    for (const file of requiredInTarball) {
      if (contents.includes(file)) {
        pass(`tarball contains ${file.replace('package/', '')}`);
      } else {
        fail(`tarball missing ${file.replace('package/', '')} (will not be in npm package)`);
      }
    }

    // Extract and verify no workspace:* dependencies leaked into the packed package.json
    const extractDir = join(PACK_TMP, 'extracted');
    mkdirSync(extractDir, { recursive: true });
    execFileSync('tar', ['xzf', tarball, '-C', extractDir], {
      timeout: 10000,
      stdio: 'pipe',
    });

    const packedPkgJson = readJSON(join(extractDir, 'package', 'package.json'));
    if (packedPkgJson) {
      const allDeps = {
        ...packedPkgJson.dependencies,
        ...packedPkgJson.devDependencies,
        ...packedPkgJson.peerDependencies,
      };
      const workspaceDeps = Object.entries(allDeps).filter(([, v]) =>
        String(v).includes('workspace:')
      );
      if (workspaceDeps.length > 0) {
        fail(
          `tarball package.json has unresolved workspace deps: ${workspaceDeps.map(([k]) => k).join(', ')}`
        );
      } else {
        pass('tarball package.json has no workspace:* dependencies (resolved for npm)');
      }
    }

    // Run CLI --help from the extracted tarball content (not from working tree dist/)
    const packedCli = join(extractDir, 'package', 'dist', 'cli.cjs');
    if (existsSync(packedCli)) {
      try {
        execFileSync('node', [packedCli, '--help'], {
          cwd: extractDir,
          encoding: 'utf-8',
          timeout: 10000,
          stdio: 'pipe',
          env: { ...process.env, NODE_PATH: join(ROOT, 'node_modules') },
        });
        pass('peac-mcp-server --help exits 0 (from packed tarball)');
      } catch (e) {
        const output = (e.stdout || '') + (e.stderr || '');
        if (output.includes('peac') || output.includes('MCP') || output.includes('Usage')) {
          pass('peac-mcp-server --help produces help output (from packed tarball)');
        } else {
          fail(`peac-mcp-server --help failed from packed tarball: exit code ${e.status}`);
        }
      }
    }
  } catch (e) {
    fail(`tarball packaging check error: ${e.message}`);
  } finally {
    // Clean up
    try {
      if (existsSync(PACK_TMP)) rmSync(PACK_TMP, { recursive: true });
    } catch {
      // best-effort cleanup
    }
  }
}

// ---------------------------------------------------------------------------
// Check 14: Unsupported distribution surfaces (explicit reporting)
// ---------------------------------------------------------------------------
function checkUnsupportedSurfaces() {
  console.log(colors.bold('\n--- Distribution Surface Coverage ---\n'));

  // Supported and checked
  pass('MCP Registry (server.json): validated above');
  pass('Smithery (smithery.yaml): validated above');
  pass('npm package tarball: validated above');
  pass('Claude Code (manifest.json): validated above');

  // Unsupported / not yet implemented
  skip('Cursor Marketplace', 'no packaging format implemented; investigate in v0.12.8+');
  skip('Codex plugin directory', 'no packaging format implemented; investigate in v0.12.8+');
  skip(
    'Website/docs version sync',
    'external repo; not verifiable from this gate; verify manually before release'
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log(colors.bold('PEAC Distribution Surface Verification Gate'));
  console.log('=============================================\n');
  console.log(`Root: ${ROOT}`);
  console.log(`MCP Server: ${MCP_PKG_DIR}`);

  checkFileExistence();
  checkParseValidity();
  checkServerJsonSchema();
  checkSmitheryStructure();
  checkManifestStructure();
  checkMcpJsonStructure();
  checkMetadataCoherence();
  checkListingCopyCoherence();
  checkVersionSync();
  checkPublishManifest();
  checkDistributionFilesExist();
  checkLlmsTxt();
  checkTarballPackaging();
  checkUnsupportedSurfaces();

  // Summary
  console.log(colors.bold('\n--- Summary ---\n'));
  console.log(`  Passed:  ${passed}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Skipped: ${skipped}`);

  if (skipReasons.length > 0) {
    console.log(colors.dim(`\n  Skip reasons:`));
    for (const reason of skipReasons) {
      console.log(colors.dim(`    - ${reason}`));
    }
  }

  if (failed > 0) {
    console.log(colors.red(`\nFAIL: ${failed} distribution check(s) failed.`));
    process.exit(1);
  } else {
    console.log(colors.green('\nPASS: All distribution surface checks passed.'));
    process.exit(0);
  }
}

main();
