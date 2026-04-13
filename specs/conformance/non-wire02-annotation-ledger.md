# Non-WIRE02 Governing-Spec Annotation Ledger

**Scope:** Bounded follow-up ledger for the 25 non-WIRE02 requirement IDs registered in
`specs/conformance/extension-requirement-ids.json`.

**Status at v0.12.9:**

- **Hash integrity:** blocking for all 25 IDs (enforced by
  `scripts/conformance/verify-registry-drift.mjs`).
- **Governing-spec presence:** advisory at v0.12.9. Source fragments below are derived
  from normative profile prose and implementation contracts, but may not appear verbatim
  in the governing spec doc yet. Each row lists the exact work needed to move spec-presence
  from advisory to blocking.

**Exit condition:** When all rows in the table below are marked `annotated`, the
`verify-registry-drift.mjs` advisory branch for non-WIRE02 IDs can be promoted to blocking
(single-line change in that script). This ledger is the tracked list that prevents the
advisory status from becoming permanent.

**Bounding rule:** This list is closed. No new non-WIRE02 requirement IDs may be added
without either (a) shipping the governing-spec annotation in the same change, or (b)
appending a row here in the same PR. Any drift between
`extension-requirement-ids.json` and this ledger MUST be caught by review.

---

## Follow-up items

Legend: `pending` = governing spec does not yet contain the source fragment verbatim;
`annotated` = fragment is present in the governing spec and matches the registry hash.

### Section 21: x402 V2 Wire Extensions (governing: `docs/specs/X402-V2-PROFILE.md`)

| ID         | Status  | Follow-up                                                                                                        |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| X402V2-001 | pending | Quote `maxTimeoutSeconds: must be a positive number (duration, not epoch)` in the V2 offer requirements section. |
| X402V2-002 | pending | Quote `V2 offers require supportedVersions to include 2` in the V2 offer verification section.                   |
| X402V2-003 | pending | Quote `Unknown V2 shapes are rejected in strict mode (fail-closed)` in the strict-mode section.                  |
| X402V2-004 | pending | Quote `Default: [1] (V2 rejected unless explicitly enabled)` in the default-policy section.                      |

### Section 22: DID Resolution (governing: `docs/specs/DID-RESOLUTION-PROFILE.md`)

| ID          | Status  | Follow-up                                                                                                                                    |
| ----------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| DID-RES-001 | pending | Quote `Supports both multibase forms: z (base58btc) and u (base64url)` in the did:key section.                                               |
| DID-RES-002 | pending | Quote `u prefix: base64url encoding (multibase)` in the did:key section.                                                                     |
| DID-RES-003 | pending | Quote `Non-Ed25519 keys are rejected without oracle (no early-return, prevents timing side-channels)` in the did:key section.                |
| DID-RES-004 | pending | Quote `URL transformation: did:web:example.com:path:to transforms to https://example.com/path/to/did.json` in the did:web section.           |
| DID-RES-005 | pending | Quote `Percent-encoded port: did:web:example.com%3A8443 transforms to https://example.com:8443/.well-known/did.json` in the did:web section. |
| DID-RES-006 | pending | Quote `IP literal rejection: did:web with IP literal hostname is rejected` in the did:web security section.                                  |
| DID-RES-007 | pending | Quote `Exact id match: resolved document id must match the input DID` in the document-validation section.                                    |

### Section 23: gRPC Transport (governing: `docs/specs/GRPC-TRANSPORT-PROFILE.md`)

| ID            | Status  | Follow-up                                                                                                                          |
| ------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GRPC-META-001 | pending | Quote `extract(): reads receipt from metadata, computes real SHA-256 receipt_ref via node:crypto` in the extract/validate section. |
| GRPC-META-002 | pending | Quote `Binary metadata (gRPC -bin suffix convention) is rejected for PEAC receipt data` in the metadata-key rules section.         |
| GRPC-META-003 | pending | Quote `Default receipt type: interaction-record+jwt (Wire 0.2)` in the default-receipt-type section.                               |

