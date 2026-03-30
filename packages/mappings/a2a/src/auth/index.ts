/**
 * A2A v1.0 authentication surface.
 *
 * OAuth 2.0 PKCE (S256), Device Code types, auth evidence mapping,
 * and google.rpc.Status error modeling.
 */

// PKCE (RFC 7636)
export { generatePKCEChallenge, computeS256Challenge, validatePKCEVerifier } from './pkce.js';
export type { PKCEChallenge } from './pkce.js';

// OAuth 2.0 authorization code flow
export { buildAuthorizationRequest, exchangeAuthorizationCode } from './oauth.js';
export type { A2AOAuthConfig, AuthorizationRequest, TokenResponse, FetchFn } from './oauth.js';

// Device Code types (RFC 8628, types only, raw wire names)
export type {
  A2ADeviceCodeFlowConfig,
  DeviceCodeRequest,
  DeviceCodeResponse,
  DeviceCodePollingError,
  DeviceCodeErrorResponse,
  DeviceCodeTokenResponse,
} from './device-code.js';

// Auth evidence mapping
export { fromA2AAuthEvent } from './evidence.js';
export type { A2AAuthMethod, A2AAuthEvent, A2AAuthEvidenceResult } from './evidence.js';

// Error modeling (google.rpc.Status + ErrorInfo)
export { GrpcStatusCode, createA2AAuthStatus } from './errors.js';
export type { GrpcStatusCodeValue, GrpcErrorInfo, GrpcStatus, A2AAuthErrorCode } from './errors.js';
