/**
 * @peac/mappings-tap - issuerFromKeyid trust-boundary tests
 *
 * The keyid is the trust anchor for key resolution, issuer allowlist checks,
 * and replay namespacing. issuerFromKeyid must fail closed (return null) on
 * anything that is not an absolute https URL, and must never derive the issuer
 * from request-controlled data.
 */

import { describe, it, expect } from 'vitest';
import { issuerFromKeyid } from '../src/keyid.js';

describe('issuerFromKeyid', () => {
  describe('valid https keyids resolve to the origin', () => {
    it('extracts origin from a JWKS URL with fragment', () => {
      expect(issuerFromKeyid('https://issuer.example.com/.well-known/jwks.json#key-1')).toBe(
        'https://issuer.example.com'
      );
    });

    it('preserves a non-default port in the origin', () => {
      expect(issuerFromKeyid('https://issuer.example.com:8443/.well-known/jwks.json#k1')).toBe(
        'https://issuer.example.com:8443'
      );
    });

    it('drops path and query, keeping only the origin', () => {
      expect(issuerFromKeyid('https://issuer.example.com/keys?id=1')).toBe(
        'https://issuer.example.com'
      );
    });

    it('lowercases the host per URL normalization', () => {
      expect(issuerFromKeyid('https://Issuer.Example.COM/jwks#k1')).toBe(
        'https://issuer.example.com'
      );
    });

    it('normalizes IDN hosts to punycode', () => {
      expect(issuerFromKeyid('https://xn--e1afmkfd.example/jwks#k1')).toBe(
        'https://xn--e1afmkfd.example'
      );
    });
  });

  describe('fails closed on non-https and non-URL keyids', () => {
    it.each([
      ['plain opaque identifier', 'key-identifier-123'],
      ['empty string', ''],
      ['whitespace only', '   '],
      ['http downgrade', 'http://issuer.example.com/jwks#k1'],
      ['javascript scheme', 'javascript:alert(1)'],
      ['data scheme', 'data:text/plain,hello'],
      ['file scheme', 'file:///etc/passwd'],
      ['ftp scheme', 'ftp://issuer.example.com/jwks'],
      ['protocol-relative', '//issuer.example.com/jwks'],
      ['bare host', 'issuer.example.com'],
      ['mailto', 'mailto:ops@issuer.example.com'],
    ])('returns null for %s', (_label, keyid) => {
      expect(issuerFromKeyid(keyid)).toBeNull();
    });
  });

  describe('rejects origin-confusion vectors', () => {
    it('rejects embedded userinfo (credentials in the keyid)', () => {
      // Without the guard, URL parsing of `https://good.example@evil.example`
      // yields host `evil.example`; userinfo in a keyid is never legitimate.
      expect(issuerFromKeyid('https://good.example@evil.example/jwks')).toBeNull();
    });

    it('rejects username:password userinfo', () => {
      expect(issuerFromKeyid('https://user:pass@issuer.example.com/jwks')).toBeNull();
    });
  });

  describe('rejects forgiving-parse whitespace and control characters', () => {
    it.each([
      ['leading space', ' https://issuer.example.com/jwks'],
      ['trailing space', 'https://issuer.example.com/jwks '],
      ['leading tab', '\thttps://issuer.example.com/jwks'],
      ['embedded newline', 'https://issuer.example.com/\nfoo'],
      ['embedded carriage return', 'https://issuer.example.com/\rfoo'],
      ['embedded tab', 'https://issuer.example.com/\tfoo'],
      ['embedded null', 'https://issuer.example.com/\u0000foo'],
      ['DEL character', 'https://issuer.example.com/\u007Ffoo'],
    ])('returns null for a keyid with %s', (_label, keyid) => {
      expect(issuerFromKeyid(keyid)).toBeNull();
    });
  });

  describe('input hardening', () => {
    it('returns null for non-string input', () => {
      // Defensive: callers pass attacker-influenced values.
      expect(issuerFromKeyid(undefined as unknown as string)).toBeNull();
      expect(issuerFromKeyid(null as unknown as string)).toBeNull();
      expect(issuerFromKeyid(42 as unknown as string)).toBeNull();
    });

    it('never derives an issuer from request-like host strings', () => {
      // A bare host or `https://${host}`-style value built from a Host header
      // must not be trusted unless it is a real absolute https URL keyid.
      expect(issuerFromKeyid('attacker.controlled.host')).toBeNull();
    });
  });
});
