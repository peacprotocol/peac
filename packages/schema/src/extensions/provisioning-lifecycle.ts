/**
 * Provisioning Lifecycle Extension Schema
 *
 * Extension namespace: `org.peacprotocol/provisioning-lifecycle`
 * Record type URIs:    10 (one per `*-observed` event family)
 *
 * Records reported provisioning lifecycle events from external systems.
 * Caller systems (agents, agent-driven workflows, control planes, CLIs,
 * or providers themselves) report what happened when services, accounts,
 * resources, credentials, payment authorizations, budgets, subscriptions,
 * domains, or deployments were provisioned through external providers;
 * the issuance path issues a record using the caller-provided issuer key.
 * PEAC provides the record format, validation, and signing path. PEAC
 * does not authorize the action, verify legal acceptance, provision
 * resources, validate credentials, process payments, vouch for provider
 * state, settle transactions, manage credential vaults, or operate the
 * runtime. PEAC does not implement OAuth, DPoP, OAuth Protected Resource
 * Metadata, or Shared Payment Tokens.
 *
 * No-credential-leak invariant (grammar-based + recursive walker; enforced
 * by both the exported `ProvisioningLifecycleSchema` and the structured
 * `validateProvisioningLifecycle` validator):
 *   - 20 forbidden top-level credential-bearing keys reject with
 *     `provisioning.inline_credential_blocked`.
 *   - The recursive walker inspects key names AND value strings at every
 *     depth past the top level. Nested forbidden key names reject with
 *     `provisioning.forbidden_key_name`; values matching generic
 *     credential-shaped regex patterns reject with
 *     `provisioning.token_material_blocked` (or
 *     `provisioning.inline_credential_blocked` for the env_assignment
 *     pattern).
 *   - All `*_ref` fields are validated by the `OpaqueRefSchema` grammar.
 *   - All `*_digest` fields are validated by the `Sha256DigestSchema` grammar.
 *
 * Vendor neutrality: the normative validator's regex panel contains only
 * generic credential categories (jwt_compact, bearer_token,
 * pem_private_key, env_assignment, connection_string_with_credentials).
 * Provider-prefix scanning belongs to the public-artifact layer
 * (`scripts/check-public-artifacts.mjs`), not the protocol schema.
 *
 * Validation returns the structured error contract:
 *   `{ ok: true, value }` or `{ ok: false, errors: [{ code, path?, message }] }`.
 */
import { z } from 'zod';
import { Sha256DigestSchema } from '../wire-02-extensions/shared-validators.js';
import { createOpaqueRefSchema } from '../opaque-ref.js';
import { AmountMinorStringSchema } from '../wire-02-extensions/commerce.js';

export const PROVISIONING_LIFECYCLE_EXTENSION_KEY =
  'org.peacprotocol/provisioning-lifecycle' as const;

/** All 10 provisioning lifecycle record type URIs (one per event family). */
export const PROVISIONING_LIFECYCLE_TYPE_URIS = [
  'org.peacprotocol/provisioning-catalog-observed',
  'org.peacprotocol/provisioning-provider-link-observed',
  'org.peacprotocol/provisioning-account-observed',
  'org.peacprotocol/provisioning-resource-observed',
  'org.peacprotocol/provisioning-credential-observed',
  'org.peacprotocol/provisioning-payment-authorization-observed',
  'org.peacprotocol/provisioning-budget-observed',
  'org.peacprotocol/provisioning-subscription-observed',
  'org.peacprotocol/provisioning-domain-observed',
  'org.peacprotocol/provisioning-deployment-observed',
] as const;

export type ProvisioningLifecycleTypeUri = (typeof PROVISIONING_LIFECYCLE_TYPE_URIS)[number];

/** Event-kind discriminator literals (drop the `org.peacprotocol/` prefix). */
const EVENT_KINDS = [
  'provisioning-catalog-observed',
  'provisioning-provider-link-observed',
  'provisioning-account-observed',
  'provisioning-resource-observed',
  'provisioning-credential-observed',
  'provisioning-payment-authorization-observed',
  'provisioning-budget-observed',
  'provisioning-subscription-observed',
  'provisioning-domain-observed',
  'provisioning-deployment-observed',
] as const;

export type ProvisioningEventKind = (typeof EVENT_KINDS)[number];

