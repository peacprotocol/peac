/**
 * PEAC Protocol Version Enforcement Middleware
 *
 * Implements strict protocol versioning for write endpoints:
 * - Requires X-PEAC-Protocol header on write operations
 * - Returns RFC7807 400 error on missing/mismatched versions
 * - Allows reads to proceed without version (backward compatibility)
 */

import { Request, Response, NextFunction } from 'express';
import {
  PROTOCOL_HEADER,
  getExpectedProtocolHeader,
  isProtocolVersionSupported,
  MIN_PROTOCOL_VERSION,
} from '../version';
import { problemDetails } from '../http/problems';
import { logger } from '../logging';

/**
 * Configuration for protocol version enforcement
 */
export interface ProtocolVersionConfig {
  enforceOnReads?: boolean; // Default: false (reads are optional)
  enforceOnWrites?: boolean; // Default: true (writes require version)
  allowedMethods?: string[]; // Methods that require version checking
}

/**
 * Paths exempt from protocol version enforcement
 * Webhooks are inbound from third parties and use HMAC verification instead
 */
const EXEMPT_PATHS = [/^\/webhooks\//];

/**
 * Default configuration - strict on writes, optional on reads
 */
const DEFAULT_CONFIG: Required<ProtocolVersionConfig> = {
  enforceOnReads: false,
  enforceOnWrites: true,
  allowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
};

/**
 * Protocol version enforcement middleware factory
 */
export function createProtocolVersionMiddleware(config: ProtocolVersionConfig = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip enforcement for exempt paths (webhooks, etc.)
    // Check both path and originalUrl for mounted apps
    const pathToCheck = req.originalUrl || req.path;
    if (EXEMPT_PATHS.some((rx) => rx.test(pathToCheck))) {
      return next();
    }

    const method = req.method.toUpperCase();
    const isWriteMethod = finalConfig.allowedMethods.includes(method);
    const shouldEnforce = isWriteMethod ? finalConfig.enforceOnWrites : finalConfig.enforceOnReads;

    // Skip enforcement if not required for this method
    if (!shouldEnforce) {
      return next();
    }

    const providedVersion = req.get(PROTOCOL_HEADER);
    const expectedVersion = getExpectedProtocolHeader();

    // Check if version header is missing
    if (!providedVersion) {
      logger.warn(
        {
          method,
          path: req.path,
          expected: expectedVersion,
          provided: null,
          requestId: res.get('X-Request-Id'),
        },
        'Missing protocol version header',
      );

      return problemDetails.send(res, 'protocol_version_required', {
        title: 'Protocol Version Required',
        detail: `Missing required ${PROTOCOL_HEADER} header for write operations`,
        expected_version: expectedVersion,
        min_version: MIN_PROTOCOL_VERSION,
        provided_version: null,
        required_header: PROTOCOL_HEADER,
      });
    }

    // Check if version is supported
    if (!isProtocolVersionSupported(providedVersion)) {
      logger.warn(
        {
          method,
          path: req.path,
          expected: expectedVersion,
          provided: providedVersion,
          requestId: res.get('X-Request-Id'),
        },
        'Unsupported protocol version',
      );

      return problemDetails.send(res, 'protocol_version_unsupported', {
        title: 'Protocol Version Unsupported',
        detail: `Protocol version '${providedVersion}' is not supported. Expected '${expectedVersion}'.`,
        expected_version: expectedVersion,
        min_version: MIN_PROTOCOL_VERSION,
        provided_version: providedVersion,
        required_header: PROTOCOL_HEADER,
      });
    }

    // Version is valid, proceed
    logger.debug(
      {
        method,
        path: req.path,
        version: providedVersion,
        requestId: res.get('X-Request-Id'),
      },
      'Protocol version validated',
    );

    next();
  };
}

/**
 * Default middleware instance for write endpoints
 */
export const protocolVersionMiddleware = createProtocolVersionMiddleware();

/**
 * Strict middleware that enforces version on all requests (reads + writes)
 */
export const strictProtocolVersionMiddleware = createProtocolVersionMiddleware({
  enforceOnReads: true,
  enforceOnWrites: true,
  allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'],
});

/**
 * Helper to check if request has valid protocol version
 */
export function hasValidProtocolVersion(req: Request): boolean {
  const providedVersion = req.get(PROTOCOL_HEADER);
  return providedVersion ? isProtocolVersionSupported(providedVersion) : false;
}

/**
 * Add protocol version to response headers for debugging
 */
export function addProtocolVersionHeaders(res: Response): void {
  res.set({
    'X-PEAC-Protocol-Expected': getExpectedProtocolHeader(),
    'X-PEAC-Protocol-Min': MIN_PROTOCOL_VERSION,
  });
}
