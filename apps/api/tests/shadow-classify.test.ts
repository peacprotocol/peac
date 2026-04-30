import { describe, it, expect } from 'vitest';
import {
  classifyProtocolPointerResult,
  classifyResolverHttpPointerResult,
  computeParityVerdict,
  type ProtocolPointerResultLike,
  type ResolverHttpPointerResultLike,
} from '../src/lib/shadow-classify.js';

const SAMPLE_DIGEST = 'a'.repeat(64);

describe('classifyProtocolPointerResult', () => {
  it('classifies success', () => {
    const r: ProtocolPointerResultLike = {
      ok: true,
      actualDigest: SAMPLE_DIGEST,
      contentType: 'application/jose',
    };
    expect(classifyProtocolPointerResult(r)).toEqual({
      class: 'success',
      actualDigest: SAMPLE_DIGEST,
      contentType: 'application/jose',
      hasContentTypeWarning: false,
    });
  });

  it('records content-type warning class on success', () => {
    const r: ProtocolPointerResultLike = {
      ok: true,
      actualDigest: SAMPLE_DIGEST,
      contentType: 'text/html',
      contentTypeWarning: 'Unexpected Content-Type: text/html; expected ...',
    };
    expect(classifyProtocolPointerResult(r).hasContentTypeWarning).toBe(true);
  });

  it('classifies pointer_digest_mismatch', () => {
    const r: ProtocolPointerResultLike = {
      ok: false,
      reason: 'pointer_digest_mismatch',
      message: 'Fetched receipt digest does not match expected digest',
      actualDigest: SAMPLE_DIGEST,
    };
    expect(classifyProtocolPointerResult(r).class).toBe('digest_mismatch');
  });

  it('classifies malformed_receipt as malformed_jws', () => {
    const r: ProtocolPointerResultLike = {
      ok: false,
      reason: 'malformed_receipt',
      message: 'Pointer target returned empty content',
    };
    expect(classifyProtocolPointerResult(r).class).toBe('malformed_jws');
  });

  it('classifies pointer_fetch_blocked as url_blocked', () => {
    const r: ProtocolPointerResultLike = {
      ok: false,
      reason: 'pointer_fetch_blocked',
      message: 'Pointer URL must use HTTPS',
    };
    expect(classifyProtocolPointerResult(r).class).toBe('url_blocked');
  });

  it('classifies pointer_fetch_timeout / too_large as fetch_failure', () => {
    expect(
      classifyProtocolPointerResult({
        ok: false,
        reason: 'pointer_fetch_timeout',
        message: '',
      }).class
    ).toBe('fetch_failure');
    expect(
      classifyProtocolPointerResult({
        ok: false,
        reason: 'pointer_fetch_too_large',
        message: '',
      }).class
    ).toBe('fetch_failure');
  });

  it('classifies pointer_fetch_failed with "Invalid expected digest" message as invalid_expected_digest', () => {
    const r: ProtocolPointerResultLike = {
      ok: false,
      reason: 'pointer_fetch_failed',
      message: 'Invalid expected digest: must be 64 lowercase hex characters',
    };
    expect(classifyProtocolPointerResult(r).class).toBe('invalid_expected_digest');
  });

  it('classifies pointer_fetch_failed with "Invalid pointer URL" message as url_blocked', () => {
    const r: ProtocolPointerResultLike = {
      ok: false,
      reason: 'pointer_fetch_failed',
      message: 'Invalid pointer URL',
    };
    expect(classifyProtocolPointerResult(r).class).toBe('url_blocked');
  });

  it('classifies pointer_fetch_failed otherwise as fetch_failure', () => {
    const r: ProtocolPointerResultLike = {
      ok: false,
      reason: 'pointer_fetch_failed',
      message: 'Network error',
    };
    expect(classifyProtocolPointerResult(r).class).toBe('fetch_failure');
  });

  it('classifies unknown reason as unknown_failure', () => {
    const r: ProtocolPointerResultLike = {
      ok: false,
      reason: 'something_unexpected',
      message: '',
    };
    expect(classifyProtocolPointerResult(r).class).toBe('unknown_failure');
  });
});