/** Stable error codes for `validateProvisioningLifecycle`. */
export const PROVISIONING_LIFECYCLE_ERROR_CODES = {
  inlineCredentialBlocked: 'provisioning.inline_credential_blocked',
  opaqueRefGrammarViolation: 'provisioning.opaque_ref_grammar_violation',
  tokenMaterialBlocked: 'provisioning.token_material_blocked',
  forbiddenKeyName: 'provisioning.forbidden_key_name',
  invalidStorageSurface: 'provisioning.invalid_storage_surface',
  invalidMaterialRedaction: 'provisioning.invalid_material_redaction',
  invalidEventKind: 'provisioning.invalid_event_kind',
  invalidSubEvent: 'provisioning.invalid_sub_event',
  invalidSchemeId: 'provisioning.invalid_scheme_id',
  unrecognizedField: 'provisioning.unrecognized_field',
  invalidAmountMinor: 'provisioning.invalid_amount_minor',
  invalidObservedAt: 'provisioning.invalid_observed_at',
  invalidRetrievedAt: 'provisioning.invalid_retrieved_at',
  invalidExpiresAt: 'provisioning.invalid_expires_at',
  invalidCurrency: 'provisioning.invalid_currency',
  fieldTooLarge: 'provisioning.field_too_large',
  replacementCharacterInString: 'provisioning.replacement_character_in_string',
  structureTooDeep: 'provisioning.structure_too_deep',
  structureTooLarge: 'provisioning.structure_too_large',
  missingRequiredField: 'provisioning.missing_required_field',
  // Reserved for fixture-loader pre-parse use only; never emitted by the
  // in-memory validator.
  invalidUtf8: 'provisioning.invalid_utf8',
} as const;

/**
 * Forbidden top-level credential-bearing key names. Each key here represents
 * a class of inline-credential smuggling that the no-credential-leak invariant
 * must reject at the extension top level. The recursive walker (see below)
 * extends this rejection to nested keys past the top level.
 */
const FORBIDDEN_TOP_LEVEL_KEYS_INTERNAL = [
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'api_key',
  'apikey',
  'secret',
  'private_key',
  'privatekey',
  'password',
  'passphrase',
  'authorization',
  'cookie',
  'session',
  'credential_value',
  'credentialvalue',
  'spt',
  'shared_payment_token',
  'sharedpaymenttoken',
  'env',
] as const;

/** Singleton TextEncoder; reused across walker invocations. */
const TEXT_ENCODER = new TextEncoder();

/** UTF-8 byte length helper (counts bytes, not JS UTF-16 code units). */
const utf8ByteLength = (value: string): number => TEXT_ENCODER.encode(value).byteLength;

/** Bounded UTF-8 string schema factory (byte-based limit). */
const boundedUtf8String = (field: string, maxBytes: number) =>
  z
    .string({
      error: () =>
        `provisioning.field_too_large: ${field} must be a string of <= ${maxBytes} UTF-8 bytes`,
    })
    .min(1, { message: `provisioning.field_too_large: ${field} must not be empty` })
    .refine((s) => utf8ByteLength(s) <= maxBytes, {
      message: `provisioning.field_too_large: ${field} must be <= ${maxBytes} UTF-8 bytes`,
    });

/**
 * Generic opaque-reference schema for every `*_ref` field. Inherits
 * `OpaqueRefSchema`'s grammar (no whitespace, no `@`, recognized prefix,
 * byte-bounded). The stable code is attached so downstream validators
 * bubble the same string.
 */
const ProvisioningRef = createOpaqueRefSchema({
  errorCode: 'provisioning.opaque_ref_grammar_violation',
  maxBytes: 256,
});

/**
 * Bounded `scheme_id` grammar. Max 128 UTF-8 bytes; lowercase preferred;
 * allowed characters `[a-z0-9._:/-]` plus `+` for URI scheme-prefix forms;
 * no whitespace; no `@`; no JSON-opening characters; no Bearer prefixes;
 * no JWT-like patterns.
 */
const SCHEME_ID_MAX_BYTES = 128;
const SCHEME_ID_GRAMMAR = /^[a-z0-9._:/+-]+$/;

const SchemeIdSchema = z
  .string({
    error: () =>
      'provisioning.invalid_scheme_id: scheme_id must be a string of bounded ASCII tokens',
  })
  .refine((s) => s.length > 0, {
    message: 'provisioning.invalid_scheme_id: scheme_id must not be empty',
  })
  .refine((s) => utf8ByteLength(s) <= SCHEME_ID_MAX_BYTES, {
    message: `provisioning.invalid_scheme_id: scheme_id must be <= ${SCHEME_ID_MAX_BYTES} UTF-8 bytes`,
  })
  .refine((s) => SCHEME_ID_GRAMMAR.test(s), {
    message:
      'provisioning.invalid_scheme_id: scheme_id must match grammar [a-z0-9._:/+-]+ (no whitespace, no @, no JSON-opening character)',
  });

