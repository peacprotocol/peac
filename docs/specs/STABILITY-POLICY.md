# PEAC Protocol Stability Policy (NORMATIVE)

Status: NORMATIVE
Version: 0.1
Last-Updated: 2026-02-05

This document defines what is stable, what may change, and how changes are communicated across PEAC Protocol artifacts.

## 1. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

## 2. Stability scope

PEAC includes multiple artifact classes. This policy defines commitments for each class:

- Wire formats (receipts, bundles, reports)
- Verification semantics (checks, security boundaries)
- HTTP headers and transport profiles
- Tooling outputs (CLI, conformance runner)
- SDK APIs (TypeScript/Go/etc.)
- Registries (kinds, extensions) and reserved namespaces

## 3. Compatibility model

### 3.1 Format versioning

A "format" MUST declare a version identifier in one of:
- A media-type-like token (e.g., `peac-receipt/0.1`)
- A top-level `*_version` field (e.g., `report_version: "peac-verification-report/0.1"`)

A format version implies:
- Backward-compatible additions MAY occur within a minor line (e.g., `0.1` to `0.1` with added OPTIONAL fields).
- Breaking changes MUST increment the major component (e.g., `0.1` to `1.0`, or `0.x` to `0.y` only if explicitly marked "pre-stable" below).

### 3.2 Pre-stable caveat

While PEAC is pre-1.0, not all artifacts are equally stable. PEAC therefore uses a *tiered stability* model. Each artifact class is classified as:

- **FROZEN**: no breaking changes expected prior to 1.0, except for security emergencies.
- **STABLE**: backwards-compatible changes only; breaking changes require a new major format version.
- **EVOLVING**: may change; MUST provide migration notes and compatibility shims where feasible.
- **EXPERIMENTAL**: may change or be removed; MUST be clearly labeled and off by default in production-facing paths.

## 4. Stability tiers by artifact

### 4.1 Receipts (wire)

- Receipt wire format identifier: `peac-receipt/0.1`
- Tier: **FROZEN**

Commitments:
- Implementations MUST accept `peac-receipt/0.1` receipts indefinitely.
- New OPTIONAL claims MAY be added, but MUST NOT change the meaning of existing claims.
- Existing REQUIRED claims MUST NOT be removed or redefined.
- Any breaking change MUST introduce a new receipt wire version (e.g., `peac-receipt/1.0`) and MUST NOT silently reuse `peac-receipt/0.1`.

### 4.2 Dispute bundle format (wire)

- Bundle wire format identifier: `peac-bundle/0.1`
- Tier: **STABLE**

Commitments:
- Bundle verification MUST remain possible with tools that implement the bundle version declared in the bundle manifest.
- Bundles intended for offline verification MUST include sufficient issuer key material as specified by current bundle rules.
- Any breaking change MUST be a new bundle format version and MUST include explicit migration guidance.

### 4.3 Verification report format (wire)

- Report format identifier: `peac-verification-report/0.1`
- Tier: **STABLE**
- Canonical schema defined in `VERIFICATION-REPORT-FORMAT.md`

Commitments:
- Report schema changes MUST be backwards compatible within the same report version.
- Any new fields MUST be OPTIONAL and MUST NOT change the semantics of existing fields.
- Any breaking change MUST increment the report version identifier.

### 4.4 Conformance report format (wire)

- Report format identifier: `peac-conformance-report/0.1`
- Tier: **STABLE**
- Canonical schema defined in `CONFORMANCE-REPORT-FORMAT.md`

Commitments:
- Same as verification reports: additions MUST be backwards compatible; breaking requires new report version.

### 4.5 Transport profiles (behavior)

- Tier: **STABLE**

Commitments:
- Header/Body/Pointer profiles MUST preserve verification equivalence: a receipt delivered via any profile MUST verify to the same claims bytes.
- Size limits and fallback behaviors MAY evolve with clearer operational guidance, but MUST NOT break well-formed flows that comply with the published budgets.

### 4.6 Verifier security model (behavior)

- Tier: **STABLE**

Commitments:
- Security limits MAY tighten over time (e.g., stricter SSRF protections), but MUST NOT loosen in ways that expand attack surface without a major policy version bump.
- The default posture SHOULD remain "client-side verification preferred" where feasible.

### 4.7 Registries (kinds, extensions)

- Reserved namespaces (e.g., `peac.*`, `org.peacprotocol.*`) are Tier: **FROZEN** for reservation rules.
- The list of well-known kinds is Tier: **EVOLVING**.

Commitments:
- Reservation rules MUST NOT change (to prevent squatting).
- New well-known kinds MAY be added, but old kinds MUST NOT be redefined.

### 4.8 SDK APIs

- Tier: **EVOLVING** (pre-1.0 SDK ergonomics may change)

Commitments:
- SDKs SHOULD provide deprecation warnings for renamed APIs.
- Breaking API changes SHOULD be minimized and documented in release notes.
- Wire and verification correctness MUST NOT be compromised by API changes.

## 5. Deprecation policy

If an artifact or behavior is deprecated:
- It MUST be marked deprecated in docs and release notes.
- It MUST remain supported for at least one minor release line after deprecation announcement, unless a security vulnerability requires removal.
- A migration path MUST be documented.

## 6. Security emergency exception

In case of a critical vulnerability:
- PEAC MAY ship a breaking change within a "frozen" line ONLY if necessary to prevent exploitation.
- Such changes MUST be explicitly called out as a security emergency in release notes.
- When possible, both old and new behaviors SHOULD be supported with opt-in hardening before full enforcement.

## 7. Change communication requirements

Every release that touches:
- receipt verification semantics,
- verifier security constraints,
- transport profile constraints,
- privacy defaults,

MUST include:
- A "Behavior Changes" section in release notes.
- A short "Upgrade Impact" note with concrete examples.

## 8. Test vectors and determinism

- Conformance vectors and deterministic outputs are part of the public contract.
- Changes that alter canonicalization, hashing, or byte-level comparison MUST:
  - update vectors,
  - update conformance runner expectations,
  - document the reason (bug fix vs spec change).

## 9. Practical guidance

**If you are integrating PEAC for production today, treat these as "must not change":**
- `peac-receipt/0.1` parsing and verification
- dispute bundle offline verification rules
- verification report schema for `peac-verification-report/0.1`
- transport profile equivalence guarantees

**Treat these as "may evolve":**
- SDK convenience APIs
- additional optional claims and extensions
- verifier UX and tooling ergonomics

## 10. Summary table

| Artifact | Tier | Change Policy |
|----------|------|---------------|
| `peac-receipt/0.1` | FROZEN | No breaking changes until v1.0 |
| `peac-bundle/0.1` | STABLE | Backwards-compatible only |
| `peac-verification-report/0.1` | STABLE | Backwards-compatible only |
| `peac-conformance-report/0.1` | STABLE | Backwards-compatible only |
| Transport profiles | STABLE | Profile equivalence guaranteed |
| Verifier security model | STABLE | May tighten, not loosen |
| Registry namespaces | FROZEN | Reservation rules fixed |
| Well-known kinds | EVOLVING | Additions only |
| SDK APIs | EVOLVING | May change with notice |
