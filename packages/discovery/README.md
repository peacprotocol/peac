# @peac/disc

Thin loader / validator and remote fetcher for `peac.txt` policy documents.

## Installation

```bash
pnpm add @peac/disc
```

## What It Does

`@peac/disc` is a thin wrapper around
[`@peac/policy-kit`](../policy-kit) specialized for the `peac.txt`
discovery surface. It:

- fetches `/.well-known/peac.txt` with `discover(origin)`,
- delegates parsing of `peac-policy/0.1` YAML / JSON bytes to
  `@peac/policy-kit.parsePolicyDocument`,
- returns a tolerant `ParseResult` (rather than throwing) that carries a
  validated `PolicyDocument`, error messages, and advisory warnings,
- tolerates legacy key-discovery lines (`verify:`, `public_keys:`, `jwks:`)
  in older example documents by stripping them before validation and
  surfacing a structured `PEAC_LEGACY_PEAC_TXT_KEY_FIELD`
  `DeprecationWarning`.

`peac.txt` is the **policy-document surface** per
`docs/specs/PEAC-TXT.md`. It is **not** a key discovery surface.
Cryptographic key resolution uses the normative chain
`iss` -> `/.well-known/peac-issuer.json` -> `jwks_uri` -> JWKS (see
`docs/specs/PEAC-ISSUER.md`). For that flow, use `parseIssuerConfig` /
`fetchIssuerConfig` from `@peac/protocol`.

## How Do I Use It?

### Parse a policy document

```typescript
import { parse } from '@peac/disc';

const result = parse(`
version: 'peac-policy/0.1'
defaults:
  decision: deny
rules:
  - name: allow-verified-agents
    subject:
      type: agent
      labels: [verified]
    purpose: inference
    decision: allow
`);

if (result.valid) {
  console.log(result.data?.version); // 'peac-policy/0.1'
  console.log(result.data?.rules[0].decision); // 'allow'
}

if (result.warnings) {
  // e.g. legacy key-discovery lines were stripped on parse
  console.warn(result.warnings);
}
```

### Emit a policy document as YAML

```typescript
import { emit } from '@peac/disc';
import { createExamplePolicy } from '@peac/policy-kit';

const yaml = emit(createExamplePolicy());
// Serve at /.well-known/peac.txt
```

### Fetch and parse from a remote origin

```typescript
import { discover, WELL_KNOWN_PATH } from '@peac/disc';

const result = await discover('https://example.com');
if (result.valid) {
  console.log(result.data);
}
console.log(WELL_KNOWN_PATH); // '/.well-known/peac.txt'
```

The caller's user-agent is taken from the `PEAC_USER_AGENT` environment
variable when present; otherwise `peac-disc` is used. `@peac/disc` does
not hard-code a package version in the user-agent (runtime-visible
version constants belong in release tooling).

## Limits

Per `docs/specs/PEAC-TXT.md` §6.1, remote documents larger than
**256 KiB** are rejected by `discover()`. Nesting depth, array length,
and string length limits are enforced by the underlying
`@peac/policy-kit` validator.

## Integrates With

- `@peac/policy-kit`: canonical compiler / parser / evaluator for
  `peac-policy/0.1` documents. `@peac/disc.parse` delegates to
  `@peac/policy-kit.parsePolicyDocument`.
- `@peac/protocol`: `parseIssuerConfig` / `fetchIssuerConfig` for the
  normative key-discovery chain.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community
contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
