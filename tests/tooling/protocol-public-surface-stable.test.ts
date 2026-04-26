/**
 * @peac/protocol public-surface stability gate.
 *
 * v0.13.1 binding rule: PR B introduces an internal codec boundary at
 * packages/protocol/src/_internal/record-core/. The codec interface, the
 * defaultCodec instance, and the migration-class types are INTERNAL and
 * MUST NOT appear on @peac/protocol's public TypeScript surface.
 *
 * This test asserts:
 *   1. The set of named runtime exports from @peac/protocol matches the
 *      pre-PR-B baseline (captured 2026-04-26 from packages/protocol/src/index.ts
 *      at the PR A merge commit dc671cd1). Drift in either direction (added
 *      exports or removed exports) fails this test.
 *   2. @peac/protocol/package.json's dependencies, peerDependencies, and
 *      optionalDependencies do NOT contain the four reboot-package names:
 *      @peac/registries, @peac/record-core, @peac/compat, @peac/resolver-http.
 *
 * If a contributor needs to add a new export, this test must be updated in
 * the same PR with a documented rationale. Speculative additions are forbidden.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as protocol from '@peac/protocol';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// Baseline captured 2026-04-26 from packages/protocol/src/index.ts at PR A
// merge commit dc671cd1 (v0.13.1 PR A merged). Adding or removing any name
// requires an explicit, reviewed change to this list AND a documented
// rationale in the PR body.
const PROTOCOL_PUBLIC_EXPORT_BASELINE_PR_A = [
  'CHECK_IDS',
  'DEFAULT_NETWORK_SECURITY',
  'DEFAULT_VERIFIER_LIMITS',
  'IssueError',
  'NON_DETERMINISTIC_ARTIFACT_KEYS',
  'VerificationReportBuilder',
  'base64urlDecode',
  'base64urlEncode',
  'buildFailureReport',
  'buildSuccessReport',
  'checkDocumentBinding',
  'checkPolicyBinding',
  'clearJWKSCache',
  'clearKidThumbprints',
  'computeDocumentDigest',
  'computeJsonDocumentDigestJcs',
  'computeJwkThumbprint',
  'computePolicyDigestJcs',
  'computeReceiptDigest',
  'computeTextDocumentDigestUtf8',
  'createDefaultPolicy',
  'createDigest',
  'createEmptyReport',
  'createReportBuilder',
  'fetchDiscovery',
  'fetchIssuerConfig',
  'fetchJWKSSafe',
  'fetchPointerSafe',
  'fetchPointerWithDigest',
  'fetchPolicyManifest',
  'generateKeypair',
  'getJWKSCacheSize',
  'getKidThumbprintSize',
  'getPurposeHeader',
  'getReceiptHeader',
  'getSSRFCapabilities',
  'isAttestationResult',
  'isBlockedIP',
  'isCommerceResult',
  'isWire02Result',
  'issue',
  'issueJws',
  'issueWire01',
  'issueWire02',
  'jwkToPublicKeyBytes',
  'parseBodyProfile',
  'parseDiscovery',
  'parseHeaderProfile',
  'parseIssuerConfig',
  'parsePointerProfile',
  'parsePolicyManifest',
  'parseTransportProfile',
  'reasonCodeToErrorCode',
  'reasonCodeToSeverity',
  'resetSSRFCapabilitiesCache',
  'resolveJWKS',
  'setPurposeAppliedHeader',
  'setPurposeReasonHeader',
  'setReceiptHeader',
  'setVaryHeader',
  'setVaryPurposeHeader',
  'sha256Bytes',
  'sha256Hex',
  'ssrfErrorToReasonCode',
  'ssrfSafeFetch',
  'verify',
  'verifyAndFetchPointer',
  'verifyLocal',
  'verifyReceipt',
  'verifyReceiptCore',
];

const FORBIDDEN_INTERNAL_EXPORTS = [
  // Codec interface symbols
  'RecordCodec',
  'CodecError',
  'CodecHeader',
  'defaultCodec',
  'getCodec',
  '_registeredCodecNames',
  // Migration-class symbols
  'MigrationClass',
  'MigrationVerdict',
  'classifyMigration',
  'ArchivalRecord',
  'ArchivalBundle',
  // Internal record-core hooks
  'normalize',
  'InternalMigrationClass',
];

const PRIVATE_REBOOT_PACKAGE_NAMES = [
  '@peac/registries',
  '@peac/record-core',
  '@peac/compat',
  '@peac/resolver-http',
];

describe('@peac/protocol public-surface stability', () => {
  it('runtime exports match the pre-PR-B baseline (no additions, no removals)', () => {
    const actual = Object.keys(protocol).sort();
    const baseline = [...PROTOCOL_PUBLIC_EXPORT_BASELINE_PR_A].sort();
    expect(actual).toEqual(baseline);
  });

  it('does not export any internal codec / migration-class symbol', () => {
    const exported = new Set(Object.keys(protocol));
    const leaked = FORBIDDEN_INTERNAL_EXPORTS.filter((name) => exported.has(name));
    expect(leaked).toEqual([]);
  });

  it('package.json deps, peerDeps, optionalDeps contain no workspace-private package names', () => {
    const pkgJson = JSON.parse(
      readFileSync(join(ROOT, 'packages', 'protocol', 'package.json'), 'utf8')
    ) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };

    const allDeps = {
      ...(pkgJson.dependencies ?? {}),
      ...(pkgJson.peerDependencies ?? {}),
      ...(pkgJson.optionalDependencies ?? {}),
    };

    for (const name of PRIVATE_REBOOT_PACKAGE_NAMES) {
      expect(allDeps[name]).toBeUndefined();
    }
  });
});
