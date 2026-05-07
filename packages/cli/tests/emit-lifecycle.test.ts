/**
 * `peac emit lifecycle` subcommand tests.
 *
 * Drives the pure handler `runEmitLifecycle` directly. Exercises:
 *   - one positive vector per event kind (signed Wire 0.2 round-trip)
 *   - missing required flags (event-kind, subject-ref, observed-at)
 *   - malformed observed-at
 *   - missing per-event-kind required fields
 *   - missing issuer key + missing issuer-id
 *   - --issuer-key + --unsafe-ephemeral-key mutex
 *   - unsafe-ephemeral-key path produces a verifiable record
 *
 * Stdout/stderr are captured via injected IO; tests do not write to the
 * real process.stdout / process.stderr.
 */
import { describe, it, expect } from 'vitest';
import { decode, generateKeypair, base64urlEncode, verify } from '@peac/crypto';
import { LIFECYCLE_OBSERVATION_EXTENSION_KEY } from '@peac/schema';
import {
  emitCommand,
  emitLifecycleSubcommand,
  buildLifecycleObservation,
  validateEmitLifecycleOptions,
  runEmitLifecycle,
  EMIT_LIFECYCLE_ERROR_CODES,
  type EmitLifecycleOptions,
} from '../src/commands/emit-lifecycle';

interface CapturedIO {
  stdout: string;
  stderr: string;
}

function captureIO(env: NodeJS.ProcessEnv = {}) {
  const io: CapturedIO = { stdout: '', stderr: '' };
  return {
    io,
    handlers: {
      writeStdout: (c: string) => {
        io.stdout += c;
      },
      writeStderr: (c: string) => {
        io.stderr += c;
      },
      issuerKeyEnv: env,
    },
  };
}

const ISO_NOW = '2026-05-12T10:00:00Z';

const minimalOptionsFor = (
  eventKind: EmitLifecycleOptions['eventKind']
): Partial<EmitLifecycleOptions> => {
  const base: Partial<EmitLifecycleOptions> = {
    eventKind,
    subjectRef: 'urn:peac:task:test',
    observedAt: ISO_NOW,
    issuerId: 'https://issuer.example',
    unsafeEphemeralKey: true,
    output: '-',
  };
  switch (eventKind) {
    case 'lifecycle-approval-requested':
    case 'lifecycle-approval-granted':
    case 'lifecycle-approval-denied':
      return {
        ...base,
        approvalRef: 'urn:peac:approval:test',
        approverRef: 'ref:approver-test',
      };
    case 'lifecycle-evaluation-completed':
      return { ...base, resultRef: 'urn:peac:result:test' };
    case 'lifecycle-experiment-assigned':
      return { ...base, experimentRef: 'urn:peac:experiment:test' };
    case 'lifecycle-experiment-result':
      return {
        ...base,
        experimentRef: 'urn:peac:experiment:test',
        resultRef: 'urn:peac:result:test',
      };
    case 'lifecycle-workflow-transition':
      return { ...base, fromState: 'pending', toState: 'running' };
    case 'lifecycle-mode-observed':
      return { ...base, observedMode: 'agent_loop' };
    default:
      return base;
  }
};

describe('emit-lifecycle: positive cases (one per event kind)', () => {
  for (const eventKind of [
    'lifecycle-approval-requested',
    'lifecycle-approval-granted',
    'lifecycle-approval-denied',
    'lifecycle-evaluation-started',
    'lifecycle-evaluation-completed',
    'lifecycle-experiment-assigned',
    'lifecycle-experiment-result',
    'lifecycle-workflow-transition',
    'lifecycle-mode-observed',
  ]) {
    it(`${eventKind}: emits a Wire 0.2 JWS with --unsafe-ephemeral-key`, async () => {
      const { io, handlers } = captureIO();
      const result = await runEmitLifecycle(minimalOptionsFor(eventKind), handlers);
      expect(io.stderr, `stderr should be empty; got: ${io.stderr}`).toBe('');
      expect(result.exitCode).toBe(0);
      const jws = io.stdout.trim();
      expect(jws.split('.')).toHaveLength(3);
    });
  }
});

