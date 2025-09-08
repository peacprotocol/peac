/**
 * @peac/crawler v0.9.12.1 - Vendor-neutral crawler control types
 * Shared interfaces for provider abstraction and verification
 */

export type Capability = 'verify' | 'price' | 'block' | 'challenge';
export type Decision = 'allow' | 'block' | 'challenge' | 'unverified';
export type Result = 'trusted' | 'suspicious' | 'unverified' | 'error';
export type Aggregation = 'any' | 'all' | 'majority' | 'weighted';
export type Mode = 'parallel' | 'failover';

export interface RequestContext {
  request_id?: string;
  session_id?: string;
  correlation_id?: string;
  timestamp?: string;
}

export interface VerifyRequest {
  requestId: string;
  ip: string;
  userAgent: string;
  headers?: Record<string, string>;
  rdns?: {
    forwardHostname?: string;
    reverseIPs?: string[];
    match?: boolean;
  };
  rate?: {
    currentRps: number;
    policyRps: number;
  };
  context?: RequestContext;
  now?: number;
}

export interface VerificationResult {
  provider: string;
  result: Result;
  confidence: number; // 0..1
  latency_ms?: number;
  indicators?: string[];
  evidence?: Record<string, unknown>;
  fromCache?: boolean;
}

export interface PricingResult {
  provider: string;
  model: 'per_gb' | 'per_request' | 'per_token' | 'flat_rate';
  rate: number;
  currency: string;
  ttl_s?: number;
}

export interface UsageMetrics {
  bytes?: number;
  tokens?: number;
  requests?: number;
}

export interface BlockDecision {
  decision: Decision;
  reason?: string;
}

export interface ChallengeResponse {
  type: string;
  token: string;
  expires_at?: string;
}

export interface HealthCheckResult {
  healthy: boolean;
  latency_ms: number;
  details?: Record<string, unknown>;
}

export interface CrawlerControlProvider {
  name: string;
  priority?: number;
  capabilities: Set<Capability>;

  verify?(req: VerifyRequest): Promise<VerificationResult>;
  calculatePrice?(usage: UsageMetrics): Promise<PricingResult>;
  shouldBlock?(info: { ip: string; userAgent: string }): Promise<BlockDecision>;
  generateChallenge?(info: { ip: string; userAgent: string }): Promise<ChallengeResponse>;
  healthCheck?(): Promise<HealthCheckResult>;
  close?(): Promise<void> | void;
}

export interface ProviderQuota {
  requestsPerMinute?: number;
  requestsPerHour?: number;
  maxMonthlyCostUSD?: number;
}

export interface RegistryOptions {
  strategy: Aggregation;
  mode: Mode;
  weights?: Record<string, number>;
  fallbackPolicy: Decision;
  perProviderTimeoutMs: number;
  dynamicWeightOnUnhealthy?: number;
  quotas?: Record<string, ProviderQuota>;
}

export interface AggregationResult {
  trust_score: number;
  decision: Decision;
  provider_count: number;
  error_count: number;
}

export interface VerificationResponse {
  aggregated: VerificationResult & { aggregation?: AggregationResult };
  providers: VerificationResult[];
  level: VerificationLevel;
  cached_results: number;
}

export enum VerificationLevel {
  NONE = 0,
  CACHED = 1,
  LOCAL = 2,
  FULL = 3,
}

export interface RegistryStats {
  providers: Array<{
    name: string;
    healthy: boolean;
    capabilities: string[];
    priority: number;
    weight: number;
    breaker_state: string;
    cache_stats: {
      size: number;
      hit_rate?: number;
    };
  }>;
  total_requests: number;
  cache_hit_rate: number;
  avg_latency_ms: number;
}
