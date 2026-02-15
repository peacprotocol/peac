/**
 * @peac/capture-node - Error Types
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Why the spool was marked corrupt. Exposed in SpoolDiagnostics.corruptReason.
 */
export type CorruptReason = 'CHAIN_BROKEN' | 'MALFORMED_JSON' | 'LINE_TOO_LARGE';

// =============================================================================
// Errors
// =============================================================================

/**
 * Thrown when a spool reaches its hard-cap limits (maxEntries or maxFileBytes).
 *
 * CaptureSession catches this and returns E_CAPTURE_STORE_FAILED.
 * The adapter stays running (hooks fire, tools work) -- only new captures are blocked.
 */
export class SpoolFullError extends Error {
  readonly code = 'E_SPOOL_FULL' as const;

  constructor(
    readonly current: number,
    readonly max: number,
    readonly unit: 'entries' | 'bytes'
  ) {
    super(`Spool full: ${current}/${max} ${unit}`);
    this.name = 'SpoolFullError';
  }
}

/**
 * Thrown when spool corruption is detected (linkage, malformed JSON, oversized line).
 *
 * Blocks new appends. Tools still work so the user can export/inspect
 * salvageable data. Operator must take explicit action to clear/reset.
 */
export class SpoolCorruptError extends Error {
  readonly code = 'E_SPOOL_CORRUPT' as const;

  constructor(
    readonly reason: CorruptReason,
    readonly corruptAtSequence?: number,
    readonly details?: string
  ) {
    super(
      `Spool corrupt: ${reason}` +
        (corruptAtSequence !== undefined ? ` at sequence ${corruptAtSequence}` : '') +
        (details ? ` -- ${details}` : '')
    );
    this.name = 'SpoolCorruptError';
  }
}

/**
 * Thrown when a lockfile cannot be acquired (another instance holds it).
 */
export class LockfileError extends Error {
  readonly code = 'E_LOCKFILE' as const;

  constructor(
    readonly lockPath: string,
    readonly holderPid?: number
  ) {
    const pidInfo = holderPid !== undefined ? ` PID: ${holderPid}.` : '';
    super(
      `Another PEAC instance holds the lock.${pidInfo} If stale, delete ${lockPath} or set allowStaleLockBreak: true`
    );
    this.name = 'LockfileError';
  }
}
