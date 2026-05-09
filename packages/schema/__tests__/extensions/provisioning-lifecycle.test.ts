/**
 * provisioning-lifecycle validator tests.
 *
 * Covers the stable `provisioning.*` error codes (validator-emitted
 * codes plus the fixture-loader-only `provisioning.invalid_utf8`),
 * the recursive credential-material walker (key-name + value-side
 * rejection at any depth past the top level), and the
 * structure-cap and credential storage-surface invariants.
 *
 * Mirrors the `lifecycle-observation.test.ts` structured-error contract
 * convention: pre-flight order is forbidden-top-level-keys -> walker ->
 * event_kind -> observed_at -> per-kind required -> Zod schema parse with
 * priority-mapped stable codes.
 */
import { describe, it, expect } from 'vitest';
import {
  PROVISIONING_LIFECYCLE_ERROR_CODES,
  ProvisioningLifecycleSchema,
  validateProvisioningLifecycle,
  // Internal exports used only by the in-package test suite. The
  // canonical public API consists of the schema, the structured
  // validator, the namespace key, the type URI list, and the stable
  // error-code object.
  PROVISIONING_FORBIDDEN_TOP_LEVEL_KEYS_INTERNAL,
  scanProvisioningLifecycleForCredentialMaterialInternal,
} from '../../src/extensions/provisioning-lifecycle';

const PROVISIONING_FORBIDDEN_TOP_LEVEL_KEYS = PROVISIONING_FORBIDDEN_TOP_LEVEL_KEYS_INTERNAL;
const scanProvisioningLifecycleForCredentialMaterial =
  scanProvisioningLifecycleForCredentialMaterialInternal;

const SHA256 = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TS = '2026-05-12T10:00:00Z';

const happy = {
  event_kind: 'provisioning-resource-observed',
  observed_at: TS,
  provider: { provider_ref: 'urn:peac:provider:provider-x' },
  resource: {
    kind: 'edge_compute_unit',
    resource_ref: 'urn:peac:resource:r1',
    sub_event: 'provisioned',
  },
} as const;

describe('validateProvisioningLifecycle: happy path', () => {
  it('accepts a minimal resource-observed record', () => {
    const result = validateProvisioningLifecycle(happy);
    expect(result.ok).toBe(true);
  });
});

describe('validateProvisioningLifecycle: forbidden top-level keys', () => {
  it.each(PROVISIONING_FORBIDDEN_TOP_LEVEL_KEYS)(
    'rejects top-level credential-bearing key %s with provisioning.inline_credential_blocked',
    (key) => {
      const bad = { ...happy, [key]: 'sk_live_AAAAAAAAAAAAAAAAAAAA' };
      const result = validateProvisioningLifecycle(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const codes = result.errors.map((e) => e.code);
        expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.inlineCredentialBlocked);
      }
    }
  );
});

describe('validateProvisioningLifecycle: recursive walker', () => {
  it('rejects a nested forbidden key name with provisioning.forbidden_key_name', () => {
    const bad = {
      ...happy,
      provider: {
        provider_ref: 'urn:peac:provider:provider-x',
      },
      notes: { token: 'x' },
    };
    const result = validateProvisioningLifecycle(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.forbiddenKeyName);
    }
  });

  it('rejects a Bearer token value with provisioning.token_material_blocked', () => {
    const violations = scanProvisioningLifecycleForCredentialMaterial({
      caller_label: 'Bearer xyz123abc456',
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].code).toBe('provisioning.token_material_blocked');
  });

  it('rejects an env-assignment value with provisioning.inline_credential_blocked', () => {
    const violations = scanProvisioningLifecycleForCredentialMaterial({
      label: 'PROVIDER_SECRET=sk_live_AAAAAAAAAAAAAAAAAAAA',
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].code).toBe('provisioning.inline_credential_blocked');
  });

  it('rejects an oversized string with provisioning.field_too_large', () => {
    const big = 'a'.repeat(9000);
    const violations = scanProvisioningLifecycleForCredentialMaterial({ note: big });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].code).toBe('provisioning.field_too_large');
  });

  it('rejects a U+FFFD replacement character with provisioning.replacement_character_in_string', () => {
    const violations = scanProvisioningLifecycleForCredentialMaterial({ note: 'hello�world' });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].code).toBe('provisioning.replacement_character_in_string');
  });

  it('does not flag an opaque sha256: ref under a token-named field', () => {
    // *_ref keys are allowlisted by the walker; values are validated by
    // the schema layer (OpaqueRefSchema).
    const violations = scanProvisioningLifecycleForCredentialMaterial({
      authorization_ref: SHA256,
    });
    expect(violations.length).toBe(0);
  });
});

