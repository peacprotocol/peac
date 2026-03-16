/**
 * A2A v1.0.0 transition normalizers (DD-186).
 *
 * Accept both v0.3.0 and v1.0.0 Agent Card, TaskState, and Part shapes.
 * v0.3.0 inputs emit a deprecation warning. v0.3.0 removal at v0.13.0.
 */

import type { A2AAgentCard, A2ASupportedInterface } from './types';
import { TASK_STATE_V03_TO_V1 } from './types';

// ---------------------------------------------------------------------------
// Deprecation warning (fires once per process)
// ---------------------------------------------------------------------------

let v03DeprecationWarned = false;

function warnV03Deprecated(context: string): void {
  if (!v03DeprecationWarned) {
    v03DeprecationWarned = true;
    process.emitWarning(
      `A2A v0.3.0 ${context} detected. Migrate to v1.0.0. ` +
        'v0.3.0 support will be removed in @peac/mappings-a2a v0.13.0.',
      'DeprecationWarning'
    );
  }
}

/** Reset deprecation warning state (for testing only) */
export function _resetDeprecationWarning(): void {
  v03DeprecationWarned = false;
}

// ---------------------------------------------------------------------------
// Agent Card normalizer
// ---------------------------------------------------------------------------

/** Normalized Agent Card with a resolved URL regardless of version */
export interface NormalizedAgentCard {
  name: string;
  url: string;
  version: '0.3.0' | '1.0.0';
  supportedInterfaces: A2ASupportedInterface[];
  original: A2AAgentCard;
}

/**
 * Detect whether an Agent Card uses v1.0.0 structure.
 *
 * v1.0.0 cards have `supportedInterfaces[]` instead of top-level `url`.
 */
export function isV1AgentCard(card: A2AAgentCard): boolean {
  return (
    Array.isArray(card.supportedInterfaces) &&
    card.supportedInterfaces.length > 0 &&
    typeof card.supportedInterfaces[0]?.url === 'string'
  );
}

/**
 * Normalize an A2A Agent Card from either v0.3.0 or v1.0.0 format.
 *
 * Returns a consistent shape with a resolved URL. v0.3.0 cards emit
 * a deprecation warning on first encounter.
 *
 * Returns null if the card has neither a valid `url` nor valid
 * `supportedInterfaces[0].url`.
 */
export function normalizeAgentCard(card: A2AAgentCard): NormalizedAgentCard | null {
  if (isV1AgentCard(card)) {
    const iface = card.supportedInterfaces![0]!;
    return {
      name: card.name,
      url: iface.url,
      version: '1.0.0',
      supportedInterfaces: card.supportedInterfaces!,
      original: card,
    };
  }

  if (typeof card.url === 'string') {
    warnV03Deprecated('Agent Card (top-level url)');
    return {
      name: card.name,
      url: card.url,
      version: '0.3.0',
      supportedInterfaces: [
        {
          url: card.url,
          protocolBinding: 'http+json',
          protocolVersion: '0.3.0',
        },
      ],
      original: card,
    };
  }

  return null;
}

/**
 * Select the best interface from a v1.0.0 Agent Card.
 *
 * Prefers the interface with the highest protocolVersion, then the first
 * entry as tiebreaker.
 */
export function selectBestInterface(
  interfaces: A2ASupportedInterface[]
): A2ASupportedInterface | null {
  if (interfaces.length === 0) return null;
  return [...interfaces].sort((a, b) =>
    b.protocolVersion.localeCompare(a.protocolVersion, undefined, { numeric: true })
  )[0]!;
}

// ---------------------------------------------------------------------------
// TaskState normalizer
// ---------------------------------------------------------------------------

/**
 * Normalize a task state string from v0.3.0 or v1.0.0 format.
 *
 * v0.3.0 uses kebab-case (e.g., "working"), v1.0.0 uses prefixed
 * SCREAMING_SNAKE_CASE (e.g., "TASK_STATE_WORKING").
 *
 * Returns the v1.0.0 canonical form. Unrecognized values pass through
 * unchanged.
 */
export function normalizeTaskState(state: string): string {
  const v1 = TASK_STATE_V03_TO_V1[state];
  if (v1) {
    warnV03Deprecated('TaskState value');
    return v1;
  }
  return state;
}
