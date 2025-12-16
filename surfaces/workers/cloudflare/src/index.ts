/**
 * @peac/worker-cloudflare
 *
 * PEAC receipt verification worker for Cloudflare Workers.
 *
 * Features:
 * - TAP (Trusted Agent Protocol) verification
 * - PEAC receipt verification
 * - Pluggable replay protection (DO/D1/KV)
 * - RFC 9457 problem+json error responses
 * - Configurable issuer allowlist
 * - Path-based bypass
 *
 * @see https://peacprotocol.org
 */

import { createResolver, type JwksKeyResolver } from '@peac/jwks-cache';
import {
  verifyTapProof,
  headersToRecord,
  TAP_CONSTANTS,
  type TapRequest,
} from '@peac/mappings-tap';
import type { Env, VerificationResult, ReplayStore, ReplayContext } from './types.js';
import { parseConfig, matchesBypassPath, isIssuerAllowed } from './config.js';
import { createReplayStore } from './replay-store.js';
import { createErrorResponse, createChallengeResponse, ErrorCodes } from './errors.js';

// Re-export types and utilities
export type {
  Env,
  WorkerConfig,
  ReplayStore,
  ReplayContext,
  VerificationResult,
  ProblemDetails,
} from './types.js';
export { parseConfig, matchesBypassPath, isIssuerAllowed } from './config.js';
export {
  createReplayStore,
  DurableObjectReplayStore,
  D1ReplayStore,
  KVReplayStore,
  NoOpReplayStore,
  ReplayDurableObject,
} from './replay-store.js';
export { ErrorCodes, createErrorResponse, createChallengeResponse } from './errors.js';

/**
 * Check if request has TAP signature headers.
 */
function hasTapHeaders(headers: Record<string, string>): boolean {
  const signatureInput = headers['signature-input'] ?? headers['Signature-Input'];
  const signature = headers['signature'] ?? headers['Signature'];
  return Boolean(signatureInput && signature);
}

/**
 * Extract issuer origin from keyid.
 *
 * TAP keyid is typically a JWKS URI like "https://issuer.example.com/.well-known/jwks.json#key-1"
 */
function extractIssuerFromKeyid(keyid: string): string {
  try {
    const url = new URL(keyid);
    return url.origin;
  } catch {
    // If keyid is not a URL, use it as-is
    return keyid;
  }
}

/**
 * Options for TAP verification.
 */
interface VerifyTapOptions {
  keyResolver: JwksKeyResolver;
  replayStore: ReplayStore | null;
  unsafeAllowUnknownTags: boolean;
  unsafeAllowNoReplay: boolean;
  warnNoReplayStore: () => void;
}

/**
 * Verify TAP proof from request.
 *
 * Security: Fail-closed by default.
 * - Unknown tags are rejected unless unsafeAllowUnknownTags=true
 * - Nonces require replay protection unless unsafeAllowNoReplay=true
 */
async function verifyTap(request: Request, options: VerifyTapOptions): Promise<VerificationResult> {
  const {
    keyResolver,
    replayStore,
    unsafeAllowUnknownTags,
    unsafeAllowNoReplay,
    warnNoReplayStore,
  } = options;

  // Convert Headers to Record for runtime neutrality
  const headers = headersToRecord(request.headers);

  // Check for TAP headers
  if (!hasTapHeaders(headers)) {
    return {
      valid: false,
      isTap: false,
      errorCode: ErrorCodes.TAP_SIGNATURE_MISSING,
      errorMessage: 'No TAP signature headers present',
    };
  }

  // Build TAP request
  const tapRequest: TapRequest = {
    method: request.method,
    url: request.url,
    headers,
    // Body not needed for typical TAP verification (headers only)
  };

  // Verify TAP proof
  const result = await verifyTapProof(tapRequest, {
    keyResolver,
    allowUnknownTags: unsafeAllowUnknownTags,
  });

  if (!result.valid) {
    return {
      valid: false,
      isTap: true,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    };
  }

  // Check nonce replay protection
  const evidence = result.controlEntry?.evidence;
  if (evidence?.nonce && evidence?.keyid) {
    if (replayStore) {
      const replayCtx: ReplayContext = {
        issuer: extractIssuerFromKeyid(evidence.keyid),
        keyid: evidence.keyid,
        nonce: evidence.nonce,
        ttlSeconds: TAP_CONSTANTS.MAX_WINDOW_SECONDS,
      };

      const isReplay = await replayStore.seen(replayCtx);

      if (isReplay) {
        return {
          valid: false,
          isTap: true,
          errorCode: ErrorCodes.TAP_NONCE_REPLAY,
          errorMessage: 'Nonce replay detected',
        };
      }
    } else if (!unsafeAllowNoReplay) {
      // Fail-closed: reject requests with nonces but no replay store
      // unless UNSAFE_ALLOW_NO_REPLAY=true
      return {
        valid: false,
        isTap: true,
        errorCode: ErrorCodes.TAP_REPLAY_PROTECTION_REQUIRED,
        errorMessage:
          'Replay protection required but not configured. ' +
          'Set UNSAFE_ALLOW_NO_REPLAY=true to bypass (UNSAFE for production).',
      };
    } else {
      // Warn that replay protection is not configured (unsafe mode)
      warnNoReplayStore();
    }
  }

  return {
    valid: true,
    isTap: true,
    controlEntry: result.controlEntry,
  };
}

