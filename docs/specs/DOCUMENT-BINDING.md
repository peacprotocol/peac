# PEAC Document Binding

**Status:** NORMATIVE
**Version:** 0.1
**Applies to:** Wire 0.2 (`interaction-record+jwt`) and later

---

## 1. Introduction

This document defines normative semantics for binding a transaction-local
or referenced document into a PEAC record's verification surface. It
generalizes the policy-binding pattern (`peac-policy/0.1`) into three
scheme-specific helpers plus an umbrella dispatcher, all of which share
the three-state binding result (`verified` / `failed` / `unavailable`).

Document-binding results appear in the verifier report only. They are
**not** stamped into the emitted record / envelope / artifact shape.
This document does not change the wire format; it specifies the
verifier-side contract.

**Key words.** "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" are to be
interpreted as in RFC 2119 / RFC 8174.

---

## 2. Hash format

All document-binding digests use the canonical PEAC self-describing
format:

```text
sha256:<64 lowercase hex>
```

The prefix `sha256:` is REQUIRED. The hex value MUST be lowercase. The
hash function is SHA-256 (FIPS 180-4) over the canonical bytes defined
per representation in §4.

---

## 3. Three-state binding semantics

A binding check produces one of three values:

| Value         | Meaning                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| `verified`    | Both the receipt-side digest and the local digest are present and match exactly. |
| `failed`      | Both digests are present but do not match.                                       |
| `unavailable` | Either digest is absent. No binding check was performed.                         |

`unavailable` is the safe default. Verifiers MUST NOT report `failed`
when one side is absent.

---

## 4. Representation envelopes

A bound document is identified by its **representation envelope tag**,
matching the four formats defined for x402 PR #1986 `terms`:

```text
DocumentRepresentation = "uri" | "markdown" | "plaintext" | "json"
```

Each representation envelope is its own binding identity. **Cross-
representation comparison of envelope digests is `failed` by design.**
A publisher that intends to assert cross-representation equivalence
SHOULD supply a separate publisher-supplied `canonical_digest` (§5).

### 4.1 `json`

Canonicalize the JSON value via RFC 8785 (JSON Canonicalization Scheme),
then SHA-256 the resulting UTF-8 bytes. Helper:

```text
computeJsonDocumentDigestJcs(value)
```

The `Jcs` suffix is RESERVED for JSON-only helpers. Implementations
MUST NOT label a non-JSON digest with a `Jcs` suffix.

### 4.2 `markdown` and `plaintext`

Apply the **minimal canonical normalization** below, then SHA-256 the
resulting UTF-8 bytes. Helper:

```text
computeTextDocumentDigestUtf8(bytes, representation)
```

Normalization rule:

1. Normalize line endings to `\n`.
   - Replace `\r\n` with `\n`.
   - Replace any remaining lone `\r` with `\n`.
2. Apply Unicode NFC normalization (`String.prototype.normalize('NFC')`).
3. Preserve all other bytes exactly.

Implementations MUST NOT:

- Strip trailing whitespace (line-by-line or otherwise).
- Collapse blank lines.
- Normalize letter case.
- Re-encode characters via any other Unicode form (NFD, NFKC, NFKD).
- "Pretty-print" the bytes before hashing.

These prohibitions exist because publishers frequently sign the exact
text bytes (especially in `markdown` and `plaintext` terms), and silent
transformations would break those signatures.

### 4.3 `uri`

The `uri` representation references bytes the verifier may not have
fetched. Implementations MUST NOT perform network I/O from the
binding layer. When the caller supplies the fetched bytes, those bytes
are hashed via §4.2 (treated as `plaintext`). When the caller does not
supply bytes, the dispatcher returns `unavailable`.

### 4.4 Umbrella dispatcher

```text
computeDocumentDigest(input)
```

Selects the correct scheme-specific helper from `input.representation`.
Returns `string | "unavailable"`.

---

