/**
 * Enhanced verifier implementation for v0.9.13.1 spec
 * POST /verify {receipt, resource} → {valid, claims, policyHash, reconstructed, inputs, timing}
 */

import { promises as dns } from 'node:dns';
import { verifyReceipt, canonicalPolicyHash } from '@peac/core';
import type { VerifyKeySet } from '@peac/core';
import { discover } from '@peac/disc';
import type { HttpStatus } from './types.js';
import { PROBLEM_TYPES } from './index.js';

export interface V13VerifyRequest {
  receipt: string;
  resource?: string;
}

export interface V13VerifyResponse {
  valid: boolean;
  claims?: any;
  policyHash?: string;
  reconstructed?: {
    hash?: string;
    matches?: boolean;
  };
  inputs?: Array<{
    type: 'aipref' | 'agent-permissions' | 'peac.txt';
    url: string;
    etag?: string | null;
  }>;
  timing: {
    total_ms: number;
    fetch_ms: number;
    hash_ms: number;
  };
  meta?: {
    request_id?: string;
    trace_id?: string;
  };
}

export interface VerifierOptions {
  timeout?: number;
  allowPrivateNet?: boolean;
  maxInputSize?: number;
  maxRedirects?: number;
  requestId?: string;
  traceId?: string;
}

export class VerifierV13 {
  private cache = new Map<string, { data: any; etag?: string; expires: number }>();

  async verify(
    request: V13VerifyRequest,
    options: VerifierOptions = {}
  ): Promise<{ status: HttpStatus; body: V13VerifyResponse | any }> {
    const startTime = Date.now();
    let fetchTime = 0;
    let hashTime = 0;

    const buildTiming = () => ({
      total_ms: Date.now() - startTime,
      fetch_ms: fetchTime,
      hash_ms: hashTime,
    });

    const buildMeta = () => ({
      ...(options.requestId && { request_id: options.requestId }),
      ...(options.traceId && { trace_id: options.traceId }),
    });

    try {
      // Validate request
      if (!request.receipt || typeof request.receipt !== 'string') {
        return {
          status: 400,
          body: {
            type: PROBLEM_TYPES.INVALID_REQUEST,
            title: 'Invalid Request',
            status: 400,
            detail: 'receipt field is required and must be a string',
            timing: buildTiming(),
            meta: buildMeta(),
          },
        };
      }

      // Parse verification keys with fail-closed logic
      function parseKeyset(env = process.env.PEAC_VERIFY_KEYS): VerifyKeySet {
        if (!env) return {};
        try {
          const ks = JSON.parse(env);
          return ks && typeof ks === 'object' ? (ks as VerifyKeySet) : {};
        } catch {
          return {}; // invalid JSON
        }
      }

      const keys = parseKeyset();
      if (!keys || Object.keys(keys).length === 0) {
        return {
          status: 422,
          body: {
            type: PROBLEM_TYPES.MISCONFIGURED_VERIFIER,
            title: 'Missing Verification Keys',
            status: 422,
            detail: 'PEAC_VERIFY_KEYS is not set or invalid.',
            timing: buildTiming(),
            meta: buildMeta(),
          },
        };
      }

      // Verify receipt signature using v0.9.14 core function
      let payload;
      try {
        ({ payload } = await verifyReceipt(request.receipt, keys));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';

        // Map specific error types to problem types
        if (errorMsg.includes('Expired receipt')) {
          return {
            status: 422,
            body: {
              type: PROBLEM_TYPES.EXPIRED_RECEIPT,
              title: 'Expired Receipt',
              status: 422,
              detail: errorMsg,
              timing: buildTiming(),
              meta: buildMeta(),
            },
          };
        }

        return {
          status: 422,
          body: {
            type: PROBLEM_TYPES.INVALID_SIGNATURE,
            title: 'Invalid Signature',
            status: 422,
            detail: errorMsg,
            timing: buildTiming(),
            meta: buildMeta(),
          },
        };
      }

      const response: V13VerifyResponse = {
        valid: true, // reaching here means verification passed
        claims: payload,
        timing: buildTiming(),
        meta: buildMeta(),
      };

      // If resource is provided, discover policies and recompute hash
      if (request.resource) {
        try {
          const fetchStart = Date.now();
          await this.addPolicyValidation(request.resource, response, options);
          fetchTime = Date.now() - fetchStart;

          // Update timing with fetch time
          response.timing = buildTiming();
        } catch (error) {
          // Policy validation errors don't invalidate the receipt itself
          response.reconstructed = {
            hash: '',
            matches: false,
          };
          response.timing = buildTiming();
        }
      }

      return {
        status: 200,
        body: response,
      };
    } catch (error) {
      return {
        status: 500,
        body: {
          type: PROBLEM_TYPES.PROCESSING_ERROR,
          title: 'Processing Error',
          status: 500,
          detail: error instanceof Error ? error.message : 'Unknown error',
          timing: buildTiming(),
          meta: buildMeta(),
        },
      };
    }
  }