/**
 * Map TAP error code to worker error code.
 */
function mapTapErrorCode(tapErrorCode: string | undefined): string {
  if (!tapErrorCode) {
    return ErrorCodes.TAP_SIGNATURE_INVALID;
  }

  // Map common TAP error codes
  const mapping: Record<string, string> = {
    E_TAP_WINDOW_TOO_LARGE: ErrorCodes.TAP_WINDOW_TOO_LARGE,
    E_TAP_TIME_INVALID: ErrorCodes.TAP_TIME_INVALID,
    E_TAP_ALGORITHM_INVALID: ErrorCodes.TAP_ALGORITHM_INVALID,
    E_TAP_TAG_UNKNOWN: ErrorCodes.TAP_TAG_UNKNOWN,
    E_SIGNATURE_INVALID: ErrorCodes.TAP_SIGNATURE_INVALID,
    E_KEY_NOT_FOUND: ErrorCodes.TAP_KEY_NOT_FOUND,
  };

  return mapping[tapErrorCode] ?? ErrorCodes.TAP_SIGNATURE_INVALID;
}

/**
 * Main worker handler.
 *
 * Security: Fail-closed by default.
 * - ISSUER_ALLOWLIST is required unless UNSAFE_ALLOW_ANY_ISSUER=true
 * - Unknown TAP tags are rejected unless UNSAFE_ALLOW_UNKNOWN_TAGS=true
 * - Replay protection is required unless UNSAFE_ALLOW_NO_REPLAY=true
 */
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const config = parseConfig(env);
  const url = new URL(request.url);

  // Check bypass paths first (before any config validation)
  if (matchesBypassPath(url.pathname, config.bypassPaths)) {
    return fetch(request);
  }

  // SECURITY: Fail-closed on ISSUER_ALLOWLIST
  // If no allowlist is configured and UNSAFE_ALLOW_ANY_ISSUER is not set,
  // return a 500 configuration error
  if (config.issuerAllowlist.length === 0 && !config.unsafeAllowAnyIssuer) {
    console.error(
      '[PEAC] FATAL: ISSUER_ALLOWLIST is required. ' +
        'Set ISSUER_ALLOWLIST to a comma-separated list of allowed issuer origins, ' +
        'or set UNSAFE_ALLOW_ANY_ISSUER=true for development (NOT recommended for production).'
    );
    return createErrorResponse(
      ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED,
      'Worker misconfigured: ISSUER_ALLOWLIST is required. ' +
        'Set UNSAFE_ALLOW_ANY_ISSUER=true to bypass (UNSAFE for production).'
    );
  }

  // Create JWKS resolver with issuer allowlist (or allow all if UNSAFE mode)
  const keyResolver = createResolver({
    isAllowedHost: (host) => {
      if (config.unsafeAllowAnyIssuer) {
        return true; // UNSAFE: Open access
      }
      return config.issuerAllowlist.some((allowed) => {
        try {
          return new URL(allowed).host === host;
        } catch {
          return false;
        }
      });
    },
  });

  // Create replay store
  const replayStore = createReplayStore(env);

  // Track if we should warn about missing replay store (only in UNSAFE mode)
  let noReplayStoreWarning = false;
  const warnNoReplayStore = () => {
    noReplayStoreWarning = true;
    console.warn(
      '[PEAC] WARNING: No replay store configured with UNSAFE_ALLOW_NO_REPLAY=true. ' +
        'Replay attacks are possible. This is UNSAFE for production.'
    );
  };

  // Verify TAP
  const result = await verifyTap(request, {
    keyResolver,
    replayStore,
    unsafeAllowUnknownTags: config.unsafeAllowUnknownTags,
    unsafeAllowNoReplay: config.unsafeAllowNoReplay,
    warnNoReplayStore,
  });

  // Non-TAP requests pass through
  if (!result.isTap) {
    // Return 402 challenge for non-TAP requests that need payment
    return createChallengeResponse(request.url);
  }

  // TAP verification failed
  if (!result.valid) {
    const errorCode = mapTapErrorCode(result.errorCode);
    return createErrorResponse(errorCode as any, result.errorMessage, request.url);
  }

  // TAP verification succeeded - check issuer allowlist
  // (Skip if UNSAFE_ALLOW_ANY_ISSUER is set)
  if (result.controlEntry?.evidence.keyid && !config.unsafeAllowAnyIssuer) {
    const keyid = result.controlEntry.evidence.keyid;
    if (!isIssuerAllowed(keyid, config.issuerAllowlist)) {
      return createErrorResponse(
        ErrorCodes.ISSUER_NOT_ALLOWED,
        `Issuer not in allowlist`,
        request.url
      );
    }
  }

  // Forward request to origin with verification metadata
  const response = await fetch(request);

  // Add verification headers to response
  const headers = new Headers(response.headers);
  headers.set('X-PEAC-Verified', 'true');
  headers.set('X-PEAC-Engine', 'tap');

  if (result.controlEntry?.evidence.tag) {
    headers.set('X-PEAC-TAP-Tag', result.controlEntry.evidence.tag);
  }

  // Warn in response header if replay protection is not configured (UNSAFE mode only)
  if (noReplayStoreWarning) {
    headers.set('X-PEAC-Warning', 'replay-protection-disabled');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Worker entry point.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error('Worker error:', error);
      return createErrorResponse(
        ErrorCodes.INTERNAL_ERROR,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  },
};
