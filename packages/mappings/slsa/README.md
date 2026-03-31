# @peac/mappings-slsa

SLSA v1.2 provenance mapping for PEAC: bidirectional mapping between SLSA provenance predicates and PEAC provenance extension fields.

## Installation

```bash
pnpm add @peac/mappings-slsa
```

## What It Does

`@peac/mappings-slsa` maps SLSA v1.2 provenance predicates to PEAC provenance extension fields and back. It populates the `slsa` field on the provenance extension with track, level, and version metadata.

## How Do I Use It?

### Map SLSA provenance to PEAC

```typescript
import { toPeacFromSlsa } from '@peac/mappings-slsa';

const { extensionKey, extension } = toPeacFromSlsa(
  {
    buildDefinition: { buildType: 'https://github.com/actions/runner' },
    runDetails: { builder: { id: 'https://github.com/actions/runner/v2' } },
  },
  { level: 3 }
);
// extension.slsa: { track: 'build', level: 3, version: '1.2' }
```

### Map PEAC provenance back to SLSA

```typescript
import { fromPeacToSlsa } from '@peac/mappings-slsa';

const provenance = fromPeacToSlsa({
  source_type: 'derived',
  source_ref: 'https://github.com/actions/runner',
  verification_method: 'https://github.com/actions/runner/v2',
  slsa: { track: 'build', level: 3, version: '1.2' },
});
// provenance.buildDefinition.buildType: 'https://github.com/actions/runner'
```

## Integrates With

- `@peac/schema` (Layer 1): ProvenanceExtensionSchema with SlsaLevel validation
- `@peac/mappings-intoto`: in-toto v1.0 attestation mapping (companion package)
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
