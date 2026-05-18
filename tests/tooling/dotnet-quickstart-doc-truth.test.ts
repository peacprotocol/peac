/**
 * Doc-truth gate for the v0.14.4 .NET quickstart example.
 *
 * Asserts the example stays a quickstart, not a .NET SDK:
 *
 *   - Self-contained committed fixtures live under
 *     examples/dotnet-quickstart/fixtures/ (NOT
 *     examples/agent-action-records/out/, which is gitignored).
 *   - The README leads with the explicit non-SDK disclaimer.
 *   - The README and code do not propose a NuGet package or sdks/dotnet
 *     directory.
 *   - The .csproj targets a current supported .NET runtime.
 *   - The .csproj depends only on the Ed25519 implementation
 *     (NSec.Cryptography) and contains no PEAC PackageReference.
 *   - The Program.cs path resolution does not reach for network APIs.
 *
 * Forbidden-string literals are assembled at runtime from
 * non-contiguous fragments so broad public-prose grep scans over this
 * test source do not flag the negative-assertion patterns themselves.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const QUICKSTART_DIR = join(REPO_ROOT, 'examples', 'dotnet-quickstart');
const README_PATH = join(QUICKSTART_DIR, 'README.md');
const CSPROJ_PATH = join(QUICKSTART_DIR, 'PeacDotnetQuickstart.csproj');
const PROGRAM_PATH = join(QUICKSTART_DIR, 'Program.cs');
const FIXTURES_DIR = join(QUICKSTART_DIR, 'fixtures');
const PUBKEY_FIXTURE = join(FIXTURES_DIR, 'pubkey.json');
const RECORDS_FIXTURE = join(FIXTURES_DIR, 'records.json');
const SDKS_DOTNET_PATH = join(REPO_ROOT, 'sdks', 'dotnet');

const README_TEXT = readFileSync(README_PATH, 'utf8');
const CSPROJ_TEXT = readFileSync(CSPROJ_PATH, 'utf8');
const PROGRAM_TEXT = readFileSync(PROGRAM_PATH, 'utf8');

// Forbidden phrases assembled from non-contiguous fragments so the
// contiguous forbidden forms never appear in this test source.
const DISCLAIMER_NEEDLE = ['official', 'PEAC', '.NET SDK'].join(' ');
const FORBIDDEN_PEAC_NUGET = new RegExp(['PEAC.{0,40}', 'NuGet'].join(''), 'g');
const ACTIVELY_CLAIMED_PUBLISH = new RegExp(
  ['(we|PEAC|the project|the example).{0,20}', '(publishes?|publishing) a NuGet'].join(''),
  'i'
);
const FORBIDDEN_LIVE_NETWORK = new RegExp(
  [
    '(uses|requires|fetches?|calls|connects to|reaches out to)',
    '.{0,40}(live|hosted) (network|verifier|server)',
  ].join(''),
  'i'
);
const FORBIDDEN_FUTURE_RELEASE = ['future', 'release'].join(' ');
const FORBIDDEN_CONDITIONAL_PR = ['conditional', 'PR'].join(' ');
const FORBIDDEN_CUT_LINE = ['cut', 'line'].join('-');
// DD-NNN pattern assembled non-contiguously per v0.14.4 PR 3
// carry-forward learning #6.
const DD_NUMBER_PATTERN = new RegExp(['\\bD', 'D-', '[0-9]+\\b'].join(''));
// Path the rev-1 quickstart accidentally read from; rev-2 must commit
// its own fixtures locally instead.
const GITIGNORED_OUT_PATH = ['examples/agent-action-records', 'out'].join('/');

describe('dotnet-quickstart: file set discipline', () => {
  it('does not create sdks/dotnet/', () => {
    expect(existsSync(SDKS_DOTNET_PATH)).toBe(false);
  });

  it('ships the minimal file set under examples/dotnet-quickstart/', () => {
    const allowed = new Set([
      'README.md',
      'PeacDotnetQuickstart.csproj',
      'Program.cs',
      '.gitignore',
      'fixtures',
    ]);
    const entries = readdirSync(QUICKSTART_DIR);
    const tracked = entries.filter((name: string) => name !== 'bin' && name !== 'obj');
    for (const name of tracked) {
      expect(allowed.has(name)).toBe(true);
    }
  });

  it('ships self-contained committed fixtures (not gitignored generated artifacts)', () => {
    expect(existsSync(PUBKEY_FIXTURE)).toBe(true);
    expect(existsSync(RECORDS_FIXTURE)).toBe(true);
  });

  it('fixtures/records.json carries at least one compact JWS', () => {
    const text = readFileSync(RECORDS_FIXTURE, 'utf8');
    const parsed = JSON.parse(text) as { records?: Array<{ jws?: string }> };
    expect(parsed.records?.length ?? 0).toBeGreaterThan(0);
    const allHaveJws = (parsed.records ?? []).every(
      (rec) => typeof rec.jws === 'string' && rec.jws.split('.').length === 3
    );
    expect(allHaveJws).toBe(true);
  });

  it('fixtures/records.json carries six records matching agent-action coverage', () => {
    const text = readFileSync(RECORDS_FIXTURE, 'utf8');
    const parsed = JSON.parse(text) as {
      records?: Array<{ fixture?: string; type?: string; jws?: string }>;
    };
    expect(parsed.records?.length ?? 0).toBe(6);
    for (const rec of parsed.records ?? []) {
      expect(typeof rec.fixture).toBe('string');
      expect(typeof rec.type).toBe('string');
      expect(typeof rec.jws).toBe('string');
    }
  });
});

describe('dotnet-quickstart Program.cs: fixture-source discipline', () => {
  it('reads from the example-local fixtures/ directory', () => {
    expect(PROGRAM_TEXT).toContain('"fixtures"');
    expect(PROGRAM_TEXT).toMatch(/Combine\(.*fixtures.*pubkey\.json|fixtures.*pubkey\.json/);
  });

  it('does not read from the gitignored examples/agent-action-records/out/ path', () => {
    expect(PROGRAM_TEXT).not.toContain(GITIGNORED_OUT_PATH);
    expect(PROGRAM_TEXT).not.toContain('agent-action-records');
  });
});

describe('dotnet-quickstart README: non-SDK disclaimer', () => {
  it('uses the H1 "PEAC .NET quickstart"', () => {
    const firstLine = README_TEXT.split('\n').find((line) => line.startsWith('# '));
    expect(firstLine).toBe('# PEAC .NET quickstart');
  });

  it('states explicitly that this is not an official PEAC .NET SDK', () => {
    const lower = README_TEXT.toLowerCase();
    const needle = DISCLAIMER_NEEDLE.toLowerCase();
    expect(lower).toContain(needle);
    const idx = lower.indexOf(needle);
    const window = README_TEXT.slice(Math.max(0, idx - 40), idx);
    expect(window.toLowerCase()).toMatch(/not\b|no\b|never|does not/);
  });

  it('explicitly states PEAC does not publish a NuGet package', () => {
    expect(README_TEXT).toMatch(/no NuGet package/i);
  });

  it('explicitly states PEAC ships no public .NET protocol surface', () => {
    expect(README_TEXT).toMatch(/no public .NET protocol surface/i);
  });

  it('explicitly states there is no sdks/dotnet/ directory', () => {
    expect(README_TEXT).toMatch(/no `sdks\/dotnet\/` directory/);
  });
});

describe('dotnet-quickstart README: offline-runtime / restore distinction', () => {
  it('makes the restore-vs-runtime distinction explicit', () => {
    // Reader should not confuse "offline verification" with "offline
    // dependency restore". The README must say restore/build may
    // contact NuGet AND the runtime program performs no network access.
    // Allow whitespace (including a wrapped line break) inside the
    // multi-word marker phrases.
    expect(README_TEXT).toMatch(/Restore\/build may contact[\s\S]{0,40}NuGet feed/);
    expect(README_TEXT).toMatch(/performs no network[\s\S]{0,5}access at runtime/);
  });

  it('cites only example-local committed fixture paths', () => {
    expect(README_TEXT).toContain('examples/dotnet-quickstart/fixtures/pubkey.json');
    expect(README_TEXT).toContain('examples/dotnet-quickstart/fixtures/records.json');
  });

  it('does not cite the gitignored examples/agent-action-records/out/ path', () => {
    expect(README_TEXT).not.toContain(GITIGNORED_OUT_PATH);
  });

  it('does not describe an active live-network dependency', () => {
    expect(README_TEXT).not.toMatch(FORBIDDEN_LIVE_NETWORK);
    expect(README_TEXT).toMatch(/no hosted verifier|no live vendor transcript/);
  });

  it('does not propose actively publishing a NuGet package', () => {
    expect(README_TEXT).not.toMatch(ACTIVELY_CLAIMED_PUBLISH);
  });

  it('does not claim PEAC publishes or maintains a NuGet package', () => {
    const matches = README_TEXT.matchAll(FORBIDDEN_PEAC_NUGET);
    for (const m of matches) {
      const idx = m.index ?? 0;
      const window = README_TEXT.slice(Math.max(0, idx - 60), idx + 60);
      expect(window).toMatch(/no|not|does not|never|without/i);
    }
  });
});

describe('dotnet-quickstart .csproj: dependency + target discipline', () => {
  it('targets a current supported .NET LTS (net10.0)', () => {
    expect(CSPROJ_TEXT).toContain('<TargetFramework>net10.0</TargetFramework>');
  });

  it('references the Ed25519 library only (no PEAC PackageReference)', () => {
    const packageRefs = CSPROJ_TEXT.matchAll(/<PackageReference Include="([^"]+)"/g);
    const names: string[] = [];
    for (const m of packageRefs) names.push(m[1]);
    expect(names).toEqual(['NSec.Cryptography']);
  });

  it('does not reference any @peac/* or peac. NuGet package', () => {
    expect(CSPROJ_TEXT).not.toMatch(/Include="@peac\//);
    expect(CSPROJ_TEXT).not.toMatch(/Include="(peac|PEAC)\./);
  });

  it('does not carry unnecessary restore-tuning properties', () => {
    expect(CSPROJ_TEXT).not.toContain('RestoreNoCache');
    expect(CSPROJ_TEXT).not.toContain('DisableImplicitNuGetFallbackFolder');
  });

  it('does not pin a drifting language-version property', () => {
    // `<LangVersion>latest</LangVersion>` drifts with future SDK
    // versions. A protocol-grade example should let the SDK default
    // for the target framework apply, or pin an explicit version.
    expect(CSPROJ_TEXT).not.toMatch(/<LangVersion>\s*latest\s*<\/LangVersion>/i);
  });
});

describe('dotnet-quickstart Program.cs: protocol + parsing semantics', () => {
  it('asserts the typ literal matches the Wire 0.2 envelope', () => {
    expect(PROGRAM_TEXT).toContain('"interaction-record+jwt"');
  });

  it('asserts the alg literal matches the Wire 0.2 envelope', () => {
    expect(PROGRAM_TEXT).toContain('"EdDSA"');
  });

  it('asserts the kind literal matches the Wire 0.2 evidence envelope', () => {
    expect(PROGRAM_TEXT).toContain('"evidence"');
  });

  it('uses the canonical JWS signing input (<header>.<payload> as ASCII)', () => {
    expect(PROGRAM_TEXT).toContain('Encoding.ASCII.GetBytes');
    expect(PROGRAM_TEXT).toMatch(/Concat\(parts\[0\],\s*"\."\s*,\s*parts\[1\]\)/);
  });

  it('rejects empty JWS input', () => {
    expect(PROGRAM_TEXT).toMatch(/IsNullOrWhiteSpace\(jws\)/);
  });

  it('rejects compact JWS with any empty segment', () => {
    expect(PROGRAM_TEXT).toMatch(/parts\.Any\(part\s*=>\s*part\.Length\s*==\s*0\)/);
  });

  it('imports no network APIs (no HttpClient, no Sockets)', () => {
    expect(PROGRAM_TEXT).not.toContain('using System.Net.Http');
    expect(PROGRAM_TEXT).not.toContain('using System.Net.Sockets');
    expect(PROGRAM_TEXT).not.toContain('HttpClient');
  });
});

describe('dotnet-quickstart Program.cs: rev-5 strict-header + exact-coverage', () => {
  it('declares an allowlist of JOSE protected header names', () => {
    expect(PROGRAM_TEXT).toContain('AllowedProtectedHeaderNames');
    expect(PROGRAM_TEXT).toMatch(/"typ"[\s\S]{0,60}"alg"[\s\S]{0,60}"kid"/);
  });

  it('rejects any JOSE protected header outside the allowlist', () => {
    // Reject unsupported header names; the message must include the
    // offending key name in single quotes.
    expect(PROGRAM_TEXT).toMatch(/AllowedProtectedHeaderNames\.Contains\(entry\.Key\)/);
    expect(PROGRAM_TEXT).toContain(`unsupported JOSE header '{entry.Key}'`);
  });

  it('declares the exact six expected event types', () => {
    expect(PROGRAM_TEXT).toContain('ExpectedEventTypes');
    for (const kind of [
      'agent-action-invoked-observed',
      'agent-action-delegated-observed',
      'agent-action-approved-observed',
      'agent-action-denied-observed',
      'agent-action-cancelled-observed',
      'agent-action-timed-out-observed',
    ]) {
      expect(PROGRAM_TEXT).toContain(`"${kind}"`);
      expect(PROGRAM_TEXT).toContain(`"org.peacprotocol/${kind}"`);
    }
  });

  it('detects duplicate event_kind values in the corpus', () => {
    expect(PROGRAM_TEXT).toMatch(/seenEventKinds\.Add\(declaredEventKind\)/);
    expect(PROGRAM_TEXT).toMatch(/duplicate event_kind/);
  });

  it('rejects an unexpected event_kind', () => {
    expect(PROGRAM_TEXT).toMatch(/unexpected event_kind/);
    expect(PROGRAM_TEXT).toMatch(/ExpectedEventTypes\.TryGetValue\(declaredEventKind/);
  });

  it('reports missing expected event_kind in the corpus', () => {
    expect(PROGRAM_TEXT).toMatch(/missing expected event_kind/);
    expect(PROGRAM_TEXT).toMatch(/foreach \(string expectedKind in ExpectedEventTypes\.Keys\)/);
  });

  it('final return requires verified == total && total == expected && seenKinds == expected', () => {
    expect(PROGRAM_TEXT).toMatch(/verified\s*==\s*total/);
    expect(PROGRAM_TEXT).toMatch(/total\s*==\s*ExpectedRecordCount/);
    expect(PROGRAM_TEXT).toMatch(/seenEventKinds\.Count\s*==\s*ExpectedEventTypes\.Count/);
  });

  it('catches JsonException around JOSE header parse with a specific failure message', () => {
    expect(PROGRAM_TEXT).toMatch(
      /catch \(JsonException[^)]*\)[\s\S]{0,200}invalid JOSE header JSON/
    );
  });

  it('catches JsonException around payload parse with a specific failure message', () => {
    expect(PROGRAM_TEXT).toMatch(
      /catch \(JsonException[^)]*\)[\s\S]{0,200}invalid record payload JSON/
    );
  });

  it('imports System.Text.Json for JsonException', () => {
    expect(PROGRAM_TEXT).toMatch(/using\s+System\.Text\.Json\s*;/);
  });
});

describe('dotnet-quickstart README: rev-5 dependency wording', () => {
  it('does not say "single Ed25519 dependency"', () => {
    // Restore may also fetch transitive native dependencies; "single"
    // wording is inaccurate.
    expect(README_TEXT).not.toMatch(/single Ed25519 dependency/i);
  });

  it('describes the dependency as direct with possible transitive native deps', () => {
    // Allow whitespace (including a wrapped line break) inside the
    // multi-word marker phrase.
    expect(README_TEXT).toMatch(/direct[\s\S]{0,5}Ed25519 verification package/);
    expect(README_TEXT).toMatch(/transitive native dependencies/);
  });
});

describe('dotnet-quickstart Program.cs: rev-4 hardening', () => {
  it('does not introduce a PEAC_DOTNET_QUICKSTART_DIR environment-variable surface', () => {
    // Environment variables are a public surface; the quickstart must
    // not silently introduce one.
    expect(PROGRAM_TEXT).not.toContain('PEAC_DOTNET_QUICKSTART_DIR');
    expect(README_TEXT).not.toContain('PEAC_DOTNET_QUICKSTART_DIR');
  });

  it('uses strict base64url decoding for compact JWS segments', () => {
    expect(PROGRAM_TEXT).toMatch(/input\.Contains\('='\)/);
    expect(PROGRAM_TEXT).toMatch(/MUST NOT contain padding/);
    expect(PROGRAM_TEXT).toMatch(/invalid base64url character/);
    expect(PROGRAM_TEXT).toMatch(/input\.Length\s*%\s*4\s*==\s*1/);
  });

  it('rejects unsupported JOSE crit and b64 header parameters via the allowlist', () => {
    // rev-4 added explicit `crit` / `b64` rejection. rev-5 replaced
    // those checks with a generic allowlist loop that catches the
    // same names plus any other unknown protected-header name. The
    // behavior is preserved: records carrying `crit` or `b64` still
    // fail with the same shape of message.
    expect(PROGRAM_TEXT).toContain(`unsupported JOSE header '{entry.Key}'`);
    expect(PROGRAM_TEXT).toContain('AllowedProtectedHeaderNames');
    expect(PROGRAM_TEXT).not.toMatch(/AllowedProtectedHeaderNames[\s\S]{0,80}"crit"/);
    expect(PROGRAM_TEXT).not.toMatch(/AllowedProtectedHeaderNames[\s\S]{0,80}"b64"/);
  });

  it('checks Ed25519 signature length before verification', () => {
    expect(PROGRAM_TEXT).toMatch(/signatureBytes\.Length\s*!=\s*64/);
    expect(PROGRAM_TEXT).toContain('Ed25519 signature MUST be 64 bytes');
  });

  it('reports a null record entry with a specific failure', () => {
    // null entries must not be silently skipped; they should appear in
    // the [FAIL] line so malformed fixtures stay debuggable.
    expect(PROGRAM_TEXT).toMatch(/null record entry/);
    expect(PROGRAM_TEXT).toMatch(/total\+\+;[\s\S]{0,200}node is null/);
  });
});

describe('dotnet-quickstart Program.cs: rev-3 fixture-contract checks', () => {
  it('enforces an exact fixture count of 6', () => {
    // Quickstart promises six records covering every
    // agent-action-*-observed event kind. Fail closed on drift.
    expect(PROGRAM_TEXT).toMatch(/ExpectedRecordCount\s*=\s*6/);
    expect(PROGRAM_TEXT).toMatch(/records\.Count\s*!=\s*ExpectedRecordCount/);
  });

  it('requires each record entry to carry fixture, type, event_kind, and jws', () => {
    expect(PROGRAM_TEXT).toContain(`node["fixture"]`);
    expect(PROGRAM_TEXT).toContain(`node["type"]`);
    expect(PROGRAM_TEXT).toContain(`node["event_kind"]`);
    expect(PROGRAM_TEXT).toContain(`node["jws"]`);
  });

  it('reads the agent-action extension from the signed payload', () => {
    // The agent-action extension key is asserted as a constant in the
    // source; the program must look it up under
    // `payload["extensions"][extensionKey]`.
    expect(PROGRAM_TEXT).toContain('"org.peacprotocol/agent-action"');
    expect(PROGRAM_TEXT).toContain('AgentActionExtensionKey');
    expect(PROGRAM_TEXT).toMatch(
      /extensions\?\[AgentActionExtensionKey\]|\["extensions"\][^;]{0,80}\[AgentActionExtensionKey\]/
    );
  });

  it('cross-checks records.json event_kind against the signed payload extension event_kind', () => {
    expect(PROGRAM_TEXT).toMatch(/declaredEventKind/);
    expect(PROGRAM_TEXT).toMatch(/innerEventKind/);
    expect(PROGRAM_TEXT).toMatch(/innerEventKind\s*!=\s*declaredEventKind/);
  });

  it('still cross-checks records.json type against the signed payload type', () => {
    // Existing rev-2 contract preserved.
    expect(PROGRAM_TEXT).toMatch(/innerType\s*!=\s*declaredType/);
  });
});

describe('dotnet-quickstart: discoverability rows', () => {
  // The maintainer-approved discoverability path is to add a row in
  // examples/README.md (where the existing example catalog lives) and
  // a row in docs/COMPATIBILITY_MATRIX.md (where Python is already
  // listed as "examples only"). No new docs created.
  const EXAMPLES_INDEX_PATH = join(REPO_ROOT, 'examples', 'README.md');
  const COMPAT_MATRIX_PATH = join(REPO_ROOT, 'docs', 'COMPATIBILITY_MATRIX.md');
  const EXAMPLES_INDEX_TEXT = readFileSync(EXAMPLES_INDEX_PATH, 'utf8');
  const COMPAT_MATRIX_TEXT = readFileSync(COMPAT_MATRIX_PATH, 'utf8');

  it('adds the dotnet-quickstart row to the examples/README.md catalog', () => {
    expect(EXAMPLES_INDEX_TEXT).toContain('[`dotnet-quickstart`](./dotnet-quickstart/)');
    expect(EXAMPLES_INDEX_TEXT).toMatch(/not a PEAC \.NET SDK/i);
  });

  it('adds the .NET row to docs/COMPATIBILITY_MATRIX.md Wire Format Support', () => {
    expect(COMPAT_MATRIX_TEXT).toMatch(/\| \.NET\b[\s\S]{0,200}examples\/dotnet-quickstart\//);
    expect(COMPAT_MATRIX_TEXT).toMatch(/examples only.*not a PEAC \.NET SDK/i);
  });
});

describe('dotnet-quickstart README: forbidden internal-process tokens', () => {
  it('rejects forward-looking release wording', () => {
    expect(README_TEXT.toLowerCase()).not.toContain(FORBIDDEN_FUTURE_RELEASE);
  });

  it('rejects internal sequencing / decision-record tokens', () => {
    expect(README_TEXT).not.toContain(FORBIDDEN_CONDITIONAL_PR);
    expect(README_TEXT).not.toContain(FORBIDDEN_CUT_LINE);
    expect(README_TEXT).not.toMatch(DD_NUMBER_PATTERN);
  });
});
