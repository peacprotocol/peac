/**
 * Treaty Extension Tests (v0.11.3+, DD-147)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CommitmentClassSchema,
  TreatySchema,
  TREATY_EXTENSION_KEY,
  COMMITMENT_CLASSES,
  validateTreaty,
} from '../../src/extensions/treaty';

describe('CommitmentClassSchema', () => {
  it('should accept all 4 commitment classes', () => {
    for (const cls of COMMITMENT_CLASSES) {
      expect(CommitmentClassSchema.parse(cls)).toBe(cls);
    }
  });

  it('should reject unknown classes', () => {
    expect(() => CommitmentClassSchema.parse('binding')).toThrow();
    expect(() => CommitmentClassSchema.parse('contractual')).toThrow();
    expect(() => CommitmentClassSchema.parse('')).toThrow();
  });

  it('should have correct extension key', () => {
    expect(TREATY_EXTENSION_KEY).toBe('org.peacprotocol/treaty');
  });
});

describe('TreatySchema', () => {
  it('should accept minimal treaty (commitment_class only)', () => {
    const treaty = { commitment_class: 'informational' };
    expect(TreatySchema.parse(treaty)).toEqual(treaty);
  });

  it('should accept legal treaty with full terms', () => {
    const treaty = {
      commitment_class: 'legal',
      terms_ref: 'https://legal.example.com/terms/v2',
      terms_hash: 'sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
      counterparty: 'org:partner-corp',
      effective_at: '2026-03-01T00:00:00Z',
      expires_at: '2027-03-01T00:00:00Z',
    };
    expect(TreatySchema.parse(treaty)).toEqual(treaty);
  });

  it('should accept financial treaty with counterparty', () => {
    const treaty = {
      commitment_class: 'financial',
      terms_ref: 'https://billing.example.com/agreement/123',
      counterparty: 'org:vendor-abc',
    };
    expect(TreatySchema.parse(treaty)).toEqual(treaty);
  });

  it('should accept operational treaty', () => {
    const treaty = { commitment_class: 'operational' };
    expect(TreatySchema.parse(treaty)).toEqual(treaty);
  });

  it('should reject unknown commitment class', () => {
    expect(() => TreatySchema.parse({ commitment_class: 'binding' })).toThrow();
  });

  it('should reject malformed terms_hash', () => {
    expect(() =>
      TreatySchema.parse({ commitment_class: 'legal', terms_hash: 'md5:abc123' })
    ).toThrow();
  });

  it('should reject extra fields (strict mode)', () => {
    expect(() => TreatySchema.parse({ commitment_class: 'informational', extra: 'bad' })).toThrow();
  });

  it('should reject invalid datetime for effective_at', () => {
    expect(() =>
      TreatySchema.parse({ commitment_class: 'legal', effective_at: 'not-a-date' })
    ).toThrow();
  });
});

describe('validateTreaty', () => {
  it('should return ok for valid treaty', () => {
    const result = validateTreaty({ commitment_class: 'informational' });
    expect(result.ok).toBe(true);
  });

  it('should return error for invalid treaty', () => {
    const result = validateTreaty({ commitment_class: 'unknown' });
    expect(result.ok).toBe(false);
  });
});

describe('conformance fixtures', () => {
  const fixtures = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../../../specs/conformance/fixtures/treaty/treaty.json'),
      'utf-8'
    )
  );

  for (const fixture of fixtures.valid) {
    it(`valid: ${fixture.name}`, () => {
      expect(TreatySchema.safeParse(fixture.input).success).toBe(true);
    });
  }

  for (const fixture of fixtures.invalid) {
    it(`invalid: ${fixture.name}`, () => {
      expect(TreatySchema.safeParse(fixture.input).success).toBe(false);
    });
  }
});
