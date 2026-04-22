# PEAC Privacy Deployment Guidance

**Status:** Deployment guidance (informative)
**Version:** 0.1
**Applies to:** Operators of PEAC issuers, verifiers, and hosted-verify deployments.

PEAC is a records layer. This directory collects the privacy-aware
deployment guidance that sits alongside the normative receipt-side
[docs/specs/PRIVACY-PROFILE.md](../specs/PRIVACY-PROFILE.md).

Each document leads with a boundary-first block:

1. **What PEAC does** in this area.
2. **What PEAC does not do** in this area.
3. **What deployers / controllers / processors still own.**

The discipline is intentional: PEAC supports privacy-aware verification
and GDPR-aligned deployments. PEAC does not replace operator legal
review, lawful-basis decisions, or controller obligations.

## Contents

| Document                                               | Purpose                                                                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| [DATA-CLASSIFICATION.md](DATA-CLASSIFICATION.md)       | Classifies PEAC surfaces as likely personal data / pseudonymous / operator-controlled / safe-by-default / forbidden raw capture. |
| [RETENTION-AND-DELETION.md](RETENTION-AND-DELETION.md) | Retention classes, evidence-vs-derived deletion model, linked-index purge, reference-verifier privacy defaults.                  |
| [DEPLOYMENT-ROLES.md](DEPLOYMENT-ROLES.md)             | Four common deployment shapes and the controller / processor posture each typically implies.                                     |
| [DATA-SUBJECT-RIGHTS.md](DATA-SUBJECT-RIGHTS.md)       | Right-by-right handling, evidence-vs-derived split, AIPREF-is-not-consent clarification.                                         |
| [DPIA-STARTER.md](DPIA-STARTER.md)                     | Risk-tier starter, PEAC-specific mitigation levers, when legal review is required.                                               |

## Public wording in release-facing copy

Preferred phrases (privacy-aware framing):

- privacy-aware verification
- data minimization
- redaction-first handling
- retention and deletion guidance
- deployment guidance for privacy-sensitive environments
- supports GDPR-aligned deployments
- immutable signed evidence vs mutable report/index metadata

Avoid:

- "GDPR compliant", "GDPR ready", "PEAC solves GDPR"
- "compliance platform", "consent manager"
- claims that controller obligations are handled by PEAC
- framings that suggest pseudonymisation removes GDPR scope

## See also

- [docs/specs/PRIVACY-PROFILE.md](../specs/PRIVACY-PROFILE.md): normative receipt-side privacy profile.
- [docs/specs/VERIFICATION-REPORT-FORMAT.md](../specs/VERIFICATION-REPORT-FORMAT.md): verifier report shape.
- [docs/compliance/ISO-42001-MAPPING.md](../compliance/ISO-42001-MAPPING.md): ISO/IEC 42001:2023 Clause 8 operational mapping.
- [docs/compliance/EU-AI-ACT-ANNEX-IV-MAPPING.md](../compliance/EU-AI-ACT-ANNEX-IV-MAPPING.md): EU AI Act Annex IV record-keeping mapping.
- [docs/TRUST-ARTIFACTS.md](../TRUST-ARTIFACTS.md): trust-artifacts index.
