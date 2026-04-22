# PEAC and AIPREF Composition

**Status:** Informative
**Version:** 0.1
**Applies to:** Operators wiring AIPREF content-use signals
(`draft-ietf-aipref-attach`, `draft-ietf-aipref-vocab`) into PEAC
records. Composes with the canonical `@peac/mappings-content-signals`
parser.

---

## Why this document exists

AIPREF defines the language for content-use preferences:

- [`draft-ietf-aipref-attach`](https://datatracker.ietf.org/doc/draft-ietf-aipref-attach/)
  defines an HTTP `Content-Usage` header (RFC 9651 Structured Fields
  Dictionary) and a robots.txt directive form.
- [`draft-ietf-aipref-vocab`](https://datatracker.ietf.org/doc/draft-ietf-aipref-vocab/)
  defines the vocabulary (`train-ai`, `search`) with
  `y` / `n` / `unknown` token values.

PEAC is the records layer. PEAC composes with AIPREF rather than
replacing it: AIPREF is the input language; PEAC binds and proves
what was surfaced. This document specifies that composition.

## Boundary

- PEAC does not mint AIPREF preferences.
- PEAC does not claim that an AIPREF preference is GDPR consent.
  Preferences are publisher-asserted signals, not data-subject
  consent. See
  [docs/privacy/DATA-SUBJECT-RIGHTS.md](../privacy/DATA-SUBJECT-RIGHTS.md)
  §2.
- PEAC does not normatively compile AIPREF into `@peac/policy-kit`
  policy decisions. AIPREF can be projected into a PEAC record as an
  observation (via `@peac/mappings-content-signals`), but the policy
  surface is independent.

## Composition pattern

The recommended composition has three layers:

1. **Surfacing.** The publisher exposes AIPREF preferences via the
   `Content-Usage` HTTP header, a robots.txt directive, or both.
2. **Parsing.** A consumer parses the surfaced preferences via
   `@peac/mappings-content-signals` (`parseContentUsage`,
   `parseRobotsTxt`, `parseTdmrep`, `resolveSignals`). Parsing is
   bytes-in / structured-out and performs no network I/O of its own.
3. **Recording.** The consumer projects the parsed preferences into a
   PEAC record either as an observation extension or, where the
   publisher chose to bind, as a referenced document with a
   `bindings.documents[]` entry computed via `computeDocumentDigest`.

### Wire-side projection (observation)

Treat AIPREF preferences as an observation: what the consumer saw
when it fetched the resource. The consumer issues a PEAC evidence
record describing the surfaced preference set; the verifier
reconstructs the same digest from the same bytes. AIPREF values do
not become PEAC policy decisions.

### Document-binding projection (referenced doc)

Treat the AIPREF surface (e.g. the exact `Content-Usage` header value
or the served robots.txt body) as a referenced document and bind it
into the verifier report's `bindings.documents` array. The publisher
need not issue the record themselves; any consumer who fetched the
bytes can record what they observed and bind it for replay.

## Helper-naming reminder

When projecting AIPREF preferences into a record, follow the
`docs/specs/DOCUMENT-BINDING.md` helper-naming contract:

- Hash the parsed JSON observation via `computeJsonDocumentDigestJcs`.
- Hash the served `Content-Usage` header bytes (markdown / plaintext
  envelopes do not apply to a single header line; treat the header
  value as a `plaintext` representation if you bind the literal
  bytes).
- Use `computeDocumentDigest` as the dispatcher when the
  representation is selected at runtime.

## Cross-references

- [docs/specs/DOCUMENT-BINDING.md](DOCUMENT-BINDING.md): normative
  binding semantics including the publisher-supplied
  `canonical_digest` rule.
- [docs/specs/VERIFICATION-REPORT-FORMAT.md](VERIFICATION-REPORT-FORMAT.md):
  verifier report `bindings` shape.
- [docs/privacy/DATA-SUBJECT-RIGHTS.md](../privacy/DATA-SUBJECT-RIGHTS.md):
  AIPREF preferences are not consent.
- [`packages/mappings/content-signals/`](../../packages/mappings/content-signals/):
  RFC 9651 SF parsers for AIPREF, robots, tdmrep.

## References

- [RFC 9651: HTTP Structured Fields](https://www.rfc-editor.org/rfc/rfc9651.html).
- [`draft-ietf-aipref-attach`](https://datatracker.ietf.org/doc/draft-ietf-aipref-attach/):
  attach mechanism.
- [`draft-ietf-aipref-vocab`](https://datatracker.ietf.org/doc/draft-ietf-aipref-vocab/):
  preference vocabulary.
- [RFC 9309: Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html).
