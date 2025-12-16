/**
 * @peac/middleware-nextjs - Core handler
 *
 * Pure handler function for TAP verification.
 * Runtime-neutral for testability.
 */

import { createResolver, type JwksKeyResolver } from '@peac/jwks-cache';
import { verifyTapProof, TAP_CONSTANTS, type TapRequest } from '@peac/mappings-tap';
import type {
  MiddlewareConfig,
  VerificationMode,
  VerificationResult,
  ReplayStore,
  ReplayContext,
  HandlerRequest,
  HandlerResponse,
} from './types.js';
import {
  ErrorCodes,
  type ErrorCode,
  createErrorHandlerResponse,
  createChallengeHandlerResponse,
  getErrorStatus,
} from './errors.js';

/**
 * Check if request has TAP signature headers.
 */
function hasTapHeaders(headers: Record<string, string>): boolean {
  const signatureInput =
    headers['signature-input'] ?? headers['Signature-Input'] ?? headers['SIGNATURE-INPUT'];
  const signature = headers['signature'] ?? headers['Signature'] ?? headers['SIGNATURE'];
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
 * Check if issuer is in allowlist.
 */
function isIssuerAllowed(keyid: string, allowlist: string[]): boolean {
  const issuerOrigin = extractIssuerFromKeyid(keyid);

  return allowlist.some((allowed) => {
    try {
      const allowedOrigin = new URL(allowed).origin;
      return allowedOrigin === issuerOrigin;
    } catch {
      // If allowed entry is not a valid URL, compare as-is
      return allowed === issuerOrigin;
    }
  });
}

/**
 * Check if path matches any bypass pattern.
 * Supports simple glob patterns (* and **).
 */
function matchesBypassPath(pathname: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars except * and ?
      .replace(/\*\*/g, '.*') // ** matches anything including /
      .replace(/\*/g, '[^/]*'); // * matches anything except /

    const regex = new RegExp(`^${regexPattern}$`);
    if (regex.test(pathname)) {
      return true;
    }
  }
  return false;
}

/**
 * Map TAP error code to handler error code.
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
 * Options for TAP verification.
 */
interface VerifyTapOptions {
  keyResolver: JwksKeyResolver;
  replayStore: ReplayStore | null;
  unsafeAllowUnknownTags: boolean;
  unsafeAllowNoReplay: boolean;
}

/**
 * Verify TAP proof from request headers.
 */
async function verifyTap(
  request: HandlerRequest,
  options: VerifyTapOptions
): Promise<VerificationResult & { warnReplayDisabled?: boolean; warnBestEffortReplay?: boolean }> {
  const { keyResolver, replayStore, unsafeAllowUnknownTags, unsafeAllowNoReplay } = options;

  // Check for TAP headers
  if (!hasTapHeaders(request.headers)) {
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
    headers: request.headers,
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
  let warnReplayDisabled = false;
  let warnBestEffortReplay = false;

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

      // Check if using best-effort store
      if (replayStore.type === 'best-effort') {
        warnBestEffortReplay = true;
      }
    } else if (!unsafeAllowNoReplay) {
      // Fail-closed: reject requests with nonces but no replay store
      return {
        valid: false,
        isTap: true,
        errorCode: ErrorCodes.TAP_REPLAY_PROTECTION_REQUIRED,
        errorMessage:
          'Replay protection required but not configured. ' +
          'Provide a replayStore or set unsafeAllowNoReplay=true (NOT recommended for production).',
      };
    } else {
      // Warn that replay protection is not configured (unsafe mode)
      warnReplayDisabled = true;
    }
  }

  return {
    valid: true,
    isTap: true,
    controlEntry: result.controlEntry,
    warnReplayDisabled,
    warnBestEffortReplay,
  };
}

/**
 * Handle request verification.
 *
 * Returns null if request should be forwarded to origin (success or bypass).
 * Returns HandlerResponse if request should be rejected.
 */
export async function handleRequest(
  request: HandlerRequest,
  config: MiddlewareConfig
): Promise<HandlerResponse | null> {
  const mode: VerificationMode = config.mode ?? 'receipt_or_tap';
  const bypassPaths = config.bypassPaths ?? [];

  // Parse URL
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    // If URL parsing fails, use the raw URL as pathname
    pathname = request.url;
  }

  // Check bypass paths first
  if (matchesBypassPath(pathname, bypassPaths)) {
    return null; // Forward to origin
  }

  // SECURITY: Fail-closed on issuer allowlist
  if (config.issuerAllowlist.length === 0 && !config.unsafeAllowAnyIssuer) {
    return createErrorHandlerResponse(
      ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED,
      'Middleware misconfigured: issuerAllowlist is required. ' +
        'Set unsafeAllowAnyIssuer=true to bypass (NOT recommended for production).'
    );
  }

  // Create JWKS resolver with issuer allowlist
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

  // Verify TAP
  const result = await verifyTap(request, {
    keyResolver,
    replayStore: config.replayStore ?? null,
    unsafeAllowUnknownTags: config.unsafeAllowUnknownTags ?? false,
    unsafeAllowNoReplay: config.unsafeAllowNoReplay ?? false,
  });

  // Non-TAP requests: mode determines behavior
  if (!result.isTap) {
    if (mode === 'receipt_or_tap') {
      // Return 402 challenge (PEAC receipt required)
      return createChallengeHandlerResponse(request.url);
    } else {
      // tap_only mode: return 401 (signature missing)
      return createErrorHandlerResponse(
        ErrorCodes.TAP_SIGNATURE_MISSING,
        'TAP signature required',
        request.url
      );
    }
  }

  // TAP verification failed
  if (!result.valid) {
    // Check if error code is already in our format (from verifyTap internal errors)
    const errorCodeValues = Object.values(ErrorCodes) as string[];
    const isInternalError = result.errorCode && errorCodeValues.includes(result.errorCode);
    const mappedCode = isInternalError ? result.errorCode : mapTapErrorCode(result.errorCode);
    return createErrorHandlerResponse(mappedCode as ErrorCode, result.errorMessage, request.url);
  }

  // TAP verification succeeded - check issuer allowlist
  if (result.controlEntry?.evidence.keyid && !config.unsafeAllowAnyIssuer) {
    const keyid = result.controlEntry.evidence.keyid;
    if (!isIssuerAllowed(keyid, config.issuerAllowlist)) {
      return createErrorHandlerResponse(ErrorCodes.ISSUER_NOT_ALLOWED, 'Issuer not in allowlist');
    }
  }

  // Success - return null to indicate forward to origin
  // Caller should add appropriate headers to the forwarded response
  return null;
}

/**
 * Get verification headers to add to successful response.
 */
export function getVerificationHeaders(
  result: VerificationResult & { warnReplayDisabled?: boolean; warnBestEffortReplay?: boolean }
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-PEAC-Verified': 'true',
    'X-PEAC-Engine': 'tap',
  };

  if (result.controlEntry?.evidence.tag) {
    headers['X-PEAC-TAP-Tag'] = result.controlEntry.evidence.tag;
  }

  if (result.warnReplayDisabled) {
    headers['X-PEAC-Warning'] = 'replay-protection-disabled';
  } else if (result.warnBestEffortReplay) {
    headers['X-PEAC-Warning'] = 'replay-best-effort';
  }

  return headers;
}
