# PEAC Profiles

Profiles are documentation overlays that describe how to use PEAC for specific
use cases, regulatory contexts, or integration patterns. A profile does NOT add
new schema fields: it constrains and documents existing PEAC structures.

Profiles are documentary, not runtime-enforced. Schema validation (`@peac/schema`)
enforces field structure; `verifyLocal()` enforces protocol behavior including
type-to-extension enforcement. Profiles document recommended usage patterns on
top of those layers.

See `reference/PROFILE_RULES.md` for the architectural boundary between profiles and schemas.

## Available Profiles

### Pillar Profiles

Pillar profiles document how to use a specific PEAC extension group for a
regulatory, operational, or evidence workflow.

| Profile                       | Extension Group                | Since   | Status |
| ----------------------------- | ------------------------------ | ------- | ------ |
| [Consent](consent.md)         | `org.peacprotocol/consent`     | v0.12.2 | Draft  |
| [Privacy](privacy.md)         | `org.peacprotocol/privacy`     | v0.12.2 | Draft  |
| [Safety](safety.md)           | `org.peacprotocol/safety`      | v0.12.2 | Draft  |
| [Compliance](compliance.md)   | `org.peacprotocol/compliance`  | v0.12.2 | Draft  |
| [Provenance](provenance.md)   | `org.peacprotocol/provenance`  | v0.12.2 | Draft  |
| [Attribution](attribution.md) | `org.peacprotocol/attribution` | v0.12.2 | Draft  |
| [Purpose](purpose.md)         | `org.peacprotocol/purpose`     | v0.12.2 | Draft  |

### Adapter Profiles

Adapter profiles document how to normalize external protocol artifacts into
PEAC receipts for a specific integration.

| Profile                                                         | Package              | Since    | Status |
| --------------------------------------------------------------- | -------------------- | -------- | ------ |
| [Stripe x402 Machine Payments](stripe-x402-machine-payments.md) | `@peac/rails-stripe` | v0.10.11 | Draft  |

## Profile Templates

PEAC uses two profile templates. Choose the one that matches your use case.

### Pillar Profile Template

For profiles that document how to use a PEAC extension group for a specific
evidence or regulatory workflow. No backing package required.

1. **Abstract**: one-paragraph description of the profile and its purpose
2. **When to use**: scenarios where this profile applies
3. **Required / Recommended / Prohibited fields**: which fields from the
   extension group are REQUIRED, RECOMMENDED, or PROHIBITED for this profile,
   using RFC 2119 keywords
4. **Minimal valid receipt**: the smallest receipt that satisfies this profile
5. **Companion profiles**: recommended combinations with other profiles
6. **Regulatory context**: specific regulations or standards this profile
   supports evidence for, using neutral wording ("supports evidence relevant
   to", "can help document"; never "required for compliance")
7. **Conformance examples**: documentary examples in a standardized pattern:
   - Minimal valid issue example
   - Verify example
   - Invalid example (violates a profile constraint, with explanation)
   - Companion-profile example where relevant (two profiles combined)
8. **Quick demo**: a runnable TypeScript snippet (issue + verify) a stranger
   can execute in under 5 minutes
9. **Non-goals / not guaranteed**: must state plainly that the profile:
   - does not create new schema fields
   - does not by itself establish legal compliance
   - does not imply verifier enforcement beyond what the protocol spec defines
10. **Notes / caveats**: limitations, future directions, or scope boundaries

### Adapter Profile Template

For profiles that document how to normalize external protocol data into PEAC
receipts for a specific integration. Requires a backing package.

1. **Abstract**: one-paragraph description
2. **Use case**: the scenario this profile targets
3. **Package / Function**: the backing `@peac/rails-*` or `@peac/adapter-*` package
4. **Mapping**: input/output field mapping tables
5. **Validation rules**: numbered, testable invariants
6. **Conformance vectors**: link to `specs/conformance/fixtures/<category>/`
7. **Quick demo**: a runnable command a stranger can execute in under 5 minutes
8. **Example**: inline code showing the happy path

## Regulatory Wording Rules

Profile documents that reference regulations or standards must use neutral,
evidence-oriented language:

- "supports evidence relevant to [Article X] workflows"
- "can help document [requirement Y]"
- "maps naturally to [standard Z] concepts"

Do NOT use language that implies direct compliance or legal sufficiency:

- ~~"required for [Article X] compliance"~~
- ~~"ensures GDPR conformance"~~
- ~~"satisfies [regulation] requirements"~~

PEAC is evidence and interoperability infrastructure. Extension groups and
profiles support workflows relevant to regulatory requirements; they do not
themselves constitute compliance artifacts.

## Companion Profile Guidance

Certain profiles are natural companions for common regulatory workflows:

| Workflow                  | Recommended Profiles     | Context                                              |
| ------------------------- | ------------------------ | ---------------------------------------------------- |
| GDPR evidence             | Consent + Purpose        | Art 6-7 legal basis + Art 5(1)(b) purpose limitation |
| GDPR data handling        | Privacy + Consent        | Art 13-14 disclosure + Art 7 consent                 |
| EU AI Act risk management | Safety + Compliance      | Art 9 risk management + Art 28 deployer obligations  |
| AI-generated content      | Provenance + Attribution | Art 50 transparency + content origin                 |
| SOC 2 / ISO 27001 audit   | Compliance               | Standalone; audit reference + framework              |
| Content licensing         | Attribution + Provenance | SPDX license + origin tracking                       |

Profiles live in `docs/profiles/` and are linked from this index.
