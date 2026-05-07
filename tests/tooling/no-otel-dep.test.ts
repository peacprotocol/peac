/**
 * No OpenTelemetry dependency in @peac/cli or @peac/schema.
 *
 * Per the lifecycle observation profile (`docs/specs/LIFECYCLE-OBSERVATION-PROFILE.md`
 * §7.1 NORMATIVE), PEAC does not claim ownership over OpenTelemetry
 * semantic-convention namespaces and ships no OpenTelemetry SDK
 * dependency, exporter, collector, or semantic-convention package. This
 * test enforces that boundary at the dependency layer by walking the
 * package.json files of @peac/cli and @peac/schema and asserting no
 * dependency entry resolves to an OpenTelemetry package.
 *
 * Artifact-shape over source-grep: this test reads tracked package.json
 * files (the dependency-graph artifact), not the .ts source. Future code
 * that emits a `peac.record.ref` OTel attribute as a vendor-neutral
 * string is allowed; importing an OTel SDK is not.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

const TRACKED_PACKAGES = ['packages/cli/package.json', 'packages/schema/package.json'];

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const OTEL_PATTERNS: ReadonlyArray<RegExp> = [
  /^@opentelemetry\//,
  /^otel-/,
  /^opentelemetry-/,
  /^@otel\//,
];

function listAllDeps(pkg: PackageJson): string[] {
  const all: string[] = [];
  for (const block of [
    pkg.dependencies,
    pkg.devDependencies,
    pkg.peerDependencies,
    pkg.optionalDependencies,
  ]) {
    if (block) all.push(...Object.keys(block));
  }
  return all;
}

describe('no OpenTelemetry SDK dependency in CLI or Schema', () => {
  for (const relPath of TRACKED_PACKAGES) {
    it(`${relPath} declares no @opentelemetry/* or otel-* dependency`, () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, relPath), 'utf-8')) as PackageJson;
      const deps = listAllDeps(pkg);
      const offenders = deps.filter((d) => OTEL_PATTERNS.some((p) => p.test(d)));
      expect(
        offenders,
        `${pkg.name ?? relPath} must declare no OTel SDK dependency; found: ${offenders.join(', ')}`
      ).toEqual([]);
    });
  }
});
