/**
 * Smoke test for the verify-agent-provisioning SOLUTIONS recipe.
 *
 * Exercises the recipe's offline path end-to-end: read each generic
 * provisioning-lifecycle fixture, validate the extension content
 * through `validateProvisioningLifecycle`, sign an interaction record
 * through `@peac/protocol.issue`, and verify it offline through
 * `@peac/protocol.verifyLocal`. Fails if any fixture validates poorly
 * or any record fails to verify, which means the recipe steps are no
 * longer faithful.
 *
 * The test is deliberately self-contained: no out/ artifact handoff
 * between scripts, no environment dependencies, no external services.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeypair } from '@peac/crypto';
import { issue, verifyLocal } from '@peac/protocol';
import {
  PROVISIONING_LIFECYCLE_EXTENSION_KEY,
  PROVISIONING_LIFECYCLE_TYPE_URIS,
  validateProvisioningLifecycle,
} from '@peac/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const FIXTURES_DIR = join(REPO_ROOT, 'examples/provisioning-lifecycle/fixtures');

const TYPE_BY_EVENT_KIND = Object.fromEntries(
  PROVISIONING_LIFECYCLE_TYPE_URIS.map((u) => [u.replace('org.peacprotocol/', ''), u])
);

interface ProvisioningFixture {
  event_kind: string;
  observed_at: string;
  [key: string]: unknown;
}

function loadFixtures(): Array<{ file: string; fixture: ProvisioningFixture }> {
  const files = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  return files.map((file) => ({
    file,
    fixture: JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf8')) as ProvisioningFixture,
  }));
}

describe('SOLUTIONS recipe smoke: verify-agent-provisioning', () => {
  const fixtures = loadFixtures();

  it('finds 10 fixtures (one per *-observed event family)', () => {
    expect(fixtures.length).toBe(10);
    const eventKinds = new Set(fixtures.map((f) => f.fixture.event_kind));
    expect(eventKinds.size).toBe(PROVISIONING_LIFECYCLE_TYPE_URIS.length);
  });

  it('every fixture validates through validateProvisioningLifecycle', () => {
    for (const { file, fixture } of fixtures) {
      const result = validateProvisioningLifecycle(fixture);
      if (!result.ok) {
        const summary = result.errors
          .map((e) => `${e.code}${e.path ? ` (${e.path})` : ''}: ${e.message}`)
          .join('\n  ');
        throw new Error(`fixture ${file} expected to validate but failed:\n  ${summary}`);
      }
      expect(result.ok).toBe(true);
    }
  });

  it('every fixture issues + verifies offline end-to-end', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const occurredAt = new Date(nowSeconds * 1000).toISOString();

    for (const { file, fixture } of fixtures) {
      const type = TYPE_BY_EVENT_KIND[fixture.event_kind];
      expect(type, `no type URI for event_kind ${fixture.event_kind}`).toBeDefined();

      const issueResult = await issue({
        iss: 'https://provisioning.example.com',
        kind: 'evidence',
        type,
        pillars: ['provenance'],
        occurred_at: occurredAt,
        privateKey,
        kid: 'verify-agent-provisioning-smoke',
        extensions: {
          [PROVISIONING_LIFECYCLE_EXTENSION_KEY]: fixture,
        },
      });
      expect(issueResult.jws.length, `${file}: issued JWS is empty`).toBeGreaterThan(0);

      const verifyResult = await verifyLocal(issueResult.jws, publicKey);
      if (!verifyResult.valid) {
        const reason = 'message' in verifyResult ? verifyResult.message : 'invalid';
        throw new Error(`fixture ${file} verification failed: ${reason}`);
      }
      expect(verifyResult.valid).toBe(true);
    }
  });
});
