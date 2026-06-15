/**
 * Canonical issuer-origin allowlist check.
 *
 * Surfaces use this helper to decide whether a receipt or TAP issuer origin is
 * configured as trusted. The comparison is intentionally origin-based
 * (scheme + host + port), not host-only, and fails closed for malformed inputs.
 *
 * Runtime-neutral by construction: it uses only the standard URL API and runs
 * unchanged on Node, Workers, Deno, and Bun. It performs no DNS resolution, no
 * network access, and no private-IP checks; outbound-fetch SSRF protection is a
 * separate fetch-layer concern.
 */

// True if the string contains an ASCII control character (C0 range or DEL).
// Used to reject smuggled control characters that the URL API might otherwise
// strip during parsing. Implemented as a code-unit scan rather than a regex
// escape range to keep this security-sensitive source free of escape sequences.
function hasAsciiControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Normalize a value to its https origin, or null if it is not an acceptable
 * issuer origin. Acceptable means: no surrounding or embedded ASCII control
 * characters or whitespace, a parseable absolute URL, the `https:` scheme, and
 * no userinfo (username/password). Path, query, and fragment are not part of an
 * origin and are ignored.
 */
function toHttpsOrigin(value: string): string | null {
  // Reject surrounding whitespace and embedded ASCII control characters before
  // parsing. The URL API would otherwise strip some of these, which could let a
  // padded or smuggled-control-character entry compare equal to a clean one.
  if (value.trim() !== value || hasAsciiControl(value)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') {
    return null;
  }
  if (url.username !== '' || url.password !== '') {
    return null;
  }
  return url.origin;
}

/**
 * Returns true iff `candidate` matches an entry in `allowlist` by https origin.
 *
 * Comparison is by URL origin (scheme + host + port); a default `:443` is
 * normalized away by the `URL` API, a non-default port must match exactly, and
 * a scheme mismatch (e.g. an `http:` candidate against an `https:` entry) never
 * matches.
 *
 * Fails closed:
 * - an empty allowlist returns false;
 * - a candidate that is not a parseable absolute https URL, or that carries
 *   userinfo or control characters, returns false;
 * - a malformed or non-https allowlist entry is skipped (it never matches) but
 *   does not prevent a later valid entry from matching.
 *
 * There is no wildcard, suffix, regex, or raw-string fallback matching.
 */
export function isAllowedIssuerOrigin(candidate: string, allowlist: readonly string[]): boolean {
  const candidateOrigin = toHttpsOrigin(candidate);
  if (candidateOrigin === null) {
    return false;
  }
  for (const entry of allowlist) {
    if (toHttpsOrigin(entry) === candidateOrigin) {
      return true;
    }
  }
  return false;
}
