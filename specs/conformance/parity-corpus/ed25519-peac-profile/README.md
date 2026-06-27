# PEAC Ed25519 verification profile parity corpus

**Status: Informative.** This corpus proves that the TypeScript and Go
reference verifiers reach the **same** accept/reject decision on Ed25519
signature-edge inputs, under a single named verification predicate (the
"PEAC Ed25519 verification profile").

## Why this corpus exists

"Strict RFC 8032" is not a single predicate. Ed25519 implementations
diverge on two independent axes:

1. **Small-order public keys** (the 8-torsion subgroup). Some libraries
   accept a signature under a small-order public key; an honest signer
   never produces such a key.
2. **Cofactored vs. cofactorless verification.** The two verification
   equations differ on a small set of edge signatures; libraries pick one.

PEAC pins one predicate so the two reference verifiers agree on every
input:

> **PEAC Ed25519 verification profile:** cofactorless Ed25519 verification,
> plus admissibility checks over the public inputs:
> (1) public key is 32 bytes and signature is 64 bytes;
> (2) reject small-order public keys (fixed denylist);
> (3) reject non-reduced scalars `S >= L` (RFC 8032 malleability guard);
> (4) cofactorless signature verification.

- **TypeScript** (`packages/crypto/src/ed25519.ts`) implements the profile
  on the Web Crypto Subtle API (`crypto.subtle.verify({ name: 'Ed25519' })`),
  which is cofactorless. It fails closed if the runtime cannot provide the
  primitive (`Ed25519RuntimeError`); it never falls back to a different
  predicate.
- **Go** (`sdks/go/jws/ed25519.go`) implements the profile on the standard
  library `crypto/ed25519.Verify`, which is cofactorless, with the identical
  admissibility checks.

The small-order denylist is byte-for-byte identical across the two
implementations, and the `S >= L` check computes the same predicate on both
(a fixed-width little-endian byte comparison in TypeScript; the equivalent
big-integer comparison in Go).

## Empirical evidence

Each vector in `vectors.json` carries an `empirical` block recording how
several Ed25519 verifiers actually decide that vector on the pinned
toolchain. The columns are diagnostic provenance, not assertions; the only
asserted field is `peac_expected.accepted`, which both reference
implementations must reproduce.

| Edge class (speccheck)        | noble ZIP215 | noble `{zip215:false}` | Go stdlib / Web Crypto |     PEAC profile      |
| ----------------------------- | :----------: | :--------------------: | :--------------------: | :-------------------: |
| small-order `A` (0, 1, 11)    |    accept    |         reject         |      accept (raw)      | **reject** (denylist) |
| cofactored-only (4, 5)        |    accept    |       **accept**       |         reject         |      **reject**       |
| `S >= L` (6, 7, 8)            |    varies    |         reject         |         reject         |      **reject**       |
| non-canonical `R`/`A` (9, 10) |    varies    |         reject         |         reject         |      **reject**       |
| canonical mixed-order (2, 3)  |    accept    |         accept         |         accept         |      **accept**       |

Two facts justify the profile:

- noble's `{ zip215: false }` is **not** equivalent to Go: it accepts the
  cofactored-only vectors 4 and 5 that Go and Web Crypto both reject. A
  thin `{ zip215: false }` wrapper would therefore re-introduce the very
  TS<->Go divergence this corpus closes.
- The raw cofactorless verification primitives (Go stdlib `crypto/ed25519` and
  Web Crypto) accept the small-order vectors 0, 1, 11 before any PEAC
  admissibility check; the shared denylist is what makes the PEAC profile
  reject them. The check is load-bearing, in both languages.

## Small-order denylist provenance

The TypeScript (`packages/crypto/src/ed25519.ts`) and Go
(`sdks/go/jws/ed25519.go`) verifiers reject a fixed list of **11** small-order
public-key encodings:

