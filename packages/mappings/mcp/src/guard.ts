/**
 * MCP _meta reserved key guard.
 *
 * Per MCP specification (2025-11-25), the reserved prefix rule is:
 * "Any prefix consisting of zero or more labels, followed by
 * `modelcontextprotocol` or `mcp`, followed by any label, is reserved."
 *
 * The reserved label (`mcp` or `modelcontextprotocol`) must appear as a
 * non-last label in the dot-separated prefix. If it appears only as the
 * last label, the prefix is NOT reserved.
 *
 * Examples:
 *   "mcp.dev/anything"                  -> RESERVED (mcp at index 0, not last)
 *   "tools.mcp.com/data"               -> RESERVED (mcp at index 1, not last)
 *   "api.modelcontextprotocol.org/x"   -> RESERVED (modelcontextprotocol at index 1, not last)
 *   "dev.mcp/anything"                 -> NOT reserved (mcp is last label)
 *   "io.modelcontextprotocol/data"     -> NOT reserved (modelcontextprotocol is last label)
 *   "com.example.mcp/data"             -> NOT reserved (mcp is last label)
 *   "org.peacprotocol/receipt_ref"     -> NOT reserved (no reserved labels at all)
 */

const MCP_RESERVED_LABELS = ['modelcontextprotocol', 'mcp'];

/**
 * Assert that a _meta key does not use an MCP-reserved prefix.
 *
 * A prefix is reserved if any label except the last equals "mcp" or
 * "modelcontextprotocol" (case-insensitive).
 *
 * @throws Error if the key uses a reserved prefix
 */
export function assertNotMcpReservedKey(key: string): void {
  const slashIndex = key.indexOf('/');
  if (slashIndex === -1) return; // No prefix = not reserved

  const prefix = key.substring(0, slashIndex);
  const labels = prefix.split('.');

  if (labels.length < 2) return; // Single label = not reserved (no label follows)

  // Check all labels EXCEPT the last one
  for (let i = 0; i < labels.length - 1; i++) {
    if (MCP_RESERVED_LABELS.includes(labels[i].toLowerCase())) {
      throw new Error(
        `Reserved MCP _meta key prefix: ${key} (label "${labels[i]}" is reserved per MCP spec)`
      );
    }
  }
}

/**
 * Check if a _meta key uses an MCP-reserved prefix (non-throwing).
 */
export function isMcpReservedKey(key: string): boolean {
  try {
    assertNotMcpReservedKey(key);
    return false;
  } catch {
    return true;
  }
}
