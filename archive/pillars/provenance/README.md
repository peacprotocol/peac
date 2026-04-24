# @peac/provenance — ARCHIVED (empty pillar stub, v0.13.0)

> **ARCHIVED (v0.13.0).** `@peac/provenance` was an empty Layer-6 pillar
> stub in v0.12.14 (workspace-internal, never published to npm `latest`).
> As part of the v0.13.0 package-surface reduction pass (see
> `docs/PACKAGE_STATUS.md`), the workspace entry was removed and the
> source was moved from
> `packages/provenance/` to `archive/pillars/provenance/`.
>
> **This package is NOT published** at v0.13.0 or later. It was never
> published at v0.12.14. No throwing-stub replacement is published. No
> migration is required for external consumers, because none existed.
>
> The provenance pillar concept remains part of the PEAC 10-pillar taxonomy.
> It is a taxonomy label, not a shipped package. Any concrete
> implementation would be proposed in its own roadmap review and
> committed under `packages/provenance/` with real content.
>
> Below this banner is the historical README preserved verbatim for
> archaeology. It described the (unshipped) intent; it is no longer
> authoritative.

---

## Historical README (pre-archive)

# @peac/provenance

Provenance pillar package for PEAC protocol: content origin tracking, supply chain evidence, and verifiable chain-of-custody.

## Installation

```bash
pnpm add @peac/provenance
```

## What It Does

`@peac/provenance` provides the provenance pillar for the PEAC protocol stack. It supports content provenance tracking, supply chain evidence, and verifiable chain-of-custody for receipts and AI-generated content.

## How Do I Use It?

### Issue a provenance-tagged receipt

```typescript
import { issueWire02 } from '@peac/protocol';

const receipt = await issueWire02({
  iss: 'https://issuer.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/provenance',
  privateKey,
  kid: 'key-01',
  pillars: ['provenance'],
  extensions: {
    'org.peacprotocol/provenance': {
      source_uri: 'https://data.example.com/dataset-v3',
      hash_algorithm: 'sha-256',
      content_hash: 'abc123...',
    },
  },
});
```

### Validate provenance extension fields

```typescript
import { getProvenanceExtension } from '@peac/schema';

const provExt = getProvenanceExtension(claims);
if (provExt) {
  console.log(provExt.source_uri);
}
```

## Integrates With

- `@peac/schema` (Layer 1): Provenance extension group schema and accessor
- `@peac/protocol` (Layer 3): Receipt issuance with provenance pillar
- `@peac/attribution`: Content attribution and licensing

## For Agent Developers

If you are building agents that process, transform, or generate content, use the provenance pillar to record origin and chain-of-custody evidence alongside your interaction receipts.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
