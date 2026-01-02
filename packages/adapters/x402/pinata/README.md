# @peac/adapter-x402-pinata

x402+Pinata private IPFS objects adapter for PEAC protocol.

Maps Pinata private object access events to PaymentEvidence using the PEIP-OBJ/private@1 subject profile.

## Installation

```bash
pnpm add @peac/adapter-x402-pinata
```

## Usage

```typescript
import { fromAccessEvent, fromWebhookEvent } from '@peac/adapter-x402-pinata';

// Process an access event with CIDv0
const result = fromAccessEvent({
  accessId: 'acc_abc123',
  cid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  amount: 250, // in minor units (cents)
  currency: 'USD',
  visibility: 'private',
  contentType: 'application/json',
  contentSize: 1024,
});

if (result.ok) {
  console.log(result.value); // PaymentEvidence
  // evidence includes: store: 'ipfs', object_id: <CID>, profile: 'PEIP-OBJ/private@1'
} else {
  console.error(result.error);
}

// Process an access event with CIDv1
const resultV1 = fromAccessEvent({
  accessId: 'acc_xyz789',
  cid: 'bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku',
  amount: 100,
  currency: 'USD',
  ttl: 3600, // 1 hour
  expiresAt: '2025-12-31T23:59:59Z',
});

// Process a webhook event
const webhookResult = fromWebhookEvent({
  type: 'access.granted',
  data: {
    accessId: 'acc_def456',
    cid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
    amount: 500,
    currency: 'USD',
  },
});
```

## Configuration

```typescript
import { fromAccessEvent, type PinataConfig } from '@peac/adapter-x402-pinata';

const config: PinataConfig = {
  defaultEnv: 'test',
  defaultVisibility: 'private',
  allowedGateways: ['my-gateway.pinata.cloud'],
};

const result = fromAccessEvent(event, config);
```

## Supported CID Formats

- **CIDv0**: Base58btc encoded (starts with `Qm`)
- **CIDv1**: Base32 encoded (starts with `bafy` or other multibase prefixes)

## Documentation

See [peacprotocol.org](https://peacprotocol.org) for full documentation.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Originary](https://www.originary.xyz) | [Docs](https://peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac)
