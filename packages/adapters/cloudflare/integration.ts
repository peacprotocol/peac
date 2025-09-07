/**
 * Cloudflare AI Crawl Control adapter v0.9.12.1
 * With circuit breaker, fallback modes, and pricing cache
 */

import { createHash, createHmac } from 'crypto';
import { CLOUDFLARE_CONFIG, FEATURES } from '@peac/core';

export interface CloudflareEvent {
  type: 'crawl_payment' | 'pricing_update' | 'crawler_verification';
  data: {
    crawler_name?: string;
    bytes_crawled?: number;
    purpose?: string;
    receipt_id?: string;
    ip?: string;
    user_agent?: string;
    zone_id?: string;
    timestamp?: string;
  };
}

export interface CloudflarePricing {
  per_gb_rate: number;
  currency: 'USD';
  last_updated: string;
  zone_settings: {
    crawl_allowed: boolean;
    require_payment: boolean;
    rate_limit_rpm: number;
  };
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  last_failure: number;
  next_attempt: number;
}

export class CloudflareAdapter {
  private circuit: CircuitBreakerState = {
    state: 'closed',
    failures: 0,
    last_failure: 0,
    next_attempt: 0
  };
  
  private pricingCache: CloudflarePricing | null = null;
  private pricingCacheExpiry: number = 0;

  constructor(private config = CLOUDFLARE_CONFIG) {
    if (!config.enabled) {
      console.warn('Cloudflare adapter disabled via ENABLE_CF=false');
    }
  }

