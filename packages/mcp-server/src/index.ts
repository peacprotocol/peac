/**
 * @peac/mcp-server -- public API
 *
 * Library consumers can use handlers directly without the MCP server binding.
 *
 * Zod schema objects are intentionally NOT exported from the public API to avoid
 * multi-Zod-version type incompatibilities. Consumers should use the exported
 * TypeScript types (VerifyInput, InspectInput, DecodeInput, etc.) instead.
 * The server.ts module uses the Zod schemas internally for MCP SDK registration.
 */

// Server
export { createPeacMcpServer } from './server.js';
export type { ServerOptions } from './server.js';

// Handlers
export { handleVerify } from './handlers/verify.js';
export { handleInspect } from './handlers/inspect.js';
export { handleDecode } from './handlers/decode.js';
export {
  checkJwsSize,
  checkToolEnabled,
  checkInputSizes,
  checkObjectDepth,
  measureEnvelopeBytes,
  truncateResponse,
} from './handlers/guards.js';
export type { TruncationResult } from './handlers/guards.js';
export type { HandlerParams, HandlerResult, ServerContext, ToolHandler } from './handlers/types.js';

// Schema types (Zod objects kept internal -- see module doc)
export type { VerifyInput, VerifyOutput } from './schemas/verify.js';
export type { InspectInput, InspectOutput } from './schemas/inspect.js';
export type { DecodeInput, DecodeOutput } from './schemas/decode.js';

// Infrastructure
export { getDefaultPolicy, loadPolicy, computePolicyHash } from './infra/policy.js';
export type { PolicyConfig } from './infra/policy.js';
export { loadIssuerKey } from './infra/key-loader.js';
export type { LoadedKey } from './infra/key-loader.js';
export { loadJwksFile, resolveKeyByKid } from './infra/jwks-loader.js';
export type { JwksKeyEntry } from './infra/jwks-loader.js';
export {
  SERVER_NAME,
  SERVER_VERSION,
  MCP_PROTOCOL_VERSION,
  DEFAULT_MAX_JWS_BYTES,
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_TOOL_TIMEOUT_MS,
} from './infra/constants.js';
export {
  McpServerError,
  KeyLoadError,
  PolicyLoadError,
  JwksLoadError,
  sanitizeOutput,
} from './infra/errors.js';
export type { McpServerErrorCode } from './infra/errors.js';
export { installStdoutFence } from './stdout-fence.js';
