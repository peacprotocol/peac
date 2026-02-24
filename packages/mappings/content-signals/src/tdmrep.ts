/**
 * tdmrep.json Parser (EU TDM Directive 2019/790, Art. 4)
 *
 * Parses tdmrep.json content for EU Text and Data Mining reservation signals.
 * Receives pre-fetched JSON content (no network I/O, DD-55).
 */

import type { ContentSignalEntry, SignalDecision } from './types.js';
import { MAX_TDMREP_SIZE } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TdmrepData {
  'tdm-reservation'?: number;
  'tdm-policy'?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse tdmrep.json content and extract TDM reservation signals.
 *
 * EU Directive 2019/790, Article 4:
 * - tdm-reservation: 0 = no reservation (allow TDM), 1 = reserved (deny TDM)
 * - tdm-policy: URL to machine-readable license terms
 *
 * @param content - Raw JSON string of tdmrep.json (pre-fetched)
 * @returns Array of ContentSignalEntry for TDM purposes
 */
export function parseTdmrep(content: string): ContentSignalEntry[] {
  if (content.length > MAX_TDMREP_SIZE) {
    return [];
  }

  let data: TdmrepData;
  try {
    data = JSON.parse(content) as TdmrepData;
  } catch {
    // Malformed JSON: return unspecified
    return [];
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return [];
  }

  const reservation = data['tdm-reservation'];

  let decision: SignalDecision;
  let rawValue: string;

  if (reservation === 1) {
    decision = 'deny';
    rawValue = 'tdm-reservation: 1';
  } else if (reservation === 0) {
    decision = 'allow';
    rawValue = 'tdm-reservation: 0';
  } else {
    // Absent or invalid value
    return [];
  }

  const entries: ContentSignalEntry[] = [
    {
      purpose: 'tdm',
      decision,
      source: 'tdmrep-json',
      raw_value: rawValue,
    },
    {
      purpose: 'ai-training',
      decision,
      source: 'tdmrep-json',
      raw_value: rawValue,
    },
  ];

  // If a tdm-policy URL is present, include it in the raw_value
  if (typeof data['tdm-policy'] === 'string') {
    for (const entry of entries) {
      entry.raw_value = `${entry.raw_value}, tdm-policy: ${data['tdm-policy']}`;
    }
  }

  return entries;
}
