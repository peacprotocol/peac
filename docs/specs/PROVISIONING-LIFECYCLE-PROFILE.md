# Provisioning Lifecycle Records (Profile 0.1)

**Status:** stable; introduced in v0.14.2.
**Extension namespace:** `org.peacprotocol/provisioning-lifecycle`
**Scope:** OBSERVER. Records what a caller reports happened; PEAC does not perform, authorize, or validate the action.
**Conformance section:** 31 (`PROV-LIFE-001..010`).

## 1. Abstract

This profile defines a vendor-neutral observation record format for reported provisioning lifecycle events from external systems. Caller systems (agents, agent-driven workflows, control planes, CLIs, or providers themselves) report what happened when services, accounts, resources, credentials, payment authorizations, budgets, subscriptions, domains, or deployments were provisioned through external providers; PEAC records that report. The profile carries the shape of the observation and validation invariants that prevent credential leakage; it does not prescribe how provisioning is carried out.

## 2. Profile version and status

- Profile version: `0.1`.
- Status: stable.
- Issued in: PEAC Protocol v0.14.2.
- Wire format: Wire 0.2 (`interaction-record+jwt`); the profile rides as an extension under `extensions["org.peacprotocol/provisioning-lifecycle"]`.

## 3. Boundary (NORMATIVE)

A provisioning lifecycle record records what the issuer reports happened in a provisioning flow. **PEAC does not authorize the action, verify legal acceptance, provision resources, validate credentials, process payments, vouch for provider state, settle transactions, manage credential vaults, or operate the runtime. PEAC does not implement OAuth, DPoP, OAuth Protected Resource Metadata, or Shared Payment Tokens.** PEAC may carry digests of artifacts produced by those flows.

This profile composes with external standards by reference only:

- RFC 9700 (BCP 240) — OAuth 2.0 Security Best Current Practice (referenced for guidance; not implemented here).
- RFC 6749 — OAuth 2.0 Authorization Framework (referenced; not implemented here).
- `draft-ietf-oauth-v2-1-15` — OAuth 2.1 Internet-Draft (informational only; not a normative dependency).
- RFC 9449 — DPoP, Proposed Standard (referenced; PEAC carries digests, does not verify).
- RFC 9728 — OAuth Protected Resource Metadata, Proposed Standard (referenced; not implemented here).

## 4. Wire format and namespace

Records are issued through the existing PEAC Wire 0.2 issuance path (`@peac/protocol.issue()`) and verified through `@peac/protocol.verifyLocal()`. The profile occupies one extension namespace and ten record-type URIs:

- Extension namespace: `org.peacprotocol/provisioning-lifecycle`.
- Type URIs (10):
  - `org.peacprotocol/provisioning-catalog-observed`
  - `org.peacprotocol/provisioning-provider-link-observed`
  - `org.peacprotocol/provisioning-account-observed`
  - `org.peacprotocol/provisioning-resource-observed`
  - `org.peacprotocol/provisioning-credential-observed`
  - `org.peacprotocol/provisioning-payment-authorization-observed`
  - `org.peacprotocol/provisioning-budget-observed`
  - `org.peacprotocol/provisioning-subscription-observed`
  - `org.peacprotocol/provisioning-domain-observed`
  - `org.peacprotocol/provisioning-deployment-observed`

Granular sub-states (created / linked / granted / revoked / issued / rotated / etc.) live as `<scope>.sub_event` fields inside the relevant scope object, NOT as separate type URIs.

## 5. Event vocabulary and discriminator

Every record carries a closed-enum discriminator at `event_kind` whose value matches the type URI minus the `org.peacprotocol/` prefix. The ten event families are:

