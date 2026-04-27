// Fixture: pass-through helper functions are not flagged by this verifier
// (pass-through wrappers are not part of the BLOCKED rule set; they would
// be addressed by a separate report-only structural verifier).
export function wrap<T>(value: T): T {
  return value;
}

export const passthrough = (input: string): string => input;
