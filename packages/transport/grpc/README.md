# @peac/transport-grpc

PEAC gRPC transport layer: carrier adapter, HTTP/gRPC status code parity, and metadata key conventions for signed interaction receipts over gRPC.

## Installation

```bash
pnpm add @peac/transport-grpc
```

## What It Does

`@peac/transport-grpc` provides gRPC transport bindings for PEAC evidence carriers. It maps receipts to gRPC metadata keys, translates between HTTP and gRPC status codes, and implements the `CarrierAdapter` interface for gRPC-based A2A deployments. Pure TypeScript with no `@grpc/grpc-js` dependency; consumers bring their own gRPC runtime.

## How Do I Use It?

### Attach a receipt to gRPC metadata

```typescript
import { addReceiptToMetadata } from '@peac/transport-grpc';

const metadata: Record<string, string> = {};
addReceiptToMetadata(metadata, receiptJws);
// metadata['peac-receipt'] = receiptJws
// metadata['peac-receipt-type'] = 'interaction-record+jwt'
```

### Extract a receipt from gRPC metadata

```typescript
import { extractReceiptFromMetadata } from '@peac/transport-grpc';

const jws = extractReceiptFromMetadata(incomingMetadata);
if (jws) {
  // verify with @peac/protocol verifyLocal()
}
```

### Use the CarrierAdapter

```typescript
import { A2AGrpcCarrierAdapter } from '@peac/transport-grpc';

const adapter = new A2AGrpcCarrierAdapter();

// Attach carrier to metadata
const metadata = adapter.attach({}, [carrier]);

// Extract carrier (computes real SHA-256 receipt_ref)
const result = adapter.extract(metadata);
if (result) {
  console.log(result.receipts[0].receipt_ref); // sha256:<real digest>
}
```

### Map HTTP status codes to gRPC

```typescript
import { httpStatusToGrpc, grpcStatusToHttp, GrpcStatus } from '@peac/transport-grpc';

httpStatusToGrpc(402); // GrpcStatus.FAILED_PRECONDITION (9)
grpcStatusToHttp(GrpcStatus.UNAUTHENTICATED); // 401
```

### Use Wire 0.1 receipt type

```typescript
import { addReceiptToMetadata } from '@peac/transport-grpc';

addReceiptToMetadata(metadata, receiptJws, 'peac-receipt/0.1');
```

## Header Size Constraints

gRPC metadata is carried in HTTP/2 headers. Official gRPC guidance warns that servers may limit request headers, with a common default of 8 KiB. The default `GRPC_MAX_CARRIER_SIZE` is set to 8,192 bytes as the conservative interoperability-safe default. Larger limits are deployment-specific and require explicit server configuration.

For environments with known larger server limits, override via:

```typescript
import { createGrpcCarrierMeta } from '@peac/transport-grpc';

const meta = createGrpcCarrierMeta({ max_size: 65_536 }); // 64 KiB
```

For receipts exceeding the header budget, prefer reference mode (`receipt_url`) instead of embedding the full JWS in metadata.

## Integrates With

- `@peac/kernel` (Layer 0): Types, constants, error codes
- `@peac/schema` (Layer 1): Carrier constraint validation
- `@peac/mappings-a2a` (Layer 4): A2A metadata carrier operations
- `@peac/protocol` (Layer 3): Receipt issuance and verification

## For Agent Developers

If you are building an AI agent or MCP server that needs evidence receipts:

- Start with [`@peac/mcp-server`](https://www.npmjs.com/package/@peac/mcp-server) for a ready-to-use MCP tool server
- Use `@peac/protocol` for programmatic receipt issuance and verification
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