| Family                | event_kind                                    | Required scope object               | sub_event values                                        |
| --------------------- | --------------------------------------------- | ----------------------------------- | ------------------------------------------------------- |
| Catalog discovery     | `provisioning-catalog-observed`               | `catalog`                           | (no sub_event; one-shot retrieval)                      |
| Provider link         | `provisioning-provider-link-observed`         | `provider`                          | (no sub_event; presence implies linked)                 |
| Account               | `provisioning-account-observed`               | `provider`, `account`               | `created`, `linked`, `authorized`, `updated`            |
| Resource              | `provisioning-resource-observed`              | `provider`, `resource`              | `requested`, `provisioned`, `updated`, `removed`        |
| Credential            | `provisioning-credential-observed`            | `provider`, `credential`            | `issued`, `rotated`, `revoked`, `synced`                |
| Payment authorization | `provisioning-payment-authorization-observed` | `payment_authorization_observation` | `observed`, `granted`, `revoked`, `expired`, `consumed` |
| Budget                | `provisioning-budget-observed`                | `budget`                            | (no sub_event)                                          |
| Subscription          | `provisioning-subscription-observed`          | `provider`, `subscription`          | `started`, `updated`, `cancelled`                       |
| Domain                | `provisioning-domain-observed`                | `domain`                            | `registered`, `transferred`, `released`                 |
| Deployment            | `provisioning-deployment-observed`            | `deployment`                        | `started`, `completed`, `failed`, `rolled_back`         |

`observed_at` is required on every event family. Optional metadata: `observed_by_ref`, `upstream_event_ref`, `upstream_artifact_digest`.

`credential.storage_surface` is REQUIRED for `credential.sub_event` values that handle credential material directly (`issued`, `rotated`, `synced`) and OPTIONAL for `revoked`. When the caller cannot capture or describe the storage surface safely, the placeholder `{ "kind": "unknown", "material_redaction": "never_capture" }` satisfies the invariant.

## 6. Schema (NORMATIVE)

The canonical schema is `ProvisioningLifecycleSchema` in `packages/schema/src/extensions/provisioning-lifecycle.ts`. Highlights:

- **Discriminated union** on `event_kind` over the ten `*-observed` literal values; each variant is `.strict()` and rejects unknown keys.
- **`*_ref` fields** are validated by `OpaqueRefSchema` (no whitespace, no `@`, recognized prefix, `<= 256` UTF-8 bytes).
- **`*_digest` fields** are validated by `Sha256DigestSchema` (`sha256:<64 lowercase hex>`).
- **`storage_surface`** is an object with abstract `kind` enum (`external_secret_store`, `local_encrypted_file`, `local_plaintext_file`, `environment_file`, `runtime_secret_binding`, `none`, `unknown`), opaque `provider_ref` / `surface_ref`, and required `material_redaction`. Vendor identity goes in opaque `provider_ref`, never as a registered enum value. On `credential` observations, `storage_surface` is REQUIRED for `sub_event` values `issued`, `rotated`, and `synced`; missing values reject with `provisioning.invalid_storage_surface`.
- **`payment_authorization_observation`** carries:
  - `scheme_id` (bounded ASCII; max 128 UTF-8 bytes; allowed `[a-z0-9._:/+-]`) **OR** `scheme_ref` (opaque); mutually exclusive.
  - `authorization_ref` (required opaque ref).
  - `issuer_ref` (required opaque ref).
  - `currency` (optional; ISO-4217 3-letter uppercase).
  - `max_amount_minor` (optional; canonical non-negative base-10 integer string: `0` or a non-zero leading digit followed by digits. Leading zeros, decimals, exponent notation, signs, and empty strings reject with `provisioning.invalid_amount_minor`).
  - `expires_at` (optional; RFC 3339 with offset).
  - `sub_event` (optional; `observed | granted | revoked | expired | consumed`).
  - `material_redaction` (required; `never_capture | redacted_capture | hashed_capture`).
- **`provider`** carries required opaque `provider_ref`, optional opaque `account_ref`, and either bounded `scheme_id` or opaque `scheme_ref` (mutually exclusive). Vendor identity is carried as an opaque reference (e.g. `urn:peac:provider:<digest>`), never as a raw vendor identifier string.

