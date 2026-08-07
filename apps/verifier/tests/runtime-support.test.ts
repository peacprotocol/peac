/**
 * Runtime-capability probe.
 *
 * PEAC Ed25519 verification requires WebCrypto Ed25519. The verifier must detect an unsupported
 * runtime up front and report it as a CAPABILITY state -- never as an invalid record, and never as
 * an input failure -- and it must process no user data in that state.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  ed25519WebCryptoSupported,
  resetRuntimeProbeForTests,
} from '../src/lib/runtime-support.js';
import { initializeLocalVerifier } from '../src/verify.js';

afterEach(() => {
  vi.restoreAllMocks();
  resetRuntimeProbeForTests();
});

describe('ed25519WebCryptoSupported', () => {
  it('verifies the committed RFC 8032 vector on a supporting runtime', async () => {
    expect(await ed25519WebCryptoSupported()).toBe(true);
  });

  it('probes with a non-empty message', async () => {
    // A PEAC signing input is never empty, and at least one WebCrypto implementation rejects
    // Ed25519 verification of zero-length messages while verifying non-empty messages correctly.
    const spy = vi.spyOn(globalThis.crypto.subtle, 'verify');
    resetRuntimeProbeForTests();
    await ed25519WebCryptoSupported();
    expect(spy).toHaveBeenCalled();
    const message = spy.mock.calls[0][3] as ArrayBufferView;
    expect(message.byteLength).toBeGreaterThan(0);
  });

  it('is memoized: the probe runs once even under concurrent initialization', async () => {
    resetRuntimeProbeForTests();
    const spy = vi.spyOn(globalThis.crypto.subtle, 'verify');
    await Promise.all([
      ed25519WebCryptoSupported(),
      ed25519WebCryptoSupported(),
      ed25519WebCryptoSupported(),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('returns false rather than throwing when the algorithm is unavailable', async () => {
    resetRuntimeProbeForTests();
    vi.spyOn(globalThis.crypto.subtle, 'importKey').mockRejectedValue(
      new Error('NotSupportedError')
    );
    expect(await ed25519WebCryptoSupported()).toBe(false);
  });
});

describe('unsupported runtime', () => {
  it('is a capability state that processes no user input and produces no report', async () => {
    resetRuntimeProbeForTests();
    vi.spyOn(globalThis.crypto.subtle, 'importKey').mockRejectedValue(
      new Error('NotSupportedError')
    );
    const verifier = await initializeLocalVerifier({ verifierBuild: 'test-build' });
    expect(verifier.supported).toBe(false);

    // Deliberately invalid inputs: none of them may be parsed in this state.
    const r = await verifier.verify({
      record: '   not a record   ',
      keyDocument: '{',
      evaluationTimeUnixSeconds: Number.NaN,
    });
    expect('capability' in r && r.capability).toBe('ed25519_unsupported');
    expect('failureStage' in r).toBe(false);
    expect(r.report).toBeUndefined();
  });
});