describe('emit-lifecycle: validateEmitLifecycleOptions', () => {
  it('reports missing --event-kind, --subject-ref, and --observed-at', () => {
    const failures = validateEmitLifecycleOptions({
      unsafeEphemeralKey: true,
      issuerId: 'https://issuer.example',
      output: '-',
    });
    const codes = failures.map((f) => f.code);
    expect(
      codes.filter((c) => c === EMIT_LIFECYCLE_ERROR_CODES.missingRequiredField).length
    ).toBeGreaterThanOrEqual(3);
  });

  it('reports invalid --event-kind', () => {
    const failures = validateEmitLifecycleOptions({
      eventKind: 'something-else',
      subjectRef: 'urn:peac:task:x',
      observedAt: ISO_NOW,
      issuerId: 'https://issuer.example',
      unsafeEphemeralKey: true,
      output: '-',
    });
    expect(failures.map((f) => f.code)).toContain(EMIT_LIFECYCLE_ERROR_CODES.eventKindUnknown);
  });

  it('reports malformed --observed-at', () => {
    const failures = validateEmitLifecycleOptions({
      eventKind: 'lifecycle-workflow-transition',
      subjectRef: 'urn:peac:task:x',
      observedAt: 'not-a-timestamp',
      fromState: 'pending',
      toState: 'running',
      issuerId: 'https://issuer.example',
      unsafeEphemeralKey: true,
      output: '-',
    });
    expect(failures.map((f) => f.code)).toContain(EMIT_LIFECYCLE_ERROR_CODES.invalidObservedAt);
  });

  it('reports missing per-event-kind required fields (approval-granted without approver-ref)', () => {
    const failures = validateEmitLifecycleOptions({
      eventKind: 'lifecycle-approval-granted',
      subjectRef: 'urn:peac:task:x',
      observedAt: ISO_NOW,
      approvalRef: 'urn:peac:approval:x',
      issuerId: 'https://issuer.example',
      unsafeEphemeralKey: true,
      output: '-',
    });
    expect(failures.map((f) => f.code)).toContain(EMIT_LIFECYCLE_ERROR_CODES.missingRequiredField);
  });

  it('reports missing per-event-kind required fields (workflow-transition without to-state)', () => {
    const failures = validateEmitLifecycleOptions({
      eventKind: 'lifecycle-workflow-transition',
      subjectRef: 'urn:peac:task:x',
      observedAt: ISO_NOW,
      fromState: 'pending',
      issuerId: 'https://issuer.example',
      unsafeEphemeralKey: true,
      output: '-',
    });
    expect(failures.map((f) => f.code)).toContain(EMIT_LIFECYCLE_ERROR_CODES.missingRequiredField);
  });

  it('reports missing signing inputs (no --issuer-key and no --unsafe-ephemeral-key)', () => {
    const failures = validateEmitLifecycleOptions({
      eventKind: 'lifecycle-workflow-transition',
      subjectRef: 'urn:peac:task:x',
      observedAt: ISO_NOW,
      fromState: 'pending',
      toState: 'running',
      issuerId: 'https://issuer.example',
      unsafeEphemeralKey: false,
      output: '-',
    });
    expect(failures.map((f) => f.code)).toContain(EMIT_LIFECYCLE_ERROR_CODES.issuerKeyRequired);
  });

  it('reports --issuer-key and --unsafe-ephemeral-key mutex', () => {
    const failures = validateEmitLifecycleOptions({
      eventKind: 'lifecycle-workflow-transition',
      subjectRef: 'urn:peac:task:x',
      observedAt: ISO_NOW,
      fromState: 'pending',
      toState: 'running',
      issuerKey: 'env:PEAC_TEST_KEY',
      issuerId: 'https://issuer.example',
      unsafeEphemeralKey: true,
      output: '-',
    });
    expect(failures.map((f) => f.code)).toContain(
      EMIT_LIFECYCLE_ERROR_CODES.unsafeEphemeralKeyMutex
    );
  });

  it('reports missing --issuer-id', () => {
    const failures = validateEmitLifecycleOptions({
      eventKind: 'lifecycle-workflow-transition',
      subjectRef: 'urn:peac:task:x',
      observedAt: ISO_NOW,
      fromState: 'pending',
      toState: 'running',
      unsafeEphemeralKey: true,
      output: '-',
    });
    expect(failures.map((f) => f.code)).toContain(EMIT_LIFECYCLE_ERROR_CODES.issuerIdRequired);
  });

  it('reports invalid --issuer-id (not https)', () => {
    const failures = validateEmitLifecycleOptions({
      eventKind: 'lifecycle-workflow-transition',
      subjectRef: 'urn:peac:task:x',
      observedAt: ISO_NOW,
      fromState: 'pending',
      toState: 'running',
      issuerId: 'http://issuer.example/peac',
      unsafeEphemeralKey: true,
      output: '-',
    });
    expect(failures.map((f) => f.code)).toContain(EMIT_LIFECYCLE_ERROR_CODES.issuerIdInvalid);
  });

  it('rejects --issuer-id with explicit :443 (canonical iss requires no default port)', () => {
    const failures = validateEmitLifecycleOptions({
      eventKind: 'lifecycle-workflow-transition',
      subjectRef: 'urn:peac:task:x',
      observedAt: ISO_NOW,
      fromState: 'pending',
      toState: 'running',
      issuerId: 'https://issuer.example:443',
      unsafeEphemeralKey: true,
      output: '-',
    });
    expect(failures.map((f) => f.code)).toContain(EMIT_LIFECYCLE_ERROR_CODES.issuerIdInvalid);
  });

  it('accepts canonical did: --issuer-id', () => {
    const failures = validateEmitLifecycleOptions({
      eventKind: 'lifecycle-workflow-transition',
      subjectRef: 'urn:peac:task:x',
      observedAt: ISO_NOW,
      fromState: 'pending',
      toState: 'running',
      issuerId: 'did:web:issuer.example',
      unsafeEphemeralKey: true,
      output: '-',
    });
    expect(failures.map((f) => f.code)).not.toContain(EMIT_LIFECYCLE_ERROR_CODES.issuerIdInvalid);
  });

  it('rejects empty --from-state with lifecycle.invalid_state', () => {
    const failures = validateEmitLifecycleOptions({
      eventKind: 'lifecycle-workflow-transition',
      subjectRef: 'urn:peac:task:x',
      observedAt: ISO_NOW,
      fromState: '',
      toState: 'running',
      issuerId: 'https://issuer.example',
      unsafeEphemeralKey: true,
      output: '-',
    });
    expect(failures.map((f) => f.code)).toContain(EMIT_LIFECYCLE_ERROR_CODES.invalidState);
  });

  it('rejects --from-state with leading whitespace (no silent trim)', () => {
    const failures = validateEmitLifecycleOptions({
      eventKind: 'lifecycle-workflow-transition',
      subjectRef: 'urn:peac:task:x',
      observedAt: ISO_NOW,
      fromState: ' pending',
      toState: 'running',
      issuerId: 'https://issuer.example',
      unsafeEphemeralKey: true,
      output: '-',
    });
    expect(failures.map((f) => f.code)).toContain(EMIT_LIFECYCLE_ERROR_CODES.invalidState);
  });

  it('rejects --observed-mode out of enum with lifecycle.invalid_observed_mode', () => {
    const failures = validateEmitLifecycleOptions({
      eventKind: 'lifecycle-mode-observed',
      subjectRef: 'urn:peac:run:m',
      observedAt: ISO_NOW,
      observedMode: 'bad-mode',
      issuerId: 'https://issuer.example',
      unsafeEphemeralKey: true,
      output: '-',
    });
    expect(failures.map((f) => f.code)).toContain(EMIT_LIFECYCLE_ERROR_CODES.invalidObservedMode);
  });
});

