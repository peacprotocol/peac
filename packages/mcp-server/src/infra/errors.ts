/**
 * MCP Server error hierarchy -- zero external imports
 *
 * Error codes use the E_MCP_* taxonomy for MCP-server-specific errors.
 * Protocol errors (E_INVALID_SIGNATURE, etc.) are passed through as nested detail.
 */

export type McpServerErrorCode =
  | 'E_MCP_KEY_LOAD'
  | 'E_MCP_POLICY_LOAD'
  | 'E_MCP_JWKS_LOAD'
  | 'E_MCP_INPUT_TOO_LARGE'
  | 'E_MCP_OUTPUT_TOO_LARGE'
  | 'E_MCP_TOOL_DISABLED'
  | 'E_MCP_TOOL_TIMEOUT'
  | 'E_MCP_KEY_RESOLUTION'
  | 'E_MCP_KID_REQUIRED'
  | 'E_MCP_JWKS_NO_MATCH'
  | 'E_MCP_INVALID_INPUT'
  | 'E_MCP_HANDLER_ERROR'
  | 'E_MCP_STDOUT_FENCE_VIOLATION';

export class McpServerError extends Error {
  readonly code: McpServerErrorCode;

  constructor(code: McpServerErrorCode, message: string) {
    super(message);
    this.name = 'McpServerError';
    this.code = code;
  }
}

export class KeyLoadError extends McpServerError {
  constructor(message: string) {
    super('E_MCP_KEY_LOAD', message);
    this.name = 'KeyLoadError';
  }
}

export class PolicyLoadError extends McpServerError {
  constructor(message: string) {
    super('E_MCP_POLICY_LOAD', message);
    this.name = 'PolicyLoadError';
  }
}

export class JwksLoadError extends McpServerError {
  constructor(message: string) {
    super('E_MCP_JWKS_LOAD', message);
    this.name = 'JwksLoadError';
  }
}

/**
 * Strip key-like material from output strings (Trust Gate 1 helper).
 *
 * Replaces matches of each pattern with `[REDACTED]`.
 */
export function sanitizeOutput(text: string, sensitivePatterns: RegExp[]): string {
  let result = text;
  for (const pattern of sensitivePatterns) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}
