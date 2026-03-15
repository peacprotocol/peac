/**
 * Wire 0.2 Extension Groups: Attribution, Purpose
 *
 * Covers:
 *   - AttributionExtensionSchema: creator_ref, license_spdx, content_signal_source closed enum
 *   - PurposeExtensionSchema: external_purposes token array, peac_purpose_mapping regex bridge
 *   - Typed accessors: absent returns undefined, invalid throws PEACError with RFC 6901 pointer
 *   - Wire02ClaimsSchema integration: extension validation in superRefine
 *   - .strict() enforcement on both groups
 *   - Shared validator integration: SpdxExpressionSchema, Sha256DigestSchema
 *   - PURPOSE_TOKEN_REGEX bridging
 *   - Bounds validation: maxLength, array count limits
 *   - Registry derivation: generated constants include attribution + purpose
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  // Attribution
  AttributionExtensionSchema,
  ContentSignalSourceSchema,
  ATTRIBUTION_EXTENSION_KEY,
  CONTENT_SIGNAL_SOURCES,
  // Purpose
  PurposeExtensionSchema,
  PURPOSE_EXTENSION_KEY,
  // Accessors
  getAttributionExtension,
  getPurposeExtension,
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
    type: 'org.peacprotocol/attribution-event',
    iss: 'https://example.com',
    iat: 1700000000,
    jti: 'test-jti-ap-01',
    ...overrides,
  };
}

const VALID_ATTRIBUTION = {
  creator_ref: 'did:web:example.com',
};

const VALID_ATTRIBUTION_FULL = {
  ...VALID_ATTRIBUTION,
  license_spdx: 'MIT',
  obligation_type: 'attribution_required',
  attribution_text: 'Created by Example Corp',
  content_signal_source: 'tdmrep_json' as const,
  content_digest: 'sha256:' + 'a'.repeat(64),
};

const VALID_PURPOSE = {
  external_purposes: ['ai_training'],
};

const VALID_PURPOSE_FULL = {
  ...VALID_PURPOSE,
  external_purposes: ['ai_training', 'research'],
  purpose_basis: 'consent',
  purpose_limitation: true,
  data_minimization: true,
  compatible_purposes: ['analytics'],
  peac_purpose_mapping: 'train',
};

// ---------------------------------------------------------------------------
// AttributionExtensionSchema
// ---------------------------------------------------------------------------

describe('AttributionExtensionSchema', () => {
  it('accepts minimal valid attribution extension', () => {
    expect(AttributionExtensionSchema.safeParse(VALID_ATTRIBUTION).success).toBe(true);
  });

  it('accepts attribution with all optional fields', () => {
    expect(AttributionExtensionSchema.safeParse(VALID_ATTRIBUTION_FULL).success).toBe(true);
  });

  // content_signal_source closed enum: exhaustive coverage
  it('has exactly 5 content_signal_source values', () => {
    expect(CONTENT_SIGNAL_SOURCES).toHaveLength(5);
  });

  for (const source of CONTENT_SIGNAL_SOURCES) {
    it(`accepts content_signal_source: ${source}`, () => {
      expect(ContentSignalSourceSchema.safeParse(source).success).toBe(true);
    });
  }

  it('rejects unknown content_signal_source', () => {
    expect(
      AttributionExtensionSchema.safeParse({
        ...VALID_ATTRIBUTION,
        content_signal_source: 'unknown_source',
      }).success
    ).toBe(false);
  });

  // Required field validation
  it('rejects missing creator_ref', () => {
    expect(
      AttributionExtensionSchema.safeParse({
        license_spdx: 'MIT',
      }).success
    ).toBe(false);
  });

  it('rejects empty creator_ref', () => {
    expect(
      AttributionExtensionSchema.safeParse({
        creator_ref: '',
      }).success
    ).toBe(false);
  });

  // Bounds validation
  it('rejects creator_ref exceeding maxCreatorRefLength', () => {
    expect(
      AttributionExtensionSchema.safeParse({
        creator_ref: 'x'.repeat(EXTENSION_LIMITS.maxCreatorRefLength + 1),
      }).success
    ).toBe(false);
  });

  it('accepts creator_ref at exactly maxCreatorRefLength', () => {
    expect(
      AttributionExtensionSchema.safeParse({
        creator_ref: 'x'.repeat(EXTENSION_LIMITS.maxCreatorRefLength),
      }).success
    ).toBe(true);
  });

  it('rejects obligation_type exceeding bound', () => {
    expect(
      AttributionExtensionSchema.safeParse({
        ...VALID_ATTRIBUTION,
        obligation_type: 'x'.repeat(EXTENSION_LIMITS.maxObligationTypeLength + 1),
      }).success
    ).toBe(false);
  });

  it('rejects attribution_text exceeding maxAttributionTextLength', () => {
    expect(
      AttributionExtensionSchema.safeParse({
        ...VALID_ATTRIBUTION,
        attribution_text: 'x'.repeat(EXTENSION_LIMITS.maxAttributionTextLength + 1),
      }).success
    ).toBe(false);
  });

  // SPDX expression integration
  it('accepts valid SPDX expressions', () => {
    for (const expr of ['MIT', 'Apache-2.0', 'MIT AND Apache-2.0', 'GPL-2.0+']) {
      expect(
        AttributionExtensionSchema.safeParse({
          ...VALID_ATTRIBUTION,
          license_spdx: expr,
        }).success
      ).toBe(true);
    }
  });

  it('rejects invalid SPDX expression', () => {
    expect(
      AttributionExtensionSchema.safeParse({
        ...VALID_ATTRIBUTION,
        license_spdx: '((invalid',
      }).success
    ).toBe(false);
  });

  // SHA-256 digest integration
  it('accepts valid content_digest', () => {
    expect(
      AttributionExtensionSchema.safeParse({
        ...VALID_ATTRIBUTION,
        content_digest: 'sha256:' + 'b'.repeat(64),
      }).success
    ).toBe(true);
  });

  it('rejects content_digest with wrong prefix', () => {
    expect(
      AttributionExtensionSchema.safeParse({
        ...VALID_ATTRIBUTION,
        content_digest: 'md5:' + 'b'.repeat(32),
      }).success
    ).toBe(false);
  });

  // .strict() enforcement
  it('rejects unknown fields (strict mode)', () => {
    expect(
      AttributionExtensionSchema.safeParse({
        ...VALID_ATTRIBUTION,
        unknown_field: 'should reject',
      }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PurposeExtensionSchema
// ---------------------------------------------------------------------------

describe('PurposeExtensionSchema', () => {
  it('accepts minimal valid purpose extension', () => {
    expect(PurposeExtensionSchema.safeParse(VALID_PURPOSE).success).toBe(true);
  });

  it('accepts purpose with all optional fields', () => {
    expect(PurposeExtensionSchema.safeParse(VALID_PURPOSE_FULL).success).toBe(true);
  });

  // Required field validation
  it('rejects missing external_purposes', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        purpose_basis: 'consent',
      }).success
    ).toBe(false);
  });

  it('rejects empty external_purposes array (min 1)', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        external_purposes: [],
      }).success
    ).toBe(false);
  });

  // Bounds validation
  it('rejects external_purposes exceeding maxExternalPurposesCount', () => {
    const purposes = Array.from(
      { length: EXTENSION_LIMITS.maxExternalPurposesCount + 1 },
      (_, i) => `purpose-${i}`
    );
    expect(PurposeExtensionSchema.safeParse({ external_purposes: purposes }).success).toBe(false);
  });

  it('accepts external_purposes at exactly maxExternalPurposesCount', () => {
    const purposes = Array.from(
      { length: EXTENSION_LIMITS.maxExternalPurposesCount },
      (_, i) => `purpose-${i}`
    );
    expect(PurposeExtensionSchema.safeParse({ external_purposes: purposes }).success).toBe(true);
  });

  it('rejects external_purpose item exceeding maxExternalPurposeLength', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        external_purposes: ['x'.repeat(EXTENSION_LIMITS.maxExternalPurposeLength + 1)],
      }).success
    ).toBe(false);
  });

  it('rejects empty external_purpose item', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        external_purposes: [''],
      }).success
    ).toBe(false);
  });

  it('rejects purpose_basis exceeding maxPurposeBasisLength', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        ...VALID_PURPOSE,
        purpose_basis: 'x'.repeat(EXTENSION_LIMITS.maxPurposeBasisLength + 1),
      }).success
    ).toBe(false);
  });

  it('rejects empty purpose_basis', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        ...VALID_PURPOSE,
        purpose_basis: '',
      }).success
    ).toBe(false);
  });

  // PURPOSE_TOKEN_REGEX bridge
  it('accepts valid peac_purpose_mapping tokens', () => {
    for (const token of ['train', 'search', 'user_action', 'inference', 'index']) {
      expect(
        PurposeExtensionSchema.safeParse({
          ...VALID_PURPOSE,
          peac_purpose_mapping: token,
        }).success
      ).toBe(true);
    }
  });

  it('accepts vendor-prefixed purpose token', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        ...VALID_PURPOSE,
        peac_purpose_mapping: 'cf:ai_crawler',
      }).success
    ).toBe(true);
  });

  it('rejects uppercase purpose token', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        ...VALID_PURPOSE,
        peac_purpose_mapping: 'TRAIN',
      }).success
    ).toBe(false);
  });

  it('rejects purpose token starting with digit', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        ...VALID_PURPOSE,
        peac_purpose_mapping: '123abc',
      }).success
    ).toBe(false);
  });

  it('rejects purpose token with trailing hyphen', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        ...VALID_PURPOSE,
        peac_purpose_mapping: 'train-',
      }).success
    ).toBe(false);
  });

  it('rejects empty peac_purpose_mapping', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        ...VALID_PURPOSE,
        peac_purpose_mapping: '',
      }).success
    ).toBe(false);
  });

  // Boolean fields
  it('accepts purpose_limitation true', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        ...VALID_PURPOSE,
        purpose_limitation: true,
      }).success
    ).toBe(true);
  });

  it('accepts data_minimization false', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        ...VALID_PURPOSE,
        data_minimization: false,
      }).success
    ).toBe(true);
  });

  it('rejects non-boolean purpose_limitation', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        ...VALID_PURPOSE,
        purpose_limitation: 'yes',
      }).success
    ).toBe(false);
  });

  // Compatible purposes
  it('rejects compatible_purposes exceeding maxCompatiblePurposesCount', () => {
    const purposes = Array.from(
      { length: EXTENSION_LIMITS.maxCompatiblePurposesCount + 1 },
      (_, i) => `compat-${i}`
    );
    expect(
      PurposeExtensionSchema.safeParse({
        ...VALID_PURPOSE,
        compatible_purposes: purposes,
      }).success
    ).toBe(false);
  });

  // .strict() enforcement
  it('rejects unknown fields (strict mode)', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        ...VALID_PURPOSE,
        unknown_field: 'should reject',
      }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Typed accessors: absent, valid, invalid
// ---------------------------------------------------------------------------

describe('Typed accessors: attribution, purpose', () => {
  it('getAttributionExtension(): absent returns undefined', () => {
    expect(getAttributionExtension({})).toBeUndefined();
    expect(getAttributionExtension(undefined)).toBeUndefined();
  });

  it('getPurposeExtension(): absent returns undefined', () => {
    expect(getPurposeExtension({})).toBeUndefined();
    expect(getPurposeExtension(undefined)).toBeUndefined();
  });

  it('getAttributionExtension(): valid returns typed value', () => {
    const result = getAttributionExtension({
      [ATTRIBUTION_EXTENSION_KEY]: VALID_ATTRIBUTION_FULL,
    });
    expect(result).toBeDefined();
    expect(result!.creator_ref).toBe('did:web:example.com');
    expect(result!.license_spdx).toBe('MIT');
    expect(result!.content_signal_source).toBe('tdmrep_json');
  });

  it('getPurposeExtension(): valid returns typed value', () => {
    const result = getPurposeExtension({
      [PURPOSE_EXTENSION_KEY]: VALID_PURPOSE_FULL,
    });
    expect(result).toBeDefined();
    expect(result!.external_purposes).toEqual(['ai_training', 'research']);
    expect(result!.peac_purpose_mapping).toBe('train');
    expect(result!.purpose_limitation).toBe(true);
  });

  it('getAttributionExtension(): throws with pointer to creator_ref', () => {
    try {
      getAttributionExtension({
        [ATTRIBUTION_EXTENSION_KEY]: {
          license_spdx: 'MIT',
        },
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as PEACError;
      expect(e.code).toBe('E_INVALID_ENVELOPE');
      expect(e.pointer).toMatch(/^\/extensions\/org\.peacprotocol~1attribution/);
    }
  });

  it('getPurposeExtension(): throws with pointer to external_purposes', () => {
    try {
      getPurposeExtension({
        [PURPOSE_EXTENSION_KEY]: {
          purpose_basis: 'consent',
        },
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as PEACError;
      expect(e.code).toBe('E_INVALID_ENVELOPE');
      expect(e.pointer).toMatch(/^\/extensions\/org\.peacprotocol~1purpose/);
    }
  });
});

// ---------------------------------------------------------------------------
// Wire02ClaimsSchema integration
// ---------------------------------------------------------------------------

describe('Wire02ClaimsSchema: attribution, purpose extension validation', () => {
  it('accepts evidence with valid attribution extension', () => {
    expect(
      Wire02ClaimsSchema.safeParse(
        minimalEvidence({
          type: 'org.peacprotocol/attribution-event',
          pillars: ['attribution'],
          extensions: { [ATTRIBUTION_EXTENSION_KEY]: VALID_ATTRIBUTION },
        })
      ).success
    ).toBe(true);
  });

  it('accepts evidence with valid purpose extension', () => {
    expect(
      Wire02ClaimsSchema.safeParse(
        minimalEvidence({
          type: 'org.peacprotocol/purpose-declaration',
          pillars: ['purpose'],
          extensions: { [PURPOSE_EXTENSION_KEY]: VALID_PURPOSE },
        })
      ).success
    ).toBe(true);
  });

  it('rejects evidence with invalid attribution extension via superRefine', () => {
    expect(
      Wire02ClaimsSchema.safeParse(
        minimalEvidence({
          type: 'org.peacprotocol/attribution-event',
          pillars: ['attribution'],
          extensions: {
            [ATTRIBUTION_EXTENSION_KEY]: { license_spdx: 'MIT' },
          },
        })
      ).success
    ).toBe(false);
  });

  it('rejects evidence with invalid purpose extension via superRefine', () => {
    expect(
      Wire02ClaimsSchema.safeParse(
        minimalEvidence({
          type: 'org.peacprotocol/purpose-declaration',
          pillars: ['purpose'],
          extensions: {
            [PURPOSE_EXTENSION_KEY]: { purpose_basis: 'consent' },
          },
        })
      ).success
    ).toBe(false);
  });

  it('accepts evidence with both attribution and purpose extensions', () => {
    expect(
      Wire02ClaimsSchema.safeParse(
        minimalEvidence({
          type: 'org.peacprotocol/attribution-event',
          pillars: ['attribution', 'purpose'],
          extensions: {
            [ATTRIBUTION_EXTENSION_KEY]: VALID_ATTRIBUTION,
            [PURPOSE_EXTENSION_KEY]: VALID_PURPOSE,
          },
        })
      ).success
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Extension key constants
// ---------------------------------------------------------------------------

describe('Extension key constants', () => {
  it('ATTRIBUTION_EXTENSION_KEY is org.peacprotocol/attribution', () => {
    expect(ATTRIBUTION_EXTENSION_KEY).toBe('org.peacprotocol/attribution');
  });

  it('PURPOSE_EXTENSION_KEY is org.peacprotocol/purpose', () => {
    expect(PURPOSE_EXTENSION_KEY).toBe('org.peacprotocol/purpose');
  });
});

// ---------------------------------------------------------------------------
// Registry derivation
// ---------------------------------------------------------------------------

describe('Registry derivation: attribution + purpose keys are known', () => {
  it('REGISTERED_EXTENSION_GROUP_KEYS contains attribution', () => {
    expect(REGISTERED_EXTENSION_GROUP_KEYS.has(ATTRIBUTION_EXTENSION_KEY)).toBe(true);
  });

  it('REGISTERED_EXTENSION_GROUP_KEYS contains purpose', () => {
    expect(REGISTERED_EXTENSION_GROUP_KEYS.has(PURPOSE_EXTENSION_KEY)).toBe(true);
  });

  it('REGISTERED_EXTENSION_GROUP_KEYS has exactly 12 entries', () => {
    expect(REGISTERED_EXTENSION_GROUP_KEYS.size).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Recursive JSON-value rejection
// ---------------------------------------------------------------------------

describe('Wire02ClaimsSchema: rejects non-JSON values in attribution/purpose', () => {
  it('rejects Date in attribution extension field', () => {
    expect(
      Wire02ClaimsSchema.safeParse(
        minimalEvidence({
          extensions: {
            [ATTRIBUTION_EXTENSION_KEY]: {
              creator_ref: new Date() as unknown as string,
            },
          },
        })
      ).success
    ).toBe(false);
  });

  it('rejects Map in purpose extension value', () => {
    expect(
      Wire02ClaimsSchema.safeParse(
        minimalEvidence({
          type: 'org.peacprotocol/purpose-declaration',
          pillars: ['purpose'],
          extensions: {
            [PURPOSE_EXTENSION_KEY]: new Map([['external_purposes', ['ai_training']]]) as unknown,
          },
        })
      ).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Purpose token grammar enforcement
// ---------------------------------------------------------------------------

describe('PurposeExtensionSchema: machine-safe token grammar', () => {
  it('rejects uppercase token in external_purposes', () => {
    expect(PurposeExtensionSchema.safeParse({ external_purposes: ['AI_TRAINING'] }).success).toBe(
      false
    );
  });

  it('rejects token with whitespace in external_purposes', () => {
    expect(PurposeExtensionSchema.safeParse({ external_purposes: ['ai training'] }).success).toBe(
      false
    );
  });

  it('rejects token with slash in external_purposes', () => {
    expect(PurposeExtensionSchema.safeParse({ external_purposes: ['ai/training'] }).success).toBe(
      false
    );
  });

  it('rejects token with trailing hyphen in external_purposes', () => {
    expect(PurposeExtensionSchema.safeParse({ external_purposes: ['ai_training-'] }).success).toBe(
      false
    );
  });

  it('rejects token with trailing underscore in external_purposes', () => {
    expect(PurposeExtensionSchema.safeParse({ external_purposes: ['ai_training_'] }).success).toBe(
      false
    );
  });

  it('rejects token starting with digit in external_purposes', () => {
    expect(PurposeExtensionSchema.safeParse({ external_purposes: ['123abc'] }).success).toBe(false);
  });

  it('accepts valid machine-safe tokens', () => {
    for (const token of ['ai_training', 'analytics', 'marketing', 'cf:ai_crawler', 'a', 'a1']) {
      expect(PurposeExtensionSchema.safeParse({ external_purposes: [token] }).success).toBe(true);
    }
  });

  it('accepts vendor-prefixed tokens in external_purposes', () => {
    expect(
      PurposeExtensionSchema.safeParse({ external_purposes: ['vendor:custom-purpose'] }).success
    ).toBe(true);
  });

  it('rejects duplicate items in external_purposes', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        external_purposes: ['ai_training', 'ai_training'],
      }).success
    ).toBe(false);
  });

  it('rejects duplicate items in compatible_purposes', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        external_purposes: ['ai_training'],
        compatible_purposes: ['analytics', 'analytics'],
      }).success
    ).toBe(false);
  });

  it('rejects uppercase token in compatible_purposes', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        external_purposes: ['ai_training'],
        compatible_purposes: ['ANALYTICS'],
      }).success
    ).toBe(false);
  });

  it('rejects prose in compatible_purposes', () => {
    expect(
      PurposeExtensionSchema.safeParse({
        external_purposes: ['ai_training'],
        compatible_purposes: ['for marketing use'],
      }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SPDX input-size hardening
// ---------------------------------------------------------------------------

describe('AttributionExtensionSchema: SPDX input size', () => {
  it('rejects oversized SPDX expression (>128 chars)', () => {
    expect(
      AttributionExtensionSchema.safeParse({
        ...VALID_ATTRIBUTION,
        license_spdx: 'MIT AND ' + 'Apache-2.0 AND '.repeat(10) + 'GPL-3.0-only',
      }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Registry completion: zero null extension_groups remaining
// ---------------------------------------------------------------------------

describe('Registry completion: all receipt types have extension_group mappings', () => {
  const registries = JSON.parse(
    readFileSync(resolve(__dirname, '../../../specs/kernel/registries.json'), 'utf-8')
  );

  it('no receipt_types have extension_group: null', () => {
    const nullEntries = registries.receipt_types.values.filter(
      (e: { extension_group: string | null }) => e.extension_group === null
    );
    expect(nullEntries).toHaveLength(0);
  });

  it('all 10 receipt types have non-null extension_group', () => {
    expect(registries.receipt_types.values).toHaveLength(10);
    for (const entry of registries.receipt_types.values) {
      expect(entry.extension_group).not.toBeNull();
      expect(typeof entry.extension_group).toBe('string');
    }
  });

  it('extension_groups has exactly 12 entries', () => {
    expect(registries.extension_groups.values).toHaveLength(12);
  });
});
