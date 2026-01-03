# Agent Identity Example

This example demonstrates PEAC Agent Identity attestations (v0.9.25+).

## Overview

Agent identity attestations enable cryptographic proof-of-control binding, allowing publishers to distinguish between:

- **Operator-verified bots**: Agents operated by known organizations (e.g., search crawlers)
- **User-delegated agents**: Agents acting on behalf of human users (e.g., AI assistants)

## Files

| File               | Description                                        |
| ------------------ | -------------------------------------------------- |
| `src/agent.ts`     | How agents create identity attestations            |
| `src/publisher.ts` | How publishers verify identity and evaluate access |
| `src/demo.ts`      | End-to-end demonstration                           |

## Running the Example

```bash
# Install dependencies
pnpm install

# Run the full demo
pnpm demo

# Or run individual components
pnpm start:agent      # Show attestation creation
pnpm start:publisher  # Show verification flow
```

## Example Output

```
=============================================
    PEAC Agent Identity Demo (v0.9.25)
=============================================

--- Scenario 1: Operator Bot ---

1. Agent creates attestation:
   - Agent ID: bot:crawler-prod-001
   - Control Type: operator
   - Operator: Example Crawler Inc.
   - Capabilities: crawl, index

2. Publisher verifies identity:
   - Valid: true
   - Agent ID: bot:crawler-prod-001
   - Control Type: operator

3. Publisher evaluates access:
   - Decision: allow
   - Rate Limit: 100 req/60s
```

## Control Types

### Operator

Operator bots are controlled by an organization and verified through:

- JWKS key directory
- HTTP message signatures
- Operator metadata

```typescript
const operatorBot = createOperatorBot({
  issuer: 'https://crawler.example.com',
  agentId: 'bot:crawler-prod-001',
  operator: 'Example Crawler Inc.',
  capabilities: ['crawl', 'index'],
  keyId: 'key-2026-01',
  keyDirectoryUrl: 'https://crawler.example.com/.well-known/jwks.json',
});
```

### User-Delegated

User-delegated agents act on behalf of human users:

- Include delegation chain showing authority path
- Use opaque user identifiers (not PII)
- Scoped capabilities

```typescript
const userAgent = createUserDelegatedAgent({
  issuer: 'https://assistant.example.com',
  agentId: 'agent:assistant-001',
  userId: 'user:alice-opaque-id',
  delegationChain: ['user:alice', 'app:myapp'],
  capabilities: ['inference', 'search'],
});
```

## Access Policies

Publishers can define policies based on control type:

```typescript
const policies: AccessPolicy[] = [
  {
    controlType: 'operator',
    decision: 'allow',
    rateLimit: { windowSeconds: 60, maxRequests: 100 },
  },
  {
    controlType: 'user-delegated',
    decision: 'allow',
    rateLimit: { windowSeconds: 60, maxRequests: 30 },
  },
  {
    controlType: '*',
    decision: 'deny',
  },
];
```

## Error Handling

The verification function returns standardized error codes:

| Error Code                  | Description                |
| --------------------------- | -------------------------- |
| `E_IDENTITY_MISSING`        | No attestation provided    |
| `E_IDENTITY_INVALID_FORMAT` | Schema validation failed   |
| `E_IDENTITY_EXPIRED`        | Attestation has expired    |
| `E_IDENTITY_NOT_YET_VALID`  | Future issued_at timestamp |

## See Also

- [AGENT-IDENTITY.md](../../docs/specs/AGENT-IDENTITY.md) - Full specification
- [@peac/schema](../../packages/schema/README.md) - Schema types
