# Integration patterns guide

This guide shows how to wire PEAC records into common stacks using surfaces that already ship in this repository. It adds no new protocol or package surface: every helper, extension, and example referenced here exists today.

## When to use this guide

Use it when you already run one of these systems and want to attach, carry, or export a portable signed PEAC record alongside it:

- An MCP server or client that wants a verifiable record per tool call.
- A platform or API gateway that wants to export signed observation records.
- An OpenTelemetry-instrumented service that wants its trace context reflected in PEAC records.

Each pattern below points at the canonical package or example. Start from the one that matches your stack.

## Integration patterns

### 1. W3C trace context to PEAC correlation fields

`@peac/telemetry-otel` ships helpers to read W3C Trace Context from incoming HTTP headers. You can carry the trace identifiers into a PEAC record by writing them to the `org.peacprotocol/correlation` extension at issue time.

```typescript
import { extractTraceparentFromHeaders, parseTraceparent } from '@peac/telemetry-otel';
import { issue } from '@peac/protocol';

// `headers` is your inbound request's headers.
const traceparent = extractTraceparentFromHeaders(headers);
const parts = traceparent ? parseTraceparent(traceparent) : undefined;

const record = await issue({
  iss: 'https://service.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/payment',
  pillars: ['commerce'],
  extensions: {
    // The org.peacprotocol/payment type pairs with the commerce extension
    // (type-to-extension mapping); keep it present and minimal. PEAC records
    // the observation and never synthesizes payment finality.
    'org.peacprotocol/commerce': {
      payment_rail: 'internal',
      amount_minor: '0',
      currency: 'USD',
      reference: 'order-4821',
    },
    'org.peacprotocol/correlation': {
      // traceparent trace-id  -> correlation.trace_id (32 lowercase hex)
      // traceparent parent-id -> correlation.span_id  (16 lowercase hex)
      ...(parts ? { trace_id: parts.traceId, span_id: parts.parentId } : {}),
      workflow_id: 'order-4821',
    },
  },
  privateKey,
  kid: 'key-2026-01',
});
```

The `org.peacprotocol/correlation` extension also carries `workflow_id`, `parent_jti`, and `depends_on` for multi-step and fork-join causality. See [`examples/workflow-correlation/`](../../examples/workflow-correlation/) for the shape used end to end.

**Trace-context boundary (read this before mixing the two).** There are two distinct extension patterns and they must not be conflated:

- `org.peacprotocol/correlation` carries the parsed identifiers `trace_id` and `span_id` (the OTel-hex fields above).
- `createTraceContextExtensions()` from `@peac/telemetry-otel` returns a separate extension object keyed `w3c/traceparent` and `w3c/tracestate`, which carries the raw header values verbatim.

Pick one. Do not place raw `tracestate` inside `org.peacprotocol/correlation`; `tracestate` belongs only in the `w3c/tracestate` form returned by `createTraceContextExtensions()`.

### 2. PEAC record and event to OTel span attributes

The reverse direction already exists. `createOtelProvider` from `@peac/telemetry-otel` emits span attributes (such as `peac.receipt.ref`, `peac.version`, and `peac.valid`) on issue, verify, and access-decision events when an active span is present.

```typescript
import { setTelemetryProvider } from '@peac/telemetry';
import { createOtelProvider } from '@peac/telemetry-otel';

// serviceName is required; the other options default (strict privacy mode,
// the package tracer/meter, the package version).
setTelemetryProvider(createOtelProvider({ serviceName: 'my-peac-service' }));
```

This lets an existing observability backend see PEAC activity as span attributes. PEAC does not replace OpenTelemetry; it contributes attributes to the spans your tracer already produces.

### 3. MCP `_meta` carrier

For MCP tool results, carry the record on the response `_meta` using the existing carrier helpers in [`packages/mappings/mcp/`](../../packages/mappings/mcp/):

```typescript
import { computeReceiptRef } from '@peac/schema';
import { attachReceiptToMeta, extractReceiptFromMetaAsync } from '@peac/mappings-mcp';

// Producer side: attach the record to the tool result.
// receipt_ref is the sha256 of the compact JWS; both values are written to _meta.
const receipt_ref = await computeReceiptRef(jws);
const result = attachReceiptToMeta(toolResult, { receipt_ref, receipt_jws: jws });

// Consumer side: extract it back and check receipt_ref consistency.
const extracted = await extractReceiptFromMetaAsync(receivedResult);
```

Use the async extractor when `receipt_jws` is present so the carrier can check `receipt_ref` consistency before verification.

The `_meta` keys (`org.peacprotocol/receipt_ref`, `org.peacprotocol/receipt_jws`, `org.peacprotocol/receipt_url`) and the 8 KB embed limit are fixed by the carrier contract. See [`examples/mcp-tool-call/`](../../examples/mcp-tool-call/), [`examples/mcp-gateway-receipts/`](../../examples/mcp-gateway-receipts/), and the [MCP Integration Kit](../../integrator-kits/mcp/README.md) for full setups.

### 4. Gateway and API export pattern

A gateway, facilitator, or recovery middleware that observes an event can export a signed record of what it observed. [`examples/gateway-export-records/`](../../examples/gateway-export-records/) demonstrates this for the `org.peacprotocol/gateway-export` extension, validating each payload with `validateGatewayExport` from `@peac/schema` and issuing through `issue` from `@peac/protocol`.

The pattern is observe-and-export: PEAC records what the caller reported. It does not introduce a settlement state, decide an outcome, or act as the gateway.

## What PEAC does not do

- PEAC does not replace OpenTelemetry. It maps trace identifiers into a record and can contribute span attributes; your tracer remains the source of spans and traces.
- PEAC does not replace MCP. It carries a record on `_meta`; MCP remains the transport and tool protocol.
- PEAC does not replace gateway logs. It exports a signed observation record; your gateway remains the system of action.
- PEAC does not authenticate, authorize, orchestrate, settle, or enforce policy.
- PEAC records, binds, exports, and verifies portable signed records that someone else can verify later, across boundaries.

## Verify the result

To verify the offline path before integrating, generate and verify a sample:

```bash
pnpm dlx @peac/cli samples generate -o ./s
pnpm dlx @peac/cli verify ./s/valid/basic-record.jws --public-key ./s/bundles/sandbox-jwks.json
```

Expected output:

```text
Signature valid (offline).
```

In code, verify with `verifyLocal()` from `@peac/protocol`. See [`docs/VERIFY.md`](../VERIFY.md) for the full verification walkthrough.

## Related examples

- [`examples/workflow-correlation/`](../../examples/workflow-correlation/) — correlation extension across a fork-join workflow.
- [`examples/mcp-tool-call/`](../../examples/mcp-tool-call/) — MCP `_meta` carrier for a paid tool call.
- [`examples/mcp-gateway-receipts/`](../../examples/mcp-gateway-receipts/) — gateway-mediated policy decisions as records.
- [`examples/gateway-export-records/`](../../examples/gateway-export-records/) — signed gateway/facilitator export records.
- [`docs/START_HERE.md`](../START_HERE.md) — entry path by role.