describe('emit-lifecycle: runEmitLifecycle non-zero exits', () => {
  it('missing --observed-at: stable code lifecycle.missing_required_field, non-zero exit', async () => {
    const { io, handlers } = captureIO();
    const result = await runEmitLifecycle(
      {
        eventKind: 'lifecycle-workflow-transition',
        subjectRef: 'urn:peac:task:x',
        fromState: 'pending',
        toState: 'running',
        issuerId: 'https://issuer.example',
        unsafeEphemeralKey: true,
        output: '-',
      },
      handlers
    );
    expect(result.exitCode).not.toBe(0);
    expect(io.stderr).toContain(EMIT_LIFECYCLE_ERROR_CODES.missingRequiredField);
  });

  it('malformed --observed-at: stable code lifecycle.invalid_observed_at, non-zero exit', async () => {
    const { io, handlers } = captureIO();
    const result = await runEmitLifecycle(
      {
        eventKind: 'lifecycle-workflow-transition',
        subjectRef: 'urn:peac:task:x',
        fromState: 'pending',
        toState: 'running',
        observedAt: 'yesterday afternoon',
        issuerId: 'https://issuer.example',
        unsafeEphemeralKey: true,
        output: '-',
      },
      handlers
    );
    expect(result.exitCode).not.toBe(0);
    expect(io.stderr).toContain(EMIT_LIFECYCLE_ERROR_CODES.invalidObservedAt);
  });

  it('missing issuer key with --unsafe-ephemeral-key=false yields cli.issuer_key_required', async () => {
    const { io, handlers } = captureIO();
    const result = await runEmitLifecycle(
      {
        eventKind: 'lifecycle-workflow-transition',
        subjectRef: 'urn:peac:task:x',
        observedAt: ISO_NOW,
        fromState: 'pending',
        toState: 'running',
        issuerId: 'https://issuer.example',
        unsafeEphemeralKey: false,
        output: '-',
      },
      handlers
    );
    expect(result.exitCode).not.toBe(0);
    expect(io.stderr).toContain(EMIT_LIFECYCLE_ERROR_CODES.issuerKeyRequired);
  });

  it('--issuer-key from env loads correctly and signs', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      d: base64urlEncode(privateKey),
      x: base64urlEncode(publicKey),
    };
    const env: NodeJS.ProcessEnv = {
      PEAC_LIFECYCLE_TEST_KEY: JSON.stringify(jwk),
    };
    const { io, handlers } = captureIO(env);
    const result = await runEmitLifecycle(
      {
        eventKind: 'lifecycle-workflow-transition',
        subjectRef: 'urn:peac:task:x',
        observedAt: ISO_NOW,
        fromState: 'pending',
        toState: 'running',
        issuerKey: 'env:PEAC_LIFECYCLE_TEST_KEY',
        issuerId: 'https://issuer.example',
        unsafeEphemeralKey: false,
        output: '-',
      },
      handlers
    );
    expect(io.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(io.stdout.trim().split('.')).toHaveLength(3);
  });
});

