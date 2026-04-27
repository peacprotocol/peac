# Solutions

Outcome-led recipes. Each one states the real-world problem, the PEAC pieces you'll use, and a step-by-step path from a clean clone to a verified record.

| Recipe                                                  | Outcome                                                                                                | Audience                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------- |
| [Runtime evidence export](runtime-evidence-export.md)   | Export portable evidence from a managed agent runtime for compliance and audit.                        | Runtime / platform operator |
| [API record issuance](api-receipt-issuance.md)          | Issue signed records on every HTTP response with Express middleware.                                   | API provider                |
| [MCP tool-call records](mcp-tool-call-receipts.md)      | Attach signed records to MCP tool-call responses.                                                      | MCP server operator         |
| [Commerce evidence bundle](commerce-evidence-bundle.md) | Bundle observational evidence across x402, ACP, and paymentauth without synthesizing payment finality. | Agentic commerce operator   |
| [Regulatory audit trail](regulatory-audit-trail.md)     | Build a portable, signed audit trail for EU AI Act, NIST AI RMF, and ISO 42001 review.                 | Compliance / audit lead     |
| [Cloudflare + x402 + PEAC](cloudflare-x402-peac.md)     | Compose Cloudflare delivery surfaces and x402 PR-1986 terms with PEAC policy and terms binding.        | Cloudflare-fronted operator |

Each recipe follows the same structure:

1. **The problem** — what real situation this addresses, in plain language.
2. **What you'll use** — packages, optional adjacent systems, prerequisites.
3. **Step-by-step** — numbered commands and code.
4. **Evidence of output** — what the record or report looks like.
5. **Where to go from here** — deeper specs, compatibility rows, integrator kits.

Every recipe preserves PEAC's boundary: PEAC carries signed records of what another system attested. It does not execute, orchestrate, evaluate, approve, enforce, or determine payment finality. Future releases will add carrier breadth for CLI execution evidence and observational lifecycle records emitted by other systems; that carrier work does not change the boundary.
