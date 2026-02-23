# OWASP Top 10 for Agentic Applications: PEAC Alignment

> Anchored to [OWASP Top 10 for Agentic Applications](https://owasp.org/www-project-top-10-for-agentic-applications/) (ASI01-ASI10).
> Canonical risk names from the OWASP project page.

## ASI-01: Agentic Prompt Injection

- **Mitigation:** PEAC MCP server tools operate on structured JSON-RPC inputs, not free-text prompts. Tool handlers validate typed schemas (Zod) before processing. No user-controlled strings are interpolated into system prompts or command execution.
- **Test coverage:** `packages/mcp-server/tests/schemas/schemas.test.ts` (input schema validation), `packages/mcp-server/tests/handlers/guards.test.ts` (guard validation)
- **Status:** Covered

## ASI-02: Unsafe Tool/Function Execution

- **Mitigation:** All 5 MCP tools are deterministic functions over their inputs. No shell execution, no file system access (except bundle output to pre-validated `--bundle-dir`), no network calls from tool handlers. Bundle output path validated at startup with realpath resolution.
- **Test coverage:** `packages/mcp-server/tests/handlers/*.test.ts` (all handlers), `packages/mcp-server/tests/integration/lifecycle.test.ts`
- **Status:** Covered

## ASI-03: Excessive Permissions

- **Mitigation:** MCP server uses capability-based tool exposure. Pure tools (verify, inspect, decode) are always available. Privileged tools (issue, bundle) require explicit `--issuer-key` and `--bundle-dir` flags. No ambient key discovery (DD-52).
- **Test coverage:** `packages/mcp-server/tests/integration/privileged-e2e.test.ts` (capability gating)
- **Status:** Covered

## ASI-04: Insufficient Tool/Function Access Controls

- **Mitigation:** Static policy configuration (DD-53) loaded at startup, immutable at runtime. Policy hash included in every tool response `_meta`. No dynamic tool registration or permission escalation.
- **Test coverage:** `packages/mcp-server/tests/infra/policy.test.ts`, `packages/mcp-server/tests/integration/meta.test.ts` (policy hash in responses)
- **Status:** Covered

## ASI-05: Improper Multi-Agent Orchestration

- **Mitigation:** PEAC receipts provide cryptographic evidence of agent actions. Each receipt includes issuer identity, audience, timestamp, and receipt ID. Workflow context extension enables multi-step orchestration tracing with DAG validation.
- **Test coverage:** `packages/schema/__tests__/workflow.ordered-validation.test.ts`, `packages/protocol/tests/workflow.test.ts`
- **Status:** Covered

## ASI-06: Unreliable Output Handling

- **Mitigation:** All MCP tool responses use structured output schemas (DD-54). Every response includes `_meta` with `serverVersion`, `policyHash`, and `protocolVersion` for client validation. No raw text outputs.
- **Test coverage:** `packages/mcp-server/tests/integration/meta.test.ts`, `packages/mcp-server/tests/schemas/schemas.test.ts`
- **Status:** Covered

## ASI-07: Vulnerable Third-Party Agents

- **Mitigation:** PEAC receipts are signed with Ed25519 and bound to specific issuers. Verifiers validate signatures against issuer JWKS. MCP SDK pinned to `~1.27.0` (>= 1.26.0 for CVE-2026-25536 fix). Supply chain hardening via audit-gate.mjs.
- **Test coverage:** `packages/protocol/tests/verify-local.test.ts`, `packages/crypto/__tests__/sign-verify.test.ts`
- **Status:** Covered

## ASI-08: Lack of Agentic System Monitoring

- **Mitigation:** PEAC provides telemetry hooks for receipt issuance and verification (fire-and-forget pattern). Structured verification reports with `valid`/`error_code`/`message` taxonomy. MCP server logs transport events to stderr.
- **Test coverage:** `packages/protocol/tests/telemetry.test.ts`, `packages/protocol/tests/verification-report.test.ts`
- **Status:** Covered

## ASI-09: Inadequate Failure Handling

- **Mitigation:** Fail-closed design: kernel constraint violations, schema validation failures, and signature verification failures all produce typed error codes. No silent failures. Error taxonomy documented in `docs/specs/ERRORS.md`.
- **Test coverage:** `packages/protocol/tests/verify-local.test.ts` (error code coverage), `packages/protocol/tests/issue-constraints.test.ts` (constraint violation handling)
- **Status:** Covered

## ASI-10: Uncontrolled Agentic Autonomy

- **Mitigation:** PEAC receipts provide evidence trails for auditing agent actions. Purpose declaration extension (`purpose_declared`, `purpose_enforced`) constrains agent scope. Obligations extension enables post-issuance constraints.
- **Test coverage:** `packages/protocol/tests/purpose.test.ts`, `packages/schema/__tests__/obligations.test.ts`
- **Status:** Covered
