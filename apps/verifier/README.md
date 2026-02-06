# @peac/app-verifier

Browser-based PEAC receipt verifier. Pure client-side -- no server, all verification runs locally.

## Quick Start

```bash
pnpm install
pnpm dev
# Opens on http://localhost:5173
```

Build for production:

```bash
pnpm build
# Static output in dist/ -- deploy anywhere
```

## How It Works

The verifier uses `verifyLocal()` from `@peac/protocol` to verify receipt signatures entirely in the browser. No receipts are sent to any server.

### Verification Flow

1. Paste a JWS receipt or upload a file (.jwt, .jws, .json)
2. The app decodes the JWS header to extract `kid` (key ID)
3. Looks up the key in the local trust store
4. Verifies the Ed25519 signature using `verifyLocal()`
5. Displays claims breakdown with VALID/INVALID status

## Features

- **Paste and verify** -- Textarea input for JWS receipts
- **File upload** -- Drag-and-drop support for .jwt, .jws, .json files
- **Trust configuration** -- Add/remove trusted issuers and public keys via the UI
- **Offline mode** -- Service worker caches the app shell for offline use
- **Claims display** -- Formatted breakdown of all receipt claims

## Trust Store

The verifier maintains a local trust store in `localStorage`. You must add trusted issuer public keys before verification will succeed.

To verify sandbox receipts:

1. Open the Trust Configuration tab
2. Add the sandbox issuer public key (from `https://sandbox.peacprotocol.org/.well-known/jwks.json`)

## Architecture

- Pure static site built with Vite
- No API calls, no Hono, no server component
- All verification via `verifyLocal()` in-browser
- Service worker (`public/sw.js`) caches app shell
- Trust store persisted in `localStorage`

## License

Apache-2.0
