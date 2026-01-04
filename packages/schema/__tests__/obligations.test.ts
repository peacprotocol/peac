/**
 * Obligations Extension Tests (v0.9.26+)
 *
 * Tests for CC Signals aligned obligations extension types.
 */
import { describe, it, expect } from 'vitest';
import {
  // Schemas
  CreditMethodSchema,
  ContributionTypeSchema,
  CreditObligationSchema,
  ContributionObligationSchema,
  ObligationsExtensionSchema,
  // Constants
  OBLIGATIONS_EXTENSION_KEY,
  CREDIT_METHODS,
  CONTRIBUTION_TYPES,
  // Helpers
  validateCreditObligation,
  validateContributionObligation,
  validateObligationsExtension,
  extractObligationsExtension,
  isCreditRequired,
  isContributionRequired,
  createCreditObligation,
  createContributionObligation,
  createObligationsExtension,
} from '../src/obligations';
import type {
  CreditObligation,
  ContributionObligation,
  ObligationsExtension,
} from '../src/obligations';

// =============================================================================
// CONSTANTS TESTS
// =============================================================================

describe('constants', () => {
  it('should have correct extension key', () => {
    expect(OBLIGATIONS_EXTENSION_KEY).toBe('peac/obligations');
  });

  it('should have all credit methods', () => {
    expect(CREDIT_METHODS).toEqual(['inline', 'references', 'model-card']);
  });

  it('should have all contribution types', () => {
    expect(CONTRIBUTION_TYPES).toEqual(['direct', 'ecosystem', 'open']);
  });
});

// =============================================================================
// CREDIT METHOD TESTS
// =============================================================================

describe('CreditMethodSchema', () => {
  it('should accept valid credit methods', () => {
    expect(CreditMethodSchema.safeParse('inline').success).toBe(true);
    expect(CreditMethodSchema.safeParse('references').success).toBe(true);
    expect(CreditMethodSchema.safeParse('model-card').success).toBe(true);
  });

  it('should reject invalid credit methods', () => {
    expect(CreditMethodSchema.safeParse('invalid').success).toBe(false);
    expect(CreditMethodSchema.safeParse('').success).toBe(false);
    expect(CreditMethodSchema.safeParse(123).success).toBe(false);
  });
});

// =============================================================================
// CONTRIBUTION TYPE TESTS
// =============================================================================

describe('ContributionTypeSchema', () => {
  it('should accept valid contribution types', () => {
    expect(ContributionTypeSchema.safeParse('direct').success).toBe(true);
    expect(ContributionTypeSchema.safeParse('ecosystem').success).toBe(true);
    expect(ContributionTypeSchema.safeParse('open').success).toBe(true);
  });

  it('should reject invalid contribution types', () => {
    expect(ContributionTypeSchema.safeParse('invalid').success).toBe(false);
    expect(ContributionTypeSchema.safeParse('free').success).toBe(false);
    expect(ContributionTypeSchema.safeParse(null).success).toBe(false);
  });
});

// =============================================================================
// CREDIT OBLIGATION TESTS
// =============================================================================

describe('CreditObligationSchema', () => {
  it('should reject credit required=true without citation_url, credit_text, or method', () => {
    const credit = { required: true };
    const result = CreditObligationSchema.safeParse(credit);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain(
        'at least one of citation_url, credit_text, or method must be specified'
      );
    }
  });

  it('should accept credit required=true with citation_url', () => {
    const credit = { required: true, citation_url: 'https://example.com' };
    expect(CreditObligationSchema.safeParse(credit).success).toBe(true);
  });

  it('should accept credit required=true with credit_text', () => {
    const credit = { required: true, credit_text: 'Source: Example' };
    expect(CreditObligationSchema.safeParse(credit).success).toBe(true);
  });

  it('should accept credit required=true with method', () => {
    const credit = { required: true, method: 'model-card' as const };
    expect(CreditObligationSchema.safeParse(credit).success).toBe(true);
  });

  it('should accept credit required=false without any details', () => {
    const credit = { required: false };
    expect(CreditObligationSchema.safeParse(credit).success).toBe(true);
  });

  it('should accept full credit obligation', () => {
    const credit: CreditObligation = {
      required: true,
      citation_url: 'https://publisher.example/collection',
      method: 'references',
      credit_text: 'Content provided by Publisher Example',
    };
    const result = CreditObligationSchema.safeParse(credit);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.required).toBe(true);
      expect(result.data.citation_url).toBe('https://publisher.example/collection');
      expect(result.data.method).toBe('references');
      expect(result.data.credit_text).toBe('Content provided by Publisher Example');
    }
  });

  it('should accept credit not required', () => {
    const credit: CreditObligation = { required: false };
    expect(CreditObligationSchema.safeParse(credit).success).toBe(true);
  });

  it('should reject invalid citation URL', () => {
    const credit = { required: true, citation_url: 'not-a-url' };
    expect(CreditObligationSchema.safeParse(credit).success).toBe(false);
  });

  it('should reject missing required field', () => {
    const credit = { citation_url: 'https://example.com' };
    expect(CreditObligationSchema.safeParse(credit).success).toBe(false);
  });

  it('should reject extra fields (strict)', () => {
    const credit = { required: true, extra_field: 'not allowed' };
    expect(CreditObligationSchema.safeParse(credit).success).toBe(false);
  });
});

