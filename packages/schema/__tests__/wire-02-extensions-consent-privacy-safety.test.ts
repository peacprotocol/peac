/**
 * Wire 0.2 Extension Groups: Consent, Privacy, Safety
 *
 * Covers:
 *   - ConsentExtensionSchema: consent_basis, consent_status closed enum, data_categories, jurisdiction
 *   - PrivacyExtensionSchema: data_classification, retention_mode/recipient_scope closed enums, retention_period
 *   - SafetyExtensionSchema: review_status/risk_level closed enums, safety_measures array bounds
 *   - Typed accessors: absent returns undefined, invalid throws PEACError with RFC 6901 pointer
 *   - Wire02ClaimsSchema integration: extension validation in superRefine
 *   - .strict() enforcement on all 3 groups
 *   - Shared validator integration: Iso8601DurationSchema, HttpsUriHintSchema
 *   - Bounds validation: maxLength, array count limits
 */

import { describe, it, expect } from 'vitest';
import {
  // Consent
  ConsentExtensionSchema,
  ConsentStatusSchema,
  CONSENT_EXTENSION_KEY,
  CONSENT_STATUSES,
  // Privacy
  PrivacyExtensionSchema,
  RetentionModeSchema,
  RecipientScopeSchema,
  PRIVACY_EXTENSION_KEY,
  RETENTION_MODES,
  RECIPIENT_SCOPES,
  // Safety
  SafetyExtensionSchema,
  ReviewStatusSchema,
  RiskLevelSchema,
  SAFETY_EXTENSION_KEY,
  REVIEW_STATUSES,
  RISK_LEVELS,
  // Accessors
  getConsentExtension,
  getPrivacyExtension,
  getSafetyExtension,
  // Integration
  Wire02ClaimsSchema,
  EXTENSION_LIMITS,
  // Types
  type Wire02Claims,
  type PEACError,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function minimalEvidence(overrides?: Partial<Wire02Claims>): object {
  return {
    peac_version: '0.2',
    kind: 'evidence',
    type: 'org.peacprotocol/consent-record',
    iss: 'https://example.com',
    iat: 1700000000,
    jti: 'test-jti-cps-01',
    ...overrides,
  };
}

const VALID_CONSENT = {
  consent_basis: 'explicit',
  consent_status: 'granted' as const,
};

const VALID_CONSENT_FULL = {
  ...VALID_CONSENT,
  data_categories: ['personal', 'biometric'],
  retention_period: 'P1Y',
  consent_method: 'double_opt_in',
  withdrawal_uri: 'https://example.com/consent/withdraw',
  scope: 'marketing communications',
  jurisdiction: 'EU',
};

const VALID_PRIVACY = {
  data_classification: 'confidential',
};

const VALID_PRIVACY_FULL = {
  ...VALID_PRIVACY,
  processing_basis: 'consent',
  retention_period: 'P2Y6M',
  retention_mode: 'time_bound' as const,
  recipient_scope: 'processor' as const,
  anonymization_method: 'k_anonymity',
  data_subject_category: 'customer',
  transfer_mechanism: 'scc',
};

const VALID_SAFETY = {
  review_status: 'reviewed' as const,
};

const VALID_SAFETY_FULL = {
  ...VALID_SAFETY,
  risk_level: 'high' as const,
  assessment_method: 'red_team',
  safety_measures: ['content_filter', 'human_oversight', 'rate_limiting'],
  incident_ref: 'INC-2026-001',
  model_ref: 'model-v2.3',
  category: 'content_safety',
};

// ---------------------------------------------------------------------------
// ConsentExtensionSchema
// ---------------------------------------------------------------------------

describe('ConsentExtensionSchema', () => {
  it('accepts minimal valid consent extension', () => {
    const result = ConsentExtensionSchema.safeParse(VALID_CONSENT);
    expect(result.success).toBe(true);
  });

  it('accepts consent with all optional fields', () => {
    const result = ConsentExtensionSchema.safeParse(VALID_CONSENT_FULL);
    expect(result.success).toBe(true);
  });

  // consent_status closed enum
  it('has exactly 4 consent_status values', () => {
    expect(CONSENT_STATUSES).toHaveLength(4);
  });

  for (const status of CONSENT_STATUSES) {
    it(`accepts consent_status: ${status}`, () => {
      const result = ConsentStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    });
  }

  it('rejects unknown consent_status', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      consent_status: 'revoked',
    });
    expect(result.success).toBe(false);
  });

  // Required field validation
  it('rejects missing consent_basis', () => {
    const result = ConsentExtensionSchema.safeParse({
      consent_status: 'granted',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing consent_status', () => {
    const result = ConsentExtensionSchema.safeParse({
      consent_basis: 'explicit',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty consent_basis', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      consent_basis: '',
    });
    expect(result.success).toBe(false);
  });

  // Bounds validation
  it('rejects consent_basis exceeding maxConsentBasisLength', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      consent_basis: 'x'.repeat(EXTENSION_LIMITS.maxConsentBasisLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('accepts consent_basis at exactly maxConsentBasisLength', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      consent_basis: 'x'.repeat(EXTENSION_LIMITS.maxConsentBasisLength),
    });
    expect(result.success).toBe(true);
  });

  it('rejects data_categories exceeding maxDataCategoriesCount', () => {
    const categories = Array.from(
      { length: EXTENSION_LIMITS.maxDataCategoriesCount + 1 },
      (_, i) => `cat-${i}`
    );
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      data_categories: categories,
    });
    expect(result.success).toBe(false);
  });

  it('accepts data_categories at exactly maxDataCategoriesCount', () => {
    const categories = Array.from(
      { length: EXTENSION_LIMITS.maxDataCategoriesCount },
      (_, i) => `cat-${i}`
    );
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      data_categories: categories,
    });
    expect(result.success).toBe(true);
  });

  it('rejects data_category exceeding maxDataCategoryLength', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      data_categories: ['x'.repeat(EXTENSION_LIMITS.maxDataCategoryLength + 1)],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty data_category string', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      data_categories: [''],
    });
    expect(result.success).toBe(false);
  });

  // ISO 8601 duration integration
  it('accepts valid retention_period', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      retention_period: 'P30D',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid retention_period', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      retention_period: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects bare P for retention_period', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      retention_period: 'P',
    });
    expect(result.success).toBe(false);
  });

  // HTTPS URI hint integration
  it('accepts valid HTTPS withdrawal_uri', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      withdrawal_uri: 'https://example.com/consent/withdraw',
    });
    expect(result.success).toBe(true);
  });

  it('rejects HTTP withdrawal_uri (HTTPS required)', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      withdrawal_uri: 'http://example.com/consent/withdraw',
    });
    expect(result.success).toBe(false);
  });

  it('rejects javascript: URI in withdrawal_uri', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      withdrawal_uri: 'javascript:alert(1)',
    });
    expect(result.success).toBe(false);
  });

  it('rejects data: URI in withdrawal_uri', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      withdrawal_uri: 'data:text/html,<h1>test</h1>',
    });
    expect(result.success).toBe(false);
  });

  it('rejects withdrawal_uri with credentials', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      withdrawal_uri: 'https://user:pass@example.com/consent',
    });
    expect(result.success).toBe(false);
  });

  it('rejects withdrawal_uri with fragment', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      withdrawal_uri: 'https://example.com/consent#section',
    });
    expect(result.success).toBe(false);
  });

  it('rejects withdrawal_uri with control characters', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      withdrawal_uri: 'https://example.com/consent\x00withdraw',
    });
    expect(result.success).toBe(false);
  });

  // consent_method bounds
  it('rejects consent_method exceeding maxConsentMethodLength', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      consent_method: 'x'.repeat(EXTENSION_LIMITS.maxConsentMethodLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('accepts consent_method at exactly maxConsentMethodLength', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      consent_method: 'x'.repeat(EXTENSION_LIMITS.maxConsentMethodLength),
    });
    expect(result.success).toBe(true);
  });

  // Jurisdiction
  it('accepts valid jurisdiction codes', () => {
    for (const code of ['EU', 'US-CA', 'BR', 'GB', 'DE', 'JP', 'IN']) {
      const result = ConsentExtensionSchema.safeParse({
        ...VALID_CONSENT,
        jurisdiction: code,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects jurisdiction exceeding maxJurisdictionLength', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      jurisdiction: 'x'.repeat(EXTENSION_LIMITS.maxJurisdictionLength + 1),
    });
    expect(result.success).toBe(false);
  });

  // .strict() enforcement
  it('rejects unknown fields (strict mode)', () => {
    const result = ConsentExtensionSchema.safeParse({
      ...VALID_CONSENT,
      unknown_field: 'should reject',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PrivacyExtensionSchema
// ---------------------------------------------------------------------------

describe('PrivacyExtensionSchema', () => {
  it('accepts minimal valid privacy extension', () => {
    const result = PrivacyExtensionSchema.safeParse(VALID_PRIVACY);
    expect(result.success).toBe(true);
  });

  it('accepts privacy with all optional fields', () => {
    const result = PrivacyExtensionSchema.safeParse(VALID_PRIVACY_FULL);
    expect(result.success).toBe(true);
  });

  // retention_mode closed enum
  it('has exactly 3 retention_mode values', () => {
    expect(RETENTION_MODES).toHaveLength(3);
  });

  for (const mode of RETENTION_MODES) {
    it(`accepts retention_mode: ${mode}`, () => {
      const result = RetentionModeSchema.safeParse(mode);
      expect(result.success).toBe(true);
    });
  }

  it('rejects unknown retention_mode', () => {
    const result = PrivacyExtensionSchema.safeParse({
      ...VALID_PRIVACY,
      retention_mode: 'forever',
    });
    expect(result.success).toBe(false);
  });

  // recipient_scope closed enum
  it('has exactly 4 recipient_scope values', () => {
    expect(RECIPIENT_SCOPES).toHaveLength(4);
  });

  for (const scope of RECIPIENT_SCOPES) {
    it(`accepts recipient_scope: ${scope}`, () => {
      const result = RecipientScopeSchema.safeParse(scope);
      expect(result.success).toBe(true);
    });
  }

  it('rejects unknown recipient_scope', () => {
    const result = PrivacyExtensionSchema.safeParse({
      ...VALID_PRIVACY,
      recipient_scope: 'everyone',
    });
    expect(result.success).toBe(false);
  });

  // Required field validation
  it('rejects missing data_classification', () => {
    const result = PrivacyExtensionSchema.safeParse({
      processing_basis: 'consent',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty data_classification', () => {
    const result = PrivacyExtensionSchema.safeParse({
      data_classification: '',
    });
    expect(result.success).toBe(false);
  });

  // Bounds validation
  it('rejects data_classification exceeding maxDataClassificationLength', () => {
    const result = PrivacyExtensionSchema.safeParse({
      data_classification: 'x'.repeat(EXTENSION_LIMITS.maxDataClassificationLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('accepts data_classification at exactly maxDataClassificationLength', () => {
    const result = PrivacyExtensionSchema.safeParse({
      data_classification: 'x'.repeat(EXTENSION_LIMITS.maxDataClassificationLength),
    });
    expect(result.success).toBe(true);
  });

  // ISO 8601 duration integration
  it('accepts valid retention_period', () => {
    const result = PrivacyExtensionSchema.safeParse({
      ...VALID_PRIVACY,
      retention_period: 'P1Y6M',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid retention_period', () => {
    const result = PrivacyExtensionSchema.safeParse({
      ...VALID_PRIVACY,
      retention_period: 'not-a-duration',
    });
    expect(result.success).toBe(false);
  });

  // Retention period + mode split (v1-7 correction)
  it('accepts retention_period with retention_mode time_bound', () => {
    const result = PrivacyExtensionSchema.safeParse({
      ...VALID_PRIVACY,
      retention_period: 'P90D',
      retention_mode: 'time_bound',
    });
    expect(result.success).toBe(true);
  });

  it('accepts retention_mode without retention_period', () => {
    const result = PrivacyExtensionSchema.safeParse({
      ...VALID_PRIVACY,
      retention_mode: 'indefinite',
    });
    expect(result.success).toBe(true);
  });

  it('accepts retention_mode session_only without period', () => {
    const result = PrivacyExtensionSchema.safeParse({
      ...VALID_PRIVACY,
      retention_mode: 'session_only',
    });
    expect(result.success).toBe(true);
  });

  // .strict() enforcement
  it('rejects unknown fields (strict mode)', () => {
    const result = PrivacyExtensionSchema.safeParse({
      ...VALID_PRIVACY,
      extra_field: 'should reject',
    });
    expect(result.success).toBe(false);
  });

  // Optional field bounds
  it('rejects processing_basis exceeding maxProcessingBasisLength', () => {
    const result = PrivacyExtensionSchema.safeParse({
      ...VALID_PRIVACY,
      processing_basis: 'x'.repeat(EXTENSION_LIMITS.maxProcessingBasisLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty processing_basis', () => {
    const result = PrivacyExtensionSchema.safeParse({
      ...VALID_PRIVACY,
      processing_basis: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects anonymization_method exceeding bound', () => {
    const result = PrivacyExtensionSchema.safeParse({
      ...VALID_PRIVACY,
      anonymization_method: 'x'.repeat(EXTENSION_LIMITS.maxAnonymizationMethodLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects transfer_mechanism exceeding bound', () => {
    const result = PrivacyExtensionSchema.safeParse({
      ...VALID_PRIVACY,
      transfer_mechanism: 'x'.repeat(EXTENSION_LIMITS.maxTransferMechanismLength + 1),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SafetyExtensionSchema
// ---------------------------------------------------------------------------

describe('SafetyExtensionSchema', () => {
  it('accepts minimal valid safety extension', () => {
    const result = SafetyExtensionSchema.safeParse(VALID_SAFETY);
    expect(result.success).toBe(true);
  });

  it('accepts safety with all optional fields', () => {
    const result = SafetyExtensionSchema.safeParse(VALID_SAFETY_FULL);
    expect(result.success).toBe(true);
  });

  // review_status closed enum
  it('has exactly 4 review_status values', () => {
    expect(REVIEW_STATUSES).toHaveLength(4);
  });

  for (const status of REVIEW_STATUSES) {
    it(`accepts review_status: ${status}`, () => {
      const result = ReviewStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    });
  }

  it('rejects unknown review_status', () => {
    const result = SafetyExtensionSchema.safeParse({
      review_status: 'approved',
    });
    expect(result.success).toBe(false);
  });

  // risk_level closed enum
  it('has exactly 4 risk_level values', () => {
    expect(RISK_LEVELS).toHaveLength(4);
  });

  for (const level of RISK_LEVELS) {
    it(`accepts risk_level: ${level}`, () => {
      const result = RiskLevelSchema.safeParse(level);
      expect(result.success).toBe(true);
    });
  }

  it('rejects unknown risk_level', () => {
    const result = SafetyExtensionSchema.safeParse({
      ...VALID_SAFETY,
      risk_level: 'critical',
    });
    expect(result.success).toBe(false);
  });

  // risk_level is optional at schema level (v1-6 correction)
  it('accepts safety without risk_level (jurisdiction neutral)', () => {
    const result = SafetyExtensionSchema.safeParse({
      review_status: 'reviewed',
      assessment_method: 'automated_scan',
    });
    expect(result.success).toBe(true);
  });

  // Required field validation
  it('rejects missing review_status', () => {
    const result = SafetyExtensionSchema.safeParse({
      risk_level: 'high',
    });
    expect(result.success).toBe(false);
  });

  // safety_measures array bounds
  it('rejects safety_measures exceeding maxSafetyMeasuresCount', () => {
    const measures = Array.from(
      { length: EXTENSION_LIMITS.maxSafetyMeasuresCount + 1 },
      (_, i) => `measure-${i}`
    );
    const result = SafetyExtensionSchema.safeParse({
      ...VALID_SAFETY,
      safety_measures: measures,
    });
    expect(result.success).toBe(false);
  });

  it('accepts safety_measures at exactly maxSafetyMeasuresCount', () => {
    const measures = Array.from(
      { length: EXTENSION_LIMITS.maxSafetyMeasuresCount },
      (_, i) => `measure-${i}`
    );
    const result = SafetyExtensionSchema.safeParse({
      ...VALID_SAFETY,
      safety_measures: measures,
    });
    expect(result.success).toBe(true);
  });

  it('rejects safety_measure exceeding maxSafetyMeasureLength', () => {
    const result = SafetyExtensionSchema.safeParse({
      ...VALID_SAFETY,
      safety_measures: ['x'.repeat(EXTENSION_LIMITS.maxSafetyMeasureLength + 1)],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty safety_measure string', () => {
    const result = SafetyExtensionSchema.safeParse({
      ...VALID_SAFETY,
      safety_measures: [''],
    });
    expect(result.success).toBe(false);
  });

  // Bounds validation for optional string fields
  it('rejects assessment_method exceeding bound', () => {
    const result = SafetyExtensionSchema.safeParse({
      ...VALID_SAFETY,
      assessment_method: 'x'.repeat(EXTENSION_LIMITS.maxAssessmentMethodLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects incident_ref exceeding bound', () => {
    const result = SafetyExtensionSchema.safeParse({
      ...VALID_SAFETY,
      incident_ref: 'x'.repeat(EXTENSION_LIMITS.maxIncidentRefLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects model_ref exceeding bound', () => {
    const result = SafetyExtensionSchema.safeParse({
      ...VALID_SAFETY,
      model_ref: 'x'.repeat(EXTENSION_LIMITS.maxModelRefLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects category exceeding bound', () => {
    const result = SafetyExtensionSchema.safeParse({
      ...VALID_SAFETY,
      category: 'x'.repeat(EXTENSION_LIMITS.maxSafetyCategoryLength + 1),
    });
    expect(result.success).toBe(false);
  });

  // .strict() enforcement
  it('rejects unknown fields (strict mode)', () => {
    const result = SafetyExtensionSchema.safeParse({
      ...VALID_SAFETY,
      extra_field: 'should reject',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Typed accessors: absent, valid, invalid
// ---------------------------------------------------------------------------

describe('Typed accessors: consent, privacy, safety', () => {
  // Absent returns undefined
  it('getConsentExtension(): absent returns undefined', () => {
    expect(getConsentExtension({})).toBeUndefined();
    expect(getConsentExtension(undefined)).toBeUndefined();
  });

  it('getPrivacyExtension(): absent returns undefined', () => {
    expect(getPrivacyExtension({})).toBeUndefined();
    expect(getPrivacyExtension(undefined)).toBeUndefined();
  });

  it('getSafetyExtension(): absent returns undefined', () => {
    expect(getSafetyExtension({})).toBeUndefined();
    expect(getSafetyExtension(undefined)).toBeUndefined();
  });

  // Valid returns typed value
  it('getConsentExtension(): valid returns typed value', () => {
    const result = getConsentExtension({
      [CONSENT_EXTENSION_KEY]: VALID_CONSENT_FULL,
    });
    expect(result).toBeDefined();
    expect(result!.consent_basis).toBe('explicit');
    expect(result!.consent_status).toBe('granted');
    expect(result!.data_categories).toEqual(['personal', 'biometric']);
    expect(result!.jurisdiction).toBe('EU');
  });

  it('getPrivacyExtension(): valid returns typed value', () => {
    const result = getPrivacyExtension({
      [PRIVACY_EXTENSION_KEY]: VALID_PRIVACY_FULL,
    });
    expect(result).toBeDefined();
    expect(result!.data_classification).toBe('confidential');
    expect(result!.retention_mode).toBe('time_bound');
    expect(result!.recipient_scope).toBe('processor');
  });

  it('getSafetyExtension(): valid returns typed value', () => {
    const result = getSafetyExtension({
      [SAFETY_EXTENSION_KEY]: VALID_SAFETY_FULL,
    });
    expect(result).toBeDefined();
    expect(result!.review_status).toBe('reviewed');
    expect(result!.risk_level).toBe('high');
    expect(result!.safety_measures).toEqual(['content_filter', 'human_oversight', 'rate_limiting']);
  });

  // Invalid throws PEACError with RFC 6901 pointer
  it('getConsentExtension(): throws with pointer to consent_status', () => {
    try {
      getConsentExtension({
        [CONSENT_EXTENSION_KEY]: {
          consent_basis: 'explicit',
          consent_status: 'invalid_status',
        },
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as PEACError;
      expect(e.code).toBe('E_INVALID_ENVELOPE');
      expect(e.pointer).toBe('/extensions/org.peacprotocol~1consent/consent_status');
    }
  });

  it('getPrivacyExtension(): throws with pointer to retention_mode', () => {
    try {
      getPrivacyExtension({
        [PRIVACY_EXTENSION_KEY]: {
          data_classification: 'confidential',
          retention_mode: 'forever',
        },
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as PEACError;
      expect(e.code).toBe('E_INVALID_ENVELOPE');
      expect(e.pointer).toBe('/extensions/org.peacprotocol~1privacy/retention_mode');
    }
  });

  it('getSafetyExtension(): throws with pointer to review_status', () => {
    try {
      getSafetyExtension({
        [SAFETY_EXTENSION_KEY]: {
          review_status: 'approved',
        },
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as PEACError;
      expect(e.code).toBe('E_INVALID_ENVELOPE');
      expect(e.pointer).toBe('/extensions/org.peacprotocol~1safety/review_status');
    }
  });

  it('getSafetyExtension(): throws with group-level pointer when all required fields missing', () => {
    try {
      getSafetyExtension({
        [SAFETY_EXTENSION_KEY]: {},
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as PEACError;
      expect(e.code).toBe('E_INVALID_ENVELOPE');
      expect(e.pointer).toMatch(/^\/extensions\/org\.peacprotocol~1safety/);
    }
  });
});

// ---------------------------------------------------------------------------
// Wire02ClaimsSchema integration: extension validation in superRefine
// ---------------------------------------------------------------------------

describe('Wire02ClaimsSchema: consent, privacy, safety extension validation', () => {
  it('accepts evidence with valid consent extension', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/consent-record',
        pillars: ['consent'],
        extensions: {
          [CONSENT_EXTENSION_KEY]: VALID_CONSENT,
        },
      })
    );
    expect(result.success).toBe(true);
  });

  it('accepts evidence with valid privacy extension', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/privacy-signal',
        pillars: ['privacy'],
        extensions: {
          [PRIVACY_EXTENSION_KEY]: VALID_PRIVACY,
        },
      })
    );
    expect(result.success).toBe(true);
  });

  it('accepts evidence with valid safety extension', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/safety-review',
        pillars: ['safety'],
        extensions: {
          [SAFETY_EXTENSION_KEY]: VALID_SAFETY,
        },
      })
    );
    expect(result.success).toBe(true);
  });

  it('rejects evidence with invalid consent extension via superRefine', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/consent-record',
        pillars: ['consent'],
        extensions: {
          [CONSENT_EXTENSION_KEY]: {
            consent_basis: 'explicit',
            consent_status: 'invalid_status',
          },
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects evidence with invalid privacy extension via superRefine', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/privacy-signal',
        pillars: ['privacy'],
        extensions: {
          [PRIVACY_EXTENSION_KEY]: {
            // missing required data_classification
            processing_basis: 'consent',
          },
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects evidence with invalid safety extension via superRefine', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/safety-review',
        pillars: ['safety'],
        extensions: {
          [SAFETY_EXTENSION_KEY]: {
            // missing required review_status
            risk_level: 'high',
          },
        },
      })
    );
    expect(result.success).toBe(false);
  });

  // Multi-extension: consent + privacy + safety together
  it('accepts evidence with multiple new extension groups', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/consent-record',
        pillars: ['consent', 'privacy', 'safety'],
        extensions: {
          [CONSENT_EXTENSION_KEY]: VALID_CONSENT,
          [PRIVACY_EXTENSION_KEY]: VALID_PRIVACY,
          [SAFETY_EXTENSION_KEY]: VALID_SAFETY,
        },
      })
    );
    expect(result.success).toBe(true);
  });

  // Cross-group: new + existing extensions together (correlation is type-neutral)
  it('accepts evidence mixing new and existing extension groups', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/consent-record',
        pillars: ['consent'],
        extensions: {
          [CONSENT_EXTENSION_KEY]: VALID_CONSENT,
          'org.peacprotocol/correlation': {
            trace_id: 'a'.repeat(32),
            span_id: 'b'.repeat(16),
          },
        },
      })
    );
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Extension key constants
// ---------------------------------------------------------------------------

describe('Extension key constants', () => {
  it('CONSENT_EXTENSION_KEY is org.peacprotocol/consent', () => {
    expect(CONSENT_EXTENSION_KEY).toBe('org.peacprotocol/consent');
  });

  it('PRIVACY_EXTENSION_KEY is org.peacprotocol/privacy', () => {
    expect(PRIVACY_EXTENSION_KEY).toBe('org.peacprotocol/privacy');
  });

  it('SAFETY_EXTENSION_KEY is org.peacprotocol/safety', () => {
    expect(SAFETY_EXTENSION_KEY).toBe('org.peacprotocol/safety');
  });
});

// ---------------------------------------------------------------------------
// Recursive JSON-value rejection: exotic values in new extension shapes
// ---------------------------------------------------------------------------

describe('Wire02ClaimsSchema: rejects non-JSON values in consent/privacy/safety', () => {
  it('rejects Date in data_categories array', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/consent-record',
        pillars: ['consent'],
        extensions: {
          [CONSENT_EXTENSION_KEY]: {
            consent_basis: 'explicit',
            consent_status: 'granted',
            data_categories: [new Date() as unknown as string],
          },
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects Map in consent extension value', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/consent-record',
        pillars: ['consent'],
        extensions: {
          [CONSENT_EXTENSION_KEY]: new Map([['consent_basis', 'explicit']]) as unknown,
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects Set in safety_measures array', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/safety-review',
        pillars: ['safety'],
        extensions: {
          [SAFETY_EXTENSION_KEY]: {
            review_status: 'reviewed',
            safety_measures: new Set(['filter']) as unknown as string[],
          },
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects BigInt in privacy extension field', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/privacy-signal',
        pillars: ['privacy'],
        extensions: {
          [PRIVACY_EXTENSION_KEY]: {
            data_classification: BigInt(42) as unknown as string,
          },
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects object with toJSON in consent extension', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/consent-record',
        pillars: ['consent'],
        extensions: {
          [CONSENT_EXTENSION_KEY]: {
            consent_basis: 'explicit',
            consent_status: 'granted',
            data_categories: { toJSON: () => ['personal'] } as unknown as string[],
          },
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects shared-reference objects in safety extension', () => {
    const shared = { value: 'shared' };
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/safety-review',
        pillars: ['safety'],
        extensions: {
          [SAFETY_EXTENSION_KEY]: {
            review_status: 'reviewed',
            incident_ref: shared as unknown as string,
            model_ref: shared as unknown as string,
          },
        },
      })
    );
    // Zod will reject because incident_ref/model_ref are not strings
    expect(result.success).toBe(false);
  });

  it('rejects deeply nested non-JSON value in consent extension', () => {
    const deep: Record<string, unknown> = { level: 0 };
    let current = deep;
    for (let i = 1; i < 10; i++) {
      const next: Record<string, unknown> = { level: i };
      current.nested = next;
      current = next;
    }
    current.bad = Symbol('poison');

    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/consent-record',
        pillars: ['consent'],
        extensions: {
          [CONSENT_EXTENSION_KEY]: deep as unknown,
        },
      })
    );
    expect(result.success).toBe(false);
  });
});