describe('validateProvisioningLifecycle: schema-level codes', () => {
  it('rejects unknown event_kind with provisioning.invalid_event_kind', () => {
    const bad = { ...happy, event_kind: 'provisioning-unknown' };
    const result = validateProvisioningLifecycle(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidEventKind);
    }
  });

  it('rejects missing observed_at with provisioning.missing_required_field', () => {
    const bad = {
      event_kind: 'provisioning-resource-observed',
      provider: { provider_ref: 'urn:peac:provider:provider-x' },
      resource: {
        kind: 'edge_compute_unit',
        resource_ref: 'urn:peac:resource:r1',
        sub_event: 'provisioned',
      },
    };
    const result = validateProvisioningLifecycle(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.missingRequiredField);
    }
  });

  it('rejects whitespace in scheme_id with provisioning.invalid_scheme_id', () => {
    const bad = {
      event_kind: 'provisioning-payment-authorization-observed',
      observed_at: TS,
      payment_authorization_observation: {
        scheme_id: 'paymentauth grant',
        authorization_ref: 'urn:peac:authz:a1',
        issuer_ref: 'urn:peac:issuer:i1',
        material_redaction: 'never_capture',
      },
    };
    const result = validateProvisioningLifecycle(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidSchemeId);
    }
  });

  it('rejects mutually exclusive scheme_id + scheme_ref with provisioning.invalid_scheme_id', () => {
    const bad = {
      event_kind: 'provisioning-payment-authorization-observed',
      observed_at: TS,
      payment_authorization_observation: {
        scheme_id: 'paymentauth_grant',
        scheme_ref: 'urn:peac:scheme:custom-1',
        authorization_ref: 'urn:peac:authz:a1',
        issuer_ref: 'urn:peac:issuer:i1',
        material_redaction: 'never_capture',
      },
    };
    const result = validateProvisioningLifecycle(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidSchemeId);
    }
  });

  it('rejects unknown storage_surface.kind with provisioning.invalid_storage_surface', () => {
    const bad = {
      event_kind: 'provisioning-credential-observed',
      observed_at: TS,
      provider: { provider_ref: 'urn:peac:provider:provider-x' },
      credential: {
        sub_event: 'issued',
        storage_surface: {
          kind: 'made_up_vault_kind',
          material_redaction: 'never_capture',
        },
      },
    };
    const result = validateProvisioningLifecycle(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidStorageSurface);
    }
  });

  it('rejects unknown material_redaction with provisioning.invalid_material_redaction', () => {
    const bad = {
      event_kind: 'provisioning-credential-observed',
      observed_at: TS,
      provider: { provider_ref: 'urn:peac:provider:provider-x' },
      credential: {
        sub_event: 'issued',
        storage_surface: {
          kind: 'external_secret_store',
          material_redaction: 'capture_in_plaintext',
        },
      },
    };
    const result = validateProvisioningLifecycle(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidMaterialRedaction);
    }
  });

  it('rejects malformed observed_at with provisioning.invalid_observed_at', () => {
    const bad = { ...happy, observed_at: 'not-a-timestamp' };
    const result = validateProvisioningLifecycle(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidObservedAt);
    }
  });

  it('rejects malformed expires_at with provisioning.invalid_expires_at', () => {
    const bad = {
      event_kind: 'provisioning-payment-authorization-observed',
      observed_at: TS,
      payment_authorization_observation: {
        scheme_id: 'paymentauth_grant',
        authorization_ref: 'urn:peac:authz:a1',
        issuer_ref: 'urn:peac:issuer:i1',
        expires_at: 'tomorrow',
        material_redaction: 'never_capture',
      },
    };
    const result = validateProvisioningLifecycle(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidExpiresAt);
    }
  });

  it('rejects malformed currency with provisioning.invalid_currency', () => {
    const bad = {
      event_kind: 'provisioning-payment-authorization-observed',
      observed_at: TS,
      payment_authorization_observation: {
        scheme_id: 'paymentauth_grant',
        authorization_ref: 'urn:peac:authz:a1',
        issuer_ref: 'urn:peac:issuer:i1',
        currency: 'usd',
        material_redaction: 'never_capture',
      },
    };
    const result = validateProvisioningLifecycle(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidCurrency);
    }
  });

  it('rejects malformed catalog.retrieved_at with provisioning.invalid_retrieved_at', () => {
    const bad = {
      event_kind: 'provisioning-catalog-observed',
      observed_at: TS,
      catalog: {
        service_id: 'catalog-entry',
        retrieved_at: 'not-a-date',
      },
    };
    const result = validateProvisioningLifecycle(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidRetrievedAt);
    }
  });
});

