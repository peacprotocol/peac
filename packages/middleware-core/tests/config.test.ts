/**
 * Configuration Validation Tests
 */

import { describe, it, expect } from 'vitest';
import { validateConfig, ConfigError, CONFIG_DEFAULTS, applyDefaults } from '../src/config.js';
import type { MiddlewareConfig, Ed25519PrivateJwk } from '../src/types.js';
import { base64urlEncode } from '@peac/crypto';

// Generate a valid test key
function createValidKey(): Ed25519PrivateJwk {
  // Valid 32-byte keys encoded as base64url
  const publicKey = new Uint8Array(32).fill(1);
  const privateKey = new Uint8Array(32).fill(2);
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: base64urlEncode(publicKey),
    d: base64urlEncode(privateKey),
  };
}

function createValidConfig(): MiddlewareConfig {
  return {
    issuer: 'https://api.example.com',
    signingKey: createValidKey(),
    keyId: 'test-key-2026-02',
  };
}

describe('validateConfig', () => {
  describe('Valid Configurations', () => {
    it('should accept minimal valid configuration', () => {
      const config = createValidConfig();
      expect(() => validateConfig(config)).not.toThrow();
    });

    it('should accept configuration with all optional fields', () => {
      const config: MiddlewareConfig = {
        ...createValidConfig(),
        expiresIn: 600,
        transport: 'body',
        maxHeaderSize: 8192,
        claimsGenerator: async () => ({ sub: 'user-123' }),
      };
      expect(() => validateConfig(config)).not.toThrow();
    });

    it('should accept pointer transport with URL generator', () => {
      const config: MiddlewareConfig = {
        ...createValidConfig(),
        transport: 'pointer',
        pointerUrlGenerator: async (receipt) => `https://receipts.example.com/${receipt.slice(0, 10)}`,
      };
      expect(() => validateConfig(config)).not.toThrow();
    });
  });

  describe('Issuer Validation', () => {
    it('should reject missing issuer', () => {
      const config = createValidConfig();
      // @ts-expect-error Testing invalid config
      delete config.issuer;

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'issuer', message: 'is required' })
      );
    });

    it('should reject empty issuer', () => {
      const config = { ...createValidConfig(), issuer: '' };

      const error = getConfigError(() => validateConfig(config));
      // Empty string is treated as missing (falsy)
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'issuer', message: 'is required' })
      );
    });

    it('should reject HTTP issuer', () => {
      const config = { ...createValidConfig(), issuer: 'http://api.example.com' };

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'issuer', message: 'must be a valid HTTPS URL' })
      );
    });

    it('should reject invalid URL', () => {
      const config = { ...createValidConfig(), issuer: 'not-a-url' };

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'issuer', message: 'must be a valid HTTPS URL' })
      );
    });
  });

  describe('Signing Key Validation', () => {
    it('should reject missing signing key', () => {
      const config = createValidConfig();
      // @ts-expect-error Testing invalid config
      delete config.signingKey;

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'signingKey', message: 'is required' })
      );
    });

    it('should reject non-object signing key', () => {
      const config = {
        ...createValidConfig(),
        // @ts-expect-error Testing invalid config
        signingKey: 'not-an-object',
      };

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'signingKey', message: 'must be an object' })
      );
    });

    it('should reject wrong key type', () => {
      const config = {
        ...createValidConfig(),
        signingKey: {
          ...createValidKey(),
          kty: 'RSA',
        } as unknown as Ed25519PrivateJwk,
      };

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'signingKey.kty' })
      );
    });

    it('should reject wrong curve', () => {
      const config = {
        ...createValidConfig(),
        signingKey: {
          ...createValidKey(),
          crv: 'P-256',
        } as unknown as Ed25519PrivateJwk,
      };

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'signingKey.crv' })
      );
    });

    it('should reject invalid base64url in x', () => {
      const config = {
        ...createValidConfig(),
        signingKey: {
          ...createValidKey(),
          x: 'not-valid-base64url!!!',
        },
      };

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'signingKey.x' })
      );
    });

    it('should reject wrong length public key', () => {
      const config = {
        ...createValidConfig(),
        signingKey: {
          ...createValidKey(),
          x: base64urlEncode(new Uint8Array(16)), // 16 bytes instead of 32
        },
      };

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({
          field: 'signingKey.x',
          message: 'must be 32 bytes (base64url encoded)',
        })
      );
    });

    it('should reject missing private key (d)', () => {
      const key = createValidKey();
      // @ts-expect-error Testing invalid config
      delete key.d;
      const config = { ...createValidConfig(), signingKey: key };

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'signingKey.d' })
      );
    });

    it('should reject wrong length private key', () => {
      const config = {
        ...createValidConfig(),
        signingKey: {
          ...createValidKey(),
          d: base64urlEncode(new Uint8Array(16)), // 16 bytes instead of 32
        },
      };

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({
          field: 'signingKey.d',
          message: 'must be 32 bytes (base64url encoded)',
        })
      );
    });
  });

  describe('Key ID Validation', () => {
    it('should reject missing keyId', () => {
      const config = createValidConfig();
      // @ts-expect-error Testing invalid config
      delete config.keyId;

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'keyId', message: 'is required' })
      );
    });

    it('should reject empty keyId', () => {
      const config = { ...createValidConfig(), keyId: '' };

      const error = getConfigError(() => validateConfig(config));
      // Empty string is treated as missing (falsy)
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'keyId', message: 'is required' })
      );
    });
  });

  describe('Optional Field Validation', () => {
    it('should reject negative expiresIn', () => {
      const config = { ...createValidConfig(), expiresIn: -100 };

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'expiresIn', message: 'must be a positive integer' })
      );
    });

    it('should reject zero expiresIn', () => {
      const config = { ...createValidConfig(), expiresIn: 0 };

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'expiresIn', message: 'must be a positive integer' })
      );
    });

    it('should reject non-integer expiresIn', () => {
      const config = { ...createValidConfig(), expiresIn: 100.5 };

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'expiresIn', message: 'must be a positive integer' })
      );
    });

    it('should reject invalid transport', () => {
      const config = {
        ...createValidConfig(),
        // @ts-expect-error Testing invalid config
        transport: 'invalid',
      };

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'transport' })
      );
    });

    it('should reject negative maxHeaderSize', () => {
      const config = { ...createValidConfig(), maxHeaderSize: -100 };

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'maxHeaderSize', message: 'must be a positive integer' })
      );
    });

    it('should reject pointer transport without URL generator', () => {
      const config: MiddlewareConfig = {
        ...createValidConfig(),
        transport: 'pointer',
      };

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({
          field: 'pointerUrlGenerator',
          message: 'is required when transport is "pointer"',
        })
      );
    });

    it('should reject non-function claimsGenerator', () => {
      const config = {
        ...createValidConfig(),
        // @ts-expect-error Testing invalid config
        claimsGenerator: 'not-a-function',
      };

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'claimsGenerator', message: 'must be a function' })
      );
    });

    it('should reject non-function pointerUrlGenerator', () => {
      const config = {
        ...createValidConfig(),
        // @ts-expect-error Testing invalid config
        pointerUrlGenerator: 'not-a-function',
      };

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors).toContainEqual(
        expect.objectContaining({ field: 'pointerUrlGenerator', message: 'must be a function' })
      );
    });
  });

  describe('Multiple Errors', () => {
    it('should collect all validation errors', () => {
      const config = {
        issuer: 'http://insecure.com',
        signingKey: null,
        keyId: '',
        expiresIn: -1,
      } as unknown as MiddlewareConfig;

      const error = getConfigError(() => validateConfig(config));
      expect(error.errors.length).toBeGreaterThanOrEqual(4);
    });
  });
});

