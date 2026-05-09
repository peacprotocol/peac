/**
 * Wire 0.2 warning emission tests for verifyLocal() (v0.12.0-preview.1)
 *
 * Tests: type_unregistered and unknown_extension_preserved warning emission,
 * RFC 6901 pointer construction, conformance-safe assertion (code + pointer only).
 */

import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import {
  WARNING_TYPE_UNREGISTERED,
  WARNING_UNKNOWN_EXTENSION,
  REGISTERED_RECEIPT_TYPES,
} from '@peac/schema';
import { TYPE_TO_EXTENSION_MAP } from '@peac/kernel';
import { issueWire02, verifyLocal } from '../src/index';

// Shared test constants
const testKid = '2026-03-03T00:00:00Z';
const testIss = 'https://api.example.com';
const commerceExtensions = {
  'org.peacprotocol/commerce': {
    payment_rail: 'stripe',
    amount_minor: '1000',
    currency: 'USD',
  },
};

/** Minimal valid extension for each registered group key */
const MINIMAL_EXT: Record<string, Record<string, unknown>> = {
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
  // a2a-handoff (uses Agent Card observation shape; sufficient for the
  // does-not-emit-type_unregistered iteration; type-specific shape is
  // exercised by the a2a-handoff parity corpus).
  'org.peacprotocol/a2a-handoff': {
    type: 'org.peacprotocol/a2a-agent-card-observation',
    card_ref: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
    signature_observation: { present: true, caller_reported_verification: 'not_checked' },
    discovered_at: '2026-05-05T12:00:00Z',
    discovery_path: '/.well-known/agent-card.json',
  },
  // CLI execution observation (uses minimal hashed observation; sufficient
  // for the does-not-emit-type_unregistered iteration; type-specific shape
  // is exercised by the cli-execution parity corpus).
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
  // Provisioning lifecycle (uses resource-observed vector; sufficient for
  // the does-not-emit-type_unregistered iteration; per-event-kind shape is
  // exercised by the provisioning-lifecycle parity corpus and schema tests).
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
  // Lifecycle observation (uses workflow-transition vector; sufficient for
  // the does-not-emit-type_unregistered iteration; type-specific shape is
  // exercised by the lifecycle-observation parity corpus and schema tests).
  'org.peacprotocol/lifecycle-observation': {
    event_kind: 'lifecycle-workflow-transition',
    subject_ref: 'urn:peac:task:wire-warnings-test',
    observed_at: '2026-05-12T10:00:00Z',
    from_state: 'pending',
    to_state: 'running',
  },
};

function extensionsForType(type: string): Record<string, Record<string, unknown>> | undefined {
  const group = TYPE_TO_EXTENSION_MAP.get(type);
  if (!group || !MINIMAL_EXT[group]) return undefined;
  return { [group]: MINIMAL_EXT[group] };
}

// ---------------------------------------------------------------------------
// type_unregistered warning
// ---------------------------------------------------------------------------