describe('emit-lifecycle: emitted JWS payload shape', () => {
  it('signed JWS decodes to a Wire 0.2 envelope with the expected type, iss, and lifecycle extension', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      d: base64urlEncode(privateKey),
      x: base64urlEncode(publicKey),
    };
    const env: NodeJS.ProcessEnv = {
      PEAC_LIFECYCLE_VERIFY_KEY: JSON.stringify(jwk),
    };
    const { io, handlers } = captureIO(env);
    const result = await runEmitLifecycle(
      {
        eventKind: 'lifecycle-workflow-transition',
        subjectRef: 'urn:peac:task:verify',
        observedAt: ISO_NOW,
        fromState: 'pending',
        toState: 'running',
        issuerKey: 'env:PEAC_LIFECYCLE_VERIFY_KEY',
        issuerId: 'https://issuer.example',
        unsafeEphemeralKey: false,
        output: '-',
      },
      handlers
    );
    expect(io.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    const jws = io.stdout.trim();
    const { header, payload } = decode<Record<string, unknown>>(jws);

    // Header shape (Wire 0.2 typ + EdDSA + kid).
    expect(header.typ).toBe('interaction-record+jwt');
    expect(header.alg).toBe('EdDSA');
    expect(typeof header.kid).toBe('string');

    // Payload shape per spec §2 envelope contract.
    expect(payload.peac_version).toBe('0.2');
    expect(payload.kind).toBe('evidence');
    expect(payload.type).toBe('org.peacprotocol/lifecycle-workflow-transition');
    expect(payload.iss).toBe('https://issuer.example');

    // Lifecycle extension shape per profile §5.
    const extensions = payload.extensions as Record<string, unknown>;
    expect(extensions).toBeDefined();
    const observation = extensions[LIFECYCLE_OBSERVATION_EXTENSION_KEY] as Record<string, unknown>;
    expect(observation).toBeDefined();
    expect(observation.event_kind).toBe('lifecycle-workflow-transition');
    expect(observation.subject_ref).toBe('urn:peac:task:verify');
    expect(observation.observed_at).toBe(ISO_NOW);
    expect(observation.from_state).toBe('pending');
    expect(observation.to_state).toBe('running');

    // Signature verifies under the caller-provided issuer key.
    const verifyResult = await verify(jws, publicKey);
    expect(verifyResult.valid).toBe(true);
  });
});

