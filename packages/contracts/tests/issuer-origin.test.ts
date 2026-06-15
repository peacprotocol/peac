import { describe, it, expect } from 'vitest';

import { isAllowedIssuerOrigin } from '../src/issuer-origin.js';

const ALLOW = ['https://issuer.example.com'];

describe('isAllowedIssuerOrigin', () => {
  it('matches an exact https origin', () => {
    expect(isAllowedIssuerOrigin('https://issuer.example.com', ALLOW)).toBe(true);
  });

  it('ignores path on the candidate (origin-only match)', () => {
    expect(isAllowedIssuerOrigin('https://issuer.example.com/.well-known/jwks.json', ALLOW)).toBe(
      true
    );
  });

  it('ignores query and fragment on the candidate', () => {
    expect(isAllowedIssuerOrigin('https://issuer.example.com/p?a=1#frag', ALLOW)).toBe(true);
  });

  it('normalizes the default :443 port', () => {
    expect(isAllowedIssuerOrigin('https://issuer.example.com:443', ALLOW)).toBe(true);
    expect(
      isAllowedIssuerOrigin('https://issuer.example.com', ['https://issuer.example.com:443'])
    ).toBe(true);
  });

  it('rejects a non-default port mismatch', () => {
    expect(isAllowedIssuerOrigin('https://issuer.example.com:8443', ALLOW)).toBe(false);
    expect(
      isAllowedIssuerOrigin('https://issuer.example.com', ['https://issuer.example.com:8443'])
    ).toBe(false);
  });

  it('rejects a scheme mismatch (http candidate vs https allowlist)', () => {
    expect(isAllowedIssuerOrigin('http://issuer.example.com', ALLOW)).toBe(false);
  });

  it('rejects an http candidate even against an http allowlist entry (https-only)', () => {
    expect(isAllowedIssuerOrigin('http://issuer.example.com', ['http://issuer.example.com'])).toBe(
      false
    );
  });

  it('rejects a candidate carrying userinfo', () => {
    expect(isAllowedIssuerOrigin('https://user:pass@issuer.example.com', ALLOW)).toBe(false);
    expect(isAllowedIssuerOrigin('https://user@issuer.example.com', ALLOW)).toBe(false);
  });

  it('skips an allowlist entry carrying userinfo (it never matches)', () => {
    expect(
      isAllowedIssuerOrigin('https://issuer.example.com', ['https://user:pass@issuer.example.com'])
    ).toBe(false);
  });

  it('returns false for a malformed candidate', () => {
    expect(isAllowedIssuerOrigin('not a url', ALLOW)).toBe(false);
    expect(isAllowedIssuerOrigin('', ALLOW)).toBe(false);
  });

  it('skips a malformed allowlist entry but still matches a later valid entry', () => {
    expect(
      isAllowedIssuerOrigin('https://issuer.example.com', ['::::', 'https://issuer.example.com'])
    ).toBe(true);
  });

  it('returns false for an empty allowlist', () => {
    expect(isAllowedIssuerOrigin('https://issuer.example.com', [])).toBe(false);
  });

  it('ignores path, query, and fragment on an allowlist entry (origin allowlist, not a path ACL)', () => {
    expect(
      isAllowedIssuerOrigin('https://issuer.example.com', [
        'https://issuer.example.com/path?x=1#frag',
      ])
    ).toBe(true);
  });

  it('rejects a candidate with surrounding whitespace', () => {
    expect(isAllowedIssuerOrigin('  https://issuer.example.com  ', ALLOW)).toBe(false);
  });

  it('skips an allowlist entry with surrounding whitespace', () => {
    expect(
      isAllowedIssuerOrigin('https://issuer.example.com', [' https://issuer.example.com '])
    ).toBe(false);
  });

  it('rejects a candidate containing an embedded ASCII control character', () => {
    // Built from a code point to keep this source file pure ASCII.
    const withControl = `https://issuer.example.com${String.fromCharCode(0x01)}`;
    expect(isAllowedIssuerOrigin(withControl, ALLOW)).toBe(false);
  });

  it('skips an allowlist entry containing a control character', () => {
    const entryWithControl = `https://issuer.example.com${String.fromCharCode(0x09)}`;
    expect(isAllowedIssuerOrigin('https://issuer.example.com', [entryWithControl])).toBe(false);
  });

  it('normalizes host and scheme case via the URL API', () => {
    expect(isAllowedIssuerOrigin('HTTPS://Issuer.Example.COM', ALLOW)).toBe(true);
  });

  it('treats an IDN and its punycode form as the same origin', () => {
    // The WHATWG URL API normalizes IDN host labels to punycode. The Unicode
    // label is built from code points so this source file stays pure ASCII; it
    // is the Cyrillic word "primer", whose punycode form is "xn--e1afmkfd".
    const label = String.fromCodePoint(0x43f, 0x440, 0x438, 0x43c, 0x435, 0x440);
    const idnHost = `https://${label}.example`;
    expect(isAllowedIssuerOrigin('https://xn--e1afmkfd.example', [idnHost])).toBe(true);
  });

  it('does not match a different host', () => {
    expect(isAllowedIssuerOrigin('https://evil.example.com', ALLOW)).toBe(false);
  });

  it('does not do suffix or wildcard matching', () => {
    expect(isAllowedIssuerOrigin('https://sub.issuer.example.com', ALLOW)).toBe(false);
    expect(isAllowedIssuerOrigin('https://issuer.example.com', ['https://*.example.com'])).toBe(
      false
    );
  });

  it('requires a trailing-dot host to match exactly (no manual normalization)', () => {
    // A trailing-dot FQDN is a distinct origin under the URL API; it must not
    // silently match the dotless form.
    expect(isAllowedIssuerOrigin('https://issuer.example.com./', ALLOW)).toBe(false);
  });
});
