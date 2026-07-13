/**
 * Runtime smoke test for examples/agent-run-lineage-records.
 *
 * The example is a public, copy-paste artifact, so its end-to-end behavior is
 * gated here (vitest aliases @peac/* to source, so no build/install is needed).
 * Covers the documented evidence-consistency result and every invalid-evidence
 * classification: top-level input snapshotting (including public-key validation
 * and copy isolation), manifest validation (including nested descriptor
 * getter/Proxy traps and a valid-shaped oversize), strict record/extension/
 * correlation validation, full event/descriptor equality, exact RFC 3339
 * temporal ordering, finalization classification and sequence, summary coverage
 * and Merkle mutation, strict parent-fork evidence, the changed-event binding,
 * resource limits, and privacy sentinels.
 *
 * No network, no subprocess.
 */

import { describe, it, expect } from 'vitest';
import { computeJsonDocumentDigestJcs, issue, verifyLocal } from '@peac/protocol';
import { type AgentActionTypeUri, computeReceiptRef } from '@peac/schema';
import { generateKeypair } from '@peac/crypto';
import { buildReceiptMerkleCommitment } from '../../packages/audit/src/merkle';
import {
  type AgentRunManifestV1,
  AGENT_RUN_MANIFEST_ARTIFACT_TYPE,
  MANIFEST_LIMITS,
  computeEventDescriptorDigest,
  computeManifestDigest,
  validateAgentRunManifest,
} from '../../examples/agent-run-lineage-records/manifest';
import {
  verifyAgentRunLineageEvidence,
  AGENT_ACTION_EXTENSION_KEY,
  AGENT_RUN_LINEAGE_LIMITS,
  CORRELATION_EXTENSION_KEY,
  DELEGATED_TYPE,
  FINALIZATION_ACTION_REF,
  INVOKED_TYPE,
  MERKLE_TREE_ALG,
  RUN_FORK_EXTENSION_KEY,
  RUN_LINEAGE_EXTENSION_KEY,
  RUN_SUMMARY_EXTENSION_KEY,
  isValidForkExtension,
  isValidLineageExtension,
  isValidSummaryExtension,
} from '../../examples/agent-run-lineage-records/verify';
import {
  ISSUER,
  KID,
  WORKFLOW_ID,
  RUN_REF,
  AGENT_REF,
  buildAgentRunManifest,
  buildForkManifest,
  issueRun,
  runAgentRunLineageDemo,
  tamperPayload,
} from '../../examples/agent-run-lineage-records/demo';

/**
 * Test-local raw issuer: emits an agent-action record with arbitrary extension
 * payloads so tests can construct fixtures the strict verifier must reject.
 */
async function issueRawRecord(opts: {
  privateKey: Uint8Array;
  type: AgentActionTypeUri;
  action: Record<string, unknown>;
  correlation?: Record<string, unknown>;
  lineage?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  fork?: Record<string, unknown>;
  issuer?: string;
  jti?: string;
}): Promise<string> {
  const extensions: Record<string, unknown> = { [AGENT_ACTION_EXTENSION_KEY]: opts.action };
  if (opts.correlation) extensions[CORRELATION_EXTENSION_KEY] = opts.correlation;
  if (opts.lineage) extensions[RUN_LINEAGE_EXTENSION_KEY] = opts.lineage;
  if (opts.summary) extensions[RUN_SUMMARY_EXTENSION_KEY] = opts.summary;
  if (opts.fork) extensions[RUN_FORK_EXTENSION_KEY] = opts.fork;
  const { jws } = await issue({
    iss: opts.issuer ?? ISSUER,
    kind: 'evidence',
    type: opts.type,
    pillars: ['provenance'],
    ...(opts.jti !== undefined ? { jti: opts.jti } : {}),
    extensions,
    privateKey: opts.privateKey,
    kid: KID,
  });
  return jws;
}

type Reason = string;
const bad = (reason: Reason) => ({ kind: 'invalid-evidence', reason });

async function jcs(value: Record<string, unknown>): Promise<string> {
  return computeJsonDocumentDigestJcs(
    value as unknown as Parameters<typeof computeJsonDocumentDigestJcs>[0]
  );
}
async function refOf(jws: string): Promise<string> {
  return computeReceiptRef(jws);
}
async function jtiOf(jws: string, publicKey: Uint8Array): Promise<string> {
  const v = await verifyLocal(jws, publicKey, { issuer: ISSUER });
  if (!v.valid) throw new Error(`did not verify: ${v.code}`);
  return (v.claims as unknown as { jti: string }).jti;
}
function decodeClaims(jws: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jws.split('.')[1], 'base64url').toString('utf8'));
}

async function setup() {
  const { publicKey, privateKey } = await generateKeypair();
  const manifest = await buildAgentRunManifest();
  const run = await issueRun({ privateKey, publicKey, manifest });
  const records = [...run.eventJws, run.finalizationJws];
  const expected = { expectedManifest: manifest, publicKey, expectedIssuer: ISSUER } as const;
  return { publicKey, privateKey, manifest, run, records, expected };
}

/** A single valid model-call manifest with an overridable descriptor. */
async function oneEventManifest(over: Record<string, unknown> = {}): Promise<AgentRunManifestV1> {
  const input = await jcs({ k: 'model-input' });
  const output = await jcs({ k: 'model-output' });
  const event = {
    event_ref: 'urn:example:event:001',
    sequence_index: 0,
    event_kind: 'model-call',
    agent_ref: AGENT_REF,
    action_ref: 'urn:example:action:model-call',
    observed_at: '2026-01-15T10:00:00Z',
    input_digest: input,
    output_digest: output,
    ...over,
  };
  return {
    artifact_type: AGENT_RUN_MANIFEST_ARTIFACT_TYPE,
    run_ref: RUN_REF,
    workflow_id: WORKFLOW_ID,
    event_count: 1,
    events: [event as never],
  };
}

/**
 * Build materials for a valid single-event run: the manifest, its digest, a
 * valid event record (root), its ref/jti, the covered set, and the valid
 * finalization pieces. Tests then rebuild the finalization with `issueRawRecord`
 * to inject one targeted defect.
 */
async function materials(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  descriptorOver: Record<string, unknown> = {}
) {
  const manifest = await oneEventManifest(descriptorOver);
  const md = await computeManifestDigest(manifest);
  const desc = manifest.events[0];
  const dd = await computeEventDescriptorDigest(desc);
  const eventAction: Record<string, unknown> = {
    event_kind: 'agent-action-invoked-observed',
    agent_ref: desc.agent_ref,
    action_ref: desc.action_ref,
    observed_at: desc.observed_at,
    upstream_artifact_ref: desc.event_ref,
    upstream_artifact_digest: dd,
  };
  const eventJws = await issueRawRecord({
    privateKey,
    type: INVOKED_TYPE,
    action: eventAction,
    correlation: { workflow_id: WORKFLOW_ID },
    lineage: { run_ref: RUN_REF, run_manifest_digest: md, sequence_index: 0 },
  });
  const eref = await refOf(eventJws);
  const ejti = await jtiOf(eventJws, publicKey);
  const covered = [eref];
  const commitment = buildReceiptMerkleCommitment(covered as never);
  const validSummary = {
    covered_record_refs: covered,
    covered_record_count: 1,
    merkle_commitment: {
      tree_alg: commitment.tree_alg,
      hash_alg: commitment.hash_alg,
      root: commitment.root,
      tree_size: commitment.tree_size,
    },
  };
  const finalAction = {
    event_kind: 'agent-action-invoked-observed',
    agent_ref: AGENT_REF,
    action_ref: FINALIZATION_ACTION_REF,
    observed_at: '2026-01-15T10:03:00Z',
    parent_ref: eref,
  };
  const finalCorr = { workflow_id: WORKFLOW_ID, parent_jti: ejti, depends_on: [ejti] };
  const finalLineage = { run_ref: RUN_REF, run_manifest_digest: md, sequence_index: 1 };
  return {
    manifest,
    md,
    desc,
    dd,
    eventJws,
    eref,
    ejti,
    validSummary,
    finalAction,
    finalCorr,
    finalLineage,
  };
}

/** Issue a finalization with targeted overrides over the valid single-event pieces. */
async function finalizeWith(
  privateKey: Uint8Array,
  m: Awaited<ReturnType<typeof materials>>,
  over: {
    action?: Record<string, unknown>;
    correlation?: Record<string, unknown>;
    lineage?: Record<string, unknown>;
    summary?: Record<string, unknown> | 'omit';
    fork?: Record<string, unknown>;
    type?: string;
  } = {}
): Promise<string> {
  return issueRawRecord({
    privateKey,
    type: over.type ?? INVOKED_TYPE,
    action: over.action ?? m.finalAction,
    correlation: over.correlation ?? m.finalCorr,
    lineage: over.lineage ?? m.finalLineage,
    summary: over.summary === 'omit' ? undefined : (over.summary ?? m.validSummary),
    fork: over.fork,
  });
}

