# Provisioning lifecycle records example

Generic, vendor-neutral demonstration of issuing and verifying signed
provisioning lifecycle records across all 10 `*-observed` event
families under the `org.peacprotocol/provisioning-lifecycle` extension
namespace.

The 10 fixtures under [`./fixtures/`](./fixtures/) cover catalog,
provider-link, account, resource, credential, payment-authorization,
budget, subscription, domain, and deployment events. Each fixture is a
complete extension payload for its event family; every reference and
digest is synthetic. No vendor names, no live tokens, no production
identifiers.

## What this shows

- The reporting pattern: an external system reports a provisioning
  lifecycle event; PEAC records the report.
- Schema validation through `validateProvisioningLifecycle` from
  `@peac/schema`.
- Issuance through `issue` from `@peac/protocol`.
- Offline verification through `verifyLocal` from `@peac/protocol`.
- Public-key handoff between issuer and verifier without sharing the
  private key.

## Boundaries

PEAC records what the issuer reports happened. Authorization, legal
acceptance, credential validation, payment processing, provider-state
claims, settlement, credential-vault management, and runtime operation
remain responsibilities of the upstream systems and their operators.
PEAC does not authorize the action, verify legal acceptance, validate
credentials, process payments, vouch for provider state, settle
transactions, manage credential vaults, or operate the runtime. The
10 type URIs all carry the `*-observed` suffix to make the observer
scope explicit at the record-type layer.

## Run

From the repo root:

```bash
pnpm install
pnpm build
cd examples/provisioning-lifecycle
pnpm issue
pnpm verify
```

`pnpm issue` writes the signed records and the public key to
[`./out/`](./out/). `pnpm verify` reads them back and verifies each
record offline. The `out/` directory is gitignored.

## Files

```text
fixtures/01-catalog-observed.json                 provisioning-catalog-observed
fixtures/02-provider-link-observed.json           provisioning-provider-link-observed
fixtures/03-account-observed.json                 provisioning-account-observed
fixtures/04-resource-observed.json                provisioning-resource-observed
fixtures/05-credential-observed.json              provisioning-credential-observed
fixtures/06-payment-authorization-observed.json   provisioning-payment-authorization-observed
fixtures/07-budget-observed.json                  provisioning-budget-observed
fixtures/08-subscription-observed.json            provisioning-subscription-observed
fixtures/09-domain-observed.json                  provisioning-domain-observed
fixtures/10-deployment-observed.json              provisioning-deployment-observed

issue-fixtures.mjs   issues a signed record for each fixture
verify-fixtures.mjs  verifies the signed records offline
```

## Related

- Profile spec:
  [`docs/specs/PROVISIONING-LIFECYCLE-PROFILE.md`](../../docs/specs/PROVISIONING-LIFECYCLE-PROFILE.md)
- Operator recipe:
  [`docs/SOLUTIONS/verify-agent-provisioning.md`](../../docs/SOLUTIONS/verify-agent-provisioning.md)
- Concrete sanitized demo:
  [`examples/agent-provisioning-demo/`](../agent-provisioning-demo/)
- Parity corpus:
  [`specs/conformance/parity-corpus/provisioning-lifecycle/`](../../specs/conformance/parity-corpus/provisioning-lifecycle/)
