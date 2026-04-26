/**
 * Shadow scheduler portability + post-return contract tests.
 *
 * These tests pin three properties that govern when the shadow path
 * is allowed to run relative to the public-call boundary:
 *
 *   1. Environment guard: `isShadowEnabled` must not throw if the
 *      ambient `process` global is unavailable (browser / edge
 *      runtime). It returns false in that case.
 *
 *   2. Macrotask deferral: `scheduleShadow` must NOT execute its
 *      shadow function on the same microtask queue as the caller's
 *      promise continuations. The shadow function must not have
 *      started by the time the caller's awaited continuation runs.
 *
 *   3. Cooperative timeout: a never-resolving shadow function whose
 *      AbortSignal is also ignored must still be reported as a
 *      `timing-diff` divergence within the 250ms reporting bound.
 *      The runner stops awaiting; the shadow function may continue
 *      to completion off the runner's await chain (JavaScript cannot
 *      preempt pure-CPU work).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  _drainShadowQueueForTests,
  _peekShadowLog,
  _resetShadowLog,
  isShadowEnabled,
  scheduleShadow,
} from '../../src/_internal/shadow';

const REAL_PROCESS = globalThis.process;

describe('isShadowEnabled: environment guard', () => {
  afterEach(() => {
    // Always restore process so other tests see the real Node global.
    Object.defineProperty(globalThis, 'process', {
      configurable: true,
      writable: true,
      value: REAL_PROCESS,
    });
  });

  it('returns true when programmatic flag is set, regardless of env', () => {
    expect(isShadowEnabled({ _internal: { shadowCore: true } })).toBe(true);
  });

  it('returns false when neither flag nor env is set', () => {
    const prior = process.env.PEAC_INTERNAL_SHADOW_CORE;
    delete process.env.PEAC_INTERNAL_SHADOW_CORE;
    try {
      expect(isShadowEnabled()).toBe(false);
      expect(isShadowEnabled({})).toBe(false);
      expect(isShadowEnabled({ _internal: {} })).toBe(false);
      expect(isShadowEnabled({ _internal: { shadowCore: false } })).toBe(false);
    } finally {
      if (prior !== undefined) process.env.PEAC_INTERNAL_SHADOW_CORE = prior;
    }
  });

  it('returns true when env var is set to 1', () => {
    const prior = process.env.PEAC_INTERNAL_SHADOW_CORE;
    process.env.PEAC_INTERNAL_SHADOW_CORE = '1';
    try {
      expect(isShadowEnabled()).toBe(true);
    } finally {
      if (prior === undefined) {
        delete process.env.PEAC_INTERNAL_SHADOW_CORE;
      } else {
        process.env.PEAC_INTERNAL_SHADOW_CORE = prior;
      }
    }
  });

  it('does not throw when process is undefined (browser / edge)', () => {
    Object.defineProperty(globalThis, 'process', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    expect(() => isShadowEnabled()).not.toThrow();
    expect(isShadowEnabled()).toBe(false);
  });

  it('does not throw when process.env is undefined', () => {
    Object.defineProperty(globalThis, 'process', {
      configurable: true,
      writable: true,
      value: { env: undefined },
    });
    expect(() => isShadowEnabled()).not.toThrow();
    expect(isShadowEnabled()).toBe(false);
  });
});

describe('scheduleShadow: macrotask deferral', () => {
  beforeEach(() => {
    _resetShadowLog();
  });

  it('does not run synchronously on the calling stack', () => {
    let started = false;
    scheduleShadow({
      call: 'verifyLocal',
      realResult: { value: 1 },
      realError: undefined,
      shadowFn: async () => {
        started = true;
        return { value: 1 };
      },
      recordRef: 'sync-check',
    });
    expect(started).toBe(false);
  });

  it("does not run before the caller's awaited microtask continuation", async () => {
    const events: string[] = [];

    // Simulate a public async call that schedules shadow before
    // returning, then has its caller await the result.
    async function publicCall(): Promise<string> {
      const real = 'real-result';
      scheduleShadow({
        call: 'verifyLocal',
        realResult: real,
        realError: undefined,
        shadowFn: async () => {
          events.push('shadow');
          return real;
        },
        recordRef: 'micro-vs-macro',
      });
      return real;
    }

    const result = await publicCall();
    events.push('after-await');

    // After awaiting the caller's promise, the shadow has not yet
    // started: macrotask scheduling pushes shadow strictly after all
    // microtask continuations attached to the public call.
    expect(result).toBe('real-result');
    expect(events).toEqual(['after-await']);

    // Drain so the shadow eventually runs, then confirm.
    await _drainShadowQueueForTests();
    expect(events).toEqual(['after-await', 'shadow']);
  });
});

describe('scheduleShadow: cooperative timeout', () => {
  beforeEach(() => {
    _resetShadowLog();
  });

  it('records a timing-diff divergence when the shadow function ignores AbortSignal and never resolves', async () => {
    scheduleShadow({
      call: 'verifyLocal',
      realResult: { value: 1 },
      realError: undefined,
      shadowFn: () =>
        new Promise<{ value: number }>(() => {
          // Intentional: never resolves and never observes the signal.
          // Models a pure-CPU validator that JavaScript cannot preempt.
        }),
      recordRef: 'never-resolves',
    });

    await _drainShadowQueueForTests();

    const log = _peekShadowLog();
    expect(log).toHaveLength(1);
    expect(log[0].kind).toBe('timing-diff');
    expect(log[0].shadowErrorCode).toBe('SHADOW_TIMEOUT');
    expect(log[0].notes).toMatch(/SHADOW_TIMEOUT/);
  }, 5_000);

  it('records no divergence when shadow function returns same canonical hash as real', async () => {
    scheduleShadow({
      call: 'verifyLocal',
      realResult: { accepted: true, codes: [] },
      realError: undefined,
      shadowFn: async () => ({ accepted: true, codes: [] }),
      recordRef: 'agree',
    });

    await _drainShadowQueueForTests();
    expect(_peekShadowLog()).toHaveLength(0);
  });

  it('records output-byte-diff divergence when canonical hashes differ', async () => {
    scheduleShadow({
      call: 'verifyLocal',
      realResult: { accepted: true, codes: ['X'] },
      realError: undefined,
      shadowFn: async () => ({ accepted: false, codes: ['Y'] }),
      recordRef: 'disagree',
    });

    await _drainShadowQueueForTests();
    const log = _peekShadowLog();
    expect(log).toHaveLength(1);
    expect(log[0].kind).toBe('output-byte-diff');
    expect(log[0].realResultHash).toMatch(/^[0-9a-f]{64}$/);
    expect(log[0].shadowResultHash).toMatch(/^[0-9a-f]{64}$/);
    expect(log[0].realResultHash).not.toBe(log[0].shadowResultHash);
  });

  it('shadow path failure never produces an unhandled-rejection event', async () => {
    const unhandled: unknown[] = [];
    const handler = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', handler);
    try {
      scheduleShadow({
        call: 'verifyLocal',
        realResult: { value: 1 },
        realError: undefined,
        shadowFn: async () => {
          throw new Error('SHADOW_TEST_THROW');
        },
        recordRef: 'shadow-throws',
      });
      await _drainShadowQueueForTests();
      // Give one extra tick so any deferred unhandled-rejection event has time to fire.
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      expect(unhandled).toHaveLength(0);
      const log = _peekShadowLog();
      expect(log).toHaveLength(1);
      expect(log[0].kind).toBe('shadow-error');
      expect(log[0].shadowErrorCode).toBe('SHADOW_TEST_THROW');
    } finally {
      process.removeListener('unhandledRejection', handler);
    }
  });
});