/**
 * Canonical non-negative bounded decimal-integer string for
 * `max_amount_minor`. Reuses `AmountMinorStringSchema` for byte-cap
 * + base-10 grammar enforcement and refines further to a single
 * canonical representation: either `0` or a non-zero leading digit
 * followed by zero or more digits. Leading-zero forms (`0001`),
 * decimals (`1.00`), exponent notation (`1e6`), signs (`-100`),
 * and empty strings all reject with `provisioning.invalid_amount_minor`.
 * The single canonical form prevents cross-language normalization
 * ambiguity at this ceiling field.
 */
const CANONICAL_AMOUNT_MINOR_PATTERN = /^[1-9][0-9]*$/;

const NonNegativeAmountMinorStringSchema = AmountMinorStringSchema.refine(
  (value) => value === '0' || CANONICAL_AMOUNT_MINOR_PATTERN.test(value),
  {
    message:
      'provisioning.invalid_amount_minor: max_amount_minor must be a canonical non-negative decimal-integer string (0 or [1-9][0-9]*)',
  }
);

/** Closed enum: `material_redaction`. */
const MaterialRedactionSchema = z.enum(['never_capture', 'redacted_capture', 'hashed_capture'], {
  error: () =>
    'provisioning.invalid_material_redaction: material_redaction must be one of never_capture, redacted_capture, hashed_capture',
});

/** Closed enum: abstract `storage_surface.kind` (no vendor names). */
const StorageSurfaceKindSchema = z.enum(
  [
    'external_secret_store',
    'local_encrypted_file',
    'local_plaintext_file',
    'environment_file',
    'runtime_secret_binding',
    'none',
    'unknown',
  ],
  {
    error: () =>
      'provisioning.invalid_storage_surface: storage_surface.kind must be one of external_secret_store, local_encrypted_file, local_plaintext_file, environment_file, runtime_secret_binding, none, unknown',
  }
);

const StorageSurfaceSchema = z
  .object({
    kind: StorageSurfaceKindSchema,
    provider_ref: ProvisioningRef.optional(),
    surface_ref: ProvisioningRef.optional(),
    material_redaction: MaterialRedactionSchema,
  })
  .strict();

/**
 * Provider identity. `provider_ref` is required (opaque reference, no
 * raw vendor identity strings). `account_ref` and either `scheme_id`
 * (bounded grammar) or `scheme_ref` (opaque) are optional.
 */
const ProviderSchema = z
  .object({
    provider_ref: ProvisioningRef,
    account_ref: ProvisioningRef.optional(),
    scheme_id: SchemeIdSchema.optional(),
    scheme_ref: ProvisioningRef.optional(),
  })
  .strict()
  .refine((p) => !(p.scheme_id !== undefined && p.scheme_ref !== undefined), {
    message:
      'provisioning.invalid_scheme_id: provider.scheme_id and provider.scheme_ref are mutually exclusive',
  });

/** Catalog discovery scope. */
const CatalogSchema = z
  .object({
    service_id: boundedUtf8String('catalog.service_id', 256),
    entry_digest: Sha256DigestSchema.optional(),
    retrieved_at: z
      .string({
        error: () =>
          'provisioning.invalid_retrieved_at: retrieved_at must be an RFC 3339 timestamp with offset',
      })
      .datetime({
        offset: true,
        message:
          'provisioning.invalid_retrieved_at: retrieved_at must be an RFC 3339 timestamp with offset',
      }),
    terms_digest: Sha256DigestSchema.optional(),
    pricing_digest: Sha256DigestSchema.optional(),
  })
  .strict();

/** Account scope. */
const AccountSchema = z
  .object({
    sub_event: z.enum(['created', 'linked', 'authorized', 'updated']),
    account_ref: ProvisioningRef,
    terms_digest: Sha256DigestSchema.optional(),
  })
  .strict();

/** Resource scope. */
const ResourceSchema = z
  .object({
    kind: boundedUtf8String('resource.kind', 128),
    resource_ref: ProvisioningRef,
    sub_event: z.enum(['requested', 'provisioned', 'updated', 'removed']),
  })
  .strict();

/**
 * Credential scope.
 *
 * `storage_surface` is REQUIRED for sub_event values that handle
 * credential material directly (`issued`, `rotated`, `synced`) and
 * OPTIONAL for `revoked` (a revocation observation does not
 * necessarily handle the underlying material). For sub_events that
 * cannot capture material safely, callers may set
 * `storage_surface = { kind: 'unknown', material_redaction: 'never_capture' }`.
 */
const CredentialSchema = z
  .object({
    sub_event: z.enum(['issued', 'rotated', 'revoked', 'synced']),
    issuer_ref: ProvisioningRef.optional(),
    subject_ref: ProvisioningRef.optional(),
    scope_digest: Sha256DigestSchema.optional(),
    storage_surface: StorageSurfaceSchema.optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.sub_event !== 'revoked' && c.storage_surface === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['storage_surface'],
        message: `provisioning.invalid_storage_surface: storage_surface is required for credential.sub_event '${c.sub_event}'`,
      });
    }
  });

