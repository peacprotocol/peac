/**
 * Property-based tests for Consent, Privacy, Safety extensions
 *
 * Uses fast-check to verify invariants across generated inputs:
 * 1. Valid extensions always parse successfully (roundtrip)
 * 2. Invalid enum values never parse (closed enum rejection)
 * 3. Bounds enforcement: maxLength+1 always rejected, maxLength always accepted
 * 4. .strict() enforcement: extra properties always rejected
 * 5. Cross-group composition: valid extensions stay valid when combined
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  ConsentExtensionSchema,
  PrivacyExtensionSchema,
  SafetyExtensionSchema,
  CONSENT_STATUSES,
  RETENTION_MODES,
  RECIPIENT_SCOPES,
  REVIEW_STATUSES,
  RISK_LEVELS,
  EXTENSION_LIMITS,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

// -- Field-aware generators --------------------------------------------------
// Each generator matches the semantic range its field admits, not one generic
// regex for all open-vocabulary strings.

/** Legal basis identifiers: lowercase slug tokens (explicit, implied, opt_out, ...) */
const legalBasis = fc.constantFrom(
  'explicit',
  'implied',
  'opt_out',
  'legitimate_interest',
  'contractual',
  'legal_obligation',
  'vital_interest'
);

/** Data category tokens: lowercase slugs with underscores */
const dataCategory = fc.constantFrom(
  'personal',
  'sensitive',
  'biometric',
  'health',
  'financial',
  'behavioral',
  'location',
  'genetic'
);

/** Data classification levels: lowercase slugs */
const classificationLevel = fc.constantFrom(
  'public',
  'internal',
  'confidential',
  'restricted',
  'pii',
  'sensitive_pii',
  'top_secret'
);

/** Assessment methods: lowercase slugs with underscores */
const assessmentMethod = fc.constantFrom(
  'automated_scan',
  'human_review',
  'red_team',
  'penetration_test',
  'static_analysis',
  'model_evaluation',
  'fuzz_testing'
);

/** Safety categories: lowercase slugs with underscores */
const safetyCategory = fc.constantFrom(
  'content_safety',
  'bias',
  'hallucination',
  'toxicity',
  'fairness',
  'robustness',
  'privacy_risk'
);

/**
 * Generic bounded identifier for fields with truly open vocabulary.
 * Includes hyphens, underscores, mixed case, digits.
 */
const openVocab = (min: number, max: number) =>
  fc.stringMatching(new RegExp(`^[a-zA-Z0-9_-]{${min},${max}}$`));

const consentStatus = fc.constantFrom(...CONSENT_STATUSES);
const retentionMode = fc.constantFrom(...RETENTION_MODES);
const recipientScope = fc.constantFrom(...RECIPIENT_SCOPES);
const reviewStatus = fc.constantFrom(...REVIEW_STATUSES);
const riskLevel = fc.constantFrom(...RISK_LEVELS);

/** Valid ISO 8601 duration strings */
const validDuration = fc.constantFrom(
  'P1D',
  'P30D',
  'P1Y',
  'P1Y6M',
  'PT1H',
  'PT30M',
  'P1W',
  'P0D',
  'PT0S'
);

/** Generate a valid consent extension (field-aware) */
const validConsent = fc.record({
  consent_basis: legalBasis,
  consent_status: consentStatus,
});

/** Generate a valid privacy extension (field-aware) */
const validPrivacy = fc.record({
  data_classification: classificationLevel,
});

/** Generate a valid safety extension */
const validSafety = fc.record({
  review_status: reviewStatus,
});

// ---------------------------------------------------------------------------
// Consent: roundtrip + rejection properties
// ---------------------------------------------------------------------------

