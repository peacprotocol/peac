/**
 * CLI Execution Observation Extension Schema
 *
 * Extension namespace: `org.peacprotocol/cli-execution`
 * Record type URI:     `org.peacprotocol/cli-command-execution`
 *
 * Records observational evidence of a local command execution wrapped by
 * the `peac observe-command` / `peac record-command` subcommands. The
 * wrapper is an observer, not a sandbox / permission system / process
 * supervisor / job scheduler / shell orchestrator. Field-level variants
 * (exit_code, signal, timed_out, shell_mode, capture_policy,
 * termination_signal, exit_code_mode) live as fields on this single
 * record type, not as separate record types.
 *
 * Security defaults (hard):
 *   - argv hashed by default (sha256 only)
 *   - stdout/stderr default to length + sha256 + truncated only;
 *     `sample_base64` is emitted only when raw capture is double-opted-in
 *   - stdin defaults to none; raw stdin capture is not a supported mode
 *   - env capture deny-by-default; values hashed unless raw env is double-opted-in
 *   - cwd hashed-by-default; binary path hashed-by-default
 *   - secret-scan ON by default; disabling under raw capture requires the
 *     third unsafe flag (`--unsafe-disable-secret-scan`)
 *   - shell-binary detected without `--shell-mode` is a hard fail
 *
 * Schema consistency invariants:
 *   - command.program records the user-supplied basename only; absolute
 *     paths are governed exclusively by --capture-binary-path and
 *     surface only under binary.path_*.
 *   - All byte-limited string fields use UTF-8 byte-length refinements,
 *     not character counts.
 *   - Env mode is discriminated; entries are required to be a subset of
 *     capture_policy.env_allowlist.
 *   - StreamRef enforces sample_base64 / sample_suppressed_reason mutual
 *     exclusion; matched_pattern_category requires
 *     sample_suppressed_reason and vice-versa; sample_base64 requires
 *     capture_policy.raw_capture_unsafely_allowed; sample_base64 must
 *     be valid base64 and decoded length must not exceed the matching
 *     stream cap.
 *   - Cross-field unsafe consistency: argv_mode=raw requires the raw
 *     capture flag; env.mode=raw requires the raw env flag;
 *     secret_scan=false under raw capture requires
 *     secret_scan_disabled_unsafely.
 *   - approval_ref uses the canonical opaque-ref grammar; binary.shell_ref
 *     uses the canonical sha256 digest schema; shell_mode is biconditional
 *     with the presence of binary.shell_ref.
 *
 * Validation returns the structured error contract:
 *   `{ ok: true, value }` or `{ ok: false, errors: [{ code, path?, message }] }`.
 */
import { z } from 'zod';
import { Sha256DigestSchema } from '../wire-02-extensions/shared-validators.js';
import { OpaqueRefSchema } from '../opaque-ref.js';

export const CLI_EXECUTION_EXTENSION_KEY = 'org.peacprotocol/cli-execution' as const;
export const CLI_COMMAND_EXECUTION_TYPE = 'org.peacprotocol/cli-command-execution' as const;

/** Stable error codes for `validateCliExecution`. */
export const CLI_EXECUTION_ERROR_CODES = {
  shellModeRequired: 'cli.shell_mode_required',
  captureModeInvalid: 'cli.capture_mode_invalid',
  cwdModeInvalid: 'cli.cwd_mode_invalid',
  binaryPathModeInvalid: 'cli.binary_path_mode_invalid',
  envNotInAllowlist: 'cli.env_not_in_allowlist',
  envModeInconsistent: 'cli.env_mode_inconsistent',
  unsafeFlagRequired: 'cli.unsafe_flag_required',
  secretScanDisableRequiresUnsafeFlag: 'cli.secret_scan_disable_requires_unsafe_flag',
  timeoutMsOutOfRange: 'cli.timeout_ms_out_of_range',
  killGraceMsOutOfRange: 'cli.kill_grace_ms_out_of_range',
  exitCodeModeInvalid: 'cli.exit_code_mode_invalid',
  argvTokenTooLong: 'cli.argv_token_too_long',
  streamRefInconsistent: 'cli.stream_ref_inconsistent',
  schemaRejection: 'cli.schema_rejection',
  unknownField: 'cli.unknown_field',
} as const;

