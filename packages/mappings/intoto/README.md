# @peac/mappings-intoto

in-toto v1.0 attestation mapping for PEAC: bidirectional mapping between in-toto Statement envelopes and PEAC provenance extension fields.

## Installation

```bash
pnpm add @peac/mappings-intoto
```

## What It Does

`@peac/mappings-intoto` maps in-toto v1.0 attestation statements to PEAC provenance extension fields and back. It handles envelope-level mapping (subjects, predicate type) without parsing full predicate bodies.

## How Do I Use It?

### Map in-toto Statement to PEAC provenance

```typescript
import { toPeacFromInToto, INTOTO_STATEMENT_TYPE } from '@peac/mappings-intoto';

const statement = {
  _type: INTOTO_STATEMENT_TYPE,
  subject: [{ uri: 'https://example.com/artifact.tar.gz', digest: { sha256: 'abc123...' } }],
  predicateType: 'https://slsa.dev/provenance/v1',
};

const { extensionKey, extension } = toPeacFromInToto(statement);
// extensionKey: 'org.peacprotocol/provenance'
// extension.source_ref: 'https://example.com/artifact.tar.gz'
```

### Map PEAC provenance back to in-toto Statement

```typescript
import { fromPeacToInToto } from '@peac/mappings-intoto';

const statement = fromPeacToInToto({
  source_type: 'derived',
  source_ref: 'sha256:abc123...',
  verification_method: 'https://slsa.dev/provenance/v1',
});
// statement._type: 'https://in-toto.io/Statement/v1'
// statement.subject[0].digest: { sha256: 'abc123...' }
```

## Integrates With

- `@peac/schema` (Layer 1): ProvenanceExtensionSchema validation
- `@peac/mappings-slsa`: SLSA v1.2 provenance mapping (companion package)
- `@peac/protocol` (Layer 3): Receipt issuance with provenance extension

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
