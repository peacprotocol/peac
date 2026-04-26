/**
 * Bounded internal kernel-constraints validator.
 *
 * INTERNAL ONLY. This is the parity-observed counterpart of
 * @peac/schema.validateKernelConstraints; both implementations consume
 * the same KERNEL_CONSTRAINTS constants from @peac/kernel and emit the
 * same ConstraintValidationResult shape. The differential parity test
 * asserts byte-identical equality between the two on every eligible
 * fixture; any divergence is stop-the-line.
 *
 * Existing validation in @peac/schema remains canonical. This module
 * is observational only; it is NOT re-exported from
 * packages/protocol/src/index.ts and is NOT wired into runtime paths
 * (issue.ts, verify-local.ts) in v0.13.1.
 *
 * Implementation invariants (must mirror @peac/schema/src/constraints.ts
 * verbatim; any drift fails the parity test):
 *   - iterative stack-based traversal (stack-safe; no recursion)
 *   - every value (primitives, arrays, objects) is pushed and counted as
 *     a node when popped
 *   - total-nodes check evaluated FIRST per pop; over-limit pushes the
 *     violation with the current totalNodes count and breaks (preserves
 *     first-violation semantics)
 *   - depth check evaluated SECOND per pop; over-limit pushes a
 *     violation and continues (no-op for primitives, prevents deeper
 *     descent for containers)
 *   - string-length check (primitives only) uses .length (code units)
 *   - array-length and object-key-count checks pushed BEFORE descending
 *     into children
 *   - children pushed in reverse index/key order so traversal visits
 *     them in original order (LIFO)
 *   - empty path for root; bracket notation for arrays (`a[0]`); dot
 *     notation for object keys (`a.b`)
 *   - returns { valid: violations.length === 0, violations }
 *   - never throws
 *   - assumes acyclic input
 */

import { KERNEL_CONSTRAINTS } from '@peac/schema';
import type { ConstraintValidationResult, ConstraintViolation } from '@peac/schema';

/**
 * Validate claims against structural kernel constraints. Mirrors the
 * canonical implementation in @peac/schema for parity.
 *
 * Distinct exported name (validateKernelConstraintsInternal) to avoid
 * collision with the canonical @peac/schema export when both are
 * imported into the same parity test file.
 */
export function validateKernelConstraintsInternal(claims: unknown): ConstraintValidationResult {
  const violations: ConstraintViolation[] = [];

  if (claims === null || claims === undefined || typeof claims !== 'object') {
    return { valid: true, violations };
  }

  let totalNodes = 0;
  const stack: Array<{ value: unknown; depth: number; path: string }> = [
    { value: claims, depth: 0, path: '' },
  ];

  while (stack.length > 0) {
    const item = stack.pop()!;
    totalNodes++;

    if (totalNodes > KERNEL_CONSTRAINTS.MAX_TOTAL_NODES) {
      violations.push({
        constraint: 'MAX_TOTAL_NODES',
        actual: totalNodes,
        limit: KERNEL_CONSTRAINTS.MAX_TOTAL_NODES,
        path: item.path,
      });
      break;
    }

    if (item.depth > KERNEL_CONSTRAINTS.MAX_NESTED_DEPTH) {
      violations.push({
        constraint: 'MAX_NESTED_DEPTH',
        actual: item.depth,
        limit: KERNEL_CONSTRAINTS.MAX_NESTED_DEPTH,
        path: item.path,
      });
      continue;
    }

    if (item.value === null || typeof item.value !== 'object') {
      if (typeof item.value === 'string') {
        if (item.value.length > KERNEL_CONSTRAINTS.MAX_STRING_LENGTH) {
          violations.push({
            constraint: 'MAX_STRING_LENGTH',
            actual: item.value.length,
            limit: KERNEL_CONSTRAINTS.MAX_STRING_LENGTH,
            path: item.path,
          });
        }
      }
      continue;
    }

    if (Array.isArray(item.value)) {
      if (item.value.length > KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH) {
        violations.push({
          constraint: 'MAX_ARRAY_LENGTH',
          actual: item.value.length,
          limit: KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH,
          path: item.path,
        });
      }
      for (let i = item.value.length - 1; i >= 0; i--) {
        stack.push({
          value: item.value[i],
          depth: item.depth + 1,
          path: `${item.path}[${i}]`,
        });
      }
      continue;
    }

    const keys = Object.keys(item.value as Record<string, unknown>);
    if (keys.length > KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS) {
      violations.push({
        constraint: 'MAX_OBJECT_KEYS',
        actual: keys.length,
        limit: KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS,
        path: item.path,
      });
    }
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      const childPath = item.path ? `${item.path}.${key}` : key;
      stack.push({
        value: (item.value as Record<string, unknown>)[key],
        depth: item.depth + 1,
        path: childPath,
      });
    }
  }

  return { valid: violations.length === 0, violations };
}
