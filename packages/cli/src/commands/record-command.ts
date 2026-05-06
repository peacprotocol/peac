/**
 * `peac record command` subcommand.
 *
 * Wraps a child process and emits a Wire 0.2 compact JWS containing
 * the same `org.peacprotocol/cli-execution` observation as
 * `observe command`, signed by the supplied issuer key. Reuses the
 * shared capture / build / validate pipeline from
 * `lib/observation-pipeline.ts` so a record produced by record command
 * is identical to one from observe command (modulo the outer signing
 * envelope).
 *
 * Signing UX uses the existing PEAC issuer-key reference convention:
 *
 *   --issuer-key <env:VAR | file:/path>
 *   --issuer-id  <url>
 *   --unsafe-ephemeral-key
 *
 * The wrapper is an OBSERVER, not a sandbox / permission system /
 * shell orchestrator / process supervisor / job scheduler. PEAC does
 * NOT publish or distribute the issuer key; --unsafe-ephemeral-key
 * produces a structurally valid record whose public key is not
 * published through normal issuer-key discovery (use only for local
 * development and tests).
 */

import { Command, Option } from 'commander';
import { writeFileSync } from 'node:fs';
import { CLI_COMMAND_EXECUTION_TYPE, CLI_EXECUTION_EXTENSION_KEY } from '@peac/schema';
import { issue, IssueError } from '@peac/protocol';
import { generateKeypair } from '@peac/crypto';
import { CLI_LIMITS } from '../lib/cli-limits.js';
import { runObservationCore, preflightOutputWritable } from '../lib/observation-pipeline.js';
import { parseIntegerFlag, type ObserveCommandOptions } from './observe-command.js';
import {
  COMMAND_OPTION_ERROR_CODES,
  validateCoreCommandOptions,
  validateSigningOptions,
  type ValidationFailure,
} from '../lib/command-option-validation.js';
import {
  loadIssuerKey,
  deriveKidFromPublicKey,
  IssuerKeyLoadError,
  IssuerKeyInvalidError,
} from '../lib/issuer-key-loader.js';
import type {
  ArgvMode,
  CwdMode,
  BinaryPathMode,
  EnvMode,
  StdinMode,
  ExitCodeMode,
  ExecutionMode,
} from '../lib/observation-builder.js';

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
 * Stable error codes surfaced before the child runs OR after signing
 * fails. Inherits the shared option-validation set so observe command
 * and record command never disagree on validation-layer codes.
 */
export const RECORD_COMMAND_ERROR_CODES = {
  ...COMMAND_OPTION_ERROR_CODES,
  outputWriteFailed: 'cli.output_write_failed',
  // Signing-specific (not part of the shared option-validation set).
  issuerKeyLoadFailed: 'cli.issuer_key_load_failed',
  issuerKeyInvalid: 'cli.issuer_key_invalid',
  signingFailed: 'cli.signing_failed',
} as const;

/** Record-command options = observe command options + signing inputs. */
export interface RecordCommandOptions extends ObserveCommandOptions {
  issuerKey?: string;
  issuerId?: string;
  unsafeEphemeralKey: boolean;
}

export interface RecordCommandIO {
  writeStdout: (chunk: string) => void;
  writeStderr: (chunk: string) => void;
  childEnv: NodeJS.ProcessEnv;
  captureEnv: NodeJS.ProcessEnv;
  /**
   * Environment used to resolve `env:VAR` issuer-key references.
   * Defaults to `process.env`. Distinct from `childEnv` and `captureEnv`
   * because issuer-key access policy is independent of capture policy.
   */
  issuerKeyEnv: NodeJS.ProcessEnv;
  cwd: string;
  peacCliVersion: string;
}

export interface RecordCommandResult {
  exitCode: number;
}

const DEFAULT_OPTIONS: RecordCommandOptions = {
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
  unsafeEphemeralKey: false,
};