describe('classifyResolverHttpPointerResult', () => {
  it('classifies success', () => {
    const r: ResolverHttpPointerResultLike = {
      ok: true,
      actualDigest: SAMPLE_DIGEST,
      contentType: 'application/jose',
    };
    expect(classifyResolverHttpPointerResult(r).class).toBe('success');
  });

  it('classifies pointer_invalid_expected_digest', () => {
    expect(
      classifyResolverHttpPointerResult({ ok: false, code: 'pointer_invalid_expected_digest' })
        .class
    ).toBe('invalid_expected_digest');
  });

  it('classifies pointer_malformed_jws', () => {
    expect(
      classifyResolverHttpPointerResult({ ok: false, code: 'pointer_malformed_jws' }).class
    ).toBe('malformed_jws');
  });

  it('classifies pointer_digest_mismatch', () => {
    expect(
      classifyResolverHttpPointerResult({
        ok: false,
        code: 'pointer_digest_mismatch',
        actualDigest: SAMPLE_DIGEST,
      }).class
    ).toBe('digest_mismatch');
  });

  it('classifies SSRF / HTTPS / redirect / metadata / port codes as url_blocked', () => {
    for (const code of [
      'pointer_fetch_blocked',
      'fetch_blocked_https_only',
      'fetch_blocked_ssrf',
      'fetch_blocked_metadata_ip',
      'fetch_blocked_redirect',
      'fetch_blocked_dangerous_port',
    ]) {
      expect(classifyResolverHttpPointerResult({ ok: false, code }).class).toBe('url_blocked');
    }
  });

  it('classifies network / timeout / status / byte cap / content-type as fetch_failure', () => {
    for (const code of [
      'fetch_timeout',
      'fetch_network_error',
      'fetch_blocked_byte_cap',
      'fetch_status_4xx',
      'fetch_status_5xx',
      'fetch_invalid_content_type',
    ]) {
      expect(classifyResolverHttpPointerResult({ ok: false, code }).class).toBe('fetch_failure');
    }
  });

  it('classifies unknown code as unknown_failure', () => {
    expect(
      classifyResolverHttpPointerResult({ ok: false, code: 'resolver_internal_error' }).class
    ).toBe('unknown_failure');
  });
});

describe('computeParityVerdict', () => {
  it('aligns when both succeed with same digest, content-type and warning class', () => {
    const v = computeParityVerdict(
      {
        class: 'success',
        actualDigest: SAMPLE_DIGEST,
        contentType: 'application/jose',
        hasContentTypeWarning: false,
      },
      {
        class: 'success',
        actualDigest: SAMPLE_DIGEST,
        contentType: 'application/jose',
        hasContentTypeWarning: false,
      }
    );
    expect(v.classMatches).toBe(true);
    expect(v.digestMatches).toBe(true);
    expect(v.successShapeMatches).toBe(true);
    expect(v.contentTypeWarningClassMatches).toBe(true);
    expect(v.mismatchClasses).toEqual([]);
  });

  it('records parity_class_mismatch when classes differ', () => {
    const v = computeParityVerdict(
      { class: 'success', actualDigest: SAMPLE_DIGEST, hasContentTypeWarning: false },
      { class: 'fetch_failure', hasContentTypeWarning: false }
    );
    expect(v.classMatches).toBe(false);
    expect(v.mismatchClasses).toContain('parity_class_mismatch');
  });

  it('records parity_digest_mismatch when both succeed but digests differ', () => {
    const other = 'b'.repeat(64);
    const v = computeParityVerdict(
      { class: 'success', actualDigest: SAMPLE_DIGEST, hasContentTypeWarning: false },
      { class: 'success', actualDigest: other, hasContentTypeWarning: false }
    );
    expect(v.digestMatches).toBe(false);
    expect(v.mismatchClasses).toContain('parity_digest_mismatch');
  });

  it('records parity_content_type_warning_mismatch when warning classes differ', () => {
    const v = computeParityVerdict(
      { class: 'success', actualDigest: SAMPLE_DIGEST, hasContentTypeWarning: false },
      { class: 'success', actualDigest: SAMPLE_DIGEST, hasContentTypeWarning: true }
    );
    expect(v.contentTypeWarningClassMatches).toBe(false);
    expect(v.mismatchClasses).toContain('parity_content_type_warning_mismatch');
  });

  it('records parity_success_shape_mismatch when content-type presence differs', () => {
    const v = computeParityVerdict(
      {
        class: 'success',
        actualDigest: SAMPLE_DIGEST,
        contentType: 'application/jose',
        hasContentTypeWarning: false,
      },
      { class: 'success', actualDigest: SAMPLE_DIGEST, hasContentTypeWarning: false }
    );
    expect(v.successShapeMatches).toBe(false);
    expect(v.mismatchClasses).toContain('parity_success_shape_mismatch');
  });

  it('does not compute digest / shape verdicts when classes differ', () => {
    const v = computeParityVerdict(
      { class: 'success', actualDigest: SAMPLE_DIGEST, hasContentTypeWarning: false },
      { class: 'malformed_jws', hasContentTypeWarning: false }
    );
    expect(v.digestMatches).toBeUndefined();
    expect(v.successShapeMatches).toBeUndefined();
  });
});
