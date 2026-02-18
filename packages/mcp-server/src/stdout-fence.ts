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

// 4 MB max line length -- prevents memory exhaustion from a single unbounded JSON-RPC message
const MAX_LINE_BYTES = 4 * 1024 * 1024;

export function installStdoutFence(): () => void {
  const originalWrite = process.stdout.write.bind(process.stdout);
  let buffer = '';

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

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('jsonrpc' in parsed) ||
      (parsed as Record<string, unknown>).jsonrpc !== '2.0'
    ) {
      throw new McpServerError(
        'E_MCP_STDOUT_FENCE_VIOLATION',
        `Stdout fence: non-JSON-RPC 2.0 object on stdout: ${line.slice(0, 100)}`
      );
    }
  }

  function processBuffer(): void {
    const lines = buffer.split('\n');
    // Keep the last segment (incomplete line or empty string after trailing newline)
    buffer = lines.pop()!;

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

    buffer += str;
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
    process.stdout.write = originalWrite;
  };
}
