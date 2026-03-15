/**
 * Property-based tests for Attribution, Purpose extensions
 *
 * Uses fast-check to verify invariants across generated inputs:
 * 1. Valid extensions always parse successfully (roundtrip)
 * 2. Invalid enum values never parse (closed enum rejection)
 * 3. Bounds enforcement: maxLength+1 always rejected, maxLength always accepted
 * 4. .strict() enforcement: extra properties always rejected
 * 5. Cross-group composition: valid extensions stay valid when combined
 * 6. PURPOSE_TOKEN_REGEX bridging: valid tokens always accepted
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  AttributionExtensionSchema,
  PurposeExtensionSchema,
  CONTENT_SIGNAL_SOURCES,
  EXTENSION_LIMITS,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Creator reference identifiers */
const creatorRef = fc.constantFrom(
  'did:web:example.com',
  'did:key:z6Mk',
  'https://example.com/creator',
  'acme-corp',
  'org-id-12345'
);

/** SPDX license expressions */
const spdxExpression = fc.constantFrom(
  'MIT',
  'Apache-2.0',
  'GPL-3.0-only',
  'MIT AND Apache-2.0',
  'MIT OR GPL-2.0+',
  'LicenseRef-custom'
);

/** Obligation types */
const obligationType = fc.constantFrom(
  'attribution_required',
  'share_alike',
  'non_commercial',
  'no_derivatives'
);

/** Content signal sources */
const contentSignalSource = fc.constantFrom(...CONTENT_SIGNAL_SOURCES);

/** External purpose tokens */
const externalPurpose = fc.constantFrom(
  'ai_training',
  'analytics',
  'marketing',
  'service_provision',
  'research',
  'legal_compliance'
);

/** Valid PEAC purpose tokens (lowercase, optional vendor prefix) */
const peacPurposeToken = fc.constantFrom('train', 'search', 'user_action', 'inference', 'index');

/**
 * Generic bounded identifier for open vocabulary fields.
 */
const openVocab = (min: number, max: number) =>
  fc.stringMatching(new RegExp(`^[a-zA-Z0-9_-]{${min},${max}}$`));

// ---------------------------------------------------------------------------
// Composite arbitraries
// ---------------------------------------------------------------------------

/** Generate a valid attribution extension */
const validAttribution = fc
  .record({
    creator_ref: creatorRef,
    license_spdx: fc.option(spdxExpression, { nil: undefined }),
    obligation_type: fc.option(obligationType, { nil: undefined }),
    content_signal_source: fc.option(contentSignalSource, { nil: undefined }),
  })
  .map(({ license_spdx, obligation_type, content_signal_source, ...rest }) => ({
    ...rest,
    ...(license_spdx !== undefined ? { license_spdx } : {}),
    ...(obligation_type !== undefined ? { obligation_type } : {}),
    ...(content_signal_source !== undefined ? { content_signal_source } : {}),
  }));

/** Generate a valid purpose extension */
const validPurpose = fc
  .record({
    external_purposes: fc.uniqueArray(externalPurpose, { minLength: 1, maxLength: 5 }),
    purpose_basis: fc.option(openVocab(1, 20), { nil: undefined }),
    purpose_limitation: fc.option(fc.boolean(), { nil: undefined }),
    data_minimization: fc.option(fc.boolean(), { nil: undefined }),
    peac_purpose_mapping: fc.option(peacPurposeToken, { nil: undefined }),
  })
  .map(
    ({ purpose_basis, purpose_limitation, data_minimization, peac_purpose_mapping, ...rest }) => ({
      ...rest,
      ...(purpose_basis !== undefined ? { purpose_basis } : {}),
      ...(purpose_limitation !== undefined ? { purpose_limitation } : {}),
      ...(data_minimization !== undefined ? { data_minimization } : {}),
      ...(peac_purpose_mapping !== undefined ? { peac_purpose_mapping } : {}),
    })
  );

// ---------------------------------------------------------------------------
// Attribution property tests
// ---------------------------------------------------------------------------

