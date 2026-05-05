import { describe, it, expect } from 'vitest';

import {
  fromA2ATaskObservation,
  type A2ATaskObservationInput,
  type A2ATaskEvent,
} from '../../src/observation/handoff';
import {
  A2A_HANDOFF_EXTENSION_KEY,
  A2A_TASK_EVENT_TYPES,
  A2A_TASK_TYPE_URIS,
  A2AHandoffSchema,
} from '@peac/schema';

const FROM_REF = 'sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
const TO_REF = 'sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

function baseInput(event: A2ATaskEvent): A2ATaskObservationInput {
  return {
    event,
    task_id: 'urn:a2a:task:42',
    from_agent: {
      card_ref: FROM_REF,
      selected_interface_url: 'https://gateway.example.com/a2a/v1',
    },
    to_agent: { card_ref: TO_REF },
    state: event.replace(/^(task|human)\./, ''),
    observed_at: '2026-05-05T12:00:00Z',
  };
}

describe('fromA2ATaskObservation: 9 events × happy-path', () => {
  it.each(A2A_TASK_EVENT_TYPES)('event %s produces a valid extension payload', (event) => {
    const input = baseInput(event);
    if (event === 'task.submitted') {
      // task.submitted typically has no to_agent
      delete input.to_agent;
    }
    const ext = fromA2ATaskObservation(input);
    const obs = ext[A2A_HANDOFF_EXTENSION_KEY];
    expect(obs.type).toBe(A2A_TASK_TYPE_URIS[event]);
    expect((obs as { event: string }).event).toBe(event);
    const parsed = A2AHandoffSchema.safeParse(obs);
    expect(parsed.success).toBe(true);
  });
});

describe('fromA2ATaskObservation: schema enforcement', () => {
  it('rejects task_id that violates opaque-ref grammar', () => {
    const ext = fromA2ATaskObservation({
      ...baseInput('task.completed'),
      task_id: 'plain text',
    });
    const parsed = A2AHandoffSchema.safeParse(ext[A2A_HANDOFF_EXTENSION_KEY]);
    expect(parsed.success).toBe(false);
  });

  it('rejects from_agent.card_ref that violates opaque-ref grammar', () => {
    const ext = fromA2ATaskObservation({
      ...baseInput('task.completed'),
      from_agent: { card_ref: 'org.peacprotocol' },
    });
    const parsed = A2AHandoffSchema.safeParse(ext[A2A_HANDOFF_EXTENSION_KEY]);
    expect(parsed.success).toBe(false);
  });

  it('rejects malformed observed_at', () => {
    const ext = fromA2ATaskObservation({
      ...baseInput('task.completed'),
      observed_at: 'not-a-date',
    });
    const parsed = A2AHandoffSchema.safeParse(ext[A2A_HANDOFF_EXTENSION_KEY]);
    expect(parsed.success).toBe(false);
  });

  it('rejects state longer than 128 chars', () => {
    const ext = fromA2ATaskObservation({
      ...baseInput('task.state_changed'),
      state: 'x'.repeat(129),
    });
    const parsed = A2AHandoffSchema.safeParse(ext[A2A_HANDOFF_EXTENSION_KEY]);
    expect(parsed.success).toBe(false);
  });

  it('accepts upstream_event_digest with sha256: prefix', () => {
    const ext = fromA2ATaskObservation({
      ...baseInput('task.completed'),
      upstream_event_ref: 'urn:a2a:event:e1',
      upstream_event_digest:
        'sha256:0000000000000000000000000000000000000000000000000000000000000001',
    });
    expect(A2AHandoffSchema.safeParse(ext[A2A_HANDOFF_EXTENSION_KEY]).success).toBe(true);
  });

  it('rejects malformed upstream_event_digest', () => {
    const ext = fromA2ATaskObservation({
      ...baseInput('task.completed'),
      upstream_event_digest: 'not-a-digest',
    });
    const parsed = A2AHandoffSchema.safeParse(ext[A2A_HANDOFF_EXTENSION_KEY]);
    expect(parsed.success).toBe(false);
  });
});

describe('fromA2ATaskObservation: emitted-extension-shape snapshot (no decision vocabulary)', () => {
  it.each(A2A_TASK_EVENT_TYPES)(
    'event %s emits only spec-allowed keys, no decision/verdict/score/result',
    (event) => {
      const input = baseInput(event);
      if (event === 'task.submitted') delete input.to_agent;
      const ext = fromA2ATaskObservation(input);
      const obs = ext[A2A_HANDOFF_EXTENSION_KEY] as Record<string, unknown>;
      const allowed = new Set([
        'type',
        'event',
        'task_id',
        'parent_task_id',
        'from_agent',
        'to_agent',
        'state',
        'reason',
        'observed_at',
        'upstream_event_ref',
        'upstream_event_digest',
      ]);
      for (const k of Object.keys(obs)) expect(allowed.has(k)).toBe(true);
      for (const forbidden of [
        'decision',
        'verdict',
        'score',
        'result',
        'passed',
        'failed',
        'pass',
        'fail',
        'allow',
        'deny',
        'allowed',
        'denied',
        'authorized',
        'granted',
        'rejected',
      ]) {
        expect(obs).not.toHaveProperty(forbidden);
      }
    }
  );
});
