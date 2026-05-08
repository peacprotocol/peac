# Where PEAC fits

PEAC is the records layer beneath runtime governance, next to adjacent systems that define their own functions. This page draws the boundary with each of them.

For every comparison below the same sentence holds: **the other system defines the decision, execution, or settlement; PEAC standardizes the portable signed record that another party can verify offline.**

## PEAC vs logs, traces, and OpenTelemetry

Logs and traces correlate activity inside one organization's systems. They are designed for observability and debugging.

| Property              | Logs / traces / OTel                    | PEAC records                                  |
| --------------------- | --------------------------------------- | --------------------------------------------- |
| Scope                 | Local to one system                     | Portable across organizational boundaries     |
| Verifier              | Needs access to the system's log store  | Any party with the issuer's public key        |
| Authenticity          | Trust the storage system                | Ed25519 signature over canonical JWS          |
| Survives org boundary | No (unless exported, and then unsigned) | Yes                                           |
| Tamper-evident        | No                                      | Yes (signature over JCS-canonicalized claims) |

PEAC is complementary to observability, not a replacement. `receipt_ref` is emitted as an OTel span attribute so traces can point at receipts without carrying the JWS inline. Use your existing OTel / Datadog / Langfuse stack for internal visibility; add PEAC when another party needs proof.

**Boundary:** PEAC is not an observability dashboard. It does not host telemetry backends.

## PEAC vs runtime governance

Runtime governance systems decide and enforce at runtime. They say "allow this call," "deny this tool," "require approval," "sandbox this agent."

| Property          | Runtime governance (AGT, Claude Managed Agents, ACP-backed runtimes, custom harnesses) | PEAC records                                          |
| ----------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Role              | Decide and enforce                                                                     | Carry portable proof of what was decided              |
| Where it runs     | Inside the runtime                                                                     | Attached to the output that crosses a boundary        |
| Survives deletion | No (enforcement state stays with the runtime)                                          | Yes (the signed record outlives the runtime instance) |
| Replaceable       | Swap one runtime governance product for another                                        | Stays consistent across runtime governance products   |

PEAC carries the output of runtime governance. "AGT decides. PEAC records." `@peac/adapter-runtime-governance` translates governance observations (allow / deny / modify / audit / sandbox transitions / policy reference) into portable signed records.

**Boundary:** PEAC is not a governance toolkit, policy engine, or runtime control plane. Runtime governance products (Microsoft Agent Governance Toolkit, OPA / Cedar / Rego, Claude Managed Agents, OpenAI ACP-backed runtimes, custom agent harnesses) own those functions.

## PEAC vs payment rails

Payment rails authorize, settle, refund, and dispute. They carry the money.

| Property                     | Payment rails (x402, paymentauth / MPP, ACP, Stripe SPT, card networks) | PEAC records                                        |
| ---------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| Role                         | Authorize, settle, custody                                              | Carry portable observational evidence               |
| What the record says         | "This payment was authorized / captured / settled"                      | "I observed that the rail attested X at time T"     |
| Custody                      | Holds funds, manages refunds                                            | Never custodies funds                               |
| Synthesizes payment finality | Yes (the rail is the source of truth)                                   | **No** — PEAC preserves upstream artifacts verbatim |

PEAC's adapter layer (`@peac/adapter-x402`, `@peac/mappings-paymentauth` for paymentauth / MPP, `@peac/mappings-acp`, `@peac/rails-stripe`) preserves each rail's attestations verbatim and never synthesizes payment finality from non-payment artifacts. A mapper-boundary guard (`assertExplicitFinality` in `@peac/adapter-core`) blocks commerce records that attempt to imply a settled state the upstream did not claim.

**Boundary:** PEAC is not a payment protocol. It does not authorize, settle, custody, refund, or enforce scheme-specific invariants.

## PEAC vs identity protocols and trust scoring

Identity protocols issue and verify credentials. Trust-score / reputation systems aggregate signals into rankings.

| Property           | Identity / trust systems (DIDs, VCs, ERC-8004, OAuth, Entra, OIDC) | PEAC records                             |
| ------------------ | ------------------------------------------------------------------ | ---------------------------------------- |
| Role               | Issue, verify, aggregate                                           | Record what the identity system attested |
| What PEAC accepts  | `iss` in `https://` or `did:` form                                 | (same)                                   |
| What PEAC computes | Nothing trust-related                                              | (same)                                   |

PEAC's DID adapter (`@peac/adapter-did`) resolves `did:key` and `did:web` public keys for signature verification. PEAC records can feed into trust-score systems, but PEAC itself never aggregates or displays scores.

**Boundary:** PEAC is not an identity protocol, credential issuer, or trust-score / reputation system.

## PEAC vs native runtime attestations (vendor-specific export)

Some managed runtimes expose their own native attestation or audit export (Microsoft AGT evidence export, Claude Managed Agents audit JSON, OpenAI ACP runtime events).

| Property    | Native runtime attestation  | PEAC records                         |
| ----------- | --------------------------- | ------------------------------------ |
| Scope       | One runtime vendor          | Cross-runtime portable               |
| Schema      | Vendor-specific             | Open Wire (`interaction-record+jwt`) |
| Verifier    | Vendor's verifier (or none) | Any party with the issuer public key |
| Replaceable | Tied to the runtime         | Stays consistent across vendors      |

Where a native attestation exists, PEAC records its output as portable signed evidence. The adapter layer (`@peac/adapter-managed-agents`, `@peac/adapter-runtime-governance`) carries the vendor's attestation verbatim in `upstream_artifact` fields; PEAC never synthesizes semantics the vendor did not claim.

**Boundary:** PEAC does not replace native attestations. It makes them portable.

## PEAC vs CLI execution and lifecycle systems

PEAC carries CLI command-execution records and caller-reported lifecycle observation records. These are record/export surfaces, not execution, evaluation, approval, scheduling, or orchestration systems.

| Property           | CLI / lifecycle systems (Temporal, Airflow, OpenAI Evals, approval queues, shell runners, task runners) | PEAC records                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Role               | Execute, schedule, orchestrate, evaluate, approve                                                       | Carry portable signed records of what the system attested                   |
| Decision authority | The system                                                                                              | **Never PEAC**                                                              |
| PEAC response      | Carry signed observational records from those systems                                                   | Lifecycle records are observational-only; CLI evidence is non-orchestrating |

**Boundary (locked):** PEAC is not a CLI automation framework, eval platform, approval system, or orchestration / workflow engine. Those categories stay occupied by their existing players. The carrier work does not change the boundary.

## Reference

- Protocol scope: [`docs/WHAT-PEAC-STANDARDIZES.md`](WHAT-PEAC-STANDARDIZES.md).
- Compatibility table with evidence-backed adapter readiness: [`docs/COMPATIBILITY_MATRIX.md`](COMPATIBILITY_MATRIX.md).
- Normative threat model and security boundaries: [`docs/THREAT_MODEL.md`](THREAT_MODEL.md) once published.
