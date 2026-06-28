/**
 * `peac observe command` subcommand.
 *
 * Wraps a child process and emits an unsigned CLI execution observation
 * record to stdout (or `--output <file>`). Hard security defaults:
 *   - argv hashed
 *   - stdout/stderr length + sha256 + truncated only (no sample without
 *     double-opt-in raw mode)
 *   - stdin closed (none)
 *   - env capture deny-by-default
 *   - cwd hashed; binary path hashed
 *   - secret-scan on
 *   - shell binary detected without --shell-mode hard-fails
 *
 * The wrapper is an OBSERVER, not a sandbox / permission system / shell
 * orchestrator / process supervisor / job scheduler. It does not
 * synthesize shell syntax; the command after `--` is spawned exactly as
 * supplied with `shell: false`.
 */

import { Command, Option } from 'commander';
import { writeFileSync } from 'node:fs';
import { CLI_LIMITS } from '../lib/cli-limits.js';
import { getVersion } from '../lib/version.js';
import {
  preflightOutputWritable,
  resolveProgramPath,
  runObservationCore,
  type CoreObservationOptions,
  type CoreObservationIO,
} from '../lib/observation-pipeline.js';
import {
  COMMAND_OPTION_ERROR_CODES,
  validateCoreCommandOptions,
  type ValidationFailure,
} from '../lib/command-option-validation.js';
import type {
  ArgvMode,
  CwdMode,
  BinaryPathMode,
  EnvMode,
  StdinMode,
  ExitCodeMode,
  ExecutionMode,
} from '../lib/observation-builder.js';

// Re-export the helpers that the lib now owns so existing tests + any
// future consumers continue to import them from the subcommand module.
export { preflightOutputWritable, resolveProgramPath, runObservationCore };
export type { CoreObservationOptions, CoreObservationIO };

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

/**
 * Stable error codes surfaced to the user via stderr + non-zero exit.
 * Mirrors the shared `COMMAND_OPTION_ERROR_CODES` set plus a few
 * subcommand-specific codes (spawn-failed, schema-rejection,
 * output-write-failed) that originate inside `runObservationCore` or
 * the emit step rather than the option-validation layer.
 */
export const OBSERVE_COMMAND_ERROR_CODES = {
  ...COMMAND_OPTION_ERROR_CODES,
  envModeInconsistent: 'cli.env_mode_inconsistent',
  schemaRejection: 'cli.schema_rejection',
  unsupportedFlag: 'cli.unsupported_flag',
  spawnFailed: 'cli.spawn_failed',
  outputWriteFailed: 'cli.output_write_failed',
} as const;

export interface ObserveCommandOptions {
  /** Resolved CLI flag values; tests construct this directly. */
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
  output: string;
  timeoutMs: number;
  killGraceMs: number;
  exitCodeMode: ExitCodeMode;
}

export interface ObserveCommandIO {
  /** Defaults to process.stdout.write. */
  writeStdout: (chunk: string) => void;
  /** Defaults to process.stderr.write. */
  writeStderr: (chunk: string) => void;
  /**
   * Environment passed to the child process. Defaults to process.env.
   * Distinct from `captureEnv` so env-capture policy (what PEAC RECORDS)
   * stays decoupled from execution env (what the child RECEIVES).
   */
  childEnv: NodeJS.ProcessEnv;
  /**
   * Environment inspected by --env-allow for record entries. Defaults
   * to process.env. Tests override either side independently.
   */
  captureEnv: NodeJS.ProcessEnv;
  /** Defaults to process.cwd(). */
  cwd: string;
  /** Defaults to a tiny version constant. */
  peacCliVersion: string;
}

export interface ObserveCommandResult {
  exitCode: number;
}

const DEFAULT_OPTIONS: ObserveCommandOptions = {
  captureMode: 'hashed',
  unsafeAllowRawCapture: false,
  captureStdinMode: 'none',
  captureStdoutBytes: CLI_LIMITS.defaultStdoutSampleBytes,
  captureStderrBytes: CLI_LIMITS.defaultStderrSampleBytes,
  captureArgvBytes: CLI_LIMITS.defaultArgvCaptureBytes,
  envAllow: [],
  envMode: 'hashed',
  unsafeAllowRawEnv: false,
  captureCwdMode: 'hashed',
  captureBinaryPath: 'hashed',
  secretScan: true,
  unsafeDisableSecretScan: false,
  executionMode: 'deterministic_script',
  shellMode: false,
  output: '-',
  timeoutMs: CLI_LIMITS.defaultTimeoutMs,
  killGraceMs: CLI_LIMITS.defaultKillGraceMs,
  exitCodeMode: 'child',
};

/**
 * Commander integer flag parser that surfaces NaN / non-integer input
 * as `Number.NaN` instead of silently coercing. The shared option
 * validator rejects NaN via `isValidIntInRange` and emits
 * `cli.out_of_range`.
 */
export function parseIntegerFlag(raw: string): number {
  // Reject empty strings explicitly: `Number('')` is 0, not NaN.
  if (raw.trim() === '') return Number.NaN;
  const n = Number(raw);
  return Number.isInteger(n) && Number.isFinite(n) ? n : Number.NaN;
}

