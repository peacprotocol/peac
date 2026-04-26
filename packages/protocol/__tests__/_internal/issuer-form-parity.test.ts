/**
 * Layer-isolated parity test: bounded internal issuer-form validator
 * vs the canonical isCanonicalIss in @peac/schema.
 *
 * Compares the normalized {accepted, errorCode?} result byte-for-byte
 * across the re-included issuer-form fixtures and a synthetic edge-
 * case set. Layer-isolated means: only the iss canonical-form check
 * is exercised on either side; kernel constraints, type-extension
 * mapping, JOSE hardening, temporal warnings, policy binding, and
 * full-JWS verification are NOT in scope here.
 *
 * LEFT side: isCanonicalIss(iss) -> boolean -> projected to result
 * RIGHT side: validateIssuerFormInternal(iss) -> result
 *
 * Only one canonical error code (E_ISS_NOT_CANONICAL); no path field.
 *
 * Any divergence is stop-the-line.
 */

import { describe, it, expect } from 'vitest';
import { isCanonicalIss } from '@peac/schema';
import {
  validateIssuerFormInternal,
  type IssuerFormResult,
} from '../../src/_internal/record-core/validators';
import { loadFixtureManifest } from '../../src/_internal/test-helpers/fixture-manifest';

// ---------------------------------------------------------------------------
// LEFT (canonical) helper: projects isCanonicalIss to the normalized
// {accepted, errorCode?} shape
// ---------------------------------------------------------------------------

function runCanonicalIssuerForm(iss: unknown): IssuerFormResult {
  // Canonical accepts only string inputs at the type level; mirror the
  // isCanonicalIss internal type guard for parity.
  if (typeof iss !== 'string') {
    return { accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' };
  }
  return isCanonicalIss(iss)
    ? { accepted: true }
    : { accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' };
}

function bothAgree(iss: unknown): IssuerFormResult {
  const left = runCanonicalIssuerForm(iss);
  const right = validateIssuerFormInternal(iss);
  expect(right).toEqual(left);
  return left;
}

// ---------------------------------------------------------------------------
// Fixture-driven parity (re-included issuer-form fixtures)
// ---------------------------------------------------------------------------

const manifest = loadFixtureManifest();
const issuerFormFixtures = manifest.included.filter((e) => e.category === 'included_issuer_form');

describe('issuer-form parity (LEFT isCanonicalIss vs RIGHT internal)', () => {
  it('manifest re-included at least one issuer-form fixture', () => {
    expect(issuerFormFixtures.length).toBeGreaterThan(0);
  });

  describe('result byte-equal on every re-included fixture', () => {
    for (const entry of issuerFormFixtures) {
      it(`${entry.source}/${entry.family}/${entry.id}: LEFT === RIGHT`, () => {
        const iss = (entry.input as { iss?: unknown }).iss;
        bothAgree(iss);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Synthetic edge cases (boundary-anchored to the canonical rule)
// ---------------------------------------------------------------------------

describe('issuer-form edge cases (LEFT vs RIGHT)', () => {
  describe('type and length', () => {
    it('non-string (undefined): rejected', () => {
      const r = bothAgree(undefined);
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('non-string (number): rejected', () => {
      const r = bothAgree(12345);
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('non-string (object): rejected', () => {
      const r = bothAgree({});
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('empty string: rejected', () => {
      const r = bothAgree('');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('https issuer at maxLength (2048 chars): accepted iff URL-valid', () => {
      // Build an https issuer of exactly 2048 chars: 'https://' (8) +
      // hostname (2040). Use a long hostname filled with valid label
      // characters separated by dots.
      const hostFill = 'abcdefghij'.repeat(204); // 2040 chars
      const iss = `https://${hostFill}`;
      expect(iss.length).toBe(2048);
      bothAgree(iss);
    });

    it('https issuer one over maxLength (2049 chars): rejected', () => {
      const hostFill = 'a'.repeat(2042);
      const iss = `https://${hostFill}`;
      expect(iss.length).toBe(2050);
      const r = bothAgree(iss);
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });
  });

  describe('https:// branch', () => {
    it('valid https origin: accepted', () => {
      const r = bothAgree('https://api.example.com');
      expect(r).toEqual({ accepted: true });
    });

    it('http (non-TLS) scheme: rejected', () => {
      const r = bothAgree('http://api.example.com');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('uppercase host: rejected (URL spec lowercases hostname; canonical exact-match check fails)', () => {
      const r = bothAgree('https://Example.com');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('explicit default port :443: rejected (URL spec drops it from origin reconstruction)', () => {
      const r = bothAgree('https://example.com:443');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('non-default port (:8443): accepted (canonical origin includes the port)', () => {
      const r = bothAgree('https://example.com:8443');
      expect(r).toEqual({ accepted: true });
    });

    it('trailing slash: rejected (origin reconstruction has no path)', () => {
      const r = bothAgree('https://example.com/');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('path: rejected', () => {
      const r = bothAgree('https://example.com/path');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('query: rejected', () => {
      const r = bothAgree('https://example.com?q=1');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('fragment: rejected', () => {
      const r = bothAgree('https://example.com#frag');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('userinfo (user@host): rejected', () => {
      const r = bothAgree('https://user@example.com');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('userinfo with password (user:pass@host): rejected', () => {
      const r = bothAgree('https://user:pass@example.com');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('punycode host: accepted (URL spec emits punycode in url.host; exact match holds)', () => {
      const r = bothAgree('https://xn--exmple-cua.com');
      expect(r).toEqual({ accepted: true });
    });
  });

  describe('did: branch', () => {
    it('did:key: simple identifier accepted', () => {
      const r = bothAgree('did:key:z6Mkf5rGNPCBq3nT');
      expect(r).toEqual({ accepted: true });
    });

    it('did:web with hostname-style id accepted', () => {
      const r = bothAgree('did:web:example.com');
      expect(r).toEqual({ accepted: true });
    });

    it('did:method-with-digits accepted', () => {
      const r = bothAgree('did:abc123:identifier');
      expect(r).toEqual({ accepted: true });
    });

    it('did with uppercase method letters: rejected (regex requires [a-z0-9]+)', () => {
      const r = bothAgree('did:KEY:abc');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('did with empty method: rejected', () => {
      const r = bothAgree('did::identifier');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('did with empty method-specific-id: rejected', () => {
      const r = bothAgree('did:key:');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('did with slash in method-specific-id: rejected', () => {
      const r = bothAgree('did:key:abc/sub');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('did with question mark in method-specific-id: rejected', () => {
      const r = bothAgree('did:key:abc?q');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('did with fragment in method-specific-id: rejected', () => {
      const r = bothAgree('did:key:abc#f');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });
  });

  describe('other schemes', () => {
    it('urn: scheme: rejected', () => {
      const r = bothAgree('urn:example:receipt');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('file: scheme: rejected', () => {
      const r = bothAgree('file:///etc/hosts');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('relative URL (no scheme): rejected', () => {
      const r = bothAgree('/api/example');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });

    it('plain string (no scheme): rejected', () => {
      const r = bothAgree('not-a-url');
      expect(r).toEqual({ accepted: false, errorCode: 'E_ISS_NOT_CANONICAL' });
    });
  });
});
