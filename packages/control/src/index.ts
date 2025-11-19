/**
 * PEAC Control
 *
 * Control engine interfaces, generic constraint helpers, and validation.
 *
 * @packageDocumentation
 */

// Adapter Interface (vendor-neutral, normative)
export type {
  ControlEngineAdapter,
  ControlEvaluationContext,
} from './adapter';
export { ControlEngineRegistry } from './adapter';

// Core control types (re-exported from schema)
export type {
  ControlBlock,
  ControlStep,
  ControlDecision,
  ControlValidationResult,
} from './types';

// Generic constraint types (informational helpers)
export type {
  ConstraintType,
  TemporalConstraint,
  UsageConstraint,
  BudgetConstraint,
  CombinedConstraint,
  Constraint,
  ConstraintEnforcementResult,
} from './constraints';

// Legacy types (deprecated, will be removed in v0.9.17)
export type {
  MandateType,
  TemporalMandate,
  UsageMandate,
  BudgetMandate,
  CombinedMandate,
  Mandate,
  EnforcementResult,
  ControlState,
} from './types';

// Validators
export {
  TemporalConstraintSchema,
  UsageConstraintSchema,
  BudgetConstraintSchema,
  CombinedConstraintSchema,
  ConstraintSchema,
  ControlBlockSchema,
  ControlStateSchema,
} from './validators';

// Deprecated validator aliases (will be removed in v0.9.17)
export {
  TemporalConstraintSchema as TemporalMandateSchema,
  UsageConstraintSchema as UsageMandateSchema,
  BudgetConstraintSchema as BudgetMandateSchema,
  CombinedConstraintSchema as CombinedMandateSchema,
  ConstraintSchema as MandateSchema,
} from './validators';

// Enforcement
export {
  enforceTemporalConstraint,
  enforceUsageConstraint,
  enforceBudgetConstraint,
  enforceCombinedConstraint,
  enforceConstraint,
  enforceControlBlock,
} from './enforcement';

// Deprecated enforcement aliases (will be removed in v0.9.17)
export {
  enforceTemporalConstraint as enforceTemporalMandate,
  enforceUsageConstraint as enforceUsageMandate,
  enforceBudgetConstraint as enforceBudgetMandate,
  enforceCombinedConstraint as enforceCombinedMandate,
  enforceConstraint as enforceMandate,
} from './enforcement';

// State management
export {
  createControlState,
  updateStateAfterUse,
  isStateExpired,
  resetState,
  getStateSummary,
} from './state';
