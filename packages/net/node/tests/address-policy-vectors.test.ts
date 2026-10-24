/**
 * Shared key-fetch address policy vectors (also used by @peac/protocol).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPrivateIP } from '../src/impl';

interface Vector {
  ip: string;
  note: string;
}

const vectors = JSON.parse(
  readFileSync(join(__dirname, '../../../../tests/fixtures/address-policy/vectors.json'), 'utf8')
) as { blocked: Vector[]; allowed: Vector[] };

describe('isPrivateIP address policy vectors', () => {
  it.each(vectors.blocked)('blocks $ip ($note)', ({ ip }) => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  it.each(vectors.allowed)('allows $ip ($note)', ({ ip }) => {
    expect(isPrivateIP(ip)).toBe(false);
  });
});
