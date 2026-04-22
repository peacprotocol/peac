# PEAC Data-Subject Rights Handling for Deployers

**Status:** Deployment guidance (informative)
**Version:** 0.1
**Applies to:** Operators handling GDPR (and UK GDPR) data-subject rights requests in deployments that include PEAC. Analogous frameworks (CCPA/CPRA, PIPEDA, LGPD) carry similar obligations.

---

## What PEAC does

- Separates **immutable signed evidence** (the JWS record) from
  **mutable derived metadata** (verifier caches, report indexes,
  logs), so rights handling can act on the right layer without
  corrupting the other.
- Supports rights workflows by providing deterministic record shapes
  and deletion hooks on the derived layer.
- Publishes this doc as the reference framing for each right.
- States explicitly that AIPREF-style content-use preferences
  (`draft-ietf-aipref-vocab`) are **not** consent under GDPR.

## What PEAC does not do

- PEAC does not satisfy controller obligations on the operator's
  behalf. It supports rights workflows; it does not execute them.
- PEAC does not determine whether a specific right applies, whether
  an exemption is available, or whether a request can be refused.
- PEAC does not automate rights-request intake, identity
  verification, or response delivery.
- PEAC does not treat a signed record as deleted because a derived
  report was deleted.

## What deployers / controllers / processors still own

- Operating the rights intake channel, identity verification, and
  response delivery.
- Deciding, per request, which rights apply and which exemptions.
- Distinguishing evidence-layer and derived-layer actions (see §3).
- Documenting the decision and the action taken.
- Statutory timelines (for UK/EU GDPR, typically one month; may be
  extended by two more months for complex requests).

---

## 1. Right by right

### 1.1 Access

Operator responsibility: identify whether the data subject's personal
data is present in any PEAC-related surface (likely personal data,
pseudonymous-but-in-scope). PEAC surfaces worth checking:

- Interaction records identifying the subject.
- Verifier logs if keyed by a caller identifier associated with the
  subject.
- Derived report indexes containing `receipt_ref` entries tied to the
  subject.
- Audit bundles if the subject is represented.

PEAC does not execute the access response. The operator assembles and
delivers the response.

### 1.2 Rectification

Evidence-layer records are immutable by design. Rectification on the
signed evidence layer means issuing a **new** record that supersedes
the prior record, not modifying the prior bytes. Downstream systems
that represent the subject can update their mutable representation.

PEAC does not silently mutate a signed record. Any "rectification"
that would change the signed bytes is out of scope and incompatible
with the protocol.

### 1.3 Erasure ("right to be forgotten")

**The most common source of confusion.** Operators frequently expect
to delete signed evidence. Before doing so:

- Check whether the operator has a legal / audit / contractual
  obligation to retain the evidence that overrides the erasure
  request. [GDPR Article 17](https://gdpr-info.eu/art-17-gdpr/) lists exceptions; operator legal review
  decides.
- If retention applies, operators typically delete **derived-layer
  references** (report index entries, verifier cache entries,
  operator logs tied to the subject) without destroying the signed
  evidence. The signed evidence stays, but the operator's ability
  to use it for active operations is curtailed.
- If retention does not apply, operators delete the signed evidence
  itself (from all storage tiers they control) and every derived
  reference keyed to it.

The reference verifier's deletion hook purges derived-layer entries
by `receipt_ref` list. Evidence-layer deletion is an operator
responsibility and typically involves multiple storage tiers outside
PEAC's code.

See [RETENTION-AND-DELETION.md](RETENTION-AND-DELETION.md) §2 for the
evidence-vs-derived split.

### 1.4 Restriction

Operators MAY restrict processing by removing active references to a
subject in the derived layer (caches, indexes, report stores) while
retaining the signed evidence in cold storage. The PEAC deletion
hook supports the derived-layer half. The operator owns the storage
and policy for the cold layer.

### 1.5 Objection

If the subject objects to processing that relies on legitimate
interests or public-interest lawful basis, the operator evaluates
whether compelling grounds to continue exist. PEAC does not evaluate
this.

### 1.6 Portability

Operators MAY include the subject's signed records in a portability
response. The signed JWS is a machine-readable artifact. Operators
decide what to include per their lawful-basis and scope analysis.

### 1.7 Automated decision-making

PEAC is a records layer, not a decision engine. Automated-decision
obligations under [GDPR Article 22](https://gdpr-info.eu/art-22-gdpr/) apply to the systems above PEAC
that make the decisions and use PEAC to record what happened.

---

## 2. AIPREF preferences are not consent

`draft-ietf-aipref-vocab` (AIPREF) defines content-use preferences
(`train-ai`, `search`) as a signaling surface. Preferences are
**not** consent under GDPR:

- Preferences are expressed by the content publisher, not by the
  data subject.
- Preferences lack GDPR's specificity, informedness, and unambiguous
  affirmative-action requirements for consent.
- Preferences may not even reference personal data at all.

Operators MUST NOT treat an AIPREF value as a substitute for consent.

---

## 3. Evidence vs derived split in rights workflows

The pivot that resolves most rights-handling confusion:

| Action                    | Evidence layer (signed JWS)                                             | Derived layer (cache / index / logs)               |
| ------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------- |
| Mutate in place           | **Never.** Signed bytes are immutable.                                  | Yes, under operator control.                       |
| Delete individually       | Operator action across all storage tiers holding the authoritative JWS. | Reference-verifier deletion hook by `receipt_ref`. |
| Supersede with new record | Issue a new signed record referencing the prior via operator schema.    | Follows same rules as other derived data.          |
| Respond to access request | Include if subject is represented; redact per operator policy.          | Include if subject is represented; redact.         |

---

## 4. Statutory timelines (reference only)

For UK/EU GDPR, the default response window is one calendar month
from request receipt. Complex requests may extend by two further
months with written justification. CCPA/CPRA, LGPD, and PIPEDA carry
different windows; operators should check per jurisdiction.

PEAC does not track or enforce these timelines. Operators own the
intake system and the SLA.

---

## 5. References

- [DATA-CLASSIFICATION.md](DATA-CLASSIFICATION.md)
- [RETENTION-AND-DELETION.md](RETENTION-AND-DELETION.md)
- [DEPLOYMENT-ROLES.md](DEPLOYMENT-ROLES.md)
- [DPIA-STARTER.md](DPIA-STARTER.md)
- `docs/specs/PRIVACY-PROFILE.md`: receipt-side privacy profile.
- [ICO guidance, "Right to erasure"](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/): including the overriding-obligation
  exceptions.
- `draft-ietf-aipref-vocab`: preferences; not consent.
