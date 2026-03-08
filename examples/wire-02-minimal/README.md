# Wire 0.2 Minimal Example

Issues a Wire 0.2 evidence receipt with a commerce extension, verifies it locally, and demonstrates the typed extension accessor.

## Run

```bash
pnpm install
pnpm demo
```

## What it demonstrates

- `issue()` to create a Wire 0.2 evidence receipt
- `verifyLocal()` verifies Wire 0.2 receipts (returns `wireVersion: '0.2'`)
- `getCommerceExtension()` typed accessor from `@peac/schema`
- Warning plumbing (empty for registered types; try changing `type` to `com.example/custom-flow` to see `type_unregistered`)