const ARGV_MODES = ['hashed', 'redacted', 'raw'] as const;
const CWD_MODES = ['none', 'hashed', 'basename', 'absolute'] as const;
const BINARY_PATH_MODES = ['none', 'hashed', 'absolute'] as const;
const STDIN_MODES = ['none', 'length-only', 'hashed'] as const;
const ENV_MODES = ['hashed', 'raw'] as const;
const EXIT_CODE_MODES = ['child', 'record'] as const;
const EXECUTION_MODES = [
  'deterministic_script',
  'templated_flow',
  'agent_loop',
  'human_step',
  'hybrid',
] as const;
const SECRET_SCAN_CATEGORIES = [
  'bearer-token',
  'api-key',
  'jwt',
  'aws-access-key',
  'generic-high-entropy',
] as const;

/**
 * Numeric ranges (mirrored as constants from `packages/cli/src/lib/cli-limits.ts`;
 * a parity test enforces the two sides stay in sync).
 */
export const CLI_SCHEMA_LIMITS = {
  TIMEOUT_MS_MIN: 1,
  TIMEOUT_MS_MAX: 86_400_000, // 24h
  KILL_GRACE_MS_MIN: 0,
  KILL_GRACE_MS_MAX: 60_000,
  ARGV_BYTES_MIN: 0,
  ARGV_BYTES_MAX: 16_384,
  STDOUT_BYTES_MAX: 65_536,
  STDERR_BYTES_MAX: 65_536,
  ENV_ENTRIES_MAX: 32,
  PROGRAM_TOKEN_BYTES_MAX: 256,
  CWD_BASENAME_BYTES_MAX: 128,
  CWD_ABSOLUTE_BYTES_MAX: 1024,
  BINARY_PATH_ABSOLUTE_BYTES_MAX: 1024,
  BINARY_VERSION_BYTES_MAX: 64,
  ENV_KEY_BYTES_MAX: 256,
  ENV_VALUE_BYTES_MAX: 8_192,
  SIGNAL_NAME_BYTES_MAX: 32,
  PLATFORM_FIELD_BYTES_MAX: 64,
  APPROVAL_REF_BYTES_MAX: 256,
} as const;

const RFC_3339 = z.string().datetime({ offset: true });

/** UTF-8 byte length of a string. */
function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/** Build a Zod string schema with a UTF-8 byte-length max (not character count). */
function bytesMaxString(maxBytes: number, errorTag: string): z.ZodString {
  return z.string().refine((v) => utf8ByteLength(v) <= maxBytes, {
    message: `${errorTag}: must be <= ${maxBytes} UTF-8 bytes`,
  });
}

/**
 * Discriminated union for argv encoding per `--capture-mode`.
 *   hashed   -> argv_sha256 required; argv must be absent
 *   redacted -> argv array required; argv_sha256 must be absent;
 *               only structural tokens preserved (`--flag`, `-f`, `--`);
 *               all other tokens redacted as `<redacted:N>`
 *   raw      -> argv array required; argv_sha256 must be absent;
 *               raw verbatim values; secret-scan suppression markers
 *               (`<secret-suppressed:CATEGORY>`) MAY be present
 */
const ProgramTokenSchema = bytesMaxString(
  CLI_SCHEMA_LIMITS.PROGRAM_TOKEN_BYTES_MAX,
  'command.program'
);

const ArgvTokenSchema = bytesMaxString(CLI_SCHEMA_LIMITS.ARGV_BYTES_MAX, 'command.argv[]');

const ArgvHashedSchema = z
  .object({
    program: ProgramTokenSchema,
    argv_mode: z.literal('hashed'),
    argv_sha256: Sha256DigestSchema,
    argv_token_count: z.number().int().nonnegative().optional(),
  })
  .strict();

const ArgvRedactedSchema = z
  .object({
    program: ProgramTokenSchema,
    argv_mode: z.literal('redacted'),
    argv: z.array(ArgvTokenSchema),
    argv_token_count: z.number().int().nonnegative().optional(),
  })
  .strict();

const ArgvRawSchema = z
  .object({
    program: ProgramTokenSchema,
    argv_mode: z.literal('raw'),
    argv: z.array(ArgvTokenSchema),
    argv_token_count: z.number().int().nonnegative().optional(),
  })
  .strict();

const CommandSchema = z.discriminatedUnion('argv_mode', [
  ArgvHashedSchema,
  ArgvRedactedSchema,
  ArgvRawSchema,
]);

