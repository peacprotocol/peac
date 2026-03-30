import { describe, it, expect } from 'vitest';
import { DidKeyResolver } from '../src/did-key.js';
import { extractVerificationKey } from '../src/extract-key.js';
import { extractEd25519FromMultibase } from '../src/multicodec.js';
import { DIDError } from '../src/errors.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// W3C DID test suite Ed25519 key (z6Mk prefix = Ed25519 multicodec 0xed01 + base58btc)
const VALID_DID_KEY = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
const VALID_MULTIBASE = 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

// ---------------------------------------------------------------------------
// Tests: DidKeyResolver
// ---------------------------------------------------------------------------

describe('DidKeyResolver', () => {
  const resolver = new DidKeyResolver();

  it('has methods = ["key"]', () => {
    expect(resolver.methods).toEqual(['key']);
  });

  it('resolves a valid did:key to a DID Document', async () => {
    const result = await resolver.resolve(VALID_DID_KEY);
    expect(result.didDocument).not.toBeNull();
    expect(result.didDocument!.id).toBe(VALID_DID_KEY);
    expect(result.didResolutionMetadata.error).toBeUndefined();
  });

  it('produces a DID Document with correct structure', async () => {
    const result = await resolver.resolve(VALID_DID_KEY);
    const doc = result.didDocument!;

    expect(doc['@context']).toContain('https://www.w3.org/ns/did/v1');
    expect(doc.verificationMethod).toHaveLength(1);
    expect(doc.authentication).toHaveLength(1);
    expect(doc.assertionMethod).toHaveLength(1);
  });

  it('produces a verification method with correct type and key', async () => {
    const result = await resolver.resolve(VALID_DID_KEY);
    const vm = result.didDocument!.verificationMethod![0];

    expect(vm.type).toBe('Ed25519VerificationKey2020');
    expect(vm.controller).toBe(VALID_DID_KEY);
    expect(vm.publicKeyMultibase).toBe(VALID_MULTIBASE);
    expect(vm.id).toBe(`${VALID_DID_KEY}#${VALID_MULTIBASE}`);
  });

  it('rejects non-did:key DIDs', async () => {
    const result = await resolver.resolve('did:web:example.com');
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('rejects empty multibase value', async () => {
    const result = await resolver.resolve('did:key:');
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('rejects malformed DID', async () => {
    const result = await resolver.resolve('not-a-did');
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });
});

// ---------------------------------------------------------------------------
// Tests: extractEd25519FromMultibase
// ---------------------------------------------------------------------------

describe('extractEd25519FromMultibase', () => {
  it('extracts Ed25519 key from base58btc (z prefix)', () => {
    const key = extractEd25519FromMultibase(VALID_MULTIBASE);
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it('throws on non-Ed25519 multicodec prefix', () => {
    // P-256 multicodec prefix is 0x8024; craft a fake multibase value
    expect(() => extractEd25519FromMultibase('zSomethingTooShort')).toThrow(DIDError);
  });

  it('extracts Ed25519 key from base64url (u prefix)', () => {
    // Build a valid Ed25519 multicodec value: 0xed01 prefix + 32 zero bytes
    const prefix = Buffer.from([0xed, 0x01]);
    const keyBytes = Buffer.alloc(32, 0);
    const combined = Buffer.concat([prefix, keyBytes]);
    const base64urlEncoded = 'u' + combined.toString('base64url');

    const key = extractEd25519FromMultibase(base64urlEncoded);
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
    expect(key.every((b) => b === 0)).toBe(true);
  });

  it('rejects non-Ed25519 multicodec prefix without type oracle', () => {
    // P-256 multicodec prefix is 0x80, 0x24; build a fake 34-byte value
    const nonEd = Buffer.from([0x80, 0x24, ...new Array(32).fill(0)]);
    const encoded = 'u' + nonEd.toString('base64url');

    try {
      extractEd25519FromMultibase(encoded);
      expect.fail('Expected DIDError');
    } catch (e) {
      expect(e).toBeInstanceOf(DIDError);
      expect((e as DIDError).code).toBe('E_DID_KEY_NOT_FOUND');
      // Error message must NOT reveal the actual key type (no oracle)
      expect((e as DIDError).message).not.toContain('P-256');
      expect((e as DIDError).message).not.toContain('0x80');
    }
  });

  it('throws on unsupported multibase prefix', () => {
    expect(() => extractEd25519FromMultibase('m' + 'AAAA')).toThrow(DIDError);
    expect(() => extractEd25519FromMultibase('m' + 'AAAA')).toThrow(/Unsupported multibase prefix/);
  });

  it('throws on empty input', () => {
    expect(() => extractEd25519FromMultibase('')).toThrow(DIDError);
  });

  it('throws on wrong length (too short)', () => {
    const short = Buffer.from([0xed, 0x01, 0x00]);
    const encoded = 'u' + short.toString('base64url');
    expect(() => extractEd25519FromMultibase(encoded)).toThrow(DIDError);
  });
});

// ---------------------------------------------------------------------------
// Tests: extractVerificationKey (DD-202 selection policy)
// ---------------------------------------------------------------------------

describe('extractVerificationKey', () => {
  it('extracts Ed25519 key from did:key document', async () => {
    const resolver = new DidKeyResolver();
    const result = await resolver.resolve(VALID_DID_KEY);
    const key = extractVerificationKey(result.didDocument!);

    expect(key).not.toBeNull();
    expect(key!.length).toBe(32);
  });

  it('returns null for document with no verification methods', () => {
    const key = extractVerificationKey({
      '@context': 'https://www.w3.org/ns/did/v1',
      id: 'did:example:123',
    });
    expect(key).toBeNull();
  });

  it('selects by keyId when provided', async () => {
    const resolver = new DidKeyResolver();
    const result = await resolver.resolve(VALID_DID_KEY);
    const doc = result.didDocument!;
    const expectedId = doc.verificationMethod![0].id;

    const key = extractVerificationKey(doc, { keyId: expectedId });
    expect(key).not.toBeNull();
    expect(key!.length).toBe(32);
  });

  it('returns null when keyId does not match', async () => {
    const resolver = new DidKeyResolver();
    const result = await resolver.resolve(VALID_DID_KEY);
    const key = extractVerificationKey(result.didDocument!, {
      keyId: 'did:key:z6Mk...#nonexistent',
    });
    expect(key).toBeNull();
  });

  it('throws E_DID_KEY_AMBIGUOUS for multiple Ed25519 keys without keyId', () => {
    const doc = {
      '@context': 'https://www.w3.org/ns/did/v1' as const,
      id: 'did:example:multi',
      verificationMethod: [
        {
          id: 'did:example:multi#key1',
          type: 'Ed25519VerificationKey2020',
          controller: 'did:example:multi',
          publicKeyMultibase: VALID_MULTIBASE,
        },
        {
          id: 'did:example:multi#key2',
          type: 'Ed25519VerificationKey2020',
          controller: 'did:example:multi',
          publicKeyMultibase: VALID_MULTIBASE,
        },
      ],
    };

    try {
      extractVerificationKey(doc);
      expect.fail('Expected E_DID_KEY_AMBIGUOUS');
    } catch (e) {
      expect(e).toBeInstanceOf(DIDError);
      expect((e as DIDError).code).toBe('E_DID_KEY_AMBIGUOUS');
    }
  });

  it('prefers authentication-referenced methods', async () => {
    const doc = {
      '@context': 'https://www.w3.org/ns/did/v1' as const,
      id: 'did:example:pref',
      verificationMethod: [
        {
          id: 'did:example:pref#key1',
          type: 'Ed25519VerificationKey2020',
          controller: 'did:example:pref',
          publicKeyMultibase: VALID_MULTIBASE,
        },
        {
          id: 'did:example:pref#key2',
          type: 'Ed25519VerificationKey2020',
          controller: 'did:example:pref',
          publicKeyMultibase: VALID_MULTIBASE,
        },
      ],
      authentication: ['did:example:pref#key1'],
    };

    // With authentication reference, only key1 is selected (no ambiguity)
    const key = extractVerificationKey(doc, { relationship: 'authentication' });
    expect(key).not.toBeNull();
    expect(key!.length).toBe(32);
  });

  it('extracts key from JWK (OKP/Ed25519)', () => {
    const doc = {
      '@context': 'https://www.w3.org/ns/did/v1' as const,
      id: 'did:example:jwk',
      verificationMethod: [
        {
          id: 'did:example:jwk#key1',
          type: 'JsonWebKey2020',
          controller: 'did:example:jwk',
          publicKeyJwk: {
            kty: 'OKP',
            crv: 'Ed25519',
            // 32 bytes of zeros in base64url
            x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          },
        },
      ],
    };

    const key = extractVerificationKey(doc);
    expect(key).not.toBeNull();
    expect(key!.length).toBe(32);
  });

  it('skips non-Ed25519 JWK silently', () => {
    const doc = {
      '@context': 'https://www.w3.org/ns/did/v1' as const,
      id: 'did:example:p256',
      verificationMethod: [
        {
          id: 'did:example:p256#key1',
          type: 'JsonWebKey2020',
          controller: 'did:example:p256',
          publicKeyJwk: {
            kty: 'EC',
            crv: 'P-256',
            x: 'test',
            y: 'test',
          },
        },
      ],
    };

    const key = extractVerificationKey(doc);
    expect(key).toBeNull();
  });
});
