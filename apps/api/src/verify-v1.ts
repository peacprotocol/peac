/**
 * POST /v1/verify (canonical) and /api/v1/verify (deprecated alias)
 *
 * Hosted Verify API: thin wrapper over verifyLocal() from @peac/protocol.
 * Returns deterministic DD-210 verification reports with RFC 9457 errors.
 *
 * Supports two modes:
 * - public_key provided: verify directly (no JWKS fetch, no SSRF)
 * - public_key omitted: resolve key from allowlisted issuers via JWKS
 *
 * Issuer discovery (opt-in via PEAC_ISSUER_DISCOVERY=true): if issuer is not
 * in the allowlist, fetch /.well-known/peac-issuer.json -> jwks_uri -> JWKS.
 */

import type { Context } from 'hono';
import { z } from 'zod';
import { verifyLocal, computePolicyDigestJcs } from '@peac/protocol';
import { decode, base64urlDecode, jwkToPublicKeyBytes } from '@peac/crypto';
import { computeReceiptRef } from '@peac/schema';
import { MemoryRateLimitStore } from '@peac/middleware-core';
import { InMemoryCache, resolveKey, type CacheBackend } from '@peac/jwks-cache';
import { toProblemDetails, type HostedProblemDetails } from './error-catalog.js';
import { loadDiscoveryConfig, discoverAndResolveKey } from './issuer-discovery.js';
import {
  generateReportId,
  buildExtendedReport,
  formatPlainText,
  negotiateFormat,
  redactClaimsForPrivacy,
} from './report-format.js';
import { detectRecordProfile } from './record-profile.js';
import { deterministicStringify } from './utils.js';

const MAX_BODY_SIZE = 256 * 1024; // 256 KB
const PROBLEM_CONTENT_TYPE = 'application/problem+json';

