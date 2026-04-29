// Test helpers for mocking @peac/net-node responses.
//
// Each test file does:
//
//   import { mockSafeFetchJson, mockSafeFetchJWKS, mockSafeFetchRaw,
//            enqueue, resetMock, getLastOptions, NET_CODES } from './_helpers/mock-net-node.js';
//   import { vi } from 'vitest';
//
//   vi.mock('@peac/net-node', async () => {
//     const actual = await vi.importActual<typeof import('@peac/net-node')>('@peac/net-node');
//     return {
//       ...actual,
//       safeFetchJson: mockSafeFetchJson,
//       safeFetchJWKS: mockSafeFetchJWKS,
//       safeFetchRaw: mockSafeFetchRaw,
//     };
//   });
//
// This helper deliberately does NOT import @peac/net-node so it is unaffected
// by the test's vi.mock interception. SAFE_FETCH_ERROR_CODES values are
// re-declared as string-literal constants below; the actual values are stable
// public API of net-node and tests assert against them directly.
//
// IMPORTANT: this helper MUST NOT import the protocol package. Parity test
// files (Commit 4) MAY import the protocol package; helpers under _helpers/
// MUST NOT.

import { vi } from 'vitest';

export const NET_CODES = {
  E_SSRF_URL_REJECTED: 'E_NET_SSRF_URL_REJECTED',
  E_SSRF_DNS_RESOLVED_PRIVATE: 'E_NET_SSRF_DNS_RESOLVED_PRIVATE',
  E_SSRF_ALL_IPS_BLOCKED: 'E_NET_SSRF_ALL_IPS_BLOCKED',
  E_SSRF_REDIRECT_BLOCKED: 'E_NET_SSRF_REDIRECT_BLOCKED',
  E_SSRF_TOO_MANY_REDIRECTS: 'E_NET_SSRF_TOO_MANY_REDIRECTS',
  E_SSRF_ALLOWCIDRS_ACK_REQUIRED: 'E_NET_SSRF_ALLOWCIDRS_ACK_REQUIRED',
  E_SSRF_IPV6_ZONE_ID: 'E_NET_SSRF_IPV6_ZONE_ID',
  E_SSRF_INVALID_HOST: 'E_NET_SSRF_INVALID_HOST',
  E_SSRF_MIXED_DNS_BLOCKED: 'E_NET_SSRF_MIXED_DNS_BLOCKED',
  E_SSRF_MIXED_DNS_ACK_MISSING: 'E_NET_SSRF_MIXED_DNS_ACK_MISSING',
  E_SSRF_DANGEROUS_PORT: 'E_NET_SSRF_DANGEROUS_PORT',
  E_SSRF_DANGEROUS_PORT_ACK_MISSING: 'E_NET_SSRF_DANGEROUS_PORT_ACK_MISSING',
  E_TENANT_KEY_MISSING: 'E_NET_TENANT_KEY_MISSING',
  E_DNS_RESOLUTION_FAILED: 'E_NET_DNS_RESOLUTION_FAILED',
  E_REQUEST_TIMEOUT: 'E_NET_REQUEST_TIMEOUT',
  E_DNS_TIMEOUT: 'E_NET_DNS_TIMEOUT',
  E_CONNECT_TIMEOUT: 'E_NET_CONNECT_TIMEOUT',
  E_HEADERS_TIMEOUT: 'E_NET_HEADERS_TIMEOUT',
  E_BODY_TIMEOUT: 'E_NET_BODY_TIMEOUT',
  E_NETWORK_ERROR: 'E_NET_NETWORK_ERROR',
  E_METHOD_NOT_ALLOWED: 'E_NET_METHOD_NOT_ALLOWED',
  E_RESPONSE_TOO_LARGE: 'E_NET_RESPONSE_TOO_LARGE',
  E_PARSE_ERROR: 'E_NET_PARSE_ERROR',
} as const;

export type NetNodeErrorCode = (typeof NET_CODES)[keyof typeof NET_CODES];

export interface MockSuccess {
  ok: true;
  status: number;
  contentType?: string;
  body?: unknown;
  bytes?: Uint8Array;
  responseBytes?: number;
}

export interface MockFailure {
  ok: false;
  code: NetNodeErrorCode;
  error?: string;
  cause?: unknown;
  stack?: string;
  upstreamPayload?: unknown;
}

export type MockResponse = MockSuccess | MockFailure;

