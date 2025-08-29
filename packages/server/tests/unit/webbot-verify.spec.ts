import { verifyWebBotAuth, VerifyFailure } from '../../src/adapters/webbot/verify';
import { validateSignatureAgentUrl } from '../../src/adapters/webbot/directory';
import { Request } from 'express';

describe('Web Bot Auth Verification', () => {
  describe('validateSignatureAgentUrl', () => {
    it('should accept valid HTTPS URLs', () => {
      expect(validateSignatureAgentUrl('https://agent.example.com')).toBe(true);
      expect(validateSignatureAgentUrl('https://subdomain.agent.com')).toBe(true);
    });

    it('should reject HTTP URLs', () => {
      expect(validateSignatureAgentUrl('http://agent.example.com')).toBe(false);
    });

    it('should reject IP literals', () => {
      expect(validateSignatureAgentUrl('https://192.168.1.1')).toBe(false);
      expect(validateSignatureAgentUrl('https://127.0.0.1')).toBe(false);
      expect(validateSignatureAgentUrl('https://[::1]')).toBe(false);
    });

    it('should reject forbidden TLDs', () => {
      expect(validateSignatureAgentUrl('https://agent.local')).toBe(false);
      expect(validateSignatureAgentUrl('https://agent.internal')).toBe(false);
      expect(validateSignatureAgentUrl('https://agent.corp')).toBe(false);
      expect(validateSignatureAgentUrl('https://agent.test')).toBe(false);
    });

    it('should reject invalid ports', () => {
      expect(validateSignatureAgentUrl('https://agent.com:80')).toBe(false);
      expect(validateSignatureAgentUrl('https://agent.com:8080')).toBe(false);
    });

    it('should accept port 443', () => {
      expect(validateSignatureAgentUrl('https://agent.example.com:443')).toBe(true);
    });

    it('should accept port 8443 when enabled', () => {
      expect(
        validateSignatureAgentUrl('https://agent.example.com:8443', {
          allowedPorts: [443, 8443],
        }),
      ).toBe(true);
    });

    it('should reject URLs with credentials', () => {
      expect(validateSignatureAgentUrl('https://user:pass@agent.com')).toBe(false);
    });

    it('should reject URLs with fragments', () => {
      expect(validateSignatureAgentUrl('https://agent.com#fragment')).toBe(false);
    });

    it('should reject oversized URLs', () => {
      const longUrl = 'https://agent.com/' + 'x'.repeat(2048);
      expect(validateSignatureAgentUrl(longUrl)).toBe(false);
    });
  });

  describe('verifyWebBotAuth', () => {
    const mockReq = (headers = {}) => ({
      headers,
    });

    it('should return no_headers failure when headers missing', async () => {
      const result = await verifyWebBotAuth(mockReq());

      expect(result.ok).toBe(false);
      expect(result.failure).toBe('no_headers');
    });

    it('should return bad_signature_agent for invalid URLs', async () => {
      const result = await verifyWebBotAuth(
        mockReq({
          signature: 'sig1=:test:',
          'signature-input': 'sig1=();created=123',
          'signature-agent': '"http://invalid.com"',
        }),
      );

      expect(result.ok).toBe(false);
      expect(result.failure).toBe('bad_signature_agent');
    });

    it('should return bad_signature_agent for IP literal URLs', async () => {
      const result = await verifyWebBotAuth(
        mockReq({
          signature: 'sig1=:test:',
          'signature-input': 'sig1=();created=123',
          'signature-agent': '"https://192.168.1.1"',
        }),
      );

      expect(result.ok).toBe(false);
      expect(result.failure).toBe('bad_signature_agent');
    });

    it('should return verifier_busy when max inflight reached', async () => {
      // This test would require mocking the inflight counter
      // Implementation depends on actual load testing
    });

    it('should handle fetch failures gracefully', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await verifyWebBotAuth(
        mockReq({
          signature: 'sig1=:test:',
          'signature-input': 'sig1=();created=123',
          'signature-agent': '"https://agent.example.com"',
        }),
        { fetchFn: mockFetch },
      );

      expect(result.ok).toBe(false);
      expect(result.failure).toBe('dir_fetch');
    });

    it('should reject oversized responses', async () => {
      const mockFetch = jest.fn().mockResolvedValue(
        new Response('x'.repeat(50000), {
          headers: { 'content-type': 'application/http-message-signatures-directory+json' },
        }),
      );

      const result = await verifyWebBotAuth(
        mockReq({
          signature: 'sig1=:test:',
          'signature-input': 'sig1=();created=123',
          'signature-agent': '"https://agent.example.com"',
        }),
        { fetchFn: mockFetch },
      );

      expect(result.ok).toBe(false);
      expect(result.failure).toBe('dir_fetch');
    });

    it('should reject wrong content type', async () => {
      const mockFetch = jest.fn().mockResolvedValue(
        new Response('{}', {
          headers: { 'content-type': 'application/json' },
        }),
      );

      const result = await verifyWebBotAuth(
        mockReq({
          signature: 'sig1=:test:',
          'signature-input': 'sig1=();created=123',
          'signature-agent': '"https://agent.example.com"',
        }),
        { fetchFn: mockFetch },
      );

      expect(result.ok).toBe(false);
      expect(result.failure).toBe('dir_media');
    });
  });
});