describe('verifyLocal(): type_unregistered warning', () => {
  it('emits type_unregistered for unregistered type value', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'com.example/custom-flow',
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const w = result.warnings.find((w) => w.code === WARNING_TYPE_UNREGISTERED);
      expect(w).toBeDefined();
      expect(w!.code).toBe('type_unregistered');
      expect(w!.pointer).toBe('/type');
    }
  });

  it('does NOT emit type_unregistered for registered type (org.peacprotocol/payment)', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: commerceExtensions,
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_TYPE_UNREGISTERED)).toBe(false);
    }
  });

  it('does NOT emit type_unregistered for all registered types', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    for (const type of REGISTERED_RECEIPT_TYPES) {
      const { jws } = await issueWire02({
        iss: testIss,
        kind: 'evidence',
        type,
        ...(extensionsForType(type) ? { extensions: extensionsForType(type) } : {}),
        privateKey,
        kid: testKid,
      });

      const result = await verifyLocal(jws, publicKey);
      expect(result.valid).toBe(true);
      if (result.valid && result.variant === 'wire-02') {
        expect(result.warnings.some((w) => w.code === WARNING_TYPE_UNREGISTERED)).toBe(false);
      }
    }
  });

  it('conformance: asserts only code + pointer, not message', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'com.example/unregistered-type',
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const w = result.warnings.find((w) => w.code === WARNING_TYPE_UNREGISTERED);
      expect(w).toBeDefined();
      // Conformance-safe: only assert code + pointer
      expect(w!.code).toBe('type_unregistered');
      expect(w!.pointer).toBe('/type');
      // Message exists but its content is implementation-defined
      expect(typeof w!.message).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// unknown_extension_preserved warning
// ---------------------------------------------------------------------------

describe('verifyLocal(): unknown_extension_preserved warning', () => {
  it('emits unknown_extension_preserved for unrecognized extension key', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        ...commerceExtensions,
        'com.example/custom-data': { foo: 'bar' },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const w = result.warnings.find((w) => w.code === WARNING_UNKNOWN_EXTENSION);
      expect(w).toBeDefined();
      expect(w!.code).toBe('unknown_extension_preserved');
      expect(w!.pointer).toBe('/extensions/com.example~1custom-data');
    }
  });

  it('emits correct RFC 6901 pointer with ~1 escaping for key containing slash', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        ...commerceExtensions,
        'io.vendor/my-ext': { value: 1 },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const w = result.warnings.find((w) => w.code === WARNING_UNKNOWN_EXTENSION);
      expect(w).toBeDefined();
      // '/' in key escaped as '~1' per RFC 6901
      expect(w!.pointer).toBe('/extensions/io.vendor~1my-ext');
    }
  });

  it('does not emit warning for known extension keys', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      pillars: ['commerce'],
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'x402',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_UNKNOWN_EXTENSION)).toBe(false);
    }
  });

  it('does not emit warning for newly registered consent extension key', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/consent-record',
      pillars: ['consent'],
      extensions: {
        'org.peacprotocol/consent': {
          consent_basis: 'explicit',
          consent_status: 'granted',
        },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_UNKNOWN_EXTENSION)).toBe(false);
    }
  });

  it('does not emit warning for newly registered safety extension key', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/safety-review',
      pillars: ['safety'],
      extensions: {
        'org.peacprotocol/safety': {
          review_status: 'reviewed',
        },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_UNKNOWN_EXTENSION)).toBe(false);
    }
  });

  it('does not emit warning for registered compliance extension key', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/compliance-check',
      pillars: ['compliance'],
      extensions: {
        'org.peacprotocol/compliance': {
          framework: 'soc2-type2',
          compliance_status: 'compliant',
        },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_UNKNOWN_EXTENSION)).toBe(false);
    }
  });

  it('does not emit warning for registered attribution extension key', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/attribution-event',
      pillars: ['attribution'],
      extensions: {
        'org.peacprotocol/attribution': {
          creator_ref: 'did:web:example.com',
        },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_UNKNOWN_EXTENSION)).toBe(false);
    }
  });

  it('does not emit warning for registered purpose extension key', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/purpose-declaration',
      pillars: ['purpose'],
      extensions: {
        'org.peacprotocol/purpose': {
          external_purposes: ['ai_training'],
        },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_UNKNOWN_EXTENSION)).toBe(false);
    }
  });

  it('does not emit warning for registered provenance extension key', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/provenance-record',
      pillars: ['provenance'],
      extensions: {
        'org.peacprotocol/provenance': {
          source_type: 'original',
        },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_UNKNOWN_EXTENSION)).toBe(false);
    }
  });

  it('does not emit unknown_extension warning when extensions contains only expected group', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: commerceExtensions,
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_UNKNOWN_EXTENSION)).toBe(false);
    }
  });

  it('does not emit unknown_extension warning when extensions is empty (interop)', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {},
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey, { strictness: 'interop' });

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_UNKNOWN_EXTENSION)).toBe(false);
    }
  });

  it('emits multiple warnings for multiple unknown keys (sorted by pointer)', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        ...commerceExtensions,
        'com.alpha/ext-a': { a: 1 },
        'com.beta/ext-b': { b: 2 },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const unknownWarnings = result.warnings.filter((w) => w.code === WARNING_UNKNOWN_EXTENSION);
      expect(unknownWarnings.length).toBe(2);
      // Sorted by pointer ascending
      expect(unknownWarnings[0].pointer).toBe('/extensions/com.alpha~1ext-a');
      expect(unknownWarnings[1].pointer).toBe('/extensions/com.beta~1ext-b');
    }
  });

  it('underscore-containing segment key accepted with warning', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        ...commerceExtensions,
        'com.example/custom_data': { value: 'test' },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const w = result.warnings.find((w) => w.code === WARNING_UNKNOWN_EXTENSION);
      expect(w).toBeDefined();
      expect(w!.pointer).toBe('/extensions/com.example~1custom_data');
    }
  });
});

// ---------------------------------------------------------------------------
// Combined warnings
// ---------------------------------------------------------------------------

describe('verifyLocal(): combined warning scenarios', () => {
  it('emits both type_unregistered and unknown_extension_preserved', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'com.example/custom-flow',
      extensions: {
        'com.example/custom-ext': { x: 1 },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_TYPE_UNREGISTERED)).toBe(true);
      expect(result.warnings.some((w) => w.code === WARNING_UNKNOWN_EXTENSION)).toBe(true);
      // Verify sorting: unknown_extension (/extensions/...) before type_unregistered (/type)
      // because 'e' < 't' in lexicographic pointer order
      const extIdx = result.warnings.findIndex((w) => w.code === WARNING_UNKNOWN_EXTENSION);
      const typeIdx = result.warnings.findIndex((w) => w.code === WARNING_TYPE_UNREGISTERED);
      expect(extIdx).toBeLessThan(typeIdx);
    }
  });

  it('known extension key alongside unknown key: only unknown key warns', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      pillars: ['commerce'],
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '5000',
          currency: 'USD',
        },
        'com.vendor/audit-trail': { ts: '2026-03-03' },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const unknownWarnings = result.warnings.filter((w) => w.code === WARNING_UNKNOWN_EXTENSION);
      expect(unknownWarnings.length).toBe(1);
      expect(unknownWarnings[0].pointer).toBe('/extensions/com.vendor~1audit-trail');
    }
  });
});