type Fn = 'safeFetchJson' | 'safeFetchJWKS' | 'safeFetchRaw';

interface QueueEntry {
  fn: Fn;
  response: MockResponse;
}

const queue: QueueEntry[] = [];
const lastOptionsRef: { value: unknown } = { value: undefined };

export function resetMock(): void {
  queue.length = 0;
  lastOptionsRef.value = undefined;
}

export function enqueue(fn: Fn, response: MockResponse): void {
  queue.push({ fn, response });
}

export function getLastOptions(): unknown {
  return lastOptionsRef.value;
}

function buildHeaders(contentType: string | undefined): Headers {
  const h = new Headers();
  if (contentType) h.set('content-type', contentType);
  return h;
}

function asBytes(input: MockSuccess): Uint8Array {
  if (input.bytes) return input.bytes;
  const text = typeof input.body === 'string' ? input.body : JSON.stringify(input.body ?? {});
  return new TextEncoder().encode(text);
}

function asResponse(input: MockSuccess): { response: Response; bytes: Uint8Array } {
  const bytes = asBytes(input);
  const response = new Response(bytes, {
    status: input.status,
    headers: buildHeaders(input.contentType),
  });
  return { response, bytes };
}

function pop(fn: Fn): MockResponse {
  const next = queue.shift();
  if (!next) {
    throw new Error(
      `[mock-net-node] no queued response for ${fn}; tests must enqueue before invoking fetch`
    );
  }
  if (next.fn !== fn) {
    throw new Error(
      `[mock-net-node] queue mismatch: expected ${next.fn} next, but ${fn} was called`
    );
  }
  return next.response;
}

export const mockSafeFetchJson = vi.fn(async (_url: string, opts?: unknown) => {
  lastOptionsRef.value = opts;
  const next = pop('safeFetchJson');
  if (!next.ok) {
    const err: Record<string, unknown> = {
      ok: false,
      error: next.error ?? 'net-node failure (mock)',
      code: next.code,
    };
    if (next.cause !== undefined) err.cause = next.cause;
    if (next.stack !== undefined) err.stack = next.stack;
    if (next.upstreamPayload !== undefined) err.upstreamPayload = next.upstreamPayload;
    return err;
  }
  const { response, bytes } = asResponse(next);
  // body represents the already-parsed value of result.data (matches real
  // safeFetchJson semantics: JSON parse happens upstream of resolver-http).
  // Tests that want to simulate JSON-parse failure should use
  // { ok: false, code: NET_CODES.E_PARSE_ERROR }. An explicit body field
  // (including null) is honored verbatim; the empty-object fallback fires
  // only when body is absent.
  return {
    ok: true,
    response,
    data: 'body' in next ? next.body : {},
    evidence: { response_bytes: next.responseBytes ?? bytes.byteLength },
  };
});

export const mockSafeFetchJWKS = vi.fn(async (_url: string, opts?: unknown) => {
  lastOptionsRef.value = opts;
  const next = pop('safeFetchJWKS');
  if (!next.ok) {
    const err: Record<string, unknown> = {
      ok: false,
      error: next.error ?? 'net-node JWKS failure (mock)',
      code: next.code,
    };
    if (next.cause !== undefined) err.cause = next.cause;
    if (next.stack !== undefined) err.stack = next.stack;
    return err;
  }
  const { response, bytes } = asResponse(next);
  // body represents the already-parsed value (matches real safeFetchJWKS
  // semantics). An explicit body (including null) is honored verbatim; the
  // { keys: [] } fallback fires only when body is absent.
  const data = 'body' in next ? next.body : { keys: [] };
  return {
    ok: true,
    response,
    data,
    evidence: { response_bytes: next.responseBytes ?? bytes.byteLength },
  };
});

export const mockSafeFetchRaw = vi.fn(async (_url: string, opts?: unknown) => {
  lastOptionsRef.value = opts;
  const next = pop('safeFetchRaw');
  if (!next.ok) {
    const err: Record<string, unknown> = {
      ok: false,
      error: next.error ?? 'net-node raw failure (mock)',
      code: next.code,
    };
    if (next.cause !== undefined) err.cause = next.cause;
    if (next.stack !== undefined) err.stack = next.stack;
    return err;
  }
  const { response } = asResponse(next);
  return {
    ok: true,
    response,
    close: async () => undefined,
    evidence: { response_bytes: next.responseBytes ?? asBytes(next).byteLength },
  };
});
