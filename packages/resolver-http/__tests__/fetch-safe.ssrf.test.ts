// SSRF block class coverage via mocked net-node failures.
// Asserts every E_NET_SSRF_* class collapses to fetch_blocked_ssrf or
// (for redirect / dangerous-port / metadata-IP) the appropriate sibling.

import { vi, describe, it, expect, beforeEach } from 'vitest';

import {
  mockSafeFetchJson,
  mockSafeFetchJWKS,
  mockSafeFetchRaw,
  enqueue,
  resetMock,
  NET_CODES,
  type NetNodeErrorCode,
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

import { fetchJsonSafe } from '../src/fetch-safe.js';

beforeEach(() => {
  resetMock();
});

const SSRF_CASES: Array<{
  label: string;
  upstream: NetNodeErrorCode;
  expected: 'fetch_blocked_ssrf' | 'fetch_blocked_redirect' | 'fetch_blocked_dangerous_port';
}> = [
  {
    label: 'rfc1918 / private-ip rejected pre-DNS',
    upstream: NET_CODES.E_SSRF_URL_REJECTED,
    expected: 'fetch_blocked_ssrf',
  },
  {
    label: 'private IP resolved (DNS rebind class)',
    upstream: NET_CODES.E_SSRF_DNS_RESOLVED_PRIVATE,
    expected: 'fetch_blocked_ssrf',
  },
  {
    label: 'all candidate IPs blocked',
    upstream: NET_CODES.E_SSRF_ALL_IPS_BLOCKED,
    expected: 'fetch_blocked_ssrf',
  },
  {
    label: 'IPv6 zone identifier present',
    upstream: NET_CODES.E_SSRF_IPV6_ZONE_ID,
    expected: 'fetch_blocked_ssrf',
  },
  {
    label: 'invalid host string',
    upstream: NET_CODES.E_SSRF_INVALID_HOST,
    expected: 'fetch_blocked_ssrf',
  },
  {
    label: 'mixed-DNS audit blocked',
    upstream: NET_CODES.E_SSRF_MIXED_DNS_BLOCKED,
    expected: 'fetch_blocked_ssrf',
  },
  {
    label: 'mixed-DNS ack missing',
    upstream: NET_CODES.E_SSRF_MIXED_DNS_ACK_MISSING,
    expected: 'fetch_blocked_ssrf',
  },
  {
    label: 'allowCIDRs ack required but missing',
    upstream: NET_CODES.E_SSRF_ALLOWCIDRS_ACK_REQUIRED,
    expected: 'fetch_blocked_ssrf',
  },
  {
    label: 'tenant key missing (treat as ssrf-class block)',
    upstream: NET_CODES.E_TENANT_KEY_MISSING,
    expected: 'fetch_blocked_ssrf',
  },
  {
    label: 'redirect to blocked target',
    upstream: NET_CODES.E_SSRF_REDIRECT_BLOCKED,
    expected: 'fetch_blocked_redirect',
  },
  {
    label: 'too many redirects',
    upstream: NET_CODES.E_SSRF_TOO_MANY_REDIRECTS,
    expected: 'fetch_blocked_redirect',
  },
  {
    label: 'dangerous port (e.g. 25, 6379)',
    upstream: NET_CODES.E_SSRF_DANGEROUS_PORT,
    expected: 'fetch_blocked_dangerous_port',
  },
  {
    label: 'dangerous port ack missing',
    upstream: NET_CODES.E_SSRF_DANGEROUS_PORT_ACK_MISSING,
    expected: 'fetch_blocked_dangerous_port',
  },
];

describe('fetch-safe SSRF mapping', () => {
  for (const tc of SSRF_CASES) {
    it(`maps ${tc.upstream} -> ${tc.expected} (${tc.label})`, async () => {
      enqueue('safeFetchJson', { ok: false, code: tc.upstream });
      const result = await fetchJsonSafe('https://issuer.example.com/x');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(tc.expected);
      }
    });
  }
});
