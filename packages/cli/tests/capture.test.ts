/**
 * captureCommand + exitCodeForSignal tests.
 *
 * Covers the streaming-capture invariants and the no-hang property:
 *   - default mode hashes and counts stdout/stderr without retaining
 *     a sample buffer
 *   - raw mode emits a bounded sample only when explicitly enabled
 *   - exitCodeForSignal maps SIGINT=130, SIGTERM=143, SIGKILL=137
 *   - the wrapper resolves when the child exits even if parent stdin
 *     never ends (TTY-like never-ending pipe)
 */

import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { captureCommand, exitCodeForSignal } from '../src/lib/capture';

const NODE = process.execPath;

describe('exitCodeForSignal: POSIX signal mapping', () => {
  it('maps SIGINT to 130', () => {
    expect(exitCodeForSignal('SIGINT')).toBe(130);
  });
  it('maps SIGTERM to 143', () => {
    expect(exitCodeForSignal('SIGTERM')).toBe(143);
  });
  it('maps SIGKILL to 137', () => {
    expect(exitCodeForSignal('SIGKILL')).toBe(137);
  });
  it('falls back to 128 for unknown signals', () => {
    expect(exitCodeForSignal('SIGNOTREAL')).toBe(128);
  });
  it('falls back to 128 for null', () => {
    expect(exitCodeForSignal(null)).toBe(128);
  });
});

describe('captureCommand: stream capture invariants', () => {
  it('default mode hashes and counts stdout/stderr without a sample', async () => {
    const result = await captureCommand({
      program: NODE,
      args: ['-e', 'process.stdout.write("hello"); process.stderr.write("warn");'],
      cwd: process.cwd(),
      stdinMode: 'none',
      rawCaptureEnabled: false,
      stdoutSampleBytes: 16384,
      stderrSampleBytes: 16384,
      timeoutMs: 5000,
      killGraceMs: 1000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBe(5);
    expect(result.stdout.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.stdout.sample_base64).toBeUndefined();
    expect(result.stderr.length).toBe(4);
    expect(result.stderr.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.stderr.sample_base64).toBeUndefined();
  }, 15_000);

  it('raw mode emits a bounded sample when rawCaptureEnabled=true', async () => {
    const result = await captureCommand({
      program: NODE,
      args: ['-e', 'process.stdout.write("hello world raw mode")'],
      cwd: process.cwd(),
      stdinMode: 'none',
      rawCaptureEnabled: true,
      stdoutSampleBytes: 16384,
      stderrSampleBytes: 16384,
      timeoutMs: 5000,
      killGraceMs: 1000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.sample_base64).toBeDefined();
    const decoded = Buffer.from(result.stdout.sample_base64!, 'base64').toString('utf8');
    expect(decoded).toBe('hello world raw mode');
  }, 15_000);

  it('truncates the sample buffer at the cap and sets truncated=true', async () => {
    const result = await captureCommand({
      program: NODE,
      args: ['-e', 'process.stdout.write("A".repeat(200))'],
      cwd: process.cwd(),
      stdinMode: 'none',
      rawCaptureEnabled: true,
      stdoutSampleBytes: 50,
      stderrSampleBytes: 16384,
      timeoutMs: 5000,
      killGraceMs: 1000,
    });
    expect(result.stdout.length).toBe(200);
    expect(result.stdout.truncated).toBe(true);
    expect(result.stdout.sample_base64).toBeDefined();
    const decoded = Buffer.from(result.stdout.sample_base64!, 'base64');
    expect(decoded.length).toBe(50);
  }, 15_000);
});

describe('captureCommand: stdin pump no-hang property', () => {
  it('resolves when child exits even if parent stdin never ends (hashed mode)', async () => {
    // Build a never-ending Readable that periodically emits chunks but
    // never calls push(null). The child exits immediately. The wrapper
    // must abort the stdin pump on child close and resolve.
    const neverEnding = new Readable({
      read() {
        // Drip a small chunk, then schedule another. Never ends.
        setTimeout(() => {
          if (!this.destroyed) this.push(Buffer.from('x'));
        }, 20);
      },
    });

    const start = Date.now();
    const result = await captureCommand({
      program: NODE,
      args: ['-e', 'process.exit(0)'],
      cwd: process.cwd(),
      stdinMode: 'hashed',
      rawCaptureEnabled: false,
      stdoutSampleBytes: 16384,
      stderrSampleBytes: 16384,
      timeoutMs: 5000,
      killGraceMs: 1000,
      parentStdin: neverEnding,
    });
    const elapsed = Date.now() - start;
    // Confirm the wrapper did NOT wait for the never-ending stream.
    // 5000ms is the timeout; we should resolve well under that.
    expect(elapsed).toBeLessThan(3_000);
    expect(result.exitCode).toBe(0);
    expect(result.stdin.mode).toBe('hashed');
    // Cleanup the never-ending stream.
    neverEnding.destroy();
  }, 15_000);

  it('mode=none does not read parent stdin and returns mode-only stdin_ref', async () => {
    const neverEnding = new Readable({
      read() {
        setTimeout(() => {
          if (!this.destroyed) this.push(Buffer.from('x'));
        }, 20);
      },
    });
    const result = await captureCommand({
      program: NODE,
      args: ['-e', 'process.exit(0)'],
      cwd: process.cwd(),
      stdinMode: 'none',
      rawCaptureEnabled: false,
      stdoutSampleBytes: 16384,
      stderrSampleBytes: 16384,
      timeoutMs: 5000,
      killGraceMs: 1000,
      parentStdin: neverEnding,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdin.mode).toBe('none');
    expect(result.stdin.length).toBeUndefined();
    expect(result.stdin.sha256).toBeUndefined();
    neverEnding.destroy();
  }, 15_000);
});

describe('captureCommand: timeout cascade', () => {
  it('terminates a long-running child and emits the record with timed_out=true', async () => {
    const result = await captureCommand({
      program: NODE,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      stdinMode: 'none',
      rawCaptureEnabled: false,
      stdoutSampleBytes: 16384,
      stderrSampleBytes: 16384,
      timeoutMs: 200,
      killGraceMs: 200,
    });
    expect(result.timedOut).toBe(true);
    expect(['SIGTERM', 'SIGKILL']).toContain(result.terminationSignal);
    // exitCode is either the synthetic 143/137 (signal mapping) or
    // a normal code if the child raced ahead.
    expect(typeof result.exitCode).toBe('number');
  }, 15_000);
});
