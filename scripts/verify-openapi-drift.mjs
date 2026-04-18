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
 * Deliberately does NOT insist on byte-for-byte equality; descriptions
 * and examples are free to vary. The contract is on the wire-facing
 * shape, not on the prose.
 *
 * Exit codes:
 *   0  No drift.
 *   1  Drift detected; prints a human-readable diff report.
 *   2  Script error (unable to parse one of the files).
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PKG_SPEC = resolve(ROOT, 'packages/schema/openapi/verify.yaml');
const APP_SPEC = resolve(ROOT, 'apps/api/openapi.yaml');

function loadSpec(path) {
  try {
    return parseYaml(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`ERROR: cannot parse ${relative(ROOT, path)}: ${err.message}`);
    process.exit(2);
  }
}

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

if (violations.length > 0) {
  console.error(`FAIL: OpenAPI drift between package spec and app spec (${violations.length} issue(s)):`);
  for (const v of violations) console.error(`  - ${v}`);
  console.error(`\nPackage spec: ${relative(ROOT, PKG_SPEC)}`);
  console.error(`App spec:     ${relative(ROOT, APP_SPEC)}`);
  process.exit(1);
}

console.log('OK: OpenAPI specs agree on shared /v1/verify contract.');
