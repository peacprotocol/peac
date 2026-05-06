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

describe('captureCommand: shell:false treats metacharacters as argv data', () => {
  it('passes shell metacharacters in argv verbatim without shell expansion', async () => {
    // Under shell:false, tokens like `;`, `|`, `$VAR` MUST reach the
    // child as plain argv bytes. The child here echoes its argv
    // length so we can prove the token was not split or expanded.
    const metacharToken = '; echo PWNED | cat $HOME `id`';
    const result = await captureCommand({
      program: NODE,
      args: [
        '-e',
        'process.stdout.write(String(process.argv.length) + ":" + process.argv.slice(-1)[0])',
        metacharToken,
      ],
      cwd: process.cwd(),
      env: process.env,
      stdinMode: 'none',
      rawCaptureEnabled: true,
      stdoutSampleBytes: 16384,
      stderrSampleBytes: 16384,
      timeoutMs: 5000,
      killGraceMs: 1000,
    });
    expect(result.exitCode).toBe(0);
    const decoded = Buffer.from(result.stdout.sample_base64!, 'base64').toString('utf8');
    // The child must observe the literal metachar token as its last
    // argv element; a shell expansion would have split it on `;` or
    // `|`, dereferenced `$HOME`, or executed `id`. Under `node -e
    // <script>`, the token is argv[1] (argv[0] is the node binary
    // path), so argv.length is 2 and the trailing element is the
    // verbatim metachar token.
    expect(decoded.endsWith(`:${metacharToken}`)).toBe(true);
    expect(decoded.startsWith('2:')).toBe(true);
  }, 15_000);
});

describe('captureCommand: stream capture invariants', () => {
  it('default mode hashes and counts stdout/stderr without a sample', async () => {
    const result = await captureCommand({
      program: NODE,
      args: ['-e', 'process.stdout.write("hello"); process.stderr.write("warn");'],
      cwd: process.cwd(),
      env: process.env,
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
      env: process.env,
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
      env: process.env,
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
      env: process.env,
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
      env: process.env,
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

describe('captureCommand: stdin pump non-invasive abort', () => {
  it('does not strip caller-owned data listeners from parent stdin on child close', async () => {
    // Build a never-ending Readable that periodically emits chunks.
    // Attach a caller-owned data listener BEFORE captureCommand sees
    // the stream. After the child closes and the pump aborts, that
    // listener must still be attached.
    const neverEnding = new Readable({
      read() {
        setTimeout(() => {
          if (!this.destroyed) this.push(Buffer.from('x'));
        }, 20);
      },
    });
    let callerListenerCalls = 0;
    const callerListener = () => {
      callerListenerCalls += 1;
    };
    neverEnding.on('data', callerListener);

    const before = neverEnding.listenerCount('data');
    const result = await captureCommand({
      program: NODE,
      args: ['-e', 'process.exit(0)'],
      cwd: process.cwd(),
      env: process.env,
      stdinMode: 'hashed',
      rawCaptureEnabled: false,
      stdoutSampleBytes: 16384,
      stderrSampleBytes: 16384,
      timeoutMs: 5000,
      killGraceMs: 1000,
      parentStdin: neverEnding,
    });
    expect(result.exitCode).toBe(0);

    // The caller-owned `data` listener must still be attached after
    // the pump aborts. The pump may NOT call removeAllListeners on a
    // stream it does not own.
    const after = neverEnding.listenerCount('data');
    expect(after).toBeGreaterThanOrEqual(before);
    expect(neverEnding.listeners('data')).toContain(callerListener);

    neverEnding.destroy();
    // Avoid unused-binding warning for the caller listener counter;
    // its existence proves the listener was wired up.
    expect(callerListenerCalls).toBeGreaterThanOrEqual(0);
  }, 15_000);
});

describe('captureCommand: timeout cascade', () => {
  it('terminates a long-running child and emits the record with timed_out=true', async () => {
    const result = await captureCommand({
      program: NODE,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      env: process.env,
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
