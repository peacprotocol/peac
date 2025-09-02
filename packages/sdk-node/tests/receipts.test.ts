import { jest } from '@jest/globals';
import { verifyReceipt } from '../src/receipts.js';

// Mock @noble/ed25519
jest.mock('@noble/ed25519', () => ({
  getPublicKey: jest.fn(),
  sign: jest.fn(),
  verify: jest.fn(),
}));

const mockEd25519 = jest.requireMock('@noble/ed25519');
const mockVerify = mockEd25519.verify;

describe('Receipts Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyReceipt', () => {
    const mockPrivateKey = new Uint8Array(32).fill(1);
    const mockPublicKey = new Uint8Array(32).fill(2);
    // Create a proper mock signature (64 bytes for Ed25519)
    const mockSignature = Buffer.from(new Uint8Array(64).fill(42)).toString('base64url');
    // Use current timestamp to avoid expiration
    const validReceipt =
      'eyJhbGciOiJFZERTQSIsInR5cCI6ImFwcGxpY2F0aW9uL3BlYWMtcmVjZWlwdCIsImtpZCI6ImtleV8xMjMifQ.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIiwiYXVkIjoiaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20iLCJpYXQiOjE3NTY3NjU4MzYsInBhdGgiOiIvYXBpL3Rlc3QiLCJtZXRob2QiOiJHRVQiLCJzdGF0dXMiOjIwMH0.' +
      mockSignature;

    it('should verify valid receipt', async () => {
      mockVerify.mockResolvedValue(true);

      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(mockPublicKey).toString('base64url'),
      };

      const keyStore = { key_123: jwk };
      const result = await verifyReceipt(validReceipt, keyStore);

      expect(result.ok).toBe(true);
      expect(result.claims).toMatchObject({
        iss: 'https://example.com',
        aud: 'https://api.example.com',
        path: '/api/test',
        method: 'GET',
        status: 200,
      });
    });

    it('should reject invalid signature', async () => {
      mockVerify.mockResolvedValue(false);

      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(mockPublicKey).toString('base64url'),
      };

      const keyStore = { key_123: jwk };
      const result = await verifyReceipt(validReceipt, keyStore);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('signature_invalid');
    });

    it('should reject malformed receipt', async () => {
      const invalidReceipt = 'not.a.valid.jwt';

      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(mockPublicKey).toString('base64url'),
      };

      const keyStore = { key_123: jwk };
      const result = await verifyReceipt(invalidReceipt, keyStore);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('invalid_jws_format');
    });

    it('should validate receipt claims', async () => {
      mockVerify.mockResolvedValue(true);

      // Receipt with very old timestamp (over 30 days ago)
      const expiredReceipt =
        'eyJhbGciOiJFZERTQSIsInR5cCI6ImFwcGxpY2F0aW9uL3BlYWMtcmVjZWlwdCIsImtpZCI6ImtleV8xMjMifQ.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIiwiYXVkIjoiaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20iLCJpYXQiOjE2OTQwODMyMDAsInBhdGgiOiIvYXBpL3Rlc3QiLCJtZXRob2QiOiJHRVQiLCJzdGF0dXMiOjIwMH0.' +
        mockSignature;

      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(mockPublicKey).toString('base64url'),
      };

      const keyStore = { key_123: jwk };
      const result = await verifyReceipt(expiredReceipt, keyStore);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('expired');
    });

    it('should handle missing required claims', async () => {
      mockVerify.mockResolvedValue(true);

      // Receipt missing kid in header
      const incompleteReceipt =
        'eyJhbGciOiJFZERTQSIsInR5cCI6ImFwcGxpY2F0aW9uL3BlYWMtcmVjZWlwdCJ9.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIiwiYXVkIjoiaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20iLCJpYXQiOjE3MjU0ODcyMDAsInBhdGgiOiIvYXBpL3Rlc3QiLCJtZXRob2QiOiJHRVQiLCJzdGF0dXMiOjIwMH0.' +
        mockSignature;

      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(mockPublicKey).toString('base64url'),
      };

      const keyStore = { key_123: jwk };
      const result = await verifyReceipt(incompleteReceipt, keyStore);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('missing_kid');
    });

    it('should reject unsupported key type', async () => {
      const rsaJwk = {
        kty: 'RSA',
        n: 'mockModulus',
        e: 'AQAB',
      };

      const keyStore = { key_123: rsaJwk };
      const result = await verifyReceipt(validReceipt, keyStore);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('invalid_key_type');
    });

    it('should handle invalid JWK format', async () => {
      const invalidJwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        // Missing required x parameter
      };

      const keyStore = { key_123: invalidJwk };
      const result = await verifyReceipt(validReceipt, keyStore);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('missing_public_key');
    });

    it('should validate receipt type header', async () => {
      mockVerify.mockResolvedValue(true);

      // Receipt with wrong type header
      const wrongTypeReceipt =
        'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCIsImtpZCI6ImtleV8xMjMifQ.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIiwiYXVkIjoiaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20iLCJpYXQiOjE3MjU0ODcyMDAsInBhdGgiOiIvYXBpL3Rlc3QiLCJtZXRob2QiOiJHRVQiLCJzdGF0dXMiOjIwMH0.' +
        mockSignature;

      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(mockPublicKey).toString('base64url'),
      };

      const keyStore = { key_123: jwk };
      const result = await verifyReceipt(wrongTypeReceipt, keyStore);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('invalid_type');
    });
  });
});