describe('validateProvisioningLifecycle: max_amount_minor grammar', () => {
  function paymentAuthWithAmount(value: unknown) {
    return {
      event_kind: 'provisioning-payment-authorization-observed',
      observed_at: TS,
      payment_authorization_observation: {
        scheme_id: 'paymentauth_grant',
        authorization_ref: 'urn:peac:authz:a1',
        issuer_ref: 'urn:peac:issuer:i1',
        max_amount_minor: value,
        material_redaction: 'never_capture',
      },
    } as Record<string, unknown>;
  }

  it('accepts "0"', () => {
    const result = validateProvisioningLifecycle(paymentAuthWithAmount('0'));
    expect(result.ok).toBe(true);
  });

  it('accepts a single non-zero leading digit followed by digits ("100")', () => {
    const result = validateProvisioningLifecycle(paymentAuthWithAmount('100'));
    expect(result.ok).toBe(true);
  });

  it('rejects a leading-zero string ("0001") with provisioning.invalid_amount_minor', () => {
    // Canonical form requires `0` or `[1-9][0-9]*`; leading zeros are
    // rejected to prevent cross-language normalization ambiguity at
    // this ceiling field.
    const result = validateProvisioningLifecycle(paymentAuthWithAmount('0001'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidAmountMinor);
    }
  });

  it('rejects a negative string ("-100") with provisioning.invalid_amount_minor', () => {
    const result = validateProvisioningLifecycle(paymentAuthWithAmount('-100'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidAmountMinor);
    }
  });

  it('rejects a decimal string ("1.00") with provisioning.invalid_amount_minor', () => {
    const result = validateProvisioningLifecycle(paymentAuthWithAmount('1.00'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidAmountMinor);
    }
  });

  it('rejects an exponent string ("1e6") with provisioning.invalid_amount_minor', () => {
    const result = validateProvisioningLifecycle(paymentAuthWithAmount('1e6'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidAmountMinor);
    }
  });

  it('rejects an empty string with provisioning.invalid_amount_minor', () => {
    const result = validateProvisioningLifecycle(paymentAuthWithAmount(''));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidAmountMinor);
    }
  });
});

