/**
 * Property-based tests for Compliance, Provenance extensions
 *
 * Uses fast-check to verify invariants across generated inputs:
 * 1. Valid extensions always parse successfully (roundtrip)
 * 2. Invalid enum values never parse (closed enum rejection)
 * 3. Bounds enforcement: maxLength+1 always rejected, maxLength always accepted
 * 4. .strict() enforcement: extra properties always rejected
 * 5. Cross-group composition: valid extensions stay valid when combined
 * 6. Nested schema invariants: CustodyEntrySchema, SlsaLevelSchema
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  ComplianceExtensionSchema,
  ProvenanceExtensionSchema,
  CustodyEntrySchema,
  SlsaLevelSchema,
  COMPLIANCE_STATUSES,
  EXTENSION_LIMITS,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Framework identifiers: lowercase slugs with hyphens */
const frameworkSlug = fc.constantFrom(
  'eu-ai-act',
  'soc2-type2',
  'iso-27001',
  'nist-ai-rmf',
  'gdpr',
  'hipaa',
  'ccpa',
  'pci-dss'
);

/** Compliance status values */
const complianceStatus = fc.constantFrom(...COMPLIANCE_STATUSES);

/** Audit reference identifiers */
const auditRef = fc.constantFrom(
  'AUD-2026-001',
  'AUD-2026-002',
  'RPT-FY2025-Q4',
  'sha256:' + 'a'.repeat(64)
);

/** Auditor identifiers */
const auditorName = fc.constantFrom(
  'Acme Audit Corp',
  'Big Four LLP',
  'Internal Compliance',
  'did:web:auditor.example.com'
);

/** Source type values aligned with W3C PROV-DM */
const sourceType = fc.constantFrom(
  'original',
  'derived',
  'curated',
  'synthetic',
  'aggregated',
  'transformed'
);

/** Verification method identifiers */
const verificationMethod = fc.constantFrom(
  'signature_check',
  'hash_chain',
  'manual_attestation',
  'transparency_log'
);

/** Custody chain action values */
const custodyAction = fc.constantFrom(
  'received',
  'transformed',
  'verified',
  'released',
  'archived'
);

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

/** Valid ISO 8601 date strings */
const validDate = fc.constantFrom('2026-03-14', '2025-01-01', '2026-12-31', '2024-06-15');

/** Valid RFC 3339 timestamps with seconds */
const validTimestamp = fc.constantFrom(
  '2026-03-01T10:00:00Z',
  '2026-03-02T14:30:00+05:30',
  '2025-12-31T23:59:59Z',
  '2026-06-15T00:00:00.123Z'
);

/** SLSA track identifiers */
const slsaTrack = fc.constantFrom('build', 'source');

/** SLSA level (0-4) */
const slsaLevel = fc.integer({ min: 0, max: 4 });

/** SLSA version strings */
const slsaVersion = fc.constantFrom('1.0', '1.1', '1.2');

/**
 * Generic bounded identifier for fields with open vocabulary.
 */
const openVocab = (min: number, max: number) =>
  fc.stringMatching(new RegExp(`^[a-zA-Z0-9_-]{${min},${max}}$`));

// ---------------------------------------------------------------------------
// Composite arbitraries
// ---------------------------------------------------------------------------

/** Generate a valid custody entry */
const validCustodyEntry = fc.record({
  custodian: auditorName,
  action: custodyAction,
  timestamp: validTimestamp,
});

/** Generate a valid SLSA level object */
const validSlsa = fc.record({
  track: slsaTrack,
  level: slsaLevel,
  version: slsaVersion,
});

/** Generate a valid compliance extension (field-aware) */
const validCompliance = fc
  .record({
    framework: frameworkSlug,
    compliance_status: complianceStatus,
    audit_ref: fc.option(auditRef, { nil: undefined }),
    auditor: fc.option(auditorName, { nil: undefined }),
    audit_date: fc.option(validDate, { nil: undefined }),
    scope: fc.option(openVocab(1, 20), { nil: undefined }),
    validity_period: fc.option(validDuration, { nil: undefined }),
  })
  .map(({ audit_ref, auditor, audit_date, scope, validity_period, ...rest }) => ({
    ...rest,
    ...(audit_ref !== undefined ? { audit_ref } : {}),
    ...(auditor !== undefined ? { auditor } : {}),
    ...(audit_date !== undefined ? { audit_date } : {}),
    ...(scope !== undefined ? { scope } : {}),
    ...(validity_period !== undefined ? { validity_period } : {}),
  }));

/** Generate a valid provenance extension (field-aware) */
const validProvenance = fc
  .record({
    source_type: sourceType,
    source_ref: fc.option(fc.constant('sha256:' + 'c'.repeat(64)), { nil: undefined }),
    verification_method: fc.option(verificationMethod, { nil: undefined }),
    custody_chain: fc.option(fc.array(validCustodyEntry, { minLength: 0, maxLength: 3 }), {
      nil: undefined,
    }),
    slsa: fc.option(validSlsa, { nil: undefined }),
  })
  .map(({ source_ref, verification_method, custody_chain, slsa, ...rest }) => ({
    ...rest,
    ...(source_ref !== undefined ? { source_ref } : {}),
    ...(verification_method !== undefined ? { verification_method } : {}),
    ...(custody_chain !== undefined ? { custody_chain } : {}),
    ...(slsa !== undefined ? { slsa } : {}),
  }));

