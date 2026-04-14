/**
 * Section 26 conformance fixture runner.
 *
 * Loads every C-001..C-020 fixture from specs/conformance/commerce/ and
 * runs the assertExplicitFinality guard against each fixture's `input`
 * across the three modes (strict, interop, legacy). The fixture's
 * `expected.modes[mode]` value MUST be one of: 'pass', 'warn', 'throw'.
 *
 * Cross-rail fixtures (C-017..C-020) carry a `rails` array; the runner
 * substitutes the `<rail>` placeholder in `options.pointer` (if present)
 * and expects identical behavior across all listed rails.
 */

import { describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertExplicitFinality,
  MapperBoundaryError,
  type StrictnessMode,
  type FinalityGuardInput,
} from '../src/finality.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../../../../specs/conformance/commerce');

interface FixtureExpected {
  modes: Record<StrictnessMode, 'pass' | 'warn' | 'throw'>;
  error_code?: string;
}

interface Fixture {
  requirement_id: string;
  description: string;
  guard_module: string;
  function: string;
  input: FinalityGuardInput;
  options?: { pointer?: string };
  rails?: string[];
  expected: FixtureExpected;
}

function loadFixtures(): Array<{ filename: string; fixture: Fixture }> {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.startsWith('C-') && f.endsWith('.json'))
    .sort()
    .map((filename) => ({
      filename,
      fixture: JSON.parse(readFileSync(join(FIXTURES_DIR, filename), 'utf8')) as Fixture,
    }));
}

function runOneRail(fixture: Fixture, mode: StrictnessMode, railSubstitution?: string) {
  const warn = vi.fn();
  const pointer = fixture.options?.pointer
    ? railSubstitution
      ? fixture.options.pointer.replace('<rail>', railSubstitution)
      : fixture.options.pointer
    : undefined;
  const expected = fixture.expected.modes[mode];

  if (expected === 'throw') {
    expect(
      () => assertExplicitFinality(fixture.input, { mode, warn, pointer }),
      `${fixture.requirement_id} mode=${mode} expected throw`
    ).toThrow(MapperBoundaryError);

    if (fixture.expected.error_code) {
      try {
        assertExplicitFinality(fixture.input, { mode, warn, pointer });
      } catch (err) {
        expect(err).toBeInstanceOf(MapperBoundaryError);
        expect((err as MapperBoundaryError).code).toBe(fixture.expected.error_code);
      }
    }
    return;
  }

  // pass or warn
  expect(
    () => assertExplicitFinality(fixture.input, { mode, warn, pointer }),
    `${fixture.requirement_id} mode=${mode} expected ${expected}, got throw`
  ).not.toThrow();

  if (expected === 'warn') {
    expect(
      warn.mock.calls.length,
      `${fixture.requirement_id} mode=${mode} expected at least one warning`
    ).toBeGreaterThan(0);
  } else {
    expect(
      warn.mock.calls.length,
      `${fixture.requirement_id} mode=${mode} expected zero warnings (pass)`
    ).toBe(0);
  }
}

describe('Section 26: commerce conformance fixtures', () => {
  const fixtures = loadFixtures();

  it('loads exactly 20 fixtures (C-001..C-020)', () => {
    expect(fixtures.length).toBe(20);
    const ids = fixtures.map((f) => f.fixture.requirement_id);
    for (let i = 1; i <= 20; i += 1) {
      const id = `C-${String(i).padStart(3, '0')}`;
      expect(ids).toContain(id);
    }
  });

  for (const { filename, fixture } of loadFixtures()) {
    const modes: StrictnessMode[] = ['strict', 'interop', 'legacy'];
    for (const mode of modes) {
      it(`${filename}: mode=${mode} matches expected outcome`, () => {
        if (fixture.rails && fixture.rails.length > 0) {
          for (const rail of fixture.rails) {
            runOneRail(fixture, mode, rail);
          }
        } else {
          runOneRail(fixture, mode);
        }
      });
    }
  }
});
