# PEAC Data Classification for Deployers

**Status:** Deployment guidance (informative)
**Version:** 0.1
**Applies to:** Operators running PEAC issuers, verifiers, hosted-verify deployments, and reference integrations. Complements the normative receipt-side `docs/specs/PRIVACY-PROFILE.md`.

---

## What PEAC does

PEAC is a records layer. Issuers produce compact JWS interaction records;
verifiers parse and verify those records plus their supporting bindings
(policy, terms, referenced documents). PEAC provides:

- minimal, deterministic record shapes,
- hash-by-default discipline for interaction evidence,
- three-state binding semantics for policy and referenced documents,
- narrow verifier defaults that favor data minimization, and
- this classification table so deployers can reason about which PEAC
  surfaces may hold personal data in their environment.

## What PEAC does not do

- PEAC does not determine what is "personal data" in a specific
  jurisdiction. The classification below uses general privacy-engineering
  categories. Legal scope decisions belong to the operator.
- PEAC does not scan operator-supplied content. Fields carrying
  arbitrary operator or caller content are marked and left to the
  operator.
- PEAC does not decide lawful basis, consent, or retention obligations
  on the operator's behalf.
- PEAC does not claim that pseudonymisation removes GDPR (or equivalent)
  scope. Pseudonymised data may still be personal data.

## What deployers / controllers / processors still own

- Identifying which PEAC fields contain personal data in their
  deployment, which may differ from the general categories below.
- Applying lawful-basis, consent, DPIA, and retention decisions.
- Configuring verifier privacy defaults (retention caps, redaction,
  `no_raw_personal_data` mode, deletion hooks) to match their posture.
- Auditing operator-controlled content for accidental inclusion of
  regulated data.

---

## 1. Classification table

Each row classifies a PEAC surface into one of five buckets. Operators
SHOULD verify the classification against their own deployment.

| Bucket                           | Examples of PEAC surfaces                                                                                                                  | Notes                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Likely personal data             | Interaction-record `sub` when it names a natural person; caller-supplied `actor.id` when tied to a natural person; verifier request logs   | Treat as personal data by default. Apply lawful-basis, retention, and rights decisions.                                                                          |
| Pseudonymous but in-scope        | `receipt_ref` (SHA-256 of JWS); hashed actor IDs; opaque session IDs; derived index keys in the verifier cache                             | Still personal data in many jurisdictions because the original subject is re-identifiable by combining with other data the operator holds. ICO pseudonymisation. |
| Operator-controlled arbitrary    | Extension payloads populated by the issuer (`evidence.*` verbatim blobs, commerce `description`, free-text headers captured into metadata) | PEAC does not inspect these. Operator owns classification and redaction.                                                                                         |
| Safe-by-default logging/export   | Protocol metadata (`typ`, `alg`, `kid`, wire version); verifier outcome (`verified`, status codes); three-state binding values             | Not personal data on their own. May become sensitive in aggregate (timing, frequency) depending on deployment.                                                   |
| Forbidden-by-default raw capture | Raw credentials, tokens, JWTs, cookies, private keys, encryption keys; raw PII (SSN, card numbers); medical data; children's personal data | Never captured by a compliant issuer. Reference verifier defaults reject these patterns; see `docs/specs/PRIVACY-PROFILE.md` §4.                                 |

---

## 2. Reminders for specific field families

- `receipt_ref` is a SHA-256 digest of the signed JWS. A digest is
  pseudonymous, not anonymous. An operator holding the original JWS can
  always re-derive the mapping.
- `sub` can legitimately carry non-personal identifiers (service
  accounts, agent IDs). The classification depends on what the operator
  chose.
- Verifier request logs and the derived verifier cache may carry the
  caller's IP, user agent, and timing. These are operator-side logs and
  fall under the verifier privacy defaults, not PEAC's wire format.
- Commerce and x402 `terms` extensions may carry description strings or
  URIs that reference third-party documents. The operator owns
  classification of that content.

---

## 3. Using this table in a DPIA

Start from the "Likely personal data" and "Pseudonymous but in-scope"
rows. For each, identify:

- the lawful basis in your jurisdiction,
- retention class and purge path (see
  [RETENTION-AND-DELETION.md](RETENTION-AND-DELETION.md)),
- rights workflow (see
  [DATA-SUBJECT-RIGHTS.md](DATA-SUBJECT-RIGHTS.md)),
- controller / processor posture (see
  [DEPLOYMENT-ROLES.md](DEPLOYMENT-ROLES.md)), and
- risk tier and required mitigations
  (see [DPIA-STARTER.md](DPIA-STARTER.md)).

---

## 4. References

- `docs/specs/PRIVACY-PROFILE.md` — normative receipt-side privacy
  profile (Minimization / Hash-by-default / No secrets / Explicit
  consent for verbatim / Bounded retention).
- `docs/specs/VERIFICATION-REPORT-FORMAT.md` — verifier report shape;
  `bindings` is report-only and may carry binding references.
- ICO, "Pseudonymisation" guidance — online identifiers and
  pseudonymised data can still be personal data.
- European Commission, "Data protection by design and by default" —
  establishes the principle this document operationalises.
