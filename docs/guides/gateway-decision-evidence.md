# Gateway decision evidence guide

> **Status:** Informative.

This guide applies PEAC's existing access-decision surfaces to terminal gateway
decisions: how to issue and verify a portable signed record of a terminal
gateway access decision using surfaces that already ship in this repository. It
adds no new protocol, schema, registry, wire, or package surface; it uses the
existing `org.peacprotocol/access-decision` record and the registered
`org.peacprotocol/access` extension.

The [Gateway Decision Evidence Profile](../specs/GATEWAY-DECISION-EVIDENCE.md) is
the primary informative reference for this composition pattern, and this guide is
its integrator-facing companion, alongside the runnable
[`examples/gateway-decision-evidence/`](../../examples/gateway-decision-evidence/)
example. Normative requirements remain in the linked PEAC specifications and
registries.

If this guide and the profile differ, follow the profile's composition guidance;
the normative specifications and registries govern protocol requirements.

## When to use this guide

Use it when you operate a gateway decision boundary (for example an API gateway
or an AI gateway) and want a portable signed record of a **terminal access
decision** that the gateway reached, so a relying party can verify it offline
with the issuer's public key and a configured expected-issuer policy.

Do not use this access-decision composition to represent check results, retries,
fallbacks, logging, or other handling behavior. Other PEAC profiles may represent
applicable lifecycle or operational observations, but those values must not be
coerced into an access decision.

## What the record is, and is not

A gateway decision evidence record is an issuer-signed statement that a terminal
access decision (`allow`, `deny`, or `review`) was produced within a gateway
decision boundary under the issuer's control. It preserves what the issuer
observed, not an independently established fact.

