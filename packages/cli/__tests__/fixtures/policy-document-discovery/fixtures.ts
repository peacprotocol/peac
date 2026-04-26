/**
 * Parity-test fixtures for policy-document-discovery.
 *
 * The fixture data lives in `fixtures.mjs` so the snapshot-capture script
 * can consume it via dynamic import without a TypeScript transpile step
 * (and without eval / new-Function). This file is the typed surface for
 * the test suite; both files MUST stay in lock-step.
 */

// Re-export the fixture array under its TypeScript signature.
// The .mjs file uses pure ECMAScript and can be dynamically imported by
// scripts/release-tools that do not run through tsc / vitest.
import { PARITY_FIXTURES as RAW_PARITY_FIXTURES } from './fixtures.mjs';

export interface ParityFixture {
  readonly name: string;
  readonly text: string;
  readonly description: string;
}

export const PARITY_FIXTURES: readonly ParityFixture[] = RAW_PARITY_FIXTURES;
