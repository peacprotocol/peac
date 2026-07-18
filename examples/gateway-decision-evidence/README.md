# Gateway Decision Evidence

A deployment operator that runs a gateway decision boundary issues a portable
signed record for a terminal gateway access decision, abstains for every
non-terminal state, and a relying party verifies the record offline.

This example uses only the shipped `org.peacprotocol/access-decision` record type
and the registered `org.peacprotocol/access` extension. It introduces no new
record type, extension group, schema field, registry entry, wire field, or
canonicalization.

## What it demonstrates

- **Terminal issuance** for all three registered decisions (`allow`, `deny`,
  `review`), populated truthfully from the boundary: `resource` from the
  evaluated target, `action` from the requested or evaluated operation, and
  `decision` from the terminal outcome.
- **Mandatory non-issuance (abstention)** for every state that is not a terminal
  access decision: a check-only outcome, an intermediate decision where retry or
  fallback is still possible, a terminal-labelled event that does not explicitly
  establish `retryOrFallbackPossible === false`, a handling-action-only event
  (`log`/`retry`/`fallback`/`continue`/`transform`), a third-party-report-only
  event, and missing or unsupported access context.
- **Profile-aware offline verification under an explicit relying-party policy.**
  Signature validity alone is not sufficient. The MANDATORY structural checks are
  always applied: the expected record kind (`evidence`), the type
  `org.peacprotocol/access-decision`, the `access` pillar, a valid
  `org.peacprotocol/access` extension, the correct issuer, and a valid signature.
  In addition the policy MAY require the expected `kid` (only when the relying
  party configures one) and MAY reject records that produce a verification
  warning. Rejecting on any warning is a conservative, example-local choice, NOT
  a PEAC or GDE requirement: the profile permits application-specific extensions,
  which generic verification preserves as application data with an informational
  warning. This example sets `rejectWarnings: true` to show a conservative
  relying-party policy; the default policy preserves the record and surfaces its
  warnings for application-aware handling.
- **Three distinct trust failures**: a tampered payload
  (`E_INVALID_SIGNATURE`); a cryptographically valid record from a signer the
  relying party does not accept, even though it claims the expected issuer
  (`E_INVALID_SIGNATURE`); and a valid record from an unexpected issuer
  (`E_INVALID_ISSUER`).

## Domain modelling

`GatewayBoundaryObservation` is a discriminated union whose `terminal` variant
requires `resource`, `action`, `decision`, and `retryOrFallbackPossible: false`,
so established terminality is a type-level invariant. `TerminalGatewayAccessDecision`
is that variant. Impossible states, such as a check that also carries a decision,
are not representable. Untrusted adapter input arrives as `unknown` and is
narrowed at the boundary (`parseGatewayBoundaryEvent`); a claim of terminality
that does not explicitly establish `retryOrFallbackPossible === false` does not
narrow to the terminal variant. Terminality is then preserved through issuance:
`issueTerminalAccessDecision` accepts only a `TerminalGatewayAccessDecision`, so a
bare `{ resource, action, decision }` object cannot be issued.

## Trust boundary

`parseGatewayBoundaryEvent` validates event shape and the explicit terminality
claim only. It does not establish that the event originated at a gateway decision
boundary under the issuer's control. A deployment must establish that the parsed
observation originated at such a boundary before calling the issuance helper.
Passing shape validation is not evidence of issuer control, authority, or
terminality beyond the explicit claim.

## Occurrence time

This example does not set `occurred_at`. A production gateway may populate the
optional `occurred_at` from a trusted boundary timestamp under Wire 0.2, in which
case it becomes the record's `occurred_at`. The issuer must never manufacture an
event time to satisfy verification, so the synthetic boundary here, which has no
wall clock to assert, omits it (the field is optional).

## What it does not demonstrate

- policy evaluation correctness, or that the decision itself was correct;
- execution of the decision, or completeness of event capture;
- deployment provenance, issuer role, assertion basis, or a named upstream
  source (none of these are part of this example or of the public profile);
- a vendor integration, or the runtime that makes or enforces the decision.

A signature establishes record integrity and possession of the signing key.
Association of that key with a claimed issuer, and acceptance of that issuer for
a deployment context, are configured trust-policy decisions, not properties of
the record.

## Run

```bash
pnpm demo               # issue terminal allow/deny/review, show abstentions, verify offline
pnpm demo:tamper        # three trust failures: tampered payload, unaccepted signer, unexpected issuer
pnpm demo:show-record   # print the decoded record header and payload
pnpm test               # run the assertion battery (node:test)
```

See also `docs/specs/GATEWAY-DECISION-EVIDENCE.md` for the informative profile.
