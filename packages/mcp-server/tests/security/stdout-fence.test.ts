import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installStdoutFence } from '../../src/stdout-fence.js';

describe('security/stdout-fence', () => {
  let teardown: (() => void) | undefined;

  // Intercept real stdout.write with a sink before each test.
  // The fence captures this sink as its "originalWrite", so validated
  // lines forward to the sink -- never to the real terminal.
  // This prevents JSON-RPC lines and test content from polluting
  // vitest output, which itself must stay clean (stdout = JSON-RPC
  // in production, test output must not contradict that).
  let realWrite: typeof process.stdout.write;
  let captured: string[];

  beforeEach(() => {
    realWrite = process.stdout.write;
    captured = [];
    process.stdout.write = ((chunk: string | Uint8Array) => {
      captured.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    if (teardown) {
      try {
        teardown();
      } catch {
        // teardown may fail if buffer has invalid content
      }
      teardown = undefined;
    }
    // Always restore the real stdout.write -- fence teardown may have
    // restored to our sink, not the real write
    process.stdout.write = realWrite;
  });

  it('passes valid JSON-RPC 2.0 messages through', () => {
    teardown = installStdoutFence();
    const msg = JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }) + '\n';

    // This should not throw
    expect(() => process.stdout.write(msg)).not.toThrow();
  });

  it('passes chunked JSON-RPC messages (multi-write single line)', () => {
    teardown = installStdoutFence();
    const msg = JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} });

    // Write in chunks without newline -- should buffer
    expect(() => process.stdout.write(msg.slice(0, 10))).not.toThrow();
    // Complete the line with newline -- should validate
    expect(() => process.stdout.write(msg.slice(10) + '\n')).not.toThrow();
  });

  it('passes multiple messages in one write', () => {
    teardown = installStdoutFence();
    const msg1 = JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} });
    const msg2 = JSON.stringify({ jsonrpc: '2.0', id: 2, result: {} });
    const combined = msg1 + '\n' + msg2 + '\n';

    expect(() => process.stdout.write(combined)).not.toThrow();
  });

  it('throws on non-JSON content', () => {
    teardown = installStdoutFence();
    expect(() => process.stdout.write('hello world\n')).toThrow(/stdout fence/i);
  });

  it('throws on non-JSON-RPC JSON', () => {
    teardown = installStdoutFence();
    expect(() => process.stdout.write('{"foo":"bar"}\n')).toThrow(/stdout fence/i);
  });

  it('skips blank lines', () => {
    teardown = installStdoutFence();
    const msg = JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} });
    expect(() => process.stdout.write(msg + '\n\n')).not.toThrow();
  });

  it('restores original write on teardown', () => {
    teardown = installStdoutFence();
    // During fence, non-JSON-RPC throws
    expect(() => process.stdout.write('test\n')).toThrow();

    teardown();
    teardown = undefined;

    // After teardown, non-JSON-RPC passes through (fence removed)
    expect(() => process.stdout.write('')).not.toThrow();
  });

  it('throws on lines exceeding max byte limit', () => {
    teardown = installStdoutFence();
    // Create a valid JSON-RPC message that exceeds 4 MB
    const huge = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: { data: 'x'.repeat(5 * 1024 * 1024) },
    });
    expect(() => process.stdout.write(huge + '\n')).toThrow(/stdout fence/i);
  });

  it('validates remaining buffer on teardown', () => {
    teardown = installStdoutFence();
    // Write incomplete non-JSON content (no newline)
    process.stdout.write('invalid stuff');

    expect(() => {
      teardown!();
      teardown = undefined;
    }).toThrow(/stdout fence/i);
  });
});
