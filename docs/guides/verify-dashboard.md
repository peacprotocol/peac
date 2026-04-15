# PEAC Verify Dashboard (offline, self-hosted)

A single-file HTML viewer that decodes PEAC Interaction Records
(compact JWS) in the browser without any outbound network call.
Signature verification is intentionally omitted in the default offline
mode; issuer keys and JWKS resolution remain opt-in and out of scope
for this viewer.

## Use

```bash
open tools/verify-dashboard/index.html
```

Paste a compact JWS into the text area and click Inspect. The header
and payload are shown. If the header `typ` is not
`interaction-record+jwt` a warning is shown.

## What it does NOT do

- No signature verification (offline mode).
- No JWKS fetching.
- No network calls of any kind.
- No telemetry, analytics, or cookies.

## Host it yourself

`tools/verify-dashboard/index.html` is a single file with zero external
dependencies and no CDN references. Serve it from any static host or
open it directly in a browser via `file://`.

## Extending to full verification

If you want to add signature verification, bundle `@peac/crypto`
locally (for example via `esbuild --bundle --format=iife`) and wire it
into the click handler. Keep remote JWKS resolution behind an explicit
opt-in checkbox so the default stays offline.

## Trust boundary

- The page contains no remote assets. Verify with your browser's
  devtools Network tab.
- The page inspects only what the user pastes; nothing leaves the
  browser.
