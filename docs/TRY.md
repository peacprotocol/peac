# Try PEAC in 5 minutes

A PEAC record is portable signed evidence that another party can verify offline.
This guide uses the PEAC CLI to generate sample records and verify one of them
with nothing but a public key. No network access and no issuer discovery are
required.

## Generate and verify offline

Run both commands in order. The first generates a set of sample records and a
sandbox key set. The second verifies one record against that public key.

```bash
pnpm dlx @peac/cli samples generate -o ./s
pnpm dlx @peac/cli verify ./s/valid/basic-record.jws --public-key ./s/bundles/sandbox-jwks.json
```

The expected output of the verify command is:

```
Signature valid (offline).
```

That confirms the record's signature checks out against the supplied key,
without contacting any issuer.

## What just happened

- `samples generate` wrote sample records under `./s/valid/` and a sandbox key
  set under `./s/bundles/sandbox-jwks.json`.
- `verify --public-key` checked the record's signature against that key. Because
  a key was supplied directly, the command did no network lookup.

## Next steps

- The same copy-paste walkthrough also appears in the README: [Try it in 5 minutes](../README.md#try-it-in-5-minutes).
- Browse runnable flows under [examples](../examples/README.md).