describe('validateProvisioningLifecycle: unrecognized_field semantics', () => {
  it('rejects a benign unknown top-level field with provisioning.unrecognized_field (NOT inline_credential_blocked)', () => {
    const bad = { ...happy, notes: 'non-secret note' };
    const result = validateProvisioningLifecycle(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.unrecognizedField);
      expect(codes).not.toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.inlineCredentialBlocked);
    }
  });

  it('rejects a benign nested unknown field with provisioning.unrecognized_field (NOT inline_credential_blocked)', () => {
    const bad = {
      event_kind: 'provisioning-resource-observed',
      observed_at: TS,
      provider: { provider_ref: 'urn:peac:provider:provider-x' },
      resource: {
        kind: 'edge_compute_unit',
        resource_ref: 'urn:peac:resource:r1',
        sub_event: 'provisioned',
        extra: 'benign',
      },
    };
    const result = validateProvisioningLifecycle(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.unrecognizedField);
      expect(codes).not.toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.inlineCredentialBlocked);
    }
  });
});

describe('validateProvisioningLifecycle: invalid_sub_event semantics', () => {
  it('rejects an invalid resource.sub_event with provisioning.invalid_sub_event (NOT invalid_event_kind)', () => {
    const bad = {
      event_kind: 'provisioning-resource-observed',
      observed_at: TS,
      provider: { provider_ref: 'urn:peac:provider:provider-x' },
      resource: {
        kind: 'edge_compute_unit',
        resource_ref: 'urn:peac:resource:r1',
        sub_event: 'made_up',
      },
    };
    const result = validateProvisioningLifecycle(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidSubEvent);
      expect(codes).not.toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidEventKind);
    }
  });

  it('rejects an invalid credential.sub_event with provisioning.invalid_sub_event', () => {
    const bad = {
      event_kind: 'provisioning-credential-observed',
      observed_at: TS,
      provider: { provider_ref: 'urn:peac:provider:provider-x' },
      credential: {
        sub_event: 'made_up',
        storage_surface: {
          kind: 'unknown',
          material_redaction: 'never_capture',
        },
      },
    };
    const result = validateProvisioningLifecycle(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidSubEvent);
      expect(codes).not.toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidEventKind);
    }
  });

  it('rejects an invalid payment_authorization_observation.sub_event with provisioning.invalid_sub_event', () => {
    const bad = {
      event_kind: 'provisioning-payment-authorization-observed',
      observed_at: TS,
      payment_authorization_observation: {
        scheme_id: 'paymentauth_grant',
        authorization_ref: 'urn:peac:authz:a1',
        issuer_ref: 'urn:peac:issuer:i1',
        sub_event: 'made_up',
        material_redaction: 'never_capture',
      },
    };
    const result = validateProvisioningLifecycle(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidSubEvent);
      expect(codes).not.toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidEventKind);
    }
  });
});

describe('validateProvisioningLifecycle: credential storage_surface invariant', () => {
  function credentialObserved(subEvent: string, omitStorageSurface: boolean) {
    const credential: Record<string, unknown> = {
      sub_event: subEvent,
      issuer_ref: 'urn:peac:issuer:i1',
    };
    if (!omitStorageSurface) {
      credential.storage_surface = {
        kind: 'unknown',
        material_redaction: 'never_capture',
      };
    }
    return {
      event_kind: 'provisioning-credential-observed',
      observed_at: TS,
      provider: { provider_ref: 'urn:peac:provider:provider-x' },
      credential,
    };
  }

  it.each(['issued', 'rotated', 'synced'])(
    'rejects credential.sub_event %s without storage_surface (provisioning.invalid_storage_surface)',
    (subEvent) => {
      const result = validateProvisioningLifecycle(credentialObserved(subEvent, true));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const codes = result.errors.map((e) => e.code);
        expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.invalidStorageSurface);
      }
    }
  );

  it('accepts credential.sub_event revoked without storage_surface', () => {
    const result = validateProvisioningLifecycle(credentialObserved('revoked', true));
    expect(result.ok).toBe(true);
  });

  it.each(['issued', 'rotated', 'synced', 'revoked'])(
    'accepts credential.sub_event %s with kind:unknown + never_capture storage_surface',
    (subEvent) => {
      const result = validateProvisioningLifecycle(credentialObserved(subEvent, false));
      expect(result.ok).toBe(true);
    }
  );
});

