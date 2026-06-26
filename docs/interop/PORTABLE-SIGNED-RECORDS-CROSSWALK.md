# Portable signed records: crosswalks for evaluation, audit, and transparency contexts

**Status:** Informative.
**Last checked:** 2026-06-26.

This crosswalk maps existing PEAC examples and recipes to the external evaluation, audit, transparency,
authorization, and security contexts where portable signed records are useful. Readers evaluating
AI-assurance-adjacent workflows can use this map to find the relevant PEAC artifacts. The mapping is descriptive.

PEAC records portable signed interaction records across systems. It composes with adjacent standards and systems
and does not replace them. PEAC records observations; upstream systems remain responsible for their own runtime
behavior, registries, payment flows, validation, and release processes. Inclusion is descriptive and does not
imply endorsement, dependency, support, adoption, partnership, or conformance by either project.

## Context map

Each row points at a PEAC artifact that already exists in this repository. The PEAC-side role describes what
the artifact records; it is not a claim about the external context.

| Context                                 | PEAC-side role                                              | Existing artifact                                                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI agent standards and evaluation       | portable records for agent actions and evaluation artifacts | [`examples/agent-action-records/`](../../examples/agent-action-records/), [`docs/SOLUTIONS/eval-platform-records.md`](../SOLUTIONS/eval-platform-records.md)   |
| EU AI Act record-keeping context        | signed record-keeping artifact                              | [`docs/SOLUTIONS/regulatory-audit-trail.md`](../SOLUTIONS/regulatory-audit-trail.md), [`examples/agent-action-records/`](../../examples/agent-action-records/) |
| Evaluation tool outputs                 | signed export of a reported evaluation result               | [`docs/SOLUTIONS/eval-platform-records.md`](../SOLUTIONS/eval-platform-records.md)                                                                             |
| Open-model deployments                  | independent model-use record example                        | [`examples/open-model-inference-records/`](../../examples/open-model-inference-records/)                                                                       |
| Agent authorization and commerce intent | record of execution after authorization                     | [`examples/mpp-payment-record/`](../../examples/mpp-payment-record/), [`examples/commerce-mandate-records/`](../../examples/commerce-mandate-records/)         |
| MCP and agentic infrastructure          | portable records around tools and gateways                  | [`examples/mcp-tool-call/`](../../examples/mcp-tool-call/), [`examples/mcp-gateway-receipts/`](../../examples/mcp-gateway-receipts/)                           |
| LLM and application security evidence   | tool and gateway security-evidence example                  | [`examples/mcp-gateway-receipts/`](../../examples/mcp-gateway-receipts/)                                                                                       |
| Transparency receipts                   | transparency composition path                               | [`docs/interop/SIGNED-RECORDS-INTEROP-MATRIX.md`](./SIGNED-RECORDS-INTEROP-MATRIX.md)                                                                          |

## Sources and boundaries

The contexts above are described from their own official or primary sources. Verify the current status of each
source before relying on this table; the "Last checked" date records when each was last confirmed.

| Context                                 | Source class                       | Source                                                                                                                | Last checked | Boundary                                                                                                                                                                                         |
| --------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AI agent standards and evaluation       | official government                | NIST CAISI, AI Agent Standards Initiative (nist.gov/caisi/ai-agent-standards-initiative)                              | 2026-06-26   | Descriptive mapping only; PEAC makes no compliance claim.                                                                                                                                        |
| EU AI Act record-keeping context        | official EU                        | EU AI Act Article 12, record-keeping (ai-act-service-desk.ec.europa.eu/en/ai-act/article-12)                          | 2026-06-26   | Record-keeping context only; PEAC provides evidence, not a determination of a system's legal status.                                                                                             |
| Evaluation tool outputs                 | official foundation and government | AI Verify Foundation Project Moonshot (aiverifyfoundation.sg/project-moonshot); UK AISI Inspect (inspect.aisi.org.uk) | 2026-06-26   | Independent export of what the evaluation tool reported.                                                                                                                                         |
| Open-model deployments                  | open-source definition body        | Open Source Initiative, Open Source AI Definition 1.0 (opensource.org/ai/open-source-ai-definition)                   | 2026-06-26   | Independent model-use record example; no endorsement, support, adoption, or project-specific claim implied.                                                                                      |
| Agent authorization and commerce intent | official standards body            | FIDO Alliance agentic authentication and AP2 / Verifiable Intent public materials (fidoalliance.org)                  | 2026-06-26   | PEAC records execution evidence after an authorization or intent artifact exists; it is not an authorization, authentication, or payment mechanism.                                              |
| MCP and agentic infrastructure          | open protocol                      | Model Context Protocol (modelcontextprotocol.io)                                                                      | 2026-06-26   | Portable records around tools and gateways; no adoption implied.                                                                                                                                 |
| LLM and application security evidence   | foundation and community           | OWASP Top 10 for LLM Applications, GenAI Security Project (genai.owasp.org)                                           | 2026-06-26   | Security-evidence example; PEAC makes no certification claim.                                                                                                                                    |
| Transparency receipts                   | IETF                               | SCITT working group, IETF Datatracker (datatracker.ietf.org/group/scitt/about)                                        | 2026-06-26   | PEAC does not issue SCITT receipts, host a transparency service, or claim SCITT conformance. SCITT architecture is in the RFC Editor / Datatracker process; verify current status at the source. |

## What this crosswalk is and is not

PEAC defines portable signed records. It does not define the governance, policy, compliance, monitoring, or
assurance process around those records. The records are issued, carried, verified, and preserved across
organizational, vendor, and runtime boundaries; the systems they describe remain independent.

For the underlying composition shapes and per-row artifact detail, see
[`docs/interop/SIGNED-RECORDS-INTEROP-MATRIX.md`](./SIGNED-RECORDS-INTEROP-MATRIX.md).
