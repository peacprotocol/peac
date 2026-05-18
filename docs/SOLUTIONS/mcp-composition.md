# MCP composition with PEAC records

> **Outcome:** Your team runs Model Context Protocol (MCP) servers, clients, or tool integrations. You want a portable signed record of what each MCP interaction reported, verifiable by any downstream party with the issuer's public key, without depending on the MCP runtime that produced it.
>
> **Audience:** MCP server / client operator, MCP-tool integrator, or auditor reviewing MCP-mediated work.
>
> **Time:** Reading time only. This is a composition guide; no code changes are required.

## What this shows

How the PEAC records layer composes with the Model Context Protocol. MCP defines the runtime contract between agents and tools. PEAC produces portable signed records of what an MCP server, client, or tool integration reported during that contract. The two layers are independent: MCP evolves on its own schedule; PEAC records what an MCP participant reported and stays verifiable beyond the runtime that produced it.

This document is a composition guide. It does not change wire format, signing envelope, public API, schema, or registry. The companion code recipe is [MCP tool-call records](mcp-tool-call-receipts.md), which shows the attachment carriers and the `_meta` keys.

## How PEAC composes with MCP

PEAC's MCP composition surface is shaped by three repo-local artifacts and one example type URI used by the existing recipe:

- the existing `@peac/mcp-server` package (built-in MCP evidence tools);
- the existing `@peac/mappings-mcp` package (`_meta` carrier mapping per the Evidence Carrier Contract);
- the existing recipe [`docs/SOLUTIONS/mcp-tool-call-receipts.md`](mcp-tool-call-receipts.md);
- the `org.peacprotocol/mcp-tool-call` example type URI used by that recipe. It is an integrator-emitted custom type URI, not a registered PEAC extension group, registered receipt type, or PEAC profile.

The composition is record-only. PEAC reads what the MCP server or client reported, signs an interaction record, and stops there. The MCP runtime keeps owning transport, registry, auth, conformance, and process management.

## MCP auth observations and `iss`

SEP-2468 recommends including an Issuer (`iss`) parameter in MCP authentication responses. The proposal merged on 2026-05-17 into the canonical MCP specification repository (modelcontextprotocol/specification PR 2468). The recommendation aligns with the PEAC Wire 0.2 envelope: every Wire 0.2 interaction record already carries a canonical `iss` claim as a required field.

Composition: an MCP server that emits SEP-2468-shaped auth responses can be observed by an integrator and recorded by a separate PEAC interaction record. The MCP server keeps owning the authentication decision. PEAC carries a portable signed record of what the MCP server reported. The `iss` value in the PEAC record is the operator's canonical issuer URL, not necessarily the same URL the MCP server emitted in its auth response; the two carry independent identities.

PEAC verifies the PEAC record issuer and signature; it does not authenticate the MCP server, replace MCP auth, or enforce MCP authorization policy. The PEAC verification step confirms that the PEAC record itself is structurally valid and signed by the issuer the record claims; it makes no statement about whether the upstream MCP server's auth decision was correct, complete, or compliant with any MCP-defined policy.

## MCP conformance discipline

SEP-2484 requires conformance tests for Standards Track SEPs before they reach Final status. The proposal merged on 2026-05-17 into the canonical MCP specification repository (modelcontextprotocol/specification PR 2484). The PEAC repository has its own conformance discipline under [`specs/conformance/`](../../specs/conformance/) with 290 requirement IDs across 32 sections plus 11 parity-corpus families.

The two conformance regimes are complementary, not coupled. PEAC's conformance scope is what PEAC's record layer must accept and reject; the MCP SEP conformance scope is what an MCP runtime must implement. A PEAC record that observes an MCP interaction does not require the upstream MCP server to be SEP-2484 conformant, and the upstream MCP server does not require the PEAC record layer to be present.

## MCP schema evolution

