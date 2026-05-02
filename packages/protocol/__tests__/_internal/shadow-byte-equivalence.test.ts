/**
 * Shadow byte-equivalence.
 *
 * Asserts that `issue()` produces byte-identical compact JWS output
 * across `PEAC_INTERNAL_SHADOW_CORE=0` and `PEAC_INTERNAL_SHADOW_CORE=1`
 * when every input is deterministic. Determinism requires:
 *
 *   - fixed Ed25519 keypair (seeded)
 *   - fixed `kid`
 *   - explicit `jti` (not generated)
 *   - explicit `occurred_at`
 *   - locked `Date.now()` via `vi.useFakeTimers` so the `iat` claim is
 *     identical across both invocations
 *
 * With those held, `issue()` produces the exact same JWS bytes both
 * times. The shadow scheduler runs the bounded validator on a
 * macrotask boundary AFTER the public call returns its real-path
 * value, so the caller's observable JWS bytes do not depend on
 * shadow flag state.
 *
 * `verifyLocal()` is also asserted byte-equivalent on a fixed JWS
 * across both shadow flag values.
 *
 * Drains the shadow queue between flag toggles via
 * `_drainShadowQueueForTests` so no orphan tasks bleed across runs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeypairFromSeed } from '@peac/crypto/testkit';
import { issue, verifyLocal } from '../../src/index.js';
import { _drainShadowQueueForTests } from '../../src/_internal/shadow.js';

const FIXED_SEED = new Uint8Array([
  0xa1, 0xc4, 0x3f, 0x09, 0x77, 0x2e, 0xb6, 0x80, 0x55, 0x12, 0xee, 0x47, 0x3d, 0x9b, 0x60, 0x18,
  0x73, 0x21, 0xf5, 0x4c, 0xab, 0xc2, 0x9e, 0x06, 0x44, 0x37, 0x55, 0x8a, 0x6f, 0xd0, 0x12, 0xe7,
]);
const FIXED_KID = 'shadow-byte-eq-test-key-1';
const FIXED_JTI = '019b0000-0000-7000-8000-00000000ab12';
const FIXED_OCCURRED_AT = '2026-05-02T00:00:00Z';
const FIXED_ISS = 'https://issuer.example';
const FIXED_TYPE = 'org.example/shadow-byte-eq-test';
/** Locked wall-clock value: 2026-05-02T00:00:00Z. */
const FIXED_NOW_MS = Date.UTC(2026, 4, 2, 0, 0, 0);

const STABLE_OPTIONS = {
  iss: FIXED_ISS,
  kind: 'evidence' as const,
  type: FIXED_TYPE,
  kid: FIXED_KID,
  jti: FIXED_JTI,
  occurred_at: FIXED_OCCURRED_AT,
  pillars: ['safety'] as const,
};

async function withShadowEnvAsync<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const prior = process.env.PEAC_INTERNAL_SHADOW_CORE;
  if (value === undefined) delete process.env.PEAC_INTERNAL_SHADOW_CORE;
  else process.env.PEAC_INTERNAL_SHADOW_CORE = value;
  try {
    return await fn();
  } finally {
    if (prior === undefined) delete process.env.PEAC_INTERNAL_SHADOW_CORE;
    else process.env.PEAC_INTERNAL_SHADOW_CORE = prior;
  }
}

describe('shadow byte-equivalence: issue() and verifyLocal() are stable across shadow flag values', () => {
  beforeEach(() => {
    // Lock Date.now() so the `iat` claim inside issue() is identical
    // across both invocations. A targeted `Date.now` spy is preferred
    // to `vi.useFakeTimers()` because the shadow scheduler uses
    // `setTimeout` to defer the bounded validator to a macrotask
    // boundary; faking the timer queue blocks `_drainShadowQueueForTests`.
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW_MS);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await _drainShadowQueueForTests();
  });

  it('issue(): JWS bytes are identical with PEAC_INTERNAL_SHADOW_CORE=0 vs =1', async () => {
    const { privateKey } = await generateKeypairFromSeed(FIXED_SEED);

    const issuedShadowOff = await withShadowEnvAsync('0', async () =>
      issue({ ...STABLE_OPTIONS, pillars: [...STABLE_OPTIONS.pillars], privateKey })
    );
    await _drainShadowQueueForTests();

    const issuedShadowOn = await withShadowEnvAsync('1', async () =>
      issue({ ...STABLE_OPTIONS, pillars: [...STABLE_OPTIONS.pillars], privateKey })
    );
    await _drainShadowQueueForTests();

    expect(issuedShadowOn.jws).toBe(issuedShadowOff.jws);
  });

  it('verifyLocal(): result-shape byte-equal across shadow flag values for a fixed JWS', async () => {
    const { privateKey, publicKey } = await generateKeypairFromSeed(FIXED_SEED);
    const issued = await issue({
      ...STABLE_OPTIONS,
      pillars: [...STABLE_OPTIONS.pillars],
      privateKey,
    });
    await _drainShadowQueueForTests();
    const fixedJws = issued.jws;

    const verifiedShadowOff = await withShadowEnvAsync('0', async () =>
      verifyLocal(fixedJws, publicKey)
    );
    await _drainShadowQueueForTests();
    const verifiedShadowOn = await withShadowEnvAsync('1', async () =>
      verifyLocal(fixedJws, publicKey)
    );
    await _drainShadowQueueForTests();

    expect(JSON.stringify(verifiedShadowOff)).toBe(JSON.stringify(verifiedShadowOn));
  });
});