  private async addPolicyValidation(
    resource: string,
    response: V13VerifyResponse,
    options: VerifierOptions
  ) {
    const inputs: V13VerifyResponse['inputs'] = [];
    const totalTimeout = Math.min(options.timeout || 250, 250); // Total ≤ 250ms
    const startTime = Date.now();

    // Apply SSRF guards
    if (!(await this.isAllowedUrl(resource, options))) {
      throw new Error('URL not allowed by security policy');
    }

    // Helper to check remaining time budget
    const checkTimeLimit = () => {
      if (Date.now() - startTime > totalTimeout) {
        throw new Error('Total time budget exceeded');
      }
    };

    // Discover peac.txt with caching
    try {
      checkTimeLimit();
      const peacUrl = new URL('/.well-known/peac.txt', resource).toString();
      const cached = this.getCachedResult(peacUrl);

      if (cached) {
        inputs.push({
          type: 'peac.txt',
          url: peacUrl,
          etag: cached.etag || null,
        });
      } else {
        const peacResult = await discover(resource);
        this.setCachedResult(peacUrl, peacResult, null);
        inputs.push({
          type: 'peac.txt',
          url: peacUrl,
          etag: null,
        });
      }
    } catch {
      inputs.push({
        type: 'peac.txt',
        url: new URL('/.well-known/peac.txt', resource).toString(),
        etag: null,
      });
    }

    // Check AIPREF headers with caching
    try {
      checkTimeLimit();
      const cached = this.getCachedResult(resource);

      let aiprefResult;
      let etag = null;

      if (cached) {
        // Use cached result and send If-None-Match if ETag available
        const headers = cached.etag ? { 'If-None-Match': cached.etag } : undefined;
        try {
          aiprefResult = await this.fetchWithLimits(resource, {
            method: 'HEAD',
            timeout: 150,
            headers,
          });
          if (aiprefResult.status === 304) {
            // Not modified, use cached data
            aiprefResult = cached.data;
            etag = cached.etag;
          } else {
            // Updated, store new result
            etag = aiprefResult.headers.get('etag');
            this.setCachedResult(resource, aiprefResult, etag);
          }
        } catch {
          // Fallback to cached data on fetch error
          aiprefResult = cached.data;
          etag = cached.etag;
        }
      } else {
        aiprefResult = await this.fetchWithLimits(resource, {
          method: 'HEAD',
          timeout: 150,
        });
        etag = aiprefResult.headers.get('etag');
        this.setCachedResult(resource, aiprefResult, etag);
      }

      inputs.push({
        type: 'aipref',
        url: resource,
        etag,
      });
    } catch {
      inputs.push({
        type: 'aipref',
        url: resource,
        etag: null,
      });
    }

    // Check agent-permissions with caching
    try {
      checkTimeLimit();
      const htmlCacheKey = `${resource}:html`;
      const cached = this.getCachedResult(htmlCacheKey);

      let htmlResponse;
      let etag = null;

      if (cached) {
        // Use cached result and send If-None-Match if ETag available
        const headers = cached.etag ? { 'If-None-Match': cached.etag } : undefined;
        try {
          htmlResponse = await this.fetchWithLimits(resource, {
            timeout: 150,
            headers,
          });
          if (htmlResponse.status === 304) {
            // Not modified, use cached data
            htmlResponse = cached.data;
            etag = cached.etag;
          } else {
            // Updated, store new result
            etag = htmlResponse.headers.get('etag');
            this.setCachedResult(htmlCacheKey, htmlResponse, etag);
          }
        } catch {
          // Fallback to cached data on fetch error
          htmlResponse = cached.data;
          etag = cached.etag;
        }
      } else {
        htmlResponse = await this.fetchWithLimits(resource, {
          timeout: 150,
        });
        etag = htmlResponse.headers.get('etag');
        this.setCachedResult(htmlCacheKey, htmlResponse, etag);
      }

      const html = await htmlResponse.text();
      const linkMatch = html.match(
        /<link[^>]*rel=["']agent-permissions["'][^>]*href=["']([^"']+)["']/i
      );

      if (linkMatch) {
        const href = linkMatch[1];
        const absoluteUrl = new URL(href, resource).toString();
        inputs.push({
          type: 'agent-permissions',
          url: absoluteUrl,
          etag,
        });
      } else {
        inputs.push({
          type: 'agent-permissions',
          url: resource,
          etag: null,
        });
      }
    } catch {
      inputs.push({
        type: 'agent-permissions',
        url: resource,
        etag: null,
      });
    }

    response.inputs = inputs;

    // Recompute policy hash from discovered inputs with timing
    const hashStart = Date.now();
    try {
      const mockPolicy = {
        resource,
        inputs: inputs,
        discovered_at: new Date().toISOString(),
      };

      const recomputedHash = await canonicalPolicyHash(mockPolicy);
      response.policyHash = recomputedHash;

      // Compare with receipt policy_hash if present
      if (response.claims?.policy_hash) {
        response.reconstructed = {
          hash: recomputedHash,
          matches: response.claims.policy_hash === recomputedHash,
        };
      }
    } catch (error) {
      response.reconstructed = {
        hash: '',
        matches: false,
      };
    }

    // Update hash timing in the parent context
    if (response.timing) {
      response.timing.hash_ms = Date.now() - hashStart;
    }
  }

  private getCachedResult(key: string) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (Date.now() >= cached.expires) {
      this.cache.delete(key);
      return null;
    }
    return cached; // { data, etag, expires }
  }

  private setCachedResult(key: string, data: any, etag: string | null) {
    this.cache.set(key, { data, etag: etag || undefined, expires: Date.now() + 5 * 60 * 1000 });
  }

  private async isAllowedUrl(url: string, options: VerifierOptions): Promise<boolean> {
    try {
      const parsed = new URL(url);

      // Scheme allowlist: https only; http only on loopback
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return false;
      }

      if (parsed.protocol === 'http:') {
        const hostname = parsed.hostname.toLowerCase();
        // Only allow http for loopback addresses
        if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1') {
          return false;
        }
      }

      // Resolve and block private/link-local after DNS
      if (!options.allowPrivateNet) {
        try {
          const addrs = await dns.lookup(parsed.hostname, { all: true });
          for (const addr of addrs) {
            if (await this.isIpPrivate(addr.address)) {
              return false;
            }
          }
        } catch {
          // DNS resolution failed
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  private async isIpPrivate(addr: string): Promise<boolean> {
    // IPv4 private ranges
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipv4Match = addr.match(ipv4Regex);

    if (ipv4Match) {
      const [, a, b, c, d] = ipv4Match.map(Number);

      // Loopback: 127.0.0.0/8
      if (a === 127) return true;
      // Private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      // Link-local: 169.254.0.0/16
      if (a === 169 && b === 254) return true;

      return false;
    }

    // IPv6 ranges
    if (addr.includes(':')) {
      const lower = addr.toLowerCase();
      // Loopback: ::1
      if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
      // ULA: fc00::/7
      if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
      // Link-local: fe80::/10
      if (
        lower.startsWith('fe8') ||
        lower.startsWith('fe9') ||
        lower.startsWith('fea') ||
        lower.startsWith('feb')
      )
        return true;
    }

    return false;
  }

  private async fetchWithLimits(
    url: string,
    options: {
      method?: string;
      timeout?: number;
      maxRedirects?: number;
      headers?: Record<string, string>;
    } = {}
  ) {
    const perFetch = Math.min(options.timeout || 150, 150);
    const maxSize = 256 * 1024; // 256 KiB
    const maxRedirects = Math.min(options.maxRedirects || 3, 3);

    let current = url;
    let redirects = 0;

    for (;;) {
      // Validate current URL with DNS resolution
      if (!(await this.isAllowedUrl(current, {}))) {
        throw new Error('URL not allowed');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), perFetch);

      try {
        const response = await fetch(current, {
          method: options.method || 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': 'PEAC-Verifier/0.9.13.1',
            Accept: 'text/html,application/json,text/plain,*/*;q=0.8',
            'Cache-Control': 'no-cache',
            ...options.headers,
          },
        });

        clearTimeout(timeoutId);

        // Handle 3xx redirects with same-scheme validation and DNS re-check
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) throw new Error('Redirect without Location');

          const next = new URL(location, current).toString();
          const fromScheme = new URL(current).protocol;
          const toScheme = new URL(next).protocol;
          if (fromScheme !== toScheme) throw new Error('Cross-scheme redirect blocked');

          if (++redirects > maxRedirects) throw new Error('Too many redirects');
          current = next;
          continue;
        }

        // Enforce size limit even without Content-Length by streaming
        if (response.body) {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let totalRead = 0;

          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;

              if (value) {
                totalRead += value.byteLength;
                if (totalRead > maxSize) {
                  throw new Error('Response too large');
                }
                chunks.push(value);
              }
            }

            // Reconstruct the response with the buffered body
            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
            const body = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
              body.set(chunk, offset);
              offset += chunk.byteLength;
            }

            return new Response(body, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          } finally {
            reader.releaseLock();
          }
        }

        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    }
  }
}
