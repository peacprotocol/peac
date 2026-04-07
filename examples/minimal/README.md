# Minimal Issuance Example

Issues an evidence receipt with a commerce extension, verifies it locally, and demonstrates the typed extension accessor.

## Run

```bash
pnpm install
pnpm demo
```

## What it demonstrates

- `issue()` to create an evidence receipt
- `verifyLocal()` verifies receipts (returns `wireVersion: '0.2'`)
- `getCommerceExtension()` typed accessor from `@peac/schema`
- Warning plumbing (empty for registered types; try changing `type` to `com.example/custom-flow` to see `type_unregistered`)
