/**
 * Shared command-option validation for `observe command` and
 * `record command`. Single source of truth for:
 *
 *   - numeric flag range / NaN-safe checks
 *   - env-allowlist key grammar + byte cap
 *   - record-only digest / opaque-ref preflights
 *   - raw capture / raw env / secret-scan unsafe-flag pairing
 *   - shell-binary detection acknowledgement
 *   - raw argv per-token cap
 *
 * Both commands consume `validateCoreCommandOptions` so their
 * preflight semantics never drift. Record-command additionally calls
 * `validateSigningOptions` for the signing-input mutex and canonical
 * issuer URL check.
 */

import { OpaqueRefSchema, isCanonicalIss } from '@peac/schema';
import { CLI_LIMITS, isShellBinary } from './cli-limits.js';
import type {
  ArgvMode,
  CwdMode,
  BinaryPathMode,
  EnvMode,
  StdinMode,
  ExitCodeMode,
  ExecutionMode,
} from './observation-builder.js';

/**
 * Stable error codes shared by observe command and record command. The
 * subcommands re-export the relevant subset under their own
 * `OBSERVE_COMMAND_ERROR_CODES` / `RECORD_COMMAND_ERROR_CODES` for
 * call-site clarity; both names point at these strings.
 */
export const COMMAND_OPTION_ERROR_CODES = {
  programRequired: 'cli.program_required',
  unsafeFlagRequired: 'cli.unsafe_flag_required',
  secretScanDisableRequiresUnsafeFlag: 'cli.secret_scan_disable_requires_unsafe_flag',
  shellModeRequired: 'cli.shell_mode_required',
  argvTokenTooLong: 'cli.argv_token_too_long',
  outOfRange: 'cli.out_of_range',
  invalidPolicyDigest: 'cli.invalid_policy_digest',
  invalidConfigDigest: 'cli.invalid_config_digest',
  invalidApprovalRef: 'cli.invalid_approval_ref',
  invalidEnvKey: 'cli.invalid_env_key',
  // Signing-only (used by validateSigningOptions).
  signingInputRequired: 'cli.signing_input_required',
  signingInputConflict: 'cli.signing_input_conflict',
  issuerIdRequired: 'cli.issuer_id_required',
  issuerIdInvalid: 'cli.issuer_id_invalid',
} as const;

export interface ValidationFailure {
  code: string;
  message: string;
}

/** Common option shape both subcommands share (no signing fields). */
export interface CoreCommandOptions {
  captureMode: ArgvMode;
  unsafeAllowRawCapture: boolean;
  captureStdinMode: StdinMode;
  captureStdoutBytes: number;
  captureStderrBytes: number;
  captureArgvBytes: number;
  envAllow: string[];
  envMode: EnvMode;
  unsafeAllowRawEnv: boolean;
  captureCwdMode: CwdMode;
  captureBinaryPath: BinaryPathMode;
  secretScan: boolean;
  unsafeDisableSecretScan: boolean;
  policyDigest?: string;
  configDigest?: string;
  approvalRef?: string;
  executionMode: ExecutionMode;
  shellMode: boolean;
  timeoutMs: number;
  killGraceMs: number;
  exitCodeMode: ExitCodeMode;
}

/** Signing-input shape consumed by record command. */
export interface SigningOptions {
  issuerKey?: string;
  issuerId?: string;
  unsafeEphemeralKey: boolean;
}

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;
const ENV_KEY_GRAMMAR = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENV_KEY_BYTES_MAX = 256;

/** True iff `n` is a finite, in-range integer (rejects NaN, Infinity, floats). */
export function isValidIntInRange(n: unknown, min: number, max: number): boolean {
  return typeof n === 'number' && Number.isInteger(n) && Number.isFinite(n) && n >= min && n <= max;
}

/** UTF-8 byte length of a string. */
export function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

/** Platform-agnostic basename -- strips both `/` and `\`. */
export function basenameAny(p: string): string {
  return p.replace(/^.*[\\/]/, '');
}

/**
 * Validate flags shared by observe command and record command. Returns
 * an array of failures; empty when the options + child argv are
 * acceptable. Caller surfaces failures to stderr and exits 2 BEFORE
 * spawning the child.
 */
