/**
 * MCP _meta reserved key guard.
 *
 * Per MCP specification (2025-11-25), the reserved prefix rule is:
 * "Any prefix where the second label is `modelcontextprotocol` or `mcp`
 * is reserved."
 *
 * The prefix is the segment before the first `/`, split by `.` into labels.
 * Only the second label (labels[1], 0-indexed) determines reservation.
 *
 * Examples:
 *   "dev.mcp/anything"                  -> RESERVED (2nd label = mcp)
 *   "io.modelcontextprotocol/data"      -> RESERVED (2nd label = modelcontextprotocol)
 *   "com.mcp.tools/data"               -> RESERVED (2nd label = mcp)
 *   "tools.mcp.com/data"               -> RESERVED (2nd label = mcp)
 *   "mcp.dev/anything"                 -> NOT reserved (2nd label = dev)
 *   "modelcontextprotocol.io/data"     -> NOT reserved (2nd label = io)
 *   "com.example.mcp/data"             -> NOT reserved (2nd label = example)
 *   "org.peacprotocol/receipt_ref"     -> NOT reserved (2nd label = peacprotocol)
 */

const MCP_RESERVED_SECOND_LABELS = ['modelcontextprotocol', 'mcp'];

/**
 * Assert that a _meta key does not use an MCP-reserved prefix.
 *
 * A prefix is reserved when its second label (labels[1], 0-indexed)
 * equals "mcp" or "modelcontextprotocol" (case-insensitive).
 *
 * @throws Error if the key uses a reserved prefix
 */
export function assertNotMcpReservedKey(key: string): void {
  const slashIndex = key.indexOf('/');
  if (slashIndex === -1) return; // No prefix = not reserved

  const prefix = key.substring(0, slashIndex);
  const labels = prefix.split('.');

  if (labels.length < 2) return; // Single label = no second label = not reserved

  if (MCP_RESERVED_SECOND_LABELS.includes(labels[1].toLowerCase())) {
    throw new Error(
      `Reserved MCP _meta key prefix: ${key} (second label "${labels[1]}" is reserved per MCP spec)`
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
