/**
 * README quickstart doc-truth test.
 *
 * Verifies that the repo README "Verify a record offline" quickstart stays
 * truthful against the shipped @peac/cli surface:
 *
 *   1. Static doc-truth: the README documents the exact offline one-liner
 *      (`samples generate` then `verify --public-key`) inside the quickstart
 *      block in order; the sample id is backed by a committed definition; and
 *      the success literal asserted by the runtime check is the real CLI
 *      output.
 *   2. Referenced-surface checks: the other commands, packages, scripts, and
 *      surfaces referenced in the block exist.
 *   3. Runtime end-to-end check (offline): spawn the built local CLI, check the
 *      public CLI surface via --help, generate samples, verify one sample
 *      offline with a public key (asserting the documented success output),
 *      cross-check with verifyLocal, and confirm a schema-preserving tampered
 *      record fails with E_INVALID_SIGNATURE.
 *
 * The runtime check uses the built local bin (`node dist/index.cjs`), not
 * `pnpm dlx @peac/cli` (CI must not fetch npm). The README's public
 * `pnpm dlx @peac/cli ...` copy is locked by the static assertions instead, so
 * the published copy-paste form stays covered while CI stays offline and
 * deterministic.
 *
 * Offline behavior: this test exercises the `--public-key` branch, which
 * verifies against the supplied key and does not require issuer discovery.
 * Lower-level CLI tests (packages/cli/tests/verify-public-key-cli.test.ts)
 * cover the no-network behavior of that branch; this test avoids brittle
 * cross-process fetch interception.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyLocal } from '@peac/protocol';
import { jwkToPublicKeyBytes } from '@peac/crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const README_PATH = join(REPO_ROOT, 'README.md');
const CLI_INDEX_SRC = join(REPO_ROOT, 'packages', 'cli', 'src', 'index.ts');
const CLI_BIN = join(REPO_ROOT, 'packages', 'cli', 'dist', 'index.cjs');

const README_TEXT = readFileSync(README_PATH, 'utf8');
const CLI_INDEX_TEXT = readFileSync(CLI_INDEX_SRC, 'utf8');

const SPAWN_TIMEOUT_MS = 15_000;

// The exact public copy-paste the README promises a new developer (the lines
// under the "Verify a record offline" heading). These are locked verbatim.
const HEADING = '## Verify a record offline';
const GENERATE_CMD = 'pnpm dlx @peac/cli samples generate -o ./s';
const VERIFY_CMD =
  'pnpm dlx @peac/cli verify ./s/valid/basic-record.jws --public-key ./s/bundles/sandbox-jwks.json';
// The load-bearing offline success line printed by the CLI; the runtime check
// asserts this literal, so the static half pins it to the CLI source.
const SUCCESS_LITERAL = 'Signature valid (offline).';

/** The "Try it in 5 minutes" section body, from its heading to the next H2. */
function tryItBlock(): string {
  const start = README_TEXT.indexOf(HEADING);
  if (start === -1) return '';
  const next = README_TEXT.indexOf('\n## ', start + HEADING.length);
  return README_TEXT.slice(start, next === -1 ? undefined : next);
}