/**
 * Discriminated union for cwd encoding.
 */
const CwdNoneSchema = z.object({ cwd_mode: z.literal('none') }).strict();
const CwdHashedSchema = z
  .object({ cwd_mode: z.literal('hashed'), cwd_sha256: Sha256DigestSchema })
  .strict();
const CwdBasenameSchema = z
  .object({
    cwd_mode: z.literal('basename'),
    cwd_basename: bytesMaxString(CLI_SCHEMA_LIMITS.CWD_BASENAME_BYTES_MAX, 'cwd.cwd_basename'),
  })
  .strict();
const CwdAbsoluteSchema = z
  .object({
    cwd_mode: z.literal('absolute'),
    cwd_absolute: bytesMaxString(CLI_SCHEMA_LIMITS.CWD_ABSOLUTE_BYTES_MAX, 'cwd.cwd_absolute'),
  })
  .strict();

const CwdRefSchema = z.discriminatedUnion('cwd_mode', [
  CwdNoneSchema,
  CwdHashedSchema,
  CwdBasenameSchema,
  CwdAbsoluteSchema,
]);

/**
 * Discriminated union for binary-path encoding. Stat metadata
 * (size_bytes, mode_octal) and content digest (sha256) are optional
 * and may appear regardless of path_mode (subject to top-level merge).
 */
const BinaryPathNoneSchema = z.object({ path_mode: z.literal('none') }).strict();
const BinaryPathHashedSchema = z
  .object({ path_mode: z.literal('hashed'), path_sha256: Sha256DigestSchema })
  .strict();
const BinaryPathAbsoluteSchema = z
  .object({
    path_mode: z.literal('absolute'),
    path_absolute: bytesMaxString(
      CLI_SCHEMA_LIMITS.BINARY_PATH_ABSOLUTE_BYTES_MAX,
      'binary.path_absolute'
    ),
  })
  .strict();

const BinaryPathRefSchema = z.discriminatedUnion('path_mode', [
  BinaryPathNoneSchema,
  BinaryPathHashedSchema,
  BinaryPathAbsoluteSchema,
]);

const BinaryMetaSchema = z
  .object({
    size_bytes: z.number().int().nonnegative().optional(),
    mode_octal: z
      .string()
      .regex(/^[0-7]{4}$/, { message: 'binary.mode_octal must be a 4-digit octal string' })
      .optional(),
    sha256: Sha256DigestSchema.optional(),
    version: bytesMaxString(
      CLI_SCHEMA_LIMITS.BINARY_VERSION_BYTES_MAX,
      'binary.version'
    ).optional(),
    /**
     * shell_ref is always a sha256 digest of the shell binary reference.
     * Path disclosure (when permitted by --capture-binary-path absolute)
     * lives in binary.path_absolute, never in shell_ref.
     */
    shell_ref: Sha256DigestSchema.optional(),
  })
  .strict();

/**
 * Build the combined `binary` object: discriminated path-mode merged with
 * optional stat metadata. zod requires a tagged union here; we expose it
 * via `z.intersection`.
 */
const BinarySchema = z.intersection(BinaryPathRefSchema, BinaryMetaSchema);

/**
 * stdin reference (none / length-only / hashed). NEVER any sample.
 * NEVER a raw mode for stdin.
 */
const StdinNoneSchema = z.object({ mode: z.literal('none') }).strict();
const StdinLengthOnlySchema = z
  .object({
    mode: z.literal('length-only'),
    length: z.number().int().nonnegative(),
    truncated: z.boolean(),
  })
  .strict();
const StdinHashedSchema = z
  .object({
    mode: z.literal('hashed'),
    length: z.number().int().nonnegative(),
    sha256: Sha256DigestSchema,
    truncated: z.boolean(),
  })
  .strict();

const StdinRefSchema = z.discriminatedUnion('mode', [
  StdinNoneSchema,
  StdinLengthOnlySchema,
  StdinHashedSchema,
]);

/**
 * stdout / stderr reference: always length + sha256 + truncated.
 * Consistency invariants:
 *   - sample_base64 and sample_suppressed_reason are mutually exclusive
 *   - matched_pattern_category requires sample_suppressed_reason
 *   - sample_suppressed_reason requires matched_pattern_category
 *   - sample_base64 must be valid base64
 *   - sample_base64 requires capture_policy.raw_capture_unsafely_allowed
 *     and decoded length must not exceed the matching stream cap
 *     (cross-field invariants; checked at the top level via superRefine)
 */
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

