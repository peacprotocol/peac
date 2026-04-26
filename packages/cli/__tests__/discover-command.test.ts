/**
 * peac discover <url> command: round-trip tests covering 8 scenarios:
 *   1. happy-path well-formed peac.txt
 *   2. malformed peac.txt (mock returns invalid YAML/JSON)
 *   3. HTTP 5xx response
 *   4. fetch timeout
 *   5. byte cap exceeded
 *   6. happy-path with legacy key-discovery lines (warnings populated)
 *   7. redirect cap exceeded (E_NET_SSRF_TOO_MANY_REDIRECTS)
 *   8. non-HTTP(S) URL scheme rejection
 *
 * The CLI helper at packages/cli/src/lib/policy-document-discovery.ts is
 * exercised end-to-end via the public DiscoverCommand class. Network is
 * mocked at the @peac/net-node.safeFetchRaw boundary so each scenario is
 * deterministic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiscoverCommand } from '../src/commands/discover.js';
import { __resetLegacyWarningForTests } from '../src/lib/policy-document-discovery.js';

interface MockSafeFetchSuccess {
  ok: true;
  response: {
    ok: boolean;
    status: number;
    statusText: string;
    text(): Promise<string>;
  };
  close(): Promise<void>;
  warnings?: string[];
  evidence: Record<string, unknown>;
}

interface MockSafeFetchFailure {
  ok: false;
  code: string;
  error: string;
}

const closeSpy = vi.fn(async () => {});

const mockSafeFetchRaw =
  vi.fn<(url: string, options?: unknown) => Promise<MockSafeFetchSuccess | MockSafeFetchFailure>>();

vi.mock('@peac/net-node', () => ({
  safeFetchRaw: (url: string, options?: unknown) => mockSafeFetchRaw(url, options),
}));

const VALID_PEAC_TXT = [
  "version: 'peac-policy/0.1'",
  'defaults:',
  '  decision: deny',
  'rules: []',
  '',
].join('\n');

const VALID_PEAC_TXT_WITH_LEGACY_VERIFY = [
  'verify: https://example.com/verify',
  VALID_PEAC_TXT,
].join('\n');

function okResponse(body: string): MockSafeFetchSuccess {
  return {
    ok: true,
    response: {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => body,
    },
    close: closeSpy,
    evidence: {},
  };
}

function httpErrorResponse(status: number, statusText: string): MockSafeFetchSuccess {
  return {
    ok: true,
    response: {
      ok: false,
      status,
      statusText,
      text: async () => '',
    },
    close: closeSpy,
    evidence: {},
  };
}

function failure(code: string, error: string): MockSafeFetchFailure {
  return { ok: false, code, error };
}

describe('peac discover <url>: 8 scenarios', () => {
  beforeEach(() => {
    closeSpy.mockClear();
    mockSafeFetchRaw.mockReset();
    __resetLegacyWarningForTests();
    vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
  });

  it('1. happy-path well-formed peac.txt: success + parsed data + close called', async () => {
    mockSafeFetchRaw.mockResolvedValueOnce(okResponse(VALID_PEAC_TXT));
    const cmd = new DiscoverCommand();
    const result = await cmd.execute('https://example.com');

    expect(result.success).toBe(true);
    const data = result.data as {
      valid: boolean;
      data?: { version: string; defaults: { decision: string } };
      warnings?: string[];
      hints?: string[];
    };
    expect(data.valid).toBe(true);
    expect(data.data?.version).toBe('peac-policy/0.1');
    expect(data.data?.defaults.decision).toBe('deny');
    expect(data.warnings).toBeUndefined();
    expect(data.hints).toBeUndefined();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('2. malformed peac.txt: success=true, data.valid=false, errors populated, close called', async () => {
    mockSafeFetchRaw.mockResolvedValueOnce(okResponse(': :: not yaml ::: at all\n  - [unbalanced'));
    const cmd = new DiscoverCommand();
    const result = await cmd.execute('https://example.com');

    expect(result.success).toBe(true);
    const data = result.data as { valid: boolean; errors?: string[]; data?: unknown };
    expect(data.valid).toBe(false);
    expect((data.errors ?? []).length).toBeGreaterThan(0);
    expect(data.data).toBeUndefined();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('3. HTTP 5xx: success=false; close called once', async () => {
    mockSafeFetchRaw.mockResolvedValueOnce(httpErrorResponse(503, 'Service Unavailable'));
    const cmd = new DiscoverCommand();
    const result = await cmd.execute('https://example.com');

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error).toMatch(/HTTP_503|HTTP 503/);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('4. fetch timeout: success=false with timeout error code; no close call (raw.ok was false)', async () => {
    mockSafeFetchRaw.mockResolvedValueOnce(failure('E_NET_REQUEST_TIMEOUT', 'request timed out'));
    const cmd = new DiscoverCommand();
    const result = await cmd.execute('https://example.com');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/E_NET_REQUEST_TIMEOUT/);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('5. byte cap exceeded: success=false with size-cap error code; no close call', async () => {
    mockSafeFetchRaw.mockResolvedValueOnce(
      failure('E_NET_RESPONSE_TOO_LARGE', 'response body exceeded maxResponseBytes')
    );
    const cmd = new DiscoverCommand();
    const result = await cmd.execute('https://example.com');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/E_NET_RESPONSE_TOO_LARGE/);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('6. happy-path with legacy "verify:" line: success + valid + warnings + hints', async () => {
    mockSafeFetchRaw.mockResolvedValueOnce(okResponse(VALID_PEAC_TXT_WITH_LEGACY_VERIFY));
    const cmd = new DiscoverCommand();
    const result = await cmd.execute('https://example.com');

    expect(result.success).toBe(true);
    const data = result.data as { valid: boolean; warnings?: string[]; hints?: string[] };
    expect(data.valid).toBe(true);
    expect((data.warnings ?? []).some((w) => /legacy key-discovery field "verify"/.test(w))).toBe(
      true
    );
    expect((data.hints ?? []).some((h) => /peac-issuer\.json/.test(h))).toBe(true);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('7. redirect cap exceeded: success=false with too-many-redirects code; no close call', async () => {
    mockSafeFetchRaw.mockResolvedValueOnce(
      failure('E_NET_SSRF_TOO_MANY_REDIRECTS', 'too many redirects')
    );
    const cmd = new DiscoverCommand();
    const result = await cmd.execute('https://example.com');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/E_NET_SSRF_TOO_MANY_REDIRECTS/);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('rejects non-HTTP(S) URL schemes without invoking safeFetchRaw', async () => {
    const cmd = new DiscoverCommand();
    const result = await cmd.execute('ftp://example.com');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/http: or https:/);
    expect(mockSafeFetchRaw).not.toHaveBeenCalled();
  });
});
