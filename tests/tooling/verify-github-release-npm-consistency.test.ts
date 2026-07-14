/**
 * Unit gate for scripts/verify-github-release-npm-consistency.mjs.
 *
 * Exercises the pure `reconcile()` and `parseReleaseTag()` functions with a
 * mocked `distTagsFor` (no real network, no real git), plus the exported
 * `withRetry()` and `determineIsActualLatest()` helpers in isolation.
 *
 * Importing the module must be side-effect-free: `main()` runs only when
 * the script is invoked directly, so these tests never touch npm, gh, or
 * the filesystem outside of a direct CLI smoke test at the bottom.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, vi } from 'vitest';

import {
  reconcile,
  parseReleaseTag,
  withRetry,
  determineIsActualLatest,
  ReleaseConsistencyError,
  ERROR_KINDS,
} from '../../scripts/verify-github-release-npm-consistency.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'verify-github-release-npm-consistency.mjs'
);

const PACKAGES = ['@peac/kernel', '@peac/schema', '@peac/crypto', '@peac/cli'];

function manifestOf(packages: string[], totalPackages?: number) {
  return { packages, totalPackages: totalPackages ?? packages.length };
}

/** A distTagsFor that reports every package at `version` for both latest and versions. */
function allAt(version: string) {
  return (_pkg: string) => ({ latest: version, next: version, versions: [version, '0.0.1'] });
}

describe('parseReleaseTag', () => {
  it('parses a valid vX.Y.Z tag', () => {
    expect(parseReleaseTag('v0.16.2')).toBe('0.16.2');
    expect(parseReleaseTag('v1.0.0')).toBe('1.0.0');
  });

  it('throws INVALID_RELEASE_TAG for a non-matching tag', () => {
    const attempts = ['0.16.2', 'v0.16', 'v0.16.2-rc.1', 'v0.16.2.1', 'vX.Y.Z', '', 'v0.16.2 '];
    for (const tag of attempts) {
      // v0.16.2 with trailing space is trimmed and valid; assert the rest throw.
      if (tag === 'v0.16.2 ') {
        expect(parseReleaseTag(tag)).toBe('0.16.2');
        continue;
      }
      let threw = false;
      try {
        parseReleaseTag(tag);
      } catch (err) {
        threw = true;
        expect(err).toBeInstanceOf(ReleaseConsistencyError);
        expect((err as ReleaseConsistencyError).kind).toBe(ERROR_KINDS.INVALID_RELEASE_TAG);
      }
      expect(threw).toBe(true);
    }
  });

  it('throws INVALID_RELEASE_TAG for a non-string tag', () => {
    expect(() => parseReleaseTag(undefined as unknown as string)).toThrow(ReleaseConsistencyError);
    try {
      parseReleaseTag(null as unknown as string);
    } catch (err) {
      expect((err as ReleaseConsistencyError).kind).toBe(ERROR_KINDS.INVALID_RELEASE_TAG);
    }
  });
});

describe('reconcile - actual-latest, all packages match', () => {
  it('is ok when every package (small representative manifest) is at latest', () => {
    const result = reconcile({
      manifest: manifestOf(PACKAGES),
      releaseVersion: '0.16.2',
      releaseState: 'actual-latest',
      distTagsFor: allAt('0.16.2'),
    });
    expect(result.ok).toBe(true);
    expect(result.packageCount).toBe(4);
    expect(result.checked).toBe(4);
    expect(result.rows).toHaveLength(4);
    expect(result.rows.every((r) => r.status === 'ok')).toBe(true);
    expect(result.mismatches).toEqual({ versionMissing: 0, latestMismatch: 0, registryErrors: 0 });
    expect(result.errors).toHaveLength(0);
  });
});

