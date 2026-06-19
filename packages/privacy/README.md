# @peac/privacy

Privacy pillar package for PEAC protocol: data protection, retention policies, and privacy-preserving receipt mechanisms.

## Installation

```bash
pnpm add @peac/privacy
```

## What It Does

`@peac/privacy` provides the privacy pillar for the PEAC protocol stack. It defines privacy-preserving receipt mechanisms, data retention policies, and privacy budget management for systems that handle evidence receipts containing potentially sensitive data.

## How Do I Use It?

### Issue a privacy-tagged receipt

```typescript
import { issue } from '@peac/protocol';

const receipt = await issue({
  iss: 'https://issuer.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/privacy',
  privateKey,
  kid: 'key-01',
  pillars: ['privacy'],
  extensions: {
    'org.peacprotocol/privacy': {
      retention_days: 90,
      purpose_limitation: 'fraud-prevention',
    },
  },
});
```

### Validate privacy extension fields

```typescript
import { getPrivacyExtension } from '@peac/schema';

const privacyExt = getPrivacyExtension(claims);
if (privacyExt) {
  console.log(privacyExt.retention_days);
}
```

## Integrates With

- `@peac/schema` (Layer 1): Privacy extension group schema and accessor
- `@peac/protocol` (Layer 3): Receipt issuance with privacy pillar
- `@peac/compliance`: Governance and regulatory compliance

## For Agent Developers

If you are building agents that handle personal data or operate under GDPR, use the privacy pillar to record data protection evidence alongside your interaction receipts.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