SEP-2106 aligns MCP tool `inputSchema` and `outputSchema` with JSON Schema 2020-12. The proposal merged on 2026-05-18 into the canonical MCP specification repository (modelcontextprotocol/specification PR 2106).

This evolves the MCP runtime contract; it does not change the PEAC record layer. PEAC records the MCP interaction the integrator observed at the time of recording. A record produced before the SEP-2106 alignment is still verifiable after the alignment; a record produced after is still verifiable using the same Wire 0.2 envelope. PEAC does not validate MCP tool inputs or outputs against any MCP-defined schema; it preserves the integrator-reported observation.

## Deprecated MCP surfaces

SEP-2577 deprecates the MCP server features Roots, Sampling, and Logging. The proposal merged on 2026-05-15 into the canonical MCP specification repository (modelcontextprotocol/specification PR 2577). The deprecation introduces no wire-level break during the deprecation period; clients that already integrate against those surfaces continue to interoperate while the deprecation runs.

PEAC records what the MCP server reported. A PEAC record emitted before SEP-2577 that references one of those surfaces stays verifiable; a forward record simply will not reference them. PEAC has no migration burden tied to MCP feature deprecation.

## Resumable tasks and partial results

MCP runtimes increasingly support long-running tasks and partial-result emission. When an integrator observes a task resumption or a partial-result step, PEAC composes via the existing `org.peacprotocol/lifecycle-observation` extension namespace and its `lifecycle-workflow-transition` event kind (shipped in v0.14.1). The record carries the observed transition; the MCP runtime keeps owning task scheduling, retry, and partial-result delivery. See [Record evaluation-platform events](eval-platform-records.md) for the lifecycle-observation issuance pattern.

## Stdio process lifetime

PEAC's MCP composition is observational: PEAC records what an MCP server reported during its lifetime. PEAC does not start, stop, monitor, restart, or supervise MCP server processes. Stdio transport, restart policy, and timeout handling are the operator's responsibility. The PEAC record carries observation timestamps that the operator supplied; PEAC does not back-fill or correct MCP server lifetime claims.

## Error-code boundaries

PEAC has its own stable error namespace, used by the PEAC reference verifier and the PEAC schema validators. MCP defines its own server-side error codes for tool invocation, transport, and auth. The two namespaces are independent; PEAC does not mirror MCP error code values and MCP does not mirror PEAC error code values. When an integrator observes an MCP error, the integrator can include the MCP-reported error string and code as opaque values inside the recorded extension body, but the PEAC envelope itself uses only the canonical PEAC error namespace.

## What PEAC does not do

- PEAC does not host an MCP registry.
- PEAC does not route MCP requests.
- PEAC does not implement MCP transport.
- PEAC does not evaluate MCP tool safety.
- PEAC does not score MCP servers.
- PEAC does not validate MCP server identity.
- PEAC does not enforce MCP auth policy.
- PEAC does not manage MCP server processes.

## Watch items

The Model Context Protocol working group is actively discussing several proposals that may affect this composition surface. PEAC will not preemptively record their semantics until each lands. Track upstream:

- specification feature-lifecycle and deprecation policy (SEP-2596, open at time of writing);
- progressive tool disclosure (SEP-2636, open at time of writing);
- event-driven tool invocation (SEP-2495, open at time of writing).

When any of these moves to merged status upstream, this composition document will receive a targeted update; no PEAC wire, schema, or registry change is expected as a result of upstream MCP evolution.

## Where to go from here

- [MCP tool-call records](mcp-tool-call-receipts.md) — the canonical code recipe for attaching a signed record to an MCP tool-call response.
- [Compatibility matrix — MCP rows](../COMPATIBILITY_MATRIX.md) — current MCP surface inventory.
- [Wire 0.2 spec](../specs/WIRE-0.2.md) — the `interaction-record+jwt` envelope.
- [Evidence Carrier Contract](../specs/EVIDENCE-CARRIER-CONTRACT.md) — MCP `_meta` carrier shape.
