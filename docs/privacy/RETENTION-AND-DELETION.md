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

## 5. Reference-verifier privacy defaults (planned follow-up within v0.12.14; not yet merged)

This document describes intent. The narrow, configurable defaults
listed below are **planned follow-up within the v0.12.14 release
window** and are **not yet merged**. They land in a follow-up code
commit on the same release; until that commit lands, none of the
names below resolve in the reference-verifier code path. Defaults
favor minimization when shipped.

- **Retention caps** (planned) on the derived verifier cache
  (`PEAC_CACHE_TTL`, `PEAC_CACHE_MAX_ENTRIES`) and on the optional
  report index (`PEAC_REPORT_RETENTION_SECONDS`). Operators will
  override via config or environment.
- **Deletion hooks** (planned) accepting a list of `receipt_ref`
  values and purging derived-layer entries only.
- **Stricter redaction defaults** (planned) for free-text or
  header-derived fields in verifier logs.
- **`no_raw_personal_data`** report mode toggle (planned). When
  enabled, the verifier report will omit or hash fields classified
  as likely personal data. Default operator-selectable; recommended
  on for public-facing deployments.
- **Pseudonymous-ID fixtures** (planned) and regression tests in the
  reference verifier test suite, proving no raw value surfaces
  through the report path when `no_raw_personal_data` is on.

Exact environment variables, defaults, and code paths land in the
verifier privacy defaults commit within v0.12.14 and are documented
in `surfaces/reference-verifier/README.md` when they land. This
section will lose the "planned" qualifiers and gain concrete config
references at that point.

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