- **What it is:** a fixed, reviewed list of small-order public-key encodings
  (canonical and non-canonical byte encodings of the Ed25519 low-order points).
  Small-order public keys admit trivial/forgeable signatures and are never
  produced by an honest signer, so they are rejected outright before
  verification.
- **Why 11 and not 8:** the small-order (8-torsion) subgroup has 8 points, but a
  single point can have more than one valid byte encoding (for example a
  canonical encoding plus non-canonical encodings differing in the sign bit or
  using a non-reduced y-coordinate). The denylist enumerates **encodings**, not
  points, so its size (11) exceeds the point count (8).
- **Relation to the corpus:** of the 11 entries, 2 appear as the public key `A`
  in this corpus; together they cover the four small-order-key vectors
  speccheck-0, speccheck-1, speccheck-10, and speccheck-11. The remaining 9
  entries are other small-order encodings included for completeness so the
  profile rejects a small-order key regardless of which valid encoding an
  attacker presents. (Verified by the corpus-integrity test, which asserts
  exactly these four vectors carry a denylisted key.)
- **Cross-language:** the 11 hex strings are byte-for-byte identical in the TS
  and Go verifiers, so both reject the same keys (asserted by the denylist
  byte-equality test).

This list is **not** claimed to equal any specific upstream library blocklist
(e.g. libsodium): it is a reviewed set of small-order encodings, pinned here and
exercised by this corpus.

## Runtime requirement

The TypeScript verifier requires a runtime with stable WebCrypto Ed25519
support (Node.js v22.13.0+, also stable on v20.19.3+ and v23.5.0+; browsers with
WebCrypto Ed25519). On an unsupported runtime it fails closed
(`Ed25519RuntimeError`) and never falls back to a different predicate. See
`docs/specs/SECURITY-CONSIDERATIONS.md` Section 1.

## Coverage

| Vector id            | Source                      |  PEAC  | Edge case                                  |
| -------------------- | --------------------------- | :----: | ------------------------------------------ |
| `speccheck-0..11`    | ed25519-speccheck           | mixed  | the 12 "Taming the Many EdDSAs" edge cases |
| `rfc8032-vector-1`   | RFC 8032 Section 7.1 Test 1 | accept | canonical positive (empty message)         |
| `peac-sign-positive` | PEAC `sign()` (fixed seed)  | accept | canonical positive from the PEAC signer    |

## Provenance and license

The 12 edge vectors are the test cases from **ed25519-speccheck**
(novifinancial), the artifact accompanying Chalkias, Garillot, and
Nikolaenko, "Taming the Many EdDSAs" (SSR 2020). That project is licensed
**Apache-2.0**; the full license text is included in this directory as
`LICENSE-APACHE-2.0`, and `NOTICE` carries the attribution and the upstream
commit pinned for provenance. `rfc8032-vector-1` is from RFC 8032 Section 7.1.
`peac-sign-positive` is produced by the PEAC signer from a fixed seed and is
regenerated, not vendored.

## How the corpus is validated

- **TypeScript:** `packages/crypto/tests/ed25519.peac-profile-parity.test.ts`
  runs `verify()` on each vector and asserts the result equals
  `peac_expected.accepted`, with named guards on the small-order and
  cofactored-only vectors and a fail-closed check.
- **Go:** `sdks/go/ed25519_peac_profile_parity_test.go` runs the JWS
  verify path on the same vectors and asserts identical accept/reject.

This corpus uses the hex-vector shape (`public_key_hex`, `message_hex`,
`signature_hex`, `peac_expected`), like `jcs-extended/`. It is therefore
**not** a schema-validated parity-vector family (the `{ input.payload, ... }`
shape) and is intentionally not enrolled in `PARITY_FAMILIES` /
`parityFloorCounts`; it is exercised by the two dedicated tests above.

## Regenerating the corpus

The `empirical` columns are recomputed from the installed crypto libraries
and the Node runtime; the `peac_expected` field follows from the profile.
Keep the regeneration in a temp script rather than an inline expression to
avoid inlining build-output paths, then cross-verify the Go side before
committing.
