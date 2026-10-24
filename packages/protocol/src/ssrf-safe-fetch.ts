/**
 * SSRF-safe fetch utility for PEAC verifiers
 *
 * Implements SSRF protection per VERIFIER-SECURITY-MODEL.md:
 * - HTTPS only
 * - Allow only global unicast addresses: every block in the IANA IPv4 and IPv6
 *   special-purpose registries is refused, including private, loopback,
 *   link-local, shared, multicast and reserved ranges; IPv4-mapped and NAT64
 *   forms are judged by the embedded IPv4 address
 * - Fail closed when DNS returns no addresses
 * - Connect only to the vetted addresses (no second resolution)
 * - Redirect limits and scheme downgrade protection
 *
 * ## Security Model: Best-Effort Protection
 *
 * **IMPORTANT**: SSRF protection is BEST-EFFORT, not a guarantee. The level of
 * protection depends on the runtime environment's capabilities. In environments
 * without DNS pre-resolution (browsers, edge workers), protection is limited to
 * URL scheme validation and response limits. Defense-in-depth: combine with
 * network-level controls (firewalls, egress filtering) in production.
 *
 * ## Hard Invariants (ALWAYS Enforced)
 *
 * These protections are enforced in ALL runtimes:
 *
 * | Invariant | Enforcement |
 * |-----------|-------------|
 * | HTTPS only | URL scheme validation before fetch |
 * | No redirects (pointer fetch) | `redirect: 'manual'` + policy check |
 * | Response size cap | Streaming with byte counter, abort on limit |
 * | Timeout | AbortController with configurable timeout |
 * | No scheme downgrade | Redirect target scheme validation |
 *
 * ## Runtime-Dependent Protections
 *
 * These protections require DNS pre-resolution capability:
 *
 * | Protection | Requires |
 * |------------|----------|
 * | Special-purpose address blocking (global unicast only) | DNS pre-resolution |
 * | Connection to the vetted address only | DNS pre-resolution + `https` module |
 *
 * ## Runtime Capability Model
 *
 * SSRF protection capabilities vary by runtime environment:
 *
 * | Runtime           | DNS Pre-Resolution | IP Blocking | Notes |
 * |-------------------|-------------------|-------------|-------|
 * | Node.js           | YES               | YES         | Resolve once, vet, connect to the vetted address |
 * | Browser           | NO                | NO          | Relies on server-side validation |
 * | Cloudflare Workers| NO                | NO          | No DNS access, relies on CF network |
 * | Deno              | NO                | NO          | dns module not available by default |
 * | Bun               | YES               | YES         | Compatible with Node.js dns module |
 *
 * Use `getSSRFCapabilities()` to detect runtime capabilities.
 *
 * @packageDocumentation
 */

import type { LookupAddress, LookupOptions } from 'dns';
import { VERIFIER_LIMITS, VERIFIER_NETWORK } from '@peac/kernel';
import { classifyAddress } from './_internal/address-policy.js';

// ---------------------------------------------------------------------------
// SSRF Capability Model
// ---------------------------------------------------------------------------

/**
 * Runtime environment where SSRF protection is running
 */
export type SSRFRuntime =
  | 'node'
  | 'bun'
  | 'deno'
  | 'browser'
  | 'cloudflare-workers'
  | 'edge-generic'
  | 'unknown';

/**
 * SSRF protection capabilities available in the current runtime
 *
 * These capabilities determine what security measures can be applied:
 * - `dnsPreResolution`: Can resolve hostnames to IPs before connecting
 * - `ipBlocking`: Can inspect and block connections based on resolved IPs
 * - `networkIsolation`: Runtime provides network-level isolation (e.g., CF Workers)
 *
 * When `dnsPreResolution` is false, SSRF protection is limited to:
 * - URL scheme validation (HTTPS only)
 * - Hostname pattern matching (if configured)
 * - Response size limits
 * - Timeout enforcement
 *
 * This is a defense-in-depth model: even without DNS pre-resolution,
 * multiple layers of protection remain active.
 */
