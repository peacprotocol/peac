# @peac/app-verifier

Browser-based PEAC record verifier. A user supplies a compact PEAC record, the public key
material (JWK or JWKS) and optional verification expectations; verification runs entirely in the
browser with `verifyLocal()` from `@peac/protocol`. The application performs no network requests
after loading, stores nothing, registers no service worker, and renders claims only after a
signature verifies.

## Quick start

```bash
pnpm install
pnpm build            # workspace packages first
pnpm --filter @peac/app-verifier dev
```

Build for production:

```bash
pnpm --filter @peac/app-verifier build
# Static output in dist/
```

## Verification model

- The supplied key document is the only key material; nothing is fetched or persisted.
- Results distinguish signature validity, record validation, trusted-key expectation and claim
  constraints; claims are shown only on success.
- A supplied trusted JWK thumbprint is the only trust anchor. Issuer, key id and record type
  expectations are claim constraints, not trust anchors.
- Reports are deterministic and unsigned; identical verification inputs and evaluation time produce byte-identical reports.

## Browser support and validation

| Category                        | Coverage                                                            |
| ------------------------------- | ------------------------------------------------------------------- |
| Automated compatibility matrix  | Chromium, Firefox and WebKit against the production build           |
| Release validation requirement  | Chrome Stable, Safari Stable and Edge Stable                        |
| Mobile compatibility matrix     | Mobile Safari and Mobile Chrome emulation                           |
| Other Chromium-derived browsers | Expected to work from the shared engine; not individually validated |

WebCrypto is a secure-context API: production deployments use HTTPS; loopback origins serve
local development and testing, where user agents treat them as trustworthy. A runtime without
WebCrypto Ed25519 receives a capability message and a disabled verify control rather than a
verification failure. Application console errors fail the matrix.

## Browser matrix

```bash
pnpm --filter @peac/app-verifier build
node apps/verifier/tests/browser/run-browser-matrix.mjs --deps <playwright-install-root>
```

The matrix drives the production build through Chromium, Firefox and WebKit plus mobile
emulation, and asserts the verification flows, deterministic results, input-snapshot binding,
the capability path, zero network requests during verification, zero persistence and an
eval-free bundle. Playwright is provided externally and is never a repository dependency;
`tests/browser-matrix-wiring.test.ts` verifies the contract shape in ordinary CI.

## Deployment notes

- Serve over HTTPS with `frame-ancestors 'none'` (HTTP header; user agents ignore it in a meta
  tag) and `X-Frame-Options: DENY`.
- An origin that previously served a service worker must ship an unregistration path; deleting
  the worker file does not remove an existing registration.

## License

Apache-2.0
