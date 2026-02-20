/**
 * Normative kernel constraints for PEAC receipts.
 *
 * These limits are formalized from existing ad-hoc limits already
 * enforced in the codebase:
 * - JSON_EVIDENCE_LIMITS (json.ts): depth, array, keys, string, nodes
 * - CLOCK_SKEW_SECONDS (DD-8): temporal validity tolerance
 *
 * String length is measured in code units (.length), matching the semantics
 * of assertJsonSafeIterative(). UTF-8 byte-length caps may be introduced
 * as an explicit tightening in a future version.
 *
 * Payment/rail-specific limits (DD-16 x402 DoS guards) are intentionally
 * NOT included here -- they belong in the rail/adapter layer.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Kernel constraints governing PEAC receipt structure and validation.
 * All packages MUST respect these limits.
 *
 * Provenance:
 * - MAX_NESTED_DEPTH..MAX_TOTAL_NODES: from JSON_EVIDENCE_LIMITS (json.ts)
 * - CLOCK_SKEW_SECONDS: from DD-8 temporal validity
 */
export const KERNEL_CONSTRAINTS = {
  /** Maximum nesting depth for JSON evidence */
  MAX_NESTED_DEPTH: 32,
  /** Maximum array length in evidence */
  MAX_ARRAY_LENGTH: 10_000,
  /** Maximum object keys in a single object */
  MAX_OBJECT_KEYS: 1_000,
  /** Maximum string length in code units (JS .length). Matches assertJsonSafeIterative. */
  MAX_STRING_LENGTH: 65_536,
  /** Maximum total nodes to visit during traversal */
  MAX_TOTAL_NODES: 100_000,
  /** Temporal validity clock skew tolerance in seconds (DD-8) */
  CLOCK_SKEW_SECONDS: 60,
} as const;

export type KernelConstraintKey = keyof typeof KERNEL_CONSTRAINTS;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConstraintViolation {
  constraint: KernelConstraintKey;
  actual: number;
  limit: number;
  path?: string;
}

export interface ConstraintValidationResult {
  valid: boolean;
  violations: ConstraintViolation[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate claims against structural kernel constraints using iterative
 * (stack-safe) traversal. Checks depth, array length, object keys, string
 * length, and total node count. Semantic constraints like CLOCK_SKEW_SECONDS
 * are enforced by receipt verification, not this structural validator.
 *
 * Traversal semantics are aligned with assertJsonSafeIterative(): every value
 * (including primitives) is pushed to the stack and counted when popped.
 * String length uses .length (code units), matching assertJsonSafeIterative.
 *
 * **Cycle safety:** This function assumes acyclic input (e.g., the output of
 * JSON.parse(), which is acyclic by construction). If passed a cyclic object
 * graph, traversal will terminate when MAX_TOTAL_NODES is reached -- it will
 * not hang -- but the violation report may be misleading. Callers with
 * potentially cyclic inputs should pre-check with a WeakSet guard.
 *
 * Never throws -- always returns a result object.
 */
export function validateKernelConstraints(claims: unknown): ConstraintValidationResult {
  const violations: ConstraintViolation[] = [];

  if (claims === null || claims === undefined || typeof claims !== 'object') {
    return { valid: true, violations };
  }

  // Iterative traversal aligned with assertJsonSafeIterative():
  // ALL values (primitives, arrays, objects) go on the stack and are
  // counted when popped. This ensures node counts match the existing
  // JSON safety validator.
  let totalNodes = 0;
  const stack: Array<{ value: unknown; depth: number; path: string }> = [
    { value: claims, depth: 0, path: '' },
  ];

  while (stack.length > 0) {
    const item = stack.pop()!;
    totalNodes++;

    // Total nodes check
    if (totalNodes > KERNEL_CONSTRAINTS.MAX_TOTAL_NODES) {
      violations.push({
        constraint: 'MAX_TOTAL_NODES',
        actual: totalNodes,
        limit: KERNEL_CONSTRAINTS.MAX_TOTAL_NODES,
        path: item.path,
      });
      break; // Stop traversal to avoid runaway
    }

    // Depth check -- applies to ALL nodes (primitives and containers),
    // matching assertJsonSafeIterative() semantics. A primitive leaf at
    // depth 33 is a violation even though it has no children to descend into.
    if (item.depth > KERNEL_CONSTRAINTS.MAX_NESTED_DEPTH) {
      violations.push({
        constraint: 'MAX_NESTED_DEPTH',
        actual: item.depth,
        limit: KERNEL_CONSTRAINTS.MAX_NESTED_DEPTH,
        path: item.path,
      });
      continue; // Don't descend further (no-op for primitives, prevents deeper nesting for containers)
    }

    // Primitives
    if (item.value === null || typeof item.value !== 'object') {
      if (typeof item.value === 'string') {
        // Use .length (code units) to match assertJsonSafeIterative semantics
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

    // Arrays
    if (Array.isArray(item.value)) {
      if (item.value.length > KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH) {
        violations.push({
          constraint: 'MAX_ARRAY_LENGTH',
          actual: item.value.length,
          limit: KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH,
          path: item.path,
        });
      }
      // Push all elements to stack (aligned with assertJsonSafeIterative)
      for (let i = item.value.length - 1; i >= 0; i--) {
        stack.push({
          value: item.value[i],
          depth: item.depth + 1,
          path: `${item.path}[${i}]`,
        });
      }
      continue;
    }

    // Objects
    const keys = Object.keys(item.value as Record<string, unknown>);
    if (keys.length > KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS) {
      violations.push({
        constraint: 'MAX_OBJECT_KEYS',
        actual: keys.length,
        limit: KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS,
        path: item.path,
      });
    }
    // Push all values to stack (aligned with assertJsonSafeIterative)
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
