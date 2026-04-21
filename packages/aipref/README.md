# @peac/pref (DEPRECATED)

> **Deprecated as of v0.12.14.** `@peac/pref` is now a thin facade over
> [`@peac/mappings-content-signals`](../mappings/content-signals/). Use
> `@peac/mappings-content-signals` directly for RFC-compliant parsing and
> resolution. Importing `@peac/pref` emits a one-shot
> `PEAC_DEPRECATED_PREF` `DeprecationWarning`. Removal target: next cleanup
> release.

## Why it's deprecated

The pre-v0.12.14 `@peac/pref` shipped:

- a comma-split `Content-Usage` header parser (not RFC 8941 / 9651
  structured fields),
- a truncated 12-character digest labelled `JCS-SHA256` (not RFC 8785
  canonical + full SHA-256),
- in-package `fetch()` calls for `peac.txt`, AIPREF JSON, and `robots.txt`
  (parsing packages should not perform network I/O),
- comment-line scanning of `peac.txt` for policy hints.

All four behaviours are replaced in v0.12.14:

| Concern                 | Pre-v0.12.14                                 | v0.12.14+ facade                                                                           |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `Content-Usage` parsing | comma-split strings                          | `@peac/mappings-content-signals.parseContentUsage` (RFC 9651 Structured Fields Dictionary) |
| `robots.txt` parsing    | custom regex parser                          | `@peac/mappings-content-signals.parseRobotsTxt` (RFC 9309)                                 |
| tdmrep parsing          | not supported                                | `@peac/mappings-content-signals.parseTdmrep`                                               |
| Precedence resolution   | priority loop in `PrefResolver`              | `@peac/mappings-content-signals.resolveSignals`                                            |
| Digest                  | truncated 12-hex                             | `@peac/crypto.jcsHash` (RFC 8785 JCS + full SHA-256)                                       |
| Network I/O             | `fetch()` for peac.txt / AIPREF / robots.txt | **removed**; callers pass pre-fetched bytes                                                |

## Behavior changes (deprecation-window, v0.12.14)

These are deliberate behavioral changes inside the one-minor deprecation
window. Callers that treated `@peac/pref` outputs as opaque are not
affected; callers that read specific fields should review the list below
before updating.

- **Digest format widened.** `AIPrefDigest.val` previously shipped as a
  truncated 12-character hex string labelled `JCS-SHA256`. In v0.12.14
  `val` is the full 64-character lowercase hex string produced by
  `@peac/crypto.jcsHash` (RFC 8785 JCS + SHA-256). The `alg` literal
  remains `'JCS-SHA256'` so the type shape is stable; only the byte
  length of `val` changes. This is a real behavioral change, not just an
  implementation detail: anything that compared `val` to a previously
  recorded 12-hex value will no longer match.
- **`Content-Usage` parsing is now RFC 9651 Structured-Fields.** The
  pre-v0.12.14 comma-split parser accepted inputs that do not round-trip
  under structured fields; those inputs now produce no entries instead of
  silently guessing.
- **`fetchRobots()` rejects with `PEAC_DEPRECATED_PREF_NETWORK`.** The
  `@peac/pref` facade never opens a socket; callers fetch in their own
  code and pass the bytes to the parsers.
- **`peac.txt` comment-line hint extraction was removed.** The
  pre-v0.12.14 resolver scanned `# no training` / `# no crawling`
  comments; those are no longer recognized. Callers that relied on this
  path should surface the underlying signal via
  `Content-Usage` / `robots.txt` / `tdmrep.json` / a
  `peac-policy/0.1` document fetched by the caller.
- **`commercial` is no longer populated from signals.** The modern AIPREF
  vocabulary does not express a `commercial` axis, and
  `@peac/mappings-content-signals` does not emit a commercial decision.
  `AIPrefSnapshot.commercial` is retained on the type surface but is
  never set by the facade.

## Migration

### Replace `resolveAIPref` / `PrefResolver` with `@peac/mappings-content-signals`

Before:

```typescript
import { resolveAIPref } from '@peac/pref';

const policy = await resolveAIPref('https://example.com/article', {
  'Content-Usage': 'train-ai=n, search=y',
});
```

After:

```typescript
import {
  parseContentUsage,
  resolveSignals,
  getDecisionForPurpose,
} from '@peac/mappings-content-signals';

const { entries } = parseContentUsage('train-ai=n, search=y');
const resolved = resolveSignals(entries);
const trainDecision = getDecisionForPurpose(resolved, 'ai-training'); // 'deny'
const searchDecision = getDecisionForPurpose(resolved, 'ai-search'); // 'allow'
```

### Combine multiple pre-fetched signals

```typescript
import {
  parseContentUsage,
  parseRobotsTxt,
  parseTdmrep,
  resolveSignals,
  createObservation,
} from '@peac/mappings-content-signals';

const entries = [
  ...parseContentUsage(contentUsageHeaderValue).entries,
  ...parseRobotsTxt(robotsTxtBytes),
  ...parseTdmrep(tdmrepJsonBytes),
];
const resolved = resolveSignals(entries);

// or package into an observation shape for downstream binding / reporting:
const observation = createObservation({
  target_uri: 'https://example.com/article',
  content_usage: contentUsageHeaderValue,
  robots_txt: robotsTxtBytes,
  tdmrep_json: tdmrepJsonBytes,
});
```

### Fetching remains the caller's responsibility

v0.12.14+ parsing packages do not open sockets. Fetch with your preferred
client (`undici` / `fetch` / `node:https`) subject to your SSRF, redirect,
and timeout policy, then pass the bytes to the parsers above. The legacy
`fetchRobots` entrypoint now rejects with `PEAC_DEPRECATED_PREF_NETWORK`.

## Backward-compat shape

The legacy `PrefResolver`, `AIPrefPolicy`, `AIPrefSnapshot`, and
`ResolveContext` types still export from `@peac/pref` to keep existing
import paths compiling for one minor. `ResolveContext` gains optional
`robotsTxt` / `tdmrep` fields so callers can supply pre-fetched bytes to
the facade.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community
contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