describe('agent-run-lineage-records: happy path + determinism', () => {
  it('parent run -> run-lineage-evidence-consistent', async () => {
    const s = await setup();
    const r = await verifyAgentRunLineageEvidence({ ...s.expected, records: s.records });
    expect(r.kind).toBe('run-lineage-evidence-consistent');
  });

  it('demo end to end is ok with exact result names', async () => {
    const r = await runAgentRunLineageDemo(await generateKeypair());
    expect(r).toMatchObject({
      ok: true,
      parentResult: 'run-lineage-evidence-consistent',
      manifestTamperResult: 'invalid-evidence: run-manifest-mismatch',
      payloadTamperResult: 'invalid-evidence: record-invalid',
      forkResult: 'run-lineage-evidence-consistent',
    });
  });

  it('permutation-stable, duplicate-safe, non-mutating, complete result equality', async () => {
    const s = await setup();
    const a = await verifyAgentRunLineageEvidence({ ...s.expected, records: s.records });
    const b = await verifyAgentRunLineageEvidence({
      ...s.expected,
      records: [...s.records].reverse(),
    });
    expect(a).toEqual(b);
    const dup = await verifyAgentRunLineageEvidence({
      ...s.expected,
      records: [...s.records, s.records[0]],
    });
    expect(dup).toEqual(a);
    const recordsCopy = [...s.records];
    const manifestJson = JSON.stringify(s.manifest);
    await verifyAgentRunLineageEvidence({ ...s.expected, records: s.records });
    expect(s.records).toEqual(recordsCopy);
    expect(JSON.stringify(s.manifest)).toBe(manifestJson);
  });

  it('mixed-invalid permutation is order-independent', async () => {
    const s = await setup();
    const other = await generateKeypair();
    const bogus = await issueRawRecord({
      privateKey: other.privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: 'urn:x:y',
        observed_at: '2026-01-15T10:00:00Z',
      },
    });
    const set = [bogus, ...s.records];
    const a = await verifyAgentRunLineageEvidence({ ...s.expected, records: set });
    const b = await verifyAgentRunLineageEvidence({ ...s.expected, records: [...set].reverse() });
    expect(a.kind).toBe('invalid-evidence');
    expect(a).toEqual(b);
  });

  it('result coveredRecordRefs is a frozen copy', async () => {
    const s = await setup();
    const r = await verifyAgentRunLineageEvidence({ ...s.expected, records: s.records });
    if (r.kind !== 'run-lineage-evidence-consistent') throw new Error('expected consistent');
    expect(Object.isFrozen(r.coveredRecordRefs)).toBe(true);
  });

  it('manifest + events + descriptors deeply frozen; digest stable', async () => {
    const res = validateAgentRunManifest(await buildAgentRunManifest());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Object.isFrozen(res.manifest)).toBe(true);
    expect(Object.isFrozen(res.manifest.events)).toBe(true);
    expect(Object.isFrozen(res.manifest.events[0])).toBe(true);
    const d1 = await computeManifestDigest(res.manifest);
    const d2 = await computeManifestDigest((await buildAgentRunManifest()) as never);
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe('agent-run-lineage-records: manifest validation', () => {
  it('null / array / non-object -> manifest-invalid', () => {
    for (const v of [null, [], 42, 'x', undefined]) {
      expect(validateAgentRunManifest(v)).toEqual({ ok: false, reason: 'manifest-invalid' });
    }
  });

  it('unknown or missing top-level key -> manifest-invalid', async () => {
    const m = await buildAgentRunManifest();
    expect(validateAgentRunManifest({ ...m, extra: 'x' })).toEqual({
      ok: false,
      reason: 'manifest-invalid',
    });
    const { run_ref: _drop, ...missing } = m as Record<string, unknown>;
    expect(validateAgentRunManifest(missing)).toEqual({ ok: false, reason: 'manifest-invalid' });
  });

  it('top-level throwing getter -> manifest-invalid without throwing', async () => {
    const m = { ...(await buildAgentRunManifest()) } as Record<string, unknown>;
    Object.defineProperty(m, 'run_ref', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    expect(() => validateAgentRunManifest(m)).not.toThrow();
    expect(validateAgentRunManifest(m)).toEqual({ ok: false, reason: 'manifest-invalid' });
  });

  it('top-level Proxy ownKeys trap throws -> manifest-invalid without throwing', async () => {
    const m = new Proxy((await buildAgentRunManifest()) as unknown as Record<string, unknown>, {
      ownKeys() {
        throw new Error('boom');
      },
    });
    expect(() => validateAgentRunManifest(m)).not.toThrow();
    expect(validateAgentRunManifest(m)).toEqual({ ok: false, reason: 'manifest-invalid' });
  });

  it('NESTED descriptor required-field getter throws -> manifest-invalid without throwing', async () => {
    const m = await buildAgentRunManifest();
    const hostile: Record<string, unknown> = { ...m.events[0] };
    Object.defineProperty(hostile, 'input_digest', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    const tampered = { ...m, events: [hostile, m.events[1], m.events[2]] };
    expect(() => validateAgentRunManifest(tampered)).not.toThrow();
    expect(validateAgentRunManifest(tampered)).toEqual({ ok: false, reason: 'manifest-invalid' });
  });

  it('NESTED descriptor Proxy get/ownKeys/getPrototypeOf traps throw -> manifest-invalid without throwing', async () => {
    const m = await buildAgentRunManifest();
    for (const trap of ['get', 'ownKeys', 'getPrototypeOf'] as const) {
      const handler: ProxyHandler<Record<string, unknown>> = {};
      (handler as Record<string, unknown>)[trap] = () => {
        throw new Error('boom');
      };
      const hostile = new Proxy({ ...m.events[0] } as Record<string, unknown>, handler);
      const tampered = { ...m, events: [hostile, m.events[1], m.events[2]] };
      expect(() => validateAgentRunManifest(tampered)).not.toThrow();
      expect(validateAgentRunManifest(tampered)).toEqual({ ok: false, reason: 'manifest-invalid' });
    }
  });

  it('valid-shaped manifest exceeding the byte bound -> input-limit-exceeded', async () => {
    // 16 events, each with maximal-length (valid) opaque refs, serializes > 16 KiB.
    const pad = 'a'.repeat(230);
    const events = Array.from({ length: MANIFEST_LIMITS.maxEvents }, (_, i) => ({
      event_ref: `urn:example:event:${pad}:${i}`,
      sequence_index: i,
      event_kind: 'model-call' as const,
      agent_ref: `urn:example:agent:${pad}`,
      action_ref: `urn:example:action:${pad}`,
      observed_at: '2026-01-15T10:00:00Z',
      input_digest: `sha256:${'0'.repeat(64)}`,
      output_digest: `sha256:${'1'.repeat(64)}`,
    }));
    const m = {
      artifact_type: AGENT_RUN_MANIFEST_ARTIFACT_TYPE,
      run_ref: RUN_REF,
      workflow_id: WORKFLOW_ID,
      event_count: events.length,
      events,
    };
    // Every field is individually valid, so the only failure is the byte bound.
    expect(validateAgentRunManifest(m)).toEqual({ ok: false, reason: 'input-limit-exceeded' });
  });

  it('zero events / over-max events -> manifest-invalid', async () => {
    const m = await buildAgentRunManifest();
    expect(validateAgentRunManifest({ ...m, event_count: 0, events: [] })).toEqual({
      ok: false,
      reason: 'manifest-invalid',
    });
    const many = Array.from({ length: MANIFEST_LIMITS.maxEvents + 1 }, (_, i) => ({
      event_ref: `urn:example:event:${i}`,
      sequence_index: i,
      event_kind: 'model-call' as const,
      agent_ref: AGENT_REF,
      action_ref: 'urn:x:y',
      observed_at: '2026-01-15T10:00:00Z',
      input_digest: `sha256:${'0'.repeat(64)}`,
      output_digest: `sha256:${'0'.repeat(64)}`,
    }));
    expect(validateAgentRunManifest({ ...m, event_count: many.length, events: many })).toEqual({
      ok: false,
      reason: 'manifest-invalid',
    });
  });

  it('missing / unknown descriptor keys -> manifest-invalid', async () => {
    const m = await buildAgentRunManifest();
    const { output_digest: _o, ...missing } = m.events[0] as Record<string, unknown>;
    expect(validateAgentRunManifest({ ...m, events: [missing, m.events[1], m.events[2]] })).toEqual(
      { ok: false, reason: 'manifest-invalid' }
    );
    const extra = { ...m.events[0], surprise: 1 };
    expect(validateAgentRunManifest({ ...m, events: [extra, m.events[1], m.events[2]] })).toEqual({
      ok: false,
      reason: 'manifest-invalid',
    });
  });

  it('malformed ref / digest / timestamp fields -> manifest-invalid', async () => {
    const m = await buildAgentRunManifest();
    const cases = [
      { event_ref: 'not-an-opaque-ref' },
      { input_digest: 'sha256:zz' },
      { output_digest: 'deadbeef' },
      { observed_at: 'not-a-time' },
      { agent_ref: 'plain name' },
    ];
    for (const c of cases) {
      const mutated = { ...m, events: [{ ...m.events[0], ...c }, m.events[1], m.events[2]] };
      expect(validateAgentRunManifest(mutated)).toEqual({ ok: false, reason: 'manifest-invalid' });
    }
  });

  it('negative / duplicate / gapped sequence indices + count mismatch + dup event_ref -> manifest-invalid', async () => {
    const m = await buildAgentRunManifest();
    expect(
      validateAgentRunManifest({
        ...m,
        events: m.events.map((e) => ({ ...e, sequence_index: -1 })),
      })
    ).toEqual({ ok: false, reason: 'manifest-invalid' });
    expect(
      validateAgentRunManifest({
        ...m,
        events: m.events.map((e, i) => ({ ...e, sequence_index: i + 5 })),
      })
    ).toEqual({ ok: false, reason: 'manifest-invalid' });
    expect(validateAgentRunManifest({ ...m, event_count: 2 })).toEqual({
      ok: false,
      reason: 'manifest-invalid',
    });
    expect(
      validateAgentRunManifest({
        ...m,
        events: m.events.map((e) => ({ ...e, event_ref: 'urn:example:event:dup' })),
      })
    ).toEqual({ ok: false, reason: 'manifest-invalid' });
  });

  it('stateful descriptor Proxy whose SECOND ownKeys throws -> manifest-invalid without throwing', async () => {
    const m = await buildAgentRunManifest();
    // Own-keys are captured once inside the guard: an extra own key fails the
    // key check on the first read, and a second ownKeys access would throw.
    const mkTampered = () => {
      let calls = 0;
      const target = { ...m.events[0], extra: 1 };
      const hostile = new Proxy(target, {
        ownKeys(t) {
          calls += 1;
          if (calls >= 2) throw new Error('second ownKeys');
          return Reflect.ownKeys(t);
        },
      });
      return { ...m, events: [hostile, m.events[1], m.events[2]] };
    };
    expect(() => validateAgentRunManifest(mkTampered())).not.toThrow();
    expect(validateAgentRunManifest(mkTampered())).toEqual({
      ok: false,
      reason: 'manifest-invalid',
    });
  });

  it('proxied events array whose length getter throws -> manifest-invalid without throwing', async () => {
    const m = await buildAgentRunManifest();
    const mk = () =>
      ({
        ...m,
        events: new Proxy([...m.events], {
          get(t, p, r) {
            if (p === 'length') throw new Error('boom');
            return Reflect.get(t, p, r);
          },
        }),
      }) as never;
    expect(() => validateAgentRunManifest(mk())).not.toThrow();
    expect(validateAgentRunManifest(mk())).toEqual({ ok: false, reason: 'manifest-invalid' });
  });

  it('proxied events array whose indexed get throws -> manifest-invalid without throwing', async () => {
    const m = await buildAgentRunManifest();
    const mk = () =>
      ({
        ...m,
        events: new Proxy([...m.events], {
          get(t, p, r) {
            if (typeof p === 'string' && /^\d+$/.test(p)) throw new Error('boom');
            return Reflect.get(t, p, r);
          },
        }),
      }) as never;
    expect(() => validateAgentRunManifest(mk())).not.toThrow();
    expect(validateAgentRunManifest(mk())).toEqual({ ok: false, reason: 'manifest-invalid' });
  });

  it('strict RFC 3339: minute precision rejected; seconds / fractional / offset accepted', async () => {
    const minute = await oneEventManifest({ observed_at: '2026-01-15T10:00Z' });
    expect(validateAgentRunManifest(minute)).toEqual({ ok: false, reason: 'manifest-invalid' });
    for (const ts of [
      '2026-01-15T10:00:00Z',
      '2026-01-15T10:00:00.500Z',
      '2026-01-15T10:00:00+05:30',
    ]) {
      const ok = await oneEventManifest({ observed_at: ts });
      expect(validateAgentRunManifest(ok).ok).toBe(true);
    }
  });
});

describe('agent-run-lineage-records: record + extension validation', () => {
  it('wrong issuer -> unexpected-issuer', async () => {
    const s = await setup();
    const r = await verifyAgentRunLineageEvidence({
      ...s.expected,
      expectedIssuer: 'https://other.example',
      records: s.records,
    });
    expect(r).toEqual(bad('unexpected-issuer'));
  });

  it('wrong key -> record-invalid', async () => {
    const s = await setup();
    const other = await generateKeypair();
    const r = await verifyAgentRunLineageEvidence({
      ...s.expected,
      publicKey: other.publicKey,
      records: s.records,
    });
    expect(r).toEqual(bad('record-invalid'));
  });

  it('tampered JWS payload -> record-invalid', async () => {
    const s = await setup();
    const r = await verifyAgentRunLineageEvidence({
      ...s.expected,
      records: [
        tamperPayload(s.run.eventJws[0]),
        ...s.run.eventJws.slice(1),
        s.run.finalizationJws,
      ],
    });
    expect(r).toEqual(bad('record-invalid'));
  });

  it('non-string record entry -> record-invalid (no throw)', async () => {
    const s = await setup();
    const r = await verifyAgentRunLineageEvidence({
      ...s.expected,
      records: [42 as unknown as string, ...s.records],
    });
    expect(r).toEqual(bad('record-invalid'));
  });

  it('unsupported record type -> unexpected-record-type', async () => {
    const s = await setup();
    const rec = await issueRawRecord({
      privateKey: s.privateKey,
      type: 'org.peacprotocol/agent-action-cancelled-observed',
      action: {
        event_kind: 'agent-action-cancelled-observed',
        agent_ref: AGENT_REF,
        action_ref: 'urn:x:y',
        observed_at: '2026-01-15T10:00:00Z',
      },
      correlation: { workflow_id: WORKFLOW_ID },
      lineage: { run_ref: RUN_REF, run_manifest_digest: s.run.manifestDigest, sequence_index: 0 },
    });
    const r = await verifyAgentRunLineageEvidence({ ...s.expected, records: [rec] });
    expect(r).toEqual(bad('unexpected-record-type'));
  });

  it('wrong workflow -> workflow-mismatch', async () => {
    const s = await setup();
    const m = await materials(s.privateKey, s.publicKey);
    const rec = await issueRawRecord({
      privateKey: s.privateKey,
      type: INVOKED_TYPE,
      action: m.finalAction,
      correlation: { workflow_id: 'other', parent_jti: m.ejti, depends_on: [m.ejti] },
      lineage: m.finalLineage,
      summary: m.validSummary,
    });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: m.manifest,
      publicKey: s.publicKey,
      expectedIssuer: ISSUER,
      records: [m.eventJws, rec],
    });
    expect(r).toEqual(bad('workflow-mismatch'));
  });

  it('wrong run_manifest_digest -> run-manifest-mismatch', async () => {
    const s = await setup();
    const rec = await issueRawRecord({
      privateKey: s.privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: 'urn:example:action:model-call',
        observed_at: '2026-01-15T10:00:00Z',
        upstream_artifact_ref: 'urn:example:event:001',
        upstream_artifact_digest: `sha256:${'0'.repeat(64)}`,
      },
      correlation: { workflow_id: WORKFLOW_ID },
      lineage: {
        run_ref: RUN_REF,
        run_manifest_digest: `sha256:${'1'.repeat(64)}`,
        sequence_index: 0,
      },
    });
    const r = await verifyAgentRunLineageEvidence({ ...s.expected, records: [rec] });
    expect(r).toEqual(bad('run-manifest-mismatch'));
  });

  it('malformed lineage primitive / unknown lineage key / bad lineage fields -> record-invalid', async () => {
    const s = await setup();
    const m = await materials(s.privateKey, s.publicKey);
    const variants = [
      'not-an-object',
      { run_ref: RUN_REF, run_manifest_digest: m.md, sequence_index: 0, extra: 1 },
      { run_ref: 'bad ref', run_manifest_digest: m.md, sequence_index: 0 },
      { run_ref: RUN_REF, run_manifest_digest: 'deadbeef', sequence_index: 0 },
      { run_ref: RUN_REF, run_manifest_digest: m.md, sequence_index: -1 },
    ];
    for (const lineage of variants) {
      const rec = await issueRawRecord({
        privateKey: s.privateKey,
        type: INVOKED_TYPE,
        action: {
          event_kind: 'agent-action-invoked-observed',
          agent_ref: AGENT_REF,
          action_ref: 'urn:example:action:model-call',
          observed_at: '2026-01-15T10:00:00Z',
          upstream_artifact_ref: 'urn:example:event:001',
          upstream_artifact_digest: m.dd,
        },
        correlation: { workflow_id: WORKFLOW_ID },
        lineage: lineage as never,
      });
      const r = await verifyAgentRunLineageEvidence({
        expectedManifest: m.manifest,
        publicKey: s.publicKey,
        expectedIssuer: ISSUER,
        records: [rec],
      });
      expect(r).toEqual(bad('record-invalid'));
    }
  });

  it('record with no lineage extension -> record-invalid', async () => {
    const s = await setup();
    const m = await materials(s.privateKey, s.publicKey);
    const noLineage = await issueRawRecord({
      privateKey: s.privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: 'urn:example:action:model-call',
        observed_at: '2026-01-15T10:00:00Z',
        upstream_artifact_ref: 'urn:example:event:001',
        upstream_artifact_digest: m.dd,
      },
      correlation: { workflow_id: WORKFLOW_ID },
      // no lineage extension at all
    });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: m.manifest,
      publicKey: s.publicKey,
      expectedIssuer: ISSUER,
      records: [noLineage],
    });
    expect(r).toEqual(bad('record-invalid'));
  });

  it('malformed correlation (bad depends_on / unknown key) is unissuable (canonical strict schema is the belt; verifier re-validates as suspenders)', async () => {
    const s = await setup();
    const m = await materials(s.privateKey, s.publicKey);
    const variants = [
      { workflow_id: WORKFLOW_ID, parent_jti: m.ejti, depends_on: [m.ejti, 42] },
      { workflow_id: WORKFLOW_ID, parent_jti: m.ejti, depends_on: [m.ejti], surprise: 1 },
    ];
    for (const correlation of variants) {
      // issue() validates the registered correlation extension, so a signed
      // record can never carry a malformed correlation; the verifier's
      // CorrelationExtensionSchema.safeParse is defense-in-depth for callers
      // that bypass issue().
      await expect(
        finalizeWith(s.privateKey, m, { correlation: correlation as never })
      ).rejects.toThrow();
    }
  });

  it('present-but-malformed summary primitive on the finalization -> record-invalid', async () => {
    const s = await setup();
    const m = await materials(s.privateKey, s.publicKey);
    const finalJws = await finalizeWith(s.privateKey, m, { summary: 'not-an-object' as never });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: m.manifest,
      publicKey: s.publicKey,
      expectedIssuer: ISSUER,
      records: [m.eventJws, finalJws],
    });
    expect(r).toEqual(bad('record-invalid'));
  });

  it('summary attached to an ordinary event record -> record-invalid', async () => {
    const s = await setup();
    const m = await materials(s.privateKey, s.publicKey);
    const eventWithSummary = await issueRawRecord({
      privateKey: s.privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: 'urn:example:action:model-call',
        observed_at: '2026-01-15T10:00:00Z',
        upstream_artifact_ref: 'urn:example:event:001',
        upstream_artifact_digest: m.dd,
      },
      correlation: { workflow_id: WORKFLOW_ID },
      lineage: { run_ref: RUN_REF, run_manifest_digest: m.md, sequence_index: 0 },
      summary: m.validSummary,
    });
    const finalJws = await finalizeWith(s.privateKey, m);
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: m.manifest,
      publicKey: s.publicKey,
      expectedIssuer: ISSUER,
      records: [eventWithSummary, finalJws],
    });
    expect(r).toEqual(bad('record-invalid'));
  });

  it('fork extension attached to an ordinary event record -> record-invalid', async () => {
    const s = await setup();
    const m = await materials(s.privateKey, s.publicKey);
    const eventWithFork = await issueRawRecord({
      privateKey: s.privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: 'urn:example:action:model-call',
        observed_at: '2026-01-15T10:00:00Z',
        upstream_artifact_ref: 'urn:example:event:001',
        upstream_artifact_digest: m.dd,
      },
      correlation: { workflow_id: WORKFLOW_ID },
      lineage: { run_ref: RUN_REF, run_manifest_digest: m.md, sequence_index: 0 },
      fork: {
        parent_run_summary_ref: `sha256:${'1'.repeat(64)}`,
        fork_point_record_ref: `sha256:${'2'.repeat(64)}`,
        changed_event_ref: 'urn:example:event:001',
        changed_input_digest: `sha256:${'3'.repeat(64)}`,
        diff_artifact_digest: `sha256:${'4'.repeat(64)}`,
      },
    });
    const finalJws = await finalizeWith(s.privateKey, m);
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: m.manifest,
      publicKey: s.publicKey,
      expectedIssuer: ISSUER,
      records: [eventWithFork, finalJws],
    });
    expect(r).toEqual(bad('record-invalid'));
  });

  it('exported issuance guards reject malformed example-local extension shapes', () => {
    for (const primitive of ['x', 42, null, []]) {
      expect(isValidLineageExtension(primitive)).toBe(false);
      expect(isValidSummaryExtension(primitive)).toBe(false);
      expect(isValidForkExtension(primitive)).toBe(false);
    }
    expect(
      isValidLineageExtension({
        run_ref: RUN_REF,
        run_manifest_digest: `sha256:${'0'.repeat(64)}`,
        sequence_index: 0,
      })
    ).toBe(true);
  });
});

