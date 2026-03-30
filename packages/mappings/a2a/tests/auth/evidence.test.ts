import { describe, it, expect } from 'vitest';
import { fromA2AAuthEvent } from '../../src/auth/evidence';
import type { A2AAuthEvent } from '../../src/auth/evidence';
import { ACCESS_EXTENSION_KEY } from '@peac/schema';

const BASE_EVENT: A2AAuthEvent = {
  method: 'oauth2_pkce',
  resource: 'https://agent.example.com/tasks',
  action: 'tasks/send',
};

describe('fromA2AAuthEvent()', () => {
  it('produces access extension with decision "review" (observation only)', () => {
    const result = fromA2AAuthEvent(BASE_EVENT);
    expect(result.extension.decision).toBe('review');
  });

  it('uses the canonical access extension key', () => {
    const result = fromA2AAuthEvent(BASE_EVENT);
    expect(result.extensionKey).toBe(ACCESS_EXTENSION_KEY);
    expect(result.extensionKey).toBe('org.peacprotocol/access');
  });

  it('maps resource and action from the event', () => {
    const result = fromA2AAuthEvent(BASE_EVENT);
    expect(result.extension.resource).toBe('https://agent.example.com/tasks');
    expect(result.extension.action).toBe('tasks/send');
  });

  it('sets auth_event to "observation" in evidence metadata', () => {
    const result = fromA2AAuthEvent(BASE_EVENT);
    expect(result.evidence.auth_event).toBe('observation');
  });

  it('records auth method in evidence metadata', () => {
    const result = fromA2AAuthEvent(BASE_EVENT);
    expect(result.evidence.auth_method).toBe('oauth2_pkce');
  });

  it('includes granted scopes when present', () => {
    const event: A2AAuthEvent = {
      ...BASE_EVENT,
      grantedScopes: ['read', 'write'],
    };
    const result = fromA2AAuthEvent(event);
    expect(result.evidence.granted_scopes).toEqual(['read', 'write']);
  });

  it('omits granted_scopes when not present', () => {
    const result = fromA2AAuthEvent(BASE_EVENT);
    expect(result.evidence).not.toHaveProperty('granted_scopes');
  });

  it('includes auth server when present', () => {
    const event: A2AAuthEvent = {
      ...BASE_EVENT,
      authServer: 'https://auth.example.com',
    };
    const result = fromA2AAuthEvent(event);
    expect(result.evidence.auth_server).toBe('https://auth.example.com');
  });

  it('includes client_id when present', () => {
    const event: A2AAuthEvent = {
      ...BASE_EVENT,
      clientId: 'my-agent-client',
    };
    const result = fromA2AAuthEvent(event);
    expect(result.evidence.client_id).toBe('my-agent-client');
  });

  it('includes timestamp when present', () => {
    const event: A2AAuthEvent = {
      ...BASE_EVENT,
      timestamp: '2026-03-30T12:00:00Z',
    };
    const result = fromA2AAuthEvent(event);
    expect(result.evidence.timestamp).toBe('2026-03-30T12:00:00Z');
  });

  it('throws for missing resource', () => {
    const event = { ...BASE_EVENT, resource: '' };
    expect(() => fromA2AAuthEvent(event)).toThrow(/missing resource/);
  });

  it('throws for missing action', () => {
    const event = { ...BASE_EVENT, action: '' };
    expect(() => fromA2AAuthEvent(event)).toThrow(/missing action/);
  });

  it('handles device_code method', () => {
    const event: A2AAuthEvent = {
      method: 'oauth2_device_code',
      resource: 'https://agent.example.com/api',
      action: 'authenticate',
    };
    const result = fromA2AAuthEvent(event);
    expect(result.evidence.auth_method).toBe('oauth2_device_code');
    expect(result.extension.decision).toBe('review');
  });

  it('handles client_credentials method', () => {
    const event: A2AAuthEvent = {
      method: 'oauth2_client_credentials',
      resource: 'https://agent.example.com/api',
      action: 'authenticate',
    };
    const result = fromA2AAuthEvent(event);
    expect(result.evidence.auth_method).toBe('oauth2_client_credentials');
  });

  // -----------------------------------------------------------------------
  // Misuse-prevention: decision immutability
  // -----------------------------------------------------------------------

  describe('decision immutability (A2A-AUTH-002)', () => {
    it('never returns "allow" regardless of auth method or scopes', () => {
      const methods = ['oauth2_pkce', 'oauth2_device_code', 'oauth2_client_credentials'] as const;
      for (const method of methods) {
        const result = fromA2AAuthEvent({
          method,
          resource: 'https://agent.example.com/api',
          action: 'full_access',
          grantedScopes: ['admin', 'superuser', '*'],
          authServer: 'https://auth.example.com',
          clientId: 'trusted-client',
        });
        expect(result.extension.decision).toBe('review');
        expect(result.extension.decision).not.toBe('allow');
        expect(result.extension.decision).not.toBe('deny');
      }
    });

    it('auth_event is always "observation", never "access_granted" or "access_denied"', () => {
      const result = fromA2AAuthEvent({
        ...BASE_EVENT,
        grantedScopes: ['admin'],
      });
      expect(result.evidence.auth_event).toBe('observation');
      expect(result.evidence.auth_event).not.toBe('access_granted');
      expect(result.evidence.auth_event).not.toBe('access_denied');
    });
  });

  // -----------------------------------------------------------------------
  // Misuse-prevention: token omission
  // -----------------------------------------------------------------------

  describe('token omission (A2A-AUTH-001)', () => {
    it('never includes token-shaped fields in evidence output', () => {
      const result = fromA2AAuthEvent({
        ...BASE_EVENT,
        grantedScopes: ['admin'],
        authServer: 'https://auth.example.com',
        clientId: 'client',
        timestamp: '2026-03-30T12:00:00Z',
      });

      const evidenceKeys = Object.keys(result.evidence);
      const tokenFields = [
        'access_token',
        'refresh_token',
        'id_token',
        'token',
        'bearer',
        'secret',
        'password',
        'credential',
      ];
      for (const field of tokenFields) {
        expect(evidenceKeys).not.toContain(field);
      }

      const evidenceStr = JSON.stringify(result.evidence);
      expect(evidenceStr).not.toContain('access_token');
      expect(evidenceStr).not.toContain('refresh_token');
      expect(evidenceStr).not.toContain('id_token');
    });

    it('evidence contains only structural metadata, not secret material', () => {
      const result = fromA2AAuthEvent({
        ...BASE_EVENT,
        grantedScopes: ['read', 'write'],
        authServer: 'https://auth.example.com',
        clientId: 'my-client',
        timestamp: '2026-03-30T12:00:00Z',
      });

      const allowedKeys = new Set([
        'auth_event',
        'auth_method',
        'granted_scopes',
        'auth_server',
        'client_id',
        'timestamp',
      ]);
      for (const key of Object.keys(result.evidence)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
    });
  });
});
