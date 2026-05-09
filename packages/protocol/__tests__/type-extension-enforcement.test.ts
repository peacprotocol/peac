/**
 * Type-to-extension enforcement tests
 *
 * Table-driven matrix covering all 10 registered receipt types
 * across strict/interop modes and 3 extension states (match, missing, mismatch).
 *
 * Also covers:
 *   - Custom/unmapped types skip enforcement
 *   - Expected extension present alongside extra registered extensions still passes
 *   - Unknown third-party extensions do not count as mismatch
 *   - Warning pointer and details shape
 */

import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { TYPE_TO_EXTENSION_MAP } from '@peac/kernel';
import {
  REGISTERED_EXTENSION_GROUP_KEYS,
  WARNING_EXTENSION_GROUP_MISSING,
  WARNING_EXTENSION_GROUP_MISMATCH,
} from '@peac/schema';
import { issueWire02, verifyLocal } from '../src/index';
import {
  checkTypeExtensionMapping,
  type TypeExtensionCheckResult,
} from '../src/type-extension-check';

// ---------------------------------------------------------------------------
// Pure helper unit tests (no crypto, no I/O)
// ---------------------------------------------------------------------------

// REGISTERED_EXTENSION_GROUP_KEYS is the canonical runtime constant exported
// from @peac/schema and verified to match specs/kernel/registries.json by
// packages/schema/__tests__/wire-02-registry-parity.test.ts. Reusing it here
// keeps this helper input aligned with production code (verify-local.ts and
// _internal/record-core/validators/type-extension-mapping.ts both consume the
// same constant) and prevents the test from drifting against the registry.
const REGISTERED_KEYS = REGISTERED_EXTENSION_GROUP_KEYS;

// Explicit drift sentinel: when specs/kernel/registries.json adds an extension
// group, this expected count must move with it intentionally so reviewers see
// the registry widening as a discrete decision.
//   Wire 0.2 core groups: 12 (10 pillars + correlation + challenge).
//   Profile groups:       3  (a2a-handoff, cli-execution, lifecycle-observation).
const EXPECTED_REGISTERED_GROUP_COUNT = 16;

describe('checkTypeExtensionMapping(): pure helper', () => {
  it('returns skip for unmapped custom type', () => {
    const result = checkTypeExtensionMapping(
      'evidence',
      'com.example/custom',
      {},
      TYPE_TO_EXTENSION_MAP,
      REGISTERED_KEYS
    );
    expect(result.status).toBe('skip');
  });

  it('returns ok when expected extension is present', () => {
    const result = checkTypeExtensionMapping(
      'evidence',
      'org.peacprotocol/payment',
      { 'org.peacprotocol/commerce': { payment_rail: 'stripe' } },
      TYPE_TO_EXTENSION_MAP,
      REGISTERED_KEYS
    );
    expect(result.status).toBe('ok');
  });

  it('returns ok when expected extension is present alongside other registered extensions', () => {
    const result = checkTypeExtensionMapping(
      'evidence',
      'org.peacprotocol/payment',
      {
        'org.peacprotocol/commerce': { payment_rail: 'stripe' },
        'org.peacprotocol/correlation': { trace_id: 'abc' },
      },
      TYPE_TO_EXTENSION_MAP,
      REGISTERED_KEYS
    );
    expect(result.status).toBe('ok');
  });

  it('returns missing when extensions is empty', () => {
    const result = checkTypeExtensionMapping(
      'evidence',
      'org.peacprotocol/payment',
      {},
      TYPE_TO_EXTENSION_MAP,
      REGISTERED_KEYS
    );
    expect(result.status).toBe('missing');
    if (result.status === 'missing') {
      expect(result.expected_extension_group).toBe('org.peacprotocol/commerce');
      expect(result.present_registered_extension_groups).toEqual([]);
    }
  });

  it('returns missing when extensions is undefined', () => {
    const result = checkTypeExtensionMapping(
      'evidence',
      'org.peacprotocol/payment',
      undefined,
      TYPE_TO_EXTENSION_MAP,
      REGISTERED_KEYS
    );
    expect(result.status).toBe('missing');
  });

  it('returns mismatch when expected absent but different registered group present', () => {
    const result = checkTypeExtensionMapping(
      'evidence',
      'org.peacprotocol/payment',
      { 'org.peacprotocol/consent': { consent_basis: 'explicit', consent_status: 'granted' } },
      TYPE_TO_EXTENSION_MAP,
      REGISTERED_KEYS
    );
    expect(result.status).toBe('mismatch');
    if (result.status === 'mismatch') {
      expect(result.expected_extension_group).toBe('org.peacprotocol/commerce');
      expect(result.present_registered_extension_groups).toContain('org.peacprotocol/consent');
    }
  });

  it('does not count unknown third-party extensions as mismatch', () => {
    const result = checkTypeExtensionMapping(
      'evidence',
      'org.peacprotocol/payment',
      { 'com.vendor/custom': { data: 'value' } },
      TYPE_TO_EXTENSION_MAP,
      REGISTERED_KEYS
    );
    expect(result.status).toBe('missing');
  });

  it('returns skip for challenge-kind receipts regardless of type', () => {
    const result = checkTypeExtensionMapping(
      'challenge',
      'org.peacprotocol/payment',
      {},
      TYPE_TO_EXTENSION_MAP,
      REGISTERED_KEYS
    );
    expect(result.status).toBe('skip');
  });
});

