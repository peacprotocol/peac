/**
 * Privacy mode implementation for telemetry attributes
 *
 * Provides privacy-preserving attribute filtering and hashing
 * based on configured privacy mode.
 */

import { hashIdentifier } from '@peac/privacy';
import type { TelemetryConfig, PrivacyMode } from '@peac/telemetry';

/**
 * Default salt for hashing (should be configured per deployment)
 */
const DEFAULT_SALT = 'peac-telemetry-v0.9.22';

/**
 * Attributes that are always emitted regardless of privacy mode
 */
const ALWAYS_EMITTED = new Set([
  'peac.version',
  'peac.event',
  'peac.receipt.hash', // Already a hash
  'peac.policy.hash', // Already a hash
  'peac.decision',
  'peac.reason_code',
  'peac.valid',
  'http.request.method',
  'url.path',
  'peac.duration_ms',
]);

/**
 * Attributes that should be hashed in strict mode
 */
const HASH_IN_STRICT = new Set([
  'peac.issuer',
  'peac.kid',
  'peac.issuer_hash',
  'peac.http.host_hash',
  'peac.http.client_hash',
]);

/**
 * Attributes only emitted in balanced/custom mode
 */
const BALANCED_ONLY = new Set([
  'peac.payment.rail',
  'peac.payment.amount',
  'peac.payment.currency',
]);

/**
 * Privacy filter result
 */
export interface FilteredAttributes {
  attributes: Record<string, unknown>;
  redactedCount: number;
}

/**
 * Create a privacy filter based on configuration
 *
 * @param config - Telemetry configuration with privacy settings
 * @returns Filter function
 */
export function createPrivacyFilter(
  config: TelemetryConfig
): (attrs: Record<string, unknown>) => FilteredAttributes {
  const mode = config.privacyMode ?? 'strict';
  const allowList = new Set(config.allowAttributes ?? []);
  const salt = config.hashSalt ?? DEFAULT_SALT;

  return (attrs: Record<string, unknown>): FilteredAttributes => {
    const result: Record<string, unknown> = {};
    let redactedCount = 0;

    for (const [key, value] of Object.entries(attrs)) {
      // Skip null/undefined values
      if (value === null || value === undefined) {
        continue;
      }

      // Always emit certain attributes
      if (ALWAYS_EMITTED.has(key)) {
        result[key] = value;
        continue;
      }

      // Handle based on privacy mode
      switch (mode) {
        case 'strict':
          if (HASH_IN_STRICT.has(key)) {
            // Hash the value
            if (typeof value === 'string') {
              const hashed = hashIdentifier(value, { salt });
              result[key] = hashed.hash;
            } else {
              redactedCount++;
            }
          } else if (BALANCED_ONLY.has(key)) {
            // Redact payment details in strict mode
            redactedCount++;
          } else {
            // Unknown attribute - redact
            redactedCount++;
          }
          break;

        case 'balanced':
          if (HASH_IN_STRICT.has(key)) {
            // Hash identifiers
            if (typeof value === 'string') {
              const hashed = hashIdentifier(value, { salt });
              result[key] = hashed.hash;
            } else {
              redactedCount++;
            }
          } else if (BALANCED_ONLY.has(key)) {
            // Emit payment details
            result[key] = value;
          } else {
            // Unknown attribute - redact
            redactedCount++;
          }
          break;

        case 'custom':
          if (allowList.has(key)) {
            result[key] = value;
          } else if (HASH_IN_STRICT.has(key)) {
            // Hash by default if not in allowlist
            if (typeof value === 'string') {
              const hashed = hashIdentifier(value, { salt });
              result[key] = hashed.hash;
            } else {
              redactedCount++;
            }
          } else {
            redactedCount++;
          }
          break;
      }
    }

    // Apply custom redaction hook if provided
    if (config.redact) {
      return {
        attributes: config.redact(result),
        redactedCount,
      };
    }

    return { attributes: result, redactedCount };
  };
}

/**
 * Hash an issuer URL for privacy-preserving storage
 *
 * @param issuer - The issuer URL
 * @param salt - Salt for hashing
 * @returns Hashed issuer
 */
export function hashIssuer(
  issuer: string | undefined,
  salt: string = DEFAULT_SALT
): string | undefined {
  if (!issuer) {
    return undefined;
  }

  const result = hashIdentifier(issuer, { salt });
  return result.hash;
}

/**
 * Hash a key ID for privacy-preserving storage
 *
 * @param kid - The key ID
 * @param salt - Salt for hashing
 * @returns Hashed key ID
 */
export function hashKid(kid: string | undefined, salt: string = DEFAULT_SALT): string | undefined {
  if (!kid) {
    return undefined;
  }

  const result = hashIdentifier(kid, { salt });
  return result.hash;
}

/**
 * Check if an attribute should be emitted based on privacy mode
 *
 * @param key - Attribute key
 * @param mode - Privacy mode
 * @param allowList - Custom allowlist for 'custom' mode
 * @returns true if attribute should be emitted
 */
export function shouldEmitAttribute(
  key: string,
  mode: PrivacyMode,
  allowList?: Set<string>
): boolean {
  if (ALWAYS_EMITTED.has(key)) {
    return true;
  }

  switch (mode) {
    case 'strict':
      return HASH_IN_STRICT.has(key);
    case 'balanced':
      return HASH_IN_STRICT.has(key) || BALANCED_ONLY.has(key);
    case 'custom':
      return allowList?.has(key) ?? false;
    default:
      return false;
  }
}
