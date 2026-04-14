/**
 * Conformance fixture runner for ACP delegated-payment observations
 * (specs/conformance/commerce/acp-delegated-payment/). Validates each of
 * the 8 fixtures against the actual mapper across strict, interop, and
 * legacy modes.
 */

import { describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MapperBoundaryError, type StrictnessMode } from '@peac/adapter-core';
import {
  fromACPDelegatedPaymentObservation,
  type ACPDelegatedPaymentObservation,
} from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(
  __dirname,
  '../../../../specs/conformance/commerce/acp-delegated-payment'
);

interface FixtureExpected {
  modes: Record<StrictnessMode, 'pass' | 'warn' | 'throw'>;
  emits_commerce_event?: string | null;
  error_code?: string;
  error_pointer?: string;
}

interface Fixture {
  requirement_id: string;
  description: string;
  guard_module: string;
  function: string;
  input: ACPDelegatedPaymentObservation;
  expected: FixtureExpected;
}

function loadFixtures(): Array<{ filename: string; fixture: Fixture }> {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'manifest.json')
    .sort()
    .map((filename) => ({
      filename,
      fixture: JSON.parse(readFileSync(join(FIXTURES_DIR, filename), 'utf8')) as Fixture,
    }));
}

describe('Section 26 / acp-delegated-payment conformance fixtures', () => {
  const fixtures = loadFixtures();

  it('loads exactly 8 fixtures', () => {
    expect(fixtures.length).toBe(8);
  });

  for (const { filename, fixture } of loadFixtures()) {
    const modes: StrictnessMode[] = ['strict', 'interop', 'legacy'];
    for (const mode of modes) {
      it(`${filename}: mode=${mode} matches expected outcome`, () => {
        const warn = vi.fn();
        const expected = fixture.expected.modes[mode];

        if (expected === 'throw') {
          expect(
            () => fromACPDelegatedPaymentObservation(fixture.input, { mode, warn }),
            `${fixture.requirement_id} mode=${mode} expected throw`
          ).toThrow(MapperBoundaryError);

          if (fixture.expected.error_code || fixture.expected.error_pointer) {
            try {
              fromACPDelegatedPaymentObservation(fixture.input, { mode, warn });
            } catch (err) {
              expect(err).toBeInstanceOf(MapperBoundaryError);
              if (fixture.expected.error_code) {
                expect((err as MapperBoundaryError).code).toBe(fixture.expected.error_code);
              }
              if (fixture.expected.error_pointer) {
                expect((err as MapperBoundaryError).pointer).toBe(fixture.expected.error_pointer);
              }
            }
          }
          return;
        }

        // pass or warn
        const out = fromACPDelegatedPaymentObservation(fixture.input, { mode, warn });
        if (expected === 'warn') {
          expect(
            warn.mock.calls.length,
            `${fixture.requirement_id} mode=${mode} expected at least one warning`
          ).toBeGreaterThan(0);
        } else {
          expect(
            warn.mock.calls.length,
            `${fixture.requirement_id} mode=${mode} expected zero warnings`
          ).toBe(0);
        }

        if (fixture.expected.emits_commerce_event !== undefined) {
          const actual = out.payment.evidence?.commerce_event ?? null;
          expect(actual, `${fixture.requirement_id} mode=${mode} commerce_event mismatch`).toBe(
            fixture.expected.emits_commerce_event
          );
        }
      });
    }
  }
});