export interface SSRFCapabilities {
  /** Detected runtime environment */
  runtime: SSRFRuntime;
  /** Can resolve DNS before making HTTP connection */
  dnsPreResolution: boolean;
  /** Can block connections based on resolved IP addresses */
  ipBlocking: boolean;
  /** Runtime provides network-level isolation */
  networkIsolation: boolean;
  /** Human-readable description of protection level */
  protectionLevel: 'full' | 'partial' | 'minimal';
  /** Advisory notes for operators */
  notes: string[];
}

/**
 * Cached capabilities (detected once per process)
 */
let cachedCapabilities: SSRFCapabilities | null = null;

/**
 * Detect SSRF protection capabilities for the current runtime
 *
 * This function performs runtime detection and returns a capability object
 * that describes what SSRF protections are available.
 *
 * @returns SSRF capabilities for the current runtime
 *
 * @example
 * ```typescript
 * const caps = getSSRFCapabilities();
 * if (!caps.dnsPreResolution) {
 *   console.warn('Running without DNS pre-resolution; SSRF protection is limited');
 * }
 * ```
 */
export function getSSRFCapabilities(): SSRFCapabilities {
  if (cachedCapabilities) {
    return cachedCapabilities;
  }

  cachedCapabilities = detectCapabilities();
  return cachedCapabilities;
}

/**
 * Internal: Detect runtime capabilities
 */
function detectCapabilities(): SSRFCapabilities {
  // Check for Node.js
  if (typeof process !== 'undefined' && process.versions?.node) {
    return {
      runtime: 'node',
      dnsPreResolution: true,
      ipBlocking: true,
      networkIsolation: false,
      protectionLevel: 'full',
      notes: [
        'Hostnames are resolved once via the Node.js dns module',
        'Every resolved address must be a global unicast address',
        'The connection is made only to a vetted address',
      ],
    };
  }

  // Check for Bun
  if (typeof process !== 'undefined' && process.versions?.bun) {
    return {
      runtime: 'bun',
      dnsPreResolution: true,
      ipBlocking: true,
      networkIsolation: false,
      protectionLevel: 'full',
      notes: [
        'Full SSRF protection available via Bun dns compatibility',
        'DNS resolution checked before HTTP connection',
      ],
    };
  }

  // Check for Deno
  if (typeof globalThis !== 'undefined' && 'Deno' in globalThis) {
    return {
      runtime: 'deno',
      dnsPreResolution: false,
      ipBlocking: false,
      networkIsolation: false,
      protectionLevel: 'partial',
      notes: [
        'DNS pre-resolution not available in Deno by default',
        'SSRF protection limited to URL validation and response limits',
        'Consider using Deno.connect with hostname resolution for enhanced protection',
      ],
    };
  }

  // Check for Cloudflare Workers
  if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as Record<string, unknown>).caches !== 'undefined' &&
    typeof (globalThis as Record<string, unknown>).HTMLRewriter !== 'undefined'
  ) {
    return {
      runtime: 'cloudflare-workers',
      dnsPreResolution: false,
      ipBlocking: false,
      networkIsolation: true,
      protectionLevel: 'partial',
      notes: [
        'Cloudflare Workers provide network-level isolation',
        'DNS pre-resolution not available in Workers runtime',
        'CF network blocks many SSRF vectors at infrastructure level',
        'SSRF protection supplemented by URL validation and response limits',
      ],
    };
  }

  // Check for browser environment
  // Use globalThis to avoid DOM type references
  const g = globalThis as Record<string, unknown>;
  if (typeof g.window !== 'undefined' || typeof g.document !== 'undefined') {
    return {
      runtime: 'browser',
      dnsPreResolution: false,
      ipBlocking: false,
      networkIsolation: false,
      protectionLevel: 'minimal',
      notes: [
        'Browser environment detected; DNS pre-resolution not available',
        'SSRF protection limited to URL scheme validation',
        'Consider validating URLs server-side before browser fetch',
        'Same-origin policy provides some protection against SSRF',
      ],
    };
  }

  // Generic edge runtime
  return {
    runtime: 'edge-generic',
    dnsPreResolution: false,
    ipBlocking: false,
    networkIsolation: false,
    protectionLevel: 'partial',
    notes: [
      'Edge runtime detected; DNS pre-resolution may not be available',
      'SSRF protection limited to URL validation and response limits',
      'Verify runtime provides additional network-level protections',
    ],
  };
}

