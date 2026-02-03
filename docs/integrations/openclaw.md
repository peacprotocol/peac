# OpenClaw Integration Guide

**Package:** `@peac/adapter-openclaw`
**Target:** v0.10.7
**Status:** Experimental

This guide explains how to integrate PEAC receipts with OpenClaw, generating signed interaction records for every tool call.

## Overview

The `@peac/adapter-openclaw` package provides a plugin for OpenClaw that:

1. **Captures tool calls** - Records every tool invocation with input/output hashes
2. **Signs receipts** - Creates cryptographically signed JWS receipts
3. **Provides tools** - Exposes `peac_receipts.*` tools for querying and verification
4. **Includes skills** - Adds `/peac-*` slash commands for operators

## Installation

```bash
# Install the adapter
pnpm add @peac/adapter-openclaw

# Or with npm
npm install @peac/adapter-openclaw
```

## Configuration

Add the plugin to your OpenClaw gateway configuration:

```json
{
  "plugins": {
    "entries": {
      "peac-receipts": {
        "enabled": true,
        "config": {
          "output_dir": ".peac/receipts",
          "signing": {
            "key_ref": "env:PEAC_SIGNING_KEY",
            "issuer": "https://my-org.example.com",
            "audience": "https://api.example.com"
          },
          "capture": {
            "mode": "hash_only",
            "max_payload_size": 1048576
          },
          "background": {
            "drain_interval_ms": 1000,
            "batch_size": 100
          }
        }
      }
    }
  }
}
```

### Configuration Options

| Option                         | Type     | Default          | Description                       |
| ------------------------------ | -------- | ---------------- | --------------------------------- |
| `enabled`                      | boolean  | `true`           | Enable/disable receipt generation |
| `output_dir`                   | string   | `.peac/receipts` | Directory for receipt files       |
| `signing.key_ref`              | string   | Required         | Key reference (see below)         |
| `signing.issuer`               | string   | Required         | Issuer URI for receipts           |
| `signing.audience`             | string   | Optional         | Audience URI for receipts         |
| `capture.mode`                 | string   | `hash_only`      | Capture mode                      |
| `capture.allowlist`            | string[] | `[]`             | Tools for plaintext capture       |
| `capture.max_payload_size`     | number   | `1048576`        | Max payload bytes (1MB)           |
| `background.drain_interval_ms` | number   | `1000`           | Drain interval                    |
| `background.batch_size`        | number   | `100`            | Entries per drain cycle           |

### Key Reference Formats

| Format          | Example                           | Security Level                    |
| --------------- | --------------------------------- | --------------------------------- |
| `env:VAR_NAME`  | `env:PEAC_SIGNING_KEY`            | Development                       |
| `file:/path`    | `file:./keys/signing.jwk`         | Development                       |
| `keychain:name` | `keychain:peac-key`               | Recommended (not yet implemented) |
| `sidecar:uri`   | `sidecar:unix:///tmp/signer.sock` | Enterprise (not yet implemented)  |

### Capture Modes

| Mode        | Description                                |
| ----------- | ------------------------------------------ |
| `hash_only` | Only capture payload hashes (recommended)  |
| `allowlist` | Capture plaintext for specified tools only |

## Signing Key Setup

Generate an Ed25519 signing key:

```bash
# Using OpenSSL
openssl genpkey -algorithm Ed25519 -out signing-key.pem

# Convert to JWK (requires jose CLI or similar)
jose jwk pub -i signing-key.pem -o public.jwk
```

Or generate programmatically (illustrative pseudocode):

```typescript
// Illustrative - actual API may differ
import { generateKeyPair } from '@peac/crypto';

const { publicKey, privateKey } = await generateKeyPair('Ed25519');

// Export as JWK for configuration
const jwk = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: publicKey, // base64url-encoded public key
  d: privateKey, // base64url-encoded private key
  kid: 'my-key-id',
  alg: 'EdDSA',
  use: 'sig',
};

// Set as environment variable
process.env.PEAC_SIGNING_KEY = JSON.stringify(jwk);
```

## Plugin Tools

The plugin exposes four tools for querying and verification:

### peac_receipts.status

Get the current status of receipt generation.

```json
{
  "totalCaptured": 150,
  "duplicatesSkipped": 5,
  "pendingCount": 3,
  "totalEmitted": 142,
  "totalErrors": 0,
  "keyId": "k_abc12345",
  "isRunning": true
}
```

### peac_receipts.query

Query receipts by various criteria.

**Parameters:**

| Parameter     | Type   | Description                |
| ------------- | ------ | -------------------------- |
| `workflow_id` | string | Filter by workflow ID      |
| `tool_name`   | string | Filter by tool name        |
| `status`      | string | Filter by result status    |
| `since`       | string | Start time (RFC 3339)      |
| `until`       | string | End time (RFC 3339)        |
| `limit`       | number | Max results (default: 100) |
| `offset`      | number | Skip results (pagination)  |

**Example:**

```json
{
  "name": "peac_receipts.query",
  "parameters": {
    "tool_name": "web_search",
    "since": "2024-02-01T00:00:00Z",
    "limit": 10
  }
}
```

### peac_receipts.verify

Verify a receipt or bundle offline.

**Parameters:**

