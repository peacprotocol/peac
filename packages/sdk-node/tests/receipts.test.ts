import { jest } from '@jest/globals';
import { verifyReceipt } from '../src/receipts.js';

// Mock @noble/ed25519
jest.mock('@noble/ed25519', () => ({
  getPublicKey: jest.fn(),
  sign: jest.fn(),
  verify: jest.fn(),
}));

const mockEd25519 = jest.requireMock('@noble/ed25519');

describe('Receipts Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyReceipt', () => {
    const mockPrivateKey = new Uint8Array(32).fill(1);
    const mockPublicKey = new Uint8Array(32).fill(2);
    const validReceipt =
      'eyJhbGciOiJFZERTQSIsInR5cCI6ImFwcGxpY2F0aW9uL3BlYWMtcmVjZWlwdCtqd3MiLCJraWQiOiJrZXlfMTIzIn0.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIiwiYXVkIjoiaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20iLCJpYXQiOjE2OTQwODMyMDAsImV4cCI6MTY5NDA4Njg0MCwicGF0aCI6Ii9hcGkvdGVzdCIsIm1ldGhvZCI6IkdFVCIsInN0YXR1cyI6MjAwfQ.mockSignature';

    it('should verify valid receipt', async () => {
      mockGetPublicKey.mockResolvedValue(mockPublicKey);
      mockVerify.mockResolvedValue(true);

      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(mockPublicKey).toString('base64url'),
      };

      const result = await verifyReceipt(validReceipt, jwk);

      expect(result.valid).toBe(true);
      expect(result.payload).toMatchObject({
        iss: 'https://example.com',
        aud: 'https://api.example.com',
        path: '/api/test',
        method: 'GET',
        status: 200,
      });
    });

    it('should reject invalid signature', async () => {
      mockGetPublicKey.mockResolvedValue(mockPublicKey);
      mockVerify.mockResolvedValue(false);

      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(mockPublicKey).toString('base64url'),
      };

      const result = await verifyReceipt(validReceipt, jwk);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('signature_invalid');
    });

    it('should reject malformed receipt', async () => {
      const invalidReceipt = 'not.a.valid.jwt';

      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(mockPublicKey).toString('base64url'),
      };

      const result = await verifyReceipt(invalidReceipt, jwk);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('malformed');
    });

    it('should validate receipt claims', async () => {
      mockGetPublicKey.mockResolvedValue(mockPublicKey);
      mockVerify.mockResolvedValue(true);

      // Receipt with expired timestamp
      const expiredReceipt =
        'eyJhbGciOiJFZERTQSIsInR5cCI6ImFwcGxpY2F0aW9uL3BlYWMtcmVjZWlwdCtqd3MiLCJraWQiOiJrZXlfMTIzIn0.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIiwiYXVkIjoiaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20iLCJpYXQiOjE2OTQwODMyMDAsImV4cCI6MTY5NDA4MzIwMSwicGF0aCI6Ii9hcGkvdGVzdCIsIm1ldGhvZCI6IkdFVCIsInN0YXR1cyI6MjAwfQ.mockSignature';

      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(mockPublicKey).toString('base64url'),
      };

      const result = await verifyReceipt(expiredReceipt, jwk);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('expired');
    });

    it('should handle missing required claims', async () => {
      mockGetPublicKey.mockResolvedValue(mockPublicKey);
      mockVerify.mockResolvedValue(true);

      // Receipt missing required path claim
      const incompleteReceipt =
        'eyJhbGciOiJFZERTQSIsInR5cCI6ImFwcGxpY2F0aW9uL3BlYWMtcmVjZWlwdCtqd3MiLCJraWQiOiJrZXlfMTIzIn0.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIiwiYXVkIjoiaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20iLCJpYXQiOjE2OTQwODMyMDAsImV4cCI6MTY5NDA4Njg0MCwibWV0aG9kIjoiR0VUIiwic3RhdHVzIjoyMDB9.mockSignature';

      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(mockPublicKey).toString('base64url'),
      };

      const result = await verifyReceipt(incompleteReceipt, jwk);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing_claims');
    });

    it('should reject unsupported key type', async () => {
      const rsaJwk = {
        kty: 'RSA',
        n: 'mockModulus',
        e: 'AQAB',
      };

      const result = await verifyReceipt(validReceipt, rsaJwk);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('unsupported_key_type');
    });

    it('should handle invalid JWK format', async () => {
      const invalidJwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        // Missing required x parameter
      };

      const result = await verifyReceipt(validReceipt, invalidJwk);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('invalid_jwk');
    });

    it('should validate receipt type header', async () => {
      mockGetPublicKey.mockResolvedValue(mockPublicKey);
      mockVerify.mockResolvedValue(true);

      // Receipt with wrong type header
      const wrongTypeReceipt =
        'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCIsImtpZCI6ImtleV8xMjMifQ.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIiwiYXVkIjoiaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20iLCJpYXQiOjE2OTQwODMyMDAsImV4cCI6MTY5NDA4Njg0MCwicGF0aCI6Ii9hcGkvdGVzdCIsIm1ldGhvZCI6IkdFVCIsInN0YXR1cyI6MjAwfQ.mockSignature';

      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(mockPublicKey).toString('base64url'),
      };

      const result = await verifyReceipt(wrongTypeReceipt, jwk);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('invalid_type');
    });
  });
});
