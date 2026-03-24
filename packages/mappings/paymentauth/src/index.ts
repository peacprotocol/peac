/**
 * @peac/mappings-paymentauth
 *
 * HTTP Payment authentication scheme (paymentauth/MPP) mapping for PEAC.
 * Envelope-first parsing with raw + normalized types.
 * Method-specific payloads treated as `unknown`.
 * No network I/O.
 */

// Constants
export {
  PAYMENTAUTH_SCHEME,
  WWW_AUTHENTICATE,
  AUTHORIZATION,
  PAYMENT_RECEIPT_HEADER,
  MAX_HEADER_BYTES,
  MAX_DECODED_PAYLOAD_BYTES,
  MAX_JSON_NESTING_DEPTH,
  MAX_AUTH_PARAMS,
  PAYMENTAUTH_RAIL,
  JSONRPC_PAYMENT_REQUIRED,
  JSONRPC_VERIFICATION_FAILED,
  MCP_META_CREDENTIAL,
  MCP_META_RECEIPT,
} from './constants.js';

// Types
export type {
  RawPaymentauthChallenge,
  RawPaymentauthCredential,
  RawPaymentauthReceipt,
  NormalizedPaymentauthChallenge,
  NormalizedPaymentauthCredential,
  NormalizedPaymentauthReceipt,
  PaymentauthServiceInfo,
  PaymentauthPaymentInfo,
} from './types.js';

// Errors
export { PaymentauthError } from './errors.js';
export type { PaymentauthErrorCode } from './errors.js';

// Parsing and normalization
export {
  redactPaymentauthHeader,
  parsePaymentauthChallenges,
  parsePaymentauthCredential,
  parsePaymentauthReceipt,
  normalizeChallenge,
  normalizeCredential,
  normalizeReceipt,
} from './parse.js';

// Discovery
export { extractServiceInfo, extractPaymentInfo } from './discovery.js';

// JSON-RPC transport helpers
export {
  isPaymentRequiredError,
  isVerificationFailedError,
  parsePaymentauthFromJsonRpcError,
  parsePaymentauthFromJsonRpcResult,
} from './jsonrpc.js';

// MCP-specific helpers
export type { PaymentauthMcpCapability } from './mcp.js';
export {
  extractCredentialFromMcpMeta,
  extractReceiptFromMcpMeta,
  extractPaymentauthCapability,
} from './mcp.js';

// Evidence mapping
export { fromPaymentauthReceipt, toCommerceExtensionFields } from './map.js';

// Evidence Carrier Contract
export type {
  PaymentauthHeaderMap,
  PaymentauthResponseLike,
  PaymentauthExtractResult,
  PaymentauthExtractAsyncResult,
} from './carrier.js';

export {
  PAYMENTAUTH_CARRIER_LIMITS,
  attachCarrierToPaymentauthHeaders,
  extractCarrierFromPaymentauthHeaders,
  extractCarrierFromPaymentauthHeadersAsync,
  PaymentauthCarrierAdapter,
} from './carrier.js';
