# PEAC I-JSON raw-input parity corpus

**Status: Informative.** This corpus proves that the TypeScript and Go reference
gates reach the **same** accept/reject decision on raw JSON bytes, under the PEAC
I-JSON (RFC 7493) input gate that runs on a JWS protected header and payload
**before** JSON parsing.

## Why this corpus exists

Platform JSON parsers can collapse, round, or substitute input before
higher-level validation sees the original bytes. The PEAC gate rejects these
cases before parsing (the relevant I-JSON / RFC 7493 requirements: UTF-8
encoding, no surrogate code points, safe numeric interchange, and duplicate
member names after escape processing):

1. **Duplicate object member names** are collapsed by ordinary object parsing.
2. **Numbers outside the interoperable range** (non-finite, or absolute magnitude
   greater than `9007199254740991` = 2^53-1, including large finite floats) can be
   rounded or overflowed before schema validation.
3. **Invalid string content** includes lone surrogates or Unicode noncharacters
   (directly encoded or escaped), invalid UTF-8 that some parsers substitute with
   U+FFFD, and string-level syntax violations such as invalid escapes or
   unterminated strings.

The corpus treats these as raw-input validation failures so both reference
implementations classify them consistently. The PEAC gate (the internal
TypeScript `assertIJson` gate and the internal Go `assertIJSON` gate) scans the
raw bytes before parsing. Because a parsed-object corpus physically cannot carry
a duplicate member name or a precision-losing number, the inputs are stored as
**base64url of the raw JSON document bytes** (`input_b64`).

## Scope

The gate covers the **JWS protected header and payload bytes** only. Policy /
JCS-input bytes are out of scope (that path receives an already-parsed value).

## Vector shape

```json
{
  "id": "...",
  "description": "...",
  "input_b64": "<base64url of raw bytes>",
  "expected": { "accepted": false, "code": "E_IJSON_..." }
}
```

`expected.code` is the canonical public PEAC error code. The TypeScript gate
throws internal `CRYPTO_IJSON_*` codes that map 1:1 to the public `E_IJSON_*`
codes (replace the `CRYPTO_` prefix with `E_`); the Go gate returns the
`E_IJSON_*` code directly. Generic JSON syntax errors (not one of the three
I-JSON pathologies) map to `E_INVALID_FORMAT` in both implementations and are not
part of this corpus.

The three reject codes:

- `E_IJSON_DUPLICATE_MEMBER_NAME`
- `E_IJSON_NUMBER_OUT_OF_RANGE`
- `E_IJSON_INVALID_STRING`

## Accept controls (gate must NOT be over-broad)

Escaped solidus (`\/`), escaped quote/backslash, valid surrogate **pairs**,
boundary integers (`9007199254740991`), integer-via-exponent (`1e3`), small
decimals (`0.0001`, `1.5`), and string-encoded large integers
(`"9007199254740993"`) are all valid I-JSON and MUST be accepted.

## Registration

This is a standalone corpus (raw-bytes shape), run by dedicated tests:

- TypeScript: `packages/crypto/tests/ijson.parity.test.ts`
- Go: `sdks/go/ijson_parity_test.go`

It is **not** enrolled in the schema-validated `PARITY_FAMILIES` set (it does not
use the `{ input.payload, ... }` parity-vector shape), so the `parity_families`
sentinel is unchanged. The exclusion is asserted in
`packages/protocol/__tests__/_internal/parity-corpus-accounting.test.ts`.

## Regeneration

```bash
node specs/conformance/parity-corpus/ijson-raw-input/generate.mjs
```

Deterministic (no clock, no randomness); writes `vectors.json` next to the
generator.