## 7. Reported / observed / derived semantics

Records combine three evidence categories per field:

- **reported**: an upstream system, CLI, provider, agent, or caller says an event occurred.
- **observed**: the issuance wrapper directly observed local execution metadata or files.
- **derived**: PEAC or an adapter computes a digest, summary, or projection from source artifacts.

Records may combine all three; each field's category is documented in the schema source so callers and verifiers do not silently promote one category to another. PEAC does not vouch for legal acceptance, provider state, credential validity, payment finality, authorization correctness, resource existence, or deployment success.

## 8. Recursive credential-material scanner (NORMATIVE)

The provisioning lifecycle validator applies a deterministic, key-sorted recursive credential-material scanner as part of both `ProvisioningLifecycleSchema.safeParse()` (via `.superRefine`) and the structured `validateProvisioningLifecycle()` validator.

The scanner:

- Applies a per-string UTF-8 byte limit (default 8192) **before** regex matching; oversized strings reject with `provisioning.field_too_large`.
- Rejects strings containing the Unicode replacement character (`U+FFFD`) with `provisioning.replacement_character_in_string`.
- Applies only generic credential-material classes to value strings (no vendor names): `jwt_compact`, `bearer_token`, `pem_private_key`, `env_assignment`, `connection_string_with_credentials`. Matches surface as `provisioning.token_material_blocked` (or `provisioning.inline_credential_blocked` for `env_assignment`).
- Rejects nested forbidden credential-bearing key names (`token`, `access_token`, `secret`, `private_key`, etc.) at any depth past the top level with `provisioning.forbidden_key_name`. The allowlist (`*_ref`, `*_digest`) carries opaque references / sha256 digests by construction.
- Top-level forbidden credential-bearing keys are surfaced exclusively by the validator preflight as `provisioning.inline_credential_blocked`. The scanner skips top-level forbidden keys at depth 0 so a single offending key never produces two distinct codes.
- Enforces structure caps with `provisioning.structure_too_deep` (default depth 32) and `provisioning.structure_too_large` (default 10,000 nodes) so adversarial inputs cannot exhaust validator resources before the per-string check runs.

Provider-specific token-prefix detection belongs in public-artifact and example gates (such as `scripts/check-public-artifacts.mjs`), not the normative schema.

## 9. Stable error codes

Twenty validator-emitted codes plus one fixture-loader-only code:

