/**
 * Fixture manifest generator for the parity differential harness.
 *
 * INTERNAL TEST HELPER. Walks the parity-corpus and wire-02 conformance
 * fixture trees, categorizes every fixture as either included (eligible
 * for the harness) or excluded (with an explicit reason string). The
 * harness asserts `included.length + excluded.length` totals to the
 * actual scanned count so no fixture is silently skipped.
 *
 * Used by parity-differential.test.ts and parity-verdict-self.test.ts.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { CanonicalRunnerKind } from './canonical-runner.js';

export type IncludedCategory =
  | 'included_valid_wire_record'
  | 'included_invalid_wire_record'
  | 'included_jose_negative'
  | 'included_warning_vector'
  | 'included_type_extension_mapping_warning';

export type ExcludedCategory =
  | 'excluded_legacy_or_bundle_only'
  | 'excluded_non_record_fixture'
  | 'excluded_non_current_wire'
  | 'excluded_requires_signature_or_external_artifact'
  | 'excluded_requires_verify_local_warning_layer'
  | 'excluded_requires_full_jws_verification_runner'
  | 'excluded_requires_policy_binding_runner'
  | 'excluded_requires_temporal_warning_runner'
  | 'excluded_requires_verify_local_strictness_runner';

export type ManifestCategory = IncludedCategory | ExcludedCategory;

export interface IncludedEntry {
  readonly source: 'parity-corpus' | 'wire-02-conformance';
  readonly family: string;
  readonly id: string;
  readonly category: IncludedCategory;
  readonly runnerKind: CanonicalRunnerKind;
  readonly input: Record<string, unknown>;
}

export interface ExcludedEntry {
  readonly source: 'parity-corpus' | 'wire-02-conformance' | 'fixtures-other';
  readonly family: string;
  readonly id: string;
  readonly category: ExcludedCategory;
  readonly reason: string;
}

export interface FixtureManifest {
  readonly included: readonly IncludedEntry[];
  readonly excluded: readonly ExcludedEntry[];
  readonly totals: {
    readonly included: number;
    readonly excluded: number;
    readonly total: number;
  };
}

/**
 * Resolve the conformance fixtures root by walking up from process.cwd().
 * Mirrors the corpus-loader resolution strategy.
 */
function resolveConformanceRoot(override?: string): string {
  if (override) return override;
  let cur = process.cwd();
  for (let i = 0; i < 16; i++) {
    const candidate = resolve(cur, 'specs', 'conformance');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  throw new Error(`specs/conformance not found by walking up from ${process.cwd()}`);
}

interface RawFixture {
  readonly name?: string;
  readonly type?: string;
  readonly status?: string;
  readonly input?: {
    claims?: unknown;
    header_overrides?: unknown;
    jws_size_exceeds_bytes?: unknown;
    verify_options?: unknown;
  };
  readonly expected?: {
    valid?: unknown;
    warnings?: ReadonlyArray<{ code?: string }>;
  };
}

/**
 * Warning codes emitted by the type/extension mapping warning surface
 * (verify-local.ts:477-540). Step 3b re-includes warning fixtures whose
 * expected warnings are entirely drawn from this set; mixed fixtures
 * (e.g., temporal + type warnings together) stay excluded.
 */
const TYPE_EXTENSION_MAPPING_WARNING_CODES: ReadonlySet<string> = new Set([
  'type_unregistered',
  'unknown_extension_preserved',
  'extension_group_missing',
  'extension_group_mismatch',
]);

/**
 * JOSE rejection vectors that map directly to validateWire02Header
 * checks for embedded key material / crit / b64:false / zip. Other
 * jws-security fixtures (kid presence/length checks, oversized JWS,
 * full-token format checks) require a full JWS verification runner
 * that the parity foundation does not yet provide; they are excluded
 * with category excluded_requires_full_jws_verification_runner.
 */
const JOSE_HEADER_HARDENING_FIXTURE_NAMES: ReadonlySet<string> = new Set([
  // wire-02/jose/conformance.json
  'reject-embedded-jwk',
  'reject-x5c-chain',
  'reject-x5u-url',
  'reject-jku-url',
  'reject-crit-header',
  'reject-b64-false',
  'reject-zip-header',
  // wire-02/invalid.json
  'reject-jwk',
  'reject-x5c',
  'reject-x5u',
  'reject-jku',
  'reject-crit',
  'reject-zip',
]);

function loadJsonManifest(path: string): RawFixture[] {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as { fixtures?: unknown };
    if (Array.isArray(data.fixtures)) return data.fixtures as RawFixture[];
    return [];
  } catch {
    return [];
  }
}

