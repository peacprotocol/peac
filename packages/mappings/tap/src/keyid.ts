/**
 * Issuer extraction from a TAP keyid (trust boundary).
 *
 * RFC 9421 leaves key resolution to the application. PEAC's TAP profile
 * requires the `keyid` value used for issuer-derived JWKS resolution to be an
 * absolute `https` URL that identifies the issuer (its origin) and from which
 * the key is resolved (for example
 * `https://issuer.example.com/.well-known/jwks.json#k1`).
 *
 * This helper is the single source of truth for turning that TAP keyid into an
 * issuer origin. It is deliberately strict and fails closed: it NEVER derives
 * the issuer from request-controlled data (URL or Host header) and NEVER
 * passes a malformed keyid through unchanged. Returning `null` forces every
 * caller to handle the failure rather than silently trust attacker-influenced
 * input for key resolution, allowlist checks, or replay namespacing.
 *
 * @param keyid - The `keyid` signature parameter from a TAP proof.
 * @returns The issuer origin (for example `https://issuer.example.com`) when
 *   `keyid` is an absolute `https` URL; otherwise `null`. `http` URLs, opaque
 *   identifiers, non-URL strings, and other schemes all return `null`.
 */
export function issuerFromKeyid(keyid: string): string | null {
  if (typeof keyid !== 'string' || keyid.length === 0) {
    return null;
  }

  // WHATWG URL parsing is forgiving: it trims leading/trailing C0 controls and
  // spaces and strips tab/newline characters from the middle of the input. For
  // a trust-boundary helper, reject those forms outright rather than accept a
  // value that parses differently than it reads.
  // eslint-disable-next-line no-control-regex
  if (keyid !== keyid.trim() || /[\u0000-\u001F\u007F]/.test(keyid)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(keyid);
  } catch {
    return null;
  }

  // Require https. http is a downgrade (cleartext key resolution); any other
  // scheme (javascript:, data:, file:, ...) is not an issuer.
  if (url.protocol !== 'https:') {
    return null;
  }

  // Reject embedded credentials: `https://attacker@issuer.example.com` parses
  // with a host of `issuer.example.com`, but userinfo in a keyid is never
  // legitimate and is a known origin-confusion vector.
  if (url.username !== '' || url.password !== '') {
    return null;
  }

  // A valid https URL always has a host; guard defensively.
  if (url.hostname === '') {
    return null;
  }

  return url.origin;
}
