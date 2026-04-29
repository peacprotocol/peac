// pointer-fetch content-type warn (Plan Fix #4 + Commit 3.0.1 Fix #5 safety).
//
// Mirror protocol behavior: content-type outside the expected set is NOT a
// failure; success result carries a bounded contentTypeWarning string.
// resolver-http MUST NOT pass acceptContentTypes to fetchRawSafe on this
// path. Warning is bounded ≤ 200 chars; contains only the upstream
// content-type value (already public response metadata) plus a stable class
// label. No body bytes / URL path / query / headers / secrets in warning.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { sha256Hex } from '@peac/crypto';

import {
  mockSafeFetchJson,
  mockSafeFetchJWKS,
  mockSafeFetchRaw,
  enqueue,
  resetMock,
} from './_helpers/mock-net-node.js';

vi.mock('@peac/net-node', async () => {
  const actual = await vi.importActual<typeof import('@peac/net-node')>('@peac/net-node');
  return {
    ...actual,
    safeFetchJson: mockSafeFetchJson,
    safeFetchJWKS: mockSafeFetchJWKS,
    safeFetchRaw: mockSafeFetchRaw,
  };
});

import { fetchPointerWithDigest } from '../src/pointer-fetch.js';

const VALID_JWS = 'aGVhZGVy.cGF5bG9hZA.c2lnbmF0dXJl';

beforeEach(() => {
  resetMock();
});

describe('pointer-fetch content-type warn', () => {
  for (const accepted of ['application/jose', 'application/json', 'text/plain']) {
    it(`${accepted} succeeds with NO warning`, async () => {
      enqueue('safeFetchRaw', {
        ok: true,
        status: 200,
        contentType: accepted,
        body: VALID_JWS,
      });
      const result = await fetchPointerWithDigest(
        'https://issuer.example.com/r',
        await sha256Hex(VALID_JWS)
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.contentTypeWarning).toBeUndefined();
    });
  }

  it('text/html content-type with correct digest succeeds (warn, do not reject)', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: VALID_JWS,
    });
    const result = await fetchPointerWithDigest(
      'https://issuer.example.com/r',
      await sha256Hex(VALID_JWS)
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contentTypeWarning).toBeDefined();
      expect(result.contentTypeWarning).toMatch(/unexpected_content_type/);
    }
  });

  it('warning is bounded (<=200 chars)', async () => {
    const longCT = `application/x-` + 'a'.repeat(500); // 514 chars
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: longCT,
      body: VALID_JWS,
    });
    const result = await fetchPointerWithDigest(
      'https://issuer.example.com/r',
      await sha256Hex(VALID_JWS)
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contentTypeWarning).toBeDefined();
      expect(result.contentTypeWarning!.length).toBeLessThanOrEqual(200);
    }
  });

  it('warning contains NO body bytes / URL path / headers / secrets', async () => {
    // Server returns text/html body (still a valid 3-segment JWS string for digest).
    // The warning must not pull body bytes or URL path/query into its string.
    const sensitiveBody = VALID_JWS; // valid JWS so digest succeeds
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'text/xml',
      body: sensitiveBody,
    });
    const result = await fetchPointerWithDigest(
      'https://issuer.example.com/path/with/secrets?token=abc&kid=def',
      await sha256Hex(sensitiveBody)
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.contentTypeWarning) {
      const warning = result.contentTypeWarning;
      expect(warning).not.toContain('Bearer');
      expect(warning).not.toContain('Cookie');
      expect(warning).not.toContain('Authorization');
      expect(warning).not.toContain('token=');
      expect(warning).not.toContain('kid=');
      expect(warning).not.toContain('/path/with/secrets');
      expect(warning).not.toContain(sensitiveBody);
      // Warning DOES contain the safe stable class label and the upstream
      // content-type value (already public response metadata).
      expect(warning).toContain('unexpected_content_type');
      expect(warning).toContain('text/xml');
    }
  });

  it('content-type pre-check tolerates parameters (charset)', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose; charset=utf-8',
      body: VALID_JWS,
    });
    const result = await fetchPointerWithDigest(
      'https://issuer.example.com/r',
      await sha256Hex(VALID_JWS)
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // application/jose; charset=utf-8 should NOT trigger the warning.
      expect(result.contentTypeWarning).toBeUndefined();
    }
  });

  it('absent content-type does NOT trigger warning', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      // no contentType set
      body: VALID_JWS,
    });
    const result = await fetchPointerWithDigest(
      'https://issuer.example.com/r',
      await sha256Hex(VALID_JWS)
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contentTypeWarning).toBeUndefined();
    }
  });
});
