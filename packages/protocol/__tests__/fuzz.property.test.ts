/**
 * Property-based fuzz tests for verifyLocal.
 *
 * Property: for every arbitrary input string, `verifyLocal` either
 * returns a structured rejection (`{ valid: false, code: /^E_.../ }`)
 * or throws a structured CryptoError-like object whose `code` matches
 * the same grammar. The function MUST NOT throw an unstructured
 * exception that escapes the public-call boundary, MUST NOT return
 * an undefined / non-result-shaped value, and MUST NOT accept an
 * arbitrary string that is not a valid signed JWS for the given key.
 *
 * Generators:
 *
 *   - Arbitrary strings of length 0-4096 (default fast-check defaults
 *     for ASCII / Unicode).
 *   - JWS-shaped strings with three dot-separated segments where each
 *     segment is base64url-ish; almost certainly not a valid signed
 *     JWS for the test key, but exercises the parse / decode path
 *     deeper than random bytes alone.
 *
 * Run count: 200 runs per property (per the v0.13.1 plan §8.6 floor).
 * fast-check's default seed is the wall clock; failing inputs print
 * with a reproducible seed for re-runs.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { generateKeypair } from '@peac/crypto';
import { verifyLocal } from '../src/index';

const ERROR_CODE_GRAMMAR = /^E_[A-Z0-9_]+$/;

let publicKey: Uint8Array;

beforeAll(async () => {
  ({ publicKey } = await generateKeypair());
});

function isStructuredVerifyResult(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const v = value as { valid?: unknown };
  return typeof v.valid === 'boolean';
}

async function runOnce(input: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  let result: unknown;
  let thrown: unknown;
  try {
    result = await verifyLocal(input, publicKey);
  } catch (err) {
    thrown = err;
  }

  if (thrown !== undefined) {
    const obj = thrown as { code?: unknown; name?: unknown };
    if (typeof obj.code !== 'string') {
      return { ok: false, reason: `unstructured throw without code: ${String(obj.name)}` };
    }
    if (!ERROR_CODE_GRAMMAR.test(obj.code)) {
      return { ok: false, reason: `thrown code does not match E_* grammar: ${obj.code}` };
    }
    return { ok: true };
  }

  if (!isStructuredVerifyResult(result)) {
    return { ok: false, reason: 'returned non-result-shaped value' };
  }
  const r = result as { valid: boolean; code?: unknown };
  if (r.valid) {
    return { ok: false, reason: 'arbitrary string accepted as valid receipt' };
  }
  if (typeof r.code !== 'string') {
    return { ok: false, reason: 'rejection without string code' };
  }
  if (!ERROR_CODE_GRAMMAR.test(r.code)) {
    return { ok: false, reason: `rejection code does not match E_* grammar: ${r.code}` };
  }
  return { ok: true };
}

describe('verifyLocal: property fuzz', () => {
  it('arbitrary unicode strings reject cleanly or return a structured error', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 0, maxLength: 4096 }), async (input) => {
        const r = await runOnce(input);
        if (!r.ok) {
          throw new Error(
            `verifyLocal property violation: ${r.reason} (input length ${input.length})`
          );
        }
      }),
      { numRuns: 200 }
    );
  });

  it('JWS-shaped inputs reject cleanly or return a structured error', async () => {
    const segment = fc.stringMatching(/^[A-Za-z0-9_-]{1,128}$/);
    const jwsLike = fc.tuple(segment, segment, segment).map((parts) => parts.join('.'));
    await fc.assert(
      fc.asyncProperty(jwsLike, async (input) => {
        const r = await runOnce(input);
        if (!r.ok) {
          throw new Error(`verifyLocal jws-shape property violation: ${r.reason}`);
        }
      }),
      { numRuns: 200 }
    );
  });
});