const VerifyRequestSchema = z
  .object({
    receipt: z.string().min(1).max(MAX_BODY_SIZE),
    public_key: z.string().min(1).optional(),
    policy: z
      .object({
        uri: z.string().url().optional(),
        version: z.string().optional(),
      })
      .strict()
      .optional(),
    options: z
      .object({
        issuer: z.string().url().optional(),
        max_clock_skew: z.number().int().positive().max(3600).optional(),
        strictness: z.enum(['strict', 'interop']).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const TrustedIssuerSchema = z.object({
  issuer: z.string().url(),
  jwks_uri: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), { message: 'jwks_uri must use HTTPS' }),
});

type TrustedIssuerEntry = z.infer<typeof TrustedIssuerSchema>;

function loadTrustedIssuers(): TrustedIssuerEntry[] {
  const raw = process.env.PEAC_TRUSTED_ISSUERS_JSON;
  if (!raw) {
    return [
      {
        issuer: 'https://sandbox.peacprotocol.org',
        jwks_uri: 'https://sandbox.peacprotocol.org/.well-known/jwks.json',
      },
    ];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `PEAC_TRUSTED_ISSUERS_JSON is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('PEAC_TRUSTED_ISSUERS_JSON must be a non-empty JSON array');
  }

  return parsed.map((entry, i) => {
    const result = TrustedIssuerSchema.safeParse(entry);
    if (!result.success) {
      const issues = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new Error(`PEAC_TRUSTED_ISSUERS_JSON[${i}] invalid: ${issues.join('; ')}`);
    }
    return result.data;
  });
}

const rateLimitStore = new MemoryRateLimitStore({ maxKeys: 10_000 });
const ANON_LIMIT = 100;
const API_KEY_LIMIT = 1000;
const WINDOW_MS = 60 * 1000;

function getRateLimit(c: Context): { key: string; limit: number } {
  const apiKey = c.req.header('x-api-key');
  if (apiKey) return { key: `key:${apiKey}`, limit: API_KEY_LIMIT };
  let ip = '127.0.0.1';
  if (process.env.PEAC_TRUST_PROXY === '1') {
    ip =
      c.req.header('cf-connecting-ip') ??
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      '127.0.0.1';
  }
  return { key: `ip:${ip}`, limit: ANON_LIMIT };
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
  retryAfter?: number;
}

async function checkRateLimit(key: string, limit: number): Promise<RateLimitResult> {
  const { count, resetAt } = await rateLimitStore.increment(key, WINDOW_MS);
  const now = Date.now();
  const resetSeconds = Math.ceil((resetAt - now) / 1000);
  const remaining = Math.max(0, limit - count);
  if (count > limit) {
    return { allowed: false, remaining: 0, resetSeconds, retryAfter: resetSeconds };
  }
  return { allowed: true, remaining, resetSeconds };
}

function setRateLimitHeaders(c: Context, limit: number, result: RateLimitResult): void {
  c.header('RateLimit-Limit', String(limit));
  c.header('RateLimit-Remaining', String(result.remaining));
  c.header('RateLimit-Reset', String(result.resetSeconds));
}

// deterministicStringify imported from ./utils.js

function problemResponse(c: Context, problem: HostedProblemDetails): Response {
  c.header('Content-Type', PROBLEM_CONTENT_TYPE);
  return c.body(deterministicStringify(problem), problem.status as any);
}

const jwksCache: CacheBackend = new InMemoryCache();

export function createVerifyV1Handler() {
  const trustedIssuers = loadTrustedIssuers();
  const discoveryConfig = loadDiscoveryConfig();

  return async (c: Context) => {
    const startTime = performance.now();
    const reportId = generateReportId();
    const acceptFormat = negotiateFormat(c.req.header('accept'));

    // Security headers on all responses
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'DENY');
    c.header('PEAC-Report-Id', reportId);

    // Rate limit
    const rl = getRateLimit(c);
    const check = await checkRateLimit(rl.key, rl.limit);
    setRateLimitHeaders(c, rl.limit, check);
    if (!check.allowed) {
      c.header('Retry-After', String(check.retryAfter));
      return problemResponse(
        c,
        toProblemDetails('E_RATE_LIMITED', { retry_after: String(check.retryAfter ?? 60) })
      );
    }

    // Body size check
    const contentLength = c.req.header('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return problemResponse(
        c,
        toProblemDetails('E_PAYLOAD_TOO_LARGE', { limit: String(MAX_BODY_SIZE) })
      );
    }

    // Parse JSON
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return problemResponse(c, toProblemDetails('E_INVALID_FORMAT', {}));
    }

    // Validate schema
    const parsed = VerifyRequestSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({
        pointer: `/${i.path.join('/')}`,
        detail: i.message,
      }));
      const problem = toProblemDetails('E_CONSTRAINT_VIOLATION', {
        count: String(errors.length),
      });
      problem.errors = errors;
      return problemResponse(c, problem);
    }

    const { receipt, public_key, options, policy } = parsed.data;

    // Resolve public key
    let publicKeyBytes: Uint8Array;
    let keyResolution: 'provided' | 'allowlist' | 'discovery' = 'provided';

    if (public_key) {
      try {
        publicKeyBytes = base64urlDecode(public_key);
        if (publicKeyBytes.length !== 32) {
          throw new Error('Expected 32-byte Ed25519 public key');
        }
      } catch (err) {
        return problemResponse(
          c,
          toProblemDetails('E_CONSTRAINT_VIOLATION', {
            count: '1',
          })
        );
      }
    } else {
      let header: { kid?: string };
      let payload: { iss?: string };
      try {
        const decoded = decode<{ iss?: string }>(receipt);
        header = decoded.header as { kid?: string };
        payload = decoded.payload;
      } catch {
        return problemResponse(c, toProblemDetails('E_INVALID_FORMAT'));
      }

      const iss = payload.iss;
      const kid = header.kid;
      if (!iss || !kid) {
        return problemResponse(
          c,
          toProblemDetails(
            !kid ? 'E_JWS_MISSING_KID' : 'E_ISS_NOT_CANONICAL',
            !kid ? {} : { issuer: iss ?? '' }
          )
        );
      }

      const trustedEntry = trustedIssuers.find((t) => t.issuer === iss);

      if (!trustedEntry && discoveryConfig.enabled) {
        keyResolution = 'discovery';
        // Opt-in issuer discovery: attempt SSRF-safe resolution
        const discovery = await discoverAndResolveKey(iss, kid, discoveryConfig);
        if (!discovery.ok) {
          return problemResponse(
            c,
            toProblemDetails(discovery.code, {
              issuer: iss,
              kid,
              url: `${iss}/.well-known/peac-issuer.json`,
              reason: discovery.detail,
            })
          );
        }
        publicKeyBytes = discovery.publicKeyBytes;
      } else if (!trustedEntry) {
        // Discovery disabled: reject unknown issuers
        return problemResponse(
          c,
          toProblemDetails('E_VERIFY_ISSUER_CONFIG_MISSING', {
            url: `${iss}/.well-known/peac-issuer.json`,
          })
        );
      } else {
        keyResolution = 'allowlist';
        // Allowlisted issuer: resolve via JWKS cache
        try {
          const resolved = await resolveKey(iss, kid, {
            cache: jwksCache,
            defaultTtlSeconds: 300,
            maxTtlSeconds: 86400,
            minTtlSeconds: 60,
            timeoutMs: 5000,
            maxResponseBytes: 1024 * 1024,
            maxKeys: 100,
            allowLocalhost: false,
            allowStale: true,
            maxStaleAgeSeconds: 172800,
          });
          if (!resolved) {
            return problemResponse(c, toProblemDetails('E_KEY_NOT_FOUND', { kid, issuer: iss }));
          }
          publicKeyBytes = jwkToPublicKeyBytes(resolved.jwk);
        } catch (err) {
          return problemResponse(
            c,
            toProblemDetails('E_JWKS_FETCH_FAILED', {
              issuer: iss,
              reason: err instanceof Error ? err.message : String(err),
            })
          );
        }
      }
    }

    // Compute local policy digest if policy provided in request
    let policyDigest: string | undefined;
    if (policy) {
      policyDigest = await computePolicyDigestJcs(policy);
    }

    // Verify using canonical verifyLocal() from @peac/protocol
    const result = await verifyLocal(receipt, publicKeyBytes, {
      issuer: options?.issuer,
      maxClockSkew: options?.max_clock_skew,
      strictness: options?.strictness,
      policyDigest,
    });

    // Compute receipt_ref (canonical: sha256 of compact JWS bytes)
    const receiptRef = await computeReceiptRef(receipt);

    const durationMs = performance.now() - startTime;

    if (result.valid) {
      // DD-210 deterministic verification report.
      //
      // v0.12.14: top-level `bindings` is included on the report only when
      // the caller supplied a terms or documents binding. When no terms /
      // documents inputs are supplied, the response body is byte-identical
      // to v0.12.13 (legacy `policy_binding` field unchanged; no `bindings`
      // key emitted).
      const includeBindings =
        result.bindings?.terms !== undefined ||
        (result.bindings?.documents !== undefined && result.bindings.documents.length > 0);
      // Apply the no_raw_personal_data redactor when the deployment
      // opted in via PEAC_NO_RAW_PERSONAL_DATA. When the env flag is
      // unset (the default), the redactor is a no-op and the report
      // body is byte-identical to v0.12.13 behavior. See
      // docs/privacy/RETENTION-AND-DELETION.md §5.
      const reportClaims = redactClaimsForPrivacy(result.claims as Record<string, unknown>);
      const standardReport = {
        verified: true as const,
        receipt_ref: receiptRef,
        claims: reportClaims,
        warnings: result.warnings,
        policy_binding: result.policy_binding,
        ...(includeBindings && { bindings: result.bindings }),
        issuer: result.claims.iss,
        kid: result.kid,
        wire_version: result.wireVersion,
      };

      const recordProfile = detectRecordProfile(
        (result.claims as Record<string, unknown>)?.type as string | undefined
      );

      if (acceptFormat === 'extended') {
        const extended = buildExtendedReport(
          {
            verified: true,
            receipt_ref: receiptRef,
            claims: standardReport.claims,
            warnings: result.warnings,
            policy_binding: result.policy_binding,
            ...(includeBindings && { bindings: result.bindings }),
            issuer: result.claims.iss,
            kid: result.kid,
            wire_version: result.wireVersion,
          },
          reportId,
          durationMs,
          keyResolution,
          recordProfile ?? undefined
        );
        c.header('Content-Type', 'application/peac-report+json');
        return c.body(deterministicStringify(extended), 200);
      }

      if (acceptFormat === 'plain') {
        const extended = buildExtendedReport(
          {
            verified: true,
            receipt_ref: receiptRef,
            claims: standardReport.claims,
            warnings: result.warnings,
            policy_binding: result.policy_binding,
            ...(includeBindings && { bindings: result.bindings }),
            issuer: result.claims.iss,
            kid: result.kid,
            wire_version: result.wireVersion,
          },
          reportId,
          durationMs,
          keyResolution,
          recordProfile ?? undefined
        );
        c.header('Content-Type', 'text/plain');
        return c.body(formatPlainText(extended), 200);
      }

      // Default: standard JSON (byte-identical to v0.12.8 response body)
      c.header('Content-Type', 'application/json');
      return c.body(deterministicStringify(standardReport), 200);
    }

    // Verification failed: map error code to RFC 9457 Problem Details
    // Include failure_reasons in extended and plain formats
    const problem = toProblemDetails(result.code, {});
    problem.detail = result.message;

    if (acceptFormat === 'extended') {
      const extended = buildExtendedReport(
        {
          verified: false,
          receipt_ref: receiptRef,
          error_code: result.code,
          error_message: result.message,
        },
        reportId,
        durationMs,
        keyResolution
      );
      c.header('Content-Type', 'application/peac-report+json');
      return c.body(deterministicStringify(extended), 200);
    }

    return problemResponse(c, problem);
  };
}

export function resetVerifyV1RateLimit(): void {
  rateLimitStore.clear();
}
