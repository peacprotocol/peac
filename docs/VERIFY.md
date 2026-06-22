# Verify a PEAC record

In this quickstart, the record is carried as a compact JWS string. You can verify
it offline with the issuer public key, either from the command line or from
TypeScript. Neither path needs network access when the key is supplied directly.

## Command line

First generate the sample directory, then verify one record against the bundled
sandbox key:

```bash
pnpm dlx @peac/cli samples generate -o ./s
pnpm dlx @peac/cli verify ./s/valid/basic-record.jws --public-key ./s/bundles/sandbox-jwks.json
```

The expected verify output is:

```
Signature valid (offline).
```

For more on generating sample records, see [Try PEAC in 5 minutes](TRY.md).

## Library

In code, read the record from the `PEAC-Receipt` response header and verify it
with `verifyLocal()`:

```typescript
import { verifyLocal } from '@peac/protocol';

const recordJws = response.headers.get('PEAC-Receipt');

if (!recordJws) {
  throw new Error('Missing PEAC-Receipt header');
}

const result = await verifyLocal(recordJws, publicKey, {
  issuer: 'https://api.example.com',
});

if (!result.valid) {
  throw new Error(`${result.code}: ${result.message}`);
}

console.log(result.claims.iss, result.claims.kind, result.claims.type);
```

A successful result exposes the verified claims. A failed result carries a stable
`code` and `message` so callers can fail closed.

## Next steps

- [Start Here](START_HERE.md#i-want-to-verify-a-receipt) walks through the verify path end to end.
- [examples/minimal](../examples/minimal/) shows typed accessor helpers.
- Self-host the [reference verifier](../surfaces/reference-verifier/).