describe('agent-run-lineage-records: event/descriptor equality', () => {
  async function mismatchExpect(
    descriptorOver: Record<string, unknown>,
    eventActionOver: Record<string, unknown>
  ) {
    const { publicKey, privateKey } = await generateKeypair();
    const manifest = await oneEventManifest(descriptorOver);
    const md = await computeManifestDigest(manifest);
    const desc = manifest.events[0];
    const dd = await computeEventDescriptorDigest(desc);
    const action: Record<string, unknown> = {
      event_kind: 'agent-action-invoked-observed',
      agent_ref: desc.agent_ref,
      action_ref: desc.action_ref,
      observed_at: desc.observed_at,
      upstream_artifact_ref: desc.event_ref,
      upstream_artifact_digest: dd,
      ...eventActionOver,
    };
    const eventJws = await issueRawRecord({
      privateKey,
      type: INVOKED_TYPE,
      action,
      correlation: { workflow_id: WORKFLOW_ID },
      lineage: { run_ref: RUN_REF, run_manifest_digest: md, sequence_index: 0 },
    });
    const eref = await refOf(eventJws);
    const ejti = await jtiOf(eventJws, publicKey);
    const commitment = buildReceiptMerkleCommitment([eref] as never);
    const finalJws = await issueRawRecord({
      privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: FINALIZATION_ACTION_REF,
        observed_at: '2026-01-15T10:03:00Z',
        parent_ref: eref,
      },
      correlation: { workflow_id: WORKFLOW_ID, parent_jti: ejti, depends_on: [ejti] },
      lineage: { run_ref: RUN_REF, run_manifest_digest: md, sequence_index: 1 },
      summary: {
        covered_record_refs: [eref],
        covered_record_count: 1,
        merkle_commitment: {
          tree_alg: commitment.tree_alg,
          hash_alg: commitment.hash_alg,
          root: commitment.root,
          tree_size: commitment.tree_size,
        },
      },
    });
    return verifyAgentRunLineageEvidence({
      expectedManifest: manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [eventJws, finalJws],
    });
  }

  it('wrong observed_at -> event-descriptor-mismatch', async () => {
    expect(await mismatchExpect({}, { observed_at: '2026-01-15T11:11:11Z' })).toEqual(
      bad('event-descriptor-mismatch')
    );
  });
  it('same instant, different string representation (+00:00 vs Z) -> event-descriptor-mismatch', async () => {
    // Descriptor stays "...Z"; record reports "...+00:00" (same instant). Exact
    // string equality must reject it as a different descriptor field.
    expect(await mismatchExpect({}, { observed_at: '2026-01-15T10:00:00+00:00' })).toEqual(
      bad('event-descriptor-mismatch')
    );
  });
  it('wrong agent_ref -> event-descriptor-mismatch', async () => {
    expect(await mismatchExpect({}, { agent_ref: 'urn:agent:impostor' })).toEqual(
      bad('event-descriptor-mismatch')
    );
  });
  it('wrong action_ref -> event-descriptor-mismatch', async () => {
    expect(await mismatchExpect({}, { action_ref: 'urn:example:action:other' })).toEqual(
      bad('event-descriptor-mismatch')
    );
  });
  it('wrong upstream_artifact_ref -> event-descriptor-mismatch', async () => {
    expect(await mismatchExpect({}, { upstream_artifact_ref: 'urn:example:event:999' })).toEqual(
      bad('event-descriptor-mismatch')
    );
  });
  it('wrong upstream_artifact_digest -> event-descriptor-mismatch', async () => {
    expect(
      await mismatchExpect({}, { upstream_artifact_digest: `sha256:${'a'.repeat(64)}` })
    ).toEqual(bad('event-descriptor-mismatch'));
  });

  it('wrong delegated_to_ref -> event-descriptor-mismatch', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const input = await jcs({ k: 'd' });
    const desc = {
      event_ref: 'urn:example:event:001',
      sequence_index: 0,
      event_kind: 'delegation' as const,
      agent_ref: AGENT_REF,
      action_ref: 'urn:example:action:delegate',
      observed_at: '2026-01-15T10:00:00Z',
      input_digest: input,
      delegated_to_ref: 'urn:agent:real-delegate',
    };
    const manifest = {
      artifact_type: AGENT_RUN_MANIFEST_ARTIFACT_TYPE,
      run_ref: RUN_REF,
      workflow_id: WORKFLOW_ID,
      event_count: 1,
      events: [desc],
    } as AgentRunManifestV1;
    const md = await computeManifestDigest(manifest);
    const dd = await computeEventDescriptorDigest(desc as never);
    const eventJws = await issueRawRecord({
      privateKey,
      type: DELEGATED_TYPE,
      action: {
        event_kind: 'agent-action-delegated-observed',
        agent_ref: AGENT_REF,
        action_ref: 'urn:example:action:delegate',
        observed_at: '2026-01-15T10:00:00Z',
        upstream_artifact_ref: 'urn:example:event:001',
        upstream_artifact_digest: dd,
        delegated_to_ref: 'urn:agent:WRONG',
      },
      correlation: { workflow_id: WORKFLOW_ID },
      lineage: { run_ref: RUN_REF, run_manifest_digest: md, sequence_index: 0 },
    });
    const eref = await refOf(eventJws);
    const ejti = await jtiOf(eventJws, publicKey);
    const commitment = buildReceiptMerkleCommitment([eref] as never);
    const finalJws = await issueRawRecord({
      privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: FINALIZATION_ACTION_REF,
        observed_at: '2026-01-15T10:03:00Z',
        parent_ref: eref,
      },
      correlation: { workflow_id: WORKFLOW_ID, parent_jti: ejti, depends_on: [ejti] },
      lineage: { run_ref: RUN_REF, run_manifest_digest: md, sequence_index: 1 },
      summary: {
        covered_record_refs: [eref],
        covered_record_count: 1,
        merkle_commitment: {
          tree_alg: commitment.tree_alg,
          hash_alg: commitment.hash_alg,
          root: commitment.root,
          tree_size: commitment.tree_size,
        },
      },
    });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [eventJws, finalJws],
    });
    expect(r).toEqual(bad('event-descriptor-mismatch'));
  });

  it('wrong event type (invoked where delegation expected) -> event-descriptor-mismatch', async () => {
    // Take the 3-event happy run but expect a manifest whose event 1 is model-call.
    const s = await setup();
    const swapped: AgentRunManifestV1 = {
      ...s.manifest,
      events: s.manifest.events.map((e, i) =>
        i === 1
          ? ({
              event_ref: e.event_ref,
              sequence_index: 1,
              event_kind: 'model-call',
              agent_ref: e.agent_ref,
              action_ref: e.action_ref,
              observed_at: e.observed_at,
              input_digest: e.input_digest,
              output_digest: `sha256:${'2'.repeat(64)}`,
            } as never)
          : e
      ),
    };
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: swapped,
      publicKey: s.publicKey,
      expectedIssuer: ISSUER,
      records: s.records,
    });
    // whole-manifest digest changed -> caught as run-manifest-mismatch (records bind the original manifest)
    expect(r).toEqual(bad('run-manifest-mismatch'));
  });
});

