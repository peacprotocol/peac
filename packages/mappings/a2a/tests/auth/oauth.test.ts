import { describe, it, expect, vi } from 'vitest';
import { buildAuthorizationRequest, exchangeAuthorizationCode } from '../../src/auth/oauth';
import type { A2AOAuthConfig, FetchFn } from '../../src/auth/oauth';

const BASE_CONFIG: A2AOAuthConfig = {
  authorizationUrl: 'https://auth.example.com/authorize',
  tokenUrl: 'https://auth.example.com/token',
  clientId: 'test-client',
  redirectUri: 'https://app.example.com/callback',
};

const PKCE = {
  challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
};

describe('buildAuthorizationRequest()', () => {
  it('builds URL with required OAuth parameters', () => {
    const result = buildAuthorizationRequest(BASE_CONFIG, PKCE);
    const url = new URL(result.url);

    expect(url.origin + url.pathname).toBe('https://auth.example.com/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('test-client');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/callback');
    expect(url.searchParams.get('code_challenge')).toBe(PKCE.challenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  it('includes scopes when provided', () => {
    const config = { ...BASE_CONFIG, scopes: ['read', 'write'] };
    const result = buildAuthorizationRequest(config, PKCE);
    const url = new URL(result.url);
    expect(url.searchParams.get('scope')).toBe('read write');
  });

  it('includes extra params when provided', () => {
    const config = { ...BASE_CONFIG, extraParams: { audience: 'https://api.example.com' } };
    const result = buildAuthorizationRequest(config, PKCE);
    const url = new URL(result.url);
    expect(url.searchParams.get('audience')).toBe('https://api.example.com');
  });

  it('returns the PKCE verifier for later exchange', () => {
    const result = buildAuthorizationRequest(BASE_CONFIG, PKCE);
    expect(result.codeVerifier).toBe(PKCE.verifier);
  });

  it('generates a state parameter', () => {
    const result = buildAuthorizationRequest(BASE_CONFIG, PKCE);
    expect(result.state).toBeTruthy();
    expect(result.state.length).toBe(32); // 16 bytes hex
  });

  it('generates unique state values', () => {
    const a = buildAuthorizationRequest(BASE_CONFIG, PKCE);
    const b = buildAuthorizationRequest(BASE_CONFIG, PKCE);
    expect(a.state).not.toBe(b.state);
  });

  it('throws for non-HTTPS authorization endpoint', () => {
    const config = { ...BASE_CONFIG, authorizationUrl: 'http://evil.com/auth' };
    expect(() => buildAuthorizationRequest(config, PKCE)).toThrow(/HTTPS/);
  });

  it('throws for non-HTTPS redirect URI', () => {
    const config = { ...BASE_CONFIG, redirectUri: 'http://evil.com/callback' };
    expect(() => buildAuthorizationRequest(config, PKCE)).toThrow(/HTTPS/);
  });

  it('allows localhost HTTP for development (authorizationUrl)', () => {
    const config = { ...BASE_CONFIG, authorizationUrl: 'http://localhost:8080/auth' };
    expect(() => buildAuthorizationRequest(config, PKCE)).not.toThrow();
  });

  it('allows localhost HTTP for development (redirectUri)', () => {
    const config = { ...BASE_CONFIG, redirectUri: 'http://localhost:3000/callback' };
    expect(() => buildAuthorizationRequest(config, PKCE)).not.toThrow();
  });

  it('rejects extraParams that override reserved OAuth params', () => {
    const config = { ...BASE_CONFIG, extraParams: { response_type: 'token' } };
    expect(() => buildAuthorizationRequest(config, PKCE)).toThrow(
      /reserved OAuth parameter.*response_type/
    );
  });

  it('rejects extraParams overriding client_id', () => {
    const config = { ...BASE_CONFIG, extraParams: { client_id: 'injected' } };
    expect(() => buildAuthorizationRequest(config, PKCE)).toThrow(
      /reserved OAuth parameter.*client_id/
    );
  });

  it('rejects extraParams overriding code_challenge', () => {
    const config = { ...BASE_CONFIG, extraParams: { code_challenge: 'fake' } };
    expect(() => buildAuthorizationRequest(config, PKCE)).toThrow(/reserved OAuth parameter/);
  });

  it('rejects extraParams overriding state', () => {
    const config = { ...BASE_CONFIG, extraParams: { state: 'controlled' } };
    expect(() => buildAuthorizationRequest(config, PKCE)).toThrow(/reserved OAuth parameter/);
  });
});

describe('exchangeAuthorizationCode()', () => {
  function mockFetch(responseBody: unknown, status = 200): FetchFn {
    return vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(responseBody),
      text: () => Promise.resolve(JSON.stringify(responseBody)),
    }) as unknown as FetchFn;
  }

  const VALID_TOKEN_RESPONSE = {
    access_token: 'at_test_123',
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'read write',
  };

  it('sends correct parameters to token endpoint', async () => {
    const fetchFn = mockFetch(VALID_TOKEN_RESPONSE);
    await exchangeAuthorizationCode('auth_code_123', PKCE.verifier, BASE_CONFIG, fetchFn);

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, options] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://auth.example.com/token');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    const body = new URLSearchParams(options.body);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth_code_123');
    expect(body.get('redirect_uri')).toBe('https://app.example.com/callback');
    expect(body.get('client_id')).toBe('test-client');
    expect(body.get('code_verifier')).toBe(PKCE.verifier);
  });

  it('returns parsed token response on success', async () => {
    const fetchFn = mockFetch(VALID_TOKEN_RESPONSE);
    const result = await exchangeAuthorizationCode('code', PKCE.verifier, BASE_CONFIG, fetchFn);

    expect(result.access_token).toBe('at_test_123');
    expect(result.token_type).toBe('Bearer');
    expect(result.expires_in).toBe(3600);
  });

  it('throws on non-OK HTTP response', async () => {
    const fetchFn = mockFetch({ error: 'invalid_grant' }, 400);
    await expect(
      exchangeAuthorizationCode('bad_code', PKCE.verifier, BASE_CONFIG, fetchFn)
    ).rejects.toThrow(/Token exchange failed.*400/);
  });

  it('throws on missing access_token in response', async () => {
    const fetchFn = mockFetch({ token_type: 'Bearer' });
    await expect(
      exchangeAuthorizationCode('code', PKCE.verifier, BASE_CONFIG, fetchFn)
    ).rejects.toThrow(/missing required fields/);
  });

  it('throws on missing token_type in response', async () => {
    const fetchFn = mockFetch({ access_token: 'token' });
    await expect(
      exchangeAuthorizationCode('code', PKCE.verifier, BASE_CONFIG, fetchFn)
    ).rejects.toThrow(/missing required fields/);
  });

  it('throws for non-HTTPS token endpoint', async () => {
    const config = { ...BASE_CONFIG, tokenUrl: 'http://evil.com/token' };
    const fetchFn = mockFetch(VALID_TOKEN_RESPONSE);
    await expect(exchangeAuthorizationCode('code', PKCE.verifier, config, fetchFn)).rejects.toThrow(
      /HTTPS/
    );
  });

  it('validates PKCE verifier before sending request', async () => {
    const fetchFn = mockFetch(VALID_TOKEN_RESPONSE);
    await expect(exchangeAuthorizationCode('code', 'short', BASE_CONFIG, fetchFn)).rejects.toThrow(
      /PKCE verifier length/
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('validates redirectUri uses HTTPS', async () => {
    const config = { ...BASE_CONFIG, redirectUri: 'http://evil.com/callback' };
    const fetchFn = mockFetch(VALID_TOKEN_RESPONSE);
    await expect(exchangeAuthorizationCode('code', PKCE.verifier, config, fetchFn)).rejects.toThrow(
      /HTTPS/
    );
  });
});