/**
 * Validate flag combinations BEFORE spawning the child. Delegates to
 * `validateCoreCommandOptions` so observe command and record command
 * share one source of truth for option validation.
 */
export function validateObserveOptions(
  opts: ObserveCommandOptions,
  childArgv: string[]
): ValidationFailure[] {
  return validateCoreCommandOptions(opts, childArgv);
}

/**
 * Pure handler: validates flags, runs the child, builds the
 * observation, validates against the schema, emits JSON. Tests drive
 * this directly without going through commander.
 */
export async function runObserveCommand(
  options: Partial<ObserveCommandOptions>,
  childArgv: string[],
  io: Partial<ObserveCommandIO> = {}
): Promise<ObserveCommandResult> {
  const opts: ObserveCommandOptions = { ...DEFAULT_OPTIONS, ...options };
  const writeStdout = io.writeStdout ?? ((c: string) => process.stdout.write(c));
  const writeStderr = io.writeStderr ?? ((c: string) => process.stderr.write(c));
  const childEnv = io.childEnv ?? process.env;
  const captureEnv = io.captureEnv ?? process.env;
  const cwd = io.cwd ?? process.cwd();
  const peacCliVersion = io.peacCliVersion ?? getVersion();

  const failures = validateObserveOptions(opts, childArgv);
  if (failures.length > 0) {
    for (const f of failures) {
      writeStderr(`${f.code}: ${f.message}\n`);
    }
    return { exitCode: 2 };
  }

  const programToken = childArgv[0];
  const args = childArgv.slice(1);

  // Preflight --output writability BEFORE the child runs. A
  // record-producing wrapper must never run a child only to discover
  // the record cannot be persisted.
  const outputErr = preflightOutputWritable(opts.output);
  if (outputErr !== null) {
    writeStderr(`${OBSERVE_COMMAND_ERROR_CODES.outputWriteFailed}: ${outputErr}\n`);
    return { exitCode: 2 };
  }

  const core = await runObservationCore(opts, programToken, args, {
    childEnv,
    captureEnv,
    cwd,
    peacCliVersion,
  });
  if (!core.ok) {
    writeStderr(`${core.code}: ${core.message}\n`);
    return { exitCode: 2 };
  }

  const json = JSON.stringify(core.observation);
  if (opts.output === '-' || opts.output === '') {
    writeStdout(json + '\n');
  } else {
    try {
      writeFileSync(opts.output, json + '\n');
    } catch (err) {
      writeStderr(
        `${OBSERVE_COMMAND_ERROR_CODES.outputWriteFailed}: failed to write '${opts.output}': ${err instanceof Error ? err.message : String(err)}\n`
      );
      return { exitCode: 2 };
    }
  }

  // Exit-code policy.
  if (opts.exitCodeMode === 'record') {
    return { exitCode: 0 };
  }
  // 'child' mode: mirror the child exit code (synthetic 128+sig if signal).
  return { exitCode: core.capture.exitCode };
}

/**
 * Commander factory for the inner `command` subcommand of the
 * `peac observe` group. Wires --flag parsing and delegates to the pure
 * handler. Public invocation: `peac observe command -- <program> [args...]`.
 */
