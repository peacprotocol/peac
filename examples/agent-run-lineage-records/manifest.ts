/**
 * Agent run manifest for the agent-run-lineage-records example.
 *
 * The run manifest is an application-level, example-local artifact (not a PEAC
 * record). Each event record binds the JCS + SHA-256 digest of its matching
 * event descriptor through `upstream_artifact_digest`, and every record binds
 * the whole-manifest digest through the `com.example/agent-run-lineage`
 * extension. Raw prompts, outputs, tool inputs/outputs, headers, and
 * credentials never appear in the manifest, the records, or the logs.
 *
 * A digest is a binding and correlation mechanism, not a confidentiality
 * mechanism. Digests of low-entropy or guessable values may be dictionary
 * tested; production integrations should not hash secrets or low-entropy
 * personal data directly.
 *
 * Validation is fail-closed and total: the untrusted top-level object and every
 * nested event descriptor are read behind a guarded introspection boundary, so
 * a throwing getter or a hostile Proxy trap returns a structured result rather
 * than escaping. Field grammars use the canonical `@peac/schema` validators
 * (`OpaqueRefSchema`, `Sha256DigestSchema`, `Rfc3339DateTimeSchema`), not local
 * regexes. On success the validator returns a new, deeply frozen, sanitized
 * snapshot; no original object, array, getter, or Proxy survives.
 */

import { computeJsonDocumentDigestJcs } from '@peac/protocol';
import {
  CorrelationExtensionSchema,
  OpaqueRefSchema,
  Rfc3339DateTimeSchema,
  Sha256DigestSchema,
} from '@peac/schema';

export const AGENT_RUN_MANIFEST_ARTIFACT_TYPE = 'com.example/agent-run-manifest/1' as const;

/**
 * Single source of truth for the manifest-shape limits. `verify.ts` composes
 * these into its exported `AGENT_RUN_LINEAGE_LIMITS` so `maxEvents` and
 * `maxManifestBytes` are never duplicated.
 *
 * `maxManifestBytes` is a reachable defense-in-depth bound: under the
 * `OpaqueRefSchema` 256-byte-per-ref limit and `maxEvents` events, a fully
 * valid manifest can exceed 16 KiB (a 16-event manifest with maximal opaque
 * refs serializes to roughly 17 KiB), so the bound is enforceable against a
 * valid-shaped manifest, not only malformed input.
 */
export const MANIFEST_LIMITS = {
  maxEvents: 16,
  maxManifestBytes: 16 * 1024,
} as const;

export interface InvokedEventDescriptorV1 {
  readonly event_ref: string;
  readonly sequence_index: number;
  readonly event_kind: 'model-call' | 'tool-call';
  readonly agent_ref: string;
  readonly action_ref: string;
  readonly observed_at: string;
  readonly input_digest: string;
  readonly output_digest: string;
}

export interface DelegationEventDescriptorV1 {
  readonly event_ref: string;
  readonly sequence_index: number;
  readonly event_kind: 'delegation';
  readonly agent_ref: string;
  readonly action_ref: string;
  readonly observed_at: string;
  readonly input_digest: string;
  readonly delegated_to_ref: string;
}

export type AgentRunEventDescriptorV1 = InvokedEventDescriptorV1 | DelegationEventDescriptorV1;

export interface AgentRunManifestV1 {
  readonly artifact_type: typeof AGENT_RUN_MANIFEST_ARTIFACT_TYPE;
  readonly run_ref: string;
  readonly workflow_id: string;
  readonly event_count: number;
  readonly events: readonly AgentRunEventDescriptorV1[];
}

export type ValidateManifestResult =
  | { readonly ok: true; readonly manifest: AgentRunManifestV1 }
  | { readonly ok: false; readonly reason: 'manifest-invalid' | 'input-limit-exceeded' };

/** UTF-8 byte length (never JavaScript string `.length`). */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function isOpaqueRef(value: unknown): value is string {
  return typeof value === 'string' && OpaqueRefSchema.safeParse(value).success;
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && Sha256DigestSchema.safeParse(value).success;
}

function isTimestamp(value: unknown): value is string {
  // Strict RFC 3339 (seconds precision required); not the deprecated
  // minute-precision Iso8601/Rfc3339Timestamp alias.
  return typeof value === 'string' && Rfc3339DateTimeSchema.safeParse(value).success;
}

function isSafeNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Manifest workflow_id validated via the canonical correlation constraint. */
function isValidWorkflowId(value: unknown): value is string {
  return (
    CorrelationExtensionSchema.safeParse({ workflow_id: value }).success && value !== undefined
  );
}

const INVOKED_KEYS = [
  'event_ref',
  'sequence_index',
  'event_kind',
  'agent_ref',
  'action_ref',
  'observed_at',
  'input_digest',
  'output_digest',
] as const;

const DELEGATION_KEYS = [
  'event_ref',
  'sequence_index',
  'event_kind',
  'agent_ref',
  'action_ref',
  'observed_at',
  'input_digest',
  'delegated_to_ref',
] as const;

const MANIFEST_KEYS = ['artifact_type', 'run_ref', 'workflow_id', 'event_count', 'events'] as const;

function asPlainObject(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return undefined;
  return value as Record<string, unknown>;
}

/** Compare a captured key array (read once, inside the guard) against a spec. */
function hasExactKeys(keys: readonly string[], required: readonly string[]): boolean {
  return keys.length === required.length && keys.every((k) => required.includes(k));
}

interface RawDescriptorFields {
  /** Own enumerable keys captured once inside the guard; never re-read. */
  readonly keys: readonly string[];
  readonly event_kind: unknown;
  readonly event_ref: unknown;
  readonly sequence_index: unknown;
  readonly agent_ref: unknown;
  readonly action_ref: unknown;
  readonly observed_at: unknown;
  readonly input_digest: unknown;
  readonly output_digest: unknown;
  readonly delegated_to_ref: unknown;
}

/**
 * Read every untrusted descriptor field, and its own-key set, exactly once
 * behind a guarded boundary. A throwing getter, or a Proxy that throws from
 * `getPrototypeOf`, `ownKeys`, `getOwnPropertyDescriptor`, or `get` (including
 * a stateful Proxy that only throws on a second `ownKeys`), yields `undefined`
 * instead of escaping the validator: the original object is never touched
 * again after this function returns.
 */
function readDescriptorGuarded(value: unknown): RawDescriptorFields | undefined {
  try {
    const obj = asPlainObject(value);
    if (!obj) return undefined;
    // Capture the own-key set once here (contains a hostile ownKeys trap).
    const keys = Object.keys(obj);
    return {
      keys,
      event_kind: obj.event_kind,
      event_ref: obj.event_ref,
      sequence_index: obj.sequence_index,
      agent_ref: obj.agent_ref,
      action_ref: obj.action_ref,
      observed_at: obj.observed_at,
      input_digest: obj.input_digest,
      output_digest: obj.output_digest,
      delegated_to_ref: obj.delegated_to_ref,
    };
  } catch {
    return undefined;
  }
}

/** Validate one event descriptor into a sanitized, frozen plain snapshot. */
function validateEventDescriptor(value: unknown): AgentRunEventDescriptorV1 | undefined {
  const raw = readDescriptorGuarded(value);
  if (!raw) return undefined;
  const kind = raw.event_kind;

  const commonValid =
    isOpaqueRef(raw.event_ref) &&
    isSafeNonNegativeInt(raw.sequence_index) &&
    isOpaqueRef(raw.agent_ref) &&
    isOpaqueRef(raw.action_ref) &&
    isTimestamp(raw.observed_at) &&
    isSha256(raw.input_digest);

  if (kind === 'model-call' || kind === 'tool-call') {
    if (!hasExactKeys(raw.keys, INVOKED_KEYS)) return undefined;
    if (!commonValid || !isSha256(raw.output_digest)) return undefined;
    return Object.freeze({
      event_ref: raw.event_ref as string,
      sequence_index: raw.sequence_index as number,
      event_kind: kind,
      agent_ref: raw.agent_ref as string,
      action_ref: raw.action_ref as string,
      observed_at: raw.observed_at as string,
      input_digest: raw.input_digest as string,
      output_digest: raw.output_digest as string,
    });
  }
  if (kind === 'delegation') {
    if (!hasExactKeys(raw.keys, DELEGATION_KEYS)) return undefined;
    if (!commonValid || !isOpaqueRef(raw.delegated_to_ref)) return undefined;
    return Object.freeze({
      event_ref: raw.event_ref as string,
      sequence_index: raw.sequence_index as number,
      event_kind: 'delegation',
      agent_ref: raw.agent_ref as string,
      action_ref: raw.action_ref as string,
      observed_at: raw.observed_at as string,
      input_digest: raw.input_digest as string,
      delegated_to_ref: raw.delegated_to_ref as string,
    });
  }
  return undefined;
}