/** Subscription scope. */
const SubscriptionSchema = z
  .object({
    sub_event: z.enum(['started', 'updated', 'cancelled']),
    subscription_ref: ProvisioningRef,
    plan_digest: Sha256DigestSchema.optional(),
  })
  .strict();

/** Budget scope. */
const BudgetSchema = z
  .object({
    budget_ref: ProvisioningRef,
    limits_digest: Sha256DigestSchema.optional(),
  })
  .strict();

/** Domain scope. */
const DomainSchema = z
  .object({
    domain_ref: ProvisioningRef,
    sub_event: z.enum(['registered', 'transferred', 'released']),
    registrar_ref: ProvisioningRef.optional(),
  })
  .strict();

/** Deployment scope. */
const DeploymentSchema = z
  .object({
    deployment_ref: ProvisioningRef,
    artifact_digest: Sha256DigestSchema.optional(),
    sub_event: z.enum(['started', 'completed', 'failed', 'rolled_back']),
  })
  .strict();

/** Payment authorization observation. */
const PaymentAuthorizationObservationSchema = z
  .object({
    scheme_id: SchemeIdSchema.optional(),
    scheme_ref: ProvisioningRef.optional(),
    authorization_ref: ProvisioningRef,
    issuer_ref: ProvisioningRef,
    scope_digest: Sha256DigestSchema.optional(),
    limits_digest: Sha256DigestSchema.optional(),
    currency: z
      .string({
        error: () =>
          'provisioning.invalid_currency: currency must be an ISO-4217 3-letter uppercase code',
      })
      .regex(/^[A-Z]{3}$/, {
        message:
          'provisioning.invalid_currency: currency must be an ISO-4217 3-letter uppercase code',
      })
      .optional(),
    max_amount_minor: NonNegativeAmountMinorStringSchema.optional(),
    expires_at: z
      .string({
        error: () =>
          'provisioning.invalid_expires_at: expires_at must be an RFC 3339 timestamp with offset',
      })
      .datetime({
        offset: true,
        message:
          'provisioning.invalid_expires_at: expires_at must be an RFC 3339 timestamp with offset',
      })
      .optional(),
    sub_event: z.enum(['observed', 'granted', 'revoked', 'expired', 'consumed']).optional(),
    material_redaction: MaterialRedactionSchema,
  })
  .strict()
  .refine((p) => !(p.scheme_id !== undefined && p.scheme_ref !== undefined), {
    message:
      'provisioning.invalid_scheme_id: payment_authorization_observation.scheme_id and scheme_ref are mutually exclusive',
  });

/** Common required fields. */
const commonRequiredFields = {
  observed_at: z
    .string({
      error: () =>
        'provisioning.invalid_observed_at: observed_at must be an RFC 3339 timestamp with offset',
    })
    .datetime({
      offset: true,
      message:
        'provisioning.invalid_observed_at: observed_at must be an RFC 3339 timestamp with offset',
    }),
} as const;

/** Common optional metadata. */
const commonOptionalFields = {
  observed_by_ref: ProvisioningRef.optional(),
  upstream_event_ref: ProvisioningRef.optional(),
  upstream_artifact_digest: Sha256DigestSchema.optional(),
} as const;