// ---------------------------------------------------------------------------
// Table-driven matrix: all 10 types x 3 states x 2 modes
// ---------------------------------------------------------------------------

const testKid = '2026-03-15T00:00:00Z';
const testIss = 'https://api.example.com';

/**
 * Minimal valid extension values for each registered group. The a2a-handoff
 * minimal value here uses the Agent Card observation shape (sufficient for the
 * `match` cell of the matrix; type-specific shape is exercised by the
 * a2a-handoff parity corpus).
 */
const MINIMAL_EXTENSIONS: Record<string, Record<string, unknown>> = {
  'org.peacprotocol/commerce': { payment_rail: 'stripe', amount_minor: '1000', currency: 'USD' },
  'org.peacprotocol/access': {
    resource: 'https://example.com/api',
    action: 'read',
    decision: 'allow',
  },
  'org.peacprotocol/challenge': { challenge_type: 'payment_required' },
  'org.peacprotocol/identity': { proof_ref: 'proof-001' },
  'org.peacprotocol/correlation': { trace_id: 'a'.repeat(32) },
  'org.peacprotocol/consent': { consent_basis: 'explicit', consent_status: 'granted' },
  'org.peacprotocol/privacy': { data_classification: 'confidential' },
  'org.peacprotocol/safety': { review_status: 'reviewed' },
  'org.peacprotocol/compliance': { framework: 'soc2-type2', compliance_status: 'compliant' },
  'org.peacprotocol/provenance': { source_type: 'original' },
  'org.peacprotocol/attribution': { creator_ref: 'acme-corp' },
  'org.peacprotocol/purpose': { external_purposes: ['ai_training'] },
  'org.peacprotocol/a2a-handoff': {
    type: 'org.peacprotocol/a2a-agent-card-observation',
    card_ref: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
    signature_observation: { present: true, caller_reported_verification: 'not_checked' },
    discovered_at: '2026-05-05T12:00:00Z',
    discovery_path: '/.well-known/agent-card.json',
  },
  'org.peacprotocol/cli-execution': {
    type: 'org.peacprotocol/cli-command-execution',
    surface: { kind: 'cli' },
    command: {
      program: 'node',
      argv_mode: 'hashed',
      argv_sha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    cwd: {
      cwd_mode: 'hashed',
      cwd_sha256: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
    binary: {
      path_mode: 'hashed',
      path_sha256: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    },
    stdin_ref: { mode: 'none' },
    stdout_ref: {
      length: 0,
      sha256: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      truncated: false,
    },
    stderr_ref: {
      length: 0,
      sha256: 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      truncated: false,
    },
    env: { mode: 'hashed', entries: {} },
    started_at: '2026-01-01T00:00:00Z',
    finished_at: '2026-01-01T00:00:01Z',
    duration_ms: 1000,
    exit_code: 0,
    timed_out: false,
    timeout_ms: 600000,
    kill_grace_ms: 5000,
    exit_code_mode: 'child',
    shell_mode: false,
    execution_mode: 'deterministic_script',
    capture_policy: {
      stdout_max_bytes: 16384,
      stderr_max_bytes: 16384,
      argv_max_bytes: 4096,
      env_allowlist: [],
      stdin_mode: 'none',
      cwd_mode: 'hashed',
      binary_path_mode: 'hashed',
      secret_scan: true,
      raw_capture_unsafely_allowed: false,
      raw_env_unsafely_allowed: false,
      secret_scan_disabled_unsafely: false,
      timeout_ms: 600000,
      kill_grace_ms: 5000,
      exit_code_mode: 'child',
    },
    platform: { os: 'linux', arch: 'x64', peac_cli_version: '0.14.0' },
  },
  'org.peacprotocol/lifecycle-observation': {
    event_kind: 'lifecycle-workflow-transition',
    subject_ref: 'urn:peac:task:enforcement-test',
    observed_at: '2026-05-12T10:00:00Z',
    from_state: 'pending',
    to_state: 'running',
  },
  'org.peacprotocol/provisioning-lifecycle': {
    event_kind: 'provisioning-resource-observed',
    observed_at: '2026-05-12T10:00:00Z',
    provider: { provider_ref: 'urn:peac:provider:provider-x' },
    resource: {
      kind: 'edge_compute_unit',
      resource_ref: 'urn:peac:resource:r1',
      sub_event: 'provisioned',
    },
  },
};

/**
 * Pillar value for each receipt type. The 10 a2a-handoff types share
 * pillar `provenance` per `specs/kernel/registries.json` (chain-of-handoff /
 * chain-of-custody for an agent task is provenance-shaped).
 */
const TYPE_PILLARS: Record<string, string> = {
  'org.peacprotocol/payment': 'commerce',
  'org.peacprotocol/access-decision': 'access',
  'org.peacprotocol/identity-attestation': 'identity',
  'org.peacprotocol/consent-record': 'consent',
  'org.peacprotocol/compliance-check': 'compliance',
  'org.peacprotocol/privacy-signal': 'privacy',
  'org.peacprotocol/safety-review': 'safety',
  'org.peacprotocol/provenance-record': 'provenance',
  'org.peacprotocol/attribution-event': 'attribution',
  'org.peacprotocol/purpose-declaration': 'purpose',
  // v0.14.1 a2a-handoff family (10 type URIs, all pillar=provenance)
  'org.peacprotocol/a2a-agent-card-observation': 'provenance',
  'org.peacprotocol/a2a-task-submitted': 'provenance',
  'org.peacprotocol/a2a-task-accepted': 'provenance',
  'org.peacprotocol/a2a-task-rejected': 'provenance',
  'org.peacprotocol/a2a-task-state-changed': 'provenance',
  'org.peacprotocol/a2a-task-completed': 'provenance',
  'org.peacprotocol/a2a-task-failed': 'provenance',
  'org.peacprotocol/a2a-human-review-requested': 'provenance',
  'org.peacprotocol/a2a-human-approved': 'provenance',
  'org.peacprotocol/a2a-human-rejected': 'provenance',
  // CLI execution observation (single type URI; pillar=provenance)
  'org.peacprotocol/cli-command-execution': 'provenance',
  // v0.14.1 lifecycle-observation family (9 type URIs, all pillar=provenance)
  'org.peacprotocol/lifecycle-approval-requested': 'provenance',
  'org.peacprotocol/lifecycle-approval-granted': 'provenance',
  'org.peacprotocol/lifecycle-approval-denied': 'provenance',
  'org.peacprotocol/lifecycle-evaluation-started': 'provenance',
  'org.peacprotocol/lifecycle-evaluation-completed': 'provenance',
  'org.peacprotocol/lifecycle-experiment-assigned': 'provenance',
  'org.peacprotocol/lifecycle-experiment-result': 'provenance',
  'org.peacprotocol/lifecycle-workflow-transition': 'provenance',
  'org.peacprotocol/lifecycle-mode-observed': 'provenance',
  // v0.14.2 provisioning-lifecycle family (10 type URIs, all pillar=provenance)
  'org.peacprotocol/provisioning-catalog-observed': 'provenance',
  'org.peacprotocol/provisioning-provider-link-observed': 'provenance',
  'org.peacprotocol/provisioning-account-observed': 'provenance',
  'org.peacprotocol/provisioning-resource-observed': 'provenance',
  'org.peacprotocol/provisioning-credential-observed': 'provenance',
  'org.peacprotocol/provisioning-payment-authorization-observed': 'provenance',
  'org.peacprotocol/provisioning-budget-observed': 'provenance',
  'org.peacprotocol/provisioning-subscription-observed': 'provenance',
  'org.peacprotocol/provisioning-domain-observed': 'provenance',
  'org.peacprotocol/provisioning-deployment-observed': 'provenance',
};

/** Get a different registered extension group (for mismatch testing) */
function getAlternateExtension(expectedGroup: string): [string, Record<string, unknown>] {
  for (const [key, value] of Object.entries(MINIMAL_EXTENSIONS)) {
    if (key !== expectedGroup) return [key, value];
  }
  throw new Error('No alternate extension found');
}

// Build the full test matrix
interface MatrixEntry {
  type: string;
  expectedGroup: string;
  state: 'match' | 'missing' | 'mismatch';
  strictness: 'strict' | 'interop';
}

const matrixEntries: MatrixEntry[] = [];
for (const [type, expectedGroup] of TYPE_TO_EXTENSION_MAP.entries()) {
  for (const state of ['match', 'missing', 'mismatch'] as const) {
    for (const strictness of ['strict', 'interop'] as const) {
      matrixEntries.push({ type, expectedGroup, state, strictness });
    }
  }
}

describe('verifyLocal(): type-to-extension enforcement matrix', () => {
  // Generate one test per matrix cell
  for (const { type, expectedGroup, state, strictness } of matrixEntries) {
    const label = `${type} | ${state} | ${strictness}`;

    it(label, async () => {
      const { privateKey, publicKey } = await generateKeypair();

      let extensions: Record<string, Record<string, unknown>> | undefined;
      if (state === 'match') {
        extensions = { [expectedGroup]: MINIMAL_EXTENSIONS[expectedGroup] };
      } else if (state === 'mismatch') {
        const [altKey, altValue] = getAlternateExtension(expectedGroup);
        extensions = { [altKey]: altValue };
      }
      // state === 'missing': extensions undefined (expected group absent)

      const { jws } = await issueWire02({
        iss: testIss,
        kind: 'evidence',
        type,
        pillars: [TYPE_PILLARS[type]],
        ...(extensions !== undefined ? { extensions } : {}),
        privateKey,
        kid: testKid,
      });

      const result = await verifyLocal(jws, publicKey, { strictness });

      if (state === 'match') {
        expect(result.valid).toBe(true);
      } else if (strictness === 'strict') {
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.code).toBe(
            state === 'missing' ? 'E_EXTENSION_GROUP_REQUIRED' : 'E_EXTENSION_GROUP_MISMATCH'
          );
          expect(result.details?.expected_extension_group).toBe(expectedGroup);
          expect(result.details?.type).toBe(type);
        }
      } else {
        // interop: passes with warning
        expect(result.valid).toBe(true);
        if (result.valid && result.variant === 'wire-02') {
          const expectedWarningCode =
            state === 'missing'
              ? WARNING_EXTENSION_GROUP_MISSING
              : WARNING_EXTENSION_GROUP_MISMATCH;
          const w = result.warnings.find((w) => w.code === expectedWarningCode);
          expect(w).toBeDefined();
          expect(w!.pointer).toBe('/type');
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('verifyLocal(): type-to-extension edge cases', () => {
  it('custom type skips enforcement entirely', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'com.example/custom-flow',
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey, { strictness: 'strict' });
    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(
        result.warnings.some(
          (w) =>
            w.code === WARNING_EXTENSION_GROUP_MISSING ||
            w.code === WARNING_EXTENSION_GROUP_MISMATCH
        )
      ).toBe(false);
    }
  });

  it('expected extension present with additional registered extensions passes in strict', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      pillars: ['commerce'],
      extensions: {
        'org.peacprotocol/commerce': MINIMAL_EXTENSIONS['org.peacprotocol/commerce'],
        'org.peacprotocol/correlation': MINIMAL_EXTENSIONS['org.peacprotocol/correlation'],
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey, { strictness: 'strict' });
    expect(result.valid).toBe(true);
  });

  it('unknown third-party extension does not trigger mismatch', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      pillars: ['commerce'],
      extensions: {
        'com.vendor/custom-ext': { data: 'value' },
      },
      privateKey,
      kid: testKid,
    });

    // Strict: should be E_EXTENSION_GROUP_REQUIRED (missing), not mismatch
    const result = await verifyLocal(jws, publicKey, { strictness: 'strict' });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_EXTENSION_GROUP_REQUIRED');
    }
  });
});