describe('agent-run-lineage-records: finalization classification', () => {
  it('missing finalization -> missing-summary-record', async () => {
    const s = await setup();
    const r = await verifyAgentRunLineageEvidence({ ...s.expected, records: s.run.eventJws });
    expect(r).toEqual(bad('missing-summary-record'));
  });

  it('two distinct finalizations -> multiple-summary-records', async () => {
    const s = await setup();
    const s2 = await issueRun({
      privateKey: s.privateKey,
      publicKey: s.publicKey,
      manifest: s.manifest,
      finalizationObservedAt: '2026-01-15T10:04:00Z',
    });
    const r = await verifyAgentRunLineageEvidence({
      ...s.expected,
      records: [...s.run.eventJws, s.run.finalizationJws, s2.finalizationJws],
    });
    expect(r).toEqual(bad('multiple-summary-records'));
  });

  it('finalization action_ref but NO summary -> missing-summary-record', async () => {
    const s = await setup();
    const m = await materials(s.privateKey, s.publicKey);
    const finalJws = await finalizeWith(s.privateKey, m, { summary: 'omit' });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: m.manifest,
      publicKey: s.publicKey,
      expectedIssuer: ISSUER,
      records: [m.eventJws, finalJws],
    });
    expect(r).toEqual(bad('missing-summary-record'));
  });

  it('finalization with an event-only upstream binding -> unexpected-record-type', async () => {
    const s = await setup();
    const m = await materials(s.privateKey, s.publicKey);
    const finalJws = await finalizeWith(s.privateKey, m, {
      action: {
        ...m.finalAction,
        upstream_artifact_ref: 'urn:example:event:x',
        upstream_artifact_digest: `sha256:${'0'.repeat(64)}`,
      },
    });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: m.manifest,
      publicKey: s.publicKey,
      expectedIssuer: ISSUER,
      records: [m.eventJws, finalJws],
    });
    expect(r).toEqual(bad('unexpected-record-type'));
  });

  it('finalization sequence_index != event_count -> sequence-invalid', async () => {
    const s = await setup();
    const m = await materials(s.privateKey, s.publicKey);
    const finalJws = await finalizeWith(s.privateKey, m, {
      lineage: { ...m.finalLineage, sequence_index: 0 },
    });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: m.manifest,
      publicKey: s.publicKey,
      expectedIssuer: ISSUER,
      records: [m.eventJws, finalJws],
    });
    expect(r).toEqual(bad('sequence-invalid'));
  });

  it('finalization wrong parent_ref -> lineage-link-mismatch', async () => {
    const s = await setup();
    const m = await materials(s.privateKey, s.publicKey);
    const finalJws = await finalizeWith(s.privateKey, m, {
      action: { ...m.finalAction, parent_ref: `sha256:${'9'.repeat(64)}` },
    });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: m.manifest,
      publicKey: s.publicKey,
      expectedIssuer: ISSUER,
      records: [m.eventJws, finalJws],
    });
    expect(r).toEqual(bad('lineage-link-mismatch'));
  });

  it('finalization earlier than the last event -> temporal-order-invalid', async () => {
    const s = await setup();
    const m = await materials(s.privateKey, s.publicKey);
    const finalJws = await finalizeWith(s.privateKey, m, {
      action: { ...m.finalAction, observed_at: '2026-01-15T09:00:00Z' },
    });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: m.manifest,
      publicKey: s.publicKey,
      expectedIssuer: ISSUER,
      records: [m.eventJws, finalJws],
    });
    expect(r).toEqual(bad('temporal-order-invalid'));
  });

  it('root event carrying parent metadata -> lineage-link-mismatch', async () => {
    const s = await setup();
    const m = await materials(s.privateKey, s.publicKey);
    // reissue the single root event WITH parent metadata (invalid for a root)
    const rootWithParent = await issueRawRecord({
      privateKey: s.privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: 'urn:example:action:model-call',
        observed_at: '2026-01-15T10:00:00Z',
        upstream_artifact_ref: 'urn:example:event:001',
        upstream_artifact_digest: m.dd,
        parent_ref: `sha256:${'7'.repeat(64)}`,
      },
      correlation: { workflow_id: WORKFLOW_ID, parent_jti: 'nope' },
      lineage: { run_ref: RUN_REF, run_manifest_digest: m.md, sequence_index: 0 },
    });
    const eref = await refOf(rootWithParent);
    const ejti = await jtiOf(rootWithParent, s.publicKey);
    const commitment = buildReceiptMerkleCommitment([eref] as never);
    const finalJws = await issueRawRecord({
      privateKey: s.privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: FINALIZATION_ACTION_REF,
        observed_at: '2026-01-15T10:03:00Z',
        parent_ref: eref,
      },
      correlation: { workflow_id: WORKFLOW_ID, parent_jti: ejti, depends_on: [ejti] },
      lineage: { run_ref: RUN_REF, run_manifest_digest: m.md, sequence_index: 1 },
      summary: {
        covered_record_refs: [eref],
        covered_record_count: 1,
        merkle_commitment: {
          tree_alg: commitment.tree_alg,
          hash_alg: commitment.hash_alg,
          root: commitment.root,
          tree_size: commitment.tree_size,
        },
      },
    });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: m.manifest,
      publicKey: s.publicKey,
      expectedIssuer: ISSUER,
      records: [rootWithParent, finalJws],
    });
    expect(r).toEqual(bad('lineage-link-mismatch'));
  });
});

