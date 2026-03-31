/**
 * ERC-8128 conformance fixture validation.
 *
 * Verifies that the ERC-8128 mapping fixtures are structurally valid
 * and contain the required fields for RFC 9421 signature verification.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const FIXTURE_DIR = join(__dirname, '../../specs/conformance/erc8128-mapping');

function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf-8'));
}

describe('ERC-8128 conformance fixtures', () => {
  describe('signature-input.json', () => {
    const fixture = readFixture('signature-input.json');

    it('contains required request fields', () => {
      const request = fixture.request as Record<string, unknown>;
      expect(request.method).toBe('POST');
      expect(request.targetUri).toBeTruthy();
      expect(request.headers).toBeTruthy();
    });

    it('request includes peac-receipt header', () => {
      const headers = (fixture.request as Record<string, unknown>).headers as Record<
        string,
        string
      >;
      expect(headers['peac-receipt']).toBeTruthy();
      expect(headers['peac-receipt'].split('.').length).toBe(3);
    });

    it('signature params include required components', () => {
      const params = fixture.signatureParams as Record<string, unknown>;
      expect(params.algorithm).toBe('ed25519');
      expect(params.keyId).toBeTruthy();
      expect(params.created).toBeTypeOf('number');
      expect(params.expires).toBeTypeOf('number');
    });

    it('covered components include peac-receipt', () => {
      const params = fixture.signatureParams as Record<string, unknown>;
      const components = params.coveredComponents as string[];
      expect(components).toContain('@method');
      expect(components).toContain('@target-uri');
      expect(components).toContain('peac-receipt');
    });
  });

  describe('vector-signature.json', () => {
    const fixture = readFixture('vector-signature.json');

    it('signature base has correct components', () => {
      const base = fixture.signatureBase as Record<string, unknown>;
      const components = base.components as Array<{ id: string; value: string }>;
      expect(components.length).toBe(3);
      expect(components.map((c) => c.id)).toEqual(['@method', '@target-uri', 'peac-receipt']);
    });

    it('coverage confirms receipt header is covered', () => {
      const coverage = fixture.coverage as Record<string, unknown>;
      expect(coverage.receiptHeaderCovered).toBe(true);
      expect(coverage.methodCovered).toBe(true);
      expect(coverage.targetUriCovered).toBe(true);
    });

    it('minimum components match ERC-8128 profile', () => {
      const coverage = fixture.coverage as Record<string, unknown>;
      expect(coverage.minimumComponents).toEqual(['@method', '@target-uri', 'peac-receipt']);
    });
  });

  describe('vector-receipt-binding.json', () => {
    const fixture = readFixture('vector-receipt-binding.json');

    it('binding confirms peac-receipt is covered', () => {
      const binding = fixture.binding as Record<string, unknown>;
      expect(binding.headerName).toBe('peac-receipt');
      expect(binding.headerIncludedInSignature).toBe(true);
      expect(binding.signatureAlgorithm).toBe('ed25519');
    });

    it('verification steps are defined', () => {
      const verification = fixture.verification as Record<string, unknown>;
      const steps = verification.steps as string[];
      expect(steps.length).toBeGreaterThanOrEqual(4);
    });

    it('fail conditions are defined', () => {
      const verification = fixture.verification as Record<string, unknown>;
      const fails = verification.failConditions as string[];
      expect(fails.length).toBeGreaterThanOrEqual(3);
      expect(fails.some((f) => f.includes('peac-receipt'))).toBe(true);
    });
  });
});