/**
 * Fail-closed strict validation of an agent run manifest. Guards the untrusted
 * object-introspection and property-read boundary at BOTH the top level and
 * every nested descriptor. Returns a sanitized, deeply frozen snapshot on
 * success; `manifest-invalid` on any structural violation; `input-limit-exceeded`
 * when the sanitized serialization exceeds `MANIFEST_LIMITS.maxManifestBytes`.
 */
export function validateAgentRunManifest(value: unknown): ValidateManifestResult {
  let artifactType: unknown;
  let runRef: unknown;
  let workflowId: unknown;
  let eventCount: unknown;
  // A plain snapshot of the events array, materialized inside the guard so a
  // hostile `length` getter, indexed `get`, or iterator trap cannot escape.
  let eventSnapshot: unknown[] = [];
  try {
    const obj = asPlainObject(value);
    if (!obj || !hasExactKeys(Object.keys(obj), MANIFEST_KEYS)) {
      return { ok: false, reason: 'manifest-invalid' };
    }
    artifactType = obj.artifact_type;
    runRef = obj.run_ref;
    workflowId = obj.workflow_id;
    eventCount = obj.event_count;
    const events = obj.events;
    if (!Array.isArray(events)) return { ok: false, reason: 'manifest-invalid' };
    const length = events.length;
    if (!isSafeNonNegativeInt(length)) return { ok: false, reason: 'manifest-invalid' };
    const snapshot: unknown[] = [];
    for (let i = 0; i < length; i += 1) snapshot.push(events[i]);
    eventSnapshot = snapshot;
  } catch {
    return { ok: false, reason: 'manifest-invalid' };
  }

  if (
    artifactType !== AGENT_RUN_MANIFEST_ARTIFACT_TYPE ||
    !isOpaqueRef(runRef) ||
    !isValidWorkflowId(workflowId) ||
    !isSafeNonNegativeInt(eventCount)
  ) {
    return { ok: false, reason: 'manifest-invalid' };
  }
  if (
    eventSnapshot.length < 1 ||
    eventSnapshot.length > MANIFEST_LIMITS.maxEvents ||
    eventCount !== eventSnapshot.length
  ) {
    return { ok: false, reason: 'manifest-invalid' };
  }

  const validated: AgentRunEventDescriptorV1[] = [];
  const seenRefs = new Set<string>();
  for (let i = 0; i < eventSnapshot.length; i += 1) {
    const descriptor = validateEventDescriptor(eventSnapshot[i]);
    if (!descriptor || descriptor.sequence_index !== i) {
      return { ok: false, reason: 'manifest-invalid' };
    }
    if (seenRefs.has(descriptor.event_ref)) {
      return { ok: false, reason: 'manifest-invalid' };
    }
    seenRefs.add(descriptor.event_ref);
    validated.push(descriptor);
  }

  const manifest: AgentRunManifestV1 = Object.freeze({
    artifact_type: AGENT_RUN_MANIFEST_ARTIFACT_TYPE,
    run_ref: runRef,
    workflow_id: workflowId,
    event_count: eventCount,
    events: Object.freeze(validated),
  });

  if (utf8ByteLength(JSON.stringify(manifest)) > MANIFEST_LIMITS.maxManifestBytes) {
    return { ok: false, reason: 'input-limit-exceeded' };
  }
  return { ok: true, manifest };
}

/** JCS + SHA-256 digest of the whole validated manifest (`sha256:<hex64>`). */
export function computeManifestDigest(manifest: AgentRunManifestV1): Promise<string> {
  return computeJsonDocumentDigestJcs(
    manifest as unknown as Parameters<typeof computeJsonDocumentDigestJcs>[0]
  );
}

/** JCS + SHA-256 digest of a single event descriptor (`sha256:<hex64>`). */
export function computeEventDescriptorDigest(
  descriptor: AgentRunEventDescriptorV1
): Promise<string> {
  return computeJsonDocumentDigestJcs(
    descriptor as unknown as Parameters<typeof computeJsonDocumentDigestJcs>[0]
  );
}
