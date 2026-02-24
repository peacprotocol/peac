/**
 * Signal Priority Resolution (DD-137)
 *
 * Resolves signals from multiple sources using precedence rules.
 * tdmrep.json > Content-Usage > robots.txt
 */

import type { ContentSignalEntry, ContentPurpose, SignalDecision, SignalSource } from './types.js';
import { SOURCE_PRECEDENCE } from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve signals from multiple sources using DD-137 precedence.
 *
 * Per DD-137, when multiple sources provide signals for the same purpose,
 * the highest-priority source with a definitive signal (allow or deny) wins.
 * If all sources return unspecified, the resolved signal is unspecified.
 *
 * @param entries - All signal entries from all sources
 * @returns Resolved entries (one per purpose, highest-priority source wins)
 */
export function resolveSignals(entries: ContentSignalEntry[]): ContentSignalEntry[] {
  // Group entries by purpose
  const byPurpose = new Map<ContentPurpose, ContentSignalEntry[]>();
  for (const entry of entries) {
    const list = byPurpose.get(entry.purpose) || [];
    list.push(entry);
    byPurpose.set(entry.purpose, list);
  }

  const resolved: ContentSignalEntry[] = [];

  for (const [purpose, purposeEntries] of byPurpose) {
    // Sort by source precedence (lower index = higher priority)
    const sorted = [...purposeEntries].sort((a, b) => {
      const aIdx = SOURCE_PRECEDENCE.indexOf(a.source);
      const bIdx = SOURCE_PRECEDENCE.indexOf(b.source);
      return aIdx - bIdx;
    });

    // Find first definitive signal (allow or deny)
    let winner: ContentSignalEntry | null = null;
    for (const entry of sorted) {
      if (entry.decision === 'allow' || entry.decision === 'deny') {
        winner = entry;
        break;
      }
    }

    if (winner) {
      resolved.push(winner);
    } else {
      // All unspecified: use highest-priority source's entry
      resolved.push(sorted[0]);
    }
  }

  return resolved;
}

/**
 * Get the precedence index for a signal source.
 *
 * Lower number = higher priority. Returns -1 for unknown sources.
 */
export function getSourcePrecedence(source: SignalSource): number {
  return SOURCE_PRECEDENCE.indexOf(source);
}

/**
 * Check if source A has higher priority than source B.
 */
export function hasHigherPriority(a: SignalSource, b: SignalSource): boolean {
  const aIdx = SOURCE_PRECEDENCE.indexOf(a);
  const bIdx = SOURCE_PRECEDENCE.indexOf(b);
  return aIdx < bIdx;
}

/**
 * Get the effective decision for a specific purpose from resolved signals.
 *
 * @returns The signal decision, or 'unspecified' if no signal for the purpose
 */
export function getDecisionForPurpose(
  resolved: ContentSignalEntry[],
  purpose: ContentPurpose
): SignalDecision {
  const entry = resolved.find((e) => e.purpose === purpose);
  return entry?.decision ?? 'unspecified';
}