// ---------------------------------------------------------------------------
// Registry completion invariant
// ---------------------------------------------------------------------------

describe('Registry completion: type-to-extension surface', () => {
  it('TYPE_TO_EXTENSION_MAP covers all 40 registered receipt types (10 pillars + 10 a2a-handoff + 1 cli-command-execution + 9 lifecycle event kinds + 10 provisioning-lifecycle event families)', () => {
    expect(TYPE_TO_EXTENSION_MAP.size).toBe(40);
  });

  it('every mapped extension group is in REGISTERED_EXTENSION_GROUP_KEYS', () => {
    for (const group of TYPE_TO_EXTENSION_MAP.values()) {
      expect(REGISTERED_KEYS.has(group)).toBe(true);
    }
  });

  it('REGISTERED_EXTENSION_GROUP_KEYS has exactly 16 entries (12 pillars/cross-cutting + a2a-handoff + cli-execution + lifecycle-observation + provisioning-lifecycle)', () => {
    expect(REGISTERED_KEYS.size).toBe(EXPECTED_REGISTERED_GROUP_COUNT);
  });
});

// ---------------------------------------------------------------------------
// Absent/empty extension enforcement (Option A: real enforcement)
// ---------------------------------------------------------------------------

describe('verifyLocal(): absent/empty extension enforcement', () => {
  it('strict: extensions absent -> E_EXTENSION_GROUP_REQUIRED', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      pillars: ['commerce'],
      privateKey,
      kid: testKid,
    });
    const result = await verifyLocal(jws, publicKey, { strictness: 'strict' });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_EXTENSION_GROUP_REQUIRED');
      expect(result.details?.type).toBe('org.peacprotocol/payment');
      expect(result.details?.expected_extension_group).toBe('org.peacprotocol/commerce');
      expect(result.details?.present_registered_extension_groups).toEqual([]);
    }
  });

  it('strict: extensions empty object -> E_EXTENSION_GROUP_REQUIRED', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/consent-record',
      pillars: ['consent'],
      extensions: {},
      privateKey,
      kid: testKid,
    });
    const result = await verifyLocal(jws, publicKey, { strictness: 'strict' });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_EXTENSION_GROUP_REQUIRED');
      expect(result.details?.expected_extension_group).toBe('org.peacprotocol/consent');
    }
  });

  it('interop: extensions absent -> extension_group_missing warning', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      pillars: ['commerce'],
      privateKey,
      kid: testKid,
    });
    const result = await verifyLocal(jws, publicKey, { strictness: 'interop' });
    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const w = result.warnings.find((w) => w.code === WARNING_EXTENSION_GROUP_MISSING);
      expect(w).toBeDefined();
      expect(w!.pointer).toBe('/type');
    }
  });

  it('interop: extensions empty object -> extension_group_missing warning', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/safety-review',
      pillars: ['safety'],
      extensions: {},
      privateKey,
      kid: testKid,
    });
    const result = await verifyLocal(jws, publicKey, { strictness: 'interop' });
    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const w = result.warnings.find((w) => w.code === WARNING_EXTENSION_GROUP_MISSING);
      expect(w).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Verifier contract shape: pointer and details