| Code                                           | Emitted by              | When                                                                                                                                                                   |
| ---------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provisioning.inline_credential_blocked`       | preflight + scanner     | forbidden top-level credential-bearing key OR `env_assignment` regex match                                                                                             |
| `provisioning.token_material_blocked`          | scanner                 | credential-shaped value at any depth                                                                                                                                   |
| `provisioning.forbidden_key_name`              | scanner                 | nested forbidden key name (not allowlisted)                                                                                                                            |
| `provisioning.field_too_large`                 | scanner / schema        | string exceeds per-string byte cap before regex; or `boundedUtf8String` violated                                                                                       |
| `provisioning.replacement_character_in_string` | scanner                 | `U+FFFD` present in any string                                                                                                                                         |
| `provisioning.structure_too_deep`              | scanner                 | input exceeds the depth cap (default 32 levels)                                                                                                                        |
| `provisioning.structure_too_large`             | scanner                 | input exceeds the node cap (default 10,000 nodes)                                                                                                                      |
| `provisioning.opaque_ref_grammar_violation`    | schema                  | `*_ref` field fails opaque-ref grammar                                                                                                                                 |
| `provisioning.invalid_storage_surface`         | schema                  | `storage_surface.kind` not in closed enum, OR `credential.storage_surface` missing for `issued`/`rotated`/`synced`                                                     |
| `provisioning.invalid_material_redaction`      | schema                  | `material_redaction` not in closed enum                                                                                                                                |
| `provisioning.invalid_event_kind`              | schema                  | top-level `event_kind` not in closed 10-family enum                                                                                                                    |
| `provisioning.invalid_sub_event`               | schema                  | a `<scope>.sub_event` value (e.g. `account.sub_event`, `credential.sub_event`, `payment_authorization_observation.sub_event`) is not in the closed enum for that scope |
| `provisioning.invalid_scheme_id`               | schema                  | bounded `scheme_id` grammar violation OR `scheme_id`/`scheme_ref` co-presence                                                                                          |
| `provisioning.invalid_amount_minor`            | schema                  | `max_amount_minor` not in canonical non-negative integer-string form (`0` or `[1-9][0-9]*`); leading zeros, decimals, exponents, signs, and empty strings all reject   |
| `provisioning.invalid_observed_at`             | schema (path-based)     | malformed `observed_at` (not RFC 3339 with offset)                                                                                                                     |
| `provisioning.invalid_retrieved_at`            | schema (path-based)     | malformed `catalog.retrieved_at` (not RFC 3339 with offset)                                                                                                            |
| `provisioning.invalid_expires_at`              | schema (path-based)     | malformed `expires_at` (not RFC 3339 with offset)                                                                                                                      |
| `provisioning.invalid_currency`                | schema (path-based)     | malformed `currency` (not ISO-4217 3-letter uppercase)                                                                                                                 |
| `provisioning.unrecognized_field`              | schema                  | an unknown field rejected by `.strict()`; benign unknown fields do NOT emit `inline_credential_blocked`                                                                |
| `provisioning.missing_required_field`          | preflight / schema      | event-kind required field absent                                                                                                                                       |
| `provisioning.invalid_utf8`                    | **fixture loader only** | raw-byte UTF-8 validation BEFORE `JSON.parse`; never emitted by the in-memory validator                                                                                |

## 10. Composition with other specs

This profile composes with (but does not implement) the following standards. References are advisory; PEAC carries digests and refs but does not verify upstream protocol semantics:

- RFC 9700 — OAuth 2.0 Security Best Current Practice (BCP 240, Best Current Practice, January 2025).
- RFC 6749 — OAuth 2.0 Authorization Framework (Proposed Standard).
- `draft-ietf-oauth-v2-1-15` — OAuth 2.1 (Active Internet-Draft, last updated 2026-03-02; expires 2026-09-03; not RFC).
- RFC 9449 — DPoP (Proposed Standard).
- RFC 9728 — OAuth Protected Resource Metadata (Proposed Standard).
- RFC 8259 — JSON.
- RFC 7515 — JWS.
- RFC 8785 — JCS.
- RFC 9457 — Problem Details.

## 11. Test vectors

Conformance Section 31 requirement IDs `PROV-LIFE-001..010` map to `packages/schema/__tests__/extensions/provisioning-lifecycle*.test.ts` per `specs/conformance/test-mappings.json`. Per-family positive vectors live in `packages/schema/__tests__/extensions/provisioning-lifecycle-shape.test.ts`; rejection vectors covering each stable error code live in `packages/schema/__tests__/extensions/provisioning-lifecycle.test.ts`; registry-completeness vectors in `packages/schema/__tests__/extensions/provisioning-lifecycle-registry.test.ts`.

## 12. Non-goals

PEAC does **not** in this profile:

- Authorize provisioning actions.
- Process payments.
- Settle transactions.
- Provision resources.
- Deploy software.
- Store credentials.
- Manage credential vaults.
- Validate credential correctness.
- Enforce policy.
- Score trust.
- Operate the runtime.
- Become a payment rail.
- Become a credential vault.
- Become a runtime control plane.
- Become an account-provisioning system.
- Become an orchestration engine.
- Become a provider gateway.
- Implement OAuth, DPoP, PRM, or SPT.
- Verify OAuth/DPoP/PRM/SPT correctness.
- Vouch for provider state.
- Vouch for legal acceptance.
- Determine payment finality.