// =============================================================================
// CONTRIBUTION OBLIGATION TESTS
// =============================================================================

describe('ContributionObligationSchema', () => {
  it('should accept minimal open contribution', () => {
    const contribution: ContributionObligation = { type: 'open' };
    expect(ContributionObligationSchema.safeParse(contribution).success).toBe(true);
  });

  it('should require destination for direct contribution', () => {
    const contribution = { type: 'direct' };
    const result = ContributionObligationSchema.safeParse(contribution);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain(
        "Destination is required when contribution type is 'direct'"
      );
    }
  });

  it('should require destination for ecosystem contribution', () => {
    const contribution = { type: 'ecosystem' };
    const result = ContributionObligationSchema.safeParse(contribution);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain(
        "Destination is required when contribution type is 'ecosystem'"
      );
    }
  });

  it('should accept direct contribution with destination', () => {
    const contribution = {
      type: 'direct',
      destination: '0x1234567890abcdef1234567890abcdef12345678',
    };
    expect(ContributionObligationSchema.safeParse(contribution).success).toBe(true);
  });

  it('should accept ecosystem contribution with destination', () => {
    const contribution = {
      type: 'ecosystem',
      destination: 'https://fund.creativecommons.org',
    };
    expect(ContributionObligationSchema.safeParse(contribution).success).toBe(true);
  });

  it('should accept full contribution obligation', () => {
    const contribution: ContributionObligation = {
      type: 'ecosystem',
      destination: 'https://fund.creativecommons.org',
      min_amount: 100,
      currency: 'USD',
    };
    const result = ContributionObligationSchema.safeParse(contribution);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('ecosystem');
      expect(result.data.destination).toBe('https://fund.creativecommons.org');
      expect(result.data.min_amount).toBe(100);
      expect(result.data.currency).toBe('USD');
    }
  });

  it('should accept crypto currency codes (USDC, ETH)', () => {
    const contribution = {
      type: 'direct',
      destination: '0x1234567890abcdef1234567890abcdef12345678',
      min_amount: 500000,
      currency: 'USDC',
    };
    expect(ContributionObligationSchema.safeParse(contribution).success).toBe(true);
  });

  it('should accept longer crypto codes (POLYGON)', () => {
    const contribution = {
      type: 'direct',
      destination: '0x1234567890abcdef1234567890abcdef12345678',
      min_amount: 100,
      currency: 'POLYGON',
    };
    expect(ContributionObligationSchema.safeParse(contribution).success).toBe(true);
  });

  it('should reject currency with lowercase letters', () => {
    const contribution = {
      type: 'direct',
      destination: 'wallet-address',
      currency: 'usd',
    };
    expect(ContributionObligationSchema.safeParse(contribution).success).toBe(false);
  });

  it('should reject currency shorter than 3 characters', () => {
    const contribution = {
      type: 'direct',
      destination: 'wallet-address',
      currency: 'US',
    };
    expect(ContributionObligationSchema.safeParse(contribution).success).toBe(false);
  });

  it('should reject currency longer than 8 characters', () => {
    const contribution = {
      type: 'direct',
      destination: 'wallet-address',
      currency: 'VERYLONGC',
    };
    expect(ContributionObligationSchema.safeParse(contribution).success).toBe(false);
  });

  it('should require currency when min_amount is specified', () => {
    const contribution = { type: 'open', min_amount: 100 };
    const result = ContributionObligationSchema.safeParse(contribution);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('Currency is required when min_amount is specified');
    }
  });

  it('should reject negative min_amount', () => {
    const contribution = {
      type: 'direct',
      destination: 'wallet-address',
      min_amount: -100,
    };
    expect(ContributionObligationSchema.safeParse(contribution).success).toBe(false);
  });

  it('should reject non-integer min_amount', () => {
    const contribution = {
      type: 'direct',
      destination: 'wallet-address',
      min_amount: 100.5,
    };
    expect(ContributionObligationSchema.safeParse(contribution).success).toBe(false);
  });
});

