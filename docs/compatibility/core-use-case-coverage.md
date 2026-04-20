# PEAC Core Use-Case Coverage

**Snapshot:** v0.12.13.
**Canonical scope reference.** Link here from listings, READMEs,
quickstart guides, and website copy so PEAC's records-layer scope stays
consistent as external copy evolves.

PEAC is the open standard for verifiable interaction records across
agent, tool, API, and cross-runtime systems. PEAC standardizes how
portable signed records are issued, carried, verified, and preserved;
it does not standardize the control planes, policy engines, payment
rails, or trust systems above it.

## Coverage matrix

PEAC is designed to carry records from each of the following interaction
surfaces. "Records" means PEAC produces portable signed records of
observed events; PEAC does not enforce invariants inside any of these
surfaces.

| Interaction surface                 | PEAC records                                                                                  | Upstream / complement                                                    | In-repo reference                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Runtime governance                  | Governance decisions, audit entries, authority scope, lifecycle transitions                   | AGT, Claude Managed Agents, OpenAI ACP-backed runtimes                   | [`runtime-governance-coverage.md`](runtime-governance-coverage.md)                     |
| Agentic commerce                    | Discovery, authorization, settlement, refund, void, chargeback observations                   | x402, paymentauth / MPP, ACP, Stripe SPT, UCP                            | [`commerce-protocol-coverage.md`](commerce-protocol-coverage.md)                       |
| MCP tool evidence                   | Tool invocation records with `_meta` namespaced under `org.peacprotocol/*`                    | Anthropic MCP, GitHub Copilot MCP, Claude Code MCP                       | [`../specs/MCP-TOOL-EVIDENCE.md`](../specs/MCP-TOOL-EVIDENCE.md)                       |
| A2A delegation evidence             | Delegation lifecycle, task submission, outcome evaluation                                     | A2A protocol                                                             | [`../../packages/mappings/a2a/`](../../packages/mappings/a2a/)                         |
| API request / response              | Request evidence with `PEAC-Receipt` header, response evidence via middleware                 | Host HTTP frameworks (Express, chi, gin, Next.js)                        | [`go-middleware.md`](go-middleware.md)                                                 |
| Automated transactions              | Payment authorization, settlement, refund per external system                                 | Card rails, crypto rails, UPI, x402 facilitators                         | [`commerce-protocol-coverage.md`](commerce-protocol-coverage.md)                       |
| Cross-boundary interaction          | Portable signed records that cross organizational or process boundaries                       | Any two systems that trust PEAC's signature                              | [`../specs/EVIDENCE-CARRIER-CONTRACT.md`](../specs/EVIDENCE-CARRIER-CONTRACT.md)       |
| Supply-chain provenance             | in-toto attestations, SLSA provenance, release evidence                                       | in-toto, SLSA, Sigstore, SCITT                                           | [`../../packages/mappings/intoto/`](../../packages/mappings/intoto/)                   |
| Content / attribution signals       | `robots.txt`, `tdmrep.json`, Content-Usage observations                                       | RSL, AIPREF, Content Usage                                               | [`../../packages/mappings/content-signals/`](../../packages/mappings/content-signals/) |
| CLI execution evidence _(planned)_  | Command invocation, binary identity / version, input / output capture policy, outcome, timing | Shell runners, task runners, CI-invoked commands, CLI wrappers           | Planned; future extension of [`@peac/cli`](../../packages/cli/) with a carrier profile |
| Observational lifecycle _(planned)_ | Approval, evaluation, experiment assignment / result, and workflow transition observations    | External eval platforms, approval systems, experiment / workflow engines | Planned; future extension of existing adapter surfaces                                 |

## Pillar coverage

PEAC organizes records by a closed 10-pillar taxonomy (Access,
Attribution, Commerce, Consent, Compliance, Privacy, Provenance,
Safety, Identity, Purpose). Each pillar has a stable extension group
under `org.peacprotocol/<pillar>`. See the pillar profiles under
[`../profiles/`](../profiles/).

## Boundary

PEAC carries signed records from each of the surfaces above. PEAC does
not define:

- Governance toolkits
- Policy engines (OPA, Cedar, Rego)
- Trust-score / reputation systems
- Runtime control planes
- Observability dashboards
- Payment protocols
- Identity protocols
- Enterprise SaaS
- Hosted runtimes (the reference verifier is self-hostable and tenantless)
- CLI automation frameworks, evaluation platforms, approval systems, or
  orchestration / workflow engines (the planned CLI and lifecycle rows
  carry records of what those systems attested; they do not define those
  systems)

PEAC records what each of these systems attested; PEAC does not replace
them.

## How to use this doc

When writing listing copy, a quickstart, or a README, link here instead
of re-enumerating PEAC's scope. That keeps the scope description
single-sourced and prevents drift across external-facing surfaces.

## See also

- [Commerce Protocol Coverage](commerce-protocol-coverage.md)
- [Runtime Governance Coverage](runtime-governance-coverage.md)
- [x402 Scheme Coverage](x402-scheme-coverage.md)
- [Go Middleware](go-middleware.md)
- [Profiles index](../profiles/README.md)
- [What PEAC standardizes](../WHAT-PEAC-STANDARDIZES.md)
- [Where PEAC fits](../WHERE-IT-FITS.md)
