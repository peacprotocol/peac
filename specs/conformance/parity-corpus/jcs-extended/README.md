# Extended JCS (RFC 8785) parity corpus

This corpus covers JCS edge cases that are not in the baseline
`specs/conformance/fixtures/go-interaction-record/jcs-golden-vectors.json`
set. Every vector in `vectors.json` must produce byte-identical output
from both the TypeScript implementation in `@peac/crypto`
(`packages/crypto/src/jcs.ts`) and the Go implementation in
`sdks/go/jcs.go`.

## Coverage

| Vector id                     | Edge case                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `unicode-nfc-nfd`             | Unicode normalization boundary: NFC (U+00E9) and NFD (U+0065 U+0301) preserved byte-identically; JCS does not normalize. |
| `nested-depth-5`              | Nested object depth 5 with mixed keys; keys sort per JCS at every level.                                                 |
| `numeric-zero-and-neg-zero`   | Zero and negative zero both render as `0` per JCS number serialization.                                                  |
| `integer-vs-float-same-value` | Integer 1 and float 1.0 both render as `1`.                                                                              |
| `escape-sequences`            | JCS requires escape only for quote, backslash, and U+0000 through U+001F.                                                |
| `utf16-surrogate-pair`        | Non-BMP character U+1F600 encoded via surrogate pair; JCS emits UTF-8 bytes.                                             |

## Format

```json
{
  "description": "...",
  "generator": "@peac/crypto canonicalize() vX.Y.Z",
  "vectors": [
    { "id": "...", "description": "...", "input": {...}, "canonical": "..." }
  ]
}
```

`canonical` is the exact UTF-8 string produced by a compliant
RFC 8785 canonicalizer. Tests compare the canonicalizer's output to
this string byte-for-byte.

## How the corpus is validated

- **TypeScript side:** `packages/crypto/__tests__/jcs.parity-extended.test.ts`
  reads `vectors.json` and asserts `canonicalize(input)` equals
  `canonical` for every vector.
- **Go side:** `sdks/go/jcs_parity_extended_test.go` reads
  `vectors.json` and asserts `peac.Canonicalize(input)` equals
  `canonical` for every vector.

Both tests live alongside their implementations and run in CI. If
either side drifts, the corresponding test fails with the exact
byte-diff.

## Regenerating the corpus

When the corpus needs new vectors or updates, build `@peac/crypto`
first and regenerate through a small node script that imports the
package via its workspace entry. Keep the new vectors in a temp
script file rather than an inline `-e` expression to avoid inlining
build-output paths.

```bash
# from the repository root
pnpm --filter @peac/crypto build
cat > /tmp/regen-jcs-extended.mjs <<'MJS'
import { canonicalize } from '@peac/crypto';

const vectors = [
  // new inputs here; existing six vectors are already in vectors.json
];

const out = {
  description: '...',
  generator: '@peac/crypto canonicalize() vX.Y.Z',
  vectors: vectors.map((v) => ({ ...v, canonical: canonicalize(v.input) })),
};

process.stdout.write(JSON.stringify(out, null, 2) + '\n');
MJS
pnpm exec node /tmp/regen-jcs-extended.mjs > specs/conformance/parity-corpus/jcs-extended/vectors.json
```

Cross-verify the Go implementation produces the same output for every
vector before committing.
