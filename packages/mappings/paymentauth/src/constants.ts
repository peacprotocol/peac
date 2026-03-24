/**
 * Constants for paymentauth/MPP mapping.
 *
 * The normative HTTP authentication scheme name is "Payment".
 * "paymentauth" is the PEAC registry identifier.
 * "MPP" is ecosystem branding and not used as a protocol identifier.
 */

/** HTTP authentication scheme name (normative per draft-ryan-httpauth-payment) */
export const PAYMENTAUTH_SCHEME = 'Payment' as const;

/** WWW-Authenticate header name */
export const WWW_AUTHENTICATE = 'WWW-Authenticate' as const;

/** Authorization header name */
export const AUTHORIZATION = 'Authorization' as const;

/** Payment-Receipt response header name */
export const PAYMENT_RECEIPT_HEADER = 'Payment-Receipt' as const;

// ---------------------------------------------------------------------------
// Parser Limits (security hardening)
// ---------------------------------------------------------------------------

/** Maximum header byte length (8 KB per paymentauth size considerations, Section 9.4) */
export const MAX_HEADER_BYTES = 8_192;

/** Maximum decoded payload byte length */
export const MAX_DECODED_PAYLOAD_BYTES = 65_536;

/** Maximum JSON nesting depth for decoded payloads */
export const MAX_JSON_NESTING_DEPTH = 10;

/** Maximum auth-param count per challenge */
export const MAX_AUTH_PARAMS = 32;

/** PEAC payment rail identifier for paymentauth */
export const PAYMENTAUTH_RAIL = 'paymentauth' as const;

// ---------------------------------------------------------------------------
// JSON-RPC Error Codes (draft-payment-transport-mcp-00)
// ---------------------------------------------------------------------------

/** JSON-RPC error code: Payment Required */
export const JSONRPC_PAYMENT_REQUIRED = -32042;

/** JSON-RPC error code: Verification Failed */
export const JSONRPC_VERIFICATION_FAILED = -32043;

// ---------------------------------------------------------------------------
// MCP _meta Keys (draft-payment-transport-mcp-00)
// ---------------------------------------------------------------------------

/** MCP _meta key for paymentauth credential */
export const MCP_META_CREDENTIAL = 'org.paymentauth/credential' as const;

/** MCP _meta key for paymentauth receipt */
export const MCP_META_RECEIPT = 'org.paymentauth/receipt' as const;