  async handleWebhook(
    body: string, 
    signature: string, 
    idempotencyKey?: string
  ): Promise<{ success: boolean; receipt_updates?: any[] }> {
    if (!this.config.enabled) {
      return this.handleFallback('webhook processing', { success: false });
    }

    try {
      // Verify HMAC signature
      const expectedSignature = this.computeWebhookSignature(body);
      if (!this.verifySignature(signature, expectedSignature)) {
        throw new Error('Invalid webhook signature');
      }

      // Parse event
      let event: CloudflareEvent;
      try {
        event = JSON.parse(body);
      } catch {
        throw new Error('Invalid JSON in webhook body');
      }

      // Idempotency check (in production, use Redis)
      if (idempotencyKey && this.isProcessed(idempotencyKey)) {
        return { success: true }; // Already processed
      }

      // Process event based on type
      const result = await this.processEvent(event);
      
      // Mark as processed
      if (idempotencyKey) {
        this.markProcessed(idempotencyKey);
      }

      return result;

    } catch (error) {
      console.error('Cloudflare webhook processing failed:', error);
      return this.handleFallback('webhook processing', { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async getPricing(): Promise<CloudflarePricing> {
    if (!this.config.enabled) {
      return this.getFallbackPricing();
    }

    // Check cache
    if (this.pricingCache && Date.now() < this.pricingCacheExpiry) {
      return this.pricingCache;
    }

    // Check circuit breaker
    if (!this.canMakeRequest()) {
      console.warn('Cloudflare circuit breaker open, using fallback pricing');
      return this.getFallbackPricing();
    }

    try {
      const response = await this.makeRequest(
        `https://api.cloudflare.com/client/v4/zones/${this.config.auth.zone_id}/ai_crawl_control/pricing`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.auth.api_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const pricing: CloudflarePricing = {
        per_gb_rate: data.result?.per_gb_rate || 0.001, // Default fallback
        currency: 'USD',
        last_updated: new Date().toISOString(),
        zone_settings: {
          crawl_allowed: data.result?.crawl_allowed !== false,
          require_payment: data.result?.require_payment === true,
          rate_limit_rpm: data.result?.rate_limit_rpm || 60
        }
      };

      // Update cache
      this.pricingCache = pricing;
      this.pricingCacheExpiry = Date.now() + (this.config.cache_ttl * 1000);

      // Reset circuit breaker on success
      this.resetCircuit();

      return pricing;

    } catch (error) {
      this.recordFailure();
      console.error('Failed to fetch Cloudflare pricing:', error);
      return this.getFallbackPricing();
    }
  }

  async verifyCrawler(ip: string, userAgent: string): Promise<{
    verified: boolean;
    source: 'cloudflare' | 'fallback';
    details?: any;
  }> {
    if (!this.config.enabled || !this.canMakeRequest()) {
      return { verified: false, source: 'fallback' };
    }

    try {
      const response = await this.makeRequest(
        `https://api.cloudflare.com/client/v4/zones/${this.config.auth.zone_id}/bot_management/verify`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.auth.api_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ip,
            user_agent: userAgent,
            request_timestamp: new Date().toISOString()
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Cloudflare verification failed: ${response.status}`);
      }

      const data = await response.json();
      this.resetCircuit();

      return {
        verified: data.result?.verified === true,
        source: 'cloudflare',
        details: {
          score: data.result?.score,
          classification: data.result?.classification,
          reasons: data.result?.reasons || []
        }
      };

    } catch (error) {
      this.recordFailure();
      console.error('Cloudflare crawler verification failed:', error);
      return { verified: false, source: 'fallback' };
    }
  }

  private async processEvent(event: CloudflareEvent): Promise<{ success: boolean; receipt_updates?: any[] }> {
    switch (event.type) {
      case 'crawl_payment':
        return this.processCrawlPayment(event.data);
      case 'pricing_update':
        // Invalidate pricing cache
        this.pricingCache = null;
        this.pricingCacheExpiry = 0;
        return { success: true };
      case 'crawler_verification':
        return this.processCrawlerVerification(event.data);
      default:
        console.warn('Unknown Cloudflare event type:', event.type);
        return { success: true }; // Ignore unknown events
    }
  }

  private async processCrawlPayment(data: any): Promise<{ success: boolean; receipt_updates?: any[] }> {
    // Map Cloudflare event to receipt payment evidence
    const receiptUpdate = {
      payment: {
        rail: 'cloudflare' as const,
        amount: this.calculatePayment(data.bytes_crawled || 0),
        currency: 'USD',
        evidence: {
          provider_ids: [`cf-${data.receipt_id || 'unknown'}`],
          proof: this.createPaymentProof(data)
        }
      },
      crawler_type: this.mapCrawlerType(data.crawler_name),
      request_context: {
        correlation_id: data.receipt_id,
        timestamp: data.timestamp || new Date().toISOString()
      }
    };

    return { success: true, receipt_updates: [receiptUpdate] };
  }

  private async processCrawlerVerification(data: any): Promise<{ success: boolean }> {
    // Log verification result for analytics
    console.log('Cloudflare crawler verification:', {
      ip: data.ip,
      user_agent: data.user_agent?.substring(0, 50),
      verified: true // Cloudflare pre-verified
    });

    return { success: true };
  }

  private canMakeRequest(): boolean {
    const now = Date.now();
    
    if (this.circuit.state === 'open') {
      if (now >= this.circuit.next_attempt) {
        this.circuit.state = 'half-open';
        return true;
      }
      return false;
    }
    
    return true; // closed or half-open
  }

  private recordFailure(): void {
    this.circuit.failures++;
    this.circuit.last_failure = Date.now();

    if (this.circuit.failures >= this.config.circuit.threshold) {
      this.circuit.state = 'open';
      this.circuit.next_attempt = Date.now() + this.config.circuit.cooldown_ms;
      console.warn(`Cloudflare circuit breaker opened after ${this.circuit.failures} failures`);
    }
  }

  private resetCircuit(): void {
    if (this.circuit.state !== 'closed') {
      console.log('Cloudflare circuit breaker reset');
    }
    this.circuit = {
      state: 'closed',
      failures: 0,
      last_failure: 0,
      next_attempt: 0
    };
  }

  private async makeRequest(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout_ms);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.config.timeout_ms}ms`);
      }
      throw error;
    }
  }

  private handleFallback<T>(operation: string, fallbackValue: T): T {
    console.log(`Cloudflare ${operation} failed, using fallback mode: ${this.config.fallback_mode}`);
    
    switch (this.config.fallback_mode) {
      case 'allow':
        // Allow operation to proceed
        return fallbackValue;
      case 'block':
        throw new Error(`Cloudflare unavailable and fallback_mode=block`);
      case 'local_only':
      default:
        return fallbackValue;
    }
  }

  private getFallbackPricing(): CloudflarePricing {
    return {
      per_gb_rate: 0.001, // Conservative fallback rate
      currency: 'USD',
      last_updated: new Date().toISOString(),
      zone_settings: {
        crawl_allowed: true,
        require_payment: false, // Safe default
        rate_limit_rpm: 60
      }
    };
  }

  private computeWebhookSignature(body: string): string {
    return createHmac('sha256', this.config.auth.api_token)
      .update(body)
      .digest('hex');
  }

  private verifySignature(received: string, expected: string): boolean {
    // Constant-time comparison to prevent timing attacks
    const receivedBuffer = Buffer.from(received, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    
    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    
    return createHash('sha256').update(receivedBuffer).digest().equals(
      createHash('sha256').update(expectedBuffer).digest()
    );
  }

  private calculatePayment(bytes: number): number {
    const pricing = this.pricingCache || this.getFallbackPricing();
    const gb = bytes / (1024 * 1024 * 1024);
    return Math.round(gb * pricing.per_gb_rate * 100) / 100; // Round to cents
  }

  private createPaymentProof(data: any): string {
    return createHash('sha256')
      .update(JSON.stringify({
        bytes: data.bytes_crawled,
        timestamp: data.timestamp,
        receipt_id: data.receipt_id
      }))
      .digest('hex');
  }

  private mapCrawlerType(crawlerName?: string): 'bot' | 'agent' | 'unknown' {
    if (!crawlerName) return 'unknown';
    
    const name = crawlerName.toLowerCase();
    if (name.includes('bot') || name.includes('spider') || name.includes('crawler')) {
      return 'bot';
    }
    if (name.includes('gpt') || name.includes('claude') || name.includes('agent')) {
      return 'agent';
    }
    return 'unknown';
  }

  // Simple in-memory idempotency (use Redis in production)
  private processedKeys = new Set<string>();

  private isProcessed(key: string): boolean {
    return this.processedKeys.has(key);
  }

  private markProcessed(key: string): void {
    this.processedKeys.add(key);
    // In production, set TTL based on webhook retry window
  }
}

export const cloudflareAdapter = new CloudflareAdapter();