/**
 * Higher-level issuance error surface for non-I-JSON input.
 *
 * The crypto signing boundary enforces I-JSON (RFC 7493) and the kid rule on the exact bytes it
 * signs. A claim value or kid that passes schema validation but is not admissible at that boundary
 * must not be emitted. This test fixes the public error contract for that case: `issueWire02()`
 * rejects with the protocol's structured `IssueError`, carrying the same machine-readable code the
 * verifier reports for the identical raw bytes, and retains the underlying `CryptoError` as the
 * cause. It is deliberately not a raw crypto error: every other issuance failure (non-canonical iss,
 * schema violation) already surfaces as `IssueError`, and this keeps the public API consistent.
 * Non-ASCII inputs use explicit escapes so their code points do not depend on file encoding.
 */
import { describe, it, expect } from 'vitest';
import { generateKeypair, CryptoError } from '@peac/crypto';
import { issueWire02, IssueError } from '../src/index';

const NONCHAR_FDD0 = '\uFDD0';
const LONE_SURROGATE = '\uD800';

const baseOptions = {
  iss: 'https://api.example.com',
  kind: 'evidence' as const,
  type: 'org.peacprotocol/payment',
  occurred_at: '2026-04-01T00:00:00Z',
  purpose_declared: 'test',
  pillars: ['safety'],
  kid: 'key-1',
};

describe('issueWire02 rejects non-I-JSON input through the structured IssueError surface', () => {
  it('maps a payload noncharacter to IssueError E_IJSON_INVALID_STRING with the crypto cause', async () => {
    const { privateKey } = await generateKeypair();
    let thrown: unknown;
    try {
      await issueWire02({ ...baseOptions, privateKey, jti: `x${NONCHAR_FDD0}` });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(IssueError);
    expect((thrown as IssueError).peacError.code).toBe('E_IJSON_INVALID_STRING');
    // The exact crypto classification is preserved as the cause, not widened into the public code.
    expect((thrown as { cause?: unknown }).cause).toBeInstanceOf(CryptoError);
    expect(((thrown as { cause?: CryptoError }).cause as CryptoError).code).toBe(
      'CRYPTO_IJSON_INVALID_STRING'
    );
  });

  it('maps an ill-formed kid to IssueError E_JWS_MISSING_KID with the crypto cause', async () => {
    const { privateKey } = await generateKeypair();
    let thrown: unknown;
    try {
      await issueWire02({ ...baseOptions, privateKey, kid: `k${LONE_SURROGATE}` });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(IssueError);
    expect((thrown as IssueError).peacError.code).toBe('E_JWS_MISSING_KID');
    expect((thrown as { cause?: unknown }).cause).toBeInstanceOf(CryptoError);
    expect(((thrown as { cause?: CryptoError }).cause as CryptoError).code).toBe(
      'CRYPTO_JWS_MISSING_KID'
    );
  });
});
