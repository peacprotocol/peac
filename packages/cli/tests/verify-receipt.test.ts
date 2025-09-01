import { jest } from '@jest/globals';
import { VerifyReceiptCommand } from '../src/cmd/verify-receipt.js';

describe('VerifyReceiptCommand', () => {
  let command: VerifyReceiptCommand;
  const mockLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  const mockError = jest.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    command = new VerifyReceiptCommand();
    jest.clearAllMocks();
  });

  afterAll(() => {
    mockLog.mockRestore();
    mockError.mockRestore();
  });

  describe('execute', () => {
    it('should verify valid receipt', async () => {
      const validReceipt = 'eyJhbGciOiJFZERTQSIsInR5cCI6ImFwcGxpY2F0aW9uL3BlYWMtcmVjZWlwdCtqd3MiLCJraWQiOiJrZXlfMTIzIn0.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIiwiYXVkIjoiaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20iLCJpYXQiOjE2OTQwODMyMDAsImV4cCI6MTY5NDA4Njg0MCwicGF0aCI6Ii9hcGkvdGVzdCIsIm1ldGhvZCI6IkdFVCIsInN0YXR1cyI6MjAwfQ.mockSignature';
      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: 'mock-key-value'
      };

      command.receipt = validReceipt;
      command.jwk = JSON.stringify(jwk);

      // Mock successful verification
      const mockVerifyReceipt = jest.fn().mockResolvedValue({
        valid: true,
        payload: {
          iss: 'https://example.com',
          path: '/api/test',
          method: 'GET',
          status: 200
        }
      });

      // Replace the actual implementation
      jest.doMock('@peacprotocol/sdk-node', () => ({
        verifyReceipt: mockVerifyReceipt
      }), { virtual: true });

      const exitCode = await command.execute();

      expect(exitCode).toBe(0);
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('✓ Receipt verified successfully')
      );
    });

    it('should handle invalid receipt', async () => {
      const invalidReceipt = 'invalid.receipt.format';
      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: 'mock-key-value'
      };

      command.receipt = invalidReceipt;
      command.jwk = JSON.stringify(jwk);

      const mockVerifyReceipt = jest.fn().mockResolvedValue({
        valid: false,
        reason: 'malformed'
      });

      jest.doMock('@peacprotocol/sdk-node', () => ({
        verifyReceipt: mockVerifyReceipt
      }), { virtual: true });

      const exitCode = await command.execute();

      expect(exitCode).toBe(1);
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('✗ Receipt verification failed: malformed')
      );
    });

    it('should handle missing receipt parameter', async () => {
      command.receipt = '';
      command.jwk = '{"kty":"OKP","crv":"Ed25519","x":"mock"}';

      const exitCode = await command.execute();

      expect(exitCode).toBe(2);
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('Receipt is required')
      );
    });

    it('should handle invalid JWK format', async () => {
      command.receipt = 'valid.receipt.here';
      command.jwk = 'invalid-json';

      const exitCode = await command.execute();

      expect(exitCode).toBe(2);
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JWK format')
      );
    });

    it('should handle verification errors', async () => {
      command.receipt = 'some.receipt.here';
      command.jwk = '{"kty":"OKP","crv":"Ed25519","x":"mock"}';

      const mockVerifyReceipt = jest.fn().mockRejectedValue(
        new Error('Network error')
      );

      jest.doMock('@peacprotocol/sdk-node', () => ({
        verifyReceipt: mockVerifyReceipt
      }), { virtual: true });

      const exitCode = await command.execute();

      expect(exitCode).toBe(3);
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('Error during verification: Network error')
      );
    });

    it('should format output correctly', async () => {
      const receipt = 'valid.receipt';
      const jwk = { kty: 'OKP', crv: 'Ed25519', x: 'key' };
      const mockPayload = {
        iss: 'https://issuer.com',
        aud: 'https://audience.com',
        path: '/api/resource',
        method: 'POST',
        status: 201,
        iat: 1694083200,
        exp: 1694086840
      };

      command.receipt = receipt;
      command.jwk = JSON.stringify(jwk);

      const mockVerifyReceipt = jest.fn().mockResolvedValue({
        valid: true,
        payload: mockPayload
      });

      jest.doMock('@peacprotocol/sdk-node', () => ({
        verifyReceipt: mockVerifyReceipt
      }), { virtual: true });

      await command.execute();

      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('✓ Receipt verified successfully')
      );
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('Issuer: https://issuer.com')
      );
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('Path: /api/resource')
      );
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('Method: POST')
      );
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('Status: 201')
      );
    });
  });
});