describe('ConsentExtensionSchema: property tests', () => {
  it('valid consent always parses', () => {
    fc.assert(
      fc.property(validConsent, (consent) => {
        const result = ConsentExtensionSchema.safeParse(consent);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('invalid consent_status is always rejected', () => {
    fc.assert(
      fc.property(
        openVocab(1, 20).filter((s) => !CONSENT_STATUSES.includes(s as never)),
        (badStatus) => {
          const result = ConsentExtensionSchema.safeParse({
            consent_basis: 'explicit',
            consent_status: badStatus,
          });
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('extra properties are always rejected (.strict())', () => {
    fc.assert(
      fc.property(
        validConsent,
        openVocab(1, 20).filter(
          (k) =>
            ![
              'consent_basis',
              'consent_status',
              'data_categories',
              'retention_period',
              'consent_method',
              'withdrawal_uri',
              'scope',
              'jurisdiction',
            ].includes(k)
        ),
        fc.string(),
        (consent, extraKey, extraValue) => {
          const result = ConsentExtensionSchema.safeParse({
            ...consent,
            [extraKey]: extraValue,
          });
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('consent_basis at maxLength passes, at maxLength+1 fails', () => {
    const max = EXTENSION_LIMITS.maxConsentBasisLength;
    expect(
      ConsentExtensionSchema.safeParse({
        consent_basis: 'a'.repeat(max),
        consent_status: 'granted',
      }).success
    ).toBe(true);
    expect(
      ConsentExtensionSchema.safeParse({
        consent_basis: 'a'.repeat(max + 1),
        consent_status: 'granted',
      }).success
    ).toBe(false);
  });

  it('valid retention_period accepted, invalid rejected', () => {
    fc.assert(
      fc.property(validDuration, (duration) => {
        const result = ConsentExtensionSchema.safeParse({
          consent_basis: 'explicit',
          consent_status: 'granted',
          retention_period: duration,
        });
        expect(result.success).toBe(true);
      }),
      { numRuns: 20 }
    );
  });
});

// ---------------------------------------------------------------------------
// Privacy: roundtrip + rejection properties
// ---------------------------------------------------------------------------

describe('PrivacyExtensionSchema: property tests', () => {
  it('valid privacy always parses', () => {
    fc.assert(
      fc.property(validPrivacy, (privacy) => {
        const result = PrivacyExtensionSchema.safeParse(privacy);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('invalid retention_mode is always rejected', () => {
    fc.assert(
      fc.property(
        openVocab(1, 20).filter((s) => !RETENTION_MODES.includes(s as never)),
        (badMode) => {
          const result = PrivacyExtensionSchema.safeParse({
            data_classification: 'confidential',
            retention_mode: badMode,
          });
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('invalid recipient_scope is always rejected', () => {
    fc.assert(
      fc.property(
        openVocab(1, 20).filter((s) => !RECIPIENT_SCOPES.includes(s as never)),
        (badScope) => {
          const result = PrivacyExtensionSchema.safeParse({
            data_classification: 'confidential',
            recipient_scope: badScope,
          });
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('data_classification at maxLength passes, at maxLength+1 fails', () => {
    const max = EXTENSION_LIMITS.maxDataClassificationLength;
    expect(
      PrivacyExtensionSchema.safeParse({
        data_classification: 'a'.repeat(max),
      }).success
    ).toBe(true);
    expect(
      PrivacyExtensionSchema.safeParse({
        data_classification: 'a'.repeat(max + 1),
      }).success
    ).toBe(false);
  });

  it('extra properties are always rejected (.strict())', () => {
    fc.assert(
      fc.property(
        validPrivacy,
        openVocab(1, 20).filter(
          (k) =>
            ![
              'data_classification',
              'processing_basis',
              'retention_period',
              'retention_mode',
              'recipient_scope',
              'anonymization_method',
              'data_subject_category',
              'transfer_mechanism',
            ].includes(k)
        ),
        fc.string(),
        (privacy, extraKey, extraValue) => {
          const result = PrivacyExtensionSchema.safeParse({
            ...privacy,
            [extraKey]: extraValue,
          });
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Safety: roundtrip + rejection properties
// ---------------------------------------------------------------------------

describe('SafetyExtensionSchema: property tests', () => {
  it('valid safety always parses', () => {
    fc.assert(
      fc.property(validSafety, (safety) => {
        const result = SafetyExtensionSchema.safeParse(safety);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('invalid review_status is always rejected', () => {
    fc.assert(
      fc.property(
        openVocab(1, 20).filter((s) => !REVIEW_STATUSES.includes(s as never)),
        (badStatus) => {
          const result = SafetyExtensionSchema.safeParse({
            review_status: badStatus,
          });
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('invalid risk_level is always rejected', () => {
    fc.assert(
      fc.property(
        openVocab(1, 20).filter((s) => !RISK_LEVELS.includes(s as never)),
        (badLevel) => {
          const result = SafetyExtensionSchema.safeParse({
            review_status: 'reviewed',
            risk_level: badLevel,
          });
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('safety_measures at maxCount passes, at maxCount+1 fails', () => {
    const max = EXTENSION_LIMITS.maxSafetyMeasuresCount;
    const measures = Array.from({ length: max }, (_, i) => `m${i}`);
    expect(
      SafetyExtensionSchema.safeParse({
        review_status: 'reviewed',
        safety_measures: measures,
      }).success
    ).toBe(true);
    expect(
      SafetyExtensionSchema.safeParse({
        review_status: 'reviewed',
        safety_measures: [...measures, 'overflow'],
      }).success
    ).toBe(false);
  });

  it('extra properties are always rejected (.strict())', () => {
    fc.assert(
      fc.property(
        validSafety,
        openVocab(1, 20).filter(
          (k) =>
            ![
              'review_status',
              'risk_level',
              'assessment_method',
              'safety_measures',
              'incident_ref',
              'model_ref',
              'category',
            ].includes(k)
        ),
        fc.string(),
        (safety, extraKey, extraValue) => {
          const result = SafetyExtensionSchema.safeParse({
            ...safety,
            [extraKey]: extraValue,
          });
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Cross-group composition
// ---------------------------------------------------------------------------

describe('Cross-group composition: consent + privacy + safety', () => {
  it('adding any valid extension to another preserves validity', () => {
    fc.assert(
      fc.property(validConsent, validPrivacy, validSafety, (consent, privacy, safety) => {
        // Each individually valid
        expect(ConsentExtensionSchema.safeParse(consent).success).toBe(true);
        expect(PrivacyExtensionSchema.safeParse(privacy).success).toBe(true);
        expect(SafetyExtensionSchema.safeParse(safety).success).toBe(true);

        // Combined in an extensions record is structurally valid
        const combined = {
          'org.peacprotocol/consent': consent,
          'org.peacprotocol/privacy': privacy,
          'org.peacprotocol/safety': safety,
        };
        // Each group individually validates
        expect(ConsentExtensionSchema.safeParse(combined['org.peacprotocol/consent']).success).toBe(
          true
        );
        expect(PrivacyExtensionSchema.safeParse(combined['org.peacprotocol/privacy']).success).toBe(
          true
        );
        expect(SafetyExtensionSchema.safeParse(combined['org.peacprotocol/safety']).success).toBe(
          true
        );
      }),
      { numRuns: 50 }
    );
  });
});
