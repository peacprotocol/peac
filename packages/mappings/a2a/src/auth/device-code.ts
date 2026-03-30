/**
 * OAuth 2.0 Device Authorization Grant types for A2A.
 *
 * Types only: no implementation in this release. Device Code flow
 * (RFC 8628) is an alternative auth model for headless A2A agents
 * that cannot handle browser redirects.
 *
 * All type names and field names mirror RFC 8628 wire format exactly.
 * Normalization (if needed) belongs in a separate layer.
 */

// ---------------------------------------------------------------------------
// A2A Device Code flow configuration
// ---------------------------------------------------------------------------

/**
 * A2A Device Code flow configuration.
 *
 * Field names mirror the A2A spec OAuth flow object for Device Code.
 */
export interface A2ADeviceCodeFlowConfig {
  /** Device authorization endpoint URL (HTTPS required) */
  readonly deviceAuthorizationUrl: string;
  /** Token endpoint URL (HTTPS required) */
  readonly tokenUrl: string;
  /** Refresh token endpoint URL (optional, HTTPS required) */
  readonly refreshUrl?: string;
  /** Requested scopes */
  readonly scopes?: readonly string[];
}

// ---------------------------------------------------------------------------
// Wire types (RFC 8628 field names)
// ---------------------------------------------------------------------------

/**
 * Device authorization request parameters (RFC 8628 Section 3.1).
 *
 * Wire field names per the RFC.
 */
export interface DeviceCodeRequest {
  /** Client identifier */
  readonly client_id: string;
  /** Space-delimited scopes (wire format) */
  readonly scope?: string;
}

/**
 * Device authorization response from the authorization server (RFC 8628 Section 3.2).
 *
 * All field names match the RFC 8628 JSON wire format.
 */
export interface DeviceCodeResponse {
  /** Device verification code */
  readonly device_code: string;
  /** End-user verification code (short, displayed to user) */
  readonly user_code: string;
  /** End-user verification URI */
  readonly verification_uri: string;
  /** Optional complete verification URI with user_code pre-filled */
  readonly verification_uri_complete?: string;
  /** Lifetime of device_code and user_code in seconds */
  readonly expires_in: number;
  /** Minimum polling interval in seconds (default 5 per RFC 8628 Section 3.2) */
  readonly interval?: number;
}

/**
 * Token endpoint error codes during Device Code polling (RFC 8628 Section 3.5).
 *
 * These are the raw wire values returned in the `error` field of the
 * token endpoint error response during device authorization polling.
 */
export type DeviceCodePollingError =
  | 'authorization_pending'
  | 'slow_down'
  | 'access_denied'
  | 'expired_token';

/**
 * Token endpoint error response during Device Code polling.
 *
 * Wire shape per RFC 8628 Section 3.5 + OAuth 2.0 error response format.
 */
export interface DeviceCodeErrorResponse {
  /** RFC 8628 polling error code */
  readonly error: DeviceCodePollingError;
  /** Human-readable error description */
  readonly error_description?: string;
}

/**
 * Successful token response from Device Code flow completion.
 *
 * Same shape as standard OAuth 2.0 token response (RFC 6749 Section 5.1).
 */
export interface DeviceCodeTokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in?: number;
  readonly refresh_token?: string;
  readonly scope?: string;
}