describe('reconcile - actual-latest, single-package failures', () => {
  it('fails when one package is missing the target version', () => {
    const distTagsFor = (pkg: string) => {
      if (pkg === '@peac/schema') {
        return { latest: '0.16.1', next: '0.16.1', versions: ['0.16.1'] };
      }
      return { latest: '0.16.2', next: '0.16.2', versions: ['0.16.2'] };
    };
    const result = reconcile({
      manifest: manifestOf(PACKAGES),
      releaseVersion: '0.16.2',
      releaseState: 'actual-latest',
      distTagsFor,
    });
    expect(result.ok).toBe(false);
    expect(result.mismatches.versionMissing).toBe(1);
    const row = result.rows.find((r) => r.package === '@peac/schema')!;
    expect(row.versionExists).toBe(false);
    expect(row.status).toBe('version-missing');
    expect(
      result.errors.some(
        (e) => e.package === '@peac/schema' && e.kind === ERROR_KINDS.VERSION_MISSING
      )
    ).toBe(true);
  });

  it('fails when one package has a stale npm latest', () => {
    const distTagsFor = (pkg: string) => {
      if (pkg === '@peac/crypto') {
        return { latest: '0.16.1', next: '0.16.2', versions: ['0.16.1', '0.16.2'] };
      }
      return allAt('0.16.2')(pkg);
    };
    const result = reconcile({
      manifest: manifestOf(PACKAGES),
      releaseVersion: '0.16.2',
      releaseState: 'actual-latest',
      distTagsFor,
    });
    expect(result.ok).toBe(false);
    expect(result.mismatches.latestMismatch).toBe(1);
    expect(result.mismatches.versionMissing).toBe(0);
    const row = result.rows.find((r) => r.package === '@peac/crypto')!;
    expect(row.versionExists).toBe(true);
    expect(row.latest).toBe('0.16.1');
    expect(row.status).toBe('latest-mismatch');
    expect(
      result.errors.some(
        (e) => e.package === '@peac/crypto' && e.kind === ERROR_KINDS.STATE_MISMATCH
      )
    ).toBe(true);
  });

  it('reports multiple mismatches together in one complete table (no short-circuit)', () => {
    const distTagsFor = (pkg: string) => {
      if (pkg === '@peac/schema') return { latest: '0.16.2', next: '0.16.2', versions: ['0.16.1'] };
      if (pkg === '@peac/crypto')
        return { latest: '0.16.1', next: '0.16.2', versions: ['0.16.1', '0.16.2'] };
      return allAt('0.16.2')(pkg);
    };
    const result = reconcile({
      manifest: manifestOf(PACKAGES),
      releaseVersion: '0.16.2',
      releaseState: 'actual-latest',
      distTagsFor,
    });
    expect(result.ok).toBe(false);
    expect(result.checked).toBe(4);
    expect(result.rows).toHaveLength(4);
    expect(result.mismatches.versionMissing).toBe(1);
    expect(result.mismatches.latestMismatch).toBe(1);
    // Both mismatched packages are present, proving the loop does not stop
    // at the first failure.
    const names = result.errors.map((e) => e.package);
    expect(names).toContain('@peac/schema');
    expect(names).toContain('@peac/crypto');
  });

  it('regression: an early package matches but a later package is missing or stale', () => {
    // The predecessor guard checked only the first published package
    // (@peac/kernel). This locks that a later package's failure is never
    // masked by an earlier package's success.
    const distTagsFor = (pkg: string) => {
      if (pkg === '@peac/kernel') return allAt('0.16.2')(pkg);
      if (pkg === '@peac/cli') return { latest: '0.16.1', next: '0.16.1', versions: ['0.16.1'] };
      return allAt('0.16.2')(pkg);
    };
    const result = reconcile({
      manifest: manifestOf(PACKAGES),
      releaseVersion: '0.16.2',
      releaseState: 'actual-latest',
      distTagsFor,
    });
    expect(result.ok).toBe(false);
    const kernelRow = result.rows.find((r) => r.package === '@peac/kernel')!;
    expect(kernelRow.status).toBe('ok');
    const cliRow = result.rows.find((r) => r.package === '@peac/cli')!;
    expect(cliRow.status).toBe('version-missing');
  });
});

