/**
 * `peac record command` end-to-end tests.
 *
 * Drives the pure handler `runRecordCommand` so tests do not depend
 * on a built CJS bin. Spawns real child processes through the shared
 * `runObservationCore` so the same capture / build / validate path
 * exercised by observe command is exercised here too. The signing
 * step uses `@peac/protocol.issue()` (no test-only signing path).
 *
 * Local round-trip: tests verify the emitted JWS using
 * `@peac/crypto.decode` + `verify(publicKey)` so signing correctness
 * is proven without needing an external verifier.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  runRecordCommand,
  validateRecordOptions,
  RECORD_COMMAND_ERROR_CODES,
  recordCommand,
  recordCommandSubcommand,
  type RecordCommandOptions,
} from '../src/commands/record-command';
import {
  CliExecutionSchema,
  CLI_COMMAND_EXECUTION_TYPE,
  CLI_EXECUTION_EXTENSION_KEY,
} from '@peac/schema';
import { decode, verify, generateKeypair, base64urlEncode } from '@peac/crypto';

const NODE = process.execPath;
const ISSUER_ID = 'https://issuer.example';

interface CapturedIo {
  stdout: string;
  stderr: string;
  writeStdout: (c: string) => void;
  writeStderr: (c: string) => void;
}

function captureIo(): CapturedIo {
  const io = { stdout: '', stderr: '' } as CapturedIo;
  io.writeStdout = (c) => {
    io.stdout += c;
  };
  io.writeStderr = (c) => {
    io.stderr += c;
  };
  return io;
}

/** Generate an Ed25519 JWK (private+public) for test fixtures. */
async function freshJwk(kid?: string): Promise<{
  jwk: Record<string, string>;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}> {
  const { privateKey, publicKey } = await generateKeypair();
  const jwk: Record<string, string> = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: base64urlEncode(publicKey),
    d: base64urlEncode(privateKey),
  };
  if (kid) jwk.kid = kid;
  return { jwk, privateKey, publicKey };
}

function defaultOpts(): RecordCommandOptions {
  return {
    captureMode: 'hashed',
    unsafeAllowRawCapture: false,
    captureStdinMode: 'none',
    captureStdoutBytes: 16384,
    captureStderrBytes: 16384,
    captureArgvBytes: 4096,
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
    timeoutMs: 600_000,
    killGraceMs: 5_000,
    exitCodeMode: 'child',
    unsafeEphemeralKey: false,
  };
}

describe('record command: --issuer-key file:<path> emits a signed Wire 0.2 JWS', () => {
  it('emits a compact JWS that locally verifies and contains the observation', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'peac-rec-jwk-'));
    const keyPath = join(tmp, 'issuer.jwk.json');
    try {
      const { jwk, publicKey } = await freshJwk('test-kid-001');
      writeFileSync(keyPath, JSON.stringify(jwk));
      const io = captureIo();
      const result = await runRecordCommand(
        { issuerKey: `file:${keyPath}`, issuerId: ISSUER_ID },
        [NODE, '-e', 'process.stdout.write("ok")'],
        {
          writeStdout: io.writeStdout,
          writeStderr: io.writeStderr,
          captureEnv: {},
          issuerKeyEnv: {},
        }
      );
      expect(result.exitCode).toBe(0);

      const jws = io.stdout.trim();
      // Compact JWS: three base64url segments joined by '.'
      expect(jws.split('.').length).toBe(3);

      // Local verification with the public key from the same JWK.
      const verified = await verify<Record<string, unknown>>(jws, publicKey);
      expect(verified).toBeDefined();

      // Decode payload and confirm structure.
      const { header, payload } = decode<Record<string, unknown>>(jws);
      expect(header.typ).toBe('interaction-record+jwt');
      expect(header.kid).toBe('test-kid-001');
      expect(payload.iss).toBe(ISSUER_ID);
      expect(payload.type).toBe(CLI_COMMAND_EXECUTION_TYPE);

      // Observation lives under payload.extensions[<key>] (Wire 0.2).
      const extensions = (payload as Record<string, unknown>).extensions as Record<string, unknown>;
      const ext = extensions[CLI_EXECUTION_EXTENSION_KEY] as Record<string, unknown>;
      expect(ext).toBeDefined();
      expect(ext.type).toBe(CLI_COMMAND_EXECUTION_TYPE);
      const validated = CliExecutionSchema.safeParse(ext);
      if (!validated.success) {
        throw new Error(
          `embedded observation failed schema: ${JSON.stringify(validated.error.issues)}`
        );
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 20_000);
});

