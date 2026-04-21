# PEAC Deployment Roles

**Status:** Deployment guidance (informative)
**Version:** 0.1
**Applies to:** Operators reasoning about controller / processor posture under GDPR (and UK GDPR) when deploying PEAC.

---

## What PEAC does

- Describes the four common PEAC deployment shapes (library only,
  self-hosted verifier, managed verifier, audit-export workflow).
- Maps each shape to the surfaces it touches (issuer, verifier,
  derived caches, report store, audit bundles).
- Indicates the posture a deployer typically holds under the GDPR
  controller / processor distinction. The mapping is informational;
  the operator's specific facts decide lawful basis and posture.
- Cross-references ISO/IEC 42001:2023 Clauses 5 and 8 already mapped
  in v0.12.13 (`docs/compliance/ISO-42001-MAPPING.md`).

## What PEAC does not do

- PEAC does not determine the operator's role under GDPR. Controller
  / processor classification depends on who decides purposes and
  means of processing.
- PEAC does not decide lawful basis.
- PEAC does not generate Data Processing Agreements, Standard
  Contractual Clauses, or processor contracts.
- PEAC does not replace operator legal review.

## What deployers / controllers / processors still own

- Classifying themselves as controller, processor, or joint controller
  for each personal-data flow.
- Drafting and signing processor contracts when processing on behalf
  of another entity.
- Deciding lawful basis.
- Evaluating cross-border transfer posture and adequacy decisions.
- Documenting the decision in their internal records.

---

## 1. Deployment shapes

### Shape A: Library-only

Issuer and verifier are both libraries inside the operator's own
application. PEAC code never runs as a separate service; no third
party is involved.

- **Typical posture:** The operator acts as the single controller for
  any personal data the application processes. The operator chooses
  purposes and means. PEAC is a library the operator embedded.
- **Personal-data touchpoints:** whatever the operator chooses to
  include in the interaction record (see
  [DATA-CLASSIFICATION.md](DATA-CLASSIFICATION.md)).
- **Operator decisions that stay operator-owned:** lawful basis,
  retention period, rights handling.

### Shape B: Self-hosted reference verifier

The operator runs `surfaces/reference-verifier/` (Dockerfile /
docker-compose / Cloudflare Worker) in their own environment. The
verifier receives records from callers, verifies them, and returns
reports.

- **Typical posture:** The operator acts as controller for the
  verifier logs, derived cache, and report index (see retention
  classes in [RETENTION-AND-DELETION.md](RETENTION-AND-DELETION.md)).
  Callers who submit records continue to hold their own controller
  posture for those records.
- **Personal-data touchpoints:** verifier request logs (IP, user
  agent), derived cache entries, report index, any caller-supplied
  metadata the operator elects to persist.
- **Operator decisions that stay operator-owned:** retention windows,
  log rotation, IP masking, whether `no_raw_personal_data` report
  mode is enabled.

### Shape C: Managed verifier / hosted-verify (third-party operated)

Another party runs a hosted PEAC verifier that the operator's callers
use. The operator is the customer of the hosted service.

- **Typical posture:** The hosted operator typically acts as processor
  for data processed on the customer's behalf. A processor contract
  (DPA) is typically required. Specific posture depends on whose
  purposes are served and who chose the means.
- **Personal-data touchpoints:** same as Shape B plus any
  cross-customer aggregation the hosted operator may perform.
- **Operator decisions that stay operator-owned:** selecting a hosted
  operator with adequate contractual terms; reviewing the DPA;
  confirming the hosted operator's retention / deletion / rights
  handling aligns with the customer's obligations.

### Shape D: Audit-export / bundle workflow

The operator exports grouped records to an auditor, SCITT-style
transparency log, or internal compliance archive.

- **Typical posture:** The operator remains controller for the
  exported records. The recipient may be a processor, a joint
  controller, or an independent controller depending on the
  relationship.
- **Personal-data touchpoints:** whatever was present in the source
  records, carried forward into the bundle.
- **Operator decisions that stay operator-owned:** selection of the
  recipient, export format, retention in the recipient's environment,
  cross-border transfer posture if the recipient is in another
  jurisdiction.

---

## 2. PEAC is a records layer, not a controller service

The operator's controller / processor posture applies to the personal
data the operator chooses to carry in the record. PEAC defines the
record shape, binding semantics, and verification surface. PEAC does
not:

- decide purposes of processing,
- decide means,
- select lawful basis,
- route records to recipients,
- negotiate cross-border transfer posture.

Keep the records-layer scope in mind when assigning responsibilities
to the PEAC deployment versus the surrounding operator systems.

---

## 3. Common failure modes

- **Assuming hosted-verify removes controller obligations.** It does
  not. The customer still holds controller posture for the records
  their systems produce and submit.
- **Assuming library-only deployments remove all PEAC-side privacy
  concerns.** Verifier logs, cache, and any derived index still exist
  if the operator enabled them.
- **Treating `receipt_ref` as anonymous.** `receipt_ref` is a digest
  (pseudonymous), not an anonymisation.
  [DATA-CLASSIFICATION.md](DATA-CLASSIFICATION.md) carries this note.
- **Assuming deletion of derived indexes satisfies an evidence-layer
  deletion request.** It does not. See
  [RETENTION-AND-DELETION.md](RETENTION-AND-DELETION.md) §2.

---

## 4. References

- [DATA-CLASSIFICATION.md](DATA-CLASSIFICATION.md)
- [RETENTION-AND-DELETION.md](RETENTION-AND-DELETION.md)
- [DATA-SUBJECT-RIGHTS.md](DATA-SUBJECT-RIGHTS.md)
- [DPIA-STARTER.md](DPIA-STARTER.md)
- `docs/compliance/ISO-42001-MAPPING.md` — Clause 5 (leadership) and
  Clause 8 (operational planning) artefact mapping.