export function validateCoreCommandOptions(
  opts: CoreCommandOptions,
  childArgv: string[]
): ValidationFailure[] {
  const failures: ValidationFailure[] = [];

  if (childArgv.length === 0) {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.programRequired,
      message: 'a program after `--` is required (e.g., -- echo hi)',
    });
    return failures;
  }

  // Numeric range checks. `isValidIntInRange` rejects NaN, Infinity,
  // floats, and out-of-range integers with one stable error code.
  if (!isValidIntInRange(opts.timeoutMs, CLI_LIMITS.minTimeoutMs, CLI_LIMITS.maxTimeoutMs)) {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.outOfRange,
      message: `--timeout-ms must be a finite integer in [${CLI_LIMITS.minTimeoutMs}, ${CLI_LIMITS.maxTimeoutMs}]`,
    });
  }
  if (!isValidIntInRange(opts.killGraceMs, CLI_LIMITS.minKillGraceMs, CLI_LIMITS.maxKillGraceMs)) {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.outOfRange,
      message: `--kill-grace-ms must be a finite integer in [${CLI_LIMITS.minKillGraceMs}, ${CLI_LIMITS.maxKillGraceMs}]`,
    });
  }
  if (!isValidIntInRange(opts.captureStdoutBytes, 0, CLI_LIMITS.maxStdoutSampleBytes)) {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.outOfRange,
      message: `--capture-stdout-bytes must be a finite integer in [0, ${CLI_LIMITS.maxStdoutSampleBytes}]`,
    });
  }
  if (!isValidIntInRange(opts.captureStderrBytes, 0, CLI_LIMITS.maxStderrSampleBytes)) {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.outOfRange,
      message: `--capture-stderr-bytes must be a finite integer in [0, ${CLI_LIMITS.maxStderrSampleBytes}]`,
    });
  }
  if (!isValidIntInRange(opts.captureArgvBytes, 0, CLI_LIMITS.maxArgvCaptureBytes)) {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.outOfRange,
      message: `--capture-argv-bytes must be a finite integer in [0, ${CLI_LIMITS.maxArgvCaptureBytes}]`,
    });
  }
  if (opts.envAllow.length > CLI_LIMITS.maxEnvEntries) {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.outOfRange,
      message: `--env-allow accepts at most ${CLI_LIMITS.maxEnvEntries} keys`,
    });
  }

  // Env key grammar + byte cap.
  for (const key of opts.envAllow) {
    if (!ENV_KEY_GRAMMAR.test(key)) {
      failures.push({
        code: COMMAND_OPTION_ERROR_CODES.invalidEnvKey,
        message: `--env-allow key '${key}' must match ${ENV_KEY_GRAMMAR}`,
      });
    } else if (utf8Bytes(key) > ENV_KEY_BYTES_MAX) {
      failures.push({
        code: COMMAND_OPTION_ERROR_CODES.invalidEnvKey,
        message: `--env-allow key '${key}' exceeds ${ENV_KEY_BYTES_MAX} UTF-8 bytes`,
      });
    }
  }

  // Record-only opaque references.
  if (opts.policyDigest !== undefined && !SHA256_DIGEST.test(opts.policyDigest)) {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.invalidPolicyDigest,
      message: '--policy-digest must match sha256:<64 lowercase hex>',
    });
  }
  if (opts.configDigest !== undefined && !SHA256_DIGEST.test(opts.configDigest)) {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.invalidConfigDigest,
      message: '--config-digest must match sha256:<64 lowercase hex>',
    });
  }
  if (opts.approvalRef !== undefined) {
    const ref = OpaqueRefSchema.safeParse(opts.approvalRef);
    if (!ref.success) {
      failures.push({
        code: COMMAND_OPTION_ERROR_CODES.invalidApprovalRef,
        message: `--approval-ref must satisfy the opaque-reference grammar: ${ref.error.issues.map((i) => i.message).join('; ')}`,
      });
    }
  }

  // Unsafe-flag pairing.
  if (opts.captureMode === 'raw' && !opts.unsafeAllowRawCapture) {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.unsafeFlagRequired,
      message: '--capture-mode raw requires --unsafe-allow-raw-capture',
    });
  }
  if (opts.envMode === 'raw' && !opts.unsafeAllowRawEnv) {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.unsafeFlagRequired,
      message: '--env-mode raw requires --unsafe-allow-raw-env',
    });
  }
  if (opts.unsafeAllowRawCapture && !opts.secretScan && !opts.unsafeDisableSecretScan) {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.secretScanDisableRequiresUnsafeFlag,
      message: '--secret-scan off under raw capture requires --unsafe-disable-secret-scan',
    });
  }

  // Raw argv per-token cap (skip the cap-only-meaningful-in-raw logic
  // when not in raw mode).
  if (opts.captureMode === 'raw' && opts.unsafeAllowRawCapture) {
    const tokens = childArgv.slice(1);
    for (const tok of tokens) {
      if (utf8Bytes(tok) > opts.captureArgvBytes) {
        failures.push({
          code: COMMAND_OPTION_ERROR_CODES.argvTokenTooLong,
          message: `raw argv token (${utf8Bytes(tok)} bytes) exceeds --capture-argv-bytes (${opts.captureArgvBytes})`,
        });
        break;
      }
    }
  }

  // Shell-binary acknowledgement: hard fail if a known shell binary
  // is supplied without --shell-mode.
  const programToken = childArgv[0];
  const programBasename = basenameAny(programToken);
  if (isShellBinary(programBasename) && !opts.shellMode) {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.shellModeRequired,
      message: `program '${programBasename}' is a shell binary; --shell-mode is required to acknowledge that the user intentionally invoked a shell`,
    });
  }
  if (opts.shellMode && opts.captureBinaryPath === 'none') {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.shellModeRequired,
      message: '--shell-mode requires --capture-binary-path != none',
    });
  }

  return failures;
}

/**
 * Validate signing-input flags consumed by record command. Enforces
 * mutex (--issuer-key XOR --unsafe-ephemeral-key), required
 * --issuer-id, and canonical-issuer-URL form. Caller appends these
 * failures to the core failures and exits 2 BEFORE running the child.
 */
export function validateSigningOptions(opts: SigningOptions): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const hasIssuerKey = typeof opts.issuerKey === 'string' && opts.issuerKey.length > 0;
  const hasEphemeral = opts.unsafeEphemeralKey === true;
  if (!hasIssuerKey && !hasEphemeral) {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.signingInputRequired,
      message:
        'record command requires exactly one of --issuer-key <env:VAR|file:/path> or --unsafe-ephemeral-key',
    });
  }
  if (hasIssuerKey && hasEphemeral) {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.signingInputConflict,
      message: '--issuer-key and --unsafe-ephemeral-key are mutually exclusive',
    });
  }
  if (typeof opts.issuerId !== 'string' || opts.issuerId.length === 0) {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.issuerIdRequired,
      message: '--issuer-id <url> is required (canonical issuer URL)',
    });
  } else if (!isCanonicalIss(opts.issuerId)) {
    failures.push({
      code: COMMAND_OPTION_ERROR_CODES.issuerIdInvalid,
      message: `--issuer-id '${opts.issuerId}' is not canonical (expected https:// ASCII origin or did: identifier)`,
    });
  }
  return failures;
}