// ---------------------------------------------------------------------------

describe('verifyLocal(): enforcement contract shape', () => {
  it('strict missing: pointer is /type, details has expected_extension_group and empty present list', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/privacy-signal',
      pillars: ['privacy'],
      privateKey,
      kid: testKid,
    });
    const result = await verifyLocal(jws, publicKey, { strictness: 'strict' });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_EXTENSION_GROUP_REQUIRED');
      expect(result.details?.type).toBe('org.peacprotocol/privacy-signal');
      expect(result.details?.expected_extension_group).toBe('org.peacprotocol/privacy');
      expect(result.details?.present_registered_extension_groups).toEqual([]);
    }
  });

  it('strict mismatch: pointer is /type, details has expected and present groups', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      pillars: ['commerce'],
      extensions: {
        'org.peacprotocol/safety': { review_status: 'reviewed' },
      },
      privateKey,
      kid: testKid,
    });
    const result = await verifyLocal(jws, publicKey, { strictness: 'strict' });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_EXTENSION_GROUP_MISMATCH');
      expect(result.details?.type).toBe('org.peacprotocol/payment');
      expect(result.details?.expected_extension_group).toBe('org.peacprotocol/commerce');
      expect(result.details?.present_registered_extension_groups).toContain(
        'org.peacprotocol/safety'
      );
    }
  });

  it('interop missing: warning pointer is /type', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/attribution-event',
      pillars: ['attribution'],
      privateKey,
      kid: testKid,
    });
    const result = await verifyLocal(jws, publicKey, { strictness: 'interop' });
    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const w = result.warnings.find((w) => w.code === WARNING_EXTENSION_GROUP_MISSING);
      expect(w).toBeDefined();
      expect(w!.pointer).toBe('/type');
    }
  });

  it('interop mismatch: warning pointer is /type', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      pillars: ['commerce'],
      extensions: {
        'org.peacprotocol/consent': { consent_basis: 'explicit', consent_status: 'granted' },
      },
      privateKey,
      kid: testKid,
    });
    const result = await verifyLocal(jws, publicKey, { strictness: 'interop' });
    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const w = result.warnings.find((w) => w.code === WARNING_EXTENSION_GROUP_MISMATCH);
      expect(w).toBeDefined();
      expect(w!.pointer).toBe('/type');
    }
  });
});
