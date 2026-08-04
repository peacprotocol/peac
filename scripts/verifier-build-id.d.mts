/**
 * Type declarations for verifier-build-id.mjs.
 *
 * The resolver is plain ESM JavaScript because vite.config.ts and CI both import it directly, and a
 * build-identifier resolver must not itself depend on a build step. This declaration keeps its
 * consumers under `tsc --noEmit` instead of silently typed `any`.
 */
export type VerifierBuildMode = 'production' | 'development' | 'test';

export declare const DIGEST_ROOTS: readonly string[];
export declare function buildInputDigest(root?: string, mode?: VerifierBuildMode): string;
export declare const sourceTreeDigest: typeof buildInputDigest;
export declare function assertValidExplicitBuildId(id: unknown): string;
export declare function resolveVerifierBuild(opts?: {
  mode?: VerifierBuildMode;
  root?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): string;
