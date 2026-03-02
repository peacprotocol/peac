/**
 * Credential Event Extension Tests (v0.11.3+, DD-145)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CredentialEventTypeSchema,
  CredentialRefSchema,
  CredentialEventSchema,
  CREDENTIAL_EVENT_EXTENSION_KEY,
  CREDENTIAL_EVENTS,
  validateCredentialEvent,
} from '../../src/extensions/credential-event';

describe('CredentialEventTypeSchema', () => {
  it('should accept all 5 event types', () => {
    for (const event of CREDENTIAL_EVENTS) {
      expect(CredentialEventTypeSchema.parse(event)).toBe(event);
    }
  });

  it('should reject unknown events', () => {
    expect(() => CredentialEventTypeSchema.parse('deleted')).toThrow();
    expect(() => CredentialEventTypeSchema.parse('')).toThrow();
  });

  it('should have correct extension key', () => {
    expect(CREDENTIAL_EVENT_EXTENSION_KEY).toBe('org.peacprotocol/credential_event');
  });
});

describe('CredentialRefSchema', () => {
  it('should accept sha256 fingerprint references', () => {
    const ref = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(CredentialRefSchema.parse(ref)).toBe(ref);
  });

  it('should accept hmac-sha256 fingerprint references', () => {
    const ref = 'hmac-sha256:f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f';
    expect(CredentialRefSchema.parse(ref)).toBe(ref);
  });

  it('should reject unsupported algorithms', () => {
    expect(() => CredentialRefSchema.parse('md5:abc123')).toThrow();
    expect(() => CredentialRefSchema.parse('sha512:abc')).toThrow();
  });

  it('should reject wrong hex length', () => {
    expect(() => CredentialRefSchema.parse('sha256:abc')).toThrow();
    expect(() => CredentialRefSchema.parse('sha256:abcd')).toThrow();
  });
});

describe('CredentialEventSchema', () => {
  it('should accept valid issued event', () => {
    const event = {
      event: 'issued',
      credential_ref: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      authority: 'https://issuer.example.com',
    };
    expect(CredentialEventSchema.parse(event)).toEqual(event);
  });

  it('should accept rotation with previous_ref', () => {
    const event = {
      event: 'rotated',
      credential_ref: 'sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
      authority: 'https://ca.example.com',
      previous_ref: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };
    expect(CredentialEventSchema.parse(event)).toEqual(event);
  });

  it('should reject non-HTTPS authority', () => {
    const event = {
      event: 'issued',
      credential_ref: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      authority: 'http://issuer.example.com',
    };
    expect(() => CredentialEventSchema.parse(event)).toThrow();
  });

  it('should reject extra fields (strict mode)', () => {
    const event = {
      event: 'issued',
      credential_ref: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      authority: 'https://issuer.example.com',
      extra: 'bad',
    };
    expect(() => CredentialEventSchema.parse(event)).toThrow();
  });
});

describe('validateCredentialEvent', () => {
  it('should return ok for valid event', () => {
    const result = validateCredentialEvent({
      event: 'revoked',
      credential_ref: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      authority: 'https://issuer.example.com',
    });
    expect(result.ok).toBe(true);
  });

  it('should return error for invalid event', () => {
    const result = validateCredentialEvent({ event: 'bad' });
    expect(result.ok).toBe(false);
  });
});

describe('conformance fixtures', () => {
  const fixtures = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../../../specs/conformance/fixtures/zero-trust/credential-event.json'),
      'utf-8'
    )
  );

  for (const fixture of fixtures.valid) {
    it(`valid: ${fixture.name}`, () => {
      expect(CredentialEventSchema.safeParse(fixture.input).success).toBe(true);
    });
  }

  for (const fixture of fixtures.invalid) {
    it(`invalid: ${fixture.name}`, () => {
      expect(CredentialEventSchema.safeParse(fixture.input).success).toBe(false);
    });
  }
});
