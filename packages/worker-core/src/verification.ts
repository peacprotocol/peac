/**
 * PEAC Worker Core - Verification Logic
 *
 * Runtime-neutral TAP verification handler.
 * Returns handler results that runtimes convert to platform-specific responses.
 *
 * Security: Fail-closed by default.
 * - ISSUER_ALLOWLIST is required (500 if empty)
 * - Unknown TAP tags are rejected (400)
 * - Replay protection is required when nonce present (401)
 * - 402 is ONLY for payment remedy (missing TAP is 401)
 *
 * @packageDocumentation
 */

import {
  verifyTapProof,
  TAP_CONSTANTS,
  type TapRequest,
} from '@peac/mappings-tap';
import type {
  InternalWorkerConfig,
  RequestLike,
  InternalVerifyTapOptions,
  VerificationResult,
  ReplayContext,
  HandlerResult,
} from './types.js';
import { matchesBypassPath, isIssuerAllowed } from './config.js';
import { ErrorCodes, createProblemDetails, mapTapErrorCode } from './errors.js';
import { MODE_BEHAVIOR, type VerificationMode } from '@peac/contracts';

/**
 * Check if request has TAP signature headers.
 */
export function hasTapHeaders(headers: Record<string, string>): boolean {
  const signatureInput = headers['signature-input'] ?? headers['Signature-Input'];
  const signature = headers['signature'] ?? headers['Signature'];
  return Boolean(signatureInput && signature);
}

/**
 * Extract issuer origin from keyid.
 *
 * TAP keyid is typically a JWKS URI like "https://issuer.example.com/.well-known/jwks.json#key-1"
 */
export function extractIssuerFromKeyid(keyid: string): string {
  try {
    const url = new URL(keyid);
    return url.origin;
  } catch {
    // If keyid is not a URL, use it as-is
    return keyid;
  }
}

/**
 * Convert Headers-like to Record for runtime neutrality.
 */
export function headersToPlainObject(headers: {
  entries(): IterableIterator<[string, string]>;
}): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    result[key] = value;
  }
  return result;
}

/**
 * Verify TAP proof from request headers.
 *
 * Security: Fail-closed by default.
 * - Unknown tags are rejected unless unsafeAllowUnknownTags=true
 * - Nonces require replay protection unless unsafeAllowNoReplay=true
 *
 * @param headers - Request headers as Record
 * @param method - HTTP method
 * @param url - Request URL
 * @param options - Verification options
 * @returns Verification result
 */
export async function verifyTap(
  headers: Record<string, string>,
  method: string,
  url: string,
  options: InternalVerifyTapOptions
): Promise<VerificationResult> {
  const {
    keyResolver,
    replayStore,
    unsafeAllowUnknownTags,
    unsafeAllowNoReplay,
    warnNoReplayStore,
  } = options;

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
    method,
    url,
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
 * Handle a verification request.
 *
 * This is the main handler logic that each runtime calls.
 * Returns a HandlerResult that runtimes convert to platform-specific responses.
 *
 * HTTP Status Code Semantics:
 * - 400: Malformed TAP (unknown tags, invalid algorithm, window too large)
 * - 401: Missing/invalid TAP headers, signature invalid, expired, key not found
 * - 402: Receipt required (ONLY when mode is receipt_or_tap)
 * - 403: Issuer not in allowlist
 * - 409: Replay detected
 * - 500: Configuration error
 *
 * CRITICAL: 402 is ONLY used when the remedy is payment/settlement.
 * Missing TAP headers in tap_only mode returns 401 (DEFAULT).
 *
 * @param request - Platform-agnostic request
 * @param config - Worker configuration
 * @param options - Verification options
 * @param mode - Verification mode (default: 'tap_only')
 * @returns Handler result
 */
export async function handleVerification(
  request: RequestLike,
  config: InternalWorkerConfig,
  options: Omit<InternalVerifyTapOptions, 'warnNoReplayStore'>,
  mode: VerificationMode = 'tap_only'
): Promise<HandlerResult> {
  const url = new URL(request.url);

  // Check bypass paths first (before any config validation)
  if (matchesBypassPath(url.pathname, config.bypassPaths)) {
    return { action: 'pass' };
  }

  // SECURITY: Fail-closed on ISSUER_ALLOWLIST
  // If no allowlist is configured and UNSAFE_ALLOW_ANY_ISSUER is not set,
  // return a 500 configuration error
  if (config.issuerAllowlist.length === 0 && !config.unsafeAllowAnyIssuer) {
    const problem = createProblemDetails(
      ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED,
      'Worker misconfigured: ISSUER_ALLOWLIST is required. ' +
        'Set UNSAFE_ALLOW_ANY_ISSUER=true to bypass (UNSAFE for production).'
    );
    return {
      action: 'error',
      status: problem.status,
      errorCode: ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED,
      problem,
      requestUrl: request.url,
    };
  }

  // Track warning for missing replay store
  let replayWarning: string | undefined;
  const warnNoReplayStore = () => {
    replayWarning = 'replay-protection-disabled';
  };

  // Convert headers to plain object
  const headers = headersToPlainObject(request.headers);

  // Verify TAP
  const result = await verifyTap(headers, request.method, request.url, {
    ...options,
    warnNoReplayStore,
  });

  // Non-TAP requests: behavior depends on mode (table-driven from canonical contract)
  if (!result.isTap) {
    const behavior = MODE_BEHAVIOR[mode];

    const problem = createProblemDetails(behavior.code, undefined, request.url);

    return {
      action: behavior.action,
      status: behavior.status,
      errorCode: behavior.code,
      problem,
      requestUrl: request.url,
    };
  }

  // TAP verification failed
  if (!result.valid) {
    const errorCode = mapTapErrorCode(result.errorCode);
    const problem = createProblemDetails(errorCode, result.errorMessage, request.url);
    return {
      action: 'error',
      status: problem.status,
      errorCode,
      errorDetail: result.errorMessage,
      problem,
      requestUrl: request.url,
    };
  }

  // TAP verification succeeded - check issuer allowlist
  // (Skip if UNSAFE_ALLOW_ANY_ISSUER is set)
  if (result.controlEntry?.evidence.keyid && !config.unsafeAllowAnyIssuer) {
    const keyid = result.controlEntry.evidence.keyid;
    if (!isIssuerAllowed(keyid, config.issuerAllowlist)) {
      const problem = createProblemDetails(
        ErrorCodes.ISSUER_NOT_ALLOWED,
        'Issuer not in allowlist',
        request.url
      );
      return {
        action: 'error',
        status: problem.status,
        errorCode: ErrorCodes.ISSUER_NOT_ALLOWED,
        problem,
        requestUrl: request.url,
      };
    }
  }

  // Verification succeeded - forward request
  return {
    action: 'forward',
    controlEntry: result.controlEntry,
    warning: replayWarning,
  };
}
