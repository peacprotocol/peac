# Hosted Issue (`POST /v1/issue`) classification (v0.13.0)

**Status:** Experimental.

## Decision

`POST /v1/issue` on the reference verifier remains classified `experimental` per [`docs/STABILITY-CONTRACT.md`](../STABILITY-CONTRACT.md). The endpoint is reachable behind `PEAC_HOSTED_ISSUE=true` and uses a BYO-key model documented in [`docs/HOSTED_ISSUE_CONTRACT.md`](../HOSTED_ISSUE_CONTRACT.md). The response shape, key custody model, and tenancy model are all considered subject to change without breaking-change deprecation horizons.

## Rationale

Promotion from `experimental` to `stable` requires:

- A documented service-level baseline for `POST /v1/issue` in [`docs/SLO.md`](../SLO.md).
- An OpenAPI operation stanza in the public contract (`packages/schema/openapi/verify.yaml`) aligned with [`docs/HOSTED_ISSUE_CONTRACT.md`](../HOSTED_ISSUE_CONTRACT.md).
- Key-custody and tenancy specifics for `POST /v1/issue` in [`docs/KEY-CUSTODY-AND-TENANCY.md`](../KEY-CUSTODY-AND-TENANCY.md).

Those preconditions are not satisfied at v0.13.0. The endpoint stays classified `experimental` and is not part of the v0.13.0 stable surface.

## Operator note

`PEAC_HOSTED_ISSUE` is `false` by default. Self-hosters who enable it carry the experimental classification: response shape and headers may change between releases without a deprecation horizon. Production deployments should not depend on the `POST /v1/issue` contract at v0.13.0.
