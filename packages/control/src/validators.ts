/**
 * PEAC Control Abstraction Layer (CAL) Validators
 *
 * Validation logic for control blocks and mandates.
 */

import { z } from 'zod';

/**
 * Base temporal mandate schema (without refinements)
 */
const TemporalConstraintBaseSchema = z.object({
  type: z.literal('temporal'),
  valid_from: z.number().int().positive().optional(),
  valid_until: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(),
});

/**
 * Base usage mandate schema (without refinements)
 */
const UsageConstraintBaseSchema = z.object({
  type: z.literal('usage'),
  max_uses: z.number().int().positive(),
  current_uses: z.number().int().nonnegative().optional(),
  window: z.number().int().positive().optional(),
});

/**
 * Base budget mandate schema (without refinements)
 */
const BudgetConstraintBaseSchema = z.object({
  type: z.literal('budget'),
  max_amount: z.number().int().positive(),
  current_amount: z.number().int().nonnegative().optional(),
  window: z.number().int().positive().optional(),
  currency: z.string().length(3).toUpperCase(),
});

/**
 * Base combined mandate schema (without refinements)
 */
const CombinedConstraintBaseSchema = z.object({
  type: z.literal('combined'),
  temporal: z
    .object({
      valid_from: z.number().int().positive().optional(),
      valid_until: z.number().int().positive().optional(),
      duration: z.number().int().positive().optional(),
    })
    .optional(),
  usage: z
    .object({
      max_uses: z.number().int().positive(),
      current_uses: z.number().int().nonnegative().optional(),
      window: z.number().int().positive().optional(),
    })
    .optional(),
  budget: z
    .object({
      max_amount: z.number().int().positive(),
      current_amount: z.number().int().nonnegative().optional(),
      window: z.number().int().positive().optional(),
      currency: z.string().length(3).toUpperCase(),
    })
    .optional(),
});

/**
 * Temporal mandate schema (with validation)
 */
export const TemporalConstraintSchema = TemporalConstraintBaseSchema.refine(
  (data) => {
    // At least one temporal constraint must be specified
    return (
      data.valid_from !== undefined || data.valid_until !== undefined || data.duration !== undefined
    );
  },
  {
    message:
      'At least one temporal constraint (valid_from, valid_until, duration) must be specified',
  }
).refine(
  (data) => {
    // If both valid_from and valid_until are specified, valid_until must be after valid_from
    if (data.valid_from !== undefined && data.valid_until !== undefined) {
      return data.valid_until > data.valid_from;
    }
    return true;
  },
  {
    message: 'valid_until must be after valid_from',
  }
);

/**
 * Usage mandate schema (with validation)
 */
export const UsageConstraintSchema = UsageConstraintBaseSchema.refine(
  (data) => {
    // current_uses cannot exceed max_uses
    if (data.current_uses !== undefined) {
      return data.current_uses <= data.max_uses;
    }
    return true;
  },
  {
    message: 'current_uses cannot exceed max_uses',
  }
);

/**
 * Budget mandate schema (with validation)
 */
export const BudgetConstraintSchema = BudgetConstraintBaseSchema.refine(
  (data) => {
    // current_amount cannot exceed max_amount
    if (data.current_amount !== undefined) {
      return data.current_amount <= data.max_amount;
    }
    return true;
  },
  {
    message: 'current_amount cannot exceed max_amount',
  }
);

/**
 * Combined mandate schema (with validation)
 */
export const CombinedConstraintSchema = CombinedConstraintBaseSchema.refine(
  (data) => {
    // At least one mandate type must be specified
    return data.temporal !== undefined || data.usage !== undefined || data.budget !== undefined;
  },
  {
    message: 'At least one mandate (temporal, usage, budget) must be specified in combined type',
  }
);

/**
 * Constraint schema (discriminated union using base schemas)
 */
export const ConstraintSchema = z.discriminatedUnion('type', [
  TemporalConstraintBaseSchema,
  UsageConstraintBaseSchema,
  BudgetConstraintBaseSchema,
  CombinedConstraintBaseSchema,
]);

/**
 * Control block schema
 */
export const ControlBlockSchema = z.object({
  mandate: ConstraintSchema,
  scope: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Control state schema
 */
export const ControlStateSchema = z.object({
  receipt_id: z.string().uuid(),
  constraint: ConstraintSchema,
  usage_count: z.number().int().nonnegative().optional(),
  spent_amount: z.number().int().nonnegative().optional(),
  first_use: z.number().int().positive().optional(),
  last_use: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});
