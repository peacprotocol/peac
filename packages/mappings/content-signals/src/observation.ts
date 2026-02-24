/**
 * Content Signal Observation Factory
 *
 * Creates ContentSignalObservation objects from parsed signals.
 */

import type {
  ContentSignalObservation,
  ContentSignalEntry,
  SignalSource,
  ContentPurpose,
} from './types.js';
import { parseRobotsTxt } from './robots.js';
import { parseTdmrep } from './tdmrep.js';
import { parseContentUsage } from './content-usage.js';
import { resolveSignals } from './resolve.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input for creating an observation */
export interface CreateObservationInput {
  /** Target URI the signals apply to */
  target_uri: string;
  /** Pre-fetched robots.txt content (optional) */
  robots_txt?: string;
  /** Pre-fetched tdmrep.json content (optional) */
  tdmrep_json?: string;
  /** Pre-fetched Content-Usage header value (optional) */
  content_usage?: string;
  /** Content digest for integrity binding (optional) */
  digest?: { alg: 'sha-256'; val: string };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a ContentSignalObservation from pre-fetched signal sources.
 *
 * All inputs are pre-fetched content (no network I/O, DD-55).
 * Signals are parsed from each source and resolved using DD-137 precedence.
 *
 * @param input - Pre-fetched signal sources
 * @returns ContentSignalObservation with resolved signals
 */
export function createObservation(input: CreateObservationInput): ContentSignalObservation {
  const allEntries: ContentSignalEntry[] = [];
  const sourcesChecked: SignalSource[] = [];

  // Parse each available source
  if (input.tdmrep_json !== undefined) {
    sourcesChecked.push('tdmrep-json');
    const entries = parseTdmrep(input.tdmrep_json);
    allEntries.push(...entries);
  }

  if (input.content_usage !== undefined) {
    sourcesChecked.push('content-usage-header');
    const result = parseContentUsage(input.content_usage);
    allEntries.push(...result.entries);
  }

  if (input.robots_txt !== undefined) {
    sourcesChecked.push('robots-txt');
    const entries = parseRobotsTxt(input.robots_txt);
    allEntries.push(...entries);
  }

  // Resolve signals using DD-137 precedence
  const resolved = resolveSignals(allEntries);

  return {
    observed_at: new Date().toISOString(),
    target_uri: input.target_uri,
    signals: resolved,
    digest: input.digest,
    sources_checked: sourcesChecked,
  };
}
