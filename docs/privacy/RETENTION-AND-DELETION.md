# PEAC Retention and Deletion for Deployers

**Status:** Deployment guidance (informative)
**Version:** 0.1
**Applies to:** Operators running PEAC issuers, verifiers, hosted-verify deployments, and reference integrations.

---

## What PEAC does

- Defines retention classes for the data a PEAC-aware deployment
  typically holds (signed records, derived indexes, verifier caches,
  audit bundles, shadow-mode artifacts).
- Provides configurable retention caps and deletion hooks in the
  reference verifier (see §5).
- Separates **immutable signed evidence** from **mutable derived
  metadata** so deletion of the mutable layer does not corrupt the
  evidence layer, and so retention of the evidence layer does not
  silently defeat an operator deletion decision.
- Cross-references the ISO/IEC 42001:2023 Clause 8 operational mapping
  shipped in v0.12.13 (`docs/compliance/ISO-42001-MAPPING.md`).

## What PEAC does not do

- PEAC does not decide an operator's retention period. Legal basis,
  statutory retention, contractual retention, and audit retention are
  the operator's decision.
- PEAC does not enforce retention limits at the wire layer. Retention
  is a deployment-side behavior of issuers, verifiers, and downstream
  storage.
- PEAC does not delete or rotate keys on the operator's behalf.

## What deployers / controllers / processors still own

- Selecting a retention period per class.
- Ensuring deletion of derived indexes and caches when the operator's
  retention decision requires it.
- Documenting the link between the signed evidence layer and any
  derived / mutable layer that holds personal data.
- Coordinating with downstream sinks (SIEM, audit bundles, SCITT-style
  transparency logs) that may carry longer retention than the verifier.

---

## 1. Retention classes

Each class below names a storage location typically present in a PEAC
deployment. Operators SHOULD pick a concrete retention period per
class, aligned with lawful basis and contractual obligations.

| Class                  | Location                                                         | Typical contents                                                              | Default discipline                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Signed evidence        | Issuer archive, SCITT-style sink, verifier-attested bundle       | Compact JWS (`interaction-record+jwt`), full bytes                            | Immutable by design. Retention set to match the operator's longest lawful / contractual basis. Never mutated, never partially redacted in place. |
| Derived verifier cache | Reference-verifier in-memory / on-disk cache                     | JWKS, issuer config, verification reports, normalized parse artifacts         | Bounded by configurable TTL + size cap. Purgeable without touching the signed evidence layer.                                                    |
| Derived report index   | Reference-verifier report store (if any), hosted-verify database | `receipt_ref`, timestamps, verification outcomes, caller metadata             | Bounded by configurable retention window. Deletion hook purges by `receipt_ref` without touching signed evidence.                                |
| Verifier request logs  | Reverse proxy, verifier process logs                             | IP, user agent, timing, request line, outcome                                 | Classified per operator log retention policy. Often shorter than report index. Redact per `PRIVACY-PROFILE.md`.                                  |
| Audit bundles          | Compliance export, SIEM                                          | Grouped records + metadata                                                    | Retention per audit / compliance requirement. Often longer than verifier cache; may be subject to statutory limits.                              |
| Shadow-mode artifacts  | Internal reboot testing only (v0.13.1 / v0.13.2)                 | Differential telemetry (hashes, refs, bounded redaction-marked excerpts only) | Bounded to ≤ 7 days by default; never carries raw personal data.                                                                                 |

---

## 2. Deletion model

PEAC distinguishes **evidence-layer deletion** from **derived-layer
deletion**.

- **Evidence-layer deletion.** Deleting the signed JWS itself
  (destroying the authoritative artifact). This is typically only done
  when an operator's lawful basis for retaining the evidence has
  expired. Signed records are immutable in place; "deletion" means
  removing the artifact from all storage tiers the operator controls.
- **Derived-layer deletion.** Deleting references to a record in the
  verifier cache, report index, or audit bundle without destroying the
  authoritative JWS. The signed evidence remains available elsewhere if
  the operator still holds it. This is the right layer to act on for
  most rights requests that are not evidence-destruction requests.

The reference verifier provides deletion hooks for the derived layer
only. Evidence-layer deletion is an operator responsibility.

---

## 3. Linked-index purge

When the operator decides to delete a record from the evidence layer,
they MUST also purge every derived-layer index, cache entry, and
report artifact that references it (typically keyed by `receipt_ref`,
issuer identifier, and canonical subject). Otherwise the derived
layer becomes a silent ghost of the evidence layer.

The reference verifier's deletion hook accepts a `receipt_ref` list and
purges cache and report-index entries keyed by those references.
Downstream sinks (SIEM, SCITT-style log, audit bundle) are out of
scope for this hook and MUST be handled by the operator.

---

## 4. Legal / audit retention boundary

Some retention periods are dictated by statute (tax, financial audit,
safety-critical audit), by contract, or by active litigation hold.
Operators MUST resolve these against any deletion request before
acting. PEAC does not and cannot decide this.