describe('agent-run-lineage-records: summary + Merkle', () => {
  async function withSummary(summary: Record<string, unknown>) {
    const { publicKey, privateKey } = await generateKeypair();
    const m = await materials(privateKey, publicKey);
    const finalJws = await finalizeWith(privateKey, m, { summary });
    return verifyAgentRunLineageEvidence({
      expectedManifest: m.manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [m.eventJws, finalJws],
    });
  }
  async function base() {
    const { publicKey, privateKey } = await generateKeypair();
    const m = await materials(privateKey, publicKey);
    return { publicKey, privateKey, m };
  }

  it('exact recomputation succeeds', async () => {
    const { publicKey, privateKey, m } = await base();
    const finalJws = await finalizeWith(privateKey, m);
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: m.manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [m.eventJws, finalJws],
    });
    expect(r.kind).toBe('run-lineage-evidence-consistent');
  });

  it('covered set differs from events (self-inclusion / substitution) -> summary-set-mismatch', async () => {
    const { publicKey, privateKey, m } = await base();
    const wrong = {
      ...m.validSummary,
      covered_record_refs: [`sha256:${'3'.repeat(64)}`],
      merkle_commitment: {
        ...(m.validSummary.merkle_commitment as Record<string, unknown>),
        root: buildReceiptMerkleCommitment([`sha256:${'3'.repeat(64)}`] as never).root,
      },
    };
    const finalJws = await finalizeWith(privateKey, m, { summary: wrong });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: m.manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [m.eventJws, finalJws],
    });
    expect(r).toEqual(bad('summary-set-mismatch'));
  });

  it('covered_record_count != manifest.event_count -> summary-count-mismatch', async () => {
    const s = await setup();
    // 3-event run, but finalization asserts a 2-ref coverage set.
    const lastJti = await jtiOf(s.run.eventJws[2], s.publicKey);
    const two = [s.run.eventRefs[0], s.run.eventRefs[1]].sort();
    const commitment = buildReceiptMerkleCommitment(two as never);
    const finalJws = await issueRawRecord({
      privateKey: s.privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: FINALIZATION_ACTION_REF,
        observed_at: '2026-01-15T10:03:00Z',
        parent_ref: s.run.eventRefs[2],
      },
      correlation: { workflow_id: WORKFLOW_ID, parent_jti: lastJti, depends_on: [lastJti] },
      lineage: { run_ref: RUN_REF, run_manifest_digest: s.run.manifestDigest, sequence_index: 3 },
      summary: {
        covered_record_refs: two,
        covered_record_count: 2,
        merkle_commitment: {
          tree_alg: commitment.tree_alg,
          hash_alg: commitment.hash_alg,
          root: commitment.root,
          tree_size: commitment.tree_size,
        },
      },
    });
    const r = await verifyAgentRunLineageEvidence({
      ...s.expected,
      records: [...s.run.eventJws, finalJws],
    });
    expect(r).toEqual(bad('summary-count-mismatch'));
  });

  it('structural summary defects -> record-invalid', async () => {
    const { m: base0 } = await base();
    const ref = (base0.validSummary.covered_record_refs as string[])[0];
    const comm = base0.validSummary.merkle_commitment as Record<string, unknown>;
    const defects: Record<string, unknown>[] = [
      { covered_record_refs: [ref, ref], covered_record_count: 2, merkle_commitment: comm }, // duplicate
      { covered_record_refs: [ref], covered_record_count: 5, merkle_commitment: comm }, // count != length
      {
        covered_record_refs: [ref],
        covered_record_count: 1,
        merkle_commitment: { ...comm, root: 'not-a-hash' },
      }, // malformed root
      {
        covered_record_refs: [ref],
        covered_record_count: 1,
        merkle_commitment: { ...comm, tree_size: 5 },
      }, // tree_size != count
      {
        covered_record_refs: [ref],
        covered_record_count: 1,
        merkle_commitment: { ...comm, tree_alg: 'other' },
      }, // wrong alg
      {
        covered_record_refs: [ref],
        covered_record_count: 1,
        merkle_commitment: { ...comm, hash_alg: 'sha512' },
      }, // wrong hash
      {
        covered_record_refs: [ref],
        covered_record_count: 1,
        merkle_commitment: { ...comm, extra: 1 },
      }, // unknown commitment key
    ];
    for (const summary of defects) {
      expect(await withSummary(summary)).toEqual(bad('record-invalid'));
    }
  });

  it('unsorted covered refs -> record-invalid', async () => {
    const s = await setup();
    const unsorted = [...s.run.coveredRecordRefs].reverse();
    if (unsorted[0] === s.run.coveredRecordRefs[0]) return; // already sorted edge (n small); skip only if identical
    const lastJti = await jtiOf(s.run.eventJws[2], s.publicKey);
    const commitment = buildReceiptMerkleCommitment(s.run.coveredRecordRefs as never);
    const finalJws = await issueRawRecord({
      privateKey: s.privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: FINALIZATION_ACTION_REF,
        observed_at: '2026-01-15T10:03:00Z',
        parent_ref: s.run.eventRefs[2],
      },
      correlation: { workflow_id: WORKFLOW_ID, parent_jti: lastJti, depends_on: [lastJti] },
      lineage: { run_ref: RUN_REF, run_manifest_digest: s.run.manifestDigest, sequence_index: 3 },
      summary: {
        covered_record_refs: unsorted,
        covered_record_count: unsorted.length,
        merkle_commitment: {
          tree_alg: commitment.tree_alg,
          hash_alg: commitment.hash_alg,
          root: commitment.root,
          tree_size: commitment.tree_size,
        },
      },
    });
    const r = await verifyAgentRunLineageEvidence({
      ...s.expected,
      records: [...s.run.eventJws, finalJws],
    });
    expect(r).toEqual(bad('record-invalid'));
  });

  it('well-formed but wrong Merkle root -> merkle-commitment-mismatch', async () => {
    const { publicKey, privateKey, m } = await base();
    const comm = m.validSummary.merkle_commitment as Record<string, unknown>;
    const wrong = {
      ...m.validSummary,
      merkle_commitment: { ...comm, root: `sha256:${'e'.repeat(64)}` },
    };
    const finalJws = await finalizeWith(privateKey, m, { summary: wrong });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: m.manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [m.eventJws, finalJws],
    });
    expect(r).toEqual(bad('merkle-commitment-mismatch'));
  });
});

