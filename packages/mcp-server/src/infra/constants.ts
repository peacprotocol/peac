/**
 * MCP Server constants -- zero imports
 */

export const SERVER_NAME = 'peac-mcp-server';
export const SERVER_VERSION = '0.11.2';
export const MCP_PROTOCOL_VERSION = '2025-11-25';
export const DEFAULT_MAX_JWS_BYTES = 16_384; // 16 KB
export const DEFAULT_MAX_RESPONSE_BYTES = 65_536; // 64 KB
export const DEFAULT_TOOL_TIMEOUT_MS = 30_000; // 30 s
export const DEFAULT_MAX_CLAIMS_BYTES = 262_144; // 256 KB
export const DEFAULT_MAX_BUNDLE_RECEIPTS = 256;
export const DEFAULT_MAX_BUNDLE_BYTES = 16_777_216; // 16 MB
export const DEFAULT_MAX_TTL_SECONDS = 86_400; // 24 hours

// HTTP transport defaults (DD-119, DD-123)
export const DEFAULT_HTTP_PORT = 3000;
export const DEFAULT_HTTP_HOST = '127.0.0.1'; // localhost only; 0.0.0.0 requires explicit opt-in
export const DEFAULT_MAX_REQUEST_BYTES = 1_048_576; // 1 MB
export const DEFAULT_RATE_LIMIT_RPM = 100;
export const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000; // 30 min
export const DEFAULT_MAX_SESSIONS = 100;
