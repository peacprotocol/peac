/**
 * The tracked schema snapshot must match its canonical source.
 *
 * Tests run against the app-local snapshot so a clean clone works. This test is the guard that the
 * snapshot has not drifted: it compares bytes with the canonical planning-repo copy WHEN that copy
 * is present, and reports a visible skip when it is not. It never refreshes the snapshot.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SNAPSHOT = resolve(__dirname, '../contracts/v0164-verification-report.schema.json');
// Optional authoritative copy, supplied by path. Not present in a clean clone or in CI.
/**
 * Optional authoritative copy.
 *
 * Supplied via PEAC_REPORT_SCHEMA_PATH when one is reachable. There is deliberately no hardcoded
 * location: a path outside the checkout resolves on one machine and nowhere else, which would make
 * the outcome depend on the surrounding filesystem.
 */
const CANONICAL = process.env.PEAC_REPORT_SCHEMA_PATH ?? '';

const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

describe('schema snapshot', () => {
  it('is tracked in this repository', () => {
    expect(existsSync(SNAPSHOT)).toBe(true);
  });

  it('matches the SHA-256 recorded in contracts/README.md', () => {
    const readme = readFileSync(resolve(__dirname, '../contracts/README.md'), 'utf8');
    const recorded = readme.match(/`([0-9a-f]{64})`/)?.[1];
    expect(recorded).toBe(sha(SNAPSHOT));
  });

  /**
   * Reported as SKIPPED, never as passed, when no authoritative copy is supplied.
   *
   * `it.runIf` puts the skip in the summary count. A conditional `return` would report a pass, and
   * a `console.warn` explaining the degradation is swallowed by the reporter, so an environment
   * running strictly fewer checks would be indistinguishable from one running all of them.
   *
   * The property that must hold in EVERY environment -- the snapshot matches its recorded digest --
   * is the test above, which never skips.
   */
  it.runIf(CANONICAL !== '' && existsSync(CANONICAL))(
    'is byte-identical to the authoritative source',
    () => {
      expect(sha(SNAPSHOT)).toBe(sha(CANONICAL));
    }
  );
});
