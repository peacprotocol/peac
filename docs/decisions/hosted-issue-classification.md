# Hosted Issue classification (v0.13.0)

**Status:** Decided.

`POST /v1/issue` on the reference verifier is classified `experimental` at v0.13.0 per [`docs/STABILITY-CONTRACT.md`](../STABILITY-CONTRACT.md). The endpoint is reachable behind `PEAC_HOSTED_ISSUE=true` and uses a BYO-key model documented in [`docs/HOSTED_ISSUE_CONTRACT.md`](../HOSTED_ISSUE_CONTRACT.md). The response shape, key-custody model, and tenancy model are subject to change between releases without a deprecation horizon.

## Rationale

The endpoint is not classified `stable` at v0.13.0 because the stable contract does not include:

- A public OpenAPI operation stanza in `packages/schema/openapi/verify.yaml` aligned with [`docs/HOSTED_ISSUE_CONTRACT.md`](../HOSTED_ISSUE_CONTRACT.md).
- A stable key-custody and tenancy model for `POST /v1/issue` in [`docs/KEY-CUSTODY-AND-TENANCY.md`](../KEY-CUSTODY-AND-TENANCY.md).
- A documented service-level baseline for `POST /v1/issue` in [`docs/SLO.md`](../SLO.md).

## Operator note

`PEAC_HOSTED_ISSUE` is `false` by default. Self-hosters who enable it carry the experimental classification: response shape and headers may change between releases without a deprecation horizon. Production deployments should not depend on the `POST /v1/issue` contract at v0.13.0.