function categorizeWire02(
  fx: RawFixture,
  family: string,
  sourceFile: string
): IncludedEntry | ExcludedEntry {
  const id = fx.name ?? '<unnamed>';
  const fxType = fx.type ?? '';
  const status = fx.status ?? '';

  // Policy-binding fixtures with verify_options exercise behavior beyond
  // the Layer 1 envelope canonical path; defer until a policy-binding
  // runner exists.
  if (fx.input?.verify_options !== undefined) {
    return {
      source: 'wire-02-conformance',
      family,
      id,
      category: 'excluded_requires_policy_binding_runner',
      reason: `wire-02/${family}/${sourceFile}: input.verify_options exercises verifyLocal-layer policy binding; no policy-binding runner in the parity foundation yet`,
    };
  }

  if (fxType === 'full-pipeline') {
    const claims = fx.input?.claims;
    if (!claims || typeof claims !== 'object') {
      return {
        source: 'wire-02-conformance',
        family,
        id,
        category: 'excluded_non_record_fixture',
        reason: `wire-02/${family}/${sourceFile}: full-pipeline fixture missing input.claims`,
      };
    }
    const isPositive = status === 'positive' || fx.expected?.valid === true;
    return {
      source: 'wire-02-conformance',
      family,
      id,
      category: isPositive ? 'included_valid_wire_record' : 'included_invalid_wire_record',
      runnerKind: 'envelope',
      input: claims as Record<string, unknown>,
    };
  }

  if (fxType === 'jws-security') {
    if (fx.input?.jws_size_exceeds_bytes !== undefined) {
      return {
        source: 'wire-02-conformance',
        family,
        id,
        category: 'excluded_requires_full_jws_verification_runner',
        reason: `wire-02/${family}/${sourceFile}: jws_size_exceeds_bytes requires a real signed compact JWS; not testable via header-only canonical runner`,
      };
    }
    const header = fx.input?.header_overrides;
    if (!header || typeof header !== 'object') {
      return {
        source: 'wire-02-conformance',
        family,
        id,
        category: 'excluded_requires_full_jws_verification_runner',
        reason: `wire-02/${family}/${sourceFile}: jws-security fixture without header_overrides; requires full JWS verification runner`,
      };
    }
    if (!JOSE_HEADER_HARDENING_FIXTURE_NAMES.has(id)) {
      return {
        source: 'wire-02-conformance',
        family,
        id,
        category: 'excluded_requires_full_jws_verification_runner',
        reason: `wire-02/${family}/${sourceFile}: jws-security fixture "${id}" exercises kid-presence / kid-length / size / token-format checks beyond validateWire02Header header-hardening scope; defer to full JWS verification runner`,
      };
    }
    return {
      source: 'wire-02-conformance',
      family,
      id,
      category: 'included_jose_negative',
      runnerKind: 'jose',
      input: header as Record<string, unknown>,
    };
  }

  if (fxType === 'warning') {
    const claims = fx.input?.claims;
    if (!claims || typeof claims !== 'object') {
      return {
        source: 'wire-02-conformance',
        family,
        id,
        category: 'excluded_non_record_fixture',
        reason: `wire-02/${family}/${sourceFile}: warning fixture missing input.claims`,
      };
    }
    const codes = (fx.expected?.warnings ?? [])
      .map((w) => w.code)
      .filter((c): c is string => typeof c === 'string');

    if (codes.length === 0) {
      return {
        source: 'wire-02-conformance',
        family,
        id,
        category: 'excluded_non_record_fixture',
        reason: `wire-02/${family}/${sourceFile}: warning fixture without an expected warning code`,
      };
    }

    if (codes.includes('occurred_at_skew')) {
      return {
        source: 'wire-02-conformance',
        family,
        id,
        category: 'excluded_requires_temporal_warning_runner',
        reason: `wire-02/${family}/${sourceFile}: occurred_at_skew warning belongs to the temporal layer (verifyLocal occurred_at vs iat skew); no temporal runner in the parity foundation yet`,
      };
    }

    if (codes.includes('typ_missing')) {
      return {
        source: 'wire-02-conformance',
        family,
        id,
        category: 'excluded_requires_verify_local_strictness_runner',
        reason: `wire-02/${family}/${sourceFile}: typ_missing warning belongs to the verifyLocal strictness/typ-handling layer; no strictness runner in the parity foundation yet`,
      };
    }

    if (codes.every((c) => TYPE_EXTENSION_MAPPING_WARNING_CODES.has(c))) {
      return {
        source: 'wire-02-conformance',
        family,
        id,
        category: 'included_type_extension_mapping_warning',
        runnerKind: 'envelope',
        input: claims as Record<string, unknown>,
      };
    }

    return {
      source: 'wire-02-conformance',
      family,
      id,
      category: 'excluded_requires_verify_local_warning_layer',
      reason: `wire-02/${family}/${sourceFile}: warning fixture mixes codes outside the type/extension mapping surface (codes: ${codes.join(', ')})`,
    };
  }

  return {
    source: 'wire-02-conformance',
    family,
    id,
    category: 'excluded_non_record_fixture',
    reason: `wire-02/${family}/${sourceFile}: unsupported fixture type "${fxType}"`,
  };
}