export function observeCommandSubcommand(): Command {
  const cmd = new Command('command');
  cmd
    .description(
      'Wrap a command and emit an unsigned CLI execution observation record. ' +
        'observe command is an OBSERVER, not a sandbox, permission system, ' +
        'shell orchestrator, or process supervisor. The command after `--` ' +
        'is spawned exactly as supplied (shell: false).'
    )
    .addOption(
      new Option('--capture-mode <mode>', 'argv capture mode')
        .choices([...ARGV_MODES])
        .default('hashed')
    )
    .option(
      '--unsafe-allow-raw-capture',
      'required alongside --capture-mode raw to acknowledge raw stream sample emission',
      false
    )
    .addOption(
      new Option('--capture-stdin-mode <mode>', 'stdin capture (and pass-through) mode')
        .choices([...STDIN_MODES])
        .default('none')
    )
    .option(
      '--capture-stdout-bytes <n>',
      `stdout sample cap (raw mode only); max ${CLI_LIMITS.maxStdoutSampleBytes}`,
      parseIntegerFlag,
      CLI_LIMITS.defaultStdoutSampleBytes
    )
    .option(
      '--capture-stderr-bytes <n>',
      `stderr sample cap (raw mode only); max ${CLI_LIMITS.maxStderrSampleBytes}`,
      parseIntegerFlag,
      CLI_LIMITS.defaultStderrSampleBytes
    )
    .option(
      '--capture-argv-bytes <n>',
      `argv per-token byte cap (raw mode only); max ${CLI_LIMITS.maxArgvCaptureBytes}`,
      parseIntegerFlag,
      CLI_LIMITS.defaultArgvCaptureBytes
    )
    .option(
      '--env-allow <KEYS>',
      'comma-separated allowlist of env vars to record (deny-by-default)',
      (v, prev: string[]) =>
        prev.concat(
          v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        ),
      [] as string[]
    )
    .addOption(
      new Option('--env-mode <mode>', 'env value capture mode')
        .choices([...ENV_MODES])
        .default('hashed')
    )
    .option(
      '--unsafe-allow-raw-env',
      'required alongside --env-mode raw to acknowledge raw env value capture',
      false
    )
    .addOption(
      new Option('--capture-cwd-mode <mode>', 'cwd capture mode')
        .choices([...CWD_MODES])
        .default('hashed')
    )
    .addOption(
      new Option('--capture-binary-path <mode>', 'binary path capture mode')
        .choices([...BINARY_PATH_MODES])
        .default('hashed')
    )
    .addOption(
      new Option('--secret-scan <state>', 'secret-scan over raw samples')
        .choices(['on', 'off'])
        .default('on')
    )
    .option(
      '--unsafe-disable-secret-scan',
      'required to disable secret-scan when raw capture is enabled',
      false
    )
    .option('--policy-digest <sha256>', 'optional policy digest (sha256:<hex>)')
    .option('--config-digest <sha256>', 'optional config digest (sha256:<hex>)')
    .option('--approval-ref <opaque>', 'optional opaque approval reference')
    .addOption(
      new Option('--execution-mode <mode>', 'execution-mode tag for this record')
        .choices([...EXECUTION_MODES])
        .default('deterministic_script')
    )
    .option(
      '--shell-mode',
      'acknowledge that the program is a shell binary; PEAC does NOT rewrite the command',
      false
    )
    .option('--output <file>', 'output path for the JSON record (default: stdout)', '-')
    .option(
      '--timeout-ms <n>',
      `wrapper timeout in ms; max ${CLI_LIMITS.maxTimeoutMs} (24h)`,
      parseIntegerFlag,
      CLI_LIMITS.defaultTimeoutMs
    )
    .option(
      '--kill-grace-ms <n>',
      `SIGTERM-to-SIGKILL grace in ms; max ${CLI_LIMITS.maxKillGraceMs}`,
      parseIntegerFlag,
      CLI_LIMITS.defaultKillGraceMs
    )
    .addOption(
      new Option('--exit-code-mode <mode>', 'wrapper exit-code policy')
        .choices([...EXIT_CODE_MODES])
        .default('child')
    )
    .allowUnknownOption(false)
    .allowExcessArguments(true);

  cmd.action(async (rawOpts: Record<string, unknown>, cmdInstance: Command) => {
    // Commander consumes options before `--` and exposes everything
    // after it (the post-`--` positionals) via `cmd.args`. This keeps
    // the wrapper free of `process.argv` indexing.
    const childArgv = cmdInstance.args;

    const options: Partial<ObserveCommandOptions> = {
      captureMode: rawOpts.captureMode as ArgvMode,
      unsafeAllowRawCapture: Boolean(rawOpts.unsafeAllowRawCapture),
      captureStdinMode: rawOpts.captureStdinMode as StdinMode,
      captureStdoutBytes: rawOpts.captureStdoutBytes as number,
      captureStderrBytes: rawOpts.captureStderrBytes as number,
      captureArgvBytes: rawOpts.captureArgvBytes as number,
      envAllow: (rawOpts.envAllow as string[]) ?? [],
      envMode: rawOpts.envMode as EnvMode,
      unsafeAllowRawEnv: Boolean(rawOpts.unsafeAllowRawEnv),
      captureCwdMode: rawOpts.captureCwdMode as CwdMode,
      captureBinaryPath: rawOpts.captureBinaryPath as BinaryPathMode,
      secretScan: rawOpts.secretScan === 'on',
      unsafeDisableSecretScan: Boolean(rawOpts.unsafeDisableSecretScan),
      policyDigest: rawOpts.policyDigest as string | undefined,
      configDigest: rawOpts.configDigest as string | undefined,
      approvalRef: rawOpts.approvalRef as string | undefined,
      executionMode: rawOpts.executionMode as ExecutionMode,
      shellMode: Boolean(rawOpts.shellMode),
      output: (rawOpts.output as string) ?? '-',
      timeoutMs: rawOpts.timeoutMs as number,
      killGraceMs: rawOpts.killGraceMs as number,
      exitCodeMode: rawOpts.exitCodeMode as ExitCodeMode,
    };

    const result = await runObserveCommand(options, childArgv);
    // Use process.exitCode rather than process.exit() so any pending
    // stdout/stderr writes drain cleanly before Node exits.
    process.exitCode = result.exitCode;
  });

  return cmd;
}

/**
 * Commander factory for the public `peac observe` parent group. Adds
 * the `command` subcommand. Future observation surfaces (e.g.,
 * `peac observe mcp`, `peac observe http`) attach here without
 * widening the verb namespace.
 */
export function observeCommand(): Command {
  const observe = new Command('observe').description(
    'Observe local activity and emit unsigned observation records.'
  );
  observe.addCommand(observeCommandSubcommand());
  return observe;
}