describe('agent-run-lineage-records: fork evidence', () => {
  async function forkScenario(
    mutate: (base: {
      forkPointRef: string;
      forkPointJws: string;
      parentSummaryRef: string;
      parentSummaryJws: string;
      changedEventRef: string;
      changedInputDigest: string;
    }) => {
      fork?: Record<string, unknown>;
      parentEvidence?: { summaryRecord: string; forkPointRecord: string };
    } = () => ({})
  ) {
    const { publicKey, privateKey } = await generateKeypair();
    const parentManifest = await buildAgentRunManifest();
    const parent = await issueRun({ privateKey, publicKey, manifest: parentManifest });
    const forked = await buildForkManifest(1);
    const forkPointRef = parent.eventRefs[1];
    const forkPointJws = parent.eventJws[1];
    const m = mutate({
      forkPointRef,
      forkPointJws,
      parentSummaryRef: parent.finalizationRef,
      parentSummaryJws: parent.finalizationJws,
      changedEventRef: forked.changedEventRef,
      changedInputDigest: forked.changedInputDigest,
    });
    const forkRun = await issueRun({
      privateKey,
      publicKey,
      manifest: forked.manifest,
      fork: (m.fork as never) ?? {
        parent_run_summary_ref: parent.finalizationRef,
        fork_point_record_ref: forkPointRef,
        changed_event_ref: forked.changedEventRef,
        changed_input_digest: forked.changedInputDigest,
        diff_artifact_digest: `sha256:${'4'.repeat(64)}`,
      },
    });
    return verifyAgentRunLineageEvidence({
      expectedManifest: forked.manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [...forkRun.eventJws, forkRun.finalizationJws],
      parentEvidence: m.parentEvidence ?? {
        summaryRecord: parent.finalizationJws,
        forkPointRecord: forkPointJws,
      },
    });
  }

  it('valid real fork -> run-lineage-evidence-consistent with changedEventRef link', async () => {
    const r = await forkScenario();
    expect(r.kind).toBe('run-lineage-evidence-consistent');
    if (r.kind === 'run-lineage-evidence-consistent') {
      expect(r.forkLink?.changedEventRef).toBe('urn:example:event:f02');
    }
  });

  it('fork extension without parentEvidence -> fork-link-mismatch', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const parent = await issueRun({
      privateKey,
      publicKey,
      manifest: await buildAgentRunManifest(),
    });
    const forked = await buildForkManifest(1);
    const forkRun = await issueRun({
      privateKey,
      publicKey,
      manifest: forked.manifest,
      fork: {
        parent_run_summary_ref: parent.finalizationRef,
        fork_point_record_ref: parent.eventRefs[1],
        changed_event_ref: forked.changedEventRef,
        changed_input_digest: forked.changedInputDigest,
        diff_artifact_digest: `sha256:${'4'.repeat(64)}`,
      },
    });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: forked.manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [...forkRun.eventJws, forkRun.finalizationJws],
    });
    expect(r).toEqual(bad('fork-link-mismatch'));
  });

  it('parentEvidence without fork extension -> fork-link-mismatch', async () => {
    const s = await setup();
    const r = await verifyAgentRunLineageEvidence({
      ...s.expected,
      records: s.records,
      parentEvidence: { summaryRecord: s.run.finalizationJws, forkPointRecord: s.run.eventJws[0] },
    });
    expect(r).toEqual(bad('fork-link-mismatch'));
  });

  it('changed_event_ref absent from the forked manifest -> fork-link-mismatch', async () => {
    const r = await forkScenario((b) => ({
      fork: {
        parent_run_summary_ref: b.parentSummaryRef,
        fork_point_record_ref: b.forkPointRef,
        changed_event_ref: 'urn:example:event:absent',
        changed_input_digest: b.changedInputDigest,
        diff_artifact_digest: `sha256:${'4'.repeat(64)}`,
      },
    }));
    expect(r).toEqual(bad('fork-link-mismatch'));
  });

  it('changed_input_digest not equal to the changed descriptor input_digest -> fork-link-mismatch', async () => {
    const r = await forkScenario((b) => ({
      fork: {
        parent_run_summary_ref: b.parentSummaryRef,
        fork_point_record_ref: b.forkPointRef,
        changed_event_ref: b.changedEventRef,
        changed_input_digest: `sha256:${'a'.repeat(64)}`,
        diff_artifact_digest: `sha256:${'4'.repeat(64)}`,
      },
    }));
    expect(r).toEqual(bad('fork-link-mismatch'));
  });

  it('parent fork-point not in the parent coverage set -> fork-link-mismatch', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const parent = await issueRun({
      privateKey,
      publicKey,
      manifest: await buildAgentRunManifest(),
    });
    const forked = await buildForkManifest(1);
    const forkRun = await issueRun({
      privateKey,
      publicKey,
      manifest: forked.manifest,
      fork: {
        parent_run_summary_ref: parent.finalizationRef,
        fork_point_record_ref: parent.finalizationRef,
        changed_event_ref: forked.changedEventRef,
        changed_input_digest: forked.changedInputDigest,
        diff_artifact_digest: `sha256:${'4'.repeat(64)}`,
      },
    });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: forked.manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [...forkRun.eventJws, forkRun.finalizationJws],
      parentEvidence: {
        summaryRecord: parent.finalizationJws,
        forkPointRecord: parent.finalizationJws,
      },
    });
    expect(r).toEqual(bad('fork-link-mismatch'));
  });

  it('parent summary is not a finalization action -> fork-link-mismatch', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const parent = await issueRun({
      privateKey,
      publicKey,
      manifest: await buildAgentRunManifest(),
    });
    const forked = await buildForkManifest(1);
    const forkRun = await issueRun({
      privateKey,
      publicKey,
      manifest: forked.manifest,
      fork: {
        parent_run_summary_ref: await refOf(parent.eventJws[0]),
        fork_point_record_ref: parent.eventRefs[1],
        changed_event_ref: forked.changedEventRef,
        changed_input_digest: forked.changedInputDigest,
        diff_artifact_digest: `sha256:${'4'.repeat(64)}`,
      },
    });
    // point "parent summary" at a plain event record (not a finalization)
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: forked.manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [...forkRun.eventJws, forkRun.finalizationJws],
      parentEvidence: { summaryRecord: parent.eventJws[0], forkPointRecord: parent.eventJws[1] },
    });
    expect(r).toEqual(bad('fork-link-mismatch'));
  });

  it('parentEvidence record exceeding the byte limit -> input-limit-exceeded (bounded before crypto)', async () => {
    // A JWS longer than maxJwsBytes is rejected by the raw-limit guard.
    const { publicKey, privateKey } = await generateKeypair();
    const parent = await issueRun({
      privateKey,
      publicKey,
      manifest: await buildAgentRunManifest(),
    });
    const forked = await buildForkManifest(1);
    const forkRun = await issueRun({
      privateKey,
      publicKey,
      manifest: forked.manifest,
      fork: {
        parent_run_summary_ref: parent.finalizationRef,
        fork_point_record_ref: parent.eventRefs[1],
        changed_event_ref: forked.changedEventRef,
        changed_input_digest: forked.changedInputDigest,
        diff_artifact_digest: `sha256:${'4'.repeat(64)}`,
      },
    });
    const oversized = 'A'.repeat(AGENT_RUN_LINEAGE_LIMITS.maxJwsBytes + 1);
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: forked.manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [...forkRun.eventJws, forkRun.finalizationJws],
      parentEvidence: { summaryRecord: oversized, forkPointRecord: parent.eventJws[1] },
    });
    expect(r).toEqual(bad('input-limit-exceeded'));
  });

  it('structurally malformed fork extension (missing changed_event_ref) -> record-invalid', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const parent = await issueRun({
      privateKey,
      publicKey,
      manifest: await buildAgentRunManifest(),
    });
    const forked = await buildForkManifest(1);
    const forkRun = await issueRun({ privateKey, publicKey, manifest: forked.manifest });
    // Re-issue a finalization whose fork extension omits changed_event_ref.
    const eventRefs = forkRun.eventRefs;
    const lastJti = await jtiOf(forkRun.eventJws[2], publicKey);
    const md = forkRun.manifestDigest;
    const covered = [...forkRun.coveredRecordRefs];
    const commitment = buildReceiptMerkleCommitment(covered as never);
    const finalJws = await issueRawRecord({
      privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: FINALIZATION_ACTION_REF,
        observed_at: '2026-01-15T10:03:00Z',
        parent_ref: eventRefs[2],
      },
      correlation: { workflow_id: WORKFLOW_ID, parent_jti: lastJti, depends_on: [lastJti] },
      lineage: { run_ref: forked.manifest.run_ref, run_manifest_digest: md, sequence_index: 3 },
      summary: {
        covered_record_refs: covered,
        covered_record_count: covered.length,
        merkle_commitment: {
          tree_alg: commitment.tree_alg,
          hash_alg: commitment.hash_alg,
          root: commitment.root,
          tree_size: commitment.tree_size,
        },
      },
      fork: {
        parent_run_summary_ref: parent.finalizationRef,
        fork_point_record_ref: parent.eventRefs[1],
        changed_input_digest: forked.changedInputDigest,
        diff_artifact_digest: `sha256:${'4'.repeat(64)}`,
      },
    });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: forked.manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [...forkRun.eventJws, finalJws],
      parentEvidence: {
        summaryRecord: parent.finalizationJws,
        forkPointRecord: parent.eventJws[1],
      },
    });
    expect(r).toEqual(bad('record-invalid'));
  });

  it('fork-point record from a different run -> fork-link-mismatch', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const parent = await issueRun({
      privateKey,
      publicKey,
      manifest: await buildAgentRunManifest(),
    });
    // an entirely separate run whose records share no identity with `parent`
    const foreign = await issueRun({
      privateKey,
      publicKey,
      manifest: await buildAgentRunManifest({ runRef: 'urn:example:agent-run:foreign' }),
    });
    const forked = await buildForkManifest(1);
    const forkRun = await issueRun({
      privateKey,
      publicKey,
      manifest: forked.manifest,
      fork: {
        parent_run_summary_ref: parent.finalizationRef,
        fork_point_record_ref: foreign.eventRefs[1], // foreign record, not in parent's coverage set
        changed_event_ref: forked.changedEventRef,
        changed_input_digest: forked.changedInputDigest,
        diff_artifact_digest: `sha256:${'4'.repeat(64)}`,
      },
    });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: forked.manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [...forkRun.eventJws, forkRun.finalizationJws],
      parentEvidence: {
        summaryRecord: parent.finalizationJws,
        forkPointRecord: foreign.eventJws[1],
      },
    });
    expect(r).toEqual(bad('fork-link-mismatch'));
  });
});