function isValidBase64(value: string): boolean {
  if (value.length % 4 !== 0) return false;
  if (!BASE64_PATTERN.test(value)) return false;
  return true;
}

const StreamRefSchema = z
  .object({
    length: z.number().int().nonnegative(),
    sha256: Sha256DigestSchema,
    truncated: z.boolean(),
    sample_base64: z
      .string()
      .refine(isValidBase64, {
        message: 'cli.schema_rejection: sample_base64 must be valid base64',
      })
      .optional(),
    sample_suppressed_reason: z.literal('secret_pattern_detected').optional(),
    matched_pattern_category: z.enum(SECRET_SCAN_CATEGORIES).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const hasSample = v.sample_base64 !== undefined;
    const hasReason = v.sample_suppressed_reason !== undefined;
    const hasCategory = v.matched_pattern_category !== undefined;

    if (hasSample && hasReason) {
      ctx.addIssue({
        code: 'custom',
        message:
          'cli.stream_ref_inconsistent: sample_base64 and sample_suppressed_reason are mutually exclusive',
        path: ['sample_suppressed_reason'],
      });
    }
    if (hasReason && !hasCategory) {
      ctx.addIssue({
        code: 'custom',
        message:
          'cli.stream_ref_inconsistent: sample_suppressed_reason requires matched_pattern_category',
        path: ['matched_pattern_category'],
      });
    }
    if (hasCategory && !hasReason) {
      ctx.addIssue({
        code: 'custom',
        message:
          'cli.stream_ref_inconsistent: matched_pattern_category requires sample_suppressed_reason',
        path: ['sample_suppressed_reason'],
      });
    }
  });

/**
 * Per-key env entry, discriminated by the parent `env.mode`. The
 * discrimination is enforced at the env-block level via superRefine
 * because the discriminator lives outside the entry.
 *
 * Env mode invariants:
 *   - env.mode = hashed: every entry must have value_sha256 and must
 *     not have value
 *   - env.mode = raw:    every entry must have value and must not have
 *     value_sha256; capture_policy.raw_env_unsafely_allowed must be true
 */
const EnvEntrySchema = z
  .object({
    value_sha256: Sha256DigestSchema.optional(),
    value: bytesMaxString(CLI_SCHEMA_LIMITS.ENV_VALUE_BYTES_MAX, 'env.entries[].value').optional(),
  })
  .strict();

const EnvBlockSchema = z
  .object({
    mode: z.enum(ENV_MODES),
    entries: z.record(
      bytesMaxString(CLI_SCHEMA_LIMITS.ENV_KEY_BYTES_MAX, 'env.entries[key]'),
      EnvEntrySchema
    ),
  })
  .strict()
  .superRefine((v, ctx) => {
    const keys = Object.keys(v.entries);
    if (keys.length > CLI_SCHEMA_LIMITS.ENV_ENTRIES_MAX) {
      ctx.addIssue({
        code: 'custom',
        message: `env.entries.size must be <= ${CLI_SCHEMA_LIMITS.ENV_ENTRIES_MAX}`,
        path: ['entries'],
      });
    }
    for (const [key, entry] of Object.entries(v.entries)) {
      const hasHash = entry.value_sha256 !== undefined;
      const hasValue = entry.value !== undefined;
      if (v.mode === 'hashed') {
        if (!hasHash || hasValue) {
          ctx.addIssue({
            code: 'custom',
            message:
              'cli.env_mode_inconsistent: env.mode=hashed entries must have value_sha256 only',
            path: ['entries', key],
          });
        }
      } else {
        // raw
        if (!hasValue || hasHash) {
          ctx.addIssue({
            code: 'custom',
            message: 'cli.env_mode_inconsistent: env.mode=raw entries must have value only',
            path: ['entries', key],
          });
        }
      }
    }
  });

/**
 * Capture policy: recorded inside the record so downstream verifiers can
 * audit the capture configuration without re-running the command.
 */
