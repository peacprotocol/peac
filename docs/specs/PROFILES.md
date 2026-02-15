# PEAC Profiles Overview

Status: INFORMATIVE
Version: 0.1
Last-Updated: 2026-02-16

PEAC uses **profiles** as modular, composable specifications that layer on
top of the core receipt format. Each profile addresses a single concern and
can be adopted independently.

## Profile Categories

### Transport Profiles

Transport profiles define **how** receipts are delivered from issuer to
verifier. A receipt's verification result is identical regardless of
transport mechanism.

| Profile | Use Case                                                   | Spec                                           |
| ------- | ---------------------------------------------------------- | ---------------------------------------------- |
| Header  | Small receipts (< 4 KB) via `PEAC-Receipt` response header | [TRANSPORT-PROFILES.md](TRANSPORT-PROFILES.md) |
| Body    | Large receipts or structured JSON responses                | [TRANSPORT-PROFILES.md](TRANSPORT-PROFILES.md) |
| Pointer | Very large receipts via digest + URL indirection           | [TRANSPORT-PROFILES.md](TRANSPORT-PROFILES.md) |

### Proof Capture Profiles

Proof capture profiles define **what evidence** a receipt records about a
specific protocol or interaction type. They specify which fields appear in
the `extensions` block and how verification results map to PEAC's
three-state model (`verified` / `failed` / `unavailable`).

| Profile        | Evidence Type                       | Spec                                           |
| -------------- | ----------------------------------- | ---------------------------------------------- |
| RFC 9421 Proof | HTTP Message Signature verification | [PEAC-PROOF-RFC9421.md](PEAC-PROOF-RFC9421.md) |

### Wire Format Profiles

Wire format profiles define **integration patterns** for specific HTTP
status codes or protocol flows.

| Profile  | Integration           | Spec                                               |
| -------- | --------------------- | -------------------------------------------------- |
| HTTP 402 | Payment Required flow | [PEAC-HTTP402-PROFILE.md](PEAC-HTTP402-PROFILE.md) |

## Upcoming Categories

These categories are planned but not yet specified:

- **Policy Enforcement Profiles** -- how policy is evaluated and bound
  to receipts (see DD-49, planned for Wire 0.2)
- **Core Evidence Profiles** -- standardized evidence patterns for
  privacy, access control, toolcall coordination, and delegation
  (planned for v0.12.1)

## Design Principles

1. **Independence** -- each profile is self-contained with its own
   version. Adopting one profile does not require adopting others.
2. **Verification equivalence** -- transport profiles must not affect
   verification outcomes.
3. **Extension-based** -- proof capture profiles use the
   `extensions` block with reverse-DNS keys
   (e.g., `org.peacprotocol/rfc9421-proof@0.1`).
4. **Three-state results** -- all proof capture profiles map to
   `verified` / `failed` / `unavailable` (per DD-49).
