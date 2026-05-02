/**
 * Runtime activation: the bounded validation gate is exercised by the
 * default branch and bypassed by the rollback branch.
 *
 * Asserts:
 *   A1   `runBoundedValidationGate` IS called from `issue()` and
 *        `verifyLocal()` when the rollback flag is unset (default
 *        branch).
 *   A2   `runBoundedValidationGate` is NOT called from `issue()` and
 *        `verifyLocal()` when the rollback flag is set (rollback
 *        branch).
 *
 * Out of scope: a global "`parseReceiptClaims` is never called on the
 * default branch" assertion. The bounded `schema-parse` layer
 * correctly delegates to canonical `parseReceiptClaims` from inside
 * the gate, so a global non-call assertion would fail by design.
 *
 * The byte-equivalence assertions in `legacy-path-flag.test.ts` (T8 /
 * T9 / T10 / T11) provide end-to-end public-surface coverage; this
 * file is the call-site activation evidence.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateKeypairFromSeed } from '@peac/crypto/testkit';

vi.mock('../../src/_internal/record-core/validation-gate.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/_internal/record-core/validation-gate.js')>();
  return {
    ...actual,
    runBoundedValidationGate: vi.fn(actual.runBoundedValidationGate),
  };
});

import { runBoundedValidationGate } from '../../src/_internal/record-core/validation-gate.js';
import { issue, verifyLocal } from '../../src/index.js';

const FIXED_SEED = new Uint8Array([
  0x55, 0x4c, 0xa3, 0x18, 0xb6, 0x1d, 0x09, 0x42, 0x8e, 0x7b, 0x21, 0x4f, 0x6c, 0xa2, 0x35, 0x77,
  0x91, 0x40, 0xe3, 0x5b, 0xc8, 0x06, 0x12, 0x99, 0x4d, 0x37, 0x88, 0xa1, 0x6f, 0x2b, 0xc4, 0x0e,
]);
const FIXED_KID = 'bounded-default-runtime-test-key-1';
const FIXED_JTI = '019b0000-0000-7000-8000-000000000008';
const FIXED_OCCURRED_AT = '2026-05-01T00:00:00Z';
const FIXED_ISS = 'https://issuer.example';
const FIXED_TYPE = 'org.example/bounded-default-runtime';

const STABLE_OPTIONS = {
  iss: FIXED_ISS,
  kind: 'evidence' as const,
  type: FIXED_TYPE,
  kid: FIXED_KID,
  jti: FIXED_JTI,
  occurred_at: FIXED_OCCURRED_AT,
  pillars: ['safety'] as const,
};

const gateMock = vi.mocked(runBoundedValidationGate);

afterEach(() => {
  gateMock.mockClear();
});

describe('A1: runBoundedValidationGate IS called on the default branch', () => {
  it('issue(): default branch invokes the gate with surface "issueWire02"', async () => {
    const { privateKey } = await generateKeypairFromSeed(FIXED_SEED);
    delete process.env.PEAC_INTERNAL_LEGACY_PATH;
    await issue({
      ...STABLE_OPTIONS,
      pillars: [...STABLE_OPTIONS.pillars],
      privateKey,
    });
    expect(gateMock).toHaveBeenCalled();
    const surfaces = gateMock.mock.calls.map((call) => call[0].surface);
    expect(surfaces).toContain('issueWire02');
  });

  it('verifyLocal(): default branch invokes the gate with surface "verifyLocal"', async () => {
    const { privateKey, publicKey } = await generateKeypairFromSeed(FIXED_SEED);
    delete process.env.PEAC_INTERNAL_LEGACY_PATH;
    const issued = await issue({
      ...STABLE_OPTIONS,
      pillars: [...STABLE_OPTIONS.pillars],
      privateKey,
    });
    gateMock.mockClear();
    await verifyLocal(issued.jws, publicKey);
    expect(gateMock).toHaveBeenCalled();
    const surfaces = gateMock.mock.calls.map((call) => call[0].surface);
    expect(surfaces).toContain('verifyLocal');
  });
});

describe('A2: runBoundedValidationGate is NOT called on the rollback branch', () => {
  it('issue(): rollback branch (env=1) does not invoke the gate', async () => {
    const { privateKey } = await generateKeypairFromSeed(FIXED_SEED);
    process.env.PEAC_INTERNAL_LEGACY_PATH = '1';
    try {
      await issue({
        ...STABLE_OPTIONS,
        pillars: [...STABLE_OPTIONS.pillars],
        privateKey,
      });
    } finally {
      delete process.env.PEAC_INTERNAL_LEGACY_PATH;
    }
    expect(gateMock).not.toHaveBeenCalled();
  });

  it('verifyLocal(): rollback branch (env=1) does not invoke the gate', async () => {
    const { privateKey, publicKey } = await generateKeypairFromSeed(FIXED_SEED);
    // Issue with default flag state, then verify under rollback.
    delete process.env.PEAC_INTERNAL_LEGACY_PATH;
    const issued = await issue({
      ...STABLE_OPTIONS,
      pillars: [...STABLE_OPTIONS.pillars],
      privateKey,
    });
    gateMock.mockClear();
    process.env.PEAC_INTERNAL_LEGACY_PATH = '1';
    try {
      await verifyLocal(issued.jws, publicKey);
    } finally {
      delete process.env.PEAC_INTERNAL_LEGACY_PATH;
    }
    expect(gateMock).not.toHaveBeenCalled();
  });

  it('issue(): rollback branch (programmatic option) does not invoke the gate', async () => {
    const { privateKey } = await generateKeypairFromSeed(FIXED_SEED);
    delete process.env.PEAC_INTERNAL_LEGACY_PATH;
    await issue({
      ...STABLE_OPTIONS,
      pillars: [...STABLE_OPTIONS.pillars],
      privateKey,
      ...({ _internal: { legacyPath: true } } as object),
    } as Parameters<typeof issue>[0]);
    expect(gateMock).not.toHaveBeenCalled();
  });

  it('verifyLocal(): rollback branch (programmatic option) does not invoke the gate', async () => {
    const { privateKey, publicKey } = await generateKeypairFromSeed(FIXED_SEED);
    delete process.env.PEAC_INTERNAL_LEGACY_PATH;
    const issued = await issue({
      ...STABLE_OPTIONS,
      pillars: [...STABLE_OPTIONS.pillars],
      privateKey,
    });
    gateMock.mockClear();
    await verifyLocal(issued.jws, publicKey, {
      ...({ _internal: { legacyPath: true } } as object),
    } as Parameters<typeof verifyLocal>[2]);
    expect(gateMock).not.toHaveBeenCalled();
  });
});