// =============================================================================
// OBLIGATIONS EXTENSION TESTS
// =============================================================================

describe('ObligationsExtensionSchema', () => {
  it('should accept empty extension', () => {
    const ext: ObligationsExtension = {};
    expect(ObligationsExtensionSchema.safeParse(ext).success).toBe(true);
  });

  it('should accept credit-only extension with method', () => {
    const ext: ObligationsExtension = {
      credit: { required: true, method: 'inline' },
    };
    expect(ObligationsExtensionSchema.safeParse(ext).success).toBe(true);
  });

  it('should accept credit not required extension', () => {
    const ext: ObligationsExtension = {
      credit: { required: false },
    };
    expect(ObligationsExtensionSchema.safeParse(ext).success).toBe(true);
  });

  it('should accept contribution-only extension with open type', () => {
    const ext: ObligationsExtension = {
      contribution: { type: 'open' },
    };
    expect(ObligationsExtensionSchema.safeParse(ext).success).toBe(true);
  });

  it('should accept contribution-only extension with ecosystem and destination', () => {
    const ext: ObligationsExtension = {
      contribution: { type: 'ecosystem', destination: 'https://fund.example.org' },
    };
    expect(ObligationsExtensionSchema.safeParse(ext).success).toBe(true);
  });

  it('should accept full extension', () => {
    const ext: ObligationsExtension = {
      credit: {
        required: true,
        citation_url: 'https://publisher.example/collection',
        method: 'references',
      },
      contribution: {
        type: 'ecosystem',
        destination: 'https://fund.example.org',
      },
    };
    const result = ObligationsExtensionSchema.safeParse(ext);
    expect(result.success).toBe(true);
  });

  it('should reject extra fields (strict)', () => {
    const ext = { credit: { required: true }, extra: 'field' };
    expect(ObligationsExtensionSchema.safeParse(ext).success).toBe(false);
  });
});

// =============================================================================
// VALIDATION HELPER TESTS
// =============================================================================

