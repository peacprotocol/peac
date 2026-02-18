/**
 * Stdout fence (DD-58: line-buffered JSON-RPC validator)
 *
 * Monkey-patches process.stdout.write at startup.
 * Buffers bytes, splits on newline, validates each complete line
 * as JSON-RPC 2.0. Invalid lines cause a fail-fast throw.
 *
 * Returns a teardown function that restores the original write.
 */

import { McpServerError } from './infra/errors.js';

type WriteCallback = (err?: Error | null) => void;

// 4 MB max line/buffer length -- prevents memory exhaustion from
// unbounded writes without newlines or a single huge JSON-RPC message
const MAX_LINE_BYTES = 4 * 1024 * 1024;

export function installStdoutFence(): () => void {
  const originalWrite = process.stdout.write.bind(process.stdout);
  let buffer = '';
  let bufferBytes = 0;

  function validateJsonRpcLine(line: string): void {
    // Guard: reject lines that exceed the byte budget before attempting JSON.parse
    const lineBytes = new TextEncoder().encode(line).length;
    if (lineBytes > MAX_LINE_BYTES) {
      throw new McpServerError(
        'E_MCP_STDOUT_FENCE_VIOLATION',
        `Stdout fence: line is ${lineBytes} bytes, exceeding limit of ${MAX_LINE_BYTES}`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new McpServerError(
        'E_MCP_STDOUT_FENCE_VIOLATION',
        `Stdout fence: non-JSON line detected: ${line.slice(0, 100)}`
      );
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new McpServerError(
        'E_MCP_STDOUT_FENCE_VIOLATION',
        `Stdout fence: non-JSON-RPC 2.0 object on stdout: ${line.slice(0, 100)}`
      );
    }

    const obj = parsed as Record<string, unknown>;

    if (obj.jsonrpc !== '2.0') {
      throw new McpServerError(
        'E_MCP_STDOUT_FENCE_VIOLATION',
        `Stdout fence: non-JSON-RPC 2.0 object on stdout: ${line.slice(0, 100)}`
      );
    }

    // Require valid JSON-RPC 2.0 response shape: id + (result or error),
    // or a notification (method without id). Reject anything else.
    const hasId = 'id' in obj;
    const hasResult = 'result' in obj;
    const hasError = 'error' in obj;
    const hasMethod = 'method' in obj;

    if (hasId && (hasResult || hasError)) {
      // Valid response
      return;
    }
    if (hasMethod && !hasId) {
      // Valid notification (server -> client, e.g. notifications/*)
      return;
    }

    throw new McpServerError(
      'E_MCP_STDOUT_FENCE_VIOLATION',
      `Stdout fence: malformed JSON-RPC 2.0 message (expected response or notification): ${line.slice(0, 100)}`
    );
  }

  function processBuffer(): void {
    const lines = buffer.split('\n');
    // Keep the last segment (incomplete line or empty string after trailing newline)
    buffer = lines.pop()!;
    bufferBytes = new TextEncoder().encode(buffer).length;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue; // skip blank lines
      validateJsonRpcLine(trimmed);
    }
  }

  const patchedWrite = function (
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | WriteCallback,
    callback?: WriteCallback
  ): boolean {
    // Normalize arguments
    let encoding: BufferEncoding | undefined;
    let cb: WriteCallback | undefined;

    if (typeof encodingOrCallback === 'function') {
      cb = encodingOrCallback;
    } else {
      encoding = encodingOrCallback;
      cb = callback;
    }

    // Convert chunk to string
    const str = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);

    // Cap buffer growth before appending -- prevents memory exhaustion from
    // writes that never include a newline (e.g. broken serializer)
    const chunkBytes = new TextEncoder().encode(str).length;
    if (bufferBytes + chunkBytes > MAX_LINE_BYTES) {
      throw new McpServerError(
        'E_MCP_STDOUT_FENCE_VIOLATION',
        `Stdout fence: buffer exceeded ${MAX_LINE_BYTES} bytes without a newline`
      );
    }

    buffer += str;
    bufferBytes += chunkBytes;
    processBuffer();

    // Forward to original write
    if (encoding) {
      return originalWrite(chunk, encoding, cb);
    }
    return originalWrite(chunk, cb as WriteCallback);
  };

  process.stdout.write = patchedWrite as typeof process.stdout.write;

  // Teardown: flush remaining buffer, restore original
  return function teardown(): void {
    // Validate any remaining buffered content
    if (buffer.trim().length > 0) {
      validateJsonRpcLine(buffer.trim());
    }
    buffer = '';
    bufferBytes = 0;
    process.stdout.write = originalWrite;
  };
}