describe('agent-run-lineage-records: delegation shape + privacy + limits', () => {
  it('delegation record actually carries the delegated type + delegated_to_ref + chain fields', async () => {
    const s = await setup();
    const claims = decodeClaims(s.run.eventJws[1]);
    expect(claims.type).toBe(DELEGATED_TYPE);
    const ext = claims.extensions as Record<string, Record<string, unknown>>;
    const action = ext[AGENT_ACTION_EXTENSION_KEY];
    expect(action.event_kind).toBe('agent-action-delegated-observed');
    expect(action.delegated_to_ref).toBe('urn:agent:summarizer-bot');
    expect(typeof action.parent_ref).toBe('string');
    const corr = ext[CORRELATION_EXTENSION_KEY];
    expect(corr.workflow_id).toBe(WORKFLOW_ID);
    expect(Array.isArray(corr.depends_on)).toBe(true);
  });

  it('sentinel prompt/output/tool/credential/header strings never leak into any surface', async () => {
    const sentinels = [
      'PROMPT_SENTINEL_ZZ',
      'OUTPUT_SENTINEL_ZZ',
      'TOOL_SENTINEL_ZZ',
      'CRED_SENTINEL_ZZ',
      'HEADER_SENTINEL_ZZ',
    ];
    const inputDigest = await jcs({ prompt: sentinels[0], tool_input: sentinels[2] });
    const outputDigest = await jcs({
      output: sentinels[1],
      credential: sentinels[3],
      header: sentinels[4],
    });
    const { publicKey, privateKey } = await generateKeypair();
    const manifest = await oneEventManifest({
      input_digest: inputDigest,
      output_digest: outputDigest,
    });
    const m = await materials(privateKey, publicKey, {
      input_digest: inputDigest,
      output_digest: outputDigest,
    });
    const finalJws = await finalizeWith(privateKey, m);
    const records = [m.eventJws, finalJws];
    const result = await verifyAgentRunLineageEvidence({
      expectedManifest: manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records,
    });

    const surfaces: string[] = [JSON.stringify(manifest), JSON.stringify(result)];
    for (const jws of records) {
      surfaces.push(jws, JSON.stringify(decodeClaims(jws)));
    }
    // capture demo console output too
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      await runAgentRunLineageDemo({ publicKey, privateKey });
    } finally {
      console.log = orig;
    }
    surfaces.push(logs.join('\n'));

    for (const sentinel of sentinels) {
      for (const surface of surfaces) {
        expect(surface.includes(sentinel)).toBe(false);
      }
    }
    expect(result.kind).toBe('run-lineage-evidence-consistent');
  });

  it('record-count limit -> input-limit-exceeded', async () => {
    const s = await setup();
    const many = Array.from(
      { length: AGENT_RUN_LINEAGE_LIMITS.maxRecords + 1 },
      () => s.records[0]
    );
    const r = await verifyAgentRunLineageEvidence({ ...s.expected, records: many });
    expect(r).toEqual(bad('input-limit-exceeded'));
  });

  it('constants are the canonical audit values, not local redeclarations', () => {
    expect(MERKLE_TREE_ALG).toBe('peac.merkle.ct-sorted-set-sha256-v1');
    expect(RUN_LINEAGE_EXTENSION_KEY).toBe('com.example/agent-run-lineage');
    expect(RUN_SUMMARY_EXTENSION_KEY).toBe('com.example/agent-run-summary');
    expect(RUN_FORK_EXTENSION_KEY).toBe('com.example/agent-run-fork');
    expect(AGENT_RUN_LINEAGE_LIMITS.maxEvents).toBe(MANIFEST_LIMITS.maxEvents);
    expect(AGENT_RUN_LINEAGE_LIMITS.maxManifestBytes).toBe(MANIFEST_LIMITS.maxManifestBytes);
  });
});

