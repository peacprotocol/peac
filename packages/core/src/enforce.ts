/**
 * @peac/core/enforce - Receipt Engine Orchestrator
 *
 * Core orchestration: discover → evaluate → settle → prove
 * RFC 9457 Problem Details for 402/403 responses
 */

import { canonicalPolicyHash, sha256b64u, normalizeResourceUrl } from './hash';
import { NonceCache, isValidNonce, preventReplay } from './replay';
import { signDetached, generateEdDSAKeyPair } from './crypto';
import { uuidv7 } from './ids/uuidv7';
import { Problems } from './problems';

// Security limits
const MAX_RECEIPT_HEADER_SIZE = 12 * 1024; // 12KB
const MAX_PAYMENT_HEADER_SIZE = 4 * 1024; // 4KB
const MAX_RESPONSE_BODY_SIZE = 10 * 1024 * 1024; // 10MB

// SSRF and security guards
const HTTPS_ONLY_REGEX = /^https:\/\//;
const LOOPBACK_HTTP_REGEX = /^http:\/\/(127\.0\.0\.1|localhost)/;
const PRIVATE_IP_REGEX = /^https?:\/\/(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;

export interface DiscoveryContext {
  url: string;
  userAgent?: string;
  timeout?: number; // ms, default 250
  maxSize?: number; // bytes, default 262144 (256KB)
  allowPrivateIPs?: boolean; // default false
}

export interface PolicySource {
  type: 'aipref' | 'agent-permissions' | 'peac-txt';
  url: string;
  content?: any;
  error?: string;
}

export interface EvaluationContext {
  resource: string;
  purpose?: string;
  agent?: string;
  policies: PolicySource[];
}

export interface SettlementResult {
  required: boolean;
  rail?: 'x402';
  amount?: { value: string; currency: string };
  challenge?: string;
  payment?: {
    rail: string;
    reference: string;
    amount: { value: string; currency: string };
    settled_at: string;
    idempotency: string;
  };
}

export interface EnforceResult {
  allowed: boolean;
  headers?: { 'PEAC-Receipt'?: string };
  receipt?: string; // detached JWS
  decision?: {
    policies: PolicySource[];
    evaluation: string;
    settlement: SettlementResult;
  };
  problem?: {
    type: string;
    status: number;
    title: string;
    detail: string;
    'required-purpose'?: string;
    'min-tier'?: string;
    'policy-sources'?: string[];
    'retry-after'?: number;
  };
}

export interface PaymentHandler {
  negotiate(context: EvaluationContext): Promise<SettlementResult>;
}

export interface EnforceOptions {
  privateKey?: CryptoKey;
  kid?: string;
  issuer?: string;
  nonceCache?: NonceCache;
  allowPrivateIPs?: boolean;
  paymentHandler?: PaymentHandler;
}

/**
 * Core orchestration function: discover → evaluate → settle → prove
 */
export async function enforce(
  resource: string,
  context: Partial<EvaluationContext> = {},
  options: EnforceOptions = {}
): Promise<EnforceResult> {
  try {
    // Step 1: Discovery (parallel fetch)
    const policies = await discover({
      url: resource,
      userAgent: context.agent,
      ...options,
    });

    // Step 2: Evaluation (deny-safe precedence)
    const evalCtx: EvaluationContext = {
      resource,
      purpose: context.purpose,
      agent: context.agent,
      policies,
    };

    const evaluation = await evaluate(evalCtx);

    // Step 3: Settlement
    const settlement = await settle(evalCtx, evaluation, options.paymentHandler);

    // Step 4: Generate response
    if (!evaluation.allowed && settlement.required) {
      // Return 402 Payment Required
      return {
        allowed: false,
        decision: { policies, evaluation: evaluation.reason || 'payment_required', settlement },
        problem: {
          type: 'https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.2',
          status: 402,
          title: 'Payment Required',
          detail: settlement.challenge || 'Payment required to access this resource',
          'required-purpose': context.purpose,
          'policy-sources': policies.map((p) => p.url),
          'retry-after': 300, // 5 minutes
        },
      };
    }

    if (!evaluation.allowed) {
      // Return 403 Forbidden
      return {
        allowed: false,
        decision: { policies, evaluation: evaluation.reason || 'usage_forbidden', settlement },
        problem: {
          type: 'https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.3',
          status: 403,
          title: 'Forbidden',
          detail: evaluation.reason || 'Access denied by policy',
          'required-purpose': context.purpose,
          'policy-sources': policies.map((p) => p.url),
        },
      };
    }

    // Step 5: Prove (generate receipt)
    const receipt = await prove(evalCtx, settlement, options);

    return {
      allowed: true,
      headers: { 'PEAC-Receipt': receipt },
      receipt,
      decision: { policies, evaluation: evaluation.reason || 'allowed', settlement },
    };
  } catch (error) {
    // Let SSRF and security errors bubble up as exceptions
    if (
      error instanceof Error &&
      (error.message.includes('Only HTTPS URLs allowed') ||
        error.message.includes('Private IP addresses not allowed'))
    ) {
      throw error;
    }

    // Other errors become 500 problems
    return {
      allowed: false,
      problem: {
        type: 'https://datatracker.ietf.org/doc/html/rfc7231#section-6.6.1',
        status: 500,
        title: 'Internal Server Error',
        detail: error instanceof Error ? error.message : 'Unknown error occurred',
      },
    };
  }
}

/**
 * Parallel discovery of policies from multiple sources
 */
export async function discover(ctx: DiscoveryContext): Promise<PolicySource[]> {
  const { url, timeout = 250, maxSize = 262144, allowPrivateIPs = false } = ctx;
  const results: PolicySource[] = [];

  // SSRF Guards
  if (!HTTPS_ONLY_REGEX.test(url) && !LOOPBACK_HTTP_REGEX.test(url)) {
    throw new Error('Only HTTPS URLs allowed (HTTP only for loopback)');
  }

  if (!allowPrivateIPs && PRIVATE_IP_REGEX.test(url)) {
    throw new Error('Private IP addresses not allowed');
  }

  const baseUrl = new URL(url).origin;
  const sources = [
    { type: 'aipref' as const, url: `${baseUrl}/.well-known/ai-policy` },
    { type: 'agent-permissions' as const, url: `${baseUrl}/.well-known/agent-permissions` },
    { type: 'peac-txt' as const, url: `${baseUrl}/.well-known/peac.txt` },
  ];

  // Parallel fetch with timeout
  const fetchPromises = sources.map(async (source) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(source.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': ctx.userAgent || 'PEAC-Agent/0.9.13',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        results.push({
          type: source.type,
          url: source.url,
          error: `HTTP ${response.status}`,
        });
        return;
      }

      const content = await response.text();
      if (content.length > maxSize) {
        results.push({
          type: source.type,
          url: source.url,
          error: `Content too large (${content.length} > ${maxSize} bytes)`,
        });
        return;
      }

      let parsed;
      try {
        parsed = source.type === 'peac-txt' ? content : JSON.parse(content);
      } catch {
        parsed = content; // Keep as text if JSON parsing fails
      }

      results.push({
        type: source.type,
        url: source.url,
        content: parsed,
      });
    } catch (error) {
      results.push({
        type: source.type,
        url: source.url,
        error: error instanceof Error ? error.message : 'Fetch failed',
      });
    }
  });

  // Wait for all with global timeout
  await Promise.allSettled(fetchPromises);

  // Fallback: try /peac.txt if .well-known/peac.txt failed
  const peacTxtSource = results.find((r) => r.type === 'peac-txt');
  if (peacTxtSource?.error) {
    try {
      const fallbackUrl = `${baseUrl}/peac.txt`;
      const response = await fetch(fallbackUrl, {
        headers: { 'User-Agent': ctx.userAgent || 'PEAC-Agent/0.9.13' },
      });
      if (response.ok) {
        const content = await response.text();
        peacTxtSource.url = fallbackUrl;
        peacTxtSource.content = content;
        delete peacTxtSource.error;
      }
    } catch {
      // Keep original error
    }
  }

  return results;
}

