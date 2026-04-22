# PEAC DPIA Starter

**Status:** Deployment guidance (informative)
**Version:** 0.1
**Applies to:** Operators evaluating whether a PEAC deployment warrants a Data Protection Impact Assessment (DPIA) under UK / EU GDPR. Analogous frameworks (CCPA/CPRA risk assessments, LGPD impact reports) carry similar triggers.

---

## What PEAC does

- Offers a risk-tier starter table aligned with [ICO DPIA risk factors](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/).
- Names the PEAC-specific levers (retention class, redaction defaults,
  `no_raw_personal_data` mode, deletion hooks) that typically serve as
  mitigations in a DPIA write-up.
- Cross-references
  [DATA-CLASSIFICATION.md](DATA-CLASSIFICATION.md),
  [RETENTION-AND-DELETION.md](RETENTION-AND-DELETION.md),
  [DEPLOYMENT-ROLES.md](DEPLOYMENT-ROLES.md), and
  [DATA-SUBJECT-RIGHTS.md](DATA-SUBJECT-RIGHTS.md) so operators can
  pull each section into a DPIA narrative.

## What PEAC does not do

- PEAC does not decide whether a DPIA is mandatory. Operators apply
  their regulator's guidance and their own risk assessment.
- PEAC does not sign off on a DPIA. Legal review does.
- PEAC is not a DPIA template generator. This document is a starter,
  not a finished DPIA.

## What deployers / controllers / processors still own

- Running the DPIA process per their regulator's requirements.
- Consulting their Data Protection Officer or equivalent where
  required.
- Consulting the supervisory authority when residual risk remains
  high after mitigations ([GDPR Article 36](https://gdpr-info.eu/art-36-gdpr/) prior consultation).
- Reviewing the DPIA at each material change to the processing.

---

## 1. When a DPIA is likely required

The [UK ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/when-do-we-need-to-do-a-dpia/) names nine screening criteria; any two typically make a
DPIA mandatory, any one can. Translated to PEAC deployments:

| ICO criterion (paraphrased)                          | PEAC-relevant trigger examples                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Evaluation or scoring                                | Agent-driven decisions recorded via PEAC feeding downstream credit, hiring, access, or insurance scoring.                |
| Automated decision-making with legal effect          | Systems that use PEAC records as input to Article 22 automated decisions.                                                |
| Systematic monitoring                                | Continuous PEAC-instrumented monitoring of users' interactions with a service.                                           |
| Sensitive or highly personal data                    | Deployments where the records or derived indexes may contain special-category data (health, political, biometric, etc.). |
| Data processed on a large scale                      | High-volume verifier or hosted-verify deployments serving many distinct subjects.                                        |
| Matching or combining datasets                       | Joining PEAC records with independent datasets to re-identify or profile subjects.                                       |
| Data concerning vulnerable subjects                  | Records touching children, patients, employees with power-imbalance.                                                     |
| Innovative technological or organisational solutions | First-of-kind deployments where privacy effects are not yet well understood.                                             |
| Preventing access to a service                       | Systems where a PEAC-verified negative outcome blocks service access.                                                    |

If two or more apply, the operator SHOULD complete a DPIA. If one
applies and the residual risk is non-trivial, a DPIA is prudent.

---

## 2. Risk-tier starter

Use this as a structured starting point. The operator's specific
facts decide the final tier.

### 2.1 Low-risk deployment pattern

- Library-only shape (see [DEPLOYMENT-ROLES.md](DEPLOYMENT-ROLES.md)).
- Records do not contain personal data (subjects are service accounts
  or agents, not natural persons).
- Verifier logs redacted to protocol metadata only.
- `no_raw_personal_data` report mode on.
- Retention bounded, deletion hook wired.

Typical mitigations: keep the default verifier privacy settings;
document the data-flow; confirm annually.

### 2.2 Medium-risk deployment pattern

- Self-hosted or hosted verifier serving a moderate volume.
- Records may identify natural persons indirectly (session IDs,
  opaque actor IDs that can be joined by the operator).
- Some verifier log retention (for debugging or audit).
- Retention caps and redaction defaults set conservatively.

Typical mitigations: DPIA recommended; document lawful basis;
document retention periods; confirm rights-handling playbook covers
both evidence and derived layers (see
[DATA-SUBJECT-RIGHTS.md](DATA-SUBJECT-RIGHTS.md)).

### 2.3 High-risk deployment pattern

- Records contain clear personal data, special-category data, or
  children's data.
- Records feed automated decisions with legal or similarly
  significant effect.
- Large-scale systematic monitoring.
- Cross-border transfers without adequacy.
- Audit bundles exported to external recipients.

Typical mitigations: DPIA mandatory; consult DPO; consider Article 36
prior consultation if residual risk remains high after mitigations;
implement all available PEAC privacy defaults
(`no_raw_personal_data` mode, strict retention caps, deletion hook
integration, strict redaction of log fields); consider pseudonymising
subject identifiers at the source before they ever enter a PEAC record.

---

## 3. PEAC-specific mitigation levers

When drafting the mitigations section of a DPIA, the operator can
typically cite:

- **Data minimization on the evidence layer**: hash-by-default input
  and output capture per `docs/specs/PRIVACY-PROFILE.md`.
- **Retention caps** on the derived verifier layer.
- **Deletion hooks** on the derived verifier layer, keyed by
  `receipt_ref`.
- **Redaction defaults** on free-text or header-derived log fields.
- **`no_raw_personal_data`** report mode for public-facing or
  shared-tenant verifier deployments.
- **Pseudonymous-ID fixtures** and regression tests proving the
  verifier does not accidentally surface raw values.
- **Boundary-first operator docs** (this document set) clarifying
  what PEAC does and what stays operator-owned.

Operators SHOULD cite each mitigation with a concrete reference to a
config key, fixture path, or test path.

---

## 4. When legal review is required

- Any deployment touching special-category data.
- Any deployment feeding Article 22 automated decisions.
- Any cross-border transfer without an adequacy decision.
- Any deployment with a residual risk rating above the operator's
  risk appetite after mitigations.
- Any deployment where the lawful basis is not obvious.

When in doubt, legal review is the cheaper path than an enforcement
investigation.

---

## 5. References

- [DATA-CLASSIFICATION.md](DATA-CLASSIFICATION.md)
- [RETENTION-AND-DELETION.md](RETENTION-AND-DELETION.md)
- [DEPLOYMENT-ROLES.md](DEPLOYMENT-ROLES.md)
- [DATA-SUBJECT-RIGHTS.md](DATA-SUBJECT-RIGHTS.md)
- `docs/specs/PRIVACY-PROFILE.md`: receipt-side privacy profile.
- `docs/compliance/ISO-42001-MAPPING.md`: Clause 6.1 risk treatment
  and Clause 8 operational mapping.
- [ICO "Data Protection Impact Assessments" guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/): mandatory
  screening criteria, consultation thresholds.
- [European Data Protection Board "Guidelines on DPIA (wp248rev.01)"](https://edpb.europa.eu/our-work-tools/our-documents/guideline/guidelines-data-protection-impact-assessment-dpia-and-determining_en).
