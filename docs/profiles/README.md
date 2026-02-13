# PEAC Profiles

Profiles are document overlays that describe how to use PEAC with specific payment rails,
identity systems, or workflow patterns. A profile does NOT add new schema fields -- it
constrains and maps existing PEAC structures for a specific integration.

See `reference/PROFILE_RULES.md` for the architectural boundary between profiles and schemas.

## Available Profiles

| Profile                                                         | Package              | Since    | Status |
| --------------------------------------------------------------- | -------------------- | -------- | ------ |
| [Stripe x402 Machine Payments](stripe-x402-machine-payments.md) | `@peac/rails-stripe` | v0.10.11 | Draft  |

## Creating a New Profile

A profile document should include:

1. **Abstract** -- one-paragraph description
2. **Use Case** -- the scenario this profile targets
3. **Mapping** -- input/output field mapping tables
4. **Validation Rules** -- numbered, testable invariants
5. **Conformance Vectors** -- link to `specs/conformance/fixtures/<category>/`
6. **Quick Demo** -- a runnable command a stranger can execute in under 5 minutes
7. **Example** -- inline code showing the happy path

Profiles live in `docs/profiles/` and are linked from this index.
