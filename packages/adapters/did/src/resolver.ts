/**
 * DID Resolver interface and composite resolver.
 *
 * Pluggable resolver architecture: callers instantiate and configure
 * resolvers explicitly (DD-52: no ambient key discovery).
 */

import type { DIDResolutionResult } from './types.js';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Interface for DID resolvers.
 *
 * Each resolver handles one or more DID methods (e.g., ['key'], ['web']).
 * Resolution returns a W3C DID Resolution Result.
 */
export interface DIDResolver {
  /** DID methods this resolver handles (e.g., ['key'] for did:key) */
  readonly methods: readonly string[];
  /** Resolve a DID to its DID Document */
  resolve(did: string): Promise<DIDResolutionResult>;
}

// ---------------------------------------------------------------------------
// Composite Resolver
// ---------------------------------------------------------------------------

/**
 * Create a composite resolver that delegates to method-specific resolvers.
 *
 * Tries resolvers in order by method match. The first resolver whose
 * `methods` array includes the DID's method handles the resolution.
 *
 * @param resolvers - Array of method-specific resolvers
 * @returns A composite resolver that delegates by method
 */
export function createCompositeResolver(resolvers: DIDResolver[]): DIDResolver {
  return {
    methods: resolvers.flatMap((r) => [...r.methods]),

    async resolve(did: string): Promise<DIDResolutionResult> {
      const method = extractMethod(did);
      if (!method) {
        return {
          didDocument: null,
          didResolutionMetadata: { error: 'invalidDid' },
          didDocumentMetadata: {},
        };
      }

      for (const resolver of resolvers) {
        if (resolver.methods.includes(method)) {
          return resolver.resolve(did);
        }
      }

      return {
        didDocument: null,
        didResolutionMetadata: { error: 'methodNotSupported' },
        didDocumentMetadata: {},
      };
    },
  };
}

/**
 * Extract the method from a DID string (e.g., "key" from "did:key:z6Mk...").
 */
function extractMethod(did: string): string | null {
  if (!did.startsWith('did:')) return null;
  const parts = did.split(':');
  if (parts.length < 3) return null;
  return parts[1];
}
