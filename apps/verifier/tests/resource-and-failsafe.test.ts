/**
 * Resource lifecycle and terminal-failure behaviour.
 *
 * Two properties that no functional test would catch, because both look like success:
 *   1. every Blob object URL the report panel mints is revoked -- otherwise each verification pins
 *      record-derived material in memory for the life of the tab;
 *   2. verify() RESOLVES for every input, including an internal defect -- otherwise a throw rejects
 *      the promise and the interface silently stops responding.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  renderReport,
  releaseReportObjectUrls,
  outstandingReportObjectUrlCount,
} from '../src/ui/report-panel.js';
import { initializeLocalVerifier } from '../src/verify.js';
import type { VerificationReportCoreV1 } from '../src/lib/verifier-types.js';
import { makeFixture } from './helpers/fixtures.js';
import { installMiniDom, createContainer } from './helpers/mini-dom.js';

function fakeReport(n: number): VerificationReportCoreV1 {
  return {
    reportVersion: '1',
    verifierProfile: 'peac.local-record-verification.v1',
    verifierBuild: `test-${n}`,
    recordSha256: 'a'.repeat(64),
    selectedJwkThumbprint: 'b'.repeat(43),
    evaluationTimeUnixSeconds: 1_700_000_000,
    maxClockSkewSeconds: 300,
    signatureResult: 'valid_under_supplied_key',
    recordValidationResult: 'valid',
    trustedKeyResult: 'not_provided',
    issuerConstraintResult: 'not_provided',
    kidConstraintResult: 'not_provided',
    recordTypeConstraintResult: 'not_provided',
    outcome: 'accepted',
    recordType: 'org.peacprotocol/test',
    reportedIssuer: 'https://example.org',
    warningCodes: [],
    limitationCodes: [],
    reportSha256: 'c'.repeat(64),
  } as VerificationReportCoreV1;
}

describe('report object-URL lifecycle', () => {
  let revoked: string[];

  beforeEach(() => {
    installMiniDom();
    releaseReportObjectUrls();
    revoked = [];
    let n = 0;
    // Spy on the two METHODS. Replacing the whole `URL` global with an object literal destroys the
    // constructor, which silently breaks issuer canonicalisation in unrelated suites.
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test/${n++}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u: string) => {
      revoked.push(u);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { document?: unknown }).document;
  });

  it('revokes the previous URL on every re-render', () => {
    const el = createContainer() as unknown as HTMLElement;
    for (let i = 0; i < 25; i++) renderReport(fakeReport(i), el);
    // 25 renders, 24 revocations, exactly one still live.
    expect(revoked).toHaveLength(24);
    expect(outstandingReportObjectUrlCount()).toBe(1);
  });

  it('holds nothing after teardown', () => {
    const el = createContainer() as unknown as HTMLElement;
    renderReport(fakeReport(0), el);
    releaseReportObjectUrls();
    expect(outstandingReportObjectUrlCount()).toBe(0);
    expect(revoked).toHaveLength(1);
  });

  it('clearing the panel releases the URL', () => {
    const el = createContainer() as unknown as HTMLElement;
    renderReport(fakeReport(0), el);
    renderReport(undefined, el);
    expect(outstandingReportObjectUrlCount()).toBe(0);
    expect(el.childNodes).toHaveLength(0);
  });

  it('revokes after a download is initiated, not before', async () => {
    const el = createContainer() as unknown as HTMLElement;
    renderReport(fakeReport(0), el);
    const anchor = (
      el as unknown as {
        querySelector(
          s: string
        ): { getAttribute(n: string): string; dispatchEvent(t: string): void } | undefined;
      }
    ).querySelector('a');
    expect(anchor?.getAttribute('href')).toMatch(/^blob:/);
    anchor?.dispatchEvent('click');
    expect(revoked).toHaveLength(0); // still live at click time
    await new Promise((r) => setTimeout(r, 0));
    expect(revoked).toHaveLength(1);
    expect(outstandingReportObjectUrlCount()).toBe(0);
  });
});

describe('verify() is a total boundary', () => {
  it('resolves with an internal error instead of rejecting when the canonical verifier throws', async () => {
    const f = await makeFixture();
    const verifier = await initializeLocalVerifier({
      verifierBuild: 'test-build',
      verifyLocal: (() => {
        throw new Error('injected canonical defect');
      }) as never,
    });

    const result = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      failureStage: 'internal_error',
      code: 'E_VERIFIER_INTERNAL_ERROR',
      signature: 'not_evaluated',
      recordValidation: 'not_evaluated',
    });
  });

  it('does not leak the internal message into the diagnostic', async () => {
    const f = await makeFixture();
    const verifier = await initializeLocalVerifier({
      verifierBuild: 'test-build',
      verifyLocal: (() => {
        throw new Error('secret internal detail 0xDEADBEEF');
      }) as never,
    });
    const result = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect(JSON.stringify(result)).not.toContain('0xDEADBEEF');
  });
});