describe('validateCreditObligation', () => {
  it('should return ok for valid credit with method', () => {
    const result = validateCreditObligation({ required: true, method: 'inline' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.required).toBe(true);
    }
  });

  it('should return ok for credit not required', () => {
    const result = validateCreditObligation({ required: false });
    expect(result.ok).toBe(true);
  });

  it('should return error for credit required without details', () => {
    const result = validateCreditObligation({ required: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeDefined();
    }
  });

  it('should return error for invalid credit', () => {
    const result = validateCreditObligation({ required: 'yes' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeDefined();
    }
  });
});

describe('validateContributionObligation', () => {
  it('should return ok for valid contribution', () => {
    const result = validateContributionObligation({ type: 'open' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('open');
    }
  });

  it('should return error for invalid contribution', () => {
    const result = validateContributionObligation({ type: 'invalid' });
    expect(result.ok).toBe(false);
  });
});

describe('validateObligationsExtension', () => {
  it('should return ok for valid extension', () => {
    const result = validateObligationsExtension({
      credit: { required: true, method: 'references' },
      contribution: { type: 'direct', destination: 'wallet-address' },
    });
    expect(result.ok).toBe(true);
  });

  it('should return error for credit required without details', () => {
    const result = validateObligationsExtension({
      credit: { required: true },
    });
    expect(result.ok).toBe(false);
  });

  it('should return error for direct contribution without destination', () => {
    const result = validateObligationsExtension({
      contribution: { type: 'direct' },
    });
    expect(result.ok).toBe(false);
  });

  it('should return error for invalid extension', () => {
    const result = validateObligationsExtension({
      credit: { required: 'yes' }, // invalid
    });
    expect(result.ok).toBe(false);
  });
});

// =============================================================================
// EXTRACTION HELPER TESTS
// =============================================================================

describe('extractObligationsExtension', () => {
  it('should extract valid obligations', () => {
    const extensions = {
      'peac/obligations': {
        credit: { required: true, method: 'inline' },
      },
    };
    const result = extractObligationsExtension(extensions);
    expect(result).toBeDefined();
    expect(result?.credit?.required).toBe(true);
  });

  it('should return undefined for missing obligations', () => {
    const extensions = { 'other/extension': {} };
    const result = extractObligationsExtension(extensions);
    expect(result).toBeUndefined();
  });

  it('should return undefined for undefined extensions', () => {
    const result = extractObligationsExtension(undefined);
    expect(result).toBeUndefined();
  });

  it('should return undefined for invalid obligations', () => {
    const extensions = {
      'peac/obligations': { credit: { required: 'invalid' } },
    };
    const result = extractObligationsExtension(extensions);
    expect(result).toBeUndefined();
  });
});

// =============================================================================
// PREDICATE HELPER TESTS
// =============================================================================

describe('isCreditRequired', () => {
  it('should return true when credit is required', () => {
    expect(isCreditRequired({ credit: { required: true, method: 'inline' } })).toBe(true);
  });

  it('should return false when credit is not required', () => {
    expect(isCreditRequired({ credit: { required: false } })).toBe(false);
  });

  it('should return false when credit is missing', () => {
    expect(isCreditRequired({ contribution: { type: 'open' } })).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isCreditRequired(undefined)).toBe(false);
  });
});

describe('isContributionRequired', () => {
  it('should return true for direct contribution', () => {
    expect(
      isContributionRequired({ contribution: { type: 'direct', destination: 'wallet' } })
    ).toBe(true);
  });

  it('should return true for ecosystem contribution', () => {
    expect(
      isContributionRequired({
        contribution: { type: 'ecosystem', destination: 'https://fund.org' },
      })
    ).toBe(true);
  });

  it('should return false for open contribution', () => {
    expect(isContributionRequired({ contribution: { type: 'open' } })).toBe(false);
  });

  it('should return false when contribution is missing', () => {
    expect(isContributionRequired({ credit: { required: true, method: 'inline' } })).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isContributionRequired(undefined)).toBe(false);
  });
});

// =============================================================================
// CREATION HELPER TESTS
// =============================================================================

describe('createCreditObligation', () => {
  it('should create minimal credit obligation', () => {
    const result = createCreditObligation({ required: true });
    expect(result).toEqual({ credit: { required: true } });
  });

  it('should create full credit obligation', () => {
    const result = createCreditObligation({
      required: true,
      citation_url: 'https://example.com',
      method: 'inline',
      credit_text: 'Credit goes here',
    });
    expect(result).toEqual({
      credit: {
        required: true,
        citation_url: 'https://example.com',
        method: 'inline',
        credit_text: 'Credit goes here',
      },
    });
  });
});

describe('createContributionObligation', () => {
  it('should create minimal contribution obligation', () => {
    const result = createContributionObligation({ type: 'open' });
    expect(result).toEqual({ contribution: { type: 'open' } });
  });

  it('should create full contribution obligation', () => {
    const result = createContributionObligation({
      type: 'direct',
      destination: 'https://pay.example.com',
      min_amount: 500,
      currency: 'EUR',
    });
    expect(result).toEqual({
      contribution: {
        type: 'direct',
        destination: 'https://pay.example.com',
        min_amount: 500,
        currency: 'EUR',
      },
    });
  });
});

describe('createObligationsExtension', () => {
  it('should create empty extension with no args', () => {
    const result = createObligationsExtension();
    expect(result).toEqual({});
  });

  it('should create credit-only extension', () => {
    const result = createObligationsExtension({ required: true });
    expect(result).toEqual({ credit: { required: true } });
  });

  it('should create contribution-only extension', () => {
    const result = createObligationsExtension(undefined, { type: 'ecosystem' });
    expect(result).toEqual({ contribution: { type: 'ecosystem' } });
  });

  it('should create full extension', () => {
    const result = createObligationsExtension(
      { required: true, method: 'references' },
      { type: 'ecosystem', destination: 'https://fund.example.org' }
    );
    expect(result).toEqual({
      credit: { required: true, method: 'references' },
      contribution: { type: 'ecosystem', destination: 'https://fund.example.org' },
    });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('integration', () => {
  it('should validate full extension with all fields', () => {
    const ext: ObligationsExtension = {
      credit: {
        required: true,
        citation_url: 'https://publisher.example/collection',
        method: 'model-card',
        credit_text: 'Source: Publisher Example',
      },
      contribution: {
        type: 'ecosystem',
        destination: 'https://fund.creativecommons.org',
        min_amount: 100,
        currency: 'USD',
      },
    };

    const result = validateObligationsExtension(ext);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(isCreditRequired(result.value)).toBe(true);
      expect(isContributionRequired(result.value)).toBe(true);
    }
  });

  it('should work with receipt-like structure', () => {
    const receiptExtensions = {
      'peac/obligations': {
        credit: { required: true, method: 'inline' },
        contribution: { type: 'open' },
      },
      'vendor/other': { some: 'data' },
    };

    const obligations = extractObligationsExtension(receiptExtensions);
    expect(obligations).toBeDefined();
    expect(obligations?.credit?.method).toBe('inline');
    expect(obligations?.contribution?.type).toBe('open');
    expect(isCreditRequired(obligations)).toBe(true);
    expect(isContributionRequired(obligations)).toBe(false);
  });
});
