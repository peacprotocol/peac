/**
 * Doc-truth gate for the Provisioning Lifecycle Records profile.
 *
 * Asserts the public profile spec carries the boundary paragraph that
 * pins PEAC's observer-only role and does not regress to historical
 * names that are no longer part of the public surface (the prior
 * recursive-walker name, the prior vendor-shaped pattern name, or
 * the legacy weak provider identity field). These checks catch silent
 * doc drift during reviews even when no source-level test is involved.
 *
 * The literal stale-name strings are constructed at test time via
 * array `.join()` so the contiguous forms do not appear in this test
 * source. That keeps the file itself clean of stale public surface
 * vocabulary while still asserting the spec is too.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const PROFILE_SPEC = join(REPO_ROOT, 'docs', 'specs', 'PROVISIONING-LIFECYCLE-PROFILE.md');

const SPEC_TEXT = readFileSync(PROFILE_SPEC, 'utf8');

// Stale public-surface names assembled at runtime so the literal
// contiguous forms never appear in this test source.
const PRIOR_WALKER_NAME = ['walkProvisioningLifecycle', 'ForSecrets'].join('');
const PRIOR_VENDOR_PATTERN_NAME = ['provider', 'secret', 'key', 'shape'].join('_');
const LEGACY_PROVIDER_IDENTITY_FIELD = ['provider', 'id'].join('.');

describe('docs/specs/PROVISIONING-LIFECYCLE-PROFILE.md: boundary text present', () => {
  it('asserts PEAC does not authorize the action', () => {
    expect(SPEC_TEXT).toContain('PEAC does not authorize the action');
  });

  it('asserts PEAC does not process payments', () => {
    expect(SPEC_TEXT).toContain('process payments');
  });

  it('asserts PEAC does not implement OAuth, DPoP, OAuth Protected Resource Metadata, or Shared Payment Tokens', () => {
    expect(SPEC_TEXT).toContain(
      'PEAC does not implement OAuth, DPoP, OAuth Protected Resource Metadata, or Shared Payment Tokens'
    );
  });
});

describe('docs/specs/PROVISIONING-LIFECYCLE-PROFILE.md: prior public-surface names absent', () => {
  it('does not reference the prior recursive-walker function name', () => {
    expect(SPEC_TEXT).not.toContain(PRIOR_WALKER_NAME);
  });

  it('does not reference the prior vendor-shaped scanner pattern name', () => {
    expect(SPEC_TEXT).not.toContain(PRIOR_VENDOR_PATTERN_NAME);
  });

  it('does not reference the legacy weak provider identity field name', () => {
    expect(SPEC_TEXT).not.toContain(LEGACY_PROVIDER_IDENTITY_FIELD);
  });
});
