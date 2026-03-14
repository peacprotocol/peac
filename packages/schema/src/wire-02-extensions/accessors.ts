/**
 * Wire 0.2 Typed Extension Accessor Helpers
 *
 * Each accessor returns the parsed typed value if the key is present,
 * undefined if the key is absent, or throws PEACError with a leaf-precise
 * RFC 6901 JSON Pointer if the key is present but the value is invalid.
 */

import { z } from 'zod';
import { createPEACError, ERROR_CODES } from '../errors.js';
import { zodPathToPointer } from './grammar.js';

import { COMMERCE_EXTENSION_KEY, CommerceExtensionSchema } from './commerce.js';
import type { CommerceExtension } from './commerce.js';
import { ACCESS_EXTENSION_KEY, AccessExtensionSchema } from './access.js';
import type { AccessExtension } from './access.js';
import { CHALLENGE_EXTENSION_KEY, ChallengeExtensionSchema } from './challenge.js';
import type { ChallengeExtension } from './challenge.js';
import { IDENTITY_EXTENSION_KEY, IdentityExtensionSchema } from './identity.js';
import type { IdentityExtension } from './identity.js';
import { CORRELATION_EXTENSION_KEY, CorrelationExtensionSchema } from './correlation.js';
import type { CorrelationExtension } from './correlation.js';

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/**
 * Extract and validate a known extension group.
 *
 * Returns undefined if the key is absent from extensions.
 * Throws PEACError with leaf-precise RFC 6901 pointer if key is present
 * but value fails schema validation.
 */
function getExtension<T>(
  extensions: Record<string, unknown> | undefined,
  key: string,
  schema: z.ZodType<T>
): T | undefined {
  if (extensions === undefined) return undefined;
  if (!Object.prototype.hasOwnProperty.call(extensions, key)) return undefined;

  const value = extensions[key];
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  const firstIssue = result.error.issues[0];
  const pointer = zodPathToPointer(key, firstIssue?.path ?? []);

  throw createPEACError(ERROR_CODES.E_INVALID_ENVELOPE, 'validation', 'error', false, {
    http_status: 400,
    pointer,
    remediation: `Fix the ${key} extension group value`,
    details: {
      message: firstIssue?.message ?? 'Invalid extension value',
      issues: result.error.issues,
    },
  });
}

// ---------------------------------------------------------------------------
// Public typed accessors
// ---------------------------------------------------------------------------

/** @throws PEACError with RFC 6901 pointer if present but invalid */
export function getCommerceExtension(
  extensions?: Record<string, unknown>
): CommerceExtension | undefined {
  return getExtension(extensions, COMMERCE_EXTENSION_KEY, CommerceExtensionSchema);
}

/** @throws PEACError with RFC 6901 pointer if present but invalid */
export function getAccessExtension(
  extensions?: Record<string, unknown>
): AccessExtension | undefined {
  return getExtension(extensions, ACCESS_EXTENSION_KEY, AccessExtensionSchema);
}

/** @throws PEACError with RFC 6901 pointer if present but invalid */
export function getChallengeExtension(
  extensions?: Record<string, unknown>
): ChallengeExtension | undefined {
  return getExtension(extensions, CHALLENGE_EXTENSION_KEY, ChallengeExtensionSchema);
}

/** @throws PEACError with RFC 6901 pointer if present but invalid */
export function getIdentityExtension(
  extensions?: Record<string, unknown>
): IdentityExtension | undefined {
  return getExtension(extensions, IDENTITY_EXTENSION_KEY, IdentityExtensionSchema);
}

/** @throws PEACError with RFC 6901 pointer if present but invalid */
export function getCorrelationExtension(
  extensions?: Record<string, unknown>
): CorrelationExtension | undefined {
  return getExtension(extensions, CORRELATION_EXTENSION_KEY, CorrelationExtensionSchema);
}
