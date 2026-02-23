/**
 * MCP _meta reserved key guard.
 *
 * Per MCP specification (2025-11-25), any prefix where the **second label**
 * (dot-separated, 0-indexed) is "modelcontextprotocol" or "mcp" is reserved.
 *
 * Examples:
 *   "io.modelcontextprotocol/data"  -> RESERVED (2nd label = "modelcontextprotocol")
 *   "dev.mcp/anything"              -> RESERVED (2nd label = "mcp")
 *   "com.example.mcp/data"          -> NOT reserved (2nd label = "example")
 *   "org.peacprotocol/receipt_ref"  -> NOT reserved (2nd label = "peacprotocol")
 */

const MCP_RESERVED_SECOND_LABELS = ['modelcontextprotocol', 'mcp'];

/**
 * Assert that a _meta key does not use an MCP-reserved prefix.
 *
 * @throws Error if the key's prefix has a reserved second label
 */
export function assertNotMcpReservedKey(key: string): void {
  const slashIndex = key.indexOf('/');
  if (slashIndex === -1) return; // No prefix = not reserved

  const prefix = key.substring(0, slashIndex);
  const labels = prefix.split('.');

  if (
    labels.length >= 2 &&
    MCP_RESERVED_SECOND_LABELS.includes(labels[1].toLowerCase())
  ) {
    throw new Error(
      `Reserved MCP _meta key prefix: ${key} (second label "${labels[1]}" is reserved)`
    );
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
