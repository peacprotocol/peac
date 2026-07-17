# Gateway Decision Evidence Profile

**Status:** Informative
**Since:** v0.16.3

This document adds no normative requirement to the wire format and no field to
any record. It does not register a new receipt type, extension group, registry
entry, error code, or conformance requirement. It describes how PEAC's existing
`org.peacprotocol/access-decision` record composes to carry evidence for a
terminal gateway access decision produced within an issuer-controlled gateway
decision boundary, and, equally important, when no access-decision record is
issued for a gateway observation. The semantics it defines are protocol-neutral
and reuse existing
PEAC primitives.

Lowercase requirement words in this informative profile describe composition
guidance. Normative requirements remain those of the linked PEAC specifications.

## 1. Status and scope

This profile is informative. It reuses and cites existing normative rules rather
than restating them as new conformance requirements.

A gateway is a component that evaluates a request at a defined decision boundary
before the request proceeds, is blocked, or is handed to another decision
workflow (for example an API gateway, a model gateway, an MCP server acting as
a policy or decision point, or a service-mesh policy point).

**In scope:**

- Recording a terminal gateway access decision (`allow`, `deny`, or `review`)
  produced within an issuer-controlled gateway decision boundary, as an existing
  `org.peacprotocol/access-decision` record.
- The conditions under which no access-decision record is issued for a gateway
  observation.
- The distinction between a check outcome, an access decision, and a handling
  action.

**Out of scope:**

- Named upstream reporting. A collector that only received a third-party report
  of a decision made outside its own gateway boundary does not issue a bare
  access-decision record under this core profile (see Section 9); the bare
  record cannot distinguish an issuer-controlled observation from a relayed
  report.
- Making, authorizing, enforcing, retrying, routing, or governing the gateway
  decision. The gateway or associated runtime produces the decision; PEAC
  records signed evidence of what was decided in a form a third party can
  cryptographically validate and evaluate under its configured issuer and key
  policy.
- Any new registered extension, receipt type, wire field, schema, package, CLI
  surface, error namespace, conformance identifier, or API export.
- Vendor-specific gateway integration. Concrete adapters are out of scope for
  this document.

## 2. Existing normative dependencies

This profile composes the following shipped surfaces and defers to them for all
normative behavior:

- The `org.peacprotocol/access` extension group and the
  `org.peacprotocol/access-decision` receipt type
  ([access profile](../profiles/access.md)), whose three fields `resource`,
  `action`, and `decision` are all schema-required, with `decision` constrained
  to `allow`, `deny`, or `review`.
- Gateway issuer constraints, in particular the rule that a gateway issuer must
  not assert facts it did not observe, and the pattern of a bounded signing
  request to an internal signer
  ([GATEWAY-ISSUANCE-RECIPES.md](GATEWAY-ISSUANCE-RECIPES.md) Sections 3.1, 4.1,
  and 5.2).
- The verifier trust model: a valid signature establishes record integrity and
  possession of the corresponding signing key, not issuer legitimacy or
  authorization; issuer acceptance, allowlisting, and key pinning are configured
  verifier policy
  ([TRUST-PINNING-POLICY.md](TRUST-PINNING-POLICY.md) Sections 3.2, 3.3, 6,
  and 7).
- The no-inline-value invariant for lifecycle observations
  ([LIFECYCLE-OBSERVATION-PROFILE.md](LIFECYCLE-OBSERVATION-PROFILE.md)
  Section 6), which this profile references to draw the boundary between an
  access decision and a lifecycle observation (a record about a system that
  decided elsewhere).
- Data minimization and redaction ([PRIVACY-PROFILE.md](PRIVACY-PROFILE.md)).

## 3. Terminology

- **Gateway decision evidence**: a signed record that represents evidence of a
  terminal gateway access decision produced within an issuer-controlled gateway
  decision boundary.
- **Gateway decision boundary**: the point at which the gateway completes the
  decision represented by the record, before the request proceeds, is blocked,
  or is handed to another decision workflow.
