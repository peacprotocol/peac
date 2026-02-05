/**
 * Middleware Configuration Validation
 *
 * Validates middleware configuration before use.
 *
 * @packageDocumentation
 */

import { base64urlDecode } from '@peac/crypto';
import type { MiddlewareConfig, ConfigValidationError } from './types.js';

/**
 * Default configuration values
 */
export const CONFIG_DEFAULTS = {
  expiresIn: 300,
  transport: 'header' as const,
  maxHeaderSize: 4096,
} as const;

/**
 * Configuration validation error
 */
export class ConfigError extends Error {
  readonly errors: ConfigValidationError[];

  constructor(errors: ConfigValidationError[]) {
    const message = errors.map(e => `${e.field}: ${e.message}`).join('; ');
    super(`Invalid middleware configuration: ${message}`);
    this.name = 'ConfigError';
    this.errors = errors;
  }
}

/**
 * Validate a URL is HTTPS
 */
function isValidHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate Ed25519 JWK private key
 */
function validateSigningKey(
  key: unknown,
  errors: ConfigValidationError[]
): void {
  if (!key || typeof key !== 'object') {
    errors.push({ field: 'signingKey', message: 'must be an object' });
    return;
  }

  const jwk = key as Record<string, unknown>;

  // Validate key type
  if (jwk.kty !== 'OKP') {
    errors.push({ field: 'signingKey.kty', message: 'must be "OKP" for Ed25519 keys' });
  }

  // Validate curve
  if (jwk.crv !== 'Ed25519') {
    errors.push({ field: 'signingKey.crv', message: 'must be "Ed25519"' });
  }

  // Validate public key
  if (typeof jwk.x !== 'string') {
    errors.push({ field: 'signingKey.x', message: 'must be a base64url string' });
  } else {
    try {
      const xBytes = base64urlDecode(jwk.x);
      if (xBytes.length !== 32) {
        errors.push({ field: 'signingKey.x', message: 'must be 32 bytes (base64url encoded)' });
      }
    } catch {
      errors.push({ field: 'signingKey.x', message: 'must be valid base64url encoding' });
    }
  }

  // Validate private key
  if (typeof jwk.d !== 'string') {
    errors.push({ field: 'signingKey.d', message: 'must be a base64url string (private key)' });
  } else {
    try {
      const dBytes = base64urlDecode(jwk.d);
      if (dBytes.length !== 32) {
        errors.push({ field: 'signingKey.d', message: 'must be 32 bytes (base64url encoded)' });
      }
    } catch {
      errors.push({ field: 'signingKey.d', message: 'must be valid base64url encoding' });
    }
  }
}

/**
 * Validate middleware configuration
 *
 * @param config - Configuration to validate
 * @throws ConfigError if configuration is invalid
 *
 * @example
 * ```typescript
 * try {
 *   validateConfig(config);
 * } catch (e) {
 *   if (e instanceof ConfigError) {
 *     console.error('Config errors:', e.errors);
 *   }
 * }
 * ```
 */
export function validateConfig(config: MiddlewareConfig): void {
  const errors: ConfigValidationError[] = [];

  // Validate issuer URL
  if (!config.issuer) {
    errors.push({ field: 'issuer', message: 'is required' });
  } else if (!isValidHttpsUrl(config.issuer)) {
    errors.push({ field: 'issuer', message: 'must be a valid HTTPS URL' });
  }

  // Validate signing key
  if (!config.signingKey) {
    errors.push({ field: 'signingKey', message: 'is required' });
  } else {
    validateSigningKey(config.signingKey, errors);
  }

  // Validate key ID
  if (!config.keyId) {
    errors.push({ field: 'keyId', message: 'is required' });
  } else if (typeof config.keyId !== 'string' || config.keyId.length === 0) {
    errors.push({ field: 'keyId', message: 'must be a non-empty string' });
  }

  // Validate expiresIn (if provided)
  if (config.expiresIn !== undefined) {
    if (!Number.isInteger(config.expiresIn) || config.expiresIn <= 0) {
      errors.push({ field: 'expiresIn', message: 'must be a positive integer' });
    }
  }

  // Validate transport (if provided)
  if (config.transport !== undefined) {
    if (!['header', 'body', 'pointer'].includes(config.transport)) {
      errors.push({ field: 'transport', message: 'must be "header", "body", or "pointer"' });
    }
  }

  // Validate maxHeaderSize (if provided)
  if (config.maxHeaderSize !== undefined) {
    if (!Number.isInteger(config.maxHeaderSize) || config.maxHeaderSize <= 0) {
      errors.push({ field: 'maxHeaderSize', message: 'must be a positive integer' });
    }
  }

  // Validate pointer transport has URL generator
  if (config.transport === 'pointer' && !config.pointerUrlGenerator) {
    errors.push({
      field: 'pointerUrlGenerator',
      message: 'is required when transport is "pointer"',
    });
  }

  // Validate claimsGenerator is a function (if provided)
  if (config.claimsGenerator !== undefined && typeof config.claimsGenerator !== 'function') {
    errors.push({ field: 'claimsGenerator', message: 'must be a function' });
  }

  // Validate pointerUrlGenerator is a function (if provided)
  if (config.pointerUrlGenerator !== undefined && typeof config.pointerUrlGenerator !== 'function') {
    errors.push({ field: 'pointerUrlGenerator', message: 'must be a function' });
  }

  if (errors.length > 0) {
    throw new ConfigError(errors);
  }
}

/**
 * Apply default values to configuration
 */
export function applyDefaults(config: MiddlewareConfig): Required<Pick<MiddlewareConfig, 'expiresIn' | 'transport' | 'maxHeaderSize'>> & MiddlewareConfig {
  return {
    ...config,
    expiresIn: config.expiresIn ?? CONFIG_DEFAULTS.expiresIn,
    transport: config.transport ?? CONFIG_DEFAULTS.transport,
    maxHeaderSize: config.maxHeaderSize ?? CONFIG_DEFAULTS.maxHeaderSize,
  };
}