const CapturePolicySchema = z
  .object({
    stdout_max_bytes: z.number().int().min(0).max(CLI_SCHEMA_LIMITS.STDOUT_BYTES_MAX),
    stderr_max_bytes: z.number().int().min(0).max(CLI_SCHEMA_LIMITS.STDERR_BYTES_MAX),
    argv_max_bytes: z
      .number()
      .int()
      .min(CLI_SCHEMA_LIMITS.ARGV_BYTES_MIN)
      .max(CLI_SCHEMA_LIMITS.ARGV_BYTES_MAX),
    env_allowlist: z
      .array(bytesMaxString(CLI_SCHEMA_LIMITS.ENV_KEY_BYTES_MAX, 'capture_policy.env_allowlist[]'))
      .max(CLI_SCHEMA_LIMITS.ENV_ENTRIES_MAX),
    stdin_mode: z.enum(STDIN_MODES),
    cwd_mode: z.enum(CWD_MODES),
    binary_path_mode: z.enum(BINARY_PATH_MODES),
    secret_scan: z.boolean(),
    raw_capture_unsafely_allowed: z.boolean(),
    raw_env_unsafely_allowed: z.boolean(),
    secret_scan_disabled_unsafely: z.boolean(),
    timeout_ms: z
      .number()
      .int()
      .min(CLI_SCHEMA_LIMITS.TIMEOUT_MS_MIN)
      .max(CLI_SCHEMA_LIMITS.TIMEOUT_MS_MAX),
    kill_grace_ms: z
      .number()
      .int()
      .min(CLI_SCHEMA_LIMITS.KILL_GRACE_MS_MIN)
      .max(CLI_SCHEMA_LIMITS.KILL_GRACE_MS_MAX),
    exit_code_mode: z.enum(EXIT_CODE_MODES),
  })
  .strict();

const PlatformSchema = z
  .object({
    os: bytesMaxString(CLI_SCHEMA_LIMITS.PLATFORM_FIELD_BYTES_MAX, 'platform.os'),
    arch: bytesMaxString(CLI_SCHEMA_LIMITS.PLATFORM_FIELD_BYTES_MAX, 'platform.arch'),
    peac_cli_version: bytesMaxString(
      CLI_SCHEMA_LIMITS.PLATFORM_FIELD_BYTES_MAX,
      'platform.peac_cli_version'
    ),
  })
  .strict();

const SurfaceSchema = z
  .object({
    kind: z.literal('cli'),
  })
  .strict();

/**
 * The full CLI execution observation record.
 *
 * Top-level superRefine enforces the cross-field invariants:
 *   - sample_base64 on stdout/stderr requires
 *     capture_policy.raw_capture_unsafely_allowed = true
 *   - decoded sample length must not exceed the matching stream cap
 *   - command.argv_mode = raw requires
 *     capture_policy.raw_capture_unsafely_allowed = true
 *   - env.mode = raw requires
 *     capture_policy.raw_env_unsafely_allowed = true
 *   - capture_policy.secret_scan = false combined with
 *     capture_policy.raw_capture_unsafely_allowed = true requires
 *     capture_policy.secret_scan_disabled_unsafely = true
 *   - env.entries keys must be a subset of
 *     capture_policy.env_allowlist
 *   - shell_mode = true requires binary.shell_ref present and
 *     binary.path_mode != 'none'; shell_mode = false requires
 *     binary.shell_ref absent. Under binary.path_mode = 'hashed',
 *     binary.shell_ref must equal binary.path_sha256 so the shell
 *     reference is a single canonical digest with a well-defined input.
 */