describe('record command: --issuer-key env:<VAR> works', () => {
  it('loads the JWK from the supplied env var', async () => {
    const { jwk, publicKey } = await freshJwk('env-kid-001');
    const io = captureIo();
    const result = await runRecordCommand(
      { issuerKey: 'env:PEAC_TEST_ISSUER_KEY', issuerId: ISSUER_ID },
      [NODE, '-e', 'process.exit(0)'],
      {
        writeStdout: io.writeStdout,
        writeStderr: io.writeStderr,
        captureEnv: {},
        issuerKeyEnv: { PEAC_TEST_ISSUER_KEY: JSON.stringify(jwk) },
      }
    );
    expect(result.exitCode).toBe(0);
    const jws = io.stdout.trim();
    await verify(jws, publicKey);
    const { header } = decode(jws);
    expect(header.kid).toBe('env-kid-001');
  }, 20_000);
});

describe('record command: signing-input mutex and required', () => {
  it('missing both --issuer-key and --unsafe-ephemeral-key fails with cli.signing_input_required', async () => {
    const io = captureIo();
    const result = await runRecordCommand(
      { issuerId: ISSUER_ID },
      [NODE, '-e', 'process.exit(0)'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    expect(result.exitCode).toBe(2);
    expect(io.stderr).toContain(RECORD_COMMAND_ERROR_CODES.signingInputRequired);
    expect(io.stdout).toBe('');
  });

  it('both --issuer-key and --unsafe-ephemeral-key fails with cli.signing_input_conflict', async () => {
    const io = captureIo();
    const result = await runRecordCommand(
      {
        issuerKey: 'env:UNUSED',
        unsafeEphemeralKey: true,
        issuerId: ISSUER_ID,
      },
      [NODE, '-e', 'process.exit(0)'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    expect(result.exitCode).toBe(2);
    expect(io.stderr).toContain(RECORD_COMMAND_ERROR_CODES.signingInputConflict);
  });

  it('missing --issuer-id fails with cli.issuer_id_required', async () => {
    const io = captureIo();
    const result = await runRecordCommand(
      { unsafeEphemeralKey: true },
      [NODE, '-e', 'process.exit(0)'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    expect(result.exitCode).toBe(2);
    expect(io.stderr).toContain(RECORD_COMMAND_ERROR_CODES.issuerIdRequired);
  });
});

describe('record command: bad JWK rejection', () => {
  it('non-JSON file fails with cli.issuer_key_invalid', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'peac-rec-badjwk-'));
    const keyPath = join(tmp, 'not-json.jwk.json');
    try {
      writeFileSync(keyPath, 'this is not json');
      const io = captureIo();
      const result = await runRecordCommand(
        { issuerKey: `file:${keyPath}`, issuerId: ISSUER_ID },
        [NODE, '-e', 'process.exit(99)'],
        { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
      );
      expect(result.exitCode).toBe(2);
      expect(io.stderr).toContain(RECORD_COMMAND_ERROR_CODES.issuerKeyInvalid);
      // Child must NOT have run (key load happens before the child).
      expect(result.exitCode).not.toBe(99);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('missing file fails with cli.issuer_key_load_failed', async () => {
    const io = captureIo();
    const result = await runRecordCommand(
      { issuerKey: 'file:/definitely/missing/issuer.jwk.json', issuerId: ISSUER_ID },
      [NODE, '-e', 'process.exit(99)'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    expect(result.exitCode).toBe(2);
    expect(io.stderr).toContain(RECORD_COMMAND_ERROR_CODES.issuerKeyLoadFailed);
  });

  it('JWK with mismatched x/d fails with cli.issuer_key_invalid', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'peac-rec-mismatched-'));
    const keyPath = join(tmp, 'mismatched.jwk.json');
    try {
      const a = await freshJwk();
      const b = await freshJwk();
      // Build a JWK with `d` from one keypair and `x` from another.
      const tampered = { kty: 'OKP', crv: 'Ed25519', d: a.jwk.d, x: b.jwk.x };
      writeFileSync(keyPath, JSON.stringify(tampered));
      const io = captureIo();
      const result = await runRecordCommand(
        { issuerKey: `file:${keyPath}`, issuerId: ISSUER_ID },
        [NODE, '-e', 'process.exit(0)'],
        { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
      );
      expect(result.exitCode).toBe(2);
      expect(io.stderr).toContain(RECORD_COMMAND_ERROR_CODES.issuerKeyInvalid);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('record command: --unsafe-ephemeral-key', () => {
  it('produces a structurally valid JWS without a JWK on disk', async () => {
    const io = captureIo();
    const result = await runRecordCommand(
      { unsafeEphemeralKey: true, issuerId: ISSUER_ID },
      [NODE, '-e', 'process.exit(0)'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    expect(result.exitCode).toBe(0);
    const jws = io.stdout.trim();
    expect(jws.split('.').length).toBe(3);
    const { header, payload } = decode(jws);
    expect(header.typ).toBe('interaction-record+jwt');
    expect((payload as Record<string, unknown>).iss).toBe(ISSUER_ID);
  }, 20_000);

  it('subcommand help text warns local/dev only and that the public key is not published', () => {
    const cmd = recordCommandSubcommand();
    // Commander wraps long flag descriptions across multiple lines;
    // collapse whitespace so substring assertions are robust to width.
    const help = cmd.helpInformation().toLowerCase().replace(/\s+/g, ' ');
    expect(help).toContain('ephemeral local signing key');
    expect(help).toContain('use only for local development and tests');
    expect(help).toContain('not published through normal issuer-key discovery');
  });

  it('parent group help lists the `command` subcommand', () => {
    const help = recordCommand().helpInformation();
    expect(help).toMatch(/\bcommand\b/);
  });
});

describe('record command: exit-code mode', () => {
  it('default child mode mirrors child exit code AND emits the record', async () => {
    const io = captureIo();
    const result = await runRecordCommand(
      { unsafeEphemeralKey: true, issuerId: ISSUER_ID },
      [NODE, '-e', 'process.exit(7)'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    expect(result.exitCode).toBe(7);
    const jws = io.stdout.trim();
    expect(jws.split('.').length).toBe(3);
    const { payload } = decode(jws);
    const extensions = (payload as Record<string, unknown>).extensions as Record<string, unknown>;
    const ext = extensions[CLI_EXECUTION_EXTENSION_KEY] as Record<string, unknown>;
    expect(ext.exit_code).toBe(7);
  }, 20_000);

  it('record mode exits 0 if the signed record was emitted', async () => {
    const io = captureIo();
    const result = await runRecordCommand(
      { unsafeEphemeralKey: true, issuerId: ISSUER_ID, exitCodeMode: 'record' },
      [NODE, '-e', 'process.exit(7)'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    expect(result.exitCode).toBe(0);
    const { payload } = decode(io.stdout.trim());
    const extensions = (payload as Record<string, unknown>).extensions as Record<string, unknown>;
    const ext = extensions[CLI_EXECUTION_EXTENSION_KEY] as Record<string, unknown>;
    expect(ext.exit_code).toBe(7);
    expect(ext.exit_code_mode).toBe('record');
  }, 20_000);
});

describe('record command: --output preflight blocks child execution', () => {
  it('unwritable --output exits 2 with cli.output_write_failed and child does not run', async () => {
    const io = captureIo();
    const marker = join(mkdtempSync(join(tmpdir(), 'peac-rec-marker-')), 'child-ran.txt');
    try {
      const result = await runRecordCommand(
        {
          unsafeEphemeralKey: true,
          issuerId: ISSUER_ID,
          output: '/definitely/missing/dir/peac-rec.jws',
        },
        [
          NODE,
          '-e',
          `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x'); process.exit(99)`,
        ],
        { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
      );
      expect(result.exitCode).toBe(2);
      expect(io.stderr).toContain(RECORD_COMMAND_ERROR_CODES.outputWriteFailed);
      expect(existsSync(marker)).toBe(false);
      expect(result.exitCode).not.toBe(99);
    } finally {
      try {
        rmSync(marker, { force: true });
      } catch {
        // ignore
      }
    }
  }, 15_000);
});

describe('record command: --issuer-id preflight blocks child execution', () => {
  it('non-canonical --issuer-id exits 2 with cli.issuer_id_invalid and child does not run', async () => {
    const io = captureIo();
    const marker = join(mkdtempSync(join(tmpdir(), 'peac-rec-iss-')), 'child-ran.txt');
    try {
      const result = await runRecordCommand(
        { unsafeEphemeralKey: true, issuerId: 'not-canonical-iss' },
        [
          NODE,
          '-e',
          `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x'); process.exit(99)`,
        ],
        { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
      );
      expect(result.exitCode).toBe(2);
      expect(io.stderr).toContain(RECORD_COMMAND_ERROR_CODES.issuerIdInvalid);
      // Child must NOT have run (preflight runs before captureCommand).
      expect(existsSync(marker)).toBe(false);
      expect(result.exitCode).not.toBe(99);
      expect(io.stdout).toBe('');
    } finally {
      try {
        rmSync(marker, { force: true });
      } catch {
        // ignore
      }
    }
  });
});

describe('record command: path leakage discipline (shared with observe command)', () => {
  it('default hashed binary path does not leak the absolute resolved program path', async () => {
    const io = captureIo();
    await runRecordCommand(
      { unsafeEphemeralKey: true, issuerId: ISSUER_ID },
      [NODE, '-e', 'process.exit(0)'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    // Absolute path of the test runner's node binary must not appear
    // anywhere in the JWS string (compact JWS is base64url; no path
    // strings expected).
    expect(io.stdout.includes(NODE)).toBe(false);
    const { payload } = decode(io.stdout.trim());
    const extensions = (payload as Record<string, unknown>).extensions as Record<string, unknown>;
    const ext = extensions[CLI_EXECUTION_EXTENSION_KEY] as Record<string, unknown>;
    const command = ext.command as { program: string };
    expect(/[\\/]/.test(command.program)).toBe(false);
  }, 20_000);
});

describe('record command: shares observe command capture semantics', () => {
  it('emitted record validates with CliExecutionSchema (same shape as observe command)', async () => {
    const io = captureIo();
    await runRecordCommand(
      { unsafeEphemeralKey: true, issuerId: ISSUER_ID },
      [NODE, '-e', 'process.stdout.write("hello")'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    const { payload } = decode(io.stdout.trim());
    const extensions = (payload as Record<string, unknown>).extensions as Record<string, unknown>;
    const ext = extensions[CLI_EXECUTION_EXTENSION_KEY];
    const result = CliExecutionSchema.safeParse(ext);
    if (!result.success) {
      throw new Error(`shared schema rejected record: ${JSON.stringify(result.error.issues)}`);
    }
    // Stream sha256 matches the streaming-capture invariants exercised
    // by the observe command tests; capture pipeline is shared.
    expect(result.data.stdout_ref.length).toBe(5);
    expect(result.data.stdout_ref.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
  }, 20_000);
});

describe('record command: validation hard-fails surface stable codes', () => {
  it('rejects out-of-range --timeout-ms', () => {
    const failures = validateRecordOptions(
      {
        ...defaultOpts(),
        unsafeEphemeralKey: true,
        issuerId: ISSUER_ID,
        timeoutMs: 999_999_999_999,
      },
      [NODE]
    );
    expect(failures.some((f) => f.code === RECORD_COMMAND_ERROR_CODES.outOfRange)).toBe(true);
  });

  it('rejects shell binary without --shell-mode', () => {
    const failures = validateRecordOptions(
      { ...defaultOpts(), unsafeEphemeralKey: true, issuerId: ISSUER_ID },
      ['/bin/sh', '-c', 'echo hi']
    );
    expect(failures.some((f) => f.code === RECORD_COMMAND_ERROR_CODES.shellModeRequired)).toBe(
      true
    );
  });
});
