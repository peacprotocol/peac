/**
 * A2A task / human handoff observation helper (v0.14.1).
 *
 * Records observational events emitted alongside A2A v1.0 task lifecycle
 * transitions. Nine event types share a single payload shape; the helper
 * dispatches by `event` to set the corresponding type URI.
 *
 * Strictly observational: this helper does NOT decide, verify, evaluate, or
 * route. PEAC records what an external A2A v1 host or client attested.
 *
 * Forbidden: this file MUST NOT contain decision/verdict/score/result vocabulary
 * as field-name semantics. Per the v0.14.1 plan, artifact-shape tests
 * (`packages/schema/__tests__/extensions/a2a-handoff-shape.test.ts`) assert
 * the emitted JSON keys are exactly the spec-allowed set.
 */

import {
  A2A_HANDOFF_EXTENSION_KEY,
  A2A_TASK_TYPE_URIS,
  type A2ATaskEvent,
  type A2ATaskObservation,
} from '@peac/schema';

export type { A2ATaskEvent } from '@peac/schema';

export interface AgentRefInput {
  /** Opaque reference to the agent's Agent Card (e.g. sha256:<hex>). */
  card_ref: string;
  /** Caller-supplied URL of the chosen entry from supportedInterfaces[]. */
  selected_interface_url?: string;
}

export interface A2ATaskObservationInput {
  /** One of nine event names: task.* or human.* */
  event: A2ATaskEvent;
  /** Opaque reference to the A2A task. */
  task_id: string;
  /** Opaque reference to the parent task, if any. */
  parent_task_id?: string;
  /** The agent the task is observed FROM. Required for all events. */
  from_agent: AgentRefInput;
  /** The agent the task is observed TO (typically absent on `task.submitted`). */
  to_agent?: AgentRefInput;
  /** Free-form A2A state name as observed (max 128 chars). */
  state?: string;
  /** Free-form reason string (max 1024 chars). Only meaningful for rejected/failed events. */
  reason?: string;
  /** RFC 3339 timestamp of when the event was observed. */
  observed_at: string;
  /** Opaque pointer to the upstream A2A event (caller-supplied). */
  upstream_event_ref?: string;
  /** sha256:<hex> digest of the upstream A2A event payload (caller-computed). */
  upstream_event_digest?: string;
}

export interface A2AHandoffExtensionBlock {
  [A2A_HANDOFF_EXTENSION_KEY]: A2ATaskObservation;
}

/**
 * Build a task / human lifecycle observation extension block. The helper
 * sets the `type` URI based on `event` and copies the supplied fields
 * verbatim into the extension payload. The schema validator
 * (`A2ATaskObservationSchema` from `@peac/schema`) enforces the field
 * grammars; the helper does not duplicate validation here.
 *
 * Typical use:
 *
 *   const ext = fromA2ATaskObservation({
 *     event: 'task.completed',
 *     task_id: 'urn:a2a:task:42',
 *     from_agent: { card_ref: 'sha256:abc...', selected_interface_url: 'https://gateway.example.com/a2a/v1' },
 *     to_agent: { card_ref: 'sha256:def...' },
 *     state: 'completed',
 *     observed_at: '2026-05-05T12:00:00Z',
 *     upstream_event_ref: 'urn:a2a:event:e1',
 *     upstream_event_digest: 'sha256:0123...',
 *   });
 *   await issue({ extensions: { ...ext }, ... });
 */
export function fromA2ATaskObservation(input: A2ATaskObservationInput): A2AHandoffExtensionBlock {
  const typeUri = A2A_TASK_TYPE_URIS[input.event];

  const obs: A2ATaskObservation = {
    type: typeUri,
    event: input.event,
    task_id: input.task_id,
    from_agent: {
      card_ref: input.from_agent.card_ref,
      ...(input.from_agent.selected_interface_url !== undefined && {
        selected_interface_url: input.from_agent.selected_interface_url,
      }),
    },
    observed_at: input.observed_at,
    ...(input.parent_task_id !== undefined && { parent_task_id: input.parent_task_id }),
    ...(input.to_agent !== undefined && {
      to_agent: {
        ...(input.to_agent.card_ref !== undefined && { card_ref: input.to_agent.card_ref }),
        ...(input.to_agent.selected_interface_url !== undefined && {
          selected_interface_url: input.to_agent.selected_interface_url,
        }),
      },
    }),
    ...(input.state !== undefined && { state: input.state }),
    ...(input.reason !== undefined && { reason: input.reason }),
    ...(input.upstream_event_ref !== undefined && { upstream_event_ref: input.upstream_event_ref }),
    ...(input.upstream_event_digest !== undefined && {
      upstream_event_digest: input.upstream_event_digest,
    }),
  };

  return { [A2A_HANDOFF_EXTENSION_KEY]: obs };
}