### Section 24: PKCE for OAuth MCP (governing: `docs/specs/A2A-AUTH-PROFILE.md`)

| ID       | Status  | Follow-up                                                                                         |
| -------- | ------- | ------------------------------------------------------------------------------------------------- |
| PKCE-001 | pending | Quote `Verifier: 43-128 chars from RFC 7636 unreserved set` in the PKCE section.                  |
| PKCE-002 | pending | Quote `S256 only; plain method is rejected` in the PKCE section.                                  |
| PKCE-003 | pending | Quote `decision: always review (never allow or deny)` in the auth-observation evidence section.   |
| PKCE-004 | pending | Quote `Token material never included in evidence output` in the auth-observation privacy section. |

### Section 25: Receipt URL Resolution (governing: `docs/specs/EVIDENCE-CARRIER-CONTRACT.md`)

| ID       | Status  | Follow-up                                                                                                        |
| -------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| RURL-001 | pending | Quote `Caller MUST verify: sha256(fetched_jws) == carrier.receipt_ref` in the receipt_url resolution section.    |
| RURL-002 | pending | Quote `The returned carrier is always a pure PeacEvidenceCarrier` in the middleware contract section.            |
| RURL-003 | pending | Quote `No negative caching: failed resolutions are never cached` in the caching section.                         |
| RURL-004 | pending | Quote `Resolution fails or ref mismatch: strict false (default) returned unchanged` in the failure-mode section. |

### Section 26: Supply Chain Mappings (governing: `docs/specs/SUPPLY-CHAIN-PROFILE.md`)

| ID     | Status                     | Follow-up                                                                                                                                                                        |
| ------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-001 | pending (spec file absent) | Create `docs/specs/SUPPLY-CHAIN-PROFILE.md` (or retarget to an existing in-toto profile doc) and quote `subject[0].uri -> source_ref (first subject; multi-subject uses first)`. |
| SC-003 | pending (spec file absent) | Same spec-file prerequisite; quote `Maps SLSA v1.2 provenance: slsa track/level/version fields`.                                                                                 |
| SC-004 | pending (spec file absent) | Same spec-file prerequisite; quote `Throws Error if statement._type is not in-toto v1.0`.                                                                                        |

### Section 27: Runtime Governance Records

Governing spec: `docs/specs/RUNTIME-GOVERNANCE-PROFILE.md` (present since v0.12.10 PR #639).

| ID        | Status    | Follow-up                                                                        |
| --------- | --------- | -------------------------------------------------------------------------------- |
| RTGOV-001 | annotated | Source fragment present in governing spec Section 6                              |
| RTGOV-002 | annotated | Source fragment present in governing spec Section 5                              |
| RTGOV-003 | annotated | Source fragment present in governing spec Section 4                              |
| RTGOV-004 | annotated | Source fragment present in adapter package types.ts (provider field doc)         |
| RTGOV-005 | annotated | Source fragment present in governing spec Section 7                              |
| RTGOV-006 | annotated | Source fragment present in governing spec Section 3 (Trust Observation row)      |
| RTGOV-007 | annotated | Source fragment present in governing spec Section 3 (Compliance Observation row) |

---

## Summary

- **Total non-WIRE02 IDs registered:** 32
- **Sections with existing governing spec file (need inline annotation):** 5
- **Sections with missing governing spec file (need spec + annotation):** 1 (Section 26, Supply Chain)
- **Current runtime advisories reported by `verify-registry-drift.mjs`:** 17 (some source
  fragments incidentally appear in existing governing specs; formal annotation work is
  still required for all 25 to promote spec-presence from advisory to blocking)

This ledger is not a roadmap. It is an engineering artifact that bounds the advisory
status of non-WIRE02 spec-presence checks. When every row reaches `annotated`,
`verify-registry-drift.mjs` can treat non-WIRE02 spec-presence as blocking and this file
can be removed.
