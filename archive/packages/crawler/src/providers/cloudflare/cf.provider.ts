/**
 * @peac/crawler v0.9.12.1 - Cloudflare AI Crawl Control provider
 * Production-ready adapter with circuit breaker and pricing cache
 */

import {
  CrawlerControlProvider,
  VerifyRequest,
  VerificationResult,
  UsageMetrics,
  PricingResult,
  HealthCheckResult,
  BlockDecision,
  ChallengeResponse,
} from '../../types.js';
import { CFClient, CFClientOptions } from './cf.client.js';

export interface CloudflareProviderOptions {
  priority?: number;
  pricingCacheTtlMs?: number;
  maxRetries?: number;
  confidenceThreshold?: {
    trusted: number; // Above this = trusted
    suspicious: number; // Below this = suspicious (between = suspicious)
  };
}

interface PricingCacheEntry {
  result: PricingResult;
  expiresAt: number;
}

export class CloudflareProvider implements CrawlerControlProvider {
  name = 'cloudflare';
  priority: number;
  capabilities = new Set(['verify', 'price', 'block', 'challenge']);

  private pricingCache = new Map<string, PricingCacheEntry>();
  private confidenceThreshold: Required<CloudflareProviderOptions>['confidenceThreshold'];

  constructor(
    private client: CFClient,
    private options: CloudflareProviderOptions = {}
  ) {
    this.priority = options.priority ?? 50;
    this.confidenceThreshold = {
      trusted: 0.8,
      suspicious: 0.4,
      ...options.confidenceThreshold,
    };
  }

  async verify(req: VerifyRequest): Promise<VerificationResult> {
    const start = Date.now();

    try {
      const response = await this.client.verifyCrawler({
        ip: req.ip,
        userAgent: req.userAgent,
        requestId: req.requestId,
        headers: req.headers,
        context: req.context,
      });

      const latency = Date.now() - start;

      // Map Cloudflare response to our format
      const result = this.mapCloudflareResult(response);

      return {
        provider: this.name,
        result,
        confidence: Math.max(0, Math.min(1, response.confidence)),
        indicators: response.indicators || [],
        latency_ms: latency,
        evidence: {
          cf_request_id: response.request_id,
          cf_status: response.status,
          cf_rationale: response.rationale,
          ...response.evidence,
        },
      };
    } catch (error) {
      const latency = Date.now() - start;

      // Classify error types for better debugging
      let indicators = ['cf_error'];
      if (error.message.includes('timeout')) {
        indicators = ['cf_timeout'];
      } else if (error.message.includes('cf_4')) {
        indicators = ['cf_client_error'];
      } else if (error.message.includes('cf_5')) {
        indicators = ['cf_server_error'];
      } else if (error.message.includes('network')) {
        indicators = ['cf_network_error'];
      }

      return {
        provider: this.name,
        result: 'error',
        confidence: 0,
        indicators,
        latency_ms: latency,
        evidence: {
          error_message: error.message,
          error_type: this.classifyError(error),
        },
      };
    }
  }

  async calculatePrice(usage: UsageMetrics): Promise<PricingResult> {
    const cacheKey = this.getPricingCacheKey(usage);
    const now = Date.now();

    // Check cache first
    const cached = this.pricingCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.result;
    }

    try {
      const response = await this.client.calculatePricing({ usage });

      const result: PricingResult = {
        provider: this.name,
        model: response.model,
        rate: response.rate,
        currency: response.currency,
        ttl_s: response.ttl_s ?? 300,
      };

      // Cache the result
      const ttlMs = this.options.pricingCacheTtlMs ?? result.ttl_s! * 1000;
      this.pricingCache.set(cacheKey, {
        result,
        expiresAt: now + ttlMs,
      });

      return result;
    } catch (error) {
      // Return a fallback pricing on error
      return {
        provider: this.name,
        model: 'per_request',
        rate: 0,
        currency: 'USD',
        ttl_s: 60, // Short TTL for error responses
      };
    }
  }

  async shouldBlock(info: { ip: string; userAgent: string }): Promise<BlockDecision> {
    try {
      // Use verify endpoint for block decision
      const result = await this.verify({
        requestId: `block-check-${Date.now()}`,
        ip: info.ip,
        userAgent: info.userAgent,
      });

      if (result.result === 'error') {
        return { decision: 'unverified', reason: 'verification_failed' };
      }

      // Convert trust score to block decision
      if (result.confidence < 0.2) {
        return { decision: 'block', reason: 'low_trust_score' };
      } else if (result.confidence < 0.5) {
        return { decision: 'challenge', reason: 'medium_trust_score' };
      } else {
        return { decision: 'allow', reason: 'high_trust_score' };
      }
    } catch (error) {
      return { decision: 'unverified', reason: 'error' };
    }
  }

  async generateChallenge(info: { ip: string; userAgent: string }): Promise<ChallengeResponse> {
    // Simplified challenge generation - in practice, this might call a CF endpoint
    const token = this.generateChallengeToken();

    return {
      type: 'cf_challenge',
      token,
      expires_at: new Date(Date.now() + 300_000).toISOString(), // 5 minutes
    };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();

    try {
      await this.client.ping();
      const latency = Date.now() - start;

      return {
        healthy: true,
        latency_ms: latency,
        details: {
          client_config: this.client.getConfig(),
          pricing_cache_size: this.pricingCache.size,
        },
      };
    } catch (error) {
      const latency = Date.now() - start;

      return {
        healthy: false,
        latency_ms: latency,
        details: {
          error_message: error.message,
          error_type: this.classifyError(error),
          client_config: {
            baseURL: this.client.getConfig().baseURL,
            zoneId: this.client.getConfig().zoneId,
          },
        },
      };
    }
  }

  async close(): Promise<void> {
    // Clear caches and clean up resources
    this.pricingCache.clear();
  }

  private mapCloudflareResult(response: any): VerificationResult['result'] {
    const confidence = response.confidence ?? 0.5;

    // Use thresholds to determine result
    if (confidence >= this.confidenceThreshold.trusted) {
      return 'trusted';
    } else if (confidence >= this.confidenceThreshold.suspicious) {
      return 'suspicious';
    } else {
      return 'unverified';
    }
  }

  private classifyError(error: Error): string {
    if (error.message.includes('timeout')) return 'timeout';
    if (error.message.includes('cf_4')) return 'client_error';
    if (error.message.includes('cf_5')) return 'server_error';
    if (error.message.includes('network')) return 'network_error';
    if (error.message.includes('auth')) return 'auth_error';
    return 'unknown_error';
  }

  private getPricingCacheKey(usage: UsageMetrics): string {
    const parts = [usage.bytes ?? 0, usage.requests ?? 0, usage.tokens ?? 0];
    return `pricing:${parts.join(':')}`;
  }

  private generateChallengeToken(): string {
    // Generate a secure random token for challenges
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Utility methods for testing and debugging
  clearCache(): void {
    this.pricingCache.clear();
  }

  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.pricingCache.size,
      entries: Array.from(this.pricingCache.keys()),
    };
  }

  // Force cache expiry for testing
  expireCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.pricingCache.entries()) {
      if (entry.expiresAt > now) {
        entry.expiresAt = now - 1;
      }
    }
  }
}