interface RawParityVector {
  readonly id: string;
  readonly input?: { payload?: unknown; header?: unknown };
}

function categorizeParityCorpus(family: string, vector: RawParityVector): IncludedEntry {
  if (family === 'jose-hardening') {
    return {
      source: 'parity-corpus',
      family,
      id: vector.id,
      category: 'included_jose_negative',
      runnerKind: 'jose',
      input: (vector.input?.header ?? {}) as Record<string, unknown>,
    };
  }
  return {
    source: 'parity-corpus',
    family,
    id: vector.id,
    category: 'included_valid_wire_record',
    runnerKind: 'envelope',
    input: (vector.input?.payload ?? {}) as Record<string, unknown>,
  };
}

/**
 * Top-level fixture directories under specs/conformance/fixtures/ that
 * are intentionally OUT OF SCOPE for the parity foundation and are
 * recorded with an explicit category + reason. Profile-specific fixtures
 * (commerce, attribution, etc.) are tested in their respective adapter
 * suites; bundle and carrier fixtures are not envelope validation.
 */
const NON_WIRE_02_FIXTURE_DIRS: ReadonlyArray<{
  dir: string;
  category: ExcludedCategory;
  reason: string;
}> = [
  {
    dir: 'acp',
    category: 'excluded_non_record_fixture',
    reason: 'commerce profile fixtures; tested in adapter suites',
  },
  {
    dir: 'agent-identity',
    category: 'excluded_non_record_fixture',
    reason: 'identity profile fixtures; not envelope validation',
  },
  {
    dir: 'attribution',
    category: 'excluded_non_record_fixture',
    reason: 'attribution profile fixtures; not envelope validation',
  },
  {
    dir: 'bundle',
    category: 'excluded_legacy_or_bundle_only',
    reason: 'bundle shape, not record shape',
  },
  {
    dir: 'carrier',
    category: 'excluded_non_record_fixture',
    reason: 'evidence carrier extraction tests',
  },
  {
    dir: 'carrier-boundary',
    category: 'excluded_non_record_fixture',
    reason: 'evidence carrier boundary tests',
  },
  {
    dir: 'content-usage',
    category: 'excluded_non_record_fixture',
    reason: 'content-usage header parsing',
  },
  {
    dir: 'crypto',
    category: 'excluded_non_record_fixture',
    reason: 'crypto-layer fixtures; tested in @peac/crypto',
  },
  {
    dir: 'discovery',
    category: 'excluded_non_record_fixture',
    reason: 'discovery surface fixtures',
  },
  { dir: 'dispute', category: 'excluded_non_record_fixture', reason: 'dispute profile fixtures' },
  {
    dir: 'edge',
    category: 'excluded_non_record_fixture',
    reason: 'edge environment-specific fixtures',
  },
  { dir: 'errors', category: 'excluded_non_record_fixture', reason: 'error registry fixtures' },
  {
    dir: 'fingerprint-ref',
    category: 'excluded_non_record_fixture',
    reason: 'fingerprint reference fixtures',
  },
  {
    dir: 'go-interaction-record',
    category: 'excluded_non_record_fixture',
    reason: 'cross-language fixtures; tested in sdks/go',
  },
  {
    dir: 'hosted-verify',
    category: 'excluded_non_record_fixture',
    reason: 'hosted verifier fixtures; tested in apps/api',
  },
  {
    dir: 'interaction',
    category: 'excluded_non_record_fixture',
    reason: 'interaction extension fixtures; tested in adapter suites',
  },
  {
    dir: 'invalid',
    category: 'excluded_non_current_wire',
    reason: 'mixed-wire-version invalid fixtures; not Wire 0.2 envelope only',
  },
  {
    dir: 'issue',
    category: 'excluded_non_record_fixture',
    reason: 'issue() flow fixtures; require deterministic signing',
  },
  {
    dir: 'key-rotation',
    category: 'excluded_non_record_fixture',
    reason: 'key rotation fixtures; tested in @peac/crypto',
  },
  {
    dir: 'obligations',
    category: 'excluded_non_record_fixture',
    reason: 'obligation profile fixtures',
  },
  {
    dir: 'parse',
    category: 'excluded_non_record_fixture',
    reason: 'parser fixtures; tested in @peac/schema',
  },
  {
    dir: 'paymentauth',
    category: 'excluded_non_record_fixture',
    reason: 'commerce profile fixtures; tested in adapter suites',
  },
  { dir: 'policy', category: 'excluded_non_record_fixture', reason: 'policy profile fixtures' },
  { dir: 'purpose', category: 'excluded_non_record_fixture', reason: 'purpose profile fixtures' },
  {
    dir: 'stripe',
    category: 'excluded_non_record_fixture',
    reason: 'commerce profile fixtures; tested in adapter suites',
  },
  {
    dir: 'stripe-crypto',
    category: 'excluded_non_record_fixture',
    reason: 'commerce profile crypto fixtures',
  },
  { dir: 'treaty', category: 'excluded_non_record_fixture', reason: 'treaty profile fixtures' },
  {
    dir: 'ucp',
    category: 'excluded_non_record_fixture',
    reason: 'commerce profile fixtures; tested in adapter suites',
  },
  {
    dir: 'valid',
    category: 'excluded_non_current_wire',
    reason: 'mixed-wire-version valid fixtures; not Wire 0.2 envelope only',
  },
  {
    dir: 'verifier',
    category: 'excluded_non_record_fixture',
    reason: 'reference verifier fixtures',
  },
  {
    dir: 'workflow',
    category: 'excluded_non_record_fixture',
    reason: 'workflow correlation fixtures',
  },
  {
    dir: 'x402',
    category: 'excluded_non_record_fixture',
    reason: 'commerce profile fixtures; tested in adapter suites',
  },
  {
    dir: 'zero-trust',
    category: 'excluded_non_record_fixture',
    reason: 'zero trust profile fixtures',
  },
];