describe('agent-run-lineage-records: introspection totality and fork correspondence', () => {
  it('hostile covered_record_refs array -> isValidSummaryExtension false without throwing', () => {
    const ref = `sha256:${'0'.repeat(64)}`;
    const commitment = buildReceiptMerkleCommitment([ref]);
    const hostile = new Proxy([ref], {
      get(t, p, r) {
        if (p === 'length') throw new Error('boom');
        return Reflect.get(t, p, r);
      },
    });
    const summary = {
      covered_record_refs: hostile,
      covered_record_count: 1,
      merkle_commitment: {
        tree_alg: commitment.tree_alg,
        hash_alg: commitment.hash_alg,
        root: commitment.root,
        tree_size: commitment.tree_size,
      },
    };
    expect(() => isValidSummaryExtension(summary)).not.toThrow();
    expect(isValidSummaryExtension(summary)).toBe(false);
  });

  it('buildForkManifest rejects an out-of-range / negative / non-integer index', async () => {
    await expect(buildForkManifest(9)).rejects.toThrow();
    await expect(buildForkManifest(-1)).rejects.toThrow();
    await expect(buildForkManifest(1.5)).rejects.toThrow();
  });

  it('issued run arrays are frozen', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const run = await issueRun({ privateKey, publicKey, manifest: await buildAgentRunManifest() });
    expect(Object.isFrozen(run.eventJws)).toBe(true);
    expect(Object.isFrozen(run.eventRefs)).toBe(true);
    expect(Object.isFrozen(run.coveredRecordRefs)).toBe(true);
  });

  it('finalization uses the manifest root agent, not a hardcoded constant', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const base = await buildAgentRunManifest();
    const rootAgent = 'urn:agent:custom-root-agent';
    const manifest = {
      ...base,
      events: base.events.map((e, i) => (i === 0 ? { ...e, agent_ref: rootAgent } : e)),
    };
    const run = await issueRun({ privateKey, publicKey, manifest });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [...run.eventJws, run.finalizationJws],
    });
    expect(r.kind).toBe('run-lineage-evidence-consistent');
    const claims = decodeClaims(run.finalizationJws);
    const action = (claims.extensions as Record<string, Record<string, unknown>>)[
      AGENT_ACTION_EXTENSION_KEY
    ];
    expect(action.agent_ref).toBe(rootAgent);
  });

  // ---- fork correspondence + parent invariants ----
  async function mkChildFork(over: { runRef?: string; workflowId?: string } = {}) {
    const base = await buildAgentRunManifest({
      runRef: over.runRef ?? 'urn:example:agent-run:zed',
    });
    const changedEventRef = 'urn:example:event:f02';
    const changedInputDigest = await jcs({ forked: true, seed: 11 });
    const events = base.events.map((e, i) =>
      i === 1 ? { ...e, event_ref: changedEventRef, input_digest: changedInputDigest } : e
    );
    const manifest = {
      ...base,
      ...(over.workflowId ? { workflow_id: over.workflowId } : {}),
      events,
    };
    return { manifest, changedEventRef, changedInputDigest };
  }

  it('child changed-event sequence != parent fork-point sequence -> fork-link-mismatch', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const parent = await issueRun({
      privateKey,
      publicKey,
      manifest: await buildAgentRunManifest(),
    });
    const child = await mkChildFork(); // changed at child sequence 1
    const forkRun = await issueRun({
      privateKey,
      publicKey,
      manifest: child.manifest,
      fork: {
        parent_run_summary_ref: parent.finalizationRef,
        fork_point_record_ref: parent.eventRefs[0], // parent SEQUENCE 0, not 1
        changed_event_ref: child.changedEventRef,
        changed_input_digest: child.changedInputDigest,
        diff_artifact_digest: `sha256:${'4'.repeat(64)}`,
      },
    });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: child.manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [...forkRun.eventJws, forkRun.finalizationJws],
      parentEvidence: {
        summaryRecord: parent.finalizationJws,
        forkPointRecord: parent.eventJws[0],
      },
    });
    expect(r).toEqual(bad('fork-link-mismatch'));
  });

  it('parent run_ref equals child run_ref -> fork-link-mismatch', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const parent = await issueRun({
      privateKey,
      publicKey,
      manifest: await buildAgentRunManifest(),
    });
    const child = await mkChildFork({ runRef: RUN_REF }); // same run_ref as parent
    const forkRun = await issueRun({
      privateKey,
      publicKey,
      manifest: child.manifest,
      fork: {
        parent_run_summary_ref: parent.finalizationRef,
        fork_point_record_ref: parent.eventRefs[1],
        changed_event_ref: child.changedEventRef,
        changed_input_digest: child.changedInputDigest,
        diff_artifact_digest: `sha256:${'4'.repeat(64)}`,
      },
    });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: child.manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [...forkRun.eventJws, forkRun.finalizationJws],
      parentEvidence: {
        summaryRecord: parent.finalizationJws,
        forkPointRecord: parent.eventJws[1],
      },
    });
    expect(r).toEqual(bad('fork-link-mismatch'));
  });

  it('parent workflow_id differs from child workflow_id -> fork-link-mismatch', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const parent = await issueRun({
      privateKey,
      publicKey,
      manifest: await buildAgentRunManifest(),
    });
    const child = await mkChildFork({ workflowId: 'child-workflow-distinct' });
    const forkRun = await issueRun({
      privateKey,
      publicKey,
      manifest: child.manifest,
      fork: {
        parent_run_summary_ref: parent.finalizationRef,
        fork_point_record_ref: parent.eventRefs[1],
        changed_event_ref: child.changedEventRef,
        changed_input_digest: child.changedInputDigest,
        diff_artifact_digest: `sha256:${'4'.repeat(64)}`,
      },
    });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: child.manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [...forkRun.eventJws, forkRun.finalizationJws],
      parentEvidence: {
        summaryRecord: parent.finalizationJws,
        forkPointRecord: parent.eventJws[1],
      },
    });
    expect(r).toEqual(bad('fork-link-mismatch'));
  });
  // ---- top-level input totality + finalization agent ----
  it('records-array length getter throws -> record-invalid without throwing', async () => {
    const { publicKey } = await generateKeypair();
    const manifest = await buildAgentRunManifest();
    const records = new Proxy([] as string[], {
      get(t, prop, r) {
        if (prop === 'length') throw new Error('boom');
        return Reflect.get(t, prop, r);
      },
    });
    const input = {
      expectedManifest: manifest,
      records,
      publicKey,
      expectedIssuer: ISSUER,
    } as never;
    let result: unknown;
    await expect(
      (async () => {
        result = await verifyAgentRunLineageEvidence(input);
      })()
    ).resolves.toBeUndefined();
    expect(result).toEqual(bad('record-invalid'));
  });

  it('records-array indexed getter throws -> record-invalid without throwing', async () => {
    const { publicKey } = await generateKeypair();
    const manifest = await buildAgentRunManifest();
    const records = new Proxy(['x'] as string[], {
      get(t, prop, r) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) throw new Error('boom');
        return Reflect.get(t, prop, r);
      },
    });
    const input = {
      expectedManifest: manifest,
      records,
      publicKey,
      expectedIssuer: ISSUER,
    } as never;
    const r = await verifyAgentRunLineageEvidence(input);
    expect(r).toEqual(bad('record-invalid'));
  });

  it('top-level input property getter throws -> record-invalid without throwing', async () => {
    const { publicKey } = await generateKeypair();
    const manifest = await buildAgentRunManifest();
    const input: Record<string, unknown> = {
      expectedManifest: manifest,
      publicKey,
      expectedIssuer: ISSUER,
    };
    Object.defineProperty(input, 'records', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    const r = await verifyAgentRunLineageEvidence(input as never);
    expect(r).toEqual(bad('record-invalid'));
  });

  it('parentEvidence property getter throws -> record-invalid without throwing', async () => {
    const { publicKey } = await generateKeypair();
    const manifest = await buildAgentRunManifest();
    const parentEvidence: Record<string, unknown> = {};
    Object.defineProperty(parentEvidence, 'summaryRecord', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    const input = {
      expectedManifest: manifest,
      records: [],
      publicKey,
      expectedIssuer: ISSUER,
      parentEvidence,
    } as never;
    const r = await verifyAgentRunLineageEvidence(input);
    expect(r).toEqual(bad('record-invalid'));
  });

  it('finalization naming an agent other than the manifest root -> event-descriptor-mismatch', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const m = await materials(privateKey, publicKey);
    const finalJws = await finalizeWith(privateKey, m, {
      action: { ...m.finalAction, agent_ref: 'urn:agent:not-the-root' },
    });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: m.manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [m.eventJws, finalJws],
    });
    expect(r).toEqual(bad('event-descriptor-mismatch'));
  });
  // ---- crypto input snapshot (public key + issuer) ----
  it('non-Uint8Array public key -> record-invalid', async () => {
    const manifest = await buildAgentRunManifest();
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: manifest,
      records: [],
      publicKey: 'not-a-key' as never,
      expectedIssuer: ISSUER,
    });
    expect(r).toEqual(bad('record-invalid'));
  });

  it('empty or non-string issuer -> record-invalid', async () => {
    const { publicKey } = await generateKeypair();
    const manifest = await buildAgentRunManifest();
    for (const issuer of ['', 42 as unknown as string]) {
      const r = await verifyAgentRunLineageEvidence({
        expectedManifest: manifest,
        records: [],
        publicKey,
        expectedIssuer: issuer,
      });
      expect(r).toEqual(bad('record-invalid'));
    }
  });

  it('public key is copied: mutating the caller buffer after the call does not affect verification', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const manifest = await buildAgentRunManifest();
    const run = await issueRun({ privateKey, publicKey, manifest });
    const records = [...run.eventJws, run.finalizationJws];
    const mutableKey = new Uint8Array(publicKey);
    const promise = verifyAgentRunLineageEvidence({
      expectedManifest: manifest,
      records,
      publicKey: mutableKey,
      expectedIssuer: ISSUER,
    });
    mutableKey.fill(0);
    const r = await promise;
    expect(r.kind).toBe('run-lineage-evidence-consistent');
    expect(mutableKey.every((b) => b === 0)).toBe(true);
  });

  it('verification does not modify the caller public key', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const manifest = await buildAgentRunManifest();
    const run = await issueRun({ privateKey, publicKey, manifest });
    const before = Uint8Array.from(publicKey);
    await verifyAgentRunLineageEvidence({
      expectedManifest: manifest,
      records: [...run.eventJws, run.finalizationJws],
      publicKey,
      expectedIssuer: ISSUER,
    });
    expect(Uint8Array.from(publicKey)).toEqual(before);
  });

  // ---- RFC 3339 exact temporal ordering ----
  async function runWithTimes(eventObservedAt: string, finalizationObservedAt: string) {
    const { publicKey, privateKey } = await generateKeypair();
    const m = await materials(privateKey, publicKey, { observed_at: eventObservedAt });
    const finalJws = await finalizeWith(privateKey, m, {
      action: { ...m.finalAction, observed_at: finalizationObservedAt },
    });
    return verifyAgentRunLineageEvidence({
      expectedManifest: m.manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [m.eventJws, finalJws],
    });
  }

  it('sub-millisecond ordering: finalization fraction earlier than the last event -> temporal-order-invalid', async () => {
    expect(await runWithTimes('2026-01-15T10:00:00.0009Z', '2026-01-15T10:00:00.0001Z')).toEqual(
      bad('temporal-order-invalid')
    );
  });

  it('sub-millisecond ordering: finalization fraction later than the last event -> consistent', async () => {
    const r = await runWithTimes('2026-01-15T10:00:00.0001Z', '2026-01-15T10:00:00.0009Z');
    expect(r.kind).toBe('run-lineage-evidence-consistent');
  });

  it('long fractional precision compares exactly', async () => {
    expect(
      await runWithTimes('2026-01-15T10:00:00.000000002Z', '2026-01-15T10:00:00.000000001Z')
    ).toEqual(bad('temporal-order-invalid'));
    const ok = await runWithTimes(
      '2026-01-15T10:00:00.000000001Z',
      '2026-01-15T10:00:00.000000002Z'
    );
    expect(ok.kind).toBe('run-lineage-evidence-consistent');
  });

  it('equivalent instants in different offsets are not treated as out of order', async () => {
    const r = await runWithTimes('2026-01-15T10:00:00Z', '2026-01-15T15:30:00+05:30');
    expect(r.kind).toBe('run-lineage-evidence-consistent');
  });

  it('a -00:00 offset is treated as UTC for ordering', async () => {
    const r = await runWithTimes('2026-01-15T10:00:00Z', '2026-01-15T10:00:00-00:00');
    expect(r.kind).toBe('run-lineage-evidence-consistent');
  });

  // ---- remaining result reasons + main-list resource limits ----
  it('non-root event missing parent_ref -> dangling-reference', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const inA = await jcs({ k: 'in-a' });
    const outA = await jcs({ k: 'out-a' });
    const inB = await jcs({ k: 'in-b' });
    const outB = await jcs({ k: 'out-b' });
    const events = [
      {
        event_ref: 'urn:example:event:001',
        sequence_index: 0,
        event_kind: 'model-call',
        agent_ref: AGENT_REF,
        action_ref: 'urn:example:action:model-call',
        observed_at: '2026-01-15T10:00:00Z',
        input_digest: inA,
        output_digest: outA,
      },
      {
        event_ref: 'urn:example:event:002',
        sequence_index: 1,
        event_kind: 'tool-call',
        agent_ref: AGENT_REF,
        action_ref: 'urn:example:action:tool-call',
        observed_at: '2026-01-15T10:01:00Z',
        input_digest: inB,
        output_digest: outB,
      },
    ];
    const manifest = {
      artifact_type: AGENT_RUN_MANIFEST_ARTIFACT_TYPE,
      run_ref: RUN_REF,
      workflow_id: WORKFLOW_ID,
      event_count: 2,
      events,
    } as AgentRunManifestV1;
    const md = await computeManifestDigest(manifest);
    const dd0 = await computeEventDescriptorDigest(events[0] as never);
    const dd1 = await computeEventDescriptorDigest(events[1] as never);
    const e0 = await issueRawRecord({
      privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: 'urn:example:action:model-call',
        observed_at: '2026-01-15T10:00:00Z',
        upstream_artifact_ref: 'urn:example:event:001',
        upstream_artifact_digest: dd0,
      },
      correlation: { workflow_id: WORKFLOW_ID },
      lineage: { run_ref: RUN_REF, run_manifest_digest: md, sequence_index: 0 },
    });
    const e0ref = await refOf(e0);
    const e0jti = await jtiOf(e0, publicKey);
    // Non-root event with the correct correlation link but no parent_ref.
    const e1 = await issueRawRecord({
      privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: 'urn:example:action:tool-call',
        observed_at: '2026-01-15T10:01:00Z',
        upstream_artifact_ref: 'urn:example:event:002',
        upstream_artifact_digest: dd1,
      },
      correlation: { workflow_id: WORKFLOW_ID, parent_jti: e0jti, depends_on: [e0jti] },
      lineage: { run_ref: RUN_REF, run_manifest_digest: md, sequence_index: 1 },
    });
    const e1ref = await refOf(e1);
    const e1jti = await jtiOf(e1, publicKey);
    const covered = [e0ref, e1ref].sort();
    const commitment = buildReceiptMerkleCommitment(covered);
    const fin = await issueRawRecord({
      privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: FINALIZATION_ACTION_REF,
        observed_at: '2026-01-15T10:03:00Z',
        parent_ref: e1ref,
      },
      correlation: { workflow_id: WORKFLOW_ID, parent_jti: e1jti, depends_on: [e1jti] },
      lineage: { run_ref: RUN_REF, run_manifest_digest: md, sequence_index: 2 },
      summary: {
        covered_record_refs: covered,
        covered_record_count: 2,
        merkle_commitment: {
          tree_alg: commitment.tree_alg,
          hash_alg: commitment.hash_alg,
          root: commitment.root,
          tree_size: commitment.tree_size,
        },
      },
    });
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [e0, e1, fin],
    });
    expect(r).toEqual(bad('dangling-reference'));
  });

  it('two byte-distinct records sharing (iss, jti) -> ambiguous-reference', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const manifest = await buildAgentRunManifest();
    const md = await computeManifestDigest(manifest);
    const shared = '0192f1e0-1234-7abc-8def-000000000001';
    const mk = (observedAt: string) =>
      issueRawRecord({
        privateKey,
        jti: shared,
        type: INVOKED_TYPE,
        action: {
          event_kind: 'agent-action-invoked-observed',
          agent_ref: AGENT_REF,
          action_ref: 'urn:example:action:model-call',
          observed_at: observedAt,
          upstream_artifact_ref: 'urn:example:event:001',
          upstream_artifact_digest: `sha256:${'0'.repeat(64)}`,
        },
        correlation: { workflow_id: WORKFLOW_ID },
        lineage: { run_ref: RUN_REF, run_manifest_digest: md, sequence_index: 0 },
      });
    const a1 = await mk('2026-01-15T10:00:00Z');
    const a2 = await mk('2026-01-15T10:00:01Z');
    expect(a1).not.toBe(a2);
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: manifest,
      publicKey,
      expectedIssuer: ISSUER,
      records: [a1, a2],
    });
    expect(r).toEqual(bad('ambiguous-reference'));
  });

  it('a main record exceeding maxJwsBytes -> input-limit-exceeded', async () => {
    const { publicKey } = await generateKeypair();
    const manifest = await buildAgentRunManifest();
    const oversized = 'A'.repeat(AGENT_RUN_LINEAGE_LIMITS.maxJwsBytes + 1);
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: manifest,
      records: [oversized],
      publicKey,
      expectedIssuer: ISSUER,
    });
    expect(r).toEqual(bad('input-limit-exceeded'));
  });

  it('main records whose aggregate exceeds maxTotalJwsBytes -> input-limit-exceeded', async () => {
    const { publicKey } = await generateKeypair();
    const manifest = await buildAgentRunManifest();
    const per = 'A'.repeat(60 * 1024); // under maxJwsBytes (64 KiB)
    const count = Math.ceil(AGENT_RUN_LINEAGE_LIMITS.maxTotalJwsBytes / per.length) + 1;
    expect(count).toBeLessThanOrEqual(AGENT_RUN_LINEAGE_LIMITS.maxRecords);
    const records = Array.from({ length: count }, (_, i) => per + String(i));
    const r = await verifyAgentRunLineageEvidence({
      expectedManifest: manifest,
      records,
      publicKey,
      expectedIssuer: ISSUER,
    });
    expect(r).toEqual(bad('input-limit-exceeded'));
  });
});