| Parameter   | Type   | Description                |
| ----------- | ------ | -------------------------- |
| `path`      | string | Path to receipt or bundle  |
| `jwks_path` | string | Optional path to JWKS file |

**Verification checks:**

1. **Structure** - Receipt has required fields
2. **Interaction** - InteractionEvidence is valid
3. **Signature** - JWS signature is valid (if JWKS provided)

### peac_receipts.export_bundle

Export receipts as a bundle for audit.

**Parameters:**

| Parameter     | Type   | Description        |
| ------------- | ------ | ------------------ |
| `workflow_id` | string | Filter by workflow |
| `since`       | string | Start time         |
| `until`       | string | End time           |
| `output`      | string | Output path        |

## Slash Commands

The plugin adds skill-based slash commands:

### /peac-status

Show current receipt generation status.

```
/peac-status
```

### /peac-query

Query receipts interactively.

```
/peac-query --tool web_search --limit 10
```

### /peac-verify

Verify a receipt file.

```
/peac-verify ./receipts/r_abc123.peac.json
```

### /peac-export

Export receipts as a bundle.

```
/peac-export --since 2024-02-01T00:00:00Z
```

## Receipt Format

Each receipt is a JSON file with JWS signature:

```json
{
  "rid": "r_01HXYZ...",
  "interaction_id": "openclaw/cnVuXzEyMw/Y2FsbF80NTY",
  "entry_digest": "abc123...64hex",
  "_jws": "eyJhbGciOiJFZERTQSIsImtpZCI6ImsxIn0..."
}
```

The `_jws` field contains the signed PEAC envelope with:

- `auth` block (issuer, audience, timestamps)
- `evidence.extensions["org.peacprotocol/interaction@0.1"]` with interaction details

## Programmatic Usage

The following examples are illustrative. See the package exports for the exact API.

### Creating a Plugin Instance

```typescript
// Illustrative - see package exports for exact API
import {
  createPluginInstance,
  createJwkSigner,
  createFileReceiptWriter,
} from '@peac/adapter-openclaw';

// Create signer from JWK
const signer = createJwkSigner(jwk, 'https://issuer.example.com');

// Create writer for receipt files
const writer = await createFileReceiptWriter('.peac/receipts');

// Create plugin with storage (use testkit for in-memory implementations)
const plugin = await createPluginInstance({
  signer,
  writer,
  store, // SpoolStore implementation
  dedupe, // DedupeIndex implementation
  drainIntervalMs: 1000,
  batchSize: 100,
});

// Start background service
plugin.start();

// Use hook handler for tool calls
plugin.hookHandler.onToolCall(event);
plugin.hookHandler.onToolResult(event);

// Stop gracefully
await plugin.stop();
```

### Manual Capture

```typescript
// Illustrative - see @peac/capture-core exports
import { createCaptureSession } from '@peac/capture-core';

// Create session with required dependencies
const session = createCaptureSession({ store, dedupe, hasher });

// Capture an action
const result = await session.capture({
  id: 'unique-action-id',
  kind: 'tool.call',
  platform: 'openclaw',
  tool_name: 'web_search',
  input_bytes: new TextEncoder().encode(JSON.stringify(input)),
  started_at: '2024-02-01T10:00:00Z',
  completed_at: '2024-02-01T10:00:01Z',
  status: 'ok',
});

if (result.success) {
  console.log('Captured:', result.entry.entry_digest);
}
```

## Security Best Practices

### 1. Protect Signing Keys

- Never commit keys to version control
- Use OS keychain in production
- Rotate keys periodically

### 2. Hash-Only Mode

Always use `hash_only` capture mode unless you have explicit requirements for plaintext:

```json
{
  "capture": {
    "mode": "hash_only"
  }
}
```

### 3. Verify Receipts

Regularly verify receipts to detect tampering:

```typescript
import { verifyReceipt } from '@peac/adapter-openclaw';

const result = await verifyReceipt(receiptPath, jwksPath);
if (!result.valid) {
  console.error('Verification failed:', result.errors);
}
```

### 4. Backup Receipts

Sync receipts to external storage for disaster recovery:

```bash
# Example: sync to S3
aws s3 sync .peac/receipts s3://my-bucket/peac-receipts/
```

## Troubleshooting

### No receipts being generated

1. Check `enabled: true` in config
2. Verify signing key is accessible
3. Check output directory permissions
4. Look for errors in plugin stats

### Verification failures

1. Ensure JWKS includes the signing key
2. Check `kid` matches between receipt and JWKS
3. Verify algorithm compatibility (EdDSA, ES256, etc.)

### Performance issues

1. Increase `drain_interval_ms` for lower overhead
2. Reduce `batch_size` if memory constrained
3. Use faster storage for spool/receipts

## Migration from Earlier Versions

If upgrading from a pre-0.10.7 setup:

1. The `interaction_id` format changed to base64url encoding
2. Receipt files now use `.peac.json` extension
3. Atomic writes are now default (no partial files)

## References

- [Interaction Evidence Spec](../specs/INTERACTION-EVIDENCE.md)
- [PEAC Protocol Behavior](../specs/PROTOCOL-BEHAVIOR.md)
- [Workflow Correlation](../specs/WORKFLOW-CORRELATION.md)
- [API Reference](../api-reference.md)