- **Issuer-controlled gateway observation**: the represented decision was
  produced within a gateway decision boundary operated under the issuer's
  control. Signing may occur in the gateway process or through a constrained
  signing service operating within the same issuer trust boundary.
- **Check outcome**: the result of a policy, filter, or validation check
  (`passed`, `failed`, `error`). A check outcome is an input to a decision, not
  a decision.
- **Access decision**: the decision emitted at the represented gateway decision
  boundary, using the registered vocabulary `allow`, `deny`, or `review`.
- **Handling action**: how a gateway processes a request as a consequence of a
  check or decision (for example retry, fallback, log, transform, continue,
  block). A handling action describes lifecycle behavior and never itself
  constitutes an access decision.
- **Terminal**: the gateway has completed the decision process represented by
  the record. No retry, fallback, or further processing within that gateway
  decision boundary can change the emitted decision.

`allow` and `deny` represent the gateway's disposition at that boundary.
`review` represents a terminal handoff from that boundary to a separate review
authority (a deferred outcome; see [access profile](../profiles/access.md)); it
does not represent the eventual resource-access outcome. A later outcome does
not retroactively alter the earlier `review` record; where correlation data is
available, applications may correlate the later outcome as a separate record.

Named upstream reporting (a collector signing a decision it received from a
distinct source) is out of scope for this core profile; see Section 9.

## 4. Check outcomes, access decisions, and handling actions

These three concepts are frequently conflated in gateway telemetry. They are
distinct, and only one of them may populate the `decision` field of an
`org.peacprotocol/access` extension.

| Concept         | Example values                                               | May populate the access `decision` field? |
| --------------- | ------------------------------------------------------------ | ----------------------------------------- |
| Check outcome   | `passed`, `failed`, `error`                                  | No                                        |
| Access decision | `allow`, `deny`, `review`                                    | Yes, only when terminal                   |
| Handling action | `retry`, `fallback`, `log`, `transform`, `continue`, `block` | No                                        |

A failed check does not, by itself, establish a denial: the gateway may
continue, retry, fall back, hand off for review, or separately reach a terminal
denial. A passed check does not, by itself, establish an allow decision. A check
outcome alone never populates the access `decision` field; only a separately
reached terminal access decision may. The registered access vocabulary is exactly
`allow`, `deny`, `review`; this profile introduces no fourth value and does not
repurpose a handling action as a decision.

## 5. Terminal-decision issuance preconditions

An `org.peacprotocol/access-decision` record is issued for a gateway observation
only when all of the following hold:

- The outcome is **terminal** for the gateway decision boundary: no retry,
  fallback, or further processing within that boundary can change the emitted
  decision.
- The issuer can truthfully populate `resource` from the evaluated target.
- The issuer can truthfully populate `action` from the requested or evaluated
  operation.
- The **decision** is one of `allow`, `deny`, `review`, drawn from the observed
  outcome and not derived from a check outcome or a handling action.
- The decision was produced within a gateway decision boundary under the
  issuer's control (issuer-controlled observation).

When every precondition holds, the record represents signed evidence of the
decision the gateway reached. The issuer does not add claims it did not observe
([GATEWAY-ISSUANCE-RECIPES.md](GATEWAY-ISSUANCE-RECIPES.md) Section 3.1).

## 6. Mandatory non-issuance conditions

An access-decision record is not issued for a gateway observation when any of
the following is true. In these cases the correct behavior is not to issue the
record, rather than to issue a weaker or inferred decision.

- Only a check outcome is known.
- A retry remains possible within the gateway decision boundary.
- A fallback remains possible within the gateway decision boundary.
- The gateway has not completed the decision represented by the record.
- The `resource`, `action`, or `decision` field cannot be truthfully populated
  from the issuer-controlled observation (the schema requires all three; see
  Section 13).
- Terminality cannot be established.
- The decision was not produced within an issuer-controlled gateway decision
  boundary (only a third-party report is available).