It does not prove the decision was correct, that it was enforced, that the
represented event actually occurred, or that the issuer is authorized for any
deployment. A signature establishes record integrity and possession of the
signing key, not issuer legitimacy or authorization. See
[Non-claims](#non-claims-and-limitations).

## When to issue, and when to abstain

Issue an `org.peacprotocol/access-decision` record only when every precondition
below holds; otherwise the correct behavior is to issue nothing, not to issue a
weaker or inferred decision.

| Situation                                                                                              | Action  | Why                                          |
| ------------------------------------------------------------------------------------------------------ | ------- | -------------------------------------------- |
| Terminal `allow`/`deny`/`review`, with a truthful `resource` and `action`                              | Issue   | A terminal decision the issuer can populate  |
| A check outcome only (a processed check is not a decision)                                             | Abstain | A check result is not an access decision     |
| Intermediate: retry or fallback is still possible                                                      | Abstain | Terminality is not established               |
| Terminality cannot be established: retry, fallback, or further processing may still change the outcome | Abstain | The represented decision is not terminal     |
| Handling action only (log, retry, fallback, continue, transform)                                       | Abstain | Lifecycle behavior is not an access decision |
| Third-party report only; no issuer-controlled gateway observation                                      | Abstain | Out of profile for the core composition      |
| `resource`, `action`, or `decision` cannot be truthfully populated                                     | Abstain | The `access` extension requires all three    |

The three access fields are schema-required. If any of them cannot be truthfully
populated from the issuer-controlled decision context, do not issue the record.
See profile Sections
[5](../specs/GATEWAY-DECISION-EVIDENCE.md#5-terminal-decision-issuance-preconditions)
and
[6](../specs/GATEWAY-DECISION-EVIDENCE.md#6-mandatory-non-issuance-conditions).

`review` is a terminal handoff to another decision process, not indecision: it
is issuable, while an unresolved or still-processing state is not.

## Issue a terminal access decision

The example models this as three steps: narrow an untrusted boundary event,
classify it, and issue only for a terminal decision. It reuses the shipped
`issue()` and the registered `org.peacprotocol/access` extension.

The names in this section are local to the runnable example.
`parseGatewayBoundaryEvent`, `toAccessDecision`, `TerminalGatewayAccessDecision`,
`issueTerminalAccessDecision`, `GatewayVerificationPolicy`, and `rejectWarnings`
are example-local adapter types and helpers, not PEAC wire fields, registered
schema fields, `@peac/protocol` exports, or standardized gateway APIs. In
particular, `retryOrFallbackPossible` is an example adapter-input field, not a
PEAC wire claim, registered schema field, or standardized gateway API. Other
deployments may establish terminality from their own boundary state, provided
they do so before issuance and do not infer it from a check result or handling
action.

1. **Narrow the boundary event.** `parseGatewayBoundaryEvent(raw: unknown)`
   validates event shape and the explicit terminality claim only. It accepts a
   terminal event only when `retryOrFallbackPossible` is exactly `false`.
2. **Classify.** `toAccessDecision(observation)` returns an issuable
   `TerminalGatewayAccessDecision` for a terminal observation, or a reason to
   abstain for every other variant.
3. **Issue.** `issueTerminalAccessDecision({ issuer, privateKey, kid, terminal })`
   accepts only a `TerminalGatewayAccessDecision`, at both the TypeScript type
   and a runtime guard, so a bare `{ resource, action, decision }` object cannot
   be issued. It signs an `org.peacprotocol/access-decision` record whose
   `org.peacprotocol/access` extension carries `resource`, `action`, and
   `decision`.

Run it end to end:

```bash
pnpm --filter @peac/example-gateway-decision-evidence demo
pnpm --filter @peac/example-gateway-decision-evidence demo:tamper
```

The full, offline-verifiable implementation is
[`examples/gateway-decision-evidence/demo.ts`](../../examples/gateway-decision-evidence/demo.ts).

### Issuer-controlled observation

Shape validation does not establish provenance. The decision must have been
produced within a gateway decision boundary under the issuer's control, and the
deployment must establish that provenance before the issuance path. Passing a
shape check is not evidence of issuer control. A record whose decision came only
from a third-party report is out of profile.

The signing key may be held by the gateway process or by a constrained signing
service acting for the issuer; issuance and signing remain inside the deployment
trust boundary.

## Verify under an explicit issuer/key policy

Verification uses the existing PEAC verification path plus the relying
application's configured trust policy. In the example, `verifyGatewayDecision`
takes a `GatewayVerificationPolicy`:

- **Signature and issuer (always).** Verify the signature and the expected
  issuer with the shipped verifier. This establishes record integrity and
  possession of the signing key, not issuer authorization.
- **Record shape (always).** Require the expected record kind (`evidence`), the
  type `org.peacprotocol/access-decision`, the `access` pillar, and a valid
  `org.peacprotocol/access` extension.
- **Key pinning (when configured).** Enforce an expected `kid` only when the
  relying application pins one. A trust pin may omit `kid`; the example enforces
  an expected `kid` only when the relying-party policy configures one
  ([Trust Pinning Policy](../specs/TRUST-PINNING-POLICY.md) Sections 6 and 7).
- **Warning policy (application choice).** PEAC preserves well-formed unknown
  extensions with an informational warning and treats them as application data.
  Rejecting on any warning is a conservative, application-local policy, not a
  PEAC or profile requirement. The example exposes this as an opt-in
  `rejectWarnings` flag.

The relying application supplies the expected gateway or deployment context out
of band and maps it to configured issuer-acceptance and, when applicable,
key-pinning policy. The core access-decision record does not identify a gateway
deployment, an issuer role, or a named upstream source; do not infer any of
those from the bare record.

Three distinct verification failures are worth testing, and the example does:

- a tampered payload fails signature verification (`E_INVALID_SIGNATURE`);
- a record signed by an unaccepted key fails when checked against the relying
  party's configured accepted public key (`E_INVALID_SIGNATURE`);
- a cryptographically valid record carrying an unexpected issuer fails the
  configured issuer policy (`E_INVALID_ISSUER`).

In the example wrapper, malformed inputs retain the verifier's canonical codes
(for example `E_INVALID_FORMAT`), while an unexpected exception outside the typed
verifier-result contract is mapped to `E_INTERNAL`.

## Data minimization

The record carries the required decision context (`resource`, `action`,
`decision`) and, when present, an issuer-observed occurrence time. The core
gateway-decision composition neither requires nor inlines the request or response
content that was evaluated, nor raw prompt, completion, policy, request, or
response bodies. `occurred_at` is optional and, when present, describes the
observed decision time; an issuer must never fabricate it. Deployments and any
application-specific extensions remain subject to the
[Privacy Profile](../specs/PRIVACY-PROFILE.md).

## Deployment and privacy checklist

- Establish the issuer-controlled gateway boundary before issuance. Shape
  validation alone does not establish provenance.
- Prefer issuance in the gateway process or through a constrained internal
  signing service. Raw request or response bodies need not leave the deployment
  boundary solely for signing.
- Do not place private keys, API keys, bearer tokens, cookies, authorization
  headers, credentials, raw prompts or completions, complete request or response
  bodies, full policy documents, or unnecessary personal data in the record.
- Omit optional context rather than guessing or copying it indiscriminately.
- When `occurred_at` is supplied, use the time the represented decision became
  terminal at the boundary, not a later signing time. Omit it when that time
  cannot be established.
- Application-specific digests or references should be computed within the
  deployment boundary. A plain digest is not confidentiality protection for
  predictable or low-entropy content; apply the
  [Privacy Profile](../specs/PRIVACY-PROFILE.md) and the repository's
  [document-binding guidance](../specs/DOCUMENT-BINDING.md).

## Correlation and telemetry

A deployment may correlate a gateway decision record with an existing workflow,
trace, or parent reference using PEAC's existing correlation surfaces. W3C Trace
Context and OpenTelemetry identifiers are correlation carriers only: they do not
establish issuer authority, decision correctness, occurrence, or PEAC finality.

See
[Correlating PEAC records with OpenTelemetry traces](telemetry-otel-correlation.md).

## Application-specific provenance

This profile standardizes no assertion-basis field, issuer-role field,
upstream-source provenance, deployment identifier, terminality field, or
content-commitment encoding. Applications that need such data define it under
their own extension namespace; generic PEAC verification treats it as
application data, and its presence is not a PEAC conformance signal. This profile
registers no gateway-decision extension and standardizes no application-specific
JSON shape.

## Non-claims and limitations

Successful verification establishes the integrity of the signed record and
possession of the corresponding signing key. The record states that the issuer
reports a terminal gateway access decision; it does not independently establish:

- that the decision was correct, fair, or complete;
- that the decision was enforced or executed;
- that the represented event actually occurred, or occurred as described;
- issuer legitimacy, or that the issuer is authorized for a deployment context
  (these are configured trust-policy decisions, established out of band);
- any decision, role, deployment, or upstream source beyond the signed
  `resource`, `action`, and `decision`.

See profile Section
[14](../specs/GATEWAY-DECISION-EVIDENCE.md#14-limitations-non-claims-and-interoperability).

## Related specifications and examples

- [Gateway Decision Evidence Profile](../specs/GATEWAY-DECISION-EVIDENCE.md) (informative profile)
- [`examples/gateway-decision-evidence/`](../../examples/gateway-decision-evidence/) (runnable)
- [Access Profile](../profiles/access.md)
- [Trust Pinning Policy](../specs/TRUST-PINNING-POLICY.md)
- [Privacy Profile](../specs/PRIVACY-PROFILE.md)
- [Document Binding](../specs/DOCUMENT-BINDING.md)
- [Gateway Issuance Recipes](../specs/GATEWAY-ISSUANCE-RECIPES.md)
- [Correlating PEAC records with OpenTelemetry traces](telemetry-otel-correlation.md)
