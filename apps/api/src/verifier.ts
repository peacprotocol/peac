/**
 * Enhanced verifier implementation for v0.9.13.1 spec
 * POST /verify {receipt, resource} → {valid, claims, policyHash, reconstructed, inputs, timing}
 */

import { verify, canonicalPolicyHash } from '@peac/core';
import { discover } from '@peac/disc';
import type { HttpStatus } from './types.js';

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
            type: 'https://peac.dev/problems/invalid-request',
            title: 'Invalid Request',
            status: 400,
            detail: 'receipt field is required and must be a string',
            timing: buildTiming(),
            meta: buildMeta(),
          },
        };
      }

      // Verify receipt signature using existing core function
      const verifyResult = await verify(request.receipt, {
        resource: request.resource,
      });

      const response: V13VerifyResponse = {
        valid: verifyResult.valid,
        claims: verifyResult.claims,
        timing: buildTiming(),
        meta: buildMeta(),
      };

      // If resource is provided, discover policies and recompute hash
      if (request.resource && verifyResult.valid) {
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
          type: 'https://peac.dev/problems/processing-error',
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
    if (!this.isAllowedUrl(resource, options)) {
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

      if (cached && cached.etag) {
        // Use cached result if available
        aiprefResult = cached.data;
        etag = cached.etag;
      } else {
        aiprefResult = await this.fetchWithLimits(resource, {
          method: 'HEAD',
          timeout: 150,
        });
        etag = aiprefResult.headers.get('etag');
        this.setCachedResult(resource, aiprefResult, etag);
      }

      const contentUsage = aiprefResult.headers?.get('content-usage');
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

      if (cached && cached.etag) {
        htmlResponse = cached.data;
        etag = cached.etag;
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
    if (cached && Date.now() < cached.expires) {
      return cached;
    }
    if (cached) {
      this.cache.delete(key);
    }
    return null;
  }

  private setCachedResult(key: string, data: any, etag: string | null) {
    const expires = Date.now() + 5 * 60 * 1000; // 5-minute TTL
    const cacheKey = etag ? `${key}:${etag}` : key;
    this.cache.set(cacheKey, { data, etag: etag || undefined, expires });
  }

  private isAllowedUrl(url: string, options: VerifierOptions): boolean {
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

      // Block private/link-local IP ranges unless explicitly allowed
      if (!options.allowPrivateNet && this.isPrivateOrLinkLocal(parsed.hostname)) {
        return false;
      }

      // Forbid file:, data:, ftp:, gopher: protocols
      return true;
    } catch {
      return false;
    }
  }

  private isPrivateOrLinkLocal(hostname: string): boolean {
    // Check for IPv4 private/link-local ranges
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipv4Match = hostname.match(ipv4Regex);

    if (ipv4Match) {
      const [, a, b, c, d] = ipv4Match.map(Number);

      // Private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;

      // Link-local: 169.254.0.0/16
      if (a === 169 && b === 254) return true;

      // Loopback: 127.0.0.0/8
      if (a === 127) return true;
    }

    // Check for IPv6 private/link-local ranges
    if (hostname.includes(':')) {
      const lower = hostname.toLowerCase();
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
      // Loopback: ::1
      if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
    }

    return false;
  }

  private async fetchWithLimits(
    url: string,
    options: { method?: string; timeout?: number; maxRedirects?: number } = {}
  ) {
    const controller = new AbortController();
    const timeout = Math.min(options.timeout || 150, 150); // Per-fetch ≤ 150ms
    const maxSize = 256 * 1024; // Max body 256 KiB
    const maxRedirects = Math.min(options.maxRedirects || 3, 3); // ≤3 redirects

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Apply SSRF guards
      if (!this.isAllowedUrl(url, {})) {
        throw new Error('URL not allowed by security policy');
      }

      let currentUrl = url;
      let redirectCount = 0;
      let response: Response;

      do {
        response = await fetch(currentUrl, {
          method: options.method || 'GET',
          signal: controller.signal,
          redirect: 'manual', // Handle redirects manually for security
          headers: {
            'User-Agent': 'PEAC-Verifier/0.9.13.1',
            Accept: 'text/html,application/json,text/plain,*/*;q=0.8',
            'Cache-Control': 'no-cache',
          },
        });

        // Handle redirects with security validation
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) {
            throw new Error('Redirect without location header');
          }

          // Resolve relative redirects
          const redirectUrl = new URL(location, currentUrl).toString();

          // Validate redirect URL against security policy
          if (!this.isAllowedUrl(redirectUrl, {})) {
            throw new Error('Redirect URL not allowed by security policy');
          }

          // Ensure same-scheme redirects only
          const currentScheme = new URL(currentUrl).protocol;
          const redirectScheme = new URL(redirectUrl).protocol;
          if (currentScheme !== redirectScheme) {
            throw new Error('Cross-scheme redirects not allowed');
          }

          currentUrl = redirectUrl;
          redirectCount++;

          if (redirectCount > maxRedirects) {
            throw new Error(`Too many redirects (max ${maxRedirects})`);
          }
        } else {
          break; // Not a redirect, proceed with response
        }
      } while (redirectCount <= maxRedirects);

      // Validate response size
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > maxSize) {
        throw new Error(`Response too large (max ${maxSize} bytes)`);
      }

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