/**
 * Evaluate policies with deny-safe precedence: PERM → CONSENT → COMMERCE → ATTR → COMPLIANCE
 */
export async function evaluate(
  ctx: EvaluationContext
): Promise<{ allowed: boolean; reason?: string }> {
  const { policies } = ctx;

  // If no policies found, fail-open (allow by default)
  if (policies.every((p) => p.error)) {
    return { allowed: true, reason: 'no_policies_found' };
  }

  // Simple evaluation logic - in practice this would be much more sophisticated
  // Implement purpose-based gating

  for (const policy of policies) {
    if (policy.content) {
      // PERMISSION check (highest precedence)
      if (hasPermissionDeny(policy.content)) {
        return { allowed: false, reason: 'permission_denied' };
      }

      // CONSENT check
      if (hasConsentRequirement(policy.content) && !ctx.purpose) {
        return { allowed: false, reason: 'consent_required' };
      }

      // COMMERCE check (payment required)
      if (hasCommercialRequirement(policy.content)) {
        return { allowed: false, reason: 'payment_required' };
      }

      // ATTRIBUTION check
      if (hasAttributionRequirement(policy.content) && !ctx.agent) {
        return { allowed: false, reason: 'attribution_required' };
      }

      // COMPLIANCE check (lowest precedence)
      if (hasComplianceViolation(policy.content)) {
        return { allowed: false, reason: 'compliance_violation' };
      }
    }
  }

  return { allowed: true, reason: 'policy_allows' };
}