## 5. Publisher-supplied canonical digest

A publisher MAY assert that multiple representation envelopes carry
equivalent semantics by supplying a `canonical_digest`. The
`canonical_digest` MUST be the JCS+SHA-256 digest of a canonical JSON
form to which the publisher commits. The canonical form is the
publisher's responsibility to define and to sign separately if desired;
PEAC only records the digest the publisher claims.

Verifiers:

- MAY compare two `canonical_digest` values when both sides supply
  them.
- MUST NOT synthesize a `canonical_digest` from a non-JSON
  representation envelope.
- MUST treat absence of a `canonical_digest` on either side as
  `unavailable`, NOT as `failed`.

---

## 6. Verifier report shape

The verifier report's top-level `bindings` object carries the result
of all binding checks the caller requested. The legacy top-level
`policy_binding` field is retained as a byte-stable mirror of
`bindings.policy`.

```typescript
interface VerifierBindings {
  policy: PolicyBindingStatus; // always present
  terms?: DocumentBindingResult; // present iff caller supplied
  documents?: DocumentBindingResult[]; // present iff caller supplied
}

interface DocumentBindingResult {
  ref: string;
  representation?: DocumentRepresentation;
  status: PolicyBindingStatus;
  canonical_digest?: string;
  canonical_digest_status?: PolicyBindingStatus;
}
```

`bindings.terms` and `bindings.documents` appear in verifier output
only. They are **not** stamped into the emitted record, envelope, or
artifact shape. There is no wire-format change in this version.

When the caller does not supply terms or documents bindings, the
verifier report's response body is byte-identical to the prior version
(no `bindings` key emitted in the standard or extended report).

---

## 7. Helper-naming contract

The naming contract is normative for downstream packages that produce
binding helpers:

- A helper that ends in `Jcs` MUST hash JSON values via RFC 8785 JCS
  exclusively. It MUST NOT be applied to non-JSON bytes.
- A helper that operates on text (`markdown` / `plaintext`) MUST name
  its scheme (e.g. `Utf8`).
- A dispatcher that selects between schemes MUST NOT carry a scheme
  suffix in its name (`computeDocumentDigest`).

Implementations that violate this contract create the same class of
bug previously observed in the pre-v0.12.14 `@peac/pref` package,
where a sort-keys `JSON.stringify` digest was labelled `JCS-SHA256`.

---

## 8. Canonical export surface

Reference TypeScript surface in `@peac/protocol`:

```typescript
export type DocumentRepresentation = 'uri' | 'markdown' | 'plaintext' | 'json';

export async function computeJsonDocumentDigestJcs(value: JsonValue): Promise<string>;
export async function computeTextDocumentDigestUtf8(
  bytes: string,
  representation: 'markdown' | 'plaintext'
): Promise<string>;
export async function computeDocumentDigest(
  input:
    | { representation: 'json'; value: JsonValue }
    | { representation: 'markdown' | 'plaintext'; bytes: string }
    | { representation: 'uri'; uri: string; bytes?: string }
): Promise<string | 'unavailable'>;
export function checkDocumentBinding(
  receiptDigest: string | undefined,
  localDigest: string | undefined
): 'verified' | 'failed' | 'unavailable';
```

The legacy `computePolicyDigestJcs` and `checkPolicyBinding` exports
delegate to `computeJsonDocumentDigestJcs` and `checkDocumentBinding`
respectively, with byte-identical output.

---

## 9. References

- RFC 2119 / RFC 8174: BCP 14
- RFC 8785: JSON Canonicalization Scheme (JCS)
- FIPS 180-4: Secure Hash Standard (SHA-256)
- `docs/specs/PEAC-TXT.md`: `peac-policy/0.1` policy document
- `docs/specs/VERIFICATION-REPORT-FORMAT.md`: report shape
- `docs/specs/X402-PROFILE.md`: x402 PR #1986 `terms` representation envelopes