export const CliExecutionSchema = z
  .object({
    /** Canonical CLI execution record type URI (single type per profile). */
    type: z.literal(CLI_COMMAND_EXECUTION_TYPE),

    surface: SurfaceSchema,

    /** Discriminated by `argv_mode`. */
    command: CommandSchema,

    /** Discriminated by `cwd_mode`. */
    cwd: CwdRefSchema,

    /** Binary path discriminator + optional stat metadata + optional content digest. */
    binary: BinarySchema,

    stdin_ref: StdinRefSchema,
    stdout_ref: StreamRefSchema,
    stderr_ref: StreamRefSchema,
    env: EnvBlockSchema,

    started_at: RFC_3339,
    finished_at: RFC_3339,
    duration_ms: z.number().int().nonnegative(),

    exit_code: z.number().int(),
    /** OS-reported child exit signal (POSIX). Distinct from `termination_signal`. */
    signal: bytesMaxString(CLI_SCHEMA_LIMITS.SIGNAL_NAME_BYTES_MAX, 'signal').optional(),

    /** True if the wrapper sent termination signals because `--timeout-ms` elapsed. */
    timed_out: z.boolean(),
    timeout_ms: z
      .number()
      .int()
      .min(CLI_SCHEMA_LIMITS.TIMEOUT_MS_MIN)
      .max(CLI_SCHEMA_LIMITS.TIMEOUT_MS_MAX),
    kill_grace_ms: z
      .number()
      .int()
      .min(CLI_SCHEMA_LIMITS.KILL_GRACE_MS_MIN)
      .max(CLI_SCHEMA_LIMITS.KILL_GRACE_MS_MAX),
    /** Signal sent BY THE WRAPPER after timeout (e.g., "SIGTERM" / "SIGKILL"). */
    termination_signal: bytesMaxString(
      CLI_SCHEMA_LIMITS.SIGNAL_NAME_BYTES_MAX,
      'termination_signal'
    ).optional(),

    exit_code_mode: z.enum(EXIT_CODE_MODES),

    /** True if the user supplied `--shell-mode`. The wrapper does NOT rewrite the command. */
    shell_mode: z.boolean(),

    execution_mode: z.enum(EXECUTION_MODES),

    capture_policy: CapturePolicySchema,
    platform: PlatformSchema,

    policy_digest: Sha256DigestSchema.optional(),
    config_digest: Sha256DigestSchema.optional(),
    /** Opaque-reference grammar (multi-prefix); never plain strings. */
    approval_ref: OpaqueRefSchema.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    // command.program must be basename-only (no path separators).
    if (/[\\/]/.test(v.command.program)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'cli.schema_rejection: command.program must be basename-only (no path separators); use --capture-binary-path to disclose paths',
        path: ['command', 'program'],
      });
    }

    // command.argv_mode = raw requires raw_capture_unsafely_allowed.
    if (v.command.argv_mode === 'raw' && !v.capture_policy.raw_capture_unsafely_allowed) {
      ctx.addIssue({
        code: 'custom',
        message:
          'cli.unsafe_flag_required: command.argv_mode=raw requires capture_policy.raw_capture_unsafely_allowed=true',
        path: ['command', 'argv_mode'],
      });
    }

    // env.mode = raw requires raw_env_unsafely_allowed.
    if (v.env.mode === 'raw' && !v.capture_policy.raw_env_unsafely_allowed) {
      ctx.addIssue({
        code: 'custom',
        message:
          'cli.unsafe_flag_required: env.mode=raw requires capture_policy.raw_env_unsafely_allowed=true',
        path: ['env', 'mode'],
      });
    }

    // secret_scan=false under raw capture requires secret_scan_disabled_unsafely.
    if (
      v.capture_policy.raw_capture_unsafely_allowed &&
      !v.capture_policy.secret_scan &&
      !v.capture_policy.secret_scan_disabled_unsafely
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'cli.secret_scan_disable_requires_unsafe_flag: secret_scan=false under raw capture requires capture_policy.secret_scan_disabled_unsafely=true',
        path: ['capture_policy', 'secret_scan_disabled_unsafely'],
      });
    }

    // sample_base64 requires raw_capture_unsafely_allowed AND decoded
    // length must not exceed the matching stream cap.
    for (const stream of ['stdout_ref', 'stderr_ref'] as const) {
      const ref = v[stream];
      if (ref.sample_base64 !== undefined) {
        if (!v.capture_policy.raw_capture_unsafely_allowed) {
          ctx.addIssue({
            code: 'custom',
            message:
              'cli.unsafe_flag_required: sample_base64 requires capture_policy.raw_capture_unsafely_allowed=true',
            path: [stream, 'sample_base64'],
          });
        }
        const cap =
          stream === 'stdout_ref'
            ? v.capture_policy.stdout_max_bytes
            : v.capture_policy.stderr_max_bytes;
        // Decoded byte length (base64 already validated; safe to decode size).
        const padding = ref.sample_base64.endsWith('==')
          ? 2
          : ref.sample_base64.endsWith('=')
            ? 1
            : 0;
        const decodedBytes = (ref.sample_base64.length / 4) * 3 - padding;
        if (decodedBytes > cap) {
          ctx.addIssue({
            code: 'custom',
            message: `cli.stream_ref_inconsistent: ${stream}.sample_base64 decoded length (${decodedBytes}) exceeds capture_policy cap (${cap})`,
            path: [stream, 'sample_base64'],
          });
        }
      }
    }

    // env.entries keys must be a subset of capture_policy.env_allowlist.
    const allow = new Set(v.capture_policy.env_allowlist);
    for (const key of Object.keys(v.env.entries)) {
      if (!allow.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: `cli.env_not_in_allowlist: env entry '${key}' is not in capture_policy.env_allowlist`,
          path: ['env', 'entries', key],
        });
      }
    }

    // shell_mode is biconditional with the presence of binary.shell_ref,
    // and shell_mode=true requires binary.path_mode != none so that the
    // wrapper has a defined source for the digest.
    const hasShellRef = v.binary.shell_ref !== undefined;
    if (v.shell_mode && !hasShellRef) {
      ctx.addIssue({
        code: 'custom',
        message: 'cli.schema_rejection: shell_mode=true requires binary.shell_ref to be present',
        path: ['binary', 'shell_ref'],
      });
    }
    if (!v.shell_mode && hasShellRef) {
      ctx.addIssue({
        code: 'custom',
        message: 'cli.schema_rejection: shell_mode=false requires binary.shell_ref to be absent',
        path: ['binary', 'shell_ref'],
      });
    }
    if (v.shell_mode && v.binary.path_mode === 'none') {
      ctx.addIssue({
        code: 'custom',
        message: 'cli.schema_rejection: shell_mode=true requires binary.path_mode != none',
        path: ['binary', 'path_mode'],
      });
    }
    // Under hashed binary path mode, shell_ref must equal binary.path_sha256
    // so the shell reference is a single canonical digest with a well-defined
    // input (the resolved shell binary path).
    if (
      v.shell_mode &&
      v.binary.path_mode === 'hashed' &&
      hasShellRef &&
      v.binary.shell_ref !== v.binary.path_sha256
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'cli.schema_rejection: under binary.path_mode=hashed, binary.shell_ref must equal binary.path_sha256',
        path: ['binary', 'shell_ref'],
      });
    }

    // Mode-consistency between top-level fields and capture_policy.
    if (v.capture_policy.stdin_mode !== v.stdin_ref.mode) {
      ctx.addIssue({
        code: 'custom',
        message: `cli.schema_rejection: capture_policy.stdin_mode (${v.capture_policy.stdin_mode}) does not match stdin_ref.mode (${v.stdin_ref.mode})`,
        path: ['capture_policy', 'stdin_mode'],
      });
    }
    if (v.capture_policy.cwd_mode !== v.cwd.cwd_mode) {
      ctx.addIssue({
        code: 'custom',
        message: `cli.schema_rejection: capture_policy.cwd_mode (${v.capture_policy.cwd_mode}) does not match cwd.cwd_mode (${v.cwd.cwd_mode})`,
        path: ['capture_policy', 'cwd_mode'],
      });
    }
    if (v.capture_policy.binary_path_mode !== v.binary.path_mode) {
      ctx.addIssue({
        code: 'custom',
        message: `cli.schema_rejection: capture_policy.binary_path_mode (${v.capture_policy.binary_path_mode}) does not match binary.path_mode (${v.binary.path_mode})`,
        path: ['capture_policy', 'binary_path_mode'],
      });
    }
    if (v.capture_policy.exit_code_mode !== v.exit_code_mode) {
      ctx.addIssue({
        code: 'custom',
        message: `cli.schema_rejection: capture_policy.exit_code_mode (${v.capture_policy.exit_code_mode}) does not match exit_code_mode (${v.exit_code_mode})`,
        path: ['capture_policy', 'exit_code_mode'],
      });
    }
  });