/** Per-event-kind variants. */
const CatalogObserved = z
  .object({
    event_kind: z.literal('provisioning-catalog-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    catalog: CatalogSchema,
    provider: ProviderSchema.optional(),
  })
  .strict();

const ProviderLinkObserved = z
  .object({
    event_kind: z.literal('provisioning-provider-link-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    provider: ProviderSchema,
  })
  .strict();

const AccountObserved = z
  .object({
    event_kind: z.literal('provisioning-account-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    provider: ProviderSchema,
    account: AccountSchema,
  })
  .strict();

const ResourceObserved = z
  .object({
    event_kind: z.literal('provisioning-resource-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    provider: ProviderSchema,
    resource: ResourceSchema,
  })
  .strict();

const CredentialObserved = z
  .object({
    event_kind: z.literal('provisioning-credential-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    provider: ProviderSchema,
    credential: CredentialSchema,
  })
  .strict();

const PaymentAuthorizationObserved = z
  .object({
    event_kind: z.literal('provisioning-payment-authorization-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    provider: ProviderSchema.optional(),
    payment_authorization_observation: PaymentAuthorizationObservationSchema,
  })
  .strict();

const BudgetObserved = z
  .object({
    event_kind: z.literal('provisioning-budget-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    provider: ProviderSchema.optional(),
    budget: BudgetSchema,
  })
  .strict();

const SubscriptionObserved = z
  .object({
    event_kind: z.literal('provisioning-subscription-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    provider: ProviderSchema,
    subscription: SubscriptionSchema,
  })
  .strict();

const DomainObserved = z
  .object({
    event_kind: z.literal('provisioning-domain-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    provider: ProviderSchema.optional(),
    domain: DomainSchema,
  })
  .strict();

const DeploymentObserved = z
  .object({
    event_kind: z.literal('provisioning-deployment-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    provider: ProviderSchema.optional(),
    deployment: DeploymentSchema,
  })
  .strict();

/**
 * Base discriminated union over `event_kind`. Internal; the public
 * `ProvisioningLifecycleSchema` below wraps this in a `.superRefine()`
 * that runs the recursive credential-material walker so
 * `safeParse()` enforces the no-credential-leak invariant alongside
 * structural validation.
 */
const ProvisioningLifecycleBaseSchema = z.discriminatedUnion('event_kind', [
  CatalogObserved,
  ProviderLinkObserved,
  AccountObserved,
  ResourceObserved,
  CredentialObserved,
  PaymentAuthorizationObserved,
  BudgetObserved,
  SubscriptionObserved,
  DomainObserved,
  DeploymentObserved,
]);

// ---------------------------------------------------------------------------
// Recursive credential-material walker (depth-aware; structure-bounded)
// ---------------------------------------------------------------------------

const STRING_VALUE_MAX_BYTES_DEFAULT = 8192;
const MAX_DEPTH_DEFAULT = 32;
const MAX_NODES_DEFAULT = 10_000;
const REPLACEMENT_CHAR = '�';

/**
 * Generic credential-material value patterns. No vendor-specific prefixes.
 * Provider-prefix scanning belongs in `scripts/check-public-artifacts.mjs`,
 * not the protocol schema.
 */
const TOKEN_VALUE_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = Object.freeze([
  { name: 'jwt_compact', pattern: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/ },
  { name: 'bearer_token', pattern: /^\s*Bearer\s+\S+/i },
  { name: 'pem_private_key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'env_assignment', pattern: /^[A-Z_][A-Z0-9_]*=[^=\s]+$/m },
  {
    name: 'connection_string_with_credentials',
    pattern: /\b[a-z]+:\/\/[^\s:@]+:[^\s@]+@[^\s/]+/,
  },
]);

/** *_ref / *_digest suffixes: opaque-reference fields that the schema
 * layer validates separately. The walker skips key-name rejection for
 * these even when the suffix appears alongside a forbidden name like
 * `token_ref` (legitimate opaque ref to a token-shaped artifact). */
const KEY_NAME_REF_ALLOWLIST: ReadonlyArray<RegExp> = Object.freeze([
  /^[a-z][a-z0-9_]*_ref$/,
  /^[a-z][a-z0-9_]*_digest$/,
]);

const FORBIDDEN_KEY_NAMES_LOWER: ReadonlySet<string> = new Set(
  FORBIDDEN_TOP_LEVEL_KEYS_INTERNAL.map((k) => k.toLowerCase())
);

function isAllowlistedRefKey(keyLower: string): boolean {
  for (const re of KEY_NAME_REF_ALLOWLIST) {
    if (re.test(keyLower)) return true;
  }
  return false;
}

interface WalkerOptions {
  maxStringBytes?: number;
  maxDepth?: number;
  maxNodes?: number;
}

interface WalkerViolation {
  code:
    | 'provisioning.token_material_blocked'
    | 'provisioning.inline_credential_blocked'
    | 'provisioning.forbidden_key_name'
    | 'provisioning.field_too_large'
    | 'provisioning.replacement_character_in_string'
    | 'provisioning.structure_too_deep'
    | 'provisioning.structure_too_large';
  pathSegments: ReadonlyArray<string | number>;
  message: string;
  pattern?: string;
}

/**
 * Recursive walker (deterministic key-sorted traversal; structure- and
 * size-bounded; depth-aware key-name dispatch).
 *
 * Top-level forbidden credential-bearing keys are NOT emitted by the
 * walker; they are surfaced by the preflight in
 * `validateProvisioningLifecycle`. This avoids duplicate codes for the
 * same offending top-level key.
 */
function scanProvisioningLifecycleForCredentialMaterial(
  obj: unknown,
  options: WalkerOptions = {}
): WalkerViolation[] {
  const stringByteLimit = options.maxStringBytes ?? STRING_VALUE_MAX_BYTES_DEFAULT;
  const maxDepth = options.maxDepth ?? MAX_DEPTH_DEFAULT;
  const maxNodes = options.maxNodes ?? MAX_NODES_DEFAULT;
  const violations: WalkerViolation[] = [];
  const counter = { nodes: 0, halted: false };
  walk(obj, [], 0, stringByteLimit, maxDepth, maxNodes, counter, violations);
  return violations;
}

function walk(
  node: unknown,
  pathSegments: ReadonlyArray<string | number>,
  depth: number,
  stringByteLimit: number,
  maxDepth: number,
  maxNodes: number,
  counter: { nodes: number; halted: boolean },
  out: WalkerViolation[]
): void {
  if (counter.halted) return;
  counter.nodes += 1;
  if (counter.nodes > maxNodes) {
    counter.halted = true;
    out.push({
      code: 'provisioning.structure_too_large',
      pathSegments,
      message: `provisioning.structure_too_large: input exceeds ${maxNodes} nodes`,
    });
    return;
  }
  if (depth > maxDepth) {
    counter.halted = true;
    out.push({
      code: 'provisioning.structure_too_deep',
      pathSegments,
      message: `provisioning.structure_too_deep: input exceeds ${maxDepth} levels of nesting`,
    });
    return;
  }
  if (node === null || node === undefined) return;
  if (typeof node === 'string') {
    if (utf8ByteLength(node) > stringByteLimit) {
      out.push({
        code: 'provisioning.field_too_large',
        pathSegments,
        message: `provisioning.field_too_large: string exceeds ${stringByteLimit} UTF-8 bytes`,
      });
      return;
    }
    if (node.includes(REPLACEMENT_CHAR)) {
      out.push({
        code: 'provisioning.replacement_character_in_string',
        pathSegments,
        message:
          'provisioning.replacement_character_in_string: string contains U+FFFD replacement character',
      });
      return;
    }
    for (const { name, pattern } of TOKEN_VALUE_PATTERNS) {
      if (pattern.test(node)) {
        const code: WalkerViolation['code'] =
          name === 'env_assignment'
            ? 'provisioning.inline_credential_blocked'
            : 'provisioning.token_material_blocked';
        out.push({
          code,
          pathSegments,
          message: `${code}: matched ${name}`,
          pattern: name,
        });
        return;
      }
    }
    return;
  }
  if (typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      walk(
        node[i],
        [...pathSegments, i],
        depth + 1,
        stringByteLimit,
        maxDepth,
        maxNodes,
        counter,
        out
      );
      if (counter.halted) return;
    }
    return;
  }
  const keys = Object.keys(node as Record<string, unknown>).sort();
  for (const k of keys) {
    if (counter.halted) return;
    const lower = k.toLowerCase();
    // Top-level forbidden keys are surfaced by the preflight as
    // inline_credential_blocked; the walker only enforces nested
    // forbidden key names so a single offending key never produces
    // two distinct codes.
    if (depth > 0 && FORBIDDEN_KEY_NAMES_LOWER.has(lower) && !isAllowlistedRefKey(lower)) {
      out.push({
        code: 'provisioning.forbidden_key_name',
        pathSegments: [...pathSegments, k],
        message: `provisioning.forbidden_key_name: nested credential-bearing key '${k}'`,
        pattern: lower,
      });
      // Continue walking sibling keys but skip this subtree's contents
      // (the offending key is already a hard fail; deeper string scan
      // would just compound).
      continue;
    }
    walk(
      (node as Record<string, unknown>)[k],
      [...pathSegments, k],
      depth + 1,
      stringByteLimit,
      maxDepth,
      maxNodes,
      counter,
      out
    );
  }
}

/**
 * Public canonical schema. Wraps the base discriminated union in a
 * `.superRefine()` that runs the recursive credential-material walker
 * so callers using `ProvisioningLifecycleSchema.safeParse()` get the
 * full no-credential-leak invariant in one call. The structured
 * `validateProvisioningLifecycle` validator below adds preflight
 * checks (top-level forbidden keys, missing required fields,
 * invalid event_kind) on top of the same base+walker pair so the two
 * entry points enforce the same guarantees with the same stable codes.
 */
export const ProvisioningLifecycleSchema = ProvisioningLifecycleBaseSchema.superRefine(
  (value, ctx) => {
    const violations = scanProvisioningLifecycleForCredentialMaterial(value);
    for (const v of violations) {
      ctx.addIssue({
        code: 'custom',
        path: v.pathSegments as (string | number)[],
        message: v.message,
      });
    }
  }
);

export type ProvisioningLifecycle = z.infer<typeof ProvisioningLifecycleBaseSchema>;

export interface ProvisioningLifecycleValidationError {
  code: string;
  path?: string;
  message: string;
}

export type ProvisioningLifecycleValidationResult =
  | { ok: true; value: ProvisioningLifecycle }
  | { ok: false; errors: ProvisioningLifecycleValidationError[] };

// ---------------------------------------------------------------------------
// Top-level validator
// ---------------------------------------------------------------------------

/**
 * Validate a provisioning lifecycle observation payload. Mirrors the
 * `validateLifecycleObservation` structured-error contract.
 *
 * Pre-flight order:
 *   1. forbidden top-level credential-bearing keys -> provisioning.inline_credential_blocked
 *   2. recursive credential-material walker (key names + value strings;
 *      depth-aware; structure-bounded) -> provisioning.{forbidden_key_name |
 *      token_material_blocked | inline_credential_blocked | field_too_large |
 *      replacement_character_in_string | structure_too_deep |
 *      structure_too_large}
 *   3. event_kind presence/value -> missing_required_field / invalid_event_kind
 *   4. observed_at presence -> missing_required_field
 *   5. per-event-kind required fields
 *   6. Zod schema parse with priority-mapped stable codes
 */
export function validateProvisioningLifecycle(
  data: unknown
): ProvisioningLifecycleValidationResult {
  const errors: ProvisioningLifecycleValidationError[] = [];
  const codes = PROVISIONING_LIFECYCLE_ERROR_CODES;

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    // Pre-flight 1: forbidden top-level credential-bearing keys.
    for (const forbidden of FORBIDDEN_TOP_LEVEL_KEYS_INTERNAL) {
      if (Object.prototype.hasOwnProperty.call(obj, forbidden)) {
        errors.push({
          code: codes.inlineCredentialBlocked,
          path: forbidden,
          message: `provisioning.inline_credential_blocked: forbidden top-level credential-bearing key '${forbidden}' present at extension top level`,
        });
      }
    }

    // Pre-flight 2: recursive walker (skips top-level forbidden keys to
    // avoid duplicates with pre-flight 1; surfaces nested key names,
    // value-side credential patterns, byte cap, replacement character,
    // and structure caps).
    const walkerViolations = scanProvisioningLifecycleForCredentialMaterial(obj);
    for (const v of walkerViolations) {
      errors.push({
        code: v.code,
        path: pathSegmentsToString(v.pathSegments),
        message: v.message,
      });
    }

    // Pre-flight 3: event_kind presence and value.
    if (!Object.prototype.hasOwnProperty.call(obj, 'event_kind')) {
      errors.push({
        code: codes.missingRequiredField,
        path: 'event_kind',
        message: 'provisioning.missing_required_field: event_kind is required',
      });
    } else if (
      typeof obj.event_kind !== 'string' ||
      !(EVENT_KINDS as readonly string[]).includes(obj.event_kind)
    ) {
      errors.push({
        code: codes.invalidEventKind,
        path: 'event_kind',
        message: `provisioning.invalid_event_kind: event_kind must be one of ${EVENT_KINDS.join(', ')}`,
      });
    }

    // Pre-flight 4: observed_at presence (missing observed_at gets the
    // missing_required_field code, not invalid_observed_at).
    if (!Object.prototype.hasOwnProperty.call(obj, 'observed_at')) {
      errors.push({
        code: codes.missingRequiredField,
        path: 'observed_at',
        message: 'provisioning.missing_required_field: observed_at is required',
      });
    }

    // Pre-flight 5: per-event-kind required fields.
    if (
      typeof obj.event_kind === 'string' &&
      (EVENT_KINDS as readonly string[]).includes(obj.event_kind)
    ) {
      const ek = obj.event_kind as ProvisioningEventKind;
      const requiredByKind: Record<ProvisioningEventKind, readonly string[]> = {
        'provisioning-catalog-observed': ['catalog'],
        'provisioning-provider-link-observed': ['provider'],
        'provisioning-account-observed': ['provider', 'account'],
        'provisioning-resource-observed': ['provider', 'resource'],
        'provisioning-credential-observed': ['provider', 'credential'],
        'provisioning-payment-authorization-observed': ['payment_authorization_observation'],
        'provisioning-budget-observed': ['budget'],
        'provisioning-subscription-observed': ['provider', 'subscription'],
        'provisioning-domain-observed': ['domain'],
        'provisioning-deployment-observed': ['deployment'],
      };
      for (const field of requiredByKind[ek]) {
        if (!Object.prototype.hasOwnProperty.call(obj, field)) {
          errors.push({
            code: codes.missingRequiredField,
            path: field,
            message: `provisioning.missing_required_field: ${field} is required for event_kind ${ek}`,
          });
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Use the BASE schema for the second-stage parse so we don't double-walk
  // the input. Walker output is already in `errors` from pre-flight 2.
  const result = ProvisioningLifecycleBaseSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }

  for (const issue of result.error.issues) {
    const path = issue.path.map(String).join('.');
    let code: string = codes.opaqueRefGrammarViolation;

    // Custom-message-based mapping FIRST (covers stable-code messages
    // emitted by superRefine and field-level error() messages).
    if (issue.message.startsWith('provisioning.invalid_scheme_id')) {
      code = codes.invalidSchemeId;
    } else if (issue.message.startsWith('provisioning.invalid_amount_minor')) {
      code = codes.invalidAmountMinor;
    } else if (issue.message.startsWith('provisioning.invalid_storage_surface')) {
      code = codes.invalidStorageSurface;
    } else if (issue.message.startsWith('provisioning.invalid_material_redaction')) {
      code = codes.invalidMaterialRedaction;
    } else if (issue.message.startsWith('provisioning.invalid_observed_at')) {
      code = codes.invalidObservedAt;
    } else if (issue.message.startsWith('provisioning.invalid_retrieved_at')) {
      code = codes.invalidRetrievedAt;
    } else if (issue.message.startsWith('provisioning.invalid_expires_at')) {
      code = codes.invalidExpiresAt;
    } else if (issue.message.startsWith('provisioning.invalid_currency')) {
      code = codes.invalidCurrency;
    } else if (issue.message.startsWith('provisioning.field_too_large')) {
      code = codes.fieldTooLarge;
    } else if (issue.message.startsWith('provisioning.opaque_ref_grammar_violation')) {
      code = codes.opaqueRefGrammarViolation;
    } else if (issue.code === 'invalid_type') {
      const received = (issue as unknown as { received?: unknown }).received;
      const isMissing =
        received === undefined || received === 'undefined' || issue.message.includes('undefined');
      if (isMissing) {
        code = codes.missingRequiredField;
      } else if (path === 'observed_at') {
        code = codes.invalidObservedAt;
      } else if (path.endsWith('retrieved_at')) {
        code = codes.invalidRetrievedAt;
      } else if (path.endsWith('expires_at')) {
        code = codes.invalidExpiresAt;
      } else if (path.endsWith('currency')) {
        code = codes.invalidCurrency;
      } else {
        code = codes.invalidEventKind;
      }
    } else if (issue.code === 'invalid_format') {
      // Path-based dispatch for format failures.
      if (path === 'observed_at') {
        code = codes.invalidObservedAt;
      } else if (path.endsWith('retrieved_at')) {
        code = codes.invalidRetrievedAt;
      } else if (path.endsWith('expires_at')) {
        code = codes.invalidExpiresAt;
      } else if (path.endsWith('currency')) {
        code = codes.invalidCurrency;
      } else if (path.endsWith('scheme_id')) {
        code = codes.invalidSchemeId;
      } else if (path.endsWith('max_amount_minor')) {
        code = codes.invalidAmountMinor;
      } else if (path.endsWith('_ref') || path.endsWith('provider_ref')) {
        code = codes.opaqueRefGrammarViolation;
      } else {
        code = codes.opaqueRefGrammarViolation;
      }
    } else if (issue.code === 'invalid_value') {
      if (path === 'event_kind') {
        code = codes.invalidEventKind;
      } else if (path.endsWith('sub_event')) {
        code = codes.invalidSubEvent;
      } else if (path.endsWith('material_redaction')) {
        code = codes.invalidMaterialRedaction;
      } else if (path.endsWith('kind') && path.includes('storage_surface')) {
        code = codes.invalidStorageSurface;
      } else {
        code = codes.invalidEventKind;
      }
    } else if (issue.code === 'invalid_union') {
      code = codes.invalidEventKind;
    } else if (issue.code === 'unrecognized_keys') {
      code = codes.unrecognizedField;
    } else if (issue.code === 'too_big' || issue.code === 'too_small') {
      if (path.endsWith('scheme_id')) {
        code = codes.invalidSchemeId;
      } else if (path.endsWith('max_amount_minor')) {
        code = codes.invalidAmountMinor;
      } else {
        code = codes.opaqueRefGrammarViolation;
      }
    }

    const dup = errors.some((e) => e.code === code && e.path === (path || undefined));
    if (!dup) {
      errors.push({
        code,
        path: path || undefined,
        message: issue.message,
      });
    }
  }

  return { ok: false, errors };
}

function pathSegmentsToString(segments: ReadonlyArray<string | number>): string {
  return segments.map((s) => String(s)).join('.');
}

// ---------------------------------------------------------------------------
// Internal exports for tests in the same package (NOT in the public barrel)
// ---------------------------------------------------------------------------

/** @internal Test-only export: forbidden top-level credential-bearing keys. */
export const PROVISIONING_FORBIDDEN_TOP_LEVEL_KEYS_INTERNAL = FORBIDDEN_TOP_LEVEL_KEYS_INTERNAL;

/** @internal Test-only export: recursive credential-material walker. */
export const scanProvisioningLifecycleForCredentialMaterialInternal =
  scanProvisioningLifecycleForCredentialMaterial;
