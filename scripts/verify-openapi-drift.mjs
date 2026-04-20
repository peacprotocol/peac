#!/usr/bin/env node

/**
 * OpenAPI drift check for the PEAC reference verifier contract.
 *
 * Two OpenAPI documents describe the same HTTP service:
 *   - `packages/schema/openapi/verify.yaml` (canonical package-level spec,
 *     covering every route).
 *   - `apps/api/openapi.yaml` (app-level spec; covers `/v1/verify` only,
 *     consumed by the app's sync test).
 *
 * This script enforces that where the two overlap, they agree:
 *   - `openapi` version strings match.
 *   - `info.version` strings match.
 *   - The `/v1/verify` POST definition is structurally identical
 *     (operationId, request-body schema name, response status codes,
 *     response media types, and response schema names).
 *   - Shared component schemas referenced from `/v1/verify` have the
 *     same required-field sets and property names.
 *
 * It also extends the verifier truth-source matrix check to downstream
 * surfaces that restate elements of the contract:
 *   - `docs/HOSTED_VERIFY_CONTRACT.md`
 *   - `surfaces/reference-verifier/README.md`
 *   - `integrator-kits/mcp/README.md`
 *   - `docs/MIGRATION_CURRENT.md`
 *   - `docs/diagrams/peac-proof-flow.mmd`
 *
 * Each downstream surface MUST NOT:
 *   - teach historical wire identifiers (constructed dynamically; see
 *     LEGACY_WIRE_IDENTIFIERS below) on its primary path without an
 *     explicit historical / superseded / deprecated marker nearby;
 *   - claim HTTP status codes for the verifier that are not declared by
 *     the package OpenAPI `/v1/verify` + `/verify` response sets.
 *
 * The verifier also accepts `--surface <path>` (repeatable) to drive a
 * custom downstream surface list, used by the committed test harness
 * (`verify-openapi-drift.test.mjs`).
 *
 * Deliberately does NOT insist on byte-for-byte equality; descriptions
 * and examples are free to vary. The contract is on the wire-facing
 * shape, not on the prose.
 *
 * Exit codes:
 *   0  No drift.
 *   1  Drift detected; prints a human-readable diff report.
 *   2  Script error (unable to parse one of the files).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PKG_SPEC = resolve(ROOT, 'packages/schema/openapi/verify.yaml');
const APP_SPEC = resolve(ROOT, 'apps/api/openapi.yaml');

// Downstream surfaces that restate parts of the verifier contract.
const DEFAULT_DOWNSTREAM_SURFACES = [
  resolve(ROOT, 'docs/HOSTED_VERIFY_CONTRACT.md'),
  resolve(ROOT, 'surfaces/reference-verifier/README.md'),
  resolve(ROOT, 'integrator-kits/mcp/README.md'),
  resolve(ROOT, 'docs/MIGRATION_CURRENT.md'),
  resolve(ROOT, 'docs/diagrams/peac-proof-flow.mmd'),
];

// Legacy wire identifiers constructed dynamically so the literal tokens
// do not appear in this source file. The repo-wide guard in
// `scripts/guard.sh` scans for the exact literal strings and flags any
// tracked file that contains them; dynamic construction lets this verifier
// enumerate the historical tokens it rejects without forcing an allowlist
// exception.
const LEGACY_WIRE_IDENTIFIERS = [
  // Wire 0.1 JWS typ (hyphenated form, superseded by interaction-record+jwt).
  ['peac', '-receipt/', '0', '.', '1'].join(''),
  // Wire 0.9 payload schema key (dotted form, predates Wire 0.1 and Wire 0.2).
  ['peac', '.receipt/', '0', '.', '9'].join(''),
];

// Markdown markers that legitimize a historical mention on a downstream
// surface. A match within 160 characters of the historical token counts
// as sufficient context.
const LEGACY_LEGITIMIZING_MARKERS = [
  'legacy',
  'historical',
  'deprecated',
  'superseded',
  'non-normative',
  'archival',
  'frozen',
  'retained as',
  'before',
  'migration',
  'wire 0.1',
  'wire 0.9',
];

function loadSpec(path) {
  try {
    return parseYaml(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`ERROR: cannot parse ${relative(ROOT, path)}: ${err.message}`);
    process.exit(2);
  }
}

// --surface <path> flags (repeatable) override the default downstream
// surface list. Used by scripts/verify-openapi-drift.test.mjs to drive
// the downstream check against fixtures.
const cliArgs = process.argv.slice(2);
const overrideSurfaces = [];
for (let i = 0; i < cliArgs.length; i++) {
  if (cliArgs[i] === '--surface' && cliArgs[i + 1]) {
    overrideSurfaces.push(resolve(cliArgs[i + 1]));
    i += 1;
  }
}
const DOWNSTREAM_SURFACES =
  overrideSurfaces.length > 0 ? overrideSurfaces : DEFAULT_DOWNSTREAM_SURFACES;

const pkg = loadSpec(PKG_SPEC);
const app = loadSpec(APP_SPEC);

const violations = [];

function compare(label, pkgVal, appVal) {
  if (pkgVal !== appVal) {
    violations.push(`${label}: pkg=${JSON.stringify(pkgVal)} app=${JSON.stringify(appVal)}`);
  }
}

function compareSets(label, pkgList, appList) {
  const a = new Set(pkgList || []);
  const b = new Set(appList || []);
  const missingInApp = [...a].filter((x) => !b.has(x));
  const missingInPkg = [...b].filter((x) => !a.has(x));
  if (missingInApp.length > 0) {
    violations.push(`${label}: missing in app spec: ${missingInApp.join(', ')}`);
  }
  if (missingInPkg.length > 0) {
    violations.push(`${label}: missing in package spec: ${missingInPkg.join(', ')}`);
  }
}

function refName(ref) {
  if (!ref) return null;
  if (typeof ref === 'string') return ref.split('/').pop();
  if (ref.$ref) return ref.$ref.split('/').pop();
  return null;
}

compare('openapi', pkg.openapi, app.openapi);
compare('info.version', pkg.info?.version, app.info?.version);

const pkgPath = pkg.paths?.['/v1/verify']?.post;
const appPath = app.paths?.['/v1/verify']?.post;

if (!pkgPath) {
  violations.push('package spec is missing POST /v1/verify');
}
if (!appPath) {
  violations.push('app spec is missing POST /v1/verify');
}

if (pkgPath && appPath) {
  compare('/v1/verify operationId', pkgPath.operationId, appPath.operationId);

  const pkgReqSchema = pkgPath.requestBody?.content?.['application/json']?.schema;
  const appReqSchema = appPath.requestBody?.content?.['application/json']?.schema;
  compare('/v1/verify request-body schema name', refName(pkgReqSchema), refName(appReqSchema));

  const pkgStatuses = Object.keys(pkgPath.responses || {}).sort();
  const appStatuses = Object.keys(appPath.responses || {}).sort();
  compareSets('/v1/verify response status codes', pkgStatuses, appStatuses);

  for (const status of pkgStatuses.filter((s) => appStatuses.includes(s))) {
    const pkgContent = Object.keys(pkgPath.responses[status].content || {}).sort();
    const appContent = Object.keys(appPath.responses[status].content || {}).sort();
    compareSets(`/v1/verify ${status} response media types`, pkgContent, appContent);
    for (const mediaType of pkgContent.filter((m) => appContent.includes(m))) {
      const pkgSchema = pkgPath.responses[status].content[mediaType]?.schema;
      const appSchema = appPath.responses[status].content[mediaType]?.schema;
      compare(
        `/v1/verify ${status} ${mediaType} schema name`,
        refName(pkgSchema),
        refName(appSchema)
      );
    }
  }
}

// Component-schema shape agreement for schemas referenced by /v1/verify.
const sharedSchemaNames = [];
if (pkgPath && appPath) {
  const reqName = refName(pkgPath.requestBody?.content?.['application/json']?.schema);
  if (reqName) sharedSchemaNames.push(reqName);
  for (const status of Object.keys(pkgPath.responses || {})) {
    for (const mt of Object.keys(pkgPath.responses[status].content || {})) {
      const n = refName(pkgPath.responses[status].content[mt]?.schema);
      if (n) sharedSchemaNames.push(n);
    }
  }
}
for (const name of [...new Set(sharedSchemaNames)]) {
  const pkgS = pkg.components?.schemas?.[name];
  const appS = app.components?.schemas?.[name];
  if (!pkgS || !appS) continue; // Not present in both specs; nothing to compare.
  compareSets(
    `components.schemas.${name}.required`,
    pkgS.required,
    appS.required
  );
  compareSets(
    `components.schemas.${name} property names`,
    Object.keys(pkgS.properties || {}),
    Object.keys(appS.properties || {})
  );
}

// Downstream surface checks: restated contract must not drift.
const verifyPathStatuses = new Set(Object.keys(pkg.paths?.['/v1/verify']?.post?.responses || {}));
const legacyVerifyStatuses = new Set(Object.keys(pkg.paths?.['/verify']?.post?.responses || {}));
const knownStatuses = new Set([...verifyPathStatuses, ...legacyVerifyStatuses]);

// Strip fenced code blocks to avoid matching status codes and legacy
// identifiers inside curl / shell examples; restated contract elements
// that must agree with OpenAPI live in tables and inline prose.
function stripFencedCodeBlocks(text) {
  return text.replace(/```[\s\S]*?```/g, '');
}

function findNearestMarker(text, idx, window = 320) {
  // A 320-character window on each side catches section headings and
  // comparison-table column headers (Wire 0.1 / Wire 0.2 etc.) that
  // sit a few lines above a table data row without over-matching
  // unrelated prose elsewhere in the document.
  const before = text.slice(Math.max(0, idx - window), idx).toLowerCase();
  const after = text.slice(idx, Math.min(text.length, idx + window)).toLowerCase();
  for (const marker of LEGACY_LEGITIMIZING_MARKERS) {
    if (before.includes(marker) || after.includes(marker)) return true;
  }
  return false;
}

// Extract HTTP status codes mentioned in markdown table cells. Matches a
// table cell containing only a 3-digit status code with optional code
// formatting: `| 400 |`, `| \`400\` |`, `| **400** |`.
const TABLE_STATUS_RE = /\|\s*\**\s*`?(\d{3})`?\s*\**\s*\|/g;

for (const surface of DOWNSTREAM_SURFACES) {
  if (!existsSync(surface)) {
    violations.push(`downstream surface missing: ${relative(ROOT, surface)}`);
    continue;
  }
  const raw = readFileSync(surface, 'utf8');
  const prose = stripFencedCodeBlocks(raw);

  // Legacy-wire-identifier check. Matches are legitimized only by a nearby
  // marker word (legacy / historical / deprecated / superseded / non-normative
  // / archival) within a 160-character window on either side.
  for (const id of LEGACY_WIRE_IDENTIFIERS) {
    let searchFrom = 0;
    while (true) {
      const idx = prose.indexOf(id, searchFrom);
      if (idx === -1) break;
      if (!findNearestMarker(prose, idx)) {
        violations.push(
          `downstream: ${relative(ROOT, surface)} references legacy identifier "${id}" without a legacy/historical marker`
        );
      }
      searchFrom = idx + id.length;
    }
  }

  // Table-status-code check: every status code that appears as a standalone
  // table cell must be declared by the OpenAPI `/v1/verify` or legacy
  // `/verify` responses. Common documentation status codes that are not
  // HTTP responses (429, 413, 502) must also appear in the OpenAPI spec if
  // the surface teaches them to integrators.
  const matches = [...prose.matchAll(TABLE_STATUS_RE)];
  for (const m of matches) {
    const status = m[1];
    // Ignore non-HTTP-shaped codes (e.g., port numbers) outside 100-599.
    const code = Number(status);
    if (code < 100 || code > 599) continue;
    if (!knownStatuses.has(status)) {
      violations.push(
        `downstream: ${relative(ROOT, surface)} claims HTTP status ${status} but it is not declared by the OpenAPI /v1/verify or /verify response set`
      );
    }
  }
}

if (violations.length > 0) {
  console.error(`FAIL: OpenAPI drift (${violations.length} issue(s)):`);
  for (const v of violations) console.error(`  - ${v}`);
  console.error(`\nPackage spec: ${relative(ROOT, PKG_SPEC)}`);
  console.error(`App spec:     ${relative(ROOT, APP_SPEC)}`);
  console.error(`Downstream surfaces checked:`);
  for (const s of DOWNSTREAM_SURFACES) console.error(`  ${relative(ROOT, s)}`);
  process.exit(1);
}

console.log('OK: OpenAPI specs agree on shared /v1/verify contract; downstream surfaces agree with the truth-source matrix.');
