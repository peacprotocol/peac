# @peac/policy-kit

Deterministic policy evaluation for PEAC Control Abstraction Layer (CAL) semantics. No scripting, no dynamic code.

## Installation

```bash
pnpm add @peac/policy-kit
```

## What It Does

`@peac/policy-kit` provides a file-based policy format (YAML or JSON) with first-match-wins rule semantics for controlling access to resources. It evaluates policies deterministically with no side effects, supports subject matching by type, labels, and ID patterns, and compiles policies into `peac.txt`, `robots.txt`, and AIPREF artifacts. Includes built-in enforcement profiles (strict, balanced, open) and a profile system for reusable policy templates.

## How Do I Use It?

### Load and evaluate a policy

```typescript
import { loadPolicy, evaluate, isAllowed } from '@peac/policy-kit';

const policy = loadPolicy('peac-policy.yaml');

const result = evaluate(policy, {
  subject: { type: 'agent', labels: ['verified'] },
  purpose: 'inference',
  licensing_mode: 'subscription',
});

console.log(result.decision); // 'allow', 'deny', or 'review'
console.log(isAllowed(result)); // true
```

### Compile policy to discovery artifacts

```typescript
import { compilePeacTxt, compileRobotsSnippet, compileAiprefTemplates } from '@peac/policy-kit';

const peacTxt = compilePeacTxt(policy);
const robotsTxt = compileRobotsSnippet(policy);
const aiprefTemplates = compileAiprefTemplates(policy);
```

### Use enforcement profiles for HTTP responses

```typescript
import { getEnforcementProfile, enforceForHttp } from '@peac/policy-kit';

const profile = getEnforcementProfile('balanced');

const httpResult = enforceForHttp({
  decision: evaluationResult,
  profile,
  request: { method: 'GET', path: '/content' },
});

console.log(httpResult.statusCode); // 200, 403, etc.
```

## Integrates With

- `@peac/schema` (Layer 1): Zod schemas for policy validation
- `@peac/disc`: Discovery document generation from compiled policies
- `@peac/middleware-express`: HTTP enforcement middleware
- `@peac/protocol` (Layer 3): Policy binding and digest verification

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
