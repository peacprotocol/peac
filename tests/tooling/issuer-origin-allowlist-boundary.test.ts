/**
 * Issuer-origin allowlist trust-boundary regression guard (static).
 *
 * The issuer-origin allowlist decision is centralized in
 * `@peac/contracts` `isAllowedIssuerOrigin` so it cannot drift across surfaces.
 * This test statically asserts that the divergent open-coded checks do not creep
 * back: no raw-string allowlist fallback, no host-only origin comparison in the
 * issuer-trust path, and every surface routes through the canonical helper. It
 * is source-text based so it also covers surfaces without a runtime harness.
 *
 * This guard covers the strict edge/middleware issuer-origin trust paths only.
 * Intentionally out of scope:
 *  - JWKS-fetch `isAllowedHost(host)` callbacks, which receive a bare hostname
 *    and enforce a separate fetch-host boundary;
 *  - `@peac/worker-core` `isIssuerAllowed`, whose exported API supports opaque
 *    non-URL identifiers;
 *  - `@peac/protocol` verifier allowlist behavior, whose permissive semantics
 *    differ from the strict edge/middleware surfaces covered here.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

// Surfaces that make the issuer-origin allowlist decision.
const ISSUER_ALLOWLIST_SURFACES = [
  'packages/worker-shared/src/config.ts',
  'surfaces/nextjs/middleware/src/handler.ts',
];

describe('issuer-origin allowlist trust boundary (static guard)', () => {
  it.each(ISSUER_ALLOWLIST_SURFACES)(
    '%s routes the issuer check through @peac/contracts isAllowedIssuerOrigin',
    (file) => {
      const src = read(file);
      expect(src).toMatch(/isAllowedIssuerOrigin/);
      expect(src).toMatch(/from '@peac\/contracts'/);
    }
  );

  it.each(ISSUER_ALLOWLIST_SURFACES)(
    '%s has no raw-string allowlist fallback comparison',
    (file) => {
      // The old nextjs fallback compared a raw allowlist entry to the issuer.
      expect(read(file)).not.toMatch(/return\s+allowed\s*===\s*issuerOrigin/);
    }
  );

  it.each(ISSUER_ALLOWLIST_SURFACES)(
    '%s does not re-derive the issuer allowlist by hand via new URL(...).origin',
    (file) => {
      // The canonical helper owns origin normalization; surfaces must not
      // open-code an `new URL(allowed).origin === ...` loop again.
      expect(read(file)).not.toMatch(/new URL\([^)]*\)\.origin\s*===/);
    }
  );

  it('the canonical helper stays runtime-neutral (no Node-only imports)', () => {
    const src = read('packages/contracts/src/issuer-origin.ts');
    expect(src).not.toMatch(/from 'node:/);
    expect(src).not.toMatch(/require\(/);
    expect(src).not.toMatch(/\bnode:(net|dns|crypto|http|https)\b/);
  });
});