export type CliExecutionObservation = z.infer<typeof CliExecutionSchema>;

export interface CliValidationError {
  code: string;
  path?: string;
  message: string;
}

export type CliValidationResult =
  | { ok: true; value: CliExecutionObservation }
  | { ok: false; errors: CliValidationError[] };

/**
 * Validate a CLI execution observation payload.
 *
 * Returns a structured result with stable error codes for downstream
 * conformance vector assertions. Mirrors the `validateA2AHandoff` shape.
 */
export function validateCliExecution(data: unknown): CliValidationResult {
  const preflight: CliValidationError[] = [];

  // Stable-code preflight: surface high-signal failures with their stable
  // codes (independent of zod's per-field message text).
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    // shell_mode must be present and boolean (acknowledgement, not synthesis).
    if (!Object.prototype.hasOwnProperty.call(obj, 'shell_mode')) {
      preflight.push({
        code: CLI_EXECUTION_ERROR_CODES.shellModeRequired,
        path: 'shell_mode',
        message: 'shell_mode field is required',
      });
    }

    // exit_code_mode must be present and one of {child, record}.
    const ecm = obj.exit_code_mode;
    if (ecm !== undefined && ecm !== null && !EXIT_CODE_MODES.includes(ecm as 'child' | 'record')) {
      preflight.push({
        code: CLI_EXECUTION_ERROR_CODES.exitCodeModeInvalid,
        path: 'exit_code_mode',
        message: `exit_code_mode must be one of: ${EXIT_CODE_MODES.join(', ')}`,
      });
    }

    const command = obj.command;
    if (command && typeof command === 'object' && !Array.isArray(command)) {
      const argvMode = (command as Record<string, unknown>).argv_mode;
      if (
        argvMode !== undefined &&
        argvMode !== null &&
        !ARGV_MODES.includes(argvMode as 'hashed' | 'redacted' | 'raw')
      ) {
        preflight.push({
          code: CLI_EXECUTION_ERROR_CODES.captureModeInvalid,
          path: 'command.argv_mode',
          message: `command.argv_mode must be one of: ${ARGV_MODES.join(', ')}`,
        });
      }
    }
  }

  const result = CliExecutionSchema.safeParse(data);
  if (result.success && preflight.length === 0) {
    return { ok: true, value: result.data };
  }

  const errors: CliValidationError[] = [...preflight];
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      let code: string = CLI_EXECUTION_ERROR_CODES.schemaRejection;

      // Custom-message-based code mapping (superRefine invariants) takes
      // precedence over path-prefix mapping so a custom invariant violation
      // is never miscategorized by its location in the tree.
      if (issue.code === 'unrecognized_keys') {
        code = CLI_EXECUTION_ERROR_CODES.unknownField;
      } else if (issue.message.startsWith('cli.unsafe_flag_required')) {
        code = CLI_EXECUTION_ERROR_CODES.unsafeFlagRequired;
      } else if (issue.message.startsWith('cli.secret_scan_disable_requires_unsafe_flag')) {
        code = CLI_EXECUTION_ERROR_CODES.secretScanDisableRequiresUnsafeFlag;
      } else if (issue.message.startsWith('cli.env_mode_inconsistent')) {
        code = CLI_EXECUTION_ERROR_CODES.envModeInconsistent;
      } else if (issue.message.startsWith('cli.env_not_in_allowlist')) {
        code = CLI_EXECUTION_ERROR_CODES.envNotInAllowlist;
      } else if (issue.message.startsWith('cli.stream_ref_inconsistent')) {
        code = CLI_EXECUTION_ERROR_CODES.streamRefInconsistent;
      } else if (issue.message.startsWith('cli.schema_rejection')) {
        code = CLI_EXECUTION_ERROR_CODES.schemaRejection;
      } else if (path === 'command.argv_mode' || path.startsWith('command.argv')) {
        code = CLI_EXECUTION_ERROR_CODES.captureModeInvalid;
      } else if (path.startsWith('cwd.') || path === 'cwd') {
        code = CLI_EXECUTION_ERROR_CODES.cwdModeInvalid;
      } else if (path.startsWith('binary.') || path === 'binary') {
        code = CLI_EXECUTION_ERROR_CODES.binaryPathModeInvalid;
      } else if (path === 'timeout_ms' || path === 'capture_policy.timeout_ms') {
        code = CLI_EXECUTION_ERROR_CODES.timeoutMsOutOfRange;
      } else if (path === 'kill_grace_ms' || path === 'capture_policy.kill_grace_ms') {
        code = CLI_EXECUTION_ERROR_CODES.killGraceMsOutOfRange;
      } else if (path === 'exit_code_mode' || path === 'capture_policy.exit_code_mode') {
        code = CLI_EXECUTION_ERROR_CODES.exitCodeModeInvalid;
      }

      const dup = errors.some((e) => e.code === code && e.path === path);
      if (!dup) {
        errors.push({
          code,
          path: path || undefined,
          message: issue.message,
        });
      }
    }
  }

  return { ok: false, errors };
}
