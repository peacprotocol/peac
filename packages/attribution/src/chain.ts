/**
 * Attribution Chain Verification (v0.9.26+)
 *
 * Utilities for traversing and verifying attribution chains.
 */
import {
  ATTRIBUTION_LIMITS,
  type AttributionAttestation,
  type AttributionSource,
  type ChainVerificationResult,
} from '@peac/schema';
import {
  createCircularChainError,
  createChainTooDeepError,
  createTooManySourcesError,
  createResolutionFailedError,
  createResolutionTimeoutError,
} from './errors.js';

/**
 * Receipt resolver function type.
 *
 * Implementations should fetch the receipt and extract its AttributionAttestation
 * if it contains one.
 */
export type ReceiptResolver = (receiptRef: string) => Promise<AttributionAttestation | null>;

/**
 * Chain verification options.
 */
export interface ChainVerificationOptions {
  /** Maximum chain depth (default: ATTRIBUTION_LIMITS.maxDepth) */
  maxDepth?: number;

  /** Maximum total sources across chain (default: ATTRIBUTION_LIMITS.maxSources * maxDepth) */
  maxTotalSources?: number;

  /** Per-hop resolution timeout in ms (default: ATTRIBUTION_LIMITS.resolutionTimeout) */
  resolutionTimeout?: number;

  /** Receipt resolver function (required for recursive verification) */
  resolver?: ReceiptResolver;
}

/**
 * Detect cycles in a set of attribution sources.
 *
 * @param sources - Sources to check
 * @param visited - Set of already-visited receipt refs
 * @returns Receipt ref that caused cycle, or undefined if no cycle
 */
export function detectCycle(
  sources: AttributionSource[],
  visited: Set<string>
): string | undefined {
  for (const source of sources) {
    if (visited.has(source.receipt_ref)) {
      return source.receipt_ref;
    }
  }
  return undefined;
}

/**
 * Verify an attribution chain starting from the given attestation.
 *
 * This performs iterative (non-recursive) verification to prevent stack overflow.
 * Uses a work queue to process each attestation in the chain.
 *
 * @param attestation - Root attestation to verify
 * @param options - Verification options
 * @returns Chain verification result
 *
 * @example
 * ```typescript
 * const result = await verifyChain(attestation, {
 *   resolver: async (ref) => {
 *     // Fetch and parse the referenced receipt
 *     const receipt = await fetchReceipt(ref);
 *     return extractAttribution(receipt);
 *   },
 * });
 *
 * if (!result.valid) {
 *   console.error('Chain verification failed:', result.error);
 * }
 * ```
 */
