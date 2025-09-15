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
    hash: string;
    matches: boolean;
  };
  inputs?: Array<{
    type: 'aipref' | 'agent-permissions' | 'peac.txt';
    url: string;
    etag?: string;
    status: 'found' | 'not_found' | 'error';
  }>;
  timing: {
    started: number;
    completed: number;
    duration: number;
  };
}

export interface VerifierOptions {
  timeout?: number;
  allowPrivateNet?: boolean;
  maxInputSize?: number;
  maxRedirects?: number;
}

export class VerifierV13 {
  private cache = new Map<string, { data: any; etag?: string; expires: number }>();

  async verify(
    request: V13VerifyRequest,
    options: VerifierOptions = {}
  ): Promise<{ status: HttpStatus; body: V13VerifyResponse | any }> {
    const started = Date.now();
    const timing = () => ({
      started,
      completed: Date.now(),
      duration: Date.now() - started,
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
        timing: timing(),
      };

      // If resource is provided, discover policies and recompute hash
      if (request.resource && verifyResult.valid) {
        try {
          await this.addPolicyValidation(request.resource, response, options);
        } catch (error) {
          // Policy validation errors don't invalidate the receipt itself
          response.reconstructed = {
            hash: '',
            matches: false,
          };
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
          timing: timing(),
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

    // Apply SSRF guards
    if (!this.isAllowedUrl(resource, options)) {
      throw new Error('URL not allowed by security policy');
    }

    // Discover peac.txt
    try {
      const peacResult = await discover(resource);
      inputs.push({
        type: 'peac.txt',
        url: new URL('/.well-known/peac.txt', resource).toString(),
        status: peacResult.valid ? 'found' : 'not_found',
      });
    } catch {
      inputs.push({
        type: 'peac.txt',
        url: new URL('/.well-known/peac.txt', resource).toString(),
        status: 'error',
      });
    }

    // Check AIPREF headers
    try {
      const aiprefResult = await this.fetchWithLimits(resource, {
        method: 'HEAD',
        timeout: options.timeout || 5000,
      });

      const contentUsage = aiprefResult.headers.get('content-usage');
      if (contentUsage) {
        inputs.push({
          type: 'aipref',
          url: resource,
          status: 'found',
          etag: aiprefResult.headers.get('etag') || undefined,
        });
      } else {
        inputs.push({
          type: 'aipref',
          url: resource,
          status: 'not_found',
        });
      }
    } catch {
      inputs.push({
        type: 'aipref',
        url: resource,
        status: 'error',
      });
    }

    // Check agent-permissions
    try {
      const htmlResponse = await this.fetchWithLimits(resource, {
        timeout: options.timeout || 5000,
      });
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
          status: 'found',
          etag: htmlResponse.headers.get('etag') || undefined,
        });
      } else {
        inputs.push({
          type: 'agent-permissions',
          url: resource,
          status: 'not_found',
        });
      }
    } catch {
      inputs.push({
        type: 'agent-permissions',
        url: resource,
        status: 'error',
      });
    }

    response.inputs = inputs;

    // Recompute policy hash from discovered inputs
    try {
      const mockPolicy = {
        resource,
        inputs: inputs.filter((i) => i.status === 'found'),
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
  }

  private isAllowedUrl(url: string, options: VerifierOptions): boolean {
    try {
      const parsed = new URL(url);

      // Only allow https, or http on loopback
      if (parsed.protocol === 'https:') {
        return true;
      }

      if (parsed.protocol === 'http:') {
        const hostname = parsed.hostname.toLowerCase();
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
          return true;
        }
        // Allow private networks only if explicitly enabled
        if (options.allowPrivateNet) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  private async fetchWithLimits(url: string, options: { method?: string; timeout?: number }) {
    const controller = new AbortController();
    const timeout = options.timeout || 5000;

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'PEAC-Verifier/0.9.13.1',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
        },
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
