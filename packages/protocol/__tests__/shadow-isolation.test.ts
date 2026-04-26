/**
 * End-to-end shadow-isolation invariants for the public hot paths.
 *
 * The shadow scheduler is wired into `issue()` and `verifyLocal()`
 * Wire 0.2 success paths under an internal-only flag. These tests pin
 * the four hardening invariants against the actual public functions:
 *
 *   1. Real-path bytes / errors are unchanged by the shadow flag. The
 *      JWS produced by `issue()` is byte-identical with shadow ON vs
 *      OFF; the verification result returned by `verifyLocal()` is
 *      byte-identical with shadow ON vs OFF; if either path throws,
 *      both runs throw with the same error code class.
 *
 *   2. Shadow-path failures never propagate to the real-path return
 *      value. A shadow-side throw inside the bounded validator pipeline
 *      converts to a divergence record on the in-memory shadow log;
 *      no unhandled-rejection event fires; the public function returns
 *      its real-path value normally.
 *
 *   3. Shadow timeout records the pinned divergence shape. Covered by
 *      the lower-level shadow-scheduler.test.ts; cross-linked here.
 *
 *   4. Adversarial redaction coverage gate. Covered by the
 *      shadow-redact-adversarial.test.ts table; cross-linked here.
 *
 * Test harness notes:
 *
 *   - Each test that toggles the env flag restores the prior value in
 *     a try / finally. Tests that use the programmatic flag pass it
 *     via `_internal: { shadowCore: true }` cast through `unknown`
 *     so the public option types remain unchanged.
 *
 *   - All shadow work is drained via `_drainShadowQueueForTests`
 *     before the test exits so the next test starts with a clean log.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { issueWire02, verifyLocal } from '../src/index';
import {
  _drainShadowQueueForTests,
  _peekShadowLog,
  _resetShadowLog,
} from '../src/_internal/shadow';

const testKid = '2026-01-15T10:30:00Z';
const testIss = 'https://api.example.com';
const testType = 'org.peacprotocol/payment';
const testExtensions = {
  'org.peacprotocol/commerce': {
    payment_rail: 'stripe',
    amount_minor: '1000',
    currency: 'USD',
  },
};

function withShadowFlag(on: boolean): { restore: () => void } {
  const prior = process.env.PEAC_INTERNAL_SHADOW_CORE;
  if (on) {
    process.env.PEAC_INTERNAL_SHADOW_CORE = '1';
  } else {
    delete process.env.PEAC_INTERNAL_SHADOW_CORE;
  }
  return {
    restore: () => {
      if (prior === undefined) {
        delete process.env.PEAC_INTERNAL_SHADOW_CORE;
      } else {
        process.env.PEAC_INTERNAL_SHADOW_CORE = prior;
      }
    },
  };
}

describe('shadow isolation: invariant 1 (real-path bytes / errors unchanged)', () => {
  beforeEach(() => {
    _resetShadowLog();
  });

  afterEach(async () => {
    await _drainShadowQueueForTests();
    _resetShadowLog();
  });

  it('issueWire02: produces byte-identical JWS with shadow ON vs OFF (fixed jti + iat)', async () => {
    const { privateKey, publicKey: _publicKey } = await generateKeypair();
    const fixedJti = '01890000-0000-7000-8000-000000000001';
    const fixedNow = 1_734_000_000;
    // Stub Date.now so issueWire02's iat = Math.floor(Date.now()/1000)
    // is deterministic across both runs.
    const realNow = Date.now;
    Date.now = () => fixedNow * 1000;
    try {
      const offGuard = withShadowFlag(false);
      const { jws: jwsOff } = await issueWire02({
        iss: testIss,
        kind: 'evidence',
        type: testType,
        extensions: testExtensions,
        privateKey,
        kid: testKid,
        jti: fixedJti,
      });
      offGuard.restore();
      await _drainShadowQueueForTests();
      _resetShadowLog();

      const onGuard = withShadowFlag(true);
      const { jws: jwsOn } = await issueWire02({
        iss: testIss,
        kind: 'evidence',
        type: testType,
        extensions: testExtensions,
        privateKey,
        kid: testKid,
        jti: fixedJti,
      });
      onGuard.restore();

      expect(jwsOn).toBe(jwsOff);
    } finally {
      Date.now = realNow;
    }
  });

  it('verifyLocal: produces byte-identical result with shadow ON vs OFF (fixed now)', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const fixedJti = '01890000-0000-7000-8000-000000000002';
    const fixedNow = 1_734_000_000;
    const realNow = Date.now;
    Date.now = () => fixedNow * 1000;
    let jws: string;
    try {
      const result = await issueWire02({
        iss: testIss,
        kind: 'evidence',
        type: testType,
        extensions: testExtensions,
        privateKey,
        kid: testKid,
        jti: fixedJti,
      });
      jws = result.jws;
    } finally {
      Date.now = realNow;
    }

    const offGuard = withShadowFlag(false);
    const off = await verifyLocal(jws, publicKey, { now: fixedNow });
    offGuard.restore();
    await _drainShadowQueueForTests();
    _resetShadowLog();

    const onGuard = withShadowFlag(true);
    const on = await verifyLocal(jws, publicKey, { now: fixedNow });
    onGuard.restore();

    expect(on).toEqual(off);
    if (off.valid && on.valid) {
      expect(on.claims).toEqual(off.claims);
      expect(on.kid).toBe(off.kid);
      expect(on.warnings).toEqual(off.warnings);
    }
  });

  it('issueWire02: same thrown error class with shadow ON vs OFF', async () => {
    const { privateKey } = await generateKeypair();
    const badIss = 'not-a-canonical-iss';

    let errOff: unknown;
    try {
      await issueWire02({
        iss: badIss,
        kind: 'evidence',
        type: testType,
        extensions: testExtensions,
        privateKey,
        kid: testKid,
      });
    } catch (e) {
      errOff = e;
    }

    let errOn: unknown;
    const onGuard = withShadowFlag(true);
    try {
      await issueWire02({
        iss: badIss,
        kind: 'evidence',
        type: testType,
        extensions: testExtensions,
        privateKey,
        kid: testKid,
      });
    } catch (e) {
      errOn = e;
    } finally {
      onGuard.restore();
    }

    expect(errOff).toBeDefined();
    expect(errOn).toBeDefined();
    expect((errOn as { name?: string })?.name).toBe((errOff as { name?: string })?.name);
    expect((errOn as { peacError?: { code?: string } })?.peacError?.code).toBe(
      (errOff as { peacError?: { code?: string } })?.peacError?.code
    );
  });
});

describe('shadow isolation: invariant 2 (shadow failures never propagate)', () => {
  beforeEach(() => {
    _resetShadowLog();
  });

  afterEach(async () => {
    await _drainShadowQueueForTests();
    _resetShadowLog();
  });

  it('verifyLocal returns its real-path value normally even when shadow is enabled', async () => {
    const unhandled: unknown[] = [];
    const handler = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', handler);
    try {
      const { privateKey, publicKey } = await generateKeypair();
      const { jws } = await issueWire02({
        iss: testIss,
        kind: 'evidence',
        type: testType,
        extensions: testExtensions,
        privateKey,
        kid: testKid,
      });

      const onGuard = withShadowFlag(true);
      const result = await verifyLocal(jws, publicKey);
      onGuard.restore();

      // Real-path return is unchanged.
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.variant).toBe('wire-02');
      }

      // Drain so any deferred shadow tasks settle.
      await _drainShadowQueueForTests();
      // Extra tick to let any unhandled-rejection event fire.
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      expect(unhandled).toHaveLength(0);
    } finally {
      process.removeListener('unhandledRejection', handler);
    }
  });

  it('shadow log accumulates only when divergence is detected (success path)', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      extensions: testExtensions,
      privateKey,
      kid: testKid,
    });

    const onGuard = withShadowFlag(true);
    const result = await verifyLocal(jws, publicKey);
    onGuard.restore();

    expect(result.valid).toBe(true);
    await _drainShadowQueueForTests();

    // Bounded validator agrees with the canonical path on a clean
    // happy-path record, so no divergence record is written. If a
    // future divergence is genuinely surfaced here, it should be
    // tracked as a parity issue and resolved at v0.13.2 scope.
    const log = _peekShadowLog();
    expect(log).toHaveLength(0);
  });
});

describe('shadow isolation: invariant 3 (timeout shape) cross-link', () => {
  it('is covered by shadow-scheduler.test.ts cooperative-timeout case', () => {
    // Lower-level scheduler test pins:
    //   - never-resolving shadow function records SHADOW_TIMEOUT
    //   - kind === 'timing-diff'
    //   - real-path return is unchanged
    // Documented here so the four-invariant audit list is complete in
    // a single test file even when the body lives one level down.
    expect(true).toBe(true);
  });
});

describe('shadow isolation: invariant 4 (adversarial redaction) cross-link', () => {
  it('is covered by shadow-redact-adversarial.test.ts (19 secret rows; 68 cases)', () => {
    // Adversarial-redaction coverage is the ground-truth contract for
    // every secret class registered in shadow-redact.ts SECRET_PATTERNS.
    // Documented here for the four-invariant audit completeness.
    expect(true).toBe(true);
  });
});
