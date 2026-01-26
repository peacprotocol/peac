/**
 * Constants for @peac/net-node
 *
 * Single source of truth for schema versions and configuration constants.
 * Both index.ts (public API) and impl.ts (internal) import from here.
 *
 * STABILITY: Schema version strings are part of the public API surface.
 * Evidence producers persist these in receipts. Changes to version
 * strings indicate wire format changes and follow semver semantics.
 *
 * @module @peac/net-node
 */

/**
 * Event schema version for forward compatibility
 *
 * Events are emitted during fetch lifecycle for audit logging.
 * Increment minor for additive changes, major for breaking changes.
 * @since v0.10.x
 */
export const SAFE_FETCH_EVENT_SCHEMA_VERSION = 'peac-safe-fetch-event/0.1' as const;

/**
 * Evidence schema version for forward compatibility
 *
 * Evidence is the portable, signed-ready artifact returned by safeFetch.
 * This is separate from event schema because evidence and events serve
 * different purposes and may evolve independently.
 *
 * Increment minor for additive changes, major for breaking changes.
 * @since v0.10.x
 */
export const SAFE_FETCH_EVIDENCE_SCHEMA_VERSION = 'peac-safe-fetch-evidence/0.1' as const;

/**
 * P1.4: Bounded audit queue configuration
 *
 * Maximum number of pending audit events before new events are dropped.
 * This prevents microtask blowup if events are generated faster than processed.
 */
export const MAX_PENDING_AUDIT_EVENTS = 1000 as const;