/**
 * Build the fixture manifest. Walks parity-corpus + wire-02 conformance
 * (subdirectories and top-level *.json files) and enumerates non-wire-02
 * fixture directories as exclusions with explicit reasons.
 */
export function loadFixtureManifest(conformanceRootOverride?: string): FixtureManifest {
  const conformanceRoot = resolveConformanceRoot(conformanceRootOverride);
  const included: IncludedEntry[] = [];
  const excluded: ExcludedEntry[] = [];

  // 1. Parity corpus families (loaded directly from disk to avoid the
  //    schema-loader's strict-mode side effects in this scan).
  const parityRoot = join(conformanceRoot, 'parity-corpus');
  for (const family of [
    'default-flows',
    'jose-hardening',
    'runtime-governance',
    'commerce-bridges',
  ]) {
    const vectorsPath = join(parityRoot, family, 'vectors.json');
    if (!existsSync(vectorsPath)) continue;
    const data = JSON.parse(readFileSync(vectorsPath, 'utf8')) as { vectors?: RawParityVector[] };
    for (const v of data.vectors ?? []) {
      included.push(categorizeParityCorpus(family, v));
    }
  }

  // 2. Wire-02 conformance subdirectories (one conformance.json per dir).
  const wire02Root = join(conformanceRoot, 'fixtures', 'wire-02');
  if (existsSync(wire02Root)) {
    for (const entry of readdirSync(wire02Root)) {
      const entryPath = join(wire02Root, entry);
      const st = statSync(entryPath);
      if (st.isDirectory()) {
        const cfPath = join(entryPath, 'conformance.json');
        if (existsSync(cfPath)) {
          for (const fx of loadJsonManifest(cfPath)) {
            const e = categorizeWire02(fx, entry, 'conformance.json');
            if ('runnerKind' in e) included.push(e);
            else excluded.push(e);
          }
        }
      } else if (st.isFile() && entry.endsWith('.json')) {
        // Top-level wire-02/*.json (challenge.json, dual-stack.json,
        // invalid.json, valid.json, warnings.json) are also fixture
        // manifests of the same shape.
        const family = entry.replace(/\.json$/, '');
        for (const fx of loadJsonManifest(entryPath)) {
          const e = categorizeWire02(fx, family, entry);
          if ('runnerKind' in e) included.push(e);
          else excluded.push(e);
        }
      }
    }
  }

  // 3. Non-wire-02 fixture directories (explicit exclusions; no silent
  //    skips for future maintainers).
  const fixturesRoot = join(conformanceRoot, 'fixtures');
  if (existsSync(fixturesRoot)) {
    for (const { dir, category, reason } of NON_WIRE_02_FIXTURE_DIRS) {
      const path = join(fixturesRoot, dir);
      if (!existsSync(path)) continue;
      excluded.push({
        source: 'fixtures-other',
        family: dir,
        id: '*',
        category,
        reason,
      });
    }
  }

  return {
    included,
    excluded,
    totals: {
      included: included.length,
      excluded: excluded.length,
      total: included.length + excluded.length,
    },
  };
}