function readJson(path: string): { name?: string; scripts?: Record<string, string> } {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function runCli(args: string[]): {
  status: number;
  stdout: string;
  stderr: string;
  output: string;
} {
  try {
    const stdout = execFileSync('node', [CLI_BIN, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: SPAWN_TIMEOUT_MS,
    });
    return { status: 0, stdout, stderr: '', output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    const stdout = e.stdout ?? '';
    const stderr = e.stderr ?? '';
    return { status: e.status ?? -1, stdout, stderr, output: `${stdout}${stderr}` };
  }
}

/** Decode a compact-JWS payload segment to its claims object. */
function decodePayload(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>;
}

/** Re-encode a claims object to a compact-JWS payload segment. */
function encodePayload(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

// --- Programmatic quickstart ("## Use PEAC in code") -------------------------
// The documented example is a single-package @peac/protocol program. It is
// extracted from the README and executed, not merely asserted by prose. It runs
// under examples/minimal so the @peac/protocol workspace package resolves the
// same way `pnpm --filter @peac/example-minimal demo` does, with no npm fetch.

const MINIMAL_DIR = join(REPO_ROOT, 'examples', 'minimal');
const TSX_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const ROOT_PKG_PATH = join(REPO_ROOT, 'package.json');
const FACTS_PATH = join(REPO_ROOT, 'docs', 'releases', 'facts.json');
const CODE_HEADING = '## Use PEAC in code';
const NVMRC_PATH = join(REPO_ROOT, '.nvmrc');
const GOMOD_PATH = join(REPO_ROOT, 'sdks', 'go', 'go.mod');

/** The body of the "## Use PEAC in code" section (up to the next H2). */
function codeSection(): string {
  const start = README_TEXT.indexOf(CODE_HEADING);
  if (start === -1) return '';
  const next = README_TEXT.indexOf('\n## ', start + CODE_HEADING.length);
  return README_TEXT.slice(start, next === -1 ? undefined : next);
}

/** The TypeScript program documented under "## Use PEAC in code". */
function extractCodeExample(): string {
  const fence = /```typescript\n([\s\S]*?)\n```/.exec(codeSection());
  return fence ? fence[1] : '';
}

/**
 * The expected-output lines shown directly beneath the code block (the `text`
 * fence following the TypeScript fence). The execution test asserts the program
 * prints exactly these, so the documented output and the executed output cannot
 * drift apart; there is no second, independently maintained literal.
 */
function extractExpectedOutput(): string[] {
  const section = codeSection();
  const ts = /```typescript\n[\s\S]*?\n```/.exec(section);
  const after = ts ? section.slice(ts.index + ts[0].length) : section;
  const fence = /```text\n([\s\S]*?)\n```/.exec(after);
  if (!fence) return [];
  return fence[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

describe('README quickstart: copy matches the CLI surface (static)', () => {
  it('README has the "Verify a record offline" heading', () => {
    expect(README_TEXT).toContain(HEADING);
  });

  it('the offline one-liner appears inside the quickstart block, generate before verify', () => {
    const block = tryItBlock();
    const gen = block.indexOf(GENERATE_CMD);
    const verify = block.indexOf(VERIFY_CMD);
    expect(gen, 'generate command in the "Try it in 5 minutes" block').toBeGreaterThan(-1);
    expect(verify, 'verify command in the "Try it in 5 minutes" block').toBeGreaterThan(-1);
    expect(gen, 'generate must be documented before verify').toBeLessThan(verify);
  });

  it('the README sample id (`basic-record`) is backed by a committed sample definition', () => {
    // The README path ./s/valid/basic-record.jws must name a real sample the
    // generator emits; its canonical definition is committed under the
    // conformance samples source the CLI reads from.
    expect(
      existsSync(join(REPO_ROOT, 'specs', 'conformance', 'samples', 'valid', 'basic-record.json'))
    ).toBe(true);
  });

  it('the documented success literal is the real offline CLI output', () => {
    // Pin the runtime-asserted string to the CLI source so a wording change
    // breaks this test loudly instead of silently diverging from the README.
    expect(CLI_INDEX_TEXT).toContain(SUCCESS_LITERAL);
  });
});

describe('README quickstart: referenced commands and packages resolve', () => {
  it('the minimal example exists with the referenced `demo` script', () => {
    const pkg = readJson(join(REPO_ROOT, 'examples', 'minimal', 'package.json'));
    expect(pkg.name).toBe('@peac/example-minimal');
    expect(pkg.scripts?.demo).toBeTruthy();
    expect(README_TEXT).toContain('@peac/example-minimal');
  });

  it('the MCP gateway example exists with the referenced `demo` + `demo:tamper` scripts', () => {
    const pkg = readJson(join(REPO_ROOT, 'examples', 'mcp-gateway-receipts', 'package.json'));
    expect(pkg.name).toBe('@peac/example-mcp-gateway-receipts');
    expect(pkg.scripts?.demo).toBeTruthy();
    expect(pkg.scripts?.['demo:tamper']).toBeTruthy();
    expect(README_TEXT).toContain('@peac/example-mcp-gateway-receipts');
  });

  it('the provisioning example exists with the referenced `issue` + `verify` scripts', () => {
    const pkg = readJson(join(REPO_ROOT, 'examples', 'provisioning-lifecycle', 'package.json'));
    expect(pkg.name).toBe('@peac/example-provisioning-lifecycle');
    expect(pkg.scripts?.issue).toBeTruthy();
    expect(pkg.scripts?.verify).toBeTruthy();
    expect(README_TEXT).toContain('@peac/example-provisioning-lifecycle');
  });

  it('the referenced MCP server package and reference verifier surface exist', () => {
    const mcp = readJson(join(REPO_ROOT, 'packages', 'mcp-server', 'package.json'));
    expect(mcp.name).toBe('@peac/mcp-server');
    expect(README_TEXT).toContain('@peac/mcp-server');
    expect(existsSync(join(REPO_ROOT, 'surfaces', 'reference-verifier'))).toBe(true);
    expect(README_TEXT).toContain('surfaces/reference-verifier/');
  });
});

describe('README quickstart: runs end-to-end offline with the built CLI', () => {
  let tmp: string;
  let generated: ReturnType<typeof runCli>;

  beforeAll(() => {
    if (!existsSync(CLI_BIN)) {
      throw new Error('CLI not built. Run "pnpm --filter @peac/cli build" first.');
    }
    tmp = mkdtempSync(join(tmpdir(), 'peac-readme-quickstart-'));
    // Built local bin, not `pnpm dlx` (no npm fetch in CI).
    generated = runCli(['samples', 'generate', '-o', tmp]);
  });

  afterAll(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it('the public CLI surface (--help) exposes the documented commands and flags', () => {
    const genHelp = runCli(['samples', 'generate', '--help']);
    expect(genHelp.status, genHelp.output).toBe(0);
    expect(genHelp.output).toContain('-o, --output <dir>');
    const verifyHelp = runCli(['verify', '--help']);
    expect(verifyHelp.status, verifyHelp.output).toBe(0);
    expect(verifyHelp.output).toContain('--public-key <path>');
  });

  it('`samples generate` exits 0 and writes the documented artifacts', () => {
    expect(generated.status, generated.output).toBe(0);
    expect(existsSync(join(tmp, 'valid', 'basic-record.jws'))).toBe(true);
    expect(existsSync(join(tmp, 'bundles', 'sandbox-jwks.json'))).toBe(true);
  });

  it('`verify --public-key` succeeds offline and prints the documented literal', () => {
    const result = runCli([
      'verify',
      join(tmp, 'valid', 'basic-record.jws'),
      '--public-key',
      join(tmp, 'bundles', 'sandbox-jwks.json'),
    ]);
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain(SUCCESS_LITERAL);
  });

  it('verifyLocal cross-check: basic-record verifies against the sandbox key', async () => {
    const jwks = JSON.parse(readFileSync(join(tmp, 'bundles', 'sandbox-jwks.json'), 'utf8'));
    expect(Array.isArray(jwks.keys)).toBe(true);
    expect(jwks.keys.length).toBe(1);
    const publicKey = jwkToPublicKeyBytes(jwks.keys[0]);
    const jws = readFileSync(join(tmp, 'valid', 'basic-record.jws'), 'utf8').trim();
    const result = await verifyLocal(jws, publicKey);
    expect(result.valid, result.valid ? 'valid' : result.code).toBe(true);
  });

  it('a schema-preserving tampered record fails closed (E_INVALID_SIGNATURE)', () => {
    // Keep the payload valid JSON and record-shaped (mutate an existing field),
    // so the failure is specifically a signature mismatch, not a parse/format
    // error: prove valid-shaped payload + unchanged signature = invalid.
    const jws = readFileSync(join(tmp, 'valid', 'basic-record.jws'), 'utf8').trim();
    const parts = jws.split('.');
    expect(parts.length).toBe(3);

    const payload = decodePayload(parts[1]);
    expect(typeof payload.jti).toBe('string');
    payload.jti = `${payload.jti}-tampered`;
    parts[1] = encodePayload(payload);

    const tamperedPath = join(tmp, 'tampered.jws');
    writeFileSync(tamperedPath, parts.join('.'));

    const result = runCli([
      'verify',
      tamperedPath,
      '--public-key',
      join(tmp, 'bundles', 'sandbox-jwks.json'),
    ]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('Verification failed');
    expect(result.output).toContain('E_INVALID_SIGNATURE');
  });
});

describe('README programmatic quickstart is self-contained and executable', () => {
  it('the code block imports only @peac/protocol and fails closed', () => {
    const code = extractCodeExample();
    expect(code, 'a TypeScript block under "## Use PEAC in code"').not.toBe('');
    // Single-package quickstart: every @peac import resolves to @peac/protocol.
    const imports = [...code.matchAll(/from '(@peac\/[^']+)'/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    expect([...new Set(imports)]).toEqual(['@peac/protocol']);
    // Fails closed: non-zero exit on error, no swallowed rejection.
    expect(code).toContain('process.exitCode = 1');
    expect(code).not.toContain('main().catch(console.error)');
    // Does not teach unsafe first-key selection, and prints no private key.
    expect(code).not.toContain('keys[0]');
    expect(code).not.toMatch(/console\.log\([^)]*privateKey/);
    // The README documents no internal build-output run path (guarded repo-wide
    // by the "forbid dist imports" invariant; also asserted here for the README).
    expect(README_TEXT, 'README must not document an internal build-output path').not.toMatch(
      /packages\/[^/]+\/dist/
    );
    // The reader sees the program's expected output beneath the code block.
    expect(
      extractExpectedOutput().length,
      'an expected-output block beneath the code'
    ).toBeGreaterThan(0);
  });

  it('the documented program compiles and runs offline, printing the documented output', () => {
    const code = extractCodeExample();
    expect(code).not.toBe('');
    const tmp = mkdtempSync(join(MINIMAL_DIR, '.readme-example-'));
    try {
      const file = join(tmp, 'quickstart.mts');
      writeFileSync(file, code, 'utf8');
      const run = spawnSync(TSX_BIN, [file], {
        encoding: 'utf8',
        timeout: 60_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const detail = `exit=${run.status} signal=${run.signal ?? 'none'}\nstdout:\n${run.stdout ?? ''}\nstderr:\n${run.stderr ?? ''}`;
      expect(run.status, detail).toBe(0);
      // Assert the exact output the README shows the reader, extracted from the
      // README itself so the two cannot drift.
      const expected = extractExpectedOutput();
      expect(expected.length, 'expected-output lines in the README').toBeGreaterThan(0);
      for (const line of expected) {
        expect(run.stdout, detail).toContain(line);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('README runtime-support truth', () => {
  it('the Node floor is identical across root package.json, facts.json, and the README', () => {
    const rootPkg = readJson(ROOT_PKG_PATH) as { engines?: { node?: string } };
    const facts = JSON.parse(readFileSync(FACTS_PATH, 'utf8')) as {
      runtime?: { node_minimum?: string };
    };
    const rootFloor = rootPkg.engines?.node;
    const factsFloor = facts.runtime?.node_minimum;
    expect(rootFloor, 'root package.json engines.node').toBeTruthy();
    expect(rootFloor, 'engines.node must match facts.runtime.node_minimum').toBe(factsFloor);
    // The README must state the exact floor, never a generic "Node 22+".
    expect(README_TEXT).toContain(`Node ${rootFloor}`);
    expect(README_TEXT).not.toMatch(/Node 22\+/);
  });

  it('the canonical Node major in the README matches the repo toolchain pin (.nvmrc)', () => {
    const pin = readFileSync(NVMRC_PATH, 'utf8').trim();
    const major = pin.split('.')[0];
    expect(major, '.nvmrc major version').toMatch(/^\d+$/);
    expect(README_TEXT).toContain(`Node ${major} is the canonical tested runtime`);
  });

  it('the Go minimum in the README matches sdks/go/go.mod', () => {
    const goMod = readFileSync(GOMOD_PATH, 'utf8');
    const m = /^go (\d+\.\d+)/m.exec(goMod);
    expect(m, 'go directive in sdks/go/go.mod').not.toBeNull();
    expect(README_TEXT).toContain(`Go ${m![1]}+`);
  });

  it('the Python row is examples-only: no first-party SDK, no local JOSE or generated-client claim', () => {
    expect(README_TEXT).toContain('no first-party Python SDK');
    expect(README_TEXT).not.toMatch(/local JOSE/i);
    expect(README_TEXT).not.toMatch(/JOSE-based verification/i);
    expect(README_TEXT).not.toMatch(/OpenAPI client/i);
  });
});
