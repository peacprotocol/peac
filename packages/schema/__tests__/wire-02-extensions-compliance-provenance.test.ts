/**
 * Wire 0.2 Extension Groups: Compliance, Provenance
 *
 * Covers:
 *   - ComplianceExtensionSchema: framework, compliance_status closed enum, audit_ref, auditor, audit_date
 *   - ProvenanceExtensionSchema: source_type, custody_chain nested entries, slsa structured object
 *   - Typed accessors: absent returns undefined, invalid throws PEACError with RFC 6901 pointer
 *   - Wire02ClaimsSchema integration: extension validation in superRefine
 *   - .strict() enforcement on both groups and nested schemas
 *   - Shared validator integration: Iso8601DurationSchema, Iso8601DateStringSchema, HttpsUriHintSchema,
 *     Sha256DigestSchema, Rfc3339DateTimeSchema
 *   - Bounds validation: maxLength, array count limits
 *   - Nested schema validation: CustodyEntrySchema, SlsaLevelSchema
 */

import { describe, it, expect } from 'vitest';
import {
  // Compliance
  ComplianceExtensionSchema,
  ComplianceStatusSchema,
  COMPLIANCE_EXTENSION_KEY,
  COMPLIANCE_STATUSES,
  // Provenance
  ProvenanceExtensionSchema,
  CustodyEntrySchema,
  SlsaLevelSchema,
  PROVENANCE_EXTENSION_KEY,
  // Accessors
  getComplianceExtension,
  getProvenanceExtension,
  // Integration
  Wire02ClaimsSchema,
  EXTENSION_LIMITS,
  // Registry derivation
  REGISTERED_EXTENSION_GROUP_KEYS,
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
    type: 'org.peacprotocol/compliance-check',
    iss: 'https://example.com',
    iat: 1700000000,
    jti: 'test-jti-cp-01',
    ...overrides,
  };
}

const VALID_COMPLIANCE = {
  framework: 'eu-ai-act',
  compliance_status: 'compliant' as const,
};

const VALID_COMPLIANCE_FULL = {
  ...VALID_COMPLIANCE,
  audit_ref: 'AUD-2026-001',
  auditor: 'Acme Audit Corp',
  audit_date: '2026-03-14',
  scope: 'AI model deployment risk assessment',
  validity_period: 'P1Y',
  evidence_ref: 'sha256:' + 'a'.repeat(64),
};

const VALID_PROVENANCE = {
  source_type: 'original',
};

const VALID_PROVENANCE_FULL = {
  ...VALID_PROVENANCE,
  source_ref: 'sha256:' + 'b'.repeat(64),
  source_uri: 'https://example.com/artifacts/v1.0.0',
  build_provenance_uri: 'https://example.com/provenance/build-123',
  verification_method: 'signature_check',
  custody_chain: [
    {
      custodian: 'Acme Data Corp',
      action: 'received',
      timestamp: '2026-03-01T10:00:00Z',
    },
    {
      custodian: 'Acme ML Pipeline',
      action: 'transformed',
      timestamp: '2026-03-02T14:30:00Z',
    },
  ],
  slsa: {
    track: 'build',
    level: 3,
    version: '1.2',
  },
};

const VALID_CUSTODY_ENTRY = {
  custodian: 'Acme Data Corp',
  action: 'received',
  timestamp: '2026-03-01T10:00:00Z',
};

const VALID_SLSA = {
  track: 'build',
  level: 3,
  version: '1.2',
};

// ---------------------------------------------------------------------------
// ComplianceExtensionSchema
// ---------------------------------------------------------------------------