describe('ProvisioningLifecycleSchema.safeParse: enforces no-credential-leak invariant', () => {
  it('rejects token-material in allowed string fields via safeParse', () => {
    const bad = {
      event_kind: 'provisioning-resource-observed',
      observed_at: TS,
      provider: { provider_ref: 'urn:peac:provider:provider-x' },
      resource: {
        kind: 'Bearer abc123',
        resource_ref: 'urn:peac:resource:r1',
        sub_event: 'provisioned',
      },
    };
    expect(ProvisioningLifecycleSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a clean record via safeParse', () => {
    expect(ProvisioningLifecycleSchema.safeParse(happy).success).toBe(true);
  });

  it('rejects an extra top-level object containing a nested forbidden key via safeParse', () => {
    // Rejected by the canonical public schema. Intentionally does not
    // assert which path emits the rejection: each variant is `.strict()`
    // (so an unknown top-level key like `notes` is itself a rejection
    // path) AND the `.superRefine(walker)` would flag the nested
    // `token` key. The direct walker test below proves the
    // `provisioning.forbidden_key_name` semantics in isolation.
    const bad = {
      event_kind: 'provisioning-credential-observed',
      observed_at: TS,
      provider: { provider_ref: 'urn:peac:provider:provider-x' },
      credential: {
        sub_event: 'issued',
        storage_surface: {
          kind: 'external_secret_store',
          material_redaction: 'never_capture',
        },
      },
    } as Record<string, unknown>;
    bad.notes = { token: 'x' };
    expect(ProvisioningLifecycleSchema.safeParse(bad).success).toBe(false);
  });
});

describe('walker: structure caps + nested forbidden keys + duplicate-code prevention', () => {
  it('rejects deeply nested input with provisioning.structure_too_deep', () => {
    let nested: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 50; i++) {
      nested = { wrap: nested };
    }
    const violations = scanProvisioningLifecycleForCredentialMaterial(nested, { maxDepth: 8 });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].code).toBe('provisioning.structure_too_deep');
  });

  it('rejects oversized inputs with provisioning.structure_too_large', () => {
    const huge: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++) {
      huge[`k${i}`] = i;
    }
    const violations = scanProvisioningLifecycleForCredentialMaterial(huge, { maxNodes: 50 });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].code).toBe('provisioning.structure_too_large');
  });

  it('top-level forbidden key emits inline_credential_blocked, NOT forbidden_key_name', () => {
    // The validator preflight emits inline_credential_blocked for top-level
    // forbidden keys; the walker skips the same key at depth 0 to avoid
    // emitting both codes for the same offending key.
    const bad = { ...happy, token: 'x' };
    const result = validateProvisioningLifecycle(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(PROVISIONING_LIFECYCLE_ERROR_CODES.inlineCredentialBlocked);
      // The walker MUST NOT emit forbidden_key_name for the same top-level key.
      const forbiddenKeyNameCount = codes.filter(
        (c) => c === PROVISIONING_LIFECYCLE_ERROR_CODES.forbiddenKeyName
      ).length;
      expect(forbiddenKeyNameCount).toBe(0);
    }
  });

  it('nested forbidden key emits provisioning.forbidden_key_name (not inline_credential_blocked)', () => {
    // Direct walker call to isolate from schema-strict rejection paths.
    const violations = scanProvisioningLifecycleForCredentialMaterial({
      label: 'ok',
      nested: { token: 'x' },
    });
    const codes = violations.map((v) => v.code);
    expect(codes).toContain('provisioning.forbidden_key_name');
  });
});
