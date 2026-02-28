/**
 * Control Action Extension Schema (v0.11.3+, DD-145 ZT Pack)
 *
 * Records access control decisions in ext["org.peacprotocol/control_action"].
 * Actions: grant, deny, escalate, delegate, audit.
 * Triggers: policy_evaluation, manual_review, anomaly_detection, scheduled, event_driven.
 */
import { z } from 'zod';

export const CONTROL_ACTION_EXTENSION_KEY = 'org.peacprotocol/control_action' as const;

/**
 * Control action types
 */
export const CONTROL_ACTIONS = ['grant', 'deny', 'escalate', 'delegate', 'audit'] as const;

export const ControlActionTypeSchema = z.enum(CONTROL_ACTIONS);
export type ControlActionType = z.infer<typeof ControlActionTypeSchema>;

/**
 * Control action triggers
 */
export const CONTROL_TRIGGERS = [
  'policy_evaluation',
  'manual_review',
  'anomaly_detection',
  'scheduled',
  'event_driven',
] as const;

export const ControlTriggerSchema = z.enum(CONTROL_TRIGGERS);
export type ControlTrigger = z.infer<typeof ControlTriggerSchema>;

/**
 * Control Action extension schema
 */
export const ControlActionSchema = z
  .object({
    /** Action taken */
    action: ControlActionTypeSchema,

    /** What triggered the action */
    trigger: ControlTriggerSchema,

    /** Resource or scope the action applies to (optional) */
    resource: z.string().max(2048).optional(),

    /** Reason for the action (optional, human-readable) */
    reason: z.string().max(1024).optional(),

    /** Policy identifier that was evaluated (optional) */
    policy_ref: z.string().max(2048).optional(),

    /** When the action was taken (RFC 3339, optional; defaults to receipt iat) */
    action_at: z.string().datetime().optional(),
  })
  .strict();

export type ControlAction = z.infer<typeof ControlActionSchema>;

/**
 * Validate a ControlAction object.
 */
export function validateControlAction(
  data: unknown
): { ok: true; value: ControlAction } | { ok: false; error: string } {
  const result = ControlActionSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.message };
}
