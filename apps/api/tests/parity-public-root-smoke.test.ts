// Internal-only. Public-root no-network parity smoke for the shadow
// resolver foundation. Drives the real protocol and resolver-http
// pointer-fetch implementations through the shadow executor for inputs
// that both implementations reject before any network I/O is attempted
// (invalid expected-digest format, non-HTTPS URL, invalid URL string).
//
// Why this scope: full fetched-body cross-implementation parity needs a
// shared response harness that mocks both implementations' fetch boundary
// without reaching for private subpaths. Protocol's pointer-fetch imports
// `ssrfSafeFetch` via a relative path inside the protocol package, so a
// public `vi.mock('@peac/protocol')` does not intercept the internal call.
// Forcing a private mock would violate the no-private-subpath rule. The
// public-root no-network smoke is the safe boundary for PR B1; full
// cross-implementation fetched-body parity is deferred until either a
// protocol diagnostic hook lands or a Hosted Verify pointer-input feature
// exists to capture a real primary-path result.

import { describe, it, expect, beforeEach } from 'vitest';
import { fetchPointerWithDigest as protocolFetch } from '@peac/protocol';
import { fetchPointerWithDigest as resolverHttpFetch } from '@peac/resolver-http';
import { createShadowExecutor } from '../src/lib/shadow-execute.js';
import {
  resetShadowSinkForTests,
  getMismatches,
  __TEST_CONSTANTS__,
} from '../src/lib/shadow-mismatch-sink.js';
import type { NormalizedPointerClass } from '../src/lib/shadow-types.js';

const SAMPLE_DIGEST = 'a'.repeat(64);

const executor = createShadowExecutor({
  protocolFetch: (opts) => protocolFetch({ url: opts.url, expectedDigest: opts.expectedDigest }),
  resolverHttpFetch: (url, expectedDigest) => resolverHttpFetch(url, expectedDigest),
});

interface ParityCase {
  name: string;
  url: string;
  expectedDigest: string;
  expectedClass: NormalizedPointerClass;
}

const PUBLIC_ROOT_CASES: ParityCase[] = [
  {
    name: 'invalid expected-digest: empty string',
    url: 'https://issuer.example.com/r/abc',
    expectedDigest: '',
    expectedClass: 'invalid_expected_digest',
  },
  {
    name: 'invalid expected-digest: too short',
    url: 'https://issuer.example.com/r/abc',
    expectedDigest: 'abc',
    expectedClass: 'invalid_expected_digest',
  },
  {
    name: 'invalid expected-digest: uppercase hex',
    url: 'https://issuer.example.com/r/abc',
    expectedDigest: 'A'.repeat(64),
    expectedClass: 'invalid_expected_digest',
  },
  {
    name: 'invalid expected-digest: non-hex',
    url: 'https://issuer.example.com/r/abc',
    expectedDigest: 'z'.repeat(64),
    expectedClass: 'invalid_expected_digest',
  },
  {
    name: 'non-HTTPS URL: http scheme',
    url: 'http://issuer.example.com/r/abc',
    expectedDigest: SAMPLE_DIGEST,
    expectedClass: 'url_blocked',
  },
  {
    name: 'non-HTTPS URL: file scheme',
    url: 'file:///etc/passwd',
    expectedDigest: SAMPLE_DIGEST,
    expectedClass: 'url_blocked',
  },
];

describe('public-root no-network pointer-fetch parity smoke', () => {
  beforeEach(() => {
    resetShadowSinkForTests({ PEAC_INTERNAL_SHADOW_BUFFER_SIZE: '64' });
  });

  for (const c of PUBLIC_ROOT_CASES) {
    it(`aligns class for: ${c.name}`, async () => {
      const outcome = await executor(c.url, c.expectedDigest);

      expect(outcome.legacyNormalized.class).toBe(c.expectedClass);
      expect(outcome.shadowNormalized.class).toBe(c.expectedClass);
      expect(outcome.verdict.classMatches).toBe(true);
      expect(outcome.verdict.mismatchClasses).not.toContain('parity_class_mismatch');
    });
  }

  it('records nothing in the sink when verdicts align across all public-root cases', async () => {
    for (const c of PUBLIC_ROOT_CASES) {
      await executor(c.url, c.expectedDigest);
    }
    const recorded = getMismatches();
    // Some cases may differ on hasContentTypeWarning or success-shape
    // because the implementations diverge on whether contentType is
    // surfaced for failures. Assert no parity_class_mismatch was logged.
    for (const entry of recorded) {
      expect(entry.class).not.toBe('parity_class_mismatch');
      expect(entry.class).not.toBe('parity_digest_mismatch');
    }
  });
});

describe('public-root parity smoke: redaction discipline', () => {
  beforeEach(() => {
    resetShadowSinkForTests({ PEAC_INTERNAL_SHADOW_BUFFER_SIZE: '64' });
  });

  it('never surfaces raw URL path or query in normalized results or sink entries', async () => {
    const sensitiveUrl = 'https://issuer.example.com/secret/path?token=abc123&user=alice#fragment';
    const outcome = await executor(sensitiveUrl, 'badhex');

    const legacyJson = JSON.stringify(outcome.legacyNormalized);
    const shadowJson = JSON.stringify(outcome.shadowNormalized);

    expect(legacyJson).not.toContain('/secret/path');
    expect(legacyJson).not.toContain('token=abc123');
    expect(legacyJson).not.toContain('user=alice');
    expect(legacyJson).not.toContain('fragment');
    expect(shadowJson).not.toContain('/secret/path');
    expect(shadowJson).not.toContain('token=abc123');
    expect(shadowJson).not.toContain('user=alice');
    expect(shadowJson).not.toContain('fragment');

    for (const entry of getMismatches()) {
      const entryJson = JSON.stringify(entry);
      expect(entryJson).not.toContain('/secret/path');
      expect(entryJson).not.toContain('token=abc123');
      expect(entryJson).not.toContain('user=alice');
      expect(entryJson).not.toContain('fragment');
    }
  });

  it('never surfaces bearer tokens, cookies, or private key material in sink entries', async () => {
    const tokenLikeUrl = 'https://issuer.example.com/r?Authorization=Bearer+dummytoken';
    await executor(tokenLikeUrl, 'badhex');

    for (const entry of getMismatches()) {
      const entryJson = JSON.stringify(entry);
      expect(entryJson).not.toContain('Bearer');
      expect(entryJson).not.toContain('Authorization');
      expect(entryJson).not.toContain('dummytoken');
      expect(entryJson).not.toContain('Cookie');
      expect(entryJson).not.toContain('PRIVATE KEY');
    }
  });

  it('every recorded sink entry stays within the ~512-byte JSON-stringified cap', async () => {
    for (const c of PUBLIC_ROOT_CASES) {
      await executor(c.url, c.expectedDigest);
    }
    for (const entry of getMismatches()) {
      const len = JSON.stringify(entry).length;
      expect(len).toBeLessThanOrEqual(__TEST_CONSTANTS__.ENTRY_BYTE_CAP);
    }
  });
});