describe('applyDefaults', () => {
  it('should apply default expiresIn', () => {
    const config = createValidConfig();
    const result = applyDefaults(config);
    expect(result.expiresIn).toBe(CONFIG_DEFAULTS.expiresIn);
  });

  it('should apply default transport', () => {
    const config = createValidConfig();
    const result = applyDefaults(config);
    expect(result.transport).toBe(CONFIG_DEFAULTS.transport);
  });

  it('should apply default maxHeaderSize', () => {
    const config = createValidConfig();
    const result = applyDefaults(config);
    expect(result.maxHeaderSize).toBe(CONFIG_DEFAULTS.maxHeaderSize);
  });

  it('should preserve explicitly set values', () => {
    const config: MiddlewareConfig = {
      ...createValidConfig(),
      expiresIn: 600,
      transport: 'body',
      maxHeaderSize: 8192,
    };
    const result = applyDefaults(config);
    expect(result.expiresIn).toBe(600);
    expect(result.transport).toBe('body');
    expect(result.maxHeaderSize).toBe(8192);
  });
});

describe('ConfigError', () => {
  it('should include all errors in message', () => {
    const errors = [
      { field: 'issuer', message: 'is required' },
      { field: 'keyId', message: 'is required' },
    ];
    const error = new ConfigError(errors);
    expect(error.message).toContain('issuer');
    expect(error.message).toContain('keyId');
  });

  it('should expose errors array', () => {
    const errors = [{ field: 'issuer', message: 'is required' }];
    const error = new ConfigError(errors);
    expect(error.errors).toEqual(errors);
  });

  it('should have correct name', () => {
    const error = new ConfigError([{ field: 'test', message: 'test' }]);
    expect(error.name).toBe('ConfigError');
  });
});

// Helper to extract ConfigError from throw
function getConfigError(fn: () => void): ConfigError {
  try {
    fn();
    throw new Error('Expected ConfigError to be thrown');
  } catch (e) {
    if (e instanceof ConfigError) {
      return e;
    }
    throw e;
  }
}
