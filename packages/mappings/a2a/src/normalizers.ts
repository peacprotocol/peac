/**
 * A2A v1.0.0 Agent Card normalizers.
 *
 * The v0.3.0 compatibility path (DD-186; `url` top-level field plus
 * kebab-case TaskState mapping) was deprecated in v0.12.3 and removed
 * in v0.13.0. Every accepted Agent Card must expose a non-empty
 * `supportedInterfaces[0].url`; cards without it are rejected. The
 * v0.3.0-to-v1.0.0 TaskState mapping function was removed because its
 * only job was translating kebab-case inputs, which are no longer
 * accepted. TaskState values are now v1.0.0 SCREAMING_SNAKE_CASE
 * strings carried by the caller.
 */

import type { A2AAgentCard, A2ASupportedInterface } from './types';

// ---------------------------------------------------------------------------
// Agent Card normalizer
// ---------------------------------------------------------------------------

/** Normalized Agent Card with a resolved v1.0.0 URL. */
export interface NormalizedAgentCard {
  name: string;
  url: string;
  supportedInterfaces: A2ASupportedInterface[];
  original: A2AAgentCard;
}

/**
 * Returns true if the card satisfies the v1.0.0 Agent Card contract:
 * `supportedInterfaces[0].url` exists and is a non-empty string. Cards
 * that fail this check are rejected by `normalizeAgentCard` (they are
 * not v0.3.0 fallbacks, which are no longer accepted).
 */
export function isV1AgentCard(card: A2AAgentCard): boolean {
  return (
    Array.isArray(card.supportedInterfaces) &&
    card.supportedInterfaces.length > 0 &&
    typeof card.supportedInterfaces[0]?.url === 'string' &&
    card.supportedInterfaces[0].url.length > 0
  );
}

/**
 * Normalize an A2A v1.0.0 Agent Card.
 *
 * Returns a consistent shape with the resolved primary URL. Cards that
 * do not satisfy `isV1AgentCard(...)` return `null` (this includes the
 * legacy v0.3.0 shape with only a top-level `url`, which is no longer
 * supported). Callers receiving `null` should treat the card as invalid
 * and surface a structured error rather than falling back to v0.3.0.
 */
export function normalizeAgentCard(card: A2AAgentCard): NormalizedAgentCard | null {
  if (!isV1AgentCard(card)) return null;
  const iface = card.supportedInterfaces![0]!;
  return {
    name: card.name,
    url: iface.url,
    supportedInterfaces: card.supportedInterfaces!,
    original: card,
  };
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
