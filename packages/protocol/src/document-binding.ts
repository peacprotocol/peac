/**
 * Document binding utilities (Layer 3)
 *
 * Generalized binding helpers for `peac-policy/0.1` policy documents,
 * x402 PR #1986 `terms` representations, and any other referenced
 * document. Three-state semantics (`verified` / `failed` / `unavailable`)
 * are reused from `policy-binding`.
 *
 * Helper-naming rule (normative, see `docs/specs/DOCUMENT-BINDING.md`):
 *   - `computeJsonDocumentDigestJcs` is JSON-only (RFC 8785 JCS + SHA-256).
 *   - `computeTextDocumentDigestUtf8` is text-only (UTF-8 with `\n` line
 *     endings + NFC, preserving all other bytes including trailing
 *     whitespace).
 *   - `computeDocumentDigest` is the umbrella dispatcher.
 *
 * The `Jcs` suffix is reserved for JSON-only helpers; text-only helpers
 * name their scheme. This prevents the `aipref/resolver.ts` historical
 * bug where a sort-keys `JSON.stringify` digest was labelled `JCS-SHA256`.
 *
 * The `policy_binding` field on the verifier report is the byte-stable
 * legacy mirror of `bindings.policy`; both are populated identically.
 *
 * @see docs/specs/DOCUMENT-BINDING.md
 * @see packages/protocol/src/policy-binding.ts
 */

import { jcsHash } from '@peac/crypto';
import { HASH } from '@peac/kernel';
import type { JsonValue } from '@peac/kernel';
import type { PolicyBindingStatus } from './verifier-types.js';
import { verifyPolicyBinding } from '@peac/schema';

export type DocumentRepresentation = 'uri' | 'markdown' | 'plaintext' | 'json';

/**
 * Compute the RFC 8785 JCS canonicalization + SHA-256 digest of a JSON
 * document. Returns the canonical PEAC self-describing hash format
 * `'sha256:<64 lowercase hex>'`. Suitable for `peac-policy/0.1` policy
 * docs and any other JSON-shaped document carried in or referenced from
 * a record.
 */
export async function computeJsonDocumentDigestJcs(value: JsonValue): Promise<string> {
  const hex = await jcsHash(value);
  return `${HASH.prefix}${hex}`;
}

/**
 * Compute the SHA-256 digest of a UTF-8 text document after the minimal
 * canonical normalization documented in `docs/specs/DOCUMENT-BINDING.md`:
 *
 *   1. Normalize line endings to `\n` (strip `\r` before `\n`; replace a
 *      lone `\r` with `\n`).
 *   2. Normalize Unicode to NFC.
 *   3. Preserve all other bytes exactly.
 *
 * Trailing whitespace is **not** stripped. Blank lines are **not**
 * collapsed. Case is **not** normalized. The intent is a deterministic
 * representation envelope identity, not a "pretty-print before hashing"
 * scheme — text representations like `markdown` and `plaintext` are
 * frequently signed by publishers, and silent transformations would
 * break those signatures.
 *
 * Returns the canonical PEAC self-describing hash format
 * `'sha256:<64 lowercase hex>'`.
 *
 * @param bytes UTF-8 string to hash (single representation envelope).
 * @param representation Tag recorded by the caller; not currently
 *   altering the hash but reserved so future representation-specific
 *   normalization rules can be added without renaming the helper.
 */
export async function computeTextDocumentDigestUtf8(
  bytes: string,
  _representation: 'markdown' | 'plaintext'
): Promise<string> {
  const normalized = bytes.replace(/\r\n/g, '\n').replace(/\r/g, '\n').normalize('NFC');
  const buf = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buf);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${HASH.prefix}${hex}`;
}

/**
 * Umbrella dispatcher. Selects the correct scheme-specific helper from
 * `input.representation`.
 *
 * For `representation: 'uri'`, the bytes the caller fetched from the URI
 * MUST be supplied via `bytes`. Without bytes the dispatcher returns
 * `'unavailable'` — the URI alone is not enough to bind, and PEAC does
 * not perform network I/O from this layer (callers fetch under their own
 * SSRF / redirect / timeout policy). When bytes are supplied for a URI,
 * they are hashed via the text helper.
 */
export async function computeDocumentDigest(
  input:
    | { representation: 'json'; value: JsonValue }
    | { representation: 'markdown' | 'plaintext'; bytes: string }
    | { representation: 'uri'; uri: string; bytes?: string }
): Promise<string | 'unavailable'> {
  switch (input.representation) {
    case 'json':
      return computeJsonDocumentDigestJcs(input.value);
    case 'markdown':
    case 'plaintext':
      return computeTextDocumentDigestUtf8(input.bytes, input.representation);
    case 'uri':
      if (typeof input.bytes !== 'string') return 'unavailable';
      return computeTextDocumentDigestUtf8(input.bytes, 'plaintext');
  }
}

/**
 * Three-state binding check. Same semantics as `checkPolicyBinding`:
 *
 *   - `'unavailable'` when either digest is missing.
 *   - `'verified'` when both digests are present and match exactly.
 *   - `'failed'` when both digests are present but do not match.
 *
 * The legacy `checkPolicyBinding` export delegates to this function.
 */
export function checkDocumentBinding(
  receiptDigest: string | undefined,
  localDigest: string | undefined
): PolicyBindingStatus {
  if (receiptDigest === undefined || localDigest === undefined) {
    return 'unavailable';
  }
  return verifyPolicyBinding(receiptDigest, localDigest);
}
