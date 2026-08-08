/**
 * Higher-level issuance error surface for non-I-JSON input.
 *
 * The crypto signing boundary enforces I-JSON on the exact bytes it signs. This confirms that a
 * non-I-JSON value passed through the public `issueWire02()` API surfaces the stable structured
 * crypto error unchanged, rather than a generic exception, and that issuance fails rather than
 * emitting a record the verifier would reject. Non-ASCII inputs use explicit escapes.
 */
import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { issueWire02 } from '../src/index';

const NONCHAR_FDD0 = '\uFDD0';

describe('issueWire02 rejects non-I-JSON input at issuance', () => {
  it('surfaces the stable crypto I-JSON error for a payload noncharacter', async () => {
    const { privateKey } = await generateKeypair();
    const options = {
      iss: 'https://api.example.com',
      kind: 'evidence' as const,
      type: 'org.peacprotocol/payment',
      occurred_at: '2026-04-01T00:00:00Z',
      purpose_declared: 'test',
      pillars: ['safety'],
      privateKey,
      kid: 'key-1',
      jti: `x${NONCHAR_FDD0}`,
    };
    await expect(issueWire02(options)).rejects.toMatchObject({
      name: 'CryptoError',
      code: 'CRYPTO_IJSON_INVALID_STRING',
    });
  });
});