/**
 * Reset cached capabilities (for testing)
 * @internal
 */
export function resetSSRFCapabilitiesCache(): void {
  cachedCapabilities = null;
}

/**
 * SSRF fetch options
 */
export interface SSRFFetchOptions {
  /** Timeout in milliseconds (default: VERIFIER_LIMITS.fetchTimeoutMs) */
  timeoutMs?: number;
  /** Maximum response size in bytes (default: VERIFIER_LIMITS.maxResponseBytes) */
  maxBytes?: number;
  /** Maximum redirects to follow (default: 0 for SSRF safety) */
  maxRedirects?: number;
  /** Allow redirects (default: VERIFIER_NETWORK.allowRedirects) */
  allowRedirects?: boolean;
  /**
   * Allow cross-origin redirects (default: true for CDN compatibility).
   * When true, redirects to different origins are allowed if the target passes SSRF checks.
   * When false, redirects must stay within the same origin.
   */
  allowCrossOriginRedirects?: boolean;
  /**
   * How to handle DNS resolution failures (default: 'block' for fail-closed security).
   * - 'block': Treat DNS failure as blocked (fail-closed, recommended)
   * - 'fail': Return network_error and allow caller to decide
   */
  dnsFailureBehavior?: 'block' | 'fail';
  /** Custom headers to include */
  headers?: Record<string, string>;
}

/**
 * SSRF fetch result
 */
export interface SSRFFetchResult {
  /** Whether the fetch succeeded */
  ok: true;
  /** Response status code */
  status: number;
  /** Response body as string */
  body: string;
  /**
   * Raw response bytes for digest computation.
   * Use this for computing digests to avoid encoding round-trip issues.
   */
  rawBytes: Uint8Array;
  /** Response content type */
  contentType?: string;
}

/**
 * SSRF fetch error
 */
export interface SSRFFetchError {
  /** Fetch failed */
  ok: false;
  /** Error reason code */
  reason:
    | 'invalid_url'
    | 'not_https'
    | 'private_ip'
    | 'loopback'
    | 'link_local'
    | 'dns_failure'
    | 'too_many_redirects'
    | 'scheme_downgrade'
    | 'cross_origin_redirect'
    | 'timeout'
    | 'response_too_large'
    | 'jwks_too_many_keys'
    | 'network_error';
  /** Human-readable error message */
  message: string;
  /** Blocked URL (if applicable) */
  blockedUrl?: string;
}

/**
 * Check if an IP address is outside the allowed address space.
 *
 * Only global unicast addresses outside the IANA IPv4 and IPv6 special-purpose
 * blocks are allowed. IPv4-mapped and NAT64 (64:ff9b::/96) IPv6 addresses are
 * judged by the embedded IPv4 address; input that does not parse as an address
 * is blocked.
 */
export function isBlockedIP(
  ip: string
): { blocked: true; reason: 'private_ip' | 'loopback' | 'link_local' } | { blocked: false } {
  const verdict = classifyAddress(ip);
  return verdict.allowed ? { blocked: false } : { blocked: true, reason: verdict.reason };
}

/**
 * DNS resolution result
 */
interface DNSResolutionResult {
  /** Whether resolution succeeded */
  ok: true;
  /** Resolved IP addresses */
  ips: string[];
  /** Whether this is a browser environment (no pre-resolution possible) */
  browser: boolean;
}

/**
 * DNS resolution failure
 */
interface DNSResolutionFailure {
  /** Resolution failed */
  ok: false;
  /** Error message */
  message: string;
}

/**
 * Resolve hostname to IP addresses (platform-specific)
 *
 * In Node.js environments, this uses dns.resolve.
 * In browser environments, we cannot check IPs before fetch.
 */