describe('AttributionExtensionSchema: property tests', () => {
  it('valid attribution always parses', () => {
    fc.assert(
      fc.property(validAttribution, (attribution) => {
        expect(AttributionExtensionSchema.safeParse(attribution).success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('invalid content_signal_source is always rejected', () => {
    fc.assert(
      fc.property(
        openVocab(1, 20).filter((s) => !CONTENT_SIGNAL_SOURCES.includes(s as never)),
        (badSource) => {
          expect(
            AttributionExtensionSchema.safeParse({
              creator_ref: 'acme-corp',
              content_signal_source: badSource,
            }).success
          ).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('creator_ref at maxLength passes, at maxLength+1 fails', () => {
    const max = EXTENSION_LIMITS.maxCreatorRefLength;
    expect(AttributionExtensionSchema.safeParse({ creator_ref: 'a'.repeat(max) }).success).toBe(
      true
    );
    expect(AttributionExtensionSchema.safeParse({ creator_ref: 'a'.repeat(max + 1) }).success).toBe(
      false
    );
  });

  it('extra properties are always rejected (.strict())', () => {
    fc.assert(
      fc.property(
        validAttribution,
        openVocab(1, 20).filter(
          (k) =>
            ![
              'creator_ref',
              'license_spdx',
              'obligation_type',
              'attribution_text',
              'content_signal_source',
              'content_digest',
            ].includes(k)
        ),
        fc.string(),
        (attribution, extraKey, extraValue) => {
          expect(
            AttributionExtensionSchema.safeParse({
              ...attribution,
              [extraKey]: extraValue,
            }).success
          ).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Purpose property tests
// ---------------------------------------------------------------------------

describe('PurposeExtensionSchema: property tests', () => {
  it('valid purpose always parses', () => {
    fc.assert(
      fc.property(validPurpose, (purpose) => {
        expect(PurposeExtensionSchema.safeParse(purpose).success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('external_purposes must have at least 1 item', () => {
    expect(PurposeExtensionSchema.safeParse({ external_purposes: [] }).success).toBe(false);
  });

  it('extra properties are always rejected (.strict())', () => {
    fc.assert(
      fc.property(
        validPurpose,
        openVocab(1, 20).filter(
          (k) =>
            ![
              'external_purposes',
              'purpose_basis',
              'purpose_limitation',
              'data_minimization',
              'compatible_purposes',
              'peac_purpose_mapping',
            ].includes(k)
        ),
        fc.string(),
        (purpose, extraKey, extraValue) => {
          expect(
            PurposeExtensionSchema.safeParse({
              ...purpose,
              [extraKey]: extraValue,
            }).success
          ).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('valid PEAC purpose tokens always parse as peac_purpose_mapping', () => {
    fc.assert(
      fc.property(peacPurposeToken, (token) => {
        expect(
          PurposeExtensionSchema.safeParse({
            external_purposes: ['ai_training'],
            peac_purpose_mapping: token,
          }).success
        ).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  it('uppercase strings are always rejected in external_purposes', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Z][A-Z0-9_-]{0,19}$/).filter((s) => s.length > 0),
        (upperToken) => {
          expect(
            PurposeExtensionSchema.safeParse({ external_purposes: [upperToken] }).success
          ).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('tokens with spaces are always rejected in external_purposes', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z][a-z0-9]* [a-z0-9]+$/), (spaceToken) => {
        expect(PurposeExtensionSchema.safeParse({ external_purposes: [spaceToken] }).success).toBe(
          false
        );
      }),
      { numRuns: 50 }
    );
  });

  it('duplicate external_purposes are always rejected', () => {
    fc.assert(
      fc.property(externalPurpose, (token) => {
        expect(
          PurposeExtensionSchema.safeParse({ external_purposes: [token, token] }).success
        ).toBe(false);
      }),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Cross-group composition
// ---------------------------------------------------------------------------

describe('Cross-group composition: attribution + purpose', () => {
  it('adding any valid extension to another preserves validity', () => {
    fc.assert(
      fc.property(validAttribution, validPurpose, (attribution, purpose) => {
        expect(AttributionExtensionSchema.safeParse(attribution).success).toBe(true);
        expect(PurposeExtensionSchema.safeParse(purpose).success).toBe(true);

        const combined = {
          'org.peacprotocol/attribution': attribution,
          'org.peacprotocol/purpose': purpose,
        };
        expect(
          AttributionExtensionSchema.safeParse(combined['org.peacprotocol/attribution']).success
        ).toBe(true);
        expect(PurposeExtensionSchema.safeParse(combined['org.peacprotocol/purpose']).success).toBe(
          true
        );
      }),
      { numRuns: 50 }
    );
  });
});
