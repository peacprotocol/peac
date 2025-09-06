/**
 * @peac/crawler v0.9.12.1 - Local provider with RDNS/IP/UA heuristics
 * Basic crawler verification using DNS reverse lookup and user agent patterns
 */

import { 
  CrawlerControlProvider, 
  VerifyRequest, 
  VerificationResult, 
  HealthCheckResult,
  UsageMetrics,
  PricingResult
} from '../../types.js';

export interface LocalProviderConfig {
  uaAllow?: RegExp;
  ipAllowRanges?: string[];
  maxRpsThreshold?: number;
  rdnsRequired?: boolean;
}

export class LocalProvider implements CrawlerControlProvider {
  name = 'local';
  priority = 100;
  capabilities = new Set(['verify', 'price']);
  
  constructor(private config: LocalProviderConfig = {}) {
    // Default user agent patterns for known crawlers
    this.config.uaAllow ??= /bot|gpt|claude|bing|google|perplexity|crawler|spider|scraper/i;
    this.config.maxRpsThreshold ??= 10;
    this.config.rdnsRequired ??= false;
  }
  
  async verify(req: VerifyRequest): Promise<VerificationResult> {
    const start = Date.now();
    const indicators: string[] = [];
    let confidence = 0.6; // Base confidence
    
    // RDNS verification
    if (req.rdns) {
      if (req.rdns.match === false) {
        indicators.push('rdns_mismatch');
        confidence -= 0.2;
      } else if (req.rdns.match === true) {
        indicators.push('rdns_match');
        confidence += 0.15;
      }
    } else if (this.config.rdnsRequired) {
      indicators.push('rdns_missing');
      confidence -= 0.1;
    }
    
    // Rate compliance check
    if (req.rate) {
      if (req.rate.currentRps > req.rate.policyRps) {
        indicators.push('rate_exceeded');
        confidence -= 0.3;
      } else if (req.rate.currentRps > (this.config.maxRpsThreshold ?? 10)) {
        indicators.push('rate_high');
        confidence -= 0.1;
      } else {
        indicators.push('rate_compliant');
        confidence += 0.1;
      }
    }
    
    // User agent validation
    if (this.config.uaAllow) {
      if (!this.config.uaAllow.test(req.userAgent)) {
        indicators.push('ua_unknown');
        confidence -= 0.1;
      } else {
        indicators.push('ua_recognized');
        confidence += 0.1;
      }
    }
    
    // IP validation (if configured)
    if (this.config.ipAllowRanges?.length) {
      const ipAllowed = this.isIpInRanges(req.ip, this.config.ipAllowRanges);
      if (!ipAllowed) {
        indicators.push('ip_not_in_allowlist');
        confidence -= 0.15;
      } else {
        indicators.push('ip_in_allowlist');
        confidence += 0.1;
      }
    }
    
    // User agent anomaly detection
    if (this.isUserAgentSuspicious(req.userAgent)) {
      indicators.push('ua_suspicious');
      confidence -= 0.2;
    }
    
    // Normalize confidence
    confidence = Math.max(0, Math.min(1, confidence));
    
    // Determine result based on confidence
    let result: VerificationResult['result'];
    if (confidence >= 0.8) {
      result = 'trusted';
    } else if (confidence >= 0.5) {
      result = 'suspicious';
    } else {
      result = 'unverified';
    }
    
    return {
      provider: this.name,
      result,
      confidence,
      indicators,
      latency_ms: Date.now() - start,
      evidence: {
        rdns_check: !!req.rdns,
        rate_check: !!req.rate,
        ua_pattern_match: this.config.uaAllow?.test(req.userAgent) ?? null
      }
    };
  }
  
  async calculatePrice(usage: UsageMetrics): Promise<PricingResult> {
    // Local verification is essentially free
    return {
      provider: this.name,
      model: 'per_request',
      rate: 0,
      currency: 'USD',
      ttl_s: 3600
    };
  }
  
  async healthCheck(): Promise<HealthCheckResult> {
    // Local provider is always healthy
    return {
      healthy: true,
      latency_ms: 1,
      details: {
        config: {
          ua_allow_pattern: this.config.uaAllow?.source,
          rdns_required: this.config.rdnsRequired,
          max_rps_threshold: this.config.maxRpsThreshold
        }
      }
    };
  }
  
  private isIpInRanges(ip: string, ranges: string[]): boolean {
    // Simple implementation - in production, use a proper CIDR library
    return ranges.some(range => {
      if (range.includes('/')) {
        // CIDR notation - simplified check
        const [network, bits] = range.split('/');
        // This is a placeholder - implement proper CIDR matching
        return ip.startsWith(network.split('.').slice(0, Math.floor(parseInt(bits) / 8)).join('.'));
      } else {
        // Exact match
        return ip === range;
      }
    });
  }
  
  private isUserAgentSuspicious(userAgent: string): boolean {
    const suspiciousPatterns = [
      /python-requests/i,
      /curl\//i,
      /wget/i,
      /libwww/i,
      /httpclient/i,
      /^$/,  // Empty user agent
      /^.{1,5}$/,  // Very short user agents
      /script|bot.*script|automated/i
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }
}