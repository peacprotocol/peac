# PEAC Interaction Evidence Specification

**Version:** 0.1
**Status:** Draft
**Target:** v0.10.7
**Extension Key:** `org.peacprotocol/interaction@0.1`

**Terminology:** This specification uses MUST, SHOULD, and MAY per RFC 2119. Sections labeled "Non-Normative" are implementation guidance and not conformance requirements.

## Abstract

This specification defines the InteractionEvidence extension for PEAC Protocol, enabling verifiable capture of tool calls, API requests, and other agent interactions. The design provides:

1. **InteractionEvidenceV01** - Per-receipt extension capturing what happened
2. **Privacy-first hashing** - Payload digests with configurable redaction
3. **Platform-neutral capture** - Works with OpenClaw, MCP, A2A, and custom frameworks

These primitives enable auditors, compliance systems, and cross-organization partners to verify what actions an agent took without requiring access to the original payloads.

## Table of Contents

1. [Motivation](#1-motivation)
2. [Design Principles](#2-design-principles)
3. [Extension Placement](#3-extension-placement)
4. [Schema](#4-schema)
5. [Digest Algorithms](#5-digest-algorithms)
6. [Validation Rules](#6-validation-rules)
7. [Kind Registry](#7-kind-registry)
8. [SDK Accessors](#8-sdk-accessors)
9. [Security Considerations](#9-security-considerations)
10. [Conformance](#10-conformance)

## 1. Motivation

Agent systems increasingly perform actions with real-world consequences: API calls, file operations, payments, and tool invocations. Current observability provides:

- **Framework-native logs** - Not portable or independently verifiable
- **Telemetry spans** - Ephemeral, subject to sampling
- **Blockchain proofs** - High latency, infrastructure requirements

PEAC fills the gap by providing **portable, offline-verifiable, signed interaction records** without requiring blockchain infrastructure or access to original payloads.

### Use Cases

1. **Compliance** - EU AI Act Article 12 requires audit trails for AI systems
2. **Dispute resolution** - Prove what tool was called with what inputs
3. **Forensics** - Reconstruct agent behavior after incidents
4. **Billing verification** - Prove API calls for metered services

## 2. Design Principles

### 2.1 Non-Breaking (Wire Stability)

All interaction fields use the existing extensions mechanism. The wire format `peac-receipt/0.1` remains FROZEN.

**Critical**: `InteractionEvidence` is stored at `evidence.extensions["org.peacprotocol/interaction@0.1"]`, NOT as a top-level `evidence.interaction` field.

### 2.2 Privacy-First

- **Hash-only by default** - Payloads are never stored in receipts
- **Redaction modes** - Explicit indication of what was captured
- **Truncation transparency** - Algorithm identifiers include truncation indicator

### 2.3 Platform-Neutral

The capture primitives work with any agent platform. The `executor.platform` field is an open string identifier -- any value matching the grammar `/^[a-z][a-z0-9._-]*$/` (max 64 chars) is valid.

Well-known platforms (informational):

- `openclaw` - OpenClaw agent framework
- `mcp` - Model Context Protocol
- `a2a` - Google Agent2Agent Protocol
- `claude-code` - Claude Code CLI
- `custom` - Generic/custom platforms

### 2.4 One Receipt Per Interaction

Each receipt captures exactly one interaction. Do NOT batch multiple interactions in a single receipt. Use bundles for batching.

## 3. Extension Placement

### 3.1 Wire Location

```
evidence.extensions["org.peacprotocol/interaction@0.1"]
```

The constant `INTERACTION_EXTENSION_KEY` is exported from `@peac/schema` for programmatic access.

### 3.2 Example Receipt

```json
{
  "auth": {
    "iss": "https://issuer.example.com",
    "aud": "https://resource.example.com",
    "iat": 1706745600,
    "rid": "r_01HXYZ..."
  },
  "evidence": {
    "extensions": {
      "org.peacprotocol/interaction@0.1": {
        "interaction_id": "openclaw/cnVuXzEyMw/Y2FsbF80NTY",
        "kind": "tool.call",
        "executor": {
          "platform": "openclaw",
          "version": "0.2.0",
          "plugin_id": "peac-receipts"
        },
        "tool": {
          "name": "web_search",
          "provider": "builtin"
        },
        "input": {
          "digest": {
            "alg": "sha-256",
            "value": "abc123...64hex",
            "bytes": 1024
          },
          "redaction": "hash_only"
        },
        "output": {
          "digest": {
            "alg": "sha-256",
            "value": "def456...64hex",
            "bytes": 8192
          },
          "redaction": "hash_only"
        },
        "started_at": "2024-02-01T10:00:00Z",
        "completed_at": "2024-02-01T10:00:01Z",
        "result": {
          "status": "ok"
        }
      }
    }
  }
}
```

## 4. Schema

### 4.1 InteractionEvidenceV01

```typescript
interface InteractionEvidenceV01 {
  /** Stable ID for idempotency/dedupe (REQUIRED) */
  interaction_id: string;

  /** Event kind - open string, not closed enum (REQUIRED) */
  kind: string;

  /** Executor identity (REQUIRED) */
  executor: Executor;

  /** Tool target (when kind is tool-related) */
  tool?: ToolTarget;

  /** Resource target (when kind is http/fs-related) */
  resource?: ResourceTarget;

  /** Input payload reference */
  input?: PayloadRef;

  /** Output payload reference */
  output?: PayloadRef;

  /** Start time RFC 3339 (REQUIRED) */
  started_at: string;

  /** Completion time RFC 3339 */
  completed_at?: string;

  /** Duration in milliseconds (non-normative) */
  duration_ms?: number;

  /** Execution outcome */
  result?: Result;

  /** Policy context at execution */
  policy?: PolicyContext;

  /** References to related evidence */
  refs?: Refs;

  /** Platform-specific extensions (MUST be namespaced) */
  extensions?: Record<string, unknown>;
}
```

### 4.2 Digest

```typescript
interface Digest {
  /** Algorithm identifier (REQUIRED) */
  alg: 'sha-256' | 'sha-256:trunc-64k' | 'sha-256:trunc-1m';

  /** 64 lowercase hex characters (REQUIRED) */
  value: string;

  /** Original byte length before truncation (REQUIRED) */
  bytes: number;
}
```

### 4.3 PayloadRef

```typescript
interface PayloadRef {
  /** Content digest */
  digest: Digest;

  /** Redaction mode */
  redaction: 'hash_only' | 'redacted' | 'plaintext_allowlisted';
}
```

### 4.4 Executor

```typescript
interface Executor {
  /** Platform identifier (REQUIRED) */
  platform: string;

  /** Platform version */
  version?: string;

  /** Plugin that captured this */
  plugin_id?: string;

  /** Hash of plugin package (provenance) */
  plugin_digest?: Digest;
}
```

### 4.5 ToolTarget

```typescript
interface ToolTarget {
  /** Tool name (REQUIRED) */
  name: string;

  /** Tool provider */
  provider?: string;

  /** Tool version */
  version?: string;
}
```

### 4.6 ResourceTarget

```typescript
interface ResourceTarget {
  /** Resource URI */
  uri?: string;

  /** HTTP method or operation type */
  method?: string;
}
```

### 4.7 Result

```typescript
interface Result {
  /** Outcome status (REQUIRED) */
  status: 'ok' | 'error' | 'timeout' | 'canceled';

  /** Error code if status is error */
  error_code?: string;

  /** Whether the operation can be retried */
  retryable?: boolean;
}
```

### 4.8 PolicyContext

```typescript
interface PolicyContext {
  /** Policy decision */
  decision: 'allow' | 'deny' | 'constrained';

  /** Whether sandbox was enabled */
  sandbox_enabled?: boolean;

  /** Whether elevated permissions were used */
  elevated?: boolean;

  /** Hash of effective policy */
  effective_policy_digest?: Digest;
}
```

### 4.9 Refs

```typescript
interface Refs {
  /** Link to evidence.payment if applicable */
  payment_reference?: string;

  /** Link to related receipt */
  related_receipt_rid?: string;
}
```

## 5. Digest Algorithms

### 5.1 Canonical Algorithm Set

PEAC defines a canonical set of digest algorithms:

| Algorithm           | Description           | Threshold |
| ------------------- | --------------------- | --------- |
| `sha-256`           | Full SHA-256          | <= 1MB    |
| `sha-256:trunc-64k` | SHA-256 of first 64KB | > 64KB    |
| `sha-256:trunc-1m`  | SHA-256 of first 1MB  | > 1MB     |

**Algorithm handling:**

- Implementations MUST accept the canonical set above
- Default validators MUST reject unknown algorithms with `E_INTERACTION_INVALID_DIGEST_ALG`
- Implementations MAY provide an "accept-unknown" mode as a validator configuration option; in this mode:
  - Validation passes (receipt is structurally valid)
  - The digest MUST NOT be treated as verified (cannot be used for payload binding)
  - Implementations SHOULD surface a warning (recommended code: `W_INTERACTION_UNKNOWN_DIGEST_ALG`)

### 5.2 Size Constants

```typescript
const DIGEST_SIZE_CONSTANTS = {
  k: 1024, // 1 KB = 1024 bytes (binary)
  m: 1024 * 1024, // 1 MB = 1048576 bytes (binary)
  'trunc-64k': 65536, // 64 * 1024
  'trunc-1m': 1048576, // 1024 * 1024
};
```

### 5.3 Hashing Rules

1. Hash **raw bytes as observed** (exact request/response body bytes)
2. NO JSON canonicalization for payload hashing
3. UTF-8 encoding assumed for text; binary preserved as-is
4. `bytes` field MUST contain original byte length before any truncation
5. If truncation occurred, `alg` MUST reflect it

### 5.4 Example

```typescript
function computeDigest(payload: Uint8Array): Digest {
  const TRUNC_THRESHOLD = 1024 * 1024; // 1MB

  if (payload.length <= TRUNC_THRESHOLD) {
    return {
      alg: 'sha-256',
      value: sha256Hex(payload),
      bytes: payload.length,
    };
  }

  // Truncate to first 1MB
  return {
    alg: 'sha-256:trunc-1m',
    value: sha256Hex(payload.slice(0, TRUNC_THRESHOLD)),
    bytes: payload.length, // Original size for audit
  };
}
```

## 6. Validation Rules

### 6.1 Required Fields

| Field               | Requirement |
| ------------------- | ----------- |
| `interaction_id`    | REQUIRED    |
| `kind`              | REQUIRED    |
| `executor.platform` | REQUIRED    |
| `started_at`        | REQUIRED    |

### 6.2 Timing Invariant

If `completed_at` is present, it MUST be >= `started_at`.

**Error code:** `E_INTERACTION_INVALID_TIMING`

### 6.3 Output Requires Result

If `output` is present, `result.status` MUST also be present.

**Error code:** `E_INTERACTION_MISSING_RESULT`

### 6.4 Error Requires Detail

If `result.status` is `'error'`, either `error_code` or `extensions` MUST be present.

**Error code:** `E_INTERACTION_MISSING_ERROR_DETAIL`

### 6.5 Target Consistency

- `tool.*` kinds MUST have `tool` field
- `http.*` and `fs.*` kinds MUST have `resource` field

**Error code:** `E_INTERACTION_MISSING_TARGET`

### 6.6 Extension Key Namespacing

Extension keys MUST match the pattern:

```
^([a-z0-9-]+\.)+[a-z0-9-]+\/[a-z][a-z0-9._:-]{0,126}[a-z0-9](?:@[0-9]+(?:\.[0-9]+)*)?$
```

Examples:

- `com.example/foo`
- `org.openclaw/context`
- `org.peacprotocol/interaction@0.1`

**Error code:** `E_INTERACTION_INVALID_EXTENSION_KEY`

### 6.7 Validation Order

When multiple rules are violated, implementations MUST evaluate in this order and return the first error:

1. Required field format (interaction_id, kind, executor.platform, started_at)
2. Digest validation (alg, value format, bytes)
3. Timing invariant
4. Output-result invariant
5. Error-detail invariant
6. Target consistency
7. Extension key validation

## 7. Kind Registry

### 7.1 Recommended Kinds

| Kind           | Description          | Required Target |
| -------------- | -------------------- | --------------- |
| `tool.call`    | Tool/function call   | `tool`          |
| `http.request` | HTTP API request     | `resource`      |
| `fs.read`      | File system read     | `resource`      |
| `fs.write`     | File system write    | `resource`      |
| `message`      | Message/conversation | None            |

### 7.2 Custom Kinds

Custom kinds should use reverse-DNS format:

```
custom:<reverse-dns>
<reverse-dns>:<token>
```

Examples:

- `custom:com.example/special-action`
- `com.mycompany:internal-tool`

### 7.3 Reserved Prefixes

The following prefixes are reserved. Using them without being in the registry produces a warning:

- `peac.*`
- `org.peacprotocol.*`

### 7.4 Kind Format

Pattern: `^[a-z][a-z0-9._:-]{0,126}[a-z0-9]$`

- Lowercase only
- 2-128 characters
- Starts with letter
- Ends with letter or digit

## 8. SDK Accessors

### 8.1 Getter

```typescript
import { getInteraction } from '@peac/schema';

const interaction = getInteraction(receipt);
// Returns InteractionEvidenceV01 | undefined
```

### 8.2 Setter

```typescript
import { setInteraction } from '@peac/schema';

setInteraction(receipt, {
  interaction_id: 'my-id',
  kind: 'tool.call',
  executor: { platform: 'custom' },
  started_at: new Date().toISOString(),
  // ...
});
```

### 8.3 Type Guard

```typescript
import { hasInteraction } from '@peac/schema';

if (hasInteraction(receipt)) {
  // TypeScript knows interaction exists
  const interaction = getInteraction(receipt)!;
}
```

### 8.4 Receipt View

```typescript
import { createReceiptView } from '@peac/schema';

const view = createReceiptView(envelope);
// view.interaction - typed InteractionEvidenceV01 | undefined
// view.interactions - array form for pipelines
// view.workflow - WorkflowContext if present
```

## 9. Security Considerations

### 9.1 Privacy Defaults

1. **Hash-only by default** - `redaction: "hash_only"` is the default
2. **Size caps** - Large payloads use truncated hash algorithm
3. **Allowlist required** - Plaintext capture requires explicit tool allowlist

### 9.2 Implementation Guidance (Non-Normative)

Implementations SHOULD consider:

- **Secret detection** - Validate inputs don't match common API key, token, or password patterns before hashing
- **Audit logging** - Log capture events separately from receipt content for debugging
- **Rate limiting** - Apply capture rate limits to prevent resource exhaustion

### 9.3 What Receipts Prove

- A tool call was recorded at time T
- Inputs/outputs had digests H1, H2
- Policy P was in effect (if captured)
- Receipt was signed by key K (verifiable)

### 9.4 What Receipts Do NOT Prove

- Tool actually executed (runtime can lie)
- Inputs/outputs weren't modified post-hoc
- Attacker didn't have access to signing key
- Prevention of malicious behavior

### 9.5 Signing Key Protection

For production deployments:

| Level | Method                | Security      |
| ----- | --------------------- | ------------- |
| 1     | Environment variable  | Development   |
| 2     | OS Keychain           | Recommended   |
| 3     | Sidecar signer        | Enterprise    |
| 4     | Hardware module (HSM) | High security |

## 10. Conformance

### 10.1 Conformance Levels

**MUST** (enforced at issuance):

- Validate required fields present
- Validate digest format (64 lowercase hex)
- Validate digest algorithm in canonical set
- Validate timing invariant
- Validate output-result invariant
- Validate kind format
- Validate extension key namespacing

**SHOULD**:

- Use SDK accessors for reading/writing
- Capture `duration_ms` from monotonic clock
- Include `completed_at` when known
- Use recommended kinds from registry

**MAY**:

- Include platform-specific extensions
- Capture policy context
- Link to related receipts

### 10.2 Error Codes

| Code                                  | HTTP | Description                         |
| ------------------------------------- | ---- | ----------------------------------- |
| `E_INTERACTION_INVALID_KIND_FORMAT`   | 400  | Kind fails format validation        |
| `E_INTERACTION_KIND_RESERVED`         | 400  | Reserved prefix misuse              |
| `E_INTERACTION_MISSING_EXECUTOR`      | 400  | Executor field required             |
| `E_INTERACTION_INVALID_DIGEST`        | 400  | Malformed digest value              |
| `E_INTERACTION_INVALID_DIGEST_ALG`    | 400  | Unknown digest algorithm            |
| `E_INTERACTION_INVALID_TIMING`        | 400  | completed_at < started_at           |
| `E_INTERACTION_MISSING_RESULT`        | 400  | output present but no result.status |
| `E_INTERACTION_MISSING_ERROR_DETAIL`  | 400  | error status but no error_code      |
| `E_INTERACTION_MISSING_TARGET`        | 400  | kind requires missing target field  |
| `E_INTERACTION_INVALID_EXTENSION_KEY` | 400  | Extension key not namespaced        |

### 10.3 Warning Codes

| Code                               | Description                                         |
| ---------------------------------- | --------------------------------------------------- |
| `W_INTERACTION_KIND_UNREGISTERED`  | Kind not in recommended registry                    |
| `W_INTERACTION_MISSING_TARGET`     | No tool or resource field                           |
| `W_INTERACTION_UNKNOWN_DIGEST_ALG` | Unknown digest algorithm (accept-unknown mode only) |

### 10.4 Test Vectors

Conformance fixtures are provided at:

```text
specs/conformance/fixtures/interaction/
  valid.json           # Valid InteractionEvidence vectors
  invalid.json         # Invalid vectors that must be rejected
  edge-cases.json      # Boundary conditions and limits
```

## References

- [PEAC Protocol Behavior](./PROTOCOL-BEHAVIOR.md) - Core protocol specification
- [Workflow Correlation](./WORKFLOW-CORRELATION.md) - Multi-step workflow linking
- [RFC 6234: SHA-256](https://datatracker.ietf.org/doc/html/rfc6234) - Hash algorithm
- [RFC 3339: Date/Time Format](https://datatracker.ietf.org/doc/html/rfc3339) - Timestamp format