describe('ComplianceExtensionSchema', () => {
  it('accepts minimal valid compliance extension', () => {
    const result = ComplianceExtensionSchema.safeParse(VALID_COMPLIANCE);
    expect(result.success).toBe(true);
  });

  it('accepts compliance with all optional fields', () => {
    const result = ComplianceExtensionSchema.safeParse(VALID_COMPLIANCE_FULL);
    expect(result.success).toBe(true);
  });

  // compliance_status closed enum
  it('has exactly 5 compliance_status values', () => {
    expect(COMPLIANCE_STATUSES).toHaveLength(5);
  });

  for (const status of COMPLIANCE_STATUSES) {
    it(`accepts compliance_status: ${status}`, () => {
      const result = ComplianceStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    });
  }

  it('rejects unknown compliance_status', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      compliance_status: 'certified',
    });
    expect(result.success).toBe(false);
  });

  // Required field validation
  it('rejects missing framework', () => {
    const result = ComplianceExtensionSchema.safeParse({
      compliance_status: 'compliant',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing compliance_status', () => {
    const result = ComplianceExtensionSchema.safeParse({
      framework: 'iso-27001',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty framework', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      framework: '',
    });
    expect(result.success).toBe(false);
  });

  // Bounds validation
  it('rejects framework exceeding maxFrameworkLength', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      framework: 'x'.repeat(EXTENSION_LIMITS.maxFrameworkLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('accepts framework at exactly maxFrameworkLength', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      framework: 'x'.repeat(EXTENSION_LIMITS.maxFrameworkLength),
    });
    expect(result.success).toBe(true);
  });

  it('rejects audit_ref exceeding maxAuditRefLength', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      audit_ref: 'x'.repeat(EXTENSION_LIMITS.maxAuditRefLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('accepts audit_ref at exactly maxAuditRefLength', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      audit_ref: 'x'.repeat(EXTENSION_LIMITS.maxAuditRefLength),
    });
    expect(result.success).toBe(true);
  });

  it('rejects auditor exceeding maxAuditorLength', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      auditor: 'x'.repeat(EXTENSION_LIMITS.maxAuditorLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects scope exceeding maxComplianceScopeLength', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      scope: 'x'.repeat(EXTENSION_LIMITS.maxComplianceScopeLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty audit_ref', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      audit_ref: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty auditor', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      auditor: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty scope', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      scope: '',
    });
    expect(result.success).toBe(false);
  });

  // ISO 8601 date integration
  it('accepts valid audit_date', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      audit_date: '2026-03-14',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid audit_date format', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      audit_date: '2026-3-14',
    });
    expect(result.success).toBe(false);
  });

  it('rejects audit_date with impossible month', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      audit_date: '2026-13-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects audit_date that is a timestamp', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      audit_date: '2026-03-14T12:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  // ISO 8601 duration integration
  it('accepts valid validity_period', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      validity_period: 'P1Y',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid validity_period', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      validity_period: 'not-a-duration',
    });
    expect(result.success).toBe(false);
  });

  it('rejects bare P for validity_period', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      validity_period: 'P',
    });
    expect(result.success).toBe(false);
  });

  // SHA-256 digest integration
  it('accepts valid SHA-256 evidence_ref', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      evidence_ref: 'sha256:' + 'a'.repeat(64),
    });
    expect(result.success).toBe(true);
  });

  it('rejects evidence_ref with wrong prefix', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      evidence_ref: 'md5:' + 'a'.repeat(32),
    });
    expect(result.success).toBe(false);
  });

  it('rejects evidence_ref with wrong hex length', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      evidence_ref: 'sha256:' + 'a'.repeat(63),
    });
    expect(result.success).toBe(false);
  });

  it('rejects evidence_ref with uppercase hex', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      evidence_ref: 'sha256:' + 'A'.repeat(64),
    });
    expect(result.success).toBe(false);
  });

  // .strict() enforcement
  it('rejects unknown fields (strict mode)', () => {
    const result = ComplianceExtensionSchema.safeParse({
      ...VALID_COMPLIANCE,
      unknown_field: 'should reject',
    });
    expect(result.success).toBe(false);
  });

  // Framework slug examples
  it('accepts common framework slugs', () => {
    for (const fw of ['eu-ai-act', 'soc2-type2', 'iso-27001', 'nist-ai-rmf', 'gdpr', 'hipaa']) {
      const result = ComplianceExtensionSchema.safeParse({
        ...VALID_COMPLIANCE,
        framework: fw,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// CustodyEntrySchema (nested)
// ---------------------------------------------------------------------------

describe('CustodyEntrySchema', () => {
  it('accepts valid custody entry', () => {
    const result = CustodyEntrySchema.safeParse(VALID_CUSTODY_ENTRY);
    expect(result.success).toBe(true);
  });

  it('rejects missing custodian', () => {
    const result = CustodyEntrySchema.safeParse({
      action: 'received',
      timestamp: '2026-03-01T10:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing action', () => {
    const result = CustodyEntrySchema.safeParse({
      custodian: 'Acme',
      timestamp: '2026-03-01T10:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing timestamp', () => {
    const result = CustodyEntrySchema.safeParse({
      custodian: 'Acme',
      action: 'received',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty custodian', () => {
    const result = CustodyEntrySchema.safeParse({
      ...VALID_CUSTODY_ENTRY,
      custodian: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty action', () => {
    const result = CustodyEntrySchema.safeParse({
      ...VALID_CUSTODY_ENTRY,
      action: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects custodian exceeding maxCustodianLength', () => {
    const result = CustodyEntrySchema.safeParse({
      ...VALID_CUSTODY_ENTRY,
      custodian: 'x'.repeat(EXTENSION_LIMITS.maxCustodianLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects action exceeding maxCustodyActionLength', () => {
    const result = CustodyEntrySchema.safeParse({
      ...VALID_CUSTODY_ENTRY,
      action: 'x'.repeat(EXTENSION_LIMITS.maxCustodyActionLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects timestamp without seconds (RFC 3339 requires seconds)', () => {
    const result = CustodyEntrySchema.safeParse({
      ...VALID_CUSTODY_ENTRY,
      timestamp: '2026-03-01T10:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('accepts timestamp with fractional seconds', () => {
    const result = CustodyEntrySchema.safeParse({
      ...VALID_CUSTODY_ENTRY,
      timestamp: '2026-03-01T10:00:00.123Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts timestamp with offset', () => {
    const result = CustodyEntrySchema.safeParse({
      ...VALID_CUSTODY_ENTRY,
      timestamp: '2026-03-01T10:00:00+05:30',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown fields (strict mode)', () => {
    const result = CustodyEntrySchema.safeParse({
      ...VALID_CUSTODY_ENTRY,
      extra_field: 'should reject',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SlsaLevelSchema (nested)
// ---------------------------------------------------------------------------

describe('SlsaLevelSchema', () => {
  it('accepts valid SLSA level', () => {
    const result = SlsaLevelSchema.safeParse(VALID_SLSA);
    expect(result.success).toBe(true);
  });

  it('rejects missing track', () => {
    const result = SlsaLevelSchema.safeParse({
      level: 3,
      version: '1.2',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing level', () => {
    const result = SlsaLevelSchema.safeParse({
      track: 'build',
      version: '1.2',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing version', () => {
    const result = SlsaLevelSchema.safeParse({
      track: 'build',
      level: 3,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty track', () => {
    const result = SlsaLevelSchema.safeParse({
      ...VALID_SLSA,
      track: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty version', () => {
    const result = SlsaLevelSchema.safeParse({
      ...VALID_SLSA,
      version: '',
    });
    expect(result.success).toBe(false);
  });

  it('accepts level 0', () => {
    const result = SlsaLevelSchema.safeParse({
      ...VALID_SLSA,
      level: 0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts level 4', () => {
    const result = SlsaLevelSchema.safeParse({
      ...VALID_SLSA,
      level: 4,
    });
    expect(result.success).toBe(true);
  });

  it('rejects level -1', () => {
    const result = SlsaLevelSchema.safeParse({
      ...VALID_SLSA,
      level: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects level 5', () => {
    const result = SlsaLevelSchema.safeParse({
      ...VALID_SLSA,
      level: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer level', () => {
    const result = SlsaLevelSchema.safeParse({
      ...VALID_SLSA,
      level: 2.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects track exceeding maxSlsaTrackLength', () => {
    const result = SlsaLevelSchema.safeParse({
      ...VALID_SLSA,
      track: 'x'.repeat(EXTENSION_LIMITS.maxSlsaTrackLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects version exceeding maxSlsaVersionLength', () => {
    const result = SlsaLevelSchema.safeParse({
      ...VALID_SLSA,
      version: 'x'.repeat(EXTENSION_LIMITS.maxSlsaVersionLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('accepts common SLSA track values', () => {
    for (const track of ['build', 'source']) {
      const result = SlsaLevelSchema.safeParse({
        ...VALID_SLSA,
        track,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects unknown fields (strict mode)', () => {
    const result = SlsaLevelSchema.safeParse({
      ...VALID_SLSA,
      extra_field: 'should reject',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ProvenanceExtensionSchema
// ---------------------------------------------------------------------------

describe('ProvenanceExtensionSchema', () => {
  it('accepts minimal valid provenance extension', () => {
    const result = ProvenanceExtensionSchema.safeParse(VALID_PROVENANCE);
    expect(result.success).toBe(true);
  });

  it('accepts provenance with all optional fields', () => {
    const result = ProvenanceExtensionSchema.safeParse(VALID_PROVENANCE_FULL);
    expect(result.success).toBe(true);
  });

  // Required field validation
  it('rejects missing source_type', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      source_ref: 'sha256:' + 'a'.repeat(64),
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty source_type', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      source_type: '',
    });
    expect(result.success).toBe(false);
  });

  // Bounds validation
  it('rejects source_type exceeding maxSourceTypeLength', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      source_type: 'x'.repeat(EXTENSION_LIMITS.maxSourceTypeLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('accepts source_type at exactly maxSourceTypeLength', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      source_type: 'x'.repeat(EXTENSION_LIMITS.maxSourceTypeLength),
    });
    expect(result.success).toBe(true);
  });

  it('rejects source_ref exceeding maxSourceRefLength', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      source_ref: 'x'.repeat(EXTENSION_LIMITS.maxSourceRefLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty source_ref', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      source_ref: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects verification_method exceeding maxVerificationMethodLength', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      verification_method: 'x'.repeat(EXTENSION_LIMITS.maxVerificationMethodLength + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty verification_method', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      verification_method: '',
    });
    expect(result.success).toBe(false);
  });

  // HTTPS URI hint integration
  it('accepts valid HTTPS source_uri', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      source_uri: 'https://example.com/artifacts/v1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects HTTP source_uri (HTTPS required)', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      source_uri: 'http://example.com/artifacts/v1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects source_uri with credentials', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      source_uri: 'https://user:pass@example.com/artifacts',
    });
    expect(result.success).toBe(false);
  });

  it('rejects source_uri with fragment', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      source_uri: 'https://example.com/artifacts#section',
    });
    expect(result.success).toBe(false);
  });

  it('rejects source_uri with control characters', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      source_uri: 'https://example.com/artifacts\x00v1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects javascript: URI in source_uri', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      source_uri: 'javascript:alert(1)',
    });
    expect(result.success).toBe(false);
  });

  it('rejects data: URI in source_uri', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      source_uri: 'data:text/html,<h1>test</h1>',
    });
    expect(result.success).toBe(false);
  });

  // build_provenance_uri validation
  it('accepts valid HTTPS build_provenance_uri', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      build_provenance_uri: 'https://example.com/provenance/build-123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects HTTP build_provenance_uri', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      build_provenance_uri: 'http://example.com/provenance/build-123',
    });
    expect(result.success).toBe(false);
  });

  // Custody chain
  it('accepts empty custody_chain array', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      custody_chain: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts custody_chain with valid entries', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      custody_chain: [VALID_CUSTODY_ENTRY],
    });
    expect(result.success).toBe(true);
  });

  it('rejects custody_chain exceeding maxCustodyChainCount', () => {
    const entries = Array.from({ length: EXTENSION_LIMITS.maxCustodyChainCount + 1 }, (_, i) => ({
      custodian: `custodian-${i}`,
      action: 'transferred',
      timestamp: '2026-03-01T10:00:00Z',
    }));
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      custody_chain: entries,
    });
    expect(result.success).toBe(false);
  });

  it('accepts custody_chain at exactly maxCustodyChainCount', () => {
    const entries = Array.from({ length: EXTENSION_LIMITS.maxCustodyChainCount }, (_, i) => ({
      custodian: `custodian-${i}`,
      action: 'transferred',
      timestamp: '2026-03-01T10:00:00Z',
    }));
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      custody_chain: entries,
    });
    expect(result.success).toBe(true);
  });

  it('rejects custody_chain with invalid entry', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      custody_chain: [
        {
          custodian: 'Acme',
          // missing action and timestamp
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  // SLSA
  it('accepts valid slsa object', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      slsa: VALID_SLSA,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid slsa object', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      slsa: { track: 'build' }, // missing level and version
    });
    expect(result.success).toBe(false);
  });

  // Source type examples
  it('accepts common source_type values', () => {
    for (const st of ['original', 'derived', 'curated', 'synthetic', 'aggregated', 'transformed']) {
      const result = ProvenanceExtensionSchema.safeParse({
        source_type: st,
      });
      expect(result.success).toBe(true);
    }
  });

  // .strict() enforcement
  it('rejects unknown fields (strict mode)', () => {
    const result = ProvenanceExtensionSchema.safeParse({
      ...VALID_PROVENANCE,
      unknown_field: 'should reject',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Typed accessors: absent, valid, invalid
// ---------------------------------------------------------------------------

describe('Typed accessors: compliance, provenance', () => {
  // Absent returns undefined
  it('getComplianceExtension(): absent returns undefined', () => {
    expect(getComplianceExtension({})).toBeUndefined();
    expect(getComplianceExtension(undefined)).toBeUndefined();
  });

  it('getProvenanceExtension(): absent returns undefined', () => {
    expect(getProvenanceExtension({})).toBeUndefined();
    expect(getProvenanceExtension(undefined)).toBeUndefined();
  });

  // Valid returns typed value
  it('getComplianceExtension(): valid returns typed value', () => {
    const result = getComplianceExtension({
      [COMPLIANCE_EXTENSION_KEY]: VALID_COMPLIANCE_FULL,
    });
    expect(result).toBeDefined();
    expect(result!.framework).toBe('eu-ai-act');
    expect(result!.compliance_status).toBe('compliant');
    expect(result!.audit_date).toBe('2026-03-14');
    expect(result!.auditor).toBe('Acme Audit Corp');
  });

  it('getProvenanceExtension(): valid returns typed value', () => {
    const result = getProvenanceExtension({
      [PROVENANCE_EXTENSION_KEY]: VALID_PROVENANCE_FULL,
    });
    expect(result).toBeDefined();
    expect(result!.source_type).toBe('original');
    expect(result!.custody_chain).toHaveLength(2);
    expect(result!.slsa!.track).toBe('build');
    expect(result!.slsa!.level).toBe(3);
    expect(result!.slsa!.version).toBe('1.2');
  });

  // Invalid throws PEACError with RFC 6901 pointer
  it('getComplianceExtension(): throws with pointer to compliance_status', () => {
    try {
      getComplianceExtension({
        [COMPLIANCE_EXTENSION_KEY]: {
          framework: 'eu-ai-act',
          compliance_status: 'certified',
        },
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as PEACError;
      expect(e.code).toBe('E_INVALID_ENVELOPE');
      expect(e.pointer).toBe('/extensions/org.peacprotocol~1compliance/compliance_status');
    }
  });

  it('getProvenanceExtension(): throws with pointer to source_type', () => {
    try {
      getProvenanceExtension({
        [PROVENANCE_EXTENSION_KEY]: {
          // source_type missing entirely
          source_ref: 'some-ref',
        },
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as PEACError;
      expect(e.code).toBe('E_INVALID_ENVELOPE');
      expect(e.pointer).toMatch(/^\/extensions\/org\.peacprotocol~1provenance/);
    }
  });

  it('getComplianceExtension(): throws when all required fields missing', () => {
    try {
      getComplianceExtension({
        [COMPLIANCE_EXTENSION_KEY]: {},
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as PEACError;
      expect(e.code).toBe('E_INVALID_ENVELOPE');
      expect(e.pointer).toMatch(/^\/extensions\/org\.peacprotocol~1compliance/);
    }
  });
});

// ---------------------------------------------------------------------------
// Wire02ClaimsSchema integration: extension validation in superRefine
// ---------------------------------------------------------------------------

describe('Wire02ClaimsSchema: compliance, provenance extension validation', () => {
  it('accepts evidence with valid compliance extension', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/compliance-check',
        pillars: ['compliance'],
        extensions: {
          [COMPLIANCE_EXTENSION_KEY]: VALID_COMPLIANCE,
        },
      })
    );
    expect(result.success).toBe(true);
  });

  it('accepts evidence with valid provenance extension', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/provenance-record',
        pillars: ['provenance'],
        extensions: {
          [PROVENANCE_EXTENSION_KEY]: VALID_PROVENANCE,
        },
      })
    );
    expect(result.success).toBe(true);
  });

  it('rejects evidence with invalid compliance extension via superRefine', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/compliance-check',
        pillars: ['compliance'],
        extensions: {
          [COMPLIANCE_EXTENSION_KEY]: {
            framework: 'eu-ai-act',
            compliance_status: 'certified',
          },
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects evidence with invalid provenance extension via superRefine', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/provenance-record',
        pillars: ['provenance'],
        extensions: {
          [PROVENANCE_EXTENSION_KEY]: {
            // missing required source_type
            source_ref: 'some-ref',
          },
        },
      })
    );
    expect(result.success).toBe(false);
  });

  // Multi-extension: compliance + provenance together
  it('accepts evidence with both compliance and provenance extensions', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/compliance-check',
        pillars: ['compliance', 'provenance'],
        extensions: {
          [COMPLIANCE_EXTENSION_KEY]: VALID_COMPLIANCE,
          [PROVENANCE_EXTENSION_KEY]: VALID_PROVENANCE,
        },
      })
    );
    expect(result.success).toBe(true);
  });

  // Cross-group: new + existing extensions together
  it('accepts evidence mixing compliance/provenance with existing groups', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/compliance-check',
        pillars: ['compliance'],
        extensions: {
          [COMPLIANCE_EXTENSION_KEY]: VALID_COMPLIANCE,
          'org.peacprotocol/correlation': {
            trace_id: 'a'.repeat(32),
            span_id: 'b'.repeat(16),
          },
        },
      })
    );
    expect(result.success).toBe(true);
  });

  // Provenance with full custody chain in envelope
  it('accepts evidence with provenance including custody chain and SLSA', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/provenance-record',
        pillars: ['provenance'],
        extensions: {
          [PROVENANCE_EXTENSION_KEY]: VALID_PROVENANCE_FULL,
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
  it('COMPLIANCE_EXTENSION_KEY is org.peacprotocol/compliance', () => {
    expect(COMPLIANCE_EXTENSION_KEY).toBe('org.peacprotocol/compliance');
  });

  it('PROVENANCE_EXTENSION_KEY is org.peacprotocol/provenance', () => {
    expect(PROVENANCE_EXTENSION_KEY).toBe('org.peacprotocol/provenance');
  });
});

// ---------------------------------------------------------------------------
// Recursive JSON-value rejection: exotic values in compliance/provenance
// ---------------------------------------------------------------------------

describe('Wire02ClaimsSchema: rejects non-JSON values in compliance/provenance', () => {
  it('rejects Date in compliance extension field', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/compliance-check',
        pillars: ['compliance'],
        extensions: {
          [COMPLIANCE_EXTENSION_KEY]: {
            framework: 'eu-ai-act',
            compliance_status: 'compliant',
            audit_date: new Date() as unknown as string,
          },
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects Map in provenance extension value', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/provenance-record',
        pillars: ['provenance'],
        extensions: {
          [PROVENANCE_EXTENSION_KEY]: new Map([['source_type', 'original']]) as unknown,
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects BigInt in compliance extension field', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/compliance-check',
        pillars: ['compliance'],
        extensions: {
          [COMPLIANCE_EXTENSION_KEY]: {
            framework: BigInt(42) as unknown as string,
            compliance_status: 'compliant',
          },
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects object with toJSON in provenance extension', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/provenance-record',
        pillars: ['provenance'],
        extensions: {
          [PROVENANCE_EXTENSION_KEY]: {
            source_type: 'original',
            custody_chain: { toJSON: () => [] } as unknown as unknown[],
          },
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects Symbol in deeply nested custody_chain entry', () => {
    const result = Wire02ClaimsSchema.safeParse(
      minimalEvidence({
        type: 'org.peacprotocol/provenance-record',
        pillars: ['provenance'],
        extensions: {
          [PROVENANCE_EXTENSION_KEY]: {
            source_type: 'original',
            custody_chain: [
              {
                custodian: Symbol('bad') as unknown as string,
                action: 'received',
                timestamp: '2026-03-01T10:00:00Z',
              },
            ],
          },
        },
      })
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Registry derivation: generated constants drive known-group handling
// ---------------------------------------------------------------------------

describe('Registry derivation: compliance + provenance keys are known', () => {
  it('REGISTERED_EXTENSION_GROUP_KEYS contains compliance', () => {
    expect(REGISTERED_EXTENSION_GROUP_KEYS.has(COMPLIANCE_EXTENSION_KEY)).toBe(true);
  });

  it('REGISTERED_EXTENSION_GROUP_KEYS contains provenance', () => {
    expect(REGISTERED_EXTENSION_GROUP_KEYS.has(PROVENANCE_EXTENSION_KEY)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Exhaustive compliance_status enum coverage
// ---------------------------------------------------------------------------

describe('ComplianceExtensionSchema: all compliance_status values accepted', () => {
  for (const status of COMPLIANCE_STATUSES) {
    it(`accepts compliance_status: ${status}`, () => {
      const result = ComplianceExtensionSchema.safeParse({
        framework: 'eu-ai-act',
        compliance_status: status,
      });
      expect(result.success).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// SLSA boundary coverage
// ---------------------------------------------------------------------------

describe('SlsaLevelSchema: boundary values', () => {
  it('accepts level 0 (minimum)', () => {
    expect(SlsaLevelSchema.safeParse({ track: 'build', level: 0, version: '1.2' }).success).toBe(
      true
    );
  });

  it('accepts level 4 (maximum)', () => {
    expect(SlsaLevelSchema.safeParse({ track: 'build', level: 4, version: '1.2' }).success).toBe(
      true
    );
  });

  it('rejects level -1 (below minimum)', () => {
    expect(SlsaLevelSchema.safeParse({ track: 'build', level: -1, version: '1.2' }).success).toBe(
      false
    );
  });

  it('rejects level 5 (above maximum)', () => {
    expect(SlsaLevelSchema.safeParse({ track: 'build', level: 5, version: '1.2' }).success).toBe(
      false
    );
  });

  it('rejects non-integer level', () => {
    expect(SlsaLevelSchema.safeParse({ track: 'build', level: 2.5, version: '1.2' }).success).toBe(
      false
    );
  });
});

// ---------------------------------------------------------------------------
// Custody chain boundary and nested strict coverage
// ---------------------------------------------------------------------------

describe('ProvenanceExtensionSchema: custody_chain boundaries', () => {
  it('accepts custody_chain at exactly maxCustodyChainCount', () => {
    const entries = Array.from({ length: EXTENSION_LIMITS.maxCustodyChainCount }, (_, i) => ({
      custodian: `custodian-${i}`,
      action: 'transferred',
      timestamp: '2026-03-01T10:00:00Z',
    }));
    expect(
      ProvenanceExtensionSchema.safeParse({ source_type: 'original', custody_chain: entries })
        .success
    ).toBe(true);
  });

  it('rejects custody_chain exceeding maxCustodyChainCount', () => {
    const entries = Array.from({ length: EXTENSION_LIMITS.maxCustodyChainCount + 1 }, (_, i) => ({
      custodian: `custodian-${i}`,
      action: 'transferred',
      timestamp: '2026-03-01T10:00:00Z',
    }));
    expect(
      ProvenanceExtensionSchema.safeParse({ source_type: 'original', custody_chain: entries })
        .success
    ).toBe(false);
  });

  it('rejects custody_chain entry with extra field (nested .strict())', () => {
    expect(
      ProvenanceExtensionSchema.safeParse({
        source_type: 'original',
        custody_chain: [
          {
            custodian: 'Acme',
            action: 'received',
            timestamp: '2026-03-01T10:00:00Z',
            extra_field: 'rejected',
          },
        ],
      }).success
    ).toBe(false);
  });
});
