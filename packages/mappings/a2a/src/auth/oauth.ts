/**
 * OAuth 2.0 authorization code flow utilities for A2A v1.0.
 *
 * A2A v1.0 specifies OAuth 2.0 with PKCE as the preferred auth model.
 * All network calls accept a `fetchFn` parameter (no global fetch).
 *
 * Config field names mirror the A2A spec OAuth flow object:
 * authorizationUrl, tokenUrl, refreshUrl, scopes, pkceRequired.
 */

import { validatePKCEVerifier } from './pkce.js';

// ---------------------------------------------------------------------------
// Adapter-local fetch signature (not `typeof fetch`)
// ---------------------------------------------------------------------------

/**
 * Minimal fetch signature for OAuth network calls.
 *
 * Narrower than global `fetch` to avoid coupling to runtime-specific
 * fetch extensions (AbortSignal, Request objects, etc.).
 */
export type FetchFn = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

// ---------------------------------------------------------------------------
// Types (A2A spec-faithful naming)
// ---------------------------------------------------------------------------

/**
 * OAuth 2.0 configuration for an A2A authorization server.
 *
 * Field names mirror the A2A spec OAuth flow object.
 */
export interface A2AOAuthConfig {
  /** Authorization endpoint URL (HTTPS required) */
  readonly authorizationUrl: string;
  /** Token endpoint URL (HTTPS required) */
  readonly tokenUrl: string;
  /** Refresh token endpoint URL (optional, HTTPS required) */
  readonly refreshUrl?: string;
  /** Client identifier */
  readonly clientId: string;
  /** Redirect URI for authorization code delivery (HTTPS required) */
  readonly redirectUri: string;
  /** Requested scopes */
  readonly scopes?: readonly string[];
  /** Whether PKCE is required (always true for A2A v1.0) */
  readonly pkceRequired?: boolean;
  /** Additional authorization parameters (must not override reserved params) */
  readonly extraParams?: Readonly<Record<string, string>>;
}

/**
 * Authorization request parameters for constructing the redirect URL.
 */
export interface AuthorizationRequest {
  /** Full authorization URL with query parameters */
  readonly url: string;
  /** PKCE code verifier (store securely; needed for token exchange) */
  readonly codeVerifier: string;
  /** State parameter for CSRF protection */
  readonly state: string;
}

/**
 * OAuth 2.0 token response from the authorization server.
 */
export interface TokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in?: number;
  readonly refresh_token?: string;
  readonly scope?: string;
}

// ---------------------------------------------------------------------------
// Reserved OAuth parameters that extraParams must not override
// ---------------------------------------------------------------------------

const RESERVED_PARAMS = new Set([
  'response_type',
  'client_id',
  'redirect_uri',
  'code_challenge',
  'code_challenge_method',
  'state',
  'scope',
  'grant_type',
  'code',
  'code_verifier',
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an authorization URL with PKCE challenge and state parameter.
 *
 * The caller must redirect the user-agent to the returned URL. The
 * `codeVerifier` must be stored securely for the subsequent token
 * exchange call.
 *
 * @param config - A2A OAuth server configuration
 * @param pkce - PKCE challenge pair (from `generatePKCEChallenge()`)
 * @returns Authorization request with URL, verifier, and state
 * @throws Error if endpoint URLs are not HTTPS or extraParams override reserved params
 */
export function buildAuthorizationRequest(
  config: A2AOAuthConfig,
  pkce: { readonly challenge: string; readonly verifier: string }
): AuthorizationRequest {
  validateEndpointUrl(config.authorizationUrl, 'authorizationUrl');
  validateEndpointUrl(config.redirectUri, 'redirectUri');

  if (config.extraParams) {
    for (const key of Object.keys(config.extraParams)) {
      if (RESERVED_PARAMS.has(key)) {
        throw new Error(`extraParams must not override reserved OAuth parameter: ${key}`);
      }
    }
  }

  const state = generateState();
  const authUrl = new URL(config.authorizationUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', config.redirectUri);
  authUrl.searchParams.set('code_challenge', pkce.challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);

  if (config.scopes && config.scopes.length > 0) {
    authUrl.searchParams.set('scope', config.scopes.join(' '));
  }

  if (config.extraParams) {
    for (const [key, value] of Object.entries(config.extraParams)) {
      authUrl.searchParams.set(key, value);
    }
  }

  return { url: authUrl.toString(), codeVerifier: pkce.verifier, state };
}

/**
 * Exchange an authorization code for tokens.
 *
 * Sends a POST to the token endpoint with the authorization code and
 * PKCE code verifier. Validates the verifier format before sending.
 *
 * @param code - Authorization code from the redirect callback
 * @param verifier - PKCE code verifier from the authorization request
 * @param config - A2A OAuth server configuration
 * @param fetchFn - Fetch implementation (no global fetch)
 * @returns Token response from the authorization server
 * @throws Error if the token endpoint returns an error response
 */
export async function exchangeAuthorizationCode(
  code: string,
  verifier: string,
  config: A2AOAuthConfig,
  fetchFn: FetchFn
): Promise<TokenResponse> {
  validateEndpointUrl(config.tokenUrl, 'tokenUrl');
  validateEndpointUrl(config.redirectUri, 'redirectUri');
  validatePKCEVerifier(verifier);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: verifier,
  });

  const response = await fetchFn(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw Object.assign(
      new Error(
        `Token exchange failed: HTTP ${response.status}${errorBody ? `: ${errorBody}` : ''}`
      ),
      { code: 'E_A2A_AUTH_TOKEN_EXCHANGE_FAILED', status: response.status }
    );
  }

  const tokenResponse = (await response.json()) as Record<string, unknown>;
  if (
    typeof tokenResponse.access_token !== 'string' ||
    typeof tokenResponse.token_type !== 'string'
  ) {
    throw Object.assign(
      new Error('Token response missing required fields (access_token, token_type)'),
      { code: 'E_A2A_AUTH_TOKEN_EXCHANGE_FAILED' }
    );
  }

  return tokenResponse as unknown as TokenResponse;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function validateEndpointUrl(url: string, name: string): void {
  if (!url.startsWith('https://') && !isLocalhostHttp(url)) {
    throw new Error(`${name} must use HTTPS (got: ${url})`);
  }
}

function isLocalhostHttp(url: string): boolean {
  if (!url.startsWith('http://')) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
