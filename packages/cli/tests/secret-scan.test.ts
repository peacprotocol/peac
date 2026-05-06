/**
 * Secret-scan regex tests.
 *
 * Confirms the (intentionally small) regex set catches the 5 named
 * categories: jwt, bearer-token, aws-access-key, api-key, generic-
 * high-entropy. The wrapper uses `scanForSecrets` to suppress raw
 * stream samples and `scanArgvElement` to suppress raw argv tokens.
 * The literal match is NEVER returned.
 */

import { describe, it, expect } from 'vitest';
import { scanForSecrets, scanArgvElement } from '../src/lib/secret-scan';

describe('scanForSecrets: detects the 5 named categories', () => {
  it('detects JWT shape', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.signature_here_yo';
    const result = scanForSecrets(jwt);
    expect(result).not.toBeNull();
    expect(result!.category).toBe('jwt');
  });

  it('detects Bearer token in HTTP-auth shape', () => {
    const result = scanForSecrets('Authorization: Bearer abcDEF123456ghiJKL789==');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('bearer-token');
  });

  it('detects AWS access key (AKIA prefix)', () => {
    const result = scanForSecrets('AKIAIOSFODNN7EXAMPLE');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('aws-access-key');
  });

  it('detects AWS access key (ASIA prefix)', () => {
    const result = scanForSecrets('ASIAIOSFODNN7EXAMPLE');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('aws-access-key');
  });

  it('detects api-key shape (sk_live_)', () => {
    const result = scanForSecrets('sk-live_abcdefghijklmnopqrstuvwxyz0123456789');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('api-key');
  });

  it('detects generic high-entropy token', () => {
    const result = scanForSecrets('xK9lMn2pQ7rSt4uV6wXy8z0aBcDeFgHi3jKlMn');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('generic-high-entropy');
  });

  it('returns null on plain text without any token shape', () => {
    expect(scanForSecrets('hello world')).toBeNull();
  });

  it('returns null on short alphanumeric strings', () => {
    expect(scanForSecrets('abc123')).toBeNull();
  });

  it('NEVER returns the literal matched text (only the category)', () => {
    const secret = 'AKIAIOSFODNN7EXAMPLE';
    const result = scanForSecrets(secret);
    expect(result).not.toBeNull();
    // Confirm the result object has only the category field; no value/text.
    expect(Object.keys(result!)).toEqual(['category']);
  });
});

describe('scanArgvElement: same shape, intent: argv tokens', () => {
  it('detects a JWT argv element', () => {
    const result = scanArgvElement('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ.sig_value_padding');
    expect(result?.category).toBe('jwt');
  });

  it('returns null for plain argv tokens', () => {
    expect(scanArgvElement('--verbose')).toBeNull();
    expect(scanArgvElement('foo.txt')).toBeNull();
  });
});