// ---------------------------------------------------------------------------
// Compliance property tests
// ---------------------------------------------------------------------------

describe('ComplianceExtensionSchema: property tests', () => {
  it('valid compliance always parses', () => {
    fc.assert(
      fc.property(validCompliance, (compliance) => {
        const result = ComplianceExtensionSchema.safeParse(compliance);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('invalid compliance_status is always rejected', () => {
    fc.assert(
      fc.property(
        openVocab(1, 20).filter((s) => !COMPLIANCE_STATUSES.includes(s as never)),
        (badStatus) => {
          const result = ComplianceExtensionSchema.safeParse({
            framework: 'eu-ai-act',
            compliance_status: badStatus,
          });
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('framework at maxLength passes, at maxLength+1 fails', () => {
    const max = EXTENSION_LIMITS.maxFrameworkLength;
    expect(
      ComplianceExtensionSchema.safeParse({
        framework: 'a'.repeat(max),
        compliance_status: 'compliant',
      }).success
    ).toBe(true);
    expect(
      ComplianceExtensionSchema.safeParse({
        framework: 'a'.repeat(max + 1),
        compliance_status: 'compliant',
      }).success
    ).toBe(false);
  });

  it('extra properties are always rejected (.strict())', () => {
    fc.assert(
      fc.property(
        validCompliance,
        openVocab(1, 20).filter(
          (k) =>
            ![
              'framework',
              'compliance_status',
              'audit_ref',
              'auditor',
              'audit_date',
              'scope',
              'validity_period',
              'evidence_ref',
            ].includes(k)
        ),
        fc.string(),
        (compliance, extraKey, extraValue) => {
          const result = ComplianceExtensionSchema.safeParse({
            ...compliance,
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
// Provenance property tests
// ---------------------------------------------------------------------------

describe('ProvenanceExtensionSchema: property tests', () => {
  it('valid provenance always parses', () => {
    fc.assert(
      fc.property(validProvenance, (provenance) => {
        const result = ProvenanceExtensionSchema.safeParse(provenance);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('source_type at maxLength passes, at maxLength+1 fails', () => {
    const max = EXTENSION_LIMITS.maxSourceTypeLength;
    expect(
      ProvenanceExtensionSchema.safeParse({
        source_type: 'a'.repeat(max),
      }).success
    ).toBe(true);
    expect(
      ProvenanceExtensionSchema.safeParse({
        source_type: 'a'.repeat(max + 1),
      }).success
    ).toBe(false);
  });

  it('extra properties are always rejected (.strict())', () => {
    fc.assert(
      fc.property(
        validProvenance,
        openVocab(1, 20).filter(
          (k) =>
            ![
              'source_type',
              'source_ref',
              'source_uri',
              'build_provenance_uri',
              'verification_method',
              'custody_chain',
              'slsa',
            ].includes(k)
        ),
        fc.string(),
        (provenance, extraKey, extraValue) => {
          const result = ProvenanceExtensionSchema.safeParse({
            ...provenance,
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
// Nested schema property tests
// ---------------------------------------------------------------------------

describe('CustodyEntrySchema: property tests', () => {
  it('valid custody entry always parses', () => {
    fc.assert(
      fc.property(validCustodyEntry, (entry) => {
        const result = CustodyEntrySchema.safeParse(entry);
        expect(result.success).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  it('extra properties in custody entry are always rejected', () => {
    fc.assert(
      fc.property(
        validCustodyEntry,
        openVocab(1, 20).filter((k) => !['custodian', 'action', 'timestamp'].includes(k)),
        fc.string(),
        (entry, extraKey, extraValue) => {
          const result = CustodyEntrySchema.safeParse({
            ...entry,
            [extraKey]: extraValue,
          });
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('SlsaLevelSchema: property tests', () => {
  it('valid SLSA level always parses', () => {
    fc.assert(
      fc.property(validSlsa, (slsa) => {
        const result = SlsaLevelSchema.safeParse(slsa);
        expect(result.success).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  it('level outside 0-4 range is always rejected', () => {
    fc.assert(
      fc.property(
        fc.integer().filter((n) => n < 0 || n > 4),
        (badLevel) => {
          const result = SlsaLevelSchema.safeParse({
            track: 'build',
            level: badLevel,
            version: '1.2',
          });
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('non-integer level is always rejected', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 3.9, noNaN: true }).filter((n) => !Number.isInteger(n)),
        (badLevel) => {
          const result = SlsaLevelSchema.safeParse({
            track: 'build',
            level: badLevel,
            version: '1.2',
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

describe('Cross-group composition: compliance + provenance', () => {
  it('adding any valid extension to another preserves validity', () => {
    fc.assert(
      fc.property(validCompliance, validProvenance, (compliance, provenance) => {
        expect(ComplianceExtensionSchema.safeParse(compliance).success).toBe(true);
        expect(ProvenanceExtensionSchema.safeParse(provenance).success).toBe(true);

        const combined = {
          'org.peacprotocol/compliance': compliance,
          'org.peacprotocol/provenance': provenance,
        };
        expect(
          ComplianceExtensionSchema.safeParse(combined['org.peacprotocol/compliance']).success
        ).toBe(true);
        expect(
          ProvenanceExtensionSchema.safeParse(combined['org.peacprotocol/provenance']).success
        ).toBe(true);
      }),
      { numRuns: 50 }
    );
  });
});
