/**
 * TAP keyid trust-boundary regression guard (static).
 *
 * The whole point of the keyid trust-boundary hardening is to remove the
 * duplicated, request-derived issuer logic and route every keyid -> issuer
 * derivation through the single `issuerFromKeyid` helper in @peac/mappings-tap,
 * which fails closed. This test statically asserts that the dangerous patterns
 * do not creep back into the verification surfaces, and that each surface uses
 * the canonical helper. It is intentionally source-text based so it also covers
 * @peac/worker-shared, which has no runtime test harness of its own.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

// Surfaces that derive an issuer from a TAP keyid.
const VERIFICATION_SURFACES = [
  'packages/mappings/tap/src/mapper.ts',
  'packages/worker-core/src/verification.ts',
  'packages/worker-shared/src/verification.ts',
  'surfaces/nextjs/middleware/src/handler.ts',
];

// Surfaces that consume the canonical helper (mapper.ts is its own package and
// imports it directly; the rest import it from @peac/mappings-tap).
const HELPER_CONSUMERS = [
  'packages/worker-core/src/verification.ts',
  'packages/worker-shared/src/verification.ts',
  'surfaces/nextjs/middleware/src/handler.ts',
];

describe('TAP keyid trust boundary (static guard)', () => {
  describe('the dangerous patterns are gone from every verification surface', () => {
    it.each(VERIFICATION_SURFACES)('%s has no local extractIssuerFromKeyid', (file) => {
      expect(read(file)).not.toMatch(/extractIssuerFromKeyid/);
    });

    it.each(VERIFICATION_SURFACES)('%s does not pass a keyid through unchanged', (file) => {
      // The old fallback returned the keyid verbatim ("return keyid as-is").
      expect(read(file)).not.toMatch(/return keyid\b/);
    });

    it.each(VERIFICATION_SURFACES)(
      '%s does not derive an issuer from request URL or Host header',
      (file) => {
        const src = read(file);
        // No `https://${host}`-style issuer fabricated from a Host header.
        expect(src).not.toMatch(/`https:\/\/\$\{\s*host/);
        // No `new URL(request.url).origin` used as an issuer fallback.
        expect(src).not.toMatch(/new URL\(\s*request\.url\s*\)\.origin/);
      }
    );
  });

  describe('every surface routes through the canonical helper', () => {
    it('mapper.ts calls issuerFromKeyid before any key resolution', () => {
      const src = read('packages/mappings/tap/src/mapper.ts');
      const helperIdx = src.indexOf('issuerFromKeyid(');
      const resolverIdx = src.indexOf('keyResolver(');
      expect(helperIdx).toBeGreaterThan(-1);
      expect(resolverIdx).toBeGreaterThan(-1);
      expect(helperIdx).toBeLessThan(resolverIdx);
    });

    it.each(HELPER_CONSUMERS)('%s imports and uses issuerFromKeyid', (file) => {
      const src = read(file);
      expect(src).toMatch(/issuerFromKeyid/);
      expect(src).toMatch(/from '@peac\/mappings-tap'/);
    });
  });

  describe('E_TAP_KEYID_INVALID maps to HTTP 401 in every error registry', () => {
    const REGISTRIES: Array<[string, string]> = [
      ['@peac/contracts', 'packages/contracts/src/index.ts'],
      ['@peac/mappings-tap', 'packages/mappings/tap/src/errors.ts'],
      ['@peac/middleware-nextjs', 'surfaces/nextjs/middleware/src/errors.ts'],
    ];
    it.each(REGISTRIES)('%s maps TAP_KEYID_INVALID -> 401', (_pkg, file) => {
      // Matches `[...TAP_KEYID_INVALID]: 401` in the status map of each registry.
      expect(read(file)).toMatch(/TAP_KEYID_INVALID\]:\s*401/);
    });

    it('the canonical code value is the stable string E_TAP_KEYID_INVALID', () => {
      expect(read('packages/contracts/src/codes.ts')).toMatch(
        /TAP_KEYID_INVALID:\s*'E_TAP_KEYID_INVALID'/
      );
    });
  });
});
