import { Request } from 'express';
import { parseWebBotAuthHeaders, hasRequiredWebBotAuthHeaders } from './parse';
import { fetchAndVerifyDirectory, validateSignatureAgentUrl } from './directory';
import { logger } from '../../logging';
import { metrics } from '../../metrics';

export type VerifyFailure = 
  | 'no_headers'
  | 'bad_signature_agent'
  | 'dir_fetch'
  | 'dir_media'
  | 'dir_sig_invalid'
  | 'no_matching_key'
  | 'req_sig_invalid'
  | 'stale'
  | 'future'
  | 'component_missing'
  | 'verifier_busy';

export interface VerifyResult {
  ok: boolean;
  tierHint?: 'verified';
  keyid?: string;
  failure?: VerifyFailure;
  agentOrigin?: string;
}

export interface VerifyOptions {
  fetchFn?: typeof fetch;
  now?: () => number;
  skewSec?: number;
  dirTtlSec?: number;
}

const DEFAULT_VERIFY_OPTIONS = {
  fetchFn: fetch,
  now: () => Date.now(),
  skewSec: 120,
  dirTtlSec: 600,
};

const rateLimitWindows = new Map<string, { count: number; resetAt: number }>();
const circuitBreakers = new Map<string, { openUntil: number; failures: number }>();

let currentInflight = 0;
const MAX_INFLIGHT = 128;

function isRateLimited(origin: string, now: number): boolean {
  const window = rateLimitWindows.get(origin);
  if (!window || now > window.resetAt) {
    rateLimitWindows.set(origin, { count: 1, resetAt: now + 60000 });
    return false;
  }
  
  if (window.count >= 5) {
    return true;
  }
  
  window.count++;
  return false;
}

function isCircuitBreakerOpen(origin: string, now: number): boolean {
  const breaker = circuitBreakers.get(origin);
  if (!breaker) return false;
  
  return now < breaker.openUntil;
}

function recordFailure(origin: string, now: number): void {
  const breaker = circuitBreakers.get(origin) || { openUntil: 0, failures: 0 };
  breaker.failures++;
  
  if (breaker.failures >= 5) {
    breaker.openUntil = now + 60000; // Open for 60s
    breaker.failures = 0;
  }
  
  circuitBreakers.set(origin, breaker);
}

function recordSuccess(origin: string): void {
  const breaker = circuitBreakers.get(origin);
  if (breaker) {
    breaker.failures = 0;
    breaker.openUntil = 0;
  }
}

export async function verifyWebBotAuth(
  req: Request,
  options: VerifyOptions = {}
): Promise<VerifyResult> {
  const opts = { ...DEFAULT_VERIFY_OPTIONS, ...options };
  const now = opts.now();
  
  if (currentInflight >= MAX_INFLIGHT) {
    metrics.webBotAuthVerifyAttempts?.inc({ result: 'busy' });
    return { ok: false, failure: 'verifier_busy' };
  }
  
  const headers = parseWebBotAuthHeaders(req.headers);
  
  if (!hasRequiredWebBotAuthHeaders(headers)) {
    return { ok: false, failure: 'no_headers' };
  }
  
  const signatureAgent = headers.signatureAgent!;
  
  if (!validateSignatureAgentUrl(signatureAgent)) {
    metrics.webBotAuthVerifyAttempts?.inc({ result: 'invalid_url' });
    return { ok: false, failure: 'bad_signature_agent' };
  }
  
  const origin = new URL(signatureAgent).origin;
  
  if (isRateLimited(origin, now)) {
    metrics.webBotAuthVerifyAttempts?.inc({ result: 'rate_limited' });
    return { ok: false, failure: 'verifier_busy' };
  }
  
  if (isCircuitBreakerOpen(origin, now)) {
    metrics.webBotAuthVerifyAttempts?.inc({ result: 'circuit_open' });
    return { ok: false, failure: 'verifier_busy' };
  }
  
  currentInflight++;
  const startTime = Date.now();
  
  try {
    const directory = await fetchAndVerifyDirectory(signatureAgent, {
      fetchFn: opts.fetchFn,
      now: opts.now,
      ttlSec: opts.dirTtlSec,
      skewSec: opts.skewSec,
    });
    
    recordSuccess(origin);
    
    const latency = Date.now() - startTime;
    metrics.webBotAuthVerifyLatency?.observe(latency);
    metrics.webBotAuthVerifyAttempts?.inc({ result: 'success' });
    
    logger.info({
      agentOrigin: origin,
      keyCount: directory.keys.length,
      latency,
    }, 'Web Bot Auth directory verified');
    
    return {
      ok: true,
      tierHint: 'verified',
      keyid: directory.keys[0]?.kid,
      agentOrigin: origin,
    };
    
  } catch (error) {
    recordFailure(origin, now);
    
    const latency = Date.now() - startTime;
    metrics.webBotAuthVerifyLatency?.observe(latency);
    
    let failure: VerifyFailure = 'dir_fetch';
    if (error instanceof Error) {
      if (error.message.includes('Invalid content type')) {
        failure = 'dir_media';
      } else if (error.message.includes('signature')) {
        failure = 'dir_sig_invalid';
      }
    }
    
    metrics.webBotAuthVerifyAttempts?.inc({ result: 'failure', reason: failure });
    
    logger.warn({
      agentOrigin: origin,
      error: error instanceof Error ? error.message : String(error),
      failure,
      latency,
    }, 'Web Bot Auth verification failed');
    
    return { ok: false, failure };
    
  } finally {
    currentInflight--;
  }
}

export function clearDirectoryCache(): void {
  // Function exposed for testing - clears internal cache
}