describe('reconcile - manifest validation', () => {
  it('throws INVALID_MANIFEST for a duplicate package entry', () => {
    const manifest = {
      packages: ['@peac/kernel', '@peac/schema', '@peac/kernel'],
      totalPackages: 3,
    };
    expect(() =>
      reconcile({
        manifest,
        releaseVersion: '0.16.2',
        releaseState: 'actual-latest',
        distTagsFor: allAt('0.16.2'),
      })
    ).toThrow(ReleaseConsistencyError);
    try {
      reconcile({
        manifest,
        releaseVersion: '0.16.2',
        releaseState: 'actual-latest',
        distTagsFor: allAt('0.16.2'),
      });
    } catch (err) {
      expect((err as ReleaseConsistencyError).kind).toBe(ERROR_KINDS.INVALID_MANIFEST);
    }
  });

  it('throws INVALID_MANIFEST for a malformed manifest (missing packages array)', () => {
    const manifest = { totalPackages: 3 } as unknown as { packages: string[] };
    let kind: string | undefined;
    try {
      reconcile({
        manifest,
        releaseVersion: '0.16.2',
        releaseState: 'actual-latest',
        distTagsFor: allAt('0.16.2'),
      });
    } catch (err) {
      kind = (err as ReleaseConsistencyError).kind;
    }
    expect(kind).toBe(ERROR_KINDS.INVALID_MANIFEST);
  });

  it('throws INVALID_MANIFEST for a non-string package entry', () => {
    const manifest = { packages: ['@peac/kernel', 42], totalPackages: 2 } as unknown as {
      packages: string[];
    };
    let kind: string | undefined;
    try {
      reconcile({
        manifest,
        releaseVersion: '0.16.2',
        releaseState: 'actual-latest',
        distTagsFor: allAt('0.16.2'),
      });
    } catch (err) {
      kind = (err as ReleaseConsistencyError).kind;
    }
    expect(kind).toBe(ERROR_KINDS.INVALID_MANIFEST);
  });

  it('throws INVALID_MANIFEST when totalPackages disagrees with packages.length', () => {
    const manifest = manifestOf(PACKAGES, 99);
    let kind: string | undefined;
    try {
      reconcile({
        manifest,
        releaseVersion: '0.16.2',
        releaseState: 'actual-latest',
        distTagsFor: allAt('0.16.2'),
      });
    } catch (err) {
      kind = (err as ReleaseConsistencyError).kind;
    }
    expect(kind).toBe(ERROR_KINDS.INVALID_MANIFEST);
  });
});

describe('reconcile - draft and prerelease are skipped', () => {
  it('draft: ok true, no packages checked, distTagsFor never called', () => {
    const distTagsFor = vi.fn();
    const result = reconcile({
      manifest: manifestOf(PACKAGES),
      releaseVersion: '0.16.2',
      releaseState: 'draft',
      distTagsFor,
    });
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
    expect(result.rows).toHaveLength(0);
    expect(result.summary).toContain('skipped');
    expect(distTagsFor).not.toHaveBeenCalled();
  });

  it('prerelease: ok true, no packages checked, distTagsFor never called', () => {
    const distTagsFor = vi.fn();
    const result = reconcile({
      manifest: manifestOf(PACKAGES),
      releaseVersion: '0.16.2',
      releaseState: 'prerelease',
      distTagsFor,
    });
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
    expect(result.summary).toContain('skipped');
    expect(distTagsFor).not.toHaveBeenCalled();
  });
});

describe('reconcile - historical-stable', () => {
  it('does not require npm latest to equal the release version', () => {
    // Every package already moved latest on to a newer version, but the
    // release version still exists on npm; historical-stable must pass.
    const distTagsFor = (_pkg: string) => ({
      latest: '0.17.0',
      next: '0.17.0',
      versions: ['0.16.2', '0.17.0'],
    });
    const result = reconcile({
      manifest: manifestOf(PACKAGES),
      releaseVersion: '0.16.2',
      releaseState: 'historical-stable',
      distTagsFor,
    });
    expect(result.ok).toBe(true);
    expect(result.mismatches.latestMismatch).toBe(4);
    expect(result.rows.every((r) => r.status.startsWith('ok'))).toBe(true);
  });

  it('still requires the release version to exist for every package', () => {
    const distTagsFor = (pkg: string) => {
      if (pkg === '@peac/cli') return { latest: '0.17.0', next: '0.17.0', versions: ['0.17.0'] };
      return { latest: '0.17.0', next: '0.17.0', versions: ['0.16.2', '0.17.0'] };
    };
    const result = reconcile({
      manifest: manifestOf(PACKAGES),
      releaseVersion: '0.16.2',
      releaseState: 'historical-stable',
      distTagsFor,
    });
    expect(result.ok).toBe(false);
    expect(result.mismatches.versionMissing).toBe(1);
    const row = result.rows.find((r) => r.package === '@peac/cli')!;
    expect(row.status).toBe('version-missing');
  });
});