describe('emit-lifecycle: Commander factories', () => {
  it('emitCommand() exposes a `lifecycle` subcommand', () => {
    const cmd = emitCommand();
    const help = cmd.helpInformation();
    expect(help).toContain('lifecycle');
  });

  it('emitLifecycleSubcommand() advertises core flags in help', () => {
    const cmd = emitLifecycleSubcommand();
    const help = cmd.helpInformation();
    expect(help).toContain('--event-kind');
    expect(help).toContain('--subject-ref');
    expect(help).toContain('--observed-at');
    expect(help).toContain('--issuer-key');
    expect(help).toContain('--issuer-id');
    expect(help).toContain('--unsafe-ephemeral-key');
  });
});

describe('emit-lifecycle: buildLifecycleObservation', () => {
  it('omits unset optional fields', () => {
    const obs = buildLifecycleObservation({
      eventKind: 'lifecycle-workflow-transition',
      subjectRef: 'urn:peac:task:x',
      observedAt: ISO_NOW,
      fromState: 'pending',
      toState: 'running',
      issuerId: 'https://issuer.example',
      unsafeEphemeralKey: true,
      output: '-',
    });
    expect(obs).toEqual({
      event_kind: 'lifecycle-workflow-transition',
      subject_ref: 'urn:peac:task:x',
      observed_at: ISO_NOW,
      from_state: 'pending',
      to_state: 'running',
    });
  });

  it('forwards optional opaque-ref fields when supplied', () => {
    const obs = buildLifecycleObservation({
      eventKind: 'lifecycle-evaluation-completed',
      subjectRef: 'urn:peac:eval:x',
      observedAt: ISO_NOW,
      resultRef: 'urn:peac:result:x',
      policyRef: 'urn:peac:policy:x',
      rubricRef: 'urn:peac:rubric:x',
      issuerId: 'https://issuer.example',
      unsafeEphemeralKey: true,
      output: '-',
    });
    expect(obs.policy_ref).toBe('urn:peac:policy:x');
    expect(obs.rubric_ref).toBe('urn:peac:rubric:x');
    expect(obs.result_ref).toBe('urn:peac:result:x');
  });
});
