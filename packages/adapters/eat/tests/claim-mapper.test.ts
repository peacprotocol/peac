/**
 * EAT Claim Mapper tests
 *
 * Tests privacy-first claim mapping from EAT to Wire 0.2 receipt claims.
 */

import { describe, it, expect } from 'vitest';
import { sha256Hex } from '@peac/crypto';
import { mapEatClaims } from '../src/claim-mapper.js';
import { EAT_CLAIM_KEY } from '../src/types.js';

describe('mapEatClaims', () => {
  it('hashes all claim values by default (privacy-first)', async () => {
    const claims = new Map<number, unknown>();
    claims.set(EAT_CLAIM_KEY.iss, 'https://device.example.com');
    claims.set(EAT_CLAIM_KEY.iat, 1709640000);

    const result = await mapEatClaims(claims);

    expect(result.kind).toBe('evidence');
    expect(result.type).toBe('org.peacprotocol/attestation');
    expect(result.pillars).toEqual(['identity']);

    // All values should be sha256-hashed
    const expectedIssHash = await sha256Hex('https://device.example.com');
    expect(result.attestation_claims['iss']).toBe(`sha256:${expectedIssHash}`);

    const expectedIatHash = await sha256Hex('1709640000');
    expect(result.attestation_claims['iat']).toBe(`sha256:${expectedIatHash}`);
  });

  it('includes raw values for opted-in claims', async () => {
    const claims = new Map<number, unknown>();
    claims.set(EAT_CLAIM_KEY.iss, 'https://device.example.com');
    claims.set(EAT_CLAIM_KEY.sub, 'device-serial-xyz');
    claims.set(EAT_CLAIM_KEY.iat, 1709640000);

    const result = await mapEatClaims(claims, {
      includeRawClaims: [EAT_CLAIM_KEY.iss, EAT_CLAIM_KEY.iat],
    });

    // Opted-in: raw values
    expect(result.attestation_claims['iss']).toBe('https://device.example.com');
    expect(result.attestation_claims['iat']).toBe('1709640000');

    // Not opted-in: hashed
    expect(result.attestation_claims['sub']).toMatch(/^sha256:/);
  });

  it('uses custom type and pillars', async () => {
    const claims = new Map<number, unknown>();
    claims.set(EAT_CLAIM_KEY.iss, 'https://tee.example.com');

    const result = await mapEatClaims(claims, {
      type: 'org.peacprotocol/device_attestation',
      pillars: ['identity', 'safety'],
    });

    expect(result.type).toBe('org.peacprotocol/device_attestation');
    expect(result.pillars).toEqual(['identity', 'safety']);
  });

  it('extracts eat_iss and eat_sub when present', async () => {
    const claims = new Map<number, unknown>();
    claims.set(EAT_CLAIM_KEY.iss, 'https://device.example.com');
    claims.set(EAT_CLAIM_KEY.sub, 'device-abc');

    const result = await mapEatClaims(claims);
    expect(result.eat_iss).toBe('https://device.example.com');
    expect(result.eat_sub).toBe('device-abc');
  });

  it('omits eat_iss and eat_sub when not present', async () => {
    const claims = new Map<number, unknown>();
    claims.set(EAT_CLAIM_KEY.nonce, 'test-nonce');

    const result = await mapEatClaims(claims);
    expect(result.eat_iss).toBeUndefined();
    expect(result.eat_sub).toBeUndefined();
  });

  it('omits eat_iss when iss is not a string', async () => {
    const claims = new Map<number, unknown>();
    claims.set(EAT_CLAIM_KEY.iss, 42); // Not a string

    const result = await mapEatClaims(claims);
    expect(result.eat_iss).toBeUndefined();
    // But the claim still gets hashed in attestation_claims
    expect(result.attestation_claims['iss']).toMatch(/^sha256:/);
  });

  it('handles Uint8Array claim values', async () => {
    const claims = new Map<number, unknown>();
    const ueid = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    claims.set(EAT_CLAIM_KEY.ueid, ueid);

    const result = await mapEatClaims(claims);
    // Uint8Array serialized as hex
    const expectedHash = await sha256Hex('deadbeef');
    expect(result.attestation_claims['ueid']).toBe(`sha256:${expectedHash}`);
  });

  it('includes raw Uint8Array value when opted-in', async () => {
    const claims = new Map<number, unknown>();
    const ueid = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    claims.set(EAT_CLAIM_KEY.ueid, ueid);

    const result = await mapEatClaims(claims, {
      includeRawClaims: [EAT_CLAIM_KEY.ueid],
    });

    expect(result.attestation_claims['ueid']).toBe('deadbeef');
  });

  it('handles boolean claim values', async () => {
    const claims = new Map<number, unknown>();
    claims.set(EAT_CLAIM_KEY.secboot, true);

    const result = await mapEatClaims(claims);
    const expectedHash = await sha256Hex('true');
    expect(result.attestation_claims['secboot']).toBe(`sha256:${expectedHash}`);
  });

  it('labels unknown integer keys as claim_N', async () => {
    const claims = new Map<number, unknown>();
    claims.set(99999, 'unknown-value');

    const result = await mapEatClaims(claims);
    expect(result.attestation_claims['claim_99999']).toMatch(/^sha256:/);
  });

  it('skips string-keyed claims (only integer keys mapped)', async () => {
    const claims = new Map<number | string, unknown>();
    claims.set(EAT_CLAIM_KEY.iss, 'https://device.example.com');
    claims.set('string-key', 'string-value');

    const result = await mapEatClaims(claims as Map<number, unknown>);
    expect(result.attestation_claims['string-key']).toBeUndefined();
    expect(result.attestation_claims['iss']).toBeDefined();
  });

  it('returns empty attestation_claims for empty input', async () => {
    const claims = new Map<number, unknown>();
    const result = await mapEatClaims(claims);
    expect(Object.keys(result.attestation_claims)).toHaveLength(0);
    expect(result.kind).toBe('evidence');
  });
});