---

## 5. Reference-verifier privacy defaults

The narrow, configurable defaults below ship in v0.12.14. Defaults
favor minimization. Operators override per-deployment.

- **JWKS cache retention caps.** The JWKS resolver in `@peac/protocol`
  caches resolved JWKS per issuer using an LRU map. The TTL and the
  max-entries cap are configurable per call (`cacheTtlMs`,
  `maxCacheEntries`) and via environment variables read at module
  load:
  - `PEAC_JWKS_CACHE_TTL_MS` (default `300000`, i.e. 5 minutes).
  - `PEAC_JWKS_CACHE_MAX_ENTRIES` (default `1000`).

  A malformed value (non-positive integer or non-numeric) is ignored
  and the built-in default applies; the resolver never silently
  uncaches itself because of operator typos.

- **`no_raw_personal_data` minimization mode.** Set
  `PEAC_NO_RAW_PERSONAL_DATA=true` (or `=1`) on the reference
  verifier process. When enabled, the verifier report applies a
  minimization redactor to the claims payload. This is a
  minimization posture, **not** a legal guarantee that all personal
  data has been removed; deployments with broader claim payloads,
  nested operator-specific schemas, or regulated data MUST add
  their own redaction layer (see "What deployers still own" above).
  - `claims.sub` is replaced with `sha256:<32 hex>` (128 bits of
    visible digest), a deterministic pseudonym derived from the raw
    value. The same input yields the same pseudonym across requests
    so chain-of-thought is preserved without leaking the raw
    subject.
  - `claims.actor` PII fields (`id`, `email`, `name`, `display_name`,
    `handle`, `sub`) are pseudonymised the same way when present as
    strings. Other actor string fields are elided to
    `<redacted:elided>` unless they look like short structured
    identifiers (ASCII printable, no whitespace, length 1..16; e.g.
    `role: reader`).
  - `claims.extensions` is walked recursively. Every string leaf
    inside the extensions subtree (top-level, nested objects, array
    elements) is elided to `<redacted:elided>` unless it looks like
    a short structured identifier; numbers, booleans, null, and
    nested object/array structure pass through.
  - Unknown top-level claim keys whose values are free-text strings
    are elided the same way; short structured strings, numbers, and
    booleans pass through.
  - Protocol metadata (`iss`, `iat`, `exp`, `nbf`, `jti`, `kind`,
    `type`, `typ`, `alg`, `kid`, `cty`, `pillars`, `wire_version`,
    `version`, `policy`, `policy_binding`, `bindings`) is unchanged.

  When the env var is unset (the default), the report body is
  byte-identical to v0.12.13 behavior. This is enforced by the
  byte-stability lock test in `apps/api/tests/report-format.test.ts`.

- **Deletion hooks for the derived layer (operator-owned).** The
  reference verifier in this repository does not maintain a
  long-lived report index server-side; each request is computed and
  returned. Deployments that wrap the reference verifier in a report
  store MUST implement deletion against that store themselves, keyed
  by `receipt_ref`. PEAC owns the contract (purge by `receipt_ref`
  list, derived layer only, signed evidence untouched). Storage and
  access control are operator-owned. See §2 for the
  evidence-vs-derived deletion model.

- **Optional report-index retention (operator-owned).** When a
  deployment adds a report-index store, the operator is responsible
  for the retention period and purge cadence. PEAC documents the
  recommended bounded posture (`PEAC_REPORT_RETENTION_SECONDS` is the
  reserved env-var name when an operator wants to expose it via the
  same `PEAC_*` namespace) but does not enforce it from the binding
  layer.

- **Stricter redaction in verifier request logs (operator-owned).**
  Free-text and header-derived fields in process or reverse-proxy
  logs are operator-owned. `docs/specs/PRIVACY-PROFILE.md` §4 lists
  the categories that MUST NOT be captured at the receipt layer;
  operators apply equivalent redaction in their request-log layer
  per their lawful-basis and retention decision.

- **Pseudonymous-ID fixtures and regression tests** ship in
  `apps/api/tests/report-format.test.ts` under the
  `redactClaimsForPrivacy (no_raw_personal_data mode; v0.12.14)`
  block. They lock the contract: when the mode is on, the
  serialized report never contains the raw subject, the raw actor
  id, or long free-text extension strings.

---

## 6. References

- [DATA-CLASSIFICATION.md](DATA-CLASSIFICATION.md): which surfaces
  likely hold personal data.
- [DEPLOYMENT-ROLES.md](DEPLOYMENT-ROLES.md): controller / processor
  posture per deployment shape.
- [DATA-SUBJECT-RIGHTS.md](DATA-SUBJECT-RIGHTS.md): rights handling
  uses the evidence-vs-derived split defined above.
- `docs/compliance/ISO-42001-MAPPING.md`: Clause 8 operational
  mapping shipped in v0.12.13.
- `docs/specs/PRIVACY-PROFILE.md`: normative receipt-side privacy
  profile including §7 retention guidance.