- The input describes only lifecycle or handling behavior.

Declining to issue the record is deliberate, not a limitation: it prevents a
failed policy check, an intermediate block that a fallback later reverses, or a
logging event from being recorded as a portable denial.

## 7. Mapping to the existing access-decision record

A qualifying observation maps to the shipped record with no new surface:

- **Receipt type**: `org.peacprotocol/access-decision`.
- **Kind**: `evidence`.
- **Extension**: `org.peacprotocol/access` with the three required fields
  populated so that `resource` comes from the evaluated target, `action` from
  the requested or evaluated operation, and `decision` from the terminal gateway
  outcome ([access profile](../profiles/access.md)). Their presence does not
  prove whether the operation was executed, completed, or
  prevented.
- **Occurrence time**: the time the gateway decision represented by the record
  became terminal at the issuer-controlled decision boundary, as supplied by
  that boundary (the record's optional `occurred_at`, "when the interaction
  occurred"; [WIRE-0.2.md](WIRE-0.2.md) Section 9). It is not the time a signing
  service later signed the record.
- **Correlation**: workflow, trace, or parent references, when present, use the
  existing correlation extension (for example to correlate a later
  review-authority decision with an earlier `review` record).

An access-decision record represents signed evidence of the decision. It is not
the decision itself and does not make or enforce it. It is not a lifecycle
observation, where inline decision values are forbidden
([LIFECYCLE-OBSERVATION-PROFILE.md](LIFECYCLE-OBSERVATION-PROFILE.md) Section 6,
`lifecycle.inline_value_blocked`); a lifecycle observation is a record about a
system that decided elsewhere, and nothing in this profile relaxes that
invariant.

## 8. `review` as a terminal handoff, not indecision

`review` is terminal for the gateway's current decision boundary when the
request has been handed to a separate review authority or workflow (for example
a human-approval queue or an escalation workflow). It is not a claim that the
eventual end-to-end resource-access outcome is final: the review authority may
later allow or deny. A later outcome does not retroactively alter the earlier
`review` record; where correlation data is available, applications may correlate
the later outcome as a separate record (Section 7). `review` does not mean that
the gateway is still deciding, that a check is pending, or that processing within
the gateway decision boundary has not completed. A gateway that has not completed
its decision is non-terminal and falls under Section 6.

## 9. Issuer-controlled observation and out-of-profile upstream reporting

Under this profile, the represented decision was produced within an
issuer-controlled gateway decision boundary. A collector that only received a
third-party report of a decision made outside its own boundary does not issue a
bare access-decision record under the core profile.

The bare `org.peacprotocol/access-decision` record does not carry an assertion
basis, an issuer role, or a named upstream source. A verifier cannot discover
those from the record body, so a bare record signed by a collector relaying a
report would be indistinguishable from an issuer-controlled observation. That is
why the core profile is limited to issuer-controlled observation: whether the
signing issuer is authorized for the deployment context is a configured policy
decision (Section 11), read from policy, not from the record.

An application may represent named upstream reporting through an
application-specific extension that explicitly binds the assertion basis and
source identity. Such encoding is not standardized by this profile (see
Section 12) and requires application-aware verifier policy.

## 10. Signature integrity versus issuer authorization

Signature verification establishes record integrity and possession of the
corresponding signing key. Per
[TRUST-PINNING-POLICY.md](TRUST-PINNING-POLICY.md) Sections 3.2 and 3.3, that
does not establish issuer legitimacy or authorization. Association of that key
with the claimed issuer, and authorization of that issuer for the relying
application's deployment context, are established by the relying application's
configured trust policy (Section 11), not by the signature alone. A valid
signature does not prove that the decision was correct or that the deployment
was configured as claimed.

## 11. Verification-policy requirements

A verifier consuming gateway decision evidence relies on the existing PEAC
verification surfaces and the relying application's configured trust policy:

- Verify the signature and the record's structural validity with the existing
  verification path. This establishes record integrity and possession of the
  signing key, not issuer authorization.
- Apply the relying application's configured expected-issuer policy and, where
  that policy requires it, key pinning
  ([TRUST-PINNING-POLICY.md](TRUST-PINNING-POLICY.md) Sections 6 and 7).
  Allowlisting and pins are configurable policy, not unconditional requirements.
- Associate the signing key with a claimed issuer, and decide whether that issuer
  is authorized, through the configured trust policy. A cryptographically valid
  record that fails the configured issuer or key policy is not authorized for
  that use.
- The relying application supplies the expected gateway or deployment context
  out of band and maps that context to accepted issuer and key policy. The core
  access-decision record does not identify a gateway deployment.
- Do not infer an issuer role or a named upstream source from the bare record;
  it carries neither.

This profile adds no verifier primitive, verification mode, or trust-policy
field.

## 12. Application-specific provenance (not defined by this profile)

This profile does not define assertion-basis fields, issuer-role fields,
upstream-source provenance, deployment identifiers, terminality fields, or
commitment or content-binding encoding. Applications may define such data under
their own extension namespace. Application-specific content binding is outside
this profile; implementations that need it should follow PEAC's existing
document-binding and privacy specifications. Generic PEAC verification treats
application-specific fields as application data; application-aware policy is
required to interpret them, and their presence is not a PEAC conformance signal.
PEAC v0.16.3 does not register a gateway-decision extension or standardize an
application-specific JSON shape.

## 13. Data minimization and security considerations

- The three access fields `resource`, `action`, and `decision` are all
  schema-required. If any required access field cannot be truthfully populated
  from the issuer-controlled decision context, the issuer does not issue the
  access-decision record (Section 6). Optional context is omitted rather than
  guessed.
- Issuance and signing remain inside the deployment trust boundary. The signing
  key may be held by the gateway process or by a constrained signing service
  acting for the issuer; raw request and response bodies need not cross the
  boundary solely for signing.
- This profile does not inline raw prompt, completion, policy, request, or
  response bodies. Deployments and application-specific extensions remain
  subject to the Privacy Profile ([PRIVACY-PROFILE.md](PRIVACY-PROFILE.md)).
- The record carries the required decision context (`resource`, `action`,
  `decision`) and, when present, occurrence time. It does not carry the content
  that was evaluated.
- A gateway issuer does not assert facts it did not observe
  ([GATEWAY-ISSUANCE-RECIPES.md](GATEWAY-ISSUANCE-RECIPES.md) Section 3.1).
- Private signing keys are protected according to
  [GATEWAY-ISSUANCE-RECIPES.md](GATEWAY-ISSUANCE-RECIPES.md) Section 5.
  Deployments may protect the key as an edge secret or use a constrained
  internal signing service.

## 14. Limitations, non-claims, and interoperability

A gateway decision evidence record is an issuer-signed statement representing a
terminal gateway decision produced within an issuer-controlled gateway decision
boundary. Signature verification establishes record integrity and possession of
the corresponding signing key; association of that key with the claimed issuer,
and authorization of that issuer for a deployment context, are established by the
relying application's configured trust policy, out of band.

The record does not prove that the observed event was complete, objectively
correct, or fair, that the gateway behaved correctly, or that no relevant event
was omitted. PEAC records signed evidence of the decision; it does not make,
authorize, enforce, retry, route, or govern it.

For interoperability, gateway decision evidence is an ordinary
`org.peacprotocol/access-decision` record. A conforming PEAC verifier that
supports Wire 0.2 and the registered access extension can cryptographically
validate the record's signature and structure and evaluate it under its
configured issuer and key policy, independent of the gateway that produced it;
whether the issuer is accepted for a deployment context remains a verifier-policy
decision. The record composes with correlation and telemetry patterns
([telemetry-otel-correlation.md](../guides/telemetry-otel-correlation.md)) like
any other Interaction Record.
