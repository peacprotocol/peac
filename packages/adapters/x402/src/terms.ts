/**
 * x402 PR #1986 `terms` digest helpers (Layer 4).
 *
 * Mapper-local conveniences for callers that want to bind a server's
 * advertised x402 `terms` representation into a verifier-side
 * `bindings.terms` result. Computes the digest of a single
 * representation envelope (uri / markdown / plaintext / json) using the
 * canonical helpers in `@peac/protocol/document-binding`.
 *
 * Cross-representation comparison is `'failed'` by design; each
 * representation envelope is its own binding identity. Publishers that
 * commit to a single canonical JSON form may also supply a separate
 * `canonical_digest` (computed via `computeJsonDocumentDigestJcs`) for
 * cross-representation equivalence; see `docs/specs/DOCUMENT-BINDING.md`.
 *
 * v0.12.14: digests computed here are NEVER stamped into the emitted
 * record / envelope shape. Callers thread results through verifyLocal's
 * `bindings.terms` option for verifier-report surfacing only.
 */

import {
  computeJsonDocumentDigestJcs,
  computeTextDocumentDigestUtf8,
  computeDocumentDigest,
  type DocumentRepresentation,
} from '@peac/protocol';
import type { JsonValue } from '@peac/kernel';

/**
 * Single x402 `terms` representation envelope. Matches the four formats
 * defined in x402 PR #1986: `uri`, `markdown`, `plaintext`, `json`.
 *
 * For `uri`, callers MUST supply the fetched bytes if they want a
 * binding digest (PEAC does not perform network I/O from this layer).
 * Without bytes, `computeX402TermsDigest` returns `'unavailable'`.
 */
export type X402TermsRepresentation =
  | { representation: 'json'; value: JsonValue }
  | { representation: 'markdown'; bytes: string }
  | { representation: 'plaintext'; bytes: string }
  | { representation: 'uri'; uri: string; bytes?: string };

/**
 * Compute the binding digest for a single x402 `terms` representation
 * envelope. Returns the canonical PEAC self-describing hash format
 * `'sha256:<64 lowercase hex>'`, or `'unavailable'` for a `uri`
 * representation supplied without bytes.
 *
 * Thin convenience over `computeDocumentDigest` from `@peac/protocol`;
 * digest output is byte-identical.
 */
export async function computeX402TermsDigest(
  terms: X402TermsRepresentation
): Promise<string | 'unavailable'> {
  return computeDocumentDigest(terms);
}

export { computeJsonDocumentDigestJcs, computeTextDocumentDigestUtf8, type DocumentRepresentation };
