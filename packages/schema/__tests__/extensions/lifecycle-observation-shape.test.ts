/**
 * lifecycle-observation emitted-shape snapshot tests.
 *
 * Asserts the emitted JSON for a happy-path positive vector of EACH
 * event kind contains ONLY spec-allowed keys. Pins the artifact-shape
 * (NOT the source) so future contributors cannot silently widen the
 * record surface beyond §5 / §5.2 of the profile spec.
 */
import { describe, it, expect } from 'vitest';
import { LifecycleObservationSchema } from '../../src/extensions/lifecycle-observation';

const COMMON_ALLOWED = new Set([
  'event_kind',
  'subject_ref',
  'observed_at',
  'parent_ref',
  'upstream_artifact_ref',
  'upstream_artifact_digest',
  'policy_ref',
  'policy_digest',
  'rubric_ref',
  'score_ref',
  'result_digest',
  'observed_mode',
]);

const PER_KIND_ALLOWED: Record<string, string[]> = {
  'lifecycle-approval-requested': ['approval_ref', 'approver_ref'],
  'lifecycle-approval-granted': ['approval_ref', 'approver_ref'],
  'lifecycle-approval-denied': ['approval_ref', 'approver_ref'],
  'lifecycle-evaluation-started': [],
  'lifecycle-evaluation-completed': ['result_ref'],
  'lifecycle-experiment-assigned': ['experiment_ref', 'cohort_ref', 'variant_ref'],
  'lifecycle-experiment-result': ['experiment_ref', 'cohort_ref', 'variant_ref', 'result_ref'],
  'lifecycle-workflow-transition': ['from_state', 'to_state'],
  'lifecycle-mode-observed': [],
};

const VECTORS: Record<string, Record<string, unknown>> = {
  'lifecycle-approval-requested': {
    event_kind: 'lifecycle-approval-requested',
    subject_ref: 'urn:peac:task:a1',
    observed_at: '2026-05-12T10:00:00Z',
    approval_ref: 'urn:peac:approval:a1',
    approver_ref: 'ref:approver-1',
  },
  'lifecycle-approval-granted': {
    event_kind: 'lifecycle-approval-granted',
    subject_ref: 'urn:peac:task:a2',
    observed_at: '2026-05-12T10:01:00Z',
    approval_ref: 'urn:peac:approval:a2',
    approver_ref: 'ref:approver-2',
  },
  'lifecycle-approval-denied': {
    event_kind: 'lifecycle-approval-denied',
    subject_ref: 'urn:peac:task:a3',
    observed_at: '2026-05-12T10:02:00Z',
    approval_ref: 'urn:peac:approval:a3',
    approver_ref: 'ref:approver-3',
  },
  'lifecycle-evaluation-started': {
    event_kind: 'lifecycle-evaluation-started',
    subject_ref: 'urn:peac:eval:s1',
    observed_at: '2026-05-12T11:00:00Z',
  },
  'lifecycle-evaluation-completed': {
    event_kind: 'lifecycle-evaluation-completed',
    subject_ref: 'urn:peac:eval:s1',
    observed_at: '2026-05-12T11:10:00Z',
    result_ref: 'urn:peac:result:e1',
  },
  'lifecycle-experiment-assigned': {
    event_kind: 'lifecycle-experiment-assigned',
    subject_ref: 'urn:peac:subject:u1',
    observed_at: '2026-05-12T12:00:00Z',
    experiment_ref: 'urn:peac:experiment:x1',
  },
  'lifecycle-experiment-result': {
    event_kind: 'lifecycle-experiment-result',
    subject_ref: 'urn:peac:subject:u1',
    observed_at: '2026-05-12T12:30:00Z',
    experiment_ref: 'urn:peac:experiment:x1',
    result_ref: 'urn:peac:result:x1',
  },
  'lifecycle-workflow-transition': {
    event_kind: 'lifecycle-workflow-transition',
    subject_ref: 'urn:peac:task:wf1',
    observed_at: '2026-05-12T13:00:00Z',
    from_state: 'pending',
    to_state: 'running',
  },
  'lifecycle-mode-observed': {
    event_kind: 'lifecycle-mode-observed',
    subject_ref: 'urn:peac:run:m1',
    observed_at: '2026-05-12T14:00:00Z',
    observed_mode: 'agent_loop',
  },
};

describe('lifecycle-observation: emitted-shape snapshot', () => {
  for (const [eventKind, vector] of Object.entries(VECTORS)) {
    it(`${eventKind}: emitted JSON contains ONLY spec-allowed keys`, () => {
      const result = LifecycleObservationSchema.safeParse(vector);
      expect(result.success).toBe(true);
      if (result.success) {
        const allowed = new Set([...COMMON_ALLOWED, ...(PER_KIND_ALLOWED[eventKind] ?? [])]);
        const emittedKeys = Object.keys(result.data as Record<string, unknown>);
        for (const k of emittedKeys) {
          expect(allowed.has(k), `unexpected emitted key '${k}' for ${eventKind}`).toBe(true);
        }
      }
    });
  }
});
