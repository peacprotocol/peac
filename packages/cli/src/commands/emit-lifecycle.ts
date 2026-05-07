/**
 * `peac emit lifecycle` subcommand.
 *
 * Issues a Wire 0.2 compact JWS lifecycle observation record from
 * caller-supplied flags. The caller observed the lifecycle event (an
 * external approval, evaluation, experiment, workflow transition, or
 * mode tag); the CLI is the issuance path; the caller's issuer is the
 * signer-of-record. PEAC provides the record format, validation, and
 * signing path. PEAC does not capture, observe, decide, evaluate,
 * score, transition, orchestrate, schedule, or vouch for the truth of
 * the event.
 *
 * Signing UX uses the existing PEAC issuer-key reference convention
 * (mirrors `peac record command`):
 *
 *   --issuer-key <env:VAR | file:/path>
 *   --issuer-id  <url>
 *   --unsafe-ephemeral-key
 *
 * `--observed-at` is REQUIRED. The wrapper does not silently default the
 * external event time to the wrapper-invocation time; that would
 * misrepresent when the external system observed the event.
 *
 * Stable error codes:
 *   lifecycle.missing_required_field      (missing flag for required field)
 *   lifecycle.event_kind_unknown          (--event-kind not in the 9 enum)
 *   lifecycle.invalid_observed_at         (--observed-at not RFC 3339)
 *   lifecycle.opaque_ref_grammar_violation
 *   lifecycle.approver_ref_pii_blocked
 *   lifecycle.ref_must_be_string
 *   lifecycle.inline_value_blocked
 *   cli.issuer_key_required               (no signing input supplied)
 *   cli.issuer_id_required
 *   cli.issuer_id_invalid
 *   cli.unsafe_ephemeral_key_mutex        (--issuer-key and --unsafe-ephemeral-key both supplied)
 *   cli.issuer_key_load_failed            (from the shared issuer-key loader)
 *   cli.issuer_key_invalid                (from the shared issuer-key loader)
 *   cli.signing_failed
 *   cli.output_write_failed
 */

import { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import {
  LIFECYCLE_OBSERVATION_EXTENSION_KEY,
  LIFECYCLE_OBSERVATION_TYPE_URIS,
  isCanonicalIss,
  validateLifecycleObservation,
  type LifecycleEventKind,
  type LifecycleObservation,
} from '@peac/schema';
import { issue, IssueError } from '@peac/protocol';
import { generateKeypair } from '@peac/crypto';
import { preflightOutputWritable } from '../lib/output-preflight.js';
import {
  loadIssuerKey,
  deriveKidFromPublicKey,
  IssuerKeyLoadError,
  IssuerKeyInvalidError,
} from '../lib/issuer-key-loader.js';

/**
 * Discriminator literal -> canonical record-type URI. The two arrays move
 * together; this is a defense-in-depth check.
 */
const EVENT_KINDS: readonly LifecycleEventKind[] = [
  'lifecycle-approval-requested',
  'lifecycle-approval-granted',
  'lifecycle-approval-denied',
  'lifecycle-evaluation-started',
  'lifecycle-evaluation-completed',
  'lifecycle-experiment-assigned',
  'lifecycle-experiment-result',
  'lifecycle-workflow-transition',
  'lifecycle-mode-observed',
] as const;

const TYPE_URI_BY_EVENT_KIND: Readonly<Record<LifecycleEventKind, string>> = (() => {
  const map = {} as Record<LifecycleEventKind, string>;
  for (const k of EVENT_KINDS) {
    map[k] = `org.peacprotocol/${k}`;
  }
  // Sanity check that the type-URI list matches.
  for (const uri of LIFECYCLE_OBSERVATION_TYPE_URIS) {
    const k = uri.replace(/^org\.peacprotocol\//, '') as LifecycleEventKind;
    if (!EVENT_KINDS.includes(k)) {
      throw new Error(`emit-lifecycle: type URI ${uri} has no matching event_kind discriminator`);
    }
  }
  return map;
})();

const OBSERVED_MODES = [
  'deterministic_script',
  'templated_flow',
  'agent_loop',
  'human_step',
  'hybrid',
] as const;
type ObservedMode = (typeof OBSERVED_MODES)[number];

export const EMIT_LIFECYCLE_ERROR_CODES = {
  missingRequiredField: 'lifecycle.missing_required_field',
  eventKindUnknown: 'lifecycle.event_kind_unknown',
  invalidObservedAt: 'lifecycle.invalid_observed_at',
  invalidObservedMode: 'lifecycle.invalid_observed_mode',
  invalidState: 'lifecycle.invalid_state',
  issuerKeyRequired: 'cli.issuer_key_required',
  issuerIdRequired: 'cli.issuer_id_required',
  issuerIdInvalid: 'cli.issuer_id_invalid',
  unsafeEphemeralKeyMutex: 'cli.unsafe_ephemeral_key_mutex',
  issuerKeyLoadFailed: 'cli.issuer_key_load_failed',
  issuerKeyInvalid: 'cli.issuer_key_invalid',
  signingFailed: 'cli.signing_failed',
  outputWriteFailed: 'cli.output_write_failed',
} as const;

export interface EmitLifecycleOptions {
  eventKind?: string;
  subjectRef?: string;
  parentRef?: string;
  upstreamArtifactRef?: string;
  upstreamArtifactDigest?: string;
  policyRef?: string;
  policyDigest?: string;
  rubricRef?: string;
  approvalRef?: string;
  approverRef?: string;
  experimentRef?: string;
  cohortRef?: string;
  variantRef?: string;
  observedMode?: string;
  resultRef?: string;
  resultDigest?: string;
  scoreRef?: string;
  fromState?: string;
  toState?: string;
  observedAt?: string;
  issuerKey?: string;
  issuerId?: string;
  unsafeEphemeralKey: boolean;
  output: string;
}

export interface EmitLifecycleIO {
  writeStdout: (chunk: string) => void;
  writeStderr: (chunk: string) => void;
  /**
   * Environment used to resolve `env:VAR` issuer-key references.
   * Defaults to `process.env`. Tests inject custom env.
   */
  issuerKeyEnv: NodeJS.ProcessEnv;
}

export interface EmitLifecycleResult {
  exitCode: number;
}

interface ValidationFailure {
  code: string;
  message: string;
}

/**
 * RFC 3339 datetime with timezone offset. Matches the schema-side
 * `z.string().datetime({ offset: true })` shape.
 */
const RFC_3339_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Validate flag combinations BEFORE building the observation, loading
 * the key, or signing. Surfaces stable codes that match the schema's
 * lifecycle.* codes for schema-domain failures.
 */
export function validateEmitLifecycleOptions(opts: EmitLifecycleOptions): ValidationFailure[] {
  const failures: ValidationFailure[] = [];

  // event_kind: presence + enum membership.
  // Commander emits its own generic error if `.choices()` is used. We do
  // NOT use `.choices()` for this flag so a stable lifecycle code surfaces
  // for invalid values (matches the schema-side `lifecycle.event_kind_unknown`).
  if (!opts.eventKind) {
    failures.push({
      code: EMIT_LIFECYCLE_ERROR_CODES.missingRequiredField,
      message: '--event-kind is required',
    });
  } else if (!(EVENT_KINDS as readonly string[]).includes(opts.eventKind)) {
    failures.push({
      code: EMIT_LIFECYCLE_ERROR_CODES.eventKindUnknown,
      message: `--event-kind must be one of: ${EVENT_KINDS.join(', ')}`,
    });
  }

  // subject_ref
  if (!opts.subjectRef) {
    failures.push({
      code: EMIT_LIFECYCLE_ERROR_CODES.missingRequiredField,
      message: '--subject-ref is required',
    });
  }

  // observed_at: presence then RFC 3339 shape
  if (!opts.observedAt) {
    failures.push({
      code: EMIT_LIFECYCLE_ERROR_CODES.missingRequiredField,
      message:
        '--observed-at is required (no default-now; provide the wall-clock time at which the EXTERNAL system observed the event)',
    });
  } else if (!RFC_3339_WITH_OFFSET.test(opts.observedAt)) {
    failures.push({
      code: EMIT_LIFECYCLE_ERROR_CODES.invalidObservedAt,
      message: '--observed-at must be RFC 3339 with timezone offset (e.g., 2026-05-12T10:00:00Z)',
    });
  }

  // Per-event-kind required fields (CLI-side preflight; schema repeats this).
  const ek = opts.eventKind as LifecycleEventKind | undefined;
  if (ek && (EVENT_KINDS as readonly string[]).includes(ek)) {
    if (
      ek === 'lifecycle-approval-requested' ||
      ek === 'lifecycle-approval-granted' ||
      ek === 'lifecycle-approval-denied'
    ) {
      if (!opts.approvalRef) {
        failures.push({
          code: EMIT_LIFECYCLE_ERROR_CODES.missingRequiredField,
          message: `--approval-ref is required for event-kind ${ek}`,
        });
      }
      if (!opts.approverRef) {
        failures.push({
          code: EMIT_LIFECYCLE_ERROR_CODES.missingRequiredField,
          message: `--approver-ref is required for event-kind ${ek}`,
        });
      }
    } else if (ek === 'lifecycle-evaluation-completed') {
      if (!opts.resultRef) {
        failures.push({
          code: EMIT_LIFECYCLE_ERROR_CODES.missingRequiredField,
          message: '--result-ref is required for event-kind lifecycle-evaluation-completed',
        });
      }
    } else if (ek === 'lifecycle-experiment-assigned') {
      if (!opts.experimentRef) {
        failures.push({
          code: EMIT_LIFECYCLE_ERROR_CODES.missingRequiredField,
          message: '--experiment-ref is required for event-kind lifecycle-experiment-assigned',
        });
      }
    } else if (ek === 'lifecycle-experiment-result') {
      if (!opts.experimentRef) {
        failures.push({
          code: EMIT_LIFECYCLE_ERROR_CODES.missingRequiredField,
          message: '--experiment-ref is required for event-kind lifecycle-experiment-result',
        });
      }
      if (!opts.resultRef) {
        failures.push({
          code: EMIT_LIFECYCLE_ERROR_CODES.missingRequiredField,
          message: '--result-ref is required for event-kind lifecycle-experiment-result',
        });
      }
    } else if (ek === 'lifecycle-workflow-transition') {
      if (!opts.fromState) {
        failures.push({
          code: EMIT_LIFECYCLE_ERROR_CODES.missingRequiredField,
          message: '--from-state is required for event-kind lifecycle-workflow-transition',
        });
      }
      if (!opts.toState) {
        failures.push({
          code: EMIT_LIFECYCLE_ERROR_CODES.missingRequiredField,
          message: '--to-state is required for event-kind lifecycle-workflow-transition',
        });
      }
    } else if (ek === 'lifecycle-mode-observed') {
      if (!opts.observedMode) {
        failures.push({
          code: EMIT_LIFECYCLE_ERROR_CODES.missingRequiredField,
          message: '--observed-mode is required for event-kind lifecycle-mode-observed',
        });
      }
    }
  }

  // observed_mode value check (when supplied). `.choices()` is not used
  // on this flag so a stable lifecycle code surfaces for invalid values
  // (matches the schema-side `lifecycle.invalid_observed_mode`).
  if (opts.observedMode && !(OBSERVED_MODES as readonly string[]).includes(opts.observedMode)) {
    failures.push({
      code: EMIT_LIFECYCLE_ERROR_CODES.invalidObservedMode,
      message: `--observed-mode must be one of: ${OBSERVED_MODES.join(', ')}`,
    });
  }

  // from_state / to_state value checks (preserve exact caller-reported
  // strings; reject empty / whitespace-bounded / over-length).
  for (const [flag, value] of [
    ['--from-state', opts.fromState],
    ['--to-state', opts.toState],
  ] as const) {
    if (value !== undefined) {
      if (value.length === 0) {
        failures.push({
          code: EMIT_LIFECYCLE_ERROR_CODES.invalidState,
          message: `${flag} must not be empty`,
        });
      } else if (/^\s|\s$/.test(value)) {
        failures.push({
          code: EMIT_LIFECYCLE_ERROR_CODES.invalidState,
          message: `${flag} must not have leading or trailing whitespace`,
        });
      } else if (new TextEncoder().encode(value).byteLength > 256) {
        failures.push({
          code: EMIT_LIFECYCLE_ERROR_CODES.invalidState,
          message: `${flag} must be <= 256 UTF-8 bytes`,
        });
      }
    }
  }

  // Signing inputs: exactly one of (issuer-key, unsafe-ephemeral-key) must be present.
  const hasIssuerKey = !!opts.issuerKey;
  if (!hasIssuerKey && !opts.unsafeEphemeralKey) {
    failures.push({
      code: EMIT_LIFECYCLE_ERROR_CODES.issuerKeyRequired,
      message: 'one of --issuer-key or --unsafe-ephemeral-key is required',
    });
  } else if (hasIssuerKey && opts.unsafeEphemeralKey) {
    failures.push({
      code: EMIT_LIFECYCLE_ERROR_CODES.unsafeEphemeralKeyMutex,
      message: '--issuer-key and --unsafe-ephemeral-key are mutually exclusive',
    });
  }

  // issuer_id is required and must pass the canonical-issuer validator
  // shared with `peac record command` and `@peac/protocol.issue()`.
  // Reuses isCanonicalIss from @peac/schema so CLI preflight semantics
  // match the protocol issuance path exactly.
  if (!opts.issuerId) {
    failures.push({
      code: EMIT_LIFECYCLE_ERROR_CODES.issuerIdRequired,
      message: '--issuer-id is required',
    });
  } else if (!isCanonicalIss(opts.issuerId)) {
    failures.push({
      code: EMIT_LIFECYCLE_ERROR_CODES.issuerIdInvalid,
      message:
        '--issuer-id must be a canonical https://<origin> URL or did:<method>:<id> identifier',
    });
  }

  return failures;
}

interface IssuerKeyResolution {
  ok: true;
  privateKey: Uint8Array;
  kid: string;
}

interface IssuerKeyResolutionFailure {
  ok: false;
  code: string;
  message: string;
}

async function resolveIssuerKey(
  opts: EmitLifecycleOptions,
  issuerKeyEnv: NodeJS.ProcessEnv
): Promise<IssuerKeyResolution | IssuerKeyResolutionFailure> {
  if (opts.unsafeEphemeralKey) {
    const { privateKey, publicKey } = await generateKeypair();
    const kid = await deriveKidFromPublicKey(publicKey);
    return { ok: true, privateKey, kid };
  }
  // hasIssuerKey is guaranteed by validateEmitLifecycleOptions.
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
      code: EMIT_LIFECYCLE_ERROR_CODES.issuerKeyLoadFailed,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Build the lifecycle observation object from validated CLI options.
 * Only fields populated by flags are included; the schema validator
 * accepts the discriminated-union shape per event_kind.
 */
export function buildLifecycleObservation(opts: EmitLifecycleOptions): Record<string, unknown> {
  // observation always carries event_kind, subject_ref, observed_at.
  const obs: Record<string, unknown> = {
    event_kind: opts.eventKind!,
    subject_ref: opts.subjectRef!,
    observed_at: opts.observedAt!,
  };

  // Common optional fields (all event kinds may carry these).
  if (opts.parentRef) obs.parent_ref = opts.parentRef;
  if (opts.upstreamArtifactRef) obs.upstream_artifact_ref = opts.upstreamArtifactRef;
  if (opts.upstreamArtifactDigest) obs.upstream_artifact_digest = opts.upstreamArtifactDigest;
  if (opts.policyRef) obs.policy_ref = opts.policyRef;
  if (opts.policyDigest) obs.policy_digest = opts.policyDigest;
  if (opts.rubricRef) obs.rubric_ref = opts.rubricRef;
  if (opts.scoreRef) obs.score_ref = opts.scoreRef;
  if (opts.resultDigest) obs.result_digest = opts.resultDigest;

  // Per-event-kind fields.
  const ek = opts.eventKind as LifecycleEventKind;
  if (
    ek === 'lifecycle-approval-requested' ||
    ek === 'lifecycle-approval-granted' ||
    ek === 'lifecycle-approval-denied'
  ) {
    obs.approval_ref = opts.approvalRef!;
    obs.approver_ref = opts.approverRef!;
  } else if (ek === 'lifecycle-evaluation-completed') {
    obs.result_ref = opts.resultRef!;
  } else if (ek === 'lifecycle-experiment-assigned') {
    obs.experiment_ref = opts.experimentRef!;
    if (opts.cohortRef) obs.cohort_ref = opts.cohortRef;
    if (opts.variantRef) obs.variant_ref = opts.variantRef;
  } else if (ek === 'lifecycle-experiment-result') {
    obs.experiment_ref = opts.experimentRef!;
    obs.result_ref = opts.resultRef!;
    if (opts.cohortRef) obs.cohort_ref = opts.cohortRef;
    if (opts.variantRef) obs.variant_ref = opts.variantRef;
  } else if (ek === 'lifecycle-workflow-transition') {
    obs.from_state = opts.fromState!;
    obs.to_state = opts.toState!;
  } else if (ek === 'lifecycle-mode-observed') {
    obs.observed_mode = opts.observedMode!;
  }

  // observed_mode may appear OPTIONALLY on any event kind (REQUIRED only on mode-observed; that case sets it above).
  if (ek !== 'lifecycle-mode-observed' && opts.observedMode) {
    obs.observed_mode = opts.observedMode;
  }

  return obs;
}

/**
 * Pure handler: validates flags, preflights output and key, builds the
 * observation, validates against the schema, signs as Wire 0.2 JWS, emits.
 * Tests drive this directly without going through commander.
 */
export async function runEmitLifecycle(
  options: Partial<EmitLifecycleOptions>,
  io: Partial<EmitLifecycleIO> = {}
): Promise<EmitLifecycleResult> {
  const opts: EmitLifecycleOptions = {
    unsafeEphemeralKey: false,
    output: '-',
    ...options,
  };
  const writeStdout = io.writeStdout ?? ((c: string) => process.stdout.write(c));
  const writeStderr = io.writeStderr ?? ((c: string) => process.stderr.write(c));
  const issuerKeyEnv = io.issuerKeyEnv ?? process.env;

  const failures = validateEmitLifecycleOptions(opts);
  if (failures.length > 0) {
    for (const f of failures) {
      writeStderr(`${f.code}: ${f.message}\n`);
    }
    return { exitCode: 2 };
  }

  // Preflight --output writability before key load and signing.
  const outputErr = preflightOutputWritable(opts.output);
  if (outputErr !== null) {
    writeStderr(`${EMIT_LIFECYCLE_ERROR_CODES.outputWriteFailed}: ${outputErr}\n`);
    return { exitCode: 2 };
  }

  // Resolve (or generate) the issuer key before building the observation.
  const keyResult = await resolveIssuerKey(opts, issuerKeyEnv);
  if (!keyResult.ok) {
    writeStderr(`${keyResult.code}: ${keyResult.message}\n`);
    return { exitCode: 2 };
  }

  // Build and validate the observation.
  const observation = buildLifecycleObservation(opts);
  const validation = validateLifecycleObservation(observation);
  if (!validation.ok) {
    for (const e of validation.errors) {
      writeStderr(`${e.code}: ${e.message}\n`);
    }
    return { exitCode: 2 };
  }

  // Sign as Wire 0.2 record.
  let jws: string;
  try {
    const recordType = TYPE_URI_BY_EVENT_KIND[opts.eventKind as LifecycleEventKind];
    const result = await issue({
      iss: opts.issuerId!,
      kind: 'evidence',
      type: recordType,
      privateKey: keyResult.privateKey,
      kid: keyResult.kid,
      extensions: {
        [LIFECYCLE_OBSERVATION_EXTENSION_KEY]: validation.value as LifecycleObservation,
      },
    });
    jws = result.jws;
  } catch (err) {
    const message =
      err instanceof IssueError ? err.message : err instanceof Error ? err.message : String(err);
    writeStderr(`${EMIT_LIFECYCLE_ERROR_CODES.signingFailed}: ${message}\n`);
    return { exitCode: 2 };
  }

  if (opts.output === '-' || opts.output === '') {
    writeStdout(jws + '\n');
  } else {
    try {
      writeFileSync(opts.output, jws + '\n');
    } catch (err) {
      writeStderr(
        `${EMIT_LIFECYCLE_ERROR_CODES.outputWriteFailed}: failed to write '${opts.output}': ${err instanceof Error ? err.message : String(err)}\n`
      );
      return { exitCode: 2 };
    }
  }

  return { exitCode: 0 };
}

/**
 * Commander factory for the `lifecycle` subcommand under the `emit`
 * parent group. Wires --flag parsing and delegates to the pure handler.
 */
export function emitLifecycleSubcommand(): Command {
  const cmd = new Command('lifecycle');
  cmd
    .description(
      'Issue a signed lifecycle observation record from caller-supplied flags. ' +
        'The caller is the observer (the lifecycle event was emitted by an external ' +
        'orchestrator, workflow engine, evaluation system, approval system, or agent ' +
        'runtime); the CLI is the issuance path; the caller-provided issuer key is the ' +
        'signer-of-record. PEAC does not approve, evaluate, score, transition, ' +
        'orchestrate, schedule, or vouch for the truth of the event. The full contract ' +
        'is specified in docs/specs/LIFECYCLE-OBSERVATION-PROFILE.md.'
    )
    .option(
      '--event-kind <kind>',
      `one of the 9 lifecycle event-kind discriminator values: ${EVENT_KINDS.join(', ')}`
    )
    .option('--subject-ref <opaque>', 'opaque reference to the subject of the observation')
    .option('--parent-ref <opaque>', 'optional opaque reference to a parent observation')
    .option('--upstream-artifact-ref <opaque>', 'optional opaque reference to an upstream artifact')
    .option(
      '--upstream-artifact-digest <sha256>',
      'optional canonical sha256 digest of the upstream artifact'
    )
    .option('--policy-ref <opaque>', 'optional opaque reference to an upstream policy document')
    .option('--policy-digest <sha256>', 'optional canonical sha256 digest of the policy document')
    .option('--rubric-ref <opaque>', 'optional opaque reference to an evaluation rubric')
    .option(
      '--approval-ref <opaque>',
      'opaque reference to the approval (REQUIRED for approval-* event kinds)'
    )
    .option(
      '--approver-ref <opaque>',
      'opaque pseudonymous reference to the approver (REQUIRED for approval-* event kinds; @-containing values reject as PII)'
    )
    .option(
      '--experiment-ref <opaque>',
      'opaque reference to the experiment (REQUIRED for experiment-* event kinds)'
    )
    .option('--cohort-ref <opaque>', 'optional opaque reference to the experiment cohort')
    .option('--variant-ref <opaque>', 'optional opaque reference to the experiment variant')
    .option('--observed-mode <mode>', `observed runtime-mode tag: ${OBSERVED_MODES.join(', ')}`)
    .option(
      '--result-ref <opaque>',
      'opaque reference to a stored result artifact (REQUIRED for evaluation-completed and experiment-result)'
    )
    .option('--result-digest <sha256>', 'optional canonical sha256 digest of the result artifact')
    .option(
      '--score-ref <opaque>',
      'optional opaque reference to a stored score artifact (score values are NEVER inlined)'
    )
    .option(
      '--from-state <name>',
      'free-form source state name (REQUIRED for workflow-transition; max 128 chars)'
    )
    .option(
      '--to-state <name>',
      'free-form destination state name (REQUIRED for workflow-transition; max 128 chars)'
    )
    .option(
      '--observed-at <rfc3339>',
      'RFC 3339 timestamp at which the EXTERNAL system observed the event (REQUIRED; no default-now)'
    )
    .option('--issuer-key <ref>', 'issuer key reference: env:VAR_NAME or file:/path/to/jwk.json')
    .option('--issuer-id <url>', 'canonical issuer URL recorded as `iss`')
    .option(
      '--unsafe-ephemeral-key',
      'Generate an ephemeral local signing key. The public key is not published through normal issuer-key discovery. Use only for local development and tests.',
      false
    )
    .option('--output <file>', 'output path for the JWS (default: stdout)', '-');

  cmd.action(async (rawOpts: Record<string, unknown>) => {
    const options: Partial<EmitLifecycleOptions> = {
      eventKind: rawOpts.eventKind as string | undefined,
      subjectRef: rawOpts.subjectRef as string | undefined,
      parentRef: rawOpts.parentRef as string | undefined,
      upstreamArtifactRef: rawOpts.upstreamArtifactRef as string | undefined,
      upstreamArtifactDigest: rawOpts.upstreamArtifactDigest as string | undefined,
      policyRef: rawOpts.policyRef as string | undefined,
      policyDigest: rawOpts.policyDigest as string | undefined,
      rubricRef: rawOpts.rubricRef as string | undefined,
      approvalRef: rawOpts.approvalRef as string | undefined,
      approverRef: rawOpts.approverRef as string | undefined,
      experimentRef: rawOpts.experimentRef as string | undefined,
      cohortRef: rawOpts.cohortRef as string | undefined,
      variantRef: rawOpts.variantRef as string | undefined,
      observedMode: rawOpts.observedMode as string | undefined,
      resultRef: rawOpts.resultRef as string | undefined,
      resultDigest: rawOpts.resultDigest as string | undefined,
      scoreRef: rawOpts.scoreRef as string | undefined,
      fromState: rawOpts.fromState as string | undefined,
      toState: rawOpts.toState as string | undefined,
      observedAt: rawOpts.observedAt as string | undefined,
      issuerKey: rawOpts.issuerKey as string | undefined,
      issuerId: rawOpts.issuerId as string | undefined,
      unsafeEphemeralKey: Boolean(rawOpts.unsafeEphemeralKey),
      output: (rawOpts.output as string) ?? '-',
    };

    const result = await runEmitLifecycle(options);
    process.exitCode = result.exitCode;
  });

  return cmd;
}

/**
 * Commander factory for the public `peac emit` parent group. Adds the
 * `lifecycle` subcommand. Additional `emit` subcommands can be
 * registered by their own profiles.
 */
export function emitCommand(): Command {
  const emit = new Command('emit').description(
    'Issue signed records over events emitted by external systems (caller-supplied event emission/export surface).'
  );
  emit.addCommand(emitLifecycleSubcommand());
  return emit;
}

/** Re-exports for tests. */
export { TYPE_URI_BY_EVENT_KIND, EVENT_KINDS, OBSERVED_MODES };
export type { ObservedMode };
