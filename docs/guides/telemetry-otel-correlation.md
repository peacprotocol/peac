# Correlating PEAC records with OpenTelemetry traces

**Status:** Informative. **Last checked:** 2026-07-03.

Telemetry is operational signal; a PEAC record is signed, portable evidence. This guide shows how to
**correlate** the two without conflating them. PEAC composes with OpenTelemetry and W3C Trace Context; it
does not replace, own, or standardize them.

> `peac.record.ref` is a PEAC custom span attribute, **not** an OpenTelemetry semantic convention.
> W3C `traceparent` / `tracestate` are correlation carriers, **not** PEAC proof.

## Two correlation directions

### 1. W3C Trace Context header -> PEAC record

W3C Trace Context ([W3C Recommendation](https://www.w3.org/TR/trace-context/); `traceparent` and
`tracestate` HTTP headers) propagates a trace across services. `@peac/telemetry-otel` reads those headers
and returns a vendor-neutral extension object you can carry inside a record's `org.peacprotocol/correlation`
extension:

```ts
import { createTraceContextExtensions } from '@peac/telemetry-otel';

// headers from the inbound HTTP request
const correlation = createTraceContextExtensions(headers);
// -> { "w3c/traceparent": "...", "w3c/tracestate": "..." } when a valid traceparent is present,
//    otherwise undefined
```

The keys are `w3c/traceparent` and `w3c/tracestate` (vendor-neutral `w3c/` namespace, not
`io.opentelemetry`). They are correlation references only; the record's own binding and signature are
unchanged. This guide uses the stable W3C Trace Context Recommendation (`traceparent` / `tracestate`) as a
correlation-carrier reference.

### 2. PEAC record -> OpenTelemetry span

When an active OpenTelemetry span exists, `@peac/telemetry-otel` adds a span **event** whose attributes
include the record reference. New emitters use `peac.record.ref`; the legacy `peac.receipt.ref` is
dual-emitted for one minor-release compatibility window (read `peac.record.ref`):

```text
span event "peac.receipt.issued":
  peac.record.ref  = sha256:<hex>   # preferred
  peac.receipt.ref = sha256:<hex>   # deprecated, compatibility only
```

These are PEAC custom attributes. They are span **event** attributes, never metric labels (a record
reference is high-cardinality).

## Optional observation patterns

These are correlation patterns, not new PEAC surfaces. PEAC records what was observed; it does not redefine
OpenTelemetry conventions.

### GenAI / MCP tool spans -> PEAC MCP tool-call records

OpenTelemetry GenAI/MCP span attributes such as `gen_ai.tool.call.id` and `gen_ai.tool.call.result` (owned
by the OpenTelemetry Specification authors) can help correlate an observed tool call with a PEAC MCP
tool-call record when an implementation records the tool call as portable evidence. A PEAC MCP record carries
its receipt reference in the tool-result `_meta` tree (see `examples/mcp-tool-call/`). PEAC records the
observed tool action and binds the relevant upstream artifact digest; it does not redefine OpenTelemetry
GenAI or MCP semantic conventions.

### Gateway-decision spans -> PEAC gateway-export records

A gateway decision span can be correlated with a PEAC gateway-export record (the
`org.peacprotocol/gateway-export` extension group; see `examples/mcp-gateway-receipts/`) when an
implementation records the gateway decision, the upstream artifact digest, and `peac.record.ref`. PEAC
preserves portable evidence for the observed decision: it records what the gateway reported and does not
evaluate, change, or operate the gateway decision. It is not an OpenTelemetry exporter or collector.

## Boundary (what this is not)

- `peac.record.ref` is a **PEAC custom span attribute**, not an OpenTelemetry semantic convention. Per
  [`LIFECYCLE-OBSERVATION-PROFILE.md`](../specs/LIFECYCLE-OBSERVATION-PROFILE.md) section 7.1, PEAC does not
  claim ownership over OpenTelemetry semantic-convention namespaces; the attribute is not an OpenTelemetry
  semantic convention unless and until OpenTelemetry adopts it.
- PEAC ships no OpenTelemetry SDK, exporter, collector, or semantic-convention package. `@peac/telemetry`
  defines PEAC attribute names; `@peac/telemetry-otel` maps PEAC telemetry onto OpenTelemetry span events.
- OpenTelemetry's GenAI semantic conventions moved to the dedicated
  [`open-telemetry/semantic-conventions-genai`](https://github.com/open-telemetry/semantic-conventions-genai)
  repository (the older GenAI semantic-conventions page is no longer maintained, as checked 2026-07-03); the
  MCP and GenAI conventions are owned by the OpenTelemetry Specification authors.
- W3C `traceparent` / `tracestate` are carried as correlation references; they do not establish payment,
  authorization, or any PEAC finality.

## Reference

- `@peac/telemetry`: PEAC attribute names (`PEAC_ATTRS`, `TRACE_CONTEXT_EXTENSIONS`).
- `@peac/telemetry-otel`: `createTraceContextExtensions`; OpenTelemetry span-event mapping.
- `org.peacprotocol/correlation` extension: registered in `specs/kernel/registries.json`.
- [`LIFECYCLE-OBSERVATION-PROFILE.md`](../specs/LIFECYCLE-OBSERVATION-PROFILE.md) section 7.1 (normative attribute name).
- [Signed-records interop matrix](../interop/SIGNED-RECORDS-INTEROP-MATRIX.md) (W3C Trace Context / OpenTelemetry row).