/**
 * Validate flag combinations (observe + signing) BEFORE spawning the
 * child or loading the issuer key. Delegates to the shared
 * `validateCoreCommandOptions` for observe-style checks and
 * `validateSigningOptions` for the signing-input mutex and canonical
 * issuer URL preflight.
 */
export function validateRecordOptions(
  opts: RecordCommandOptions,
  childArgv: string[]
): ValidationFailure[] {
  const core = validateCoreCommandOptions(opts, childArgv);
  // Skip signing checks when the program-required failure is already
  // present (record command requires a child too); short-circuit
  // matches the observe command early-exit shape.
  const programRequired = core.find((f) => f.code === COMMAND_OPTION_ERROR_CODES.programRequired);
  if (programRequired) return core;
  return [...core, ...validateSigningOptions(opts)];
}

/**
 * Resolve the issuer key per the validated options. Returns the
 * loaded key and `kid`, or a structured failure for the caller to
 * surface as `cli.issuer_key_load_failed` / `cli.issuer_key_invalid`.
 */
async function resolveIssuerKey(
  opts: RecordCommandOptions,
  issuerKeyEnv: NodeJS.ProcessEnv
): Promise<
  { ok: true; privateKey: Uint8Array; kid: string } | { ok: false; code: string; message: string }
> {
  if (opts.unsafeEphemeralKey) {
    const { privateKey, publicKey } = await generateKeypair();
    const kid = await deriveKidFromPublicKey(publicKey);
    return { ok: true, privateKey, kid };
  }
  // hasIssuerKey is guaranteed by validateRecordOptions.
  try {
    const loaded = await loadIssuerKey(opts.issuerKey!, issuerKeyEnv);
    return { ok: true, privateKey: loaded.privateKey, kid: loaded.kid };
  } catch (err) {
    if (err instanceof IssuerKeyInvalidError) {
      return { ok: false, code: err.code, message: err.message };
    }
    if (err instanceof IssuerKeyLoadError) {
      return { ok: false, code: err.code, message: err.message };
    }
    return {
      ok: false,
      code: RECORD_COMMAND_ERROR_CODES.issuerKeyLoadFailed,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Pure handler: validates flags, preflights output and key, runs the
 * child, builds the observation, signs as Wire 0.2 JWS, emits.
 */
export async function runRecordCommand(
  options: Partial<RecordCommandOptions>,
  childArgv: string[],
  io: Partial<RecordCommandIO> = {}
): Promise<RecordCommandResult> {
  const opts: RecordCommandOptions = { ...DEFAULT_OPTIONS, ...options };
  const writeStdout = io.writeStdout ?? ((c: string) => process.stdout.write(c));
  const writeStderr = io.writeStderr ?? ((c: string) => process.stderr.write(c));
  const childEnv = io.childEnv ?? process.env;
  const captureEnv = io.captureEnv ?? process.env;
  const issuerKeyEnv = io.issuerKeyEnv ?? process.env;
  const cwd = io.cwd ?? process.cwd();
  const peacCliVersion = io.peacCliVersion ?? '0.14.1';

  const failures = validateRecordOptions(opts, childArgv);
  if (failures.length > 0) {
    for (const f of failures) {
      writeStderr(`${f.code}: ${f.message}\n`);
    }
    return { exitCode: 2 };
  }

  const programToken = childArgv[0];
  const args = childArgv.slice(1);

  // Preflight --output writability BEFORE the child runs OR the key is loaded.
  const outputErr = preflightOutputWritable(opts.output);
  if (outputErr !== null) {
    writeStderr(`${RECORD_COMMAND_ERROR_CODES.outputWriteFailed}: ${outputErr}\n`);
    return { exitCode: 2 };
  }

  // Load (or generate) the issuer key BEFORE the child runs. A
  // record-producing wrapper must never run a child only to discover
  // the key cannot be loaded.
  const keyResult = await resolveIssuerKey(opts, issuerKeyEnv);
  if (!keyResult.ok) {
    writeStderr(`${keyResult.code}: ${keyResult.message}\n`);
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

  // Sign the observation as a Wire 0.2 interaction record. The
  // observation lives under the org.peacprotocol/cli-execution
  // extension namespace; the record's `type` is the canonical CLI
  // command-execution type URI.
  let jws: string;
  try {
    const result = await issue({
      iss: opts.issuerId!,
      kind: 'evidence',
      type: CLI_COMMAND_EXECUTION_TYPE,
      privateKey: keyResult.privateKey,
      kid: keyResult.kid,
      extensions: {
        [CLI_EXECUTION_EXTENSION_KEY]: core.observation,
      },
    });
    jws = result.jws;
  } catch (err) {
    const message =
      err instanceof IssueError ? err.message : err instanceof Error ? err.message : String(err);
    writeStderr(`${RECORD_COMMAND_ERROR_CODES.signingFailed}: ${message}\n`);
    return { exitCode: 2 };
  }

  if (opts.output === '-' || opts.output === '') {
    writeStdout(jws + '\n');
  } else {
    try {
      writeFileSync(opts.output, jws + '\n');
    } catch (err) {
      writeStderr(
        `${RECORD_COMMAND_ERROR_CODES.outputWriteFailed}: failed to write '${opts.output}': ${err instanceof Error ? err.message : String(err)}\n`
      );
      return { exitCode: 2 };
    }
  }

  if (opts.exitCodeMode === 'record') {
    return { exitCode: 0 };
  }
  return { exitCode: core.capture.exitCode };
}

/**
 * Commander factory for the `command` subcommand under the `record`
 * parent group. Mirrors `observeCommandSubcommand()` flag set + adds
 * the three signing inputs.
 */
export function recordCommandSubcommand(): Command {
  const cmd = new Command('command');
  cmd
    .description(
      'Wrap a command and emit a Wire 0.2 signed CLI execution record. ' +
        'record command is an OBSERVER, not a sandbox, permission system, ' +
        'shell orchestrator, or process supervisor. The command after `--` ' +
        'is spawned exactly as supplied (shell: false). Use --unsafe-ephemeral-key ' +
        'only for local development and tests; the public key is not published ' +
        'through normal issuer-key discovery.'
    )
    .addOption(
      new Option('--capture-mode <mode>', 'argv capture mode')
        .choices([...ARGV_MODES])
        .default('hashed')
    )
    .option('--unsafe-allow-raw-capture', 'required alongside --capture-mode raw', false)
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
    .option('--unsafe-allow-raw-env', 'required alongside --env-mode raw', false)
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
    .option('--output <file>', 'output path for the JWS (default: stdout)', '-')
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
    // Signing inputs.
    .option('--issuer-key <ref>', 'issuer key reference: env:VAR_NAME or file:/path/to/jwk.json')
    .option('--issuer-id <url>', 'canonical issuer URL recorded as `iss`')
    .option(
      '--unsafe-ephemeral-key',
      'Generates an ephemeral local signing key. The public key is not published through normal issuer-key discovery. Use only for local development and tests.',
      false
    )
    .allowUnknownOption(false)
    .allowExcessArguments(true);

  cmd.action(async (rawOpts: Record<string, unknown>, cmdInstance: Command) => {
    const childArgv = cmdInstance.args;

    const options: Partial<RecordCommandOptions> = {
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
      issuerKey: rawOpts.issuerKey as string | undefined,
      issuerId: rawOpts.issuerId as string | undefined,
      unsafeEphemeralKey: Boolean(rawOpts.unsafeEphemeralKey),
    };

    const result = await runRecordCommand(options, childArgv);
    process.exitCode = result.exitCode;
  });

  return cmd;
}

/**
 * Commander factory for the public `peac record` parent group. Adds
 * the `command` subcommand. Future signed-record surfaces (e.g.,
 * `peac record mcp`, `peac record http`) attach here without widening
 * the verb namespace.
 */
export function recordCommand(): Command {
  const record = new Command('record').description(
    'Sign and emit Wire 0.2 records over locally observed activity.'
  );
  record.addCommand(recordCommandSubcommand());
  return record;
}
