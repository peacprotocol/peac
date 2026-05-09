/**
 * provisioning-lifecycle emitted-shape snapshot tests.
 *
 * Asserts the emitted JSON for a happy-path positive vector of EACH
 * event family contains ONLY spec-allowed keys at the extension top
 * level. Pins the artifact-shape (NOT the source) so future contributors
 * cannot silently widen the record surface beyond §5 / §6 of the
 * profile spec.
 */
import { describe, it, expect } from 'vitest';
import { ProvisioningLifecycleSchema } from '../../src/extensions/provisioning-lifecycle';

const COMMON_ALLOWED = new Set([
  'event_kind',
  'observed_at',
  'observed_by_ref',
  'upstream_event_ref',
  'upstream_artifact_digest',
  'provider',
]);

const PER_KIND_ALLOWED: Record<string, string[]> = {
  'provisioning-catalog-observed': ['catalog'],
  'provisioning-provider-link-observed': [],
  'provisioning-account-observed': ['account'],
  'provisioning-resource-observed': ['resource'],
  'provisioning-credential-observed': ['credential'],
  'provisioning-payment-authorization-observed': ['payment_authorization_observation'],
  'provisioning-budget-observed': ['budget'],
  'provisioning-subscription-observed': ['subscription'],
  'provisioning-domain-observed': ['domain'],
  'provisioning-deployment-observed': ['deployment'],
};

const VECTORS: Record<string, Record<string, unknown>> = {
  'provisioning-catalog-observed': {
    event_kind: 'provisioning-catalog-observed',
    observed_at: '2026-05-12T10:00:00Z',
    catalog: {
      service_id: 'workers',
      retrieved_at: '2026-05-12T10:00:00Z',
      terms_digest: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
  },
  'provisioning-provider-link-observed': {
    event_kind: 'provisioning-provider-link-observed',
    observed_at: '2026-05-12T10:01:00Z',
    provider: {
      provider_ref: 'urn:peac:provider:provider-x',
      account_ref: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      scheme_id: 'oauth2_authorization_code',
    },
  },
  'provisioning-account-observed': {
    event_kind: 'provisioning-account-observed',
    observed_at: '2026-05-12T10:02:00Z',
    provider: {
      provider_ref: 'urn:peac:provider:provider-x',
      account_ref: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
    account: {
      sub_event: 'created',
      account_ref: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
  },
  'provisioning-resource-observed': {
    event_kind: 'provisioning-resource-observed',
    observed_at: '2026-05-12T10:03:00Z',
    provider: {
      provider_ref: 'urn:peac:provider:provider-x',
    },
    resource: {
      kind: 'edge_compute_unit',
      resource_ref: 'urn:peac:resource:r1',
      sub_event: 'provisioned',
    },
  },
  'provisioning-credential-observed': {
    event_kind: 'provisioning-credential-observed',
    observed_at: '2026-05-12T10:04:00Z',
    provider: {
      provider_ref: 'urn:peac:provider:provider-x',
    },
    credential: {
      sub_event: 'issued',
      issuer_ref: 'urn:peac:issuer:i1',
      storage_surface: {
        kind: 'external_secret_store',
        provider_ref: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        material_redaction: 'never_capture',
      },
    },
  },
  'provisioning-payment-authorization-observed': {
    event_kind: 'provisioning-payment-authorization-observed',
    observed_at: '2026-05-12T10:05:00Z',
    payment_authorization_observation: {
      scheme_id: 'paymentauth_grant',
      authorization_ref: 'urn:peac:authz:a1',
      issuer_ref: 'urn:peac:issuer:i1',
      currency: 'USD',
      max_amount_minor: '10000',
      sub_event: 'granted',
      material_redaction: 'never_capture',
    },
  },
  'provisioning-budget-observed': {
    event_kind: 'provisioning-budget-observed',
    observed_at: '2026-05-12T10:06:00Z',
    budget: {
      budget_ref: 'urn:peac:budget:b1',
      limits_digest: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
  },
  'provisioning-subscription-observed': {
    event_kind: 'provisioning-subscription-observed',
    observed_at: '2026-05-12T10:07:00Z',
    provider: {
      provider_ref: 'urn:peac:provider:provider-x',
    },
    subscription: {
      sub_event: 'started',
      subscription_ref: 'urn:peac:subscription:s1',
    },
  },
  'provisioning-domain-observed': {
    event_kind: 'provisioning-domain-observed',
    observed_at: '2026-05-12T10:08:00Z',
    domain: {
      domain_ref: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      sub_event: 'registered',
    },
  },
  'provisioning-deployment-observed': {
    event_kind: 'provisioning-deployment-observed',
    observed_at: '2026-05-12T10:09:00Z',
    deployment: {
      deployment_ref: 'urn:peac:deployment:d1',
      sub_event: 'completed',
    },
  },
};

describe('provisioning-lifecycle: emitted-shape snapshot per event kind', () => {
  for (const [eventKind, vector] of Object.entries(VECTORS)) {
    it(`${eventKind}: parses successfully and contains only allowed top-level keys`, () => {
      const result = ProvisioningLifecycleSchema.safeParse(vector);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const allowed = new Set([...COMMON_ALLOWED, ...PER_KIND_ALLOWED[eventKind]]);
      const observed = Object.keys(result.data);
      for (const key of observed) {
        expect(allowed.has(key)).toBe(true);
      }
    });
  }
});
