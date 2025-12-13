/**
 * PEAC Policy Kit Evaluation
 *
 * Deterministic policy evaluation for CAL semantics.
 * First-match-wins rule semantics.
 *
 * @packageDocumentation
 */

import {
  PolicyDocument,
  PolicyRule,
  SubjectMatcher,
  EvaluationContext,
  EvaluationResult,
  ControlPurpose,
  ControlLicensingMode,
  SubjectType,
} from './types';

/**
 * Check if a value matches a single-or-array pattern
 *
 * @param value - Value to check
 * @param pattern - Single value or array of values
 * @returns true if value matches pattern
 */
function matchesSingleOrArray<T>(value: T | undefined, pattern: T | T[] | undefined): boolean {
  // If no pattern specified, match anything
  if (pattern === undefined) {
    return true;
  }

  // If no value and pattern exists, no match
  if (value === undefined) {
    return false;
  }

  // Check against array or single value
  if (Array.isArray(pattern)) {
    return pattern.includes(value);
  }

  return value === pattern;
}

/**
 * Check if a subject ID matches a pattern
 *
 * Supports:
 * - Exact match: "user:abc123"
 * - Prefix match with wildcard: "user:*" matches "user:abc123"
 *
 * @param id - Subject ID to check
 * @param pattern - Pattern to match against
 * @returns true if ID matches pattern
 */
function matchesIdPattern(id: string | undefined, pattern: string | undefined): boolean {
  // No pattern = match anything
  if (pattern === undefined) {
    return true;
  }

  // No ID but pattern exists = no match
  if (id === undefined) {
    return false;
  }

  // Wildcard prefix match
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return id.startsWith(prefix);
  }

  // Exact match
  return id === pattern;
}

/**
 * Check if subject labels contain all required labels
 *
 * @param subjectLabels - Labels on the subject
 * @param requiredLabels - Labels required by the rule
 * @returns true if subject has all required labels
 */
function hasAllLabels(
  subjectLabels: string[] | undefined,
  requiredLabels: string[] | undefined
): boolean {
  // No required labels = match
  if (requiredLabels === undefined || requiredLabels.length === 0) {
    return true;
  }

  // Required labels but no subject labels = no match
  if (subjectLabels === undefined || subjectLabels.length === 0) {
    return false;
  }

  // Check all required labels are present
  return requiredLabels.every((label) => subjectLabels.includes(label));
}

/**
 * Check if a subject matches a subject matcher
 *
 * @param subject - Subject from evaluation context
 * @param matcher - Subject matcher from rule
 * @returns true if subject matches all criteria
 */
function matchesSubject(
  subject: EvaluationContext['subject'],
  matcher: SubjectMatcher | undefined
): boolean {
  // No matcher = match any subject
  if (matcher === undefined) {
    return true;
  }

  // Check type
  if (!matchesSingleOrArray(subject?.type, matcher.type)) {
    return false;
  }

  // Check labels (must have ALL required labels)
  if (!hasAllLabels(subject?.labels, matcher.labels)) {
    return false;
  }

  // Check ID pattern
  if (!matchesIdPattern(subject?.id, matcher.id)) {
    return false;
  }

  return true;
}

/**
 * Check if a rule matches the evaluation context
 *
 * All criteria must match (AND logic).
 *
 * @param rule - Policy rule to check
 * @param context - Evaluation context
 * @returns true if rule matches context
 */
function ruleMatches(rule: PolicyRule, context: EvaluationContext): boolean {
  // Check subject
  if (!matchesSubject(context.subject, rule.subject)) {
    return false;
  }

  // Check purpose
  if (!matchesSingleOrArray(context.purpose, rule.purpose)) {
    return false;
  }

  // Check licensing mode
  if (!matchesSingleOrArray(context.licensing_mode, rule.licensing_mode)) {
    return false;
  }

  return true;
}

/**
 * Evaluate a policy against a context
 *
 * Uses first-match-wins semantics:
 * - Rules are evaluated in order
 * - First matching rule determines the decision
 * - If no rule matches, defaults are applied
 *
 * @param policy - Policy document
 * @param context - Evaluation context
 * @returns Evaluation result
 */
export function evaluate(policy: PolicyDocument, context: EvaluationContext): EvaluationResult {
  // Find first matching rule
  for (const rule of policy.rules) {
    if (ruleMatches(rule, context)) {
      return {
        decision: rule.decision,
        matched_rule: rule.name,
        reason: rule.reason,
        is_default: false,
      };
    }
  }

  // No rule matched, apply defaults
  return {
    decision: policy.defaults.decision,
    reason: policy.defaults.reason,
    is_default: true,
  };
}

/**
 * Explain which rules could potentially match a context
 *
 * Useful for debugging and policy analysis.
 * Returns all rules that would match if evaluated, in order.
 *
 * @param policy - Policy document
 * @param context - Evaluation context
 * @returns Array of rule names that match, or 'default' if none
 */
export function explainMatches(policy: PolicyDocument, context: EvaluationContext): string[] {
  const matches: string[] = [];

  for (const rule of policy.rules) {
    if (ruleMatches(rule, context)) {
      matches.push(rule.name);
    }
  }

  if (matches.length === 0) {
    matches.push('[default]');
  }

  return matches;
}

/**
 * Find the effective rule for a context
 *
 * Same as evaluate() but returns the full rule object.
 *
 * @param policy - Policy document
 * @param context - Evaluation context
 * @returns Matched rule or undefined if default applies
 */
export function findEffectiveRule(
  policy: PolicyDocument,
  context: EvaluationContext
): PolicyRule | undefined {
  for (const rule of policy.rules) {
    if (ruleMatches(rule, context)) {
      return rule;
    }
  }
  return undefined;
}

/**
 * Check if a policy would allow a given context
 *
 * Convenience helper for common allow/deny checks.
 *
 * @param policy - Policy document
 * @param context - Evaluation context
 * @returns true if decision is 'allow'
 */
export function isAllowed(policy: PolicyDocument, context: EvaluationContext): boolean {
  const result = evaluate(policy, context);
  return result.decision === 'allow';
}

/**
 * Check if a policy would deny a given context
 *
 * Convenience helper for common allow/deny checks.
 *
 * @param policy - Policy document
 * @param context - Evaluation context
 * @returns true if decision is 'deny'
 */
export function isDenied(policy: PolicyDocument, context: EvaluationContext): boolean {
  const result = evaluate(policy, context);
  return result.decision === 'deny';
}

/**
 * Check if a policy requires review for a given context
 *
 * Convenience helper for review checks.
 *
 * @param policy - Policy document
 * @param context - Evaluation context
 * @returns true if decision is 'review'
 */
export function requiresReview(policy: PolicyDocument, context: EvaluationContext): boolean {
  const result = evaluate(policy, context);
  return result.decision === 'review';
}

/**
 * Batch evaluate multiple contexts against a policy
 *
 * Useful for testing or bulk authorization checks.
 *
 * @param policy - Policy document
 * @param contexts - Array of evaluation contexts
 * @returns Array of evaluation results (same order as contexts)
 */
export function evaluateBatch(
  policy: PolicyDocument,
  contexts: EvaluationContext[]
): EvaluationResult[] {
  return contexts.map((context) => evaluate(policy, context));
}
