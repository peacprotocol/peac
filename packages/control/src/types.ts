/**
 * PEAC Control Types
 */

// Re-export core control types from schema
export type {
  ControlBlock,
  ControlStep,
  ControlDecision,
  ControlValidationResult,
} from '@peac/schema';

// Import and re-export constraint types
import type {
  ConstraintType,
  TemporalConstraint,
  UsageConstraint,
  BudgetConstraint,
  CombinedConstraint,
  Constraint,
  ConstraintEnforcementResult,
} from './constraints';

export type {
  ConstraintType,
  TemporalConstraint,
  UsageConstraint,
  BudgetConstraint,
  CombinedConstraint,
  Constraint,
  ConstraintEnforcementResult,
};

// Legacy aliases (deprecated)
export type MandateType = ConstraintType;
export type TemporalMandate = TemporalConstraint;
export type UsageMandate = UsageConstraint;
export type BudgetMandate = BudgetConstraint;
export type CombinedMandate = CombinedConstraint;
export type Mandate = Constraint;
export type EnforcementResult = ConstraintEnforcementResult;

// Control state
export interface ControlState {
  receipt_id: string;
  constraint: Constraint;
  usage_count?: number;
  spent_amount?: number;
  first_use?: number;
  last_use?: number;
  metadata?: Record<string, unknown>;
}