async function resolveHostname(
  hostname: string
): Promise<DNSResolutionResult | DNSResolutionFailure> {
  // Node.js environment detection
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const dns = await import('dns');
      const { promisify } = await import('util');
      const resolve4 = promisify(dns.resolve4);
      const resolve6 = promisify(dns.resolve6);

      const results: string[] = [];
      let ipv4Error: Error | null = null;
      let ipv6Error: Error | null = null;

      try {
        const ipv4 = await resolve4(hostname);
        results.push(...ipv4);
      } catch (err) {
        ipv4Error = err as Error;
      }

      try {
        const ipv6 = await resolve6(hostname);
        results.push(...ipv6);
      } catch (err) {
        ipv6Error = err as Error;
      }

      // If we got at least one result, resolution succeeded
      if (results.length > 0) {
        return { ok: true, ips: results, browser: false };
      }

      // Both failed - this is a DNS failure
      if (ipv4Error && ipv6Error) {
        return {
          ok: false,
          message: `DNS resolution failed for ${hostname}: ${ipv4Error.message}`,
        };
      }

      // An empty answer leaves nothing to vet: fail closed
      return {
        ok: false,
        message: `DNS resolution returned no addresses for ${hostname}`,
      };
    } catch (err) {
      // DNS module import failed or other error
      return {
        ok: false,
        message: `DNS resolution error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Browser environment: cannot pre-resolve, return empty
  // SSRF check will rely on server-side validation
  return { ok: true, ips: [], browser: true };
}

const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/**
 * GET a URL over HTTPS, connecting only to the given vetted addresses.
 *
 * The hostname is never resolved again: the socket lookup returns the vetted
 * addresses, while the URL host is still used for the Host header, TLS SNI and
 * certificate verification. Redirects are not followed.
 */
async function fetchFromVettedAddresses(
  url: string,
  addresses: readonly string[],
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<Response> {
  const https = await import('https');
  const entries: LookupAddress[] = addresses.map((address) => ({
    address,
    family: address.includes(':') ? 6 : 4,
  }));

  const lookup = (
    _hostname: string,
    options: LookupOptions,
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number
    ) => void
  ): void => {
    if (options.all) {
      callback(null, entries);
    } else {
      callback(null, entries[0].address, entries[0].family);
    }
  };

  return new Promise<Response>((resolve, reject) => {
    const req = https.request(
      new URL(url),
      { method: 'GET', headers, lookup, agent: false, signal },
      (res) => {
        try {
          const status = res.statusCode ?? 0;
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(res.headers)) {
            if (value === undefined) continue;
            if (Array.isArray(value)) {
              for (const item of value) responseHeaders.append(name, item);
            } else {
              responseHeaders.set(name, value);
            }
          }

          if (NULL_BODY_STATUSES.has(status)) {
            res.resume();
            resolve(new Response(null, { status, headers: responseHeaders }));
            return;
          }

          let settled = false;
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              res.on('data', (chunk: Buffer) => {
                if (settled) return;
                controller.enqueue(new Uint8Array(chunk));
                if ((controller.desiredSize ?? 0) <= 0) res.pause();
              });
              res.on('end', () => {
                if (settled) return;
                settled = true;
                controller.close();
              });
              res.on('error', (err) => {
                if (settled) return;
                settled = true;
                controller.error(err);
              });
            },
            pull() {
              res.resume();
            },
            cancel() {
              settled = true;
              res.destroy();
            },
          });
          resolve(new Response(body, { status, headers: responseHeaders }));
        } catch (err) {
          res.destroy();
          reject(err);
        }
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * Perform an SSRF-safe fetch
 *
 * This function implements the SSRF protection algorithm from VERIFIER-SECURITY-MODEL.md:
 * 1. Parse URL; reject if not https://
 * 2. Resolve hostname to IP(s); an empty answer is a failure
 * 3. For each IP: reject unless it is a global unicast address
 * 4. Perform the request with timeout, connecting only to the vetted IPs
 * 5. On redirect: increment counter, reject if > max, apply checks to redirect URL
 * 6. Validate response size
 *
 * @param url - URL to fetch (must be https://)
 * @param options - Fetch options
 * @returns Fetch result or error
 */
export async function ssrfSafeFetch(
  url: string,
  options: SSRFFetchOptions = {}
): Promise<SSRFFetchResult | SSRFFetchError> {
  const {
    timeoutMs = VERIFIER_LIMITS.fetchTimeoutMs,
    maxBytes = VERIFIER_LIMITS.maxResponseBytes,
    maxRedirects = 0,
    allowRedirects = VERIFIER_NETWORK.allowRedirects,
    allowCrossOriginRedirects = true, // Default: allow for CDN compatibility
    dnsFailureBehavior = 'block', // Default: fail-closed for security
    headers = {},
  } = options;

  // Step 1: Parse and validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      ok: false,
      reason: 'invalid_url',
      message: `Invalid URL: ${url}`,
      blockedUrl: url,
    };
  }

  // Step 1b: Require HTTPS
  if (parsedUrl.protocol !== 'https:') {
    return {
      ok: false,
      reason: 'not_https',
      message: `URL must use HTTPS: ${url}`,
      blockedUrl: url,
    };
  }

  // Step 2: Resolve hostname to IPs
  const dnsResult = await resolveHostname(parsedUrl.hostname);

  // Step 2b: Handle DNS resolution failure (fail-closed by default)
  if (!dnsResult.ok) {
    if (dnsFailureBehavior === 'block') {
      return {
        ok: false,
        reason: 'dns_failure',
        message: `DNS resolution blocked: ${dnsResult.message}`,
        blockedUrl: url,
      };
    }
    // dnsFailureBehavior === 'fail': return network_error
    return {
      ok: false,
      reason: 'network_error',
      message: dnsResult.message,
      blockedUrl: url,
    };
  }

  // Step 3: Check each resolved IP (if not browser environment)
  if (!dnsResult.browser) {
    for (const ip of dnsResult.ips) {
      const blockResult = isBlockedIP(ip);
      if (blockResult.blocked) {
        return {
          ok: false,
          reason: blockResult.reason,
          message: `Blocked ${blockResult.reason} address: ${ip} for ${url}`,
          blockedUrl: url,
        };
      }
    }
  }

  // Step 4: Perform fetch with timeout, connecting only to vetted addresses
  let redirectCount = 0;
  let currentUrl = url;
  let vettedAddresses: readonly string[] | null = dnsResult.browser ? null : dnsResult.ips;
  const originalOrigin = parsedUrl.origin;

  while (true) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const requestHeaders = {
        Accept: 'application/json, text/plain',
        ...headers,
      };
      const response =
        vettedAddresses === null
          ? await fetch(currentUrl, {
              headers: requestHeaders,
              signal: controller.signal,
              redirect: 'manual', // Handle redirects manually for security
            })
          : await fetchFromVettedAddresses(
              currentUrl,
              vettedAddresses,
              requestHeaders,
              controller.signal
            );

      clearTimeout(timeoutId);

      // Step 5: Handle redirects
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');

        if (!location) {
          return {
            ok: false,
            reason: 'network_error',
            message: `Redirect without Location header from ${currentUrl}`,
          };
        }

        // Check redirect policy
        if (!allowRedirects) {
          return {
            ok: false,
            reason: 'too_many_redirects',
            message: `Redirects not allowed: ${currentUrl} -> ${location}`,
            blockedUrl: location,
          };
        }

        // Increment redirect counter
        redirectCount++;
        if (redirectCount > maxRedirects) {
          return {
            ok: false,
            reason: 'too_many_redirects',
            message: `Too many redirects (${redirectCount} > ${maxRedirects})`,
            blockedUrl: location,
          };
        }

        // Resolve redirect URL
        let redirectUrl: URL;
        try {
          redirectUrl = new URL(location, currentUrl);
        } catch {
          return {
            ok: false,
            reason: 'invalid_url',
            message: `Invalid redirect URL: ${location}`,
            blockedUrl: location,
          };
        }

        // Check for scheme downgrade (https -> http)
        if (redirectUrl.protocol !== 'https:') {
          return {
            ok: false,
            reason: 'scheme_downgrade',
            message: `HTTPS to HTTP downgrade not allowed: ${currentUrl} -> ${redirectUrl.href}`,
            blockedUrl: redirectUrl.href,
          };
        }

        // Check for cross-origin redirects (configurable for CDN compatibility)
        if (redirectUrl.origin !== originalOrigin && !allowCrossOriginRedirects) {
          return {
            ok: false,
            reason: 'cross_origin_redirect',
            message: `Cross-origin redirect not allowed: ${originalOrigin} -> ${redirectUrl.origin}`,
            blockedUrl: redirectUrl.href,
          };
        }

        // Check redirect target IPs (DNS resolution + SSRF checks)
        const redirectDnsResult = await resolveHostname(redirectUrl.hostname);

        // Handle DNS failure for redirect target
        if (!redirectDnsResult.ok) {
          if (dnsFailureBehavior === 'block') {
            return {
              ok: false,
              reason: 'dns_failure',
              message: `Redirect DNS resolution blocked: ${redirectDnsResult.message}`,
              blockedUrl: redirectUrl.href,
            };
          }
          return {
            ok: false,
            reason: 'network_error',
            message: redirectDnsResult.message,
            blockedUrl: redirectUrl.href,
          };
        }

        // Check redirect target IPs for SSRF (if not browser environment)
        if (!redirectDnsResult.browser) {
          for (const ip of redirectDnsResult.ips) {
            const blockResult = isBlockedIP(ip);
            if (blockResult.blocked) {
              return {
                ok: false,
                reason: blockResult.reason,
                message: `Redirect to blocked ${blockResult.reason} address: ${ip}`,
                blockedUrl: redirectUrl.href,
              };
            }
          }
        }

        currentUrl = redirectUrl.href;
        vettedAddresses = redirectDnsResult.browser ? null : redirectDnsResult.ips;
        continue;
      }

      // Step 6: Validate response size
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > maxBytes) {
        return {
          ok: false,
          reason: 'response_too_large',
          message: `Response too large: ${contentLength} bytes > ${maxBytes} max`,
        };
      }

      // Read response body with size limit
      const reader = response.body?.getReader();
      if (!reader) {
        const body = await response.text();
        if (body.length > maxBytes) {
          return {
            ok: false,
            reason: 'response_too_large',
            message: `Response too large: ${body.length} bytes > ${maxBytes} max`,
          };
        }
        // Convert body back to bytes for rawBytes (fallback path)
        const rawBytes = new TextEncoder().encode(body);
        return {
          ok: true,
          status: response.status,
          body,
          rawBytes,
          contentType: response.headers.get('content-type') ?? undefined,
        };
      }

      // Stream with size limit
      const chunks: Uint8Array[] = [];
      let totalSize = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalSize += value.length;
        if (totalSize > maxBytes) {
          reader.cancel();
          return {
            ok: false,
            reason: 'response_too_large',
            message: `Response too large: ${totalSize} bytes > ${maxBytes} max`,
          };
        }

        chunks.push(value);
      }

      // Concatenate chunks into raw bytes (preserve original bytes for digest)
      const rawBytes = chunks.reduce((acc, chunk) => {
        const result = new Uint8Array(acc.length + chunk.length);
        result.set(acc);
        result.set(chunk, acc.length);
        return result;
      }, new Uint8Array());

      // Decode to string for body
      const body = new TextDecoder().decode(rawBytes);

      return {
        ok: true,
        status: response.status,
        body,
        rawBytes,
        contentType: response.headers.get('content-type') ?? undefined,
      };
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError' || err.message.includes('timeout')) {
          return {
            ok: false,
            reason: 'timeout',
            message: `Fetch timeout after ${timeoutMs}ms: ${currentUrl}`,
          };
        }
      }

      return {
        ok: false,
        reason: 'network_error',
        message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

/**
 * Convenience function to fetch JWKS with SSRF protection
 */
export async function fetchJWKSSafe(
  jwksUrl: string,
  options?: Omit<SSRFFetchOptions, 'maxBytes'>
): Promise<SSRFFetchResult | SSRFFetchError> {
  return ssrfSafeFetch(jwksUrl, {
    ...options,
    maxBytes: VERIFIER_LIMITS.maxJwksBytes,
    headers: {
      Accept: 'application/json',
      ...options?.headers,
    },
  });
}

/**
 * Convenience function to fetch pointer target with SSRF protection
 */
export async function fetchPointerSafe(
  pointerUrl: string,
  options?: Omit<SSRFFetchOptions, 'maxBytes'>
): Promise<SSRFFetchResult | SSRFFetchError> {
  return ssrfSafeFetch(pointerUrl, {
    ...options,
    maxBytes: VERIFIER_LIMITS.maxReceiptBytes,
    headers: {
      Accept: 'application/jose, application/json',
      ...options?.headers,
    },
  });
}