describe('reconcile - registry error propagation', () => {
  it('malformed registry JSON surfaces as MALFORMED_REGISTRY_RESPONSE and fails ok', () => {
    const distTagsFor = (pkg: string) => {
      if (pkg === '@peac/schema') {
        throw new ReleaseConsistencyError(
          ERROR_KINDS.MALFORMED_REGISTRY_RESPONSE,
          'unparseable JSON'
        );
      }
      return allAt('0.16.2')(pkg);
    };
    const result = reconcile({
      manifest: manifestOf(PACKAGES),
      releaseVersion: '0.16.2',
      releaseState: 'actual-latest',
      distTagsFor,
    });
    expect(result.ok).toBe(false);
    expect(result.mismatches.registryErrors).toBe(1);
    const row = result.rows.find((r) => r.package === '@peac/schema')!;
    expect(row.status).toBe(`error: ${ERROR_KINDS.MALFORMED_REGISTRY_RESPONSE}`);
    expect(
      result.errors.some(
        (e) => e.package === '@peac/schema' && e.kind === ERROR_KINDS.MALFORMED_REGISTRY_RESPONSE
      )
    ).toBe(true);
  });

  it('a distTagsFor that ultimately throws REGISTRY_TRANSIENT_FAILURE (retries exhausted) fails ok', () => {
    const distTagsFor = (pkg: string) => {
      if (pkg === '@peac/crypto') {
        throw new ReleaseConsistencyError(
          ERROR_KINDS.REGISTRY_TRANSIENT_FAILURE,
          'rate limited (429)'
        );
      }
      return allAt('0.16.2')(pkg);
    };
    const result = reconcile({
      manifest: manifestOf(PACKAGES),
      releaseVersion: '0.16.2',
      releaseState: 'actual-latest',
      distTagsFor,
    });
    expect(result.ok).toBe(false);
    expect(result.mismatches.registryErrors).toBe(1);
    expect(
      result.errors.some(
        (e) => e.package === '@peac/crypto' && e.kind === ERROR_KINDS.REGISTRY_TRANSIENT_FAILURE
      )
    ).toBe(true);
  });

  it('passes when a wrapped distTagsFor internally retries a transient failure to success', () => {
    // reconcile() itself does not retry (retries live in the CLI's real
    // distTagsFor implementation, built on withRetry). This wraps one
    // package's lookup in withRetry directly to prove the two compose:
    // a 429/5xx that clears within the bounded attempts still yields ok:true.
    let calls = 0;
    const flaky = () => {
      calls += 1;
      if (calls < 3) {
        throw new ReleaseConsistencyError(
          ERROR_KINDS.REGISTRY_TRANSIENT_FAILURE,
          'rate limited (429)'
        );
      }
      return { latest: '0.16.2', next: '0.16.2', versions: ['0.16.2'] };
    };
    const distTagsFor = (pkg: string) => {
      if (pkg === '@peac/schema') {
        return withRetry(flaky, { attempts: 8, sleep: () => {} }).value;
      }
      return allAt('0.16.2')(pkg);
    };
    const result = reconcile({
      manifest: manifestOf(PACKAGES),
      releaseVersion: '0.16.2',
      releaseState: 'actual-latest',
      distTagsFor,
    });
    expect(result.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it('a package that does not exist at all reports PACKAGE_MISSING as a registry error', () => {
    const distTagsFor = (pkg: string) => {
      if (pkg === '@peac/kernel') {
        throw new ReleaseConsistencyError(
          ERROR_KINDS.PACKAGE_MISSING,
          'npm view failed: 404 Not Found'
        );
      }
      return allAt('0.16.2')(pkg);
    };
    const result = reconcile({
      manifest: manifestOf(PACKAGES),
      releaseVersion: '0.16.2',
      releaseState: 'actual-latest',
      distTagsFor,
    });
    expect(result.ok).toBe(false);
    expect(result.mismatches.registryErrors).toBe(1);
    expect(
      result.errors.some(
        (e) => e.package === '@peac/kernel' && e.kind === ERROR_KINDS.PACKAGE_MISSING
      )
    ).toBe(true);
  });
});

describe('reconcile - scoped package names', () => {
  it('handles scoped names correctly in rows, errors, and status', () => {
    const result = reconcile({
      manifest: manifestOf(['@peac/kernel', '@peac/adapter-openai-compatible']),
      releaseVersion: '0.16.2',
      releaseState: 'actual-latest',
      distTagsFor: (pkg) =>
        pkg === '@peac/adapter-openai-compatible'
          ? { latest: '0.16.1', next: '0.16.1', versions: ['0.16.1'] }
          : allAt('0.16.2')(pkg),
    });
    expect(result.ok).toBe(false);
    const row = result.rows.find((r) => r.package === '@peac/adapter-openai-compatible');
    expect(row).toBeDefined();
    expect(row!.status).toBe('version-missing');
  });
});

describe('withRetry', () => {
  it('retries a transient failure then returns the eventual success', () => {
    let calls = 0;
    const op = () => {
      calls += 1;
      if (calls < 3) {
        throw new ReleaseConsistencyError(ERROR_KINDS.REGISTRY_TRANSIENT_FAILURE, '503');
      }
      return 'ok';
    };
    const { value, attempts } = withRetry(op, { attempts: 8, sleep: () => {} });
    expect(value).toBe('ok');
    expect(attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it('throws REGISTRY_TRANSIENT_FAILURE after exhausting the bounded attempts (no infinite retry)', () => {
    let calls = 0;
    const op = () => {
      calls += 1;
      throw new ReleaseConsistencyError(ERROR_KINDS.REGISTRY_TRANSIENT_FAILURE, '503 every time');
    };
    let thrownKind: string | undefined;
    try {
      withRetry(op, { attempts: 3, sleep: () => {} });
    } catch (err) {
      thrownKind = (err as ReleaseConsistencyError).kind;
    }
    expect(thrownKind).toBe(ERROR_KINDS.REGISTRY_TRANSIENT_FAILURE);
    expect(calls).toBe(3);
  });

  it('never retries a permanent failure', () => {
    let calls = 0;
    const op = () => {
      calls += 1;
      throw new ReleaseConsistencyError(ERROR_KINDS.PACKAGE_MISSING, '404');
    };
    expect(() => withRetry(op, { attempts: 8, sleep: () => {} })).toThrow(ReleaseConsistencyError);
    expect(calls).toBe(1);
  });

  it('never retries a state mismatch style error', () => {
    let calls = 0;
    const op = () => {
      calls += 1;
      throw new ReleaseConsistencyError(ERROR_KINDS.STATE_MISMATCH, 'latest disagrees');
    };
    expect(() => withRetry(op, { attempts: 8, sleep: () => {} })).toThrow(ReleaseConsistencyError);
    expect(calls).toBe(1);
  });
});

describe('determineIsActualLatest', () => {
  it('is false when there is no resolvable latest release', () => {
    expect(determineIsActualLatest({ tag: 'v0.16.2', releaseId: '1', latestRelease: null })).toBe(
      false
    );
  });

  it('matches on release id when both sides provide one', () => {
    expect(
      determineIsActualLatest({
        tag: 'v0.16.2',
        releaseId: '12345',
        latestRelease: { id: '12345', tagName: 'v0.16.2' },
      })
    ).toBe(true);
    expect(
      determineIsActualLatest({
        tag: 'v0.16.2',
        releaseId: '99999',
        latestRelease: { id: '12345', tagName: 'v0.16.2' },
      })
    ).toBe(false);
  });

  it('falls back to tag comparison when no release id is available', () => {
    expect(
      determineIsActualLatest({
        tag: 'v0.16.2',
        releaseId: null,
        latestRelease: { id: null, tagName: 'v0.16.2' },
      })
    ).toBe(true);
    expect(
      determineIsActualLatest({
        tag: 'v0.16.1',
        releaseId: null,
        latestRelease: { id: null, tagName: 'v0.16.2' },
      })
    ).toBe(false);
  });
});

describe('CLI', () => {
  it('--help prints usage and exits 0 (proves the module imports without side effects)', () => {
    const out = execFileSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' });
    expect(out).toContain('Usage: verify-github-release-npm-consistency.mjs');
  });

  it('no arguments prints usage to stderr and exits non-zero', () => {
    const result = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Usage: verify-github-release-npm-consistency.mjs');
  });
});