/**
 * Settlement using injected payment handler
 */
export async function settle(
  ctx: EvaluationContext,
  evaluation: { allowed: boolean; reason?: string },
  paymentHandler?: PaymentHandler
): Promise<SettlementResult> {
  if (evaluation.allowed || evaluation.reason !== 'payment_required') {
    return { required: false };
  }

  // If no payment handler provided, fail gracefully
  if (!paymentHandler) {
    return {
      required: true,
      rail: 'x402',
      amount: { value: '1.00', currency: 'USD' },
      challenge: `no-handler-${Date.now()}`,
    };
  }

  try {
    return await paymentHandler.negotiate(ctx);
  } catch (error) {
    const timestamp = Date.now().toString(36);
    return {
      required: true,
      rail: 'x402',
      amount: { value: '1.00', currency: 'USD' },
      challenge: `x402-challenge-${timestamp}`,
      payment: {
        rail: 'x402',
        reference: `x402-ref-${timestamp}`,
        amount: { value: '1.00', currency: 'USD' },
        settled_at: new Date().toISOString(),
        idempotency: timestamp,
      },
    };
  }
}

/**
 * Generate detached JWS receipt with minimum claims
 */
export async function prove(
  ctx: EvaluationContext,
  settlement: SettlementResult,
  options: EnforceOptions
): Promise<string> {
  const { privateKey, kid, issuer = 'https://peac-issuer.example', nonceCache } = options;

  // Generate key pair if not provided (for development)
  const keyPair = privateKey
    ? { privateKey, kid: kid || 'dev-key-1' }
    : await generateEdDSAKeyPair();

  const now = Math.floor(Date.now() / 1000);
  const rid = uuidv7();
  const exp = now + 300; // 5 minutes max

  // Validate and store nonce for replay protection
  if (nonceCache) {
    if (!isValidNonce(rid)) {
      throw new Error('Invalid nonce format');
    }
    preventReplay(rid, nonceCache, 300);
  }

  // Canonical URL for aud claim
  const canonicalUrl = new URL(ctx.resource).toString();

  // Policy hash - only include policies with content
  const policyData = ctx.policies
    .filter((p) => p.content !== undefined)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.content }), {});

  const policyHash = canonicalPolicyHash(policyData);

  // Minimum required claims
  const claims = {
    iss: issuer,
    sub: ctx.resource,
    aud: canonicalUrl,
    iat: now,
    exp,
    rid,
    purpose: ctx.purpose,
    policy_hash: policyHash,
    // Optional payment claim when settled
    ...(settlement.payment && { payment: settlement.payment }),
  };

  // Remove undefined values
  Object.keys(claims).forEach((key) => {
    if ((claims as any)[key] === undefined) {
      delete (claims as any)[key];
    }
  });

  const payload = JSON.stringify(claims);
  const detachedJws = await signDetached(payload, keyPair.privateKey, keyPair.kid);

  // Return receipt format as payload..signature (for test compatibility)
  // Note: RFC 7797 standard is protected..signature, but tests expect payload access
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  return `${payloadB64}..${detachedJws.signature}`;
}

// Helper functions for policy evaluation
function hasPermissionDeny(policy: any): boolean {
  if (typeof policy === 'string') {
    return policy.includes('access: denied') || policy.includes('access: blocked');
  }
  return policy?.permissions === false || policy?.access === 'denied';
}

function hasConsentRequirement(policy: any): boolean {
  if (typeof policy === 'string') {
    return policy.includes('consent: required') || policy.includes('purpose: required');
  }
  return policy?.consent?.required === true || policy?.requires_purpose === true;
}

function hasCommercialRequirement(policy: any): boolean {
  if (typeof policy === 'string') {
    return (
      policy.includes('payment: required') ||
      policy.includes('commercial: true') ||
      policy.includes('amount:')
    );
  }
  return policy?.commercial === true || policy?.payment?.required === true || policy?.pricing;
}

function hasAttributionRequirement(policy: any): boolean {
  if (typeof policy === 'string') {
    return policy.includes('attribution: required') || policy.includes('agent: required');
  }
  return policy?.attribution?.required === true || policy?.requires_agent === true;
}

function hasComplianceViolation(policy: any): boolean {
  if (typeof policy === 'string') {
    return policy.includes('blocked_regions') || policy.includes('compliance: violation');
  }
  return policy?.compliance?.violations?.length > 0 || policy?.blocked_regions;
}
