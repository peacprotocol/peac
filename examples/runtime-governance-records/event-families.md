# Runtime Governance Event Families

Maps runtime governance concepts to PEAC interaction record families.
All records are observational: PEAC records what the runtime reported,
not what PEAC verified or enforced.

## Family taxonomy

| Family                 | Type URI                                                     | AGT Source        | What PEAC records                                 |
| ---------------------- | ------------------------------------------------------------ | ----------------- | ------------------------------------------------- |
| Policy Decision        | `org.peacprotocol/runtime-governance-policy-decision`        | PolicyDecision    | Action taken, rule matched, policy referenced     |
| Audit Entry            | `org.peacprotocol/runtime-governance-audit-entry`            | AuditEntry        | Audit log entry with Merkle chain hashes (opaque) |
| Authority Scope        | `org.peacprotocol/runtime-governance-authority-scope`        | AuthorityDecision | Scope narrowing, privilege tier assignment        |
| Lifecycle Event        | `org.peacprotocol/runtime-governance-lifecycle-event`        | LifecycleEvent    | Agent state transition                            |
| Trust Observation      | `org.peacprotocol/runtime-governance-trust-observation`      | TrustRecord       | Trust score and delta (opaque, never computed)    |
| Compliance Observation | `org.peacprotocol/runtime-governance-compliance-observation` | ComplianceReport  | Framework, score, violations (observational)      |

## What PEAC does NOT do with these records

- Enforce policies or make allow/deny decisions
- Compute, validate, or weight trust scores
- Make compliance determinations
- Verify upstream Merkle chain integrity
- Verify upstream ML-DSA-65 or SPIFFE signatures