export async function verifyChain(
  attestation: AttributionAttestation,
  options: ChainVerificationOptions = {}
): Promise<ChainVerificationResult> {
  const maxDepth = options.maxDepth ?? ATTRIBUTION_LIMITS.maxDepth;
  const maxTotalSources = options.maxTotalSources ?? ATTRIBUTION_LIMITS.maxSources * maxDepth;
  const resolutionTimeout = options.resolutionTimeout ?? ATTRIBUTION_LIMITS.resolutionTimeout;
  const resolver = options.resolver;

  // Track visited receipt refs to detect cycles
  const visited = new Set<string>();

  // Track total sources across the chain
  let totalSources = 0;

  // Track maximum depth encountered
  let maxDepthEncountered = 0;

  // Work queue: (attestation, depth)
  const queue: Array<{ attestation: AttributionAttestation; depth: number }> = [
    { attestation, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const { attestation: currentAttestation, depth } = current;

    // Check depth limit
    if (depth > maxDepth) {
      const error = createChainTooDeepError(depth, maxDepth);
      return {
        valid: false,
        maxDepth: depth,
        totalSources,
        error: error.remediation,
      };
    }

    maxDepthEncountered = Math.max(maxDepthEncountered, depth);

    const sources = currentAttestation.evidence.sources;

    // Check for cycles
    const cycleRef = detectCycle(sources, visited);
    if (cycleRef) {
      const error = createCircularChainError(cycleRef);
      return {
        valid: false,
        maxDepth: maxDepthEncountered,
        totalSources,
        cycleDetected: cycleRef,
        error: error.remediation,
      };
    }

    // Add sources to visited and count
    for (const source of sources) {
      visited.add(source.receipt_ref);
      totalSources++;

      // Check total sources limit
      if (totalSources > maxTotalSources) {
        const error = createTooManySourcesError(totalSources, maxTotalSources);
        return {
          valid: false,
          maxDepth: maxDepthEncountered,
          totalSources,
          error: error.remediation,
        };
      }
    }

    // If resolver is provided, resolve and queue child attestations
    if (resolver && depth < maxDepth) {
      for (const source of sources) {
        try {
          // Apply timeout
          const resolvePromise = resolver(source.receipt_ref);
          const timeoutPromise = new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), resolutionTimeout)
          );

          const childAttestation = await Promise.race([resolvePromise, timeoutPromise]);

          if (childAttestation) {
            queue.push({ attestation: childAttestation, depth: depth + 1 });
          }
        } catch (err) {
          if (err instanceof Error && err.message === 'timeout') {
            const error = createResolutionTimeoutError(source.receipt_ref, resolutionTimeout);
            return {
              valid: false,
              maxDepth: maxDepthEncountered,
              totalSources,
              error: error.remediation,
            };
          }

          const error = createResolutionFailedError(
            source.receipt_ref,
            err instanceof Error ? err.message : 'Unknown error'
          );
          return {
            valid: false,
            maxDepth: maxDepthEncountered,
            totalSources,
            error: error.remediation,
          };
        }
      }
    }
  }

  return {
    valid: true,
    maxDepth: maxDepthEncountered,
    totalSources,
  };
}

/**
 * Collect all receipt references in an attribution chain.
 *
 * This performs a shallow collection without resolving references.
 * Useful for batch resolution or caching.
 *
 * @param attestation - Root attestation
 * @returns Array of unique receipt references
 */
export function collectReceiptRefs(attestation: AttributionAttestation): string[] {
  const refs = new Set<string>();
  for (const source of attestation.evidence.sources) {
    refs.add(source.receipt_ref);
  }
  return Array.from(refs);
}

/**
 * Flatten an attribution chain into a list of all sources.
 *
 * Requires a resolver to traverse the chain.
 *
 * @param attestation - Root attestation
 * @param resolver - Receipt resolver function
 * @param options - Verification options
 * @returns Array of all sources in the chain
 */
export async function flattenChain(
  attestation: AttributionAttestation,
  resolver: ReceiptResolver,
  options: ChainVerificationOptions = {}
): Promise<{ sources: AttributionSource[]; depth: number }> {
  const maxDepth = options.maxDepth ?? ATTRIBUTION_LIMITS.maxDepth;
  const resolutionTimeout = options.resolutionTimeout ?? ATTRIBUTION_LIMITS.resolutionTimeout;

  const allSources: AttributionSource[] = [];
  const visited = new Set<string>();
  let maxDepthEncountered = 0;

  // Work queue
  const queue: Array<{ sources: AttributionSource[]; depth: number }> = [
    { sources: attestation.evidence.sources, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const { sources, depth } = current;

    if (depth > maxDepth) {
      break; // Stop at max depth
    }

    maxDepthEncountered = Math.max(maxDepthEncountered, depth);

    for (const source of sources) {
      if (visited.has(source.receipt_ref)) {
        continue; // Skip cycles
      }

      visited.add(source.receipt_ref);
      allSources.push(source);

      if (depth < maxDepth) {
        try {
          const resolvePromise = resolver(source.receipt_ref);
          const timeoutPromise = new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), resolutionTimeout)
          );

          const childAttestation = await Promise.race([resolvePromise, timeoutPromise]);

          if (childAttestation) {
            queue.push({ sources: childAttestation.evidence.sources, depth: depth + 1 });
          }
        } catch {
          // Continue on resolution errors
        }
      }
    }
  }

  return { sources: allSources, depth: maxDepthEncountered };
}
