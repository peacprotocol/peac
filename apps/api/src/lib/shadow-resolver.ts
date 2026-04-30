// Internal-only. Lazy-loads @peac/resolver-http when PEAC_INTERNAL_SHADOW_RESOLVER=1.
// Default OFF: with the flag unset the resolver-http module is never imported, so
// the primary verify path retains its v0.13.1 dependency footprint.
//
// Stability: internal-only, unstable, not part of the public surface. The flag,
// the module path, and the exported helpers may change or be removed without a
// deprecation cycle. Do not script against any of this from outside apps/api.

let resolverHttpModule: typeof import('@peac/resolver-http') | null = null;

export function isShadowResolverEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PEAC_INTERNAL_SHADOW_RESOLVER === '1';
}

export async function loadShadowResolver(): Promise<typeof import('@peac/resolver-http')> {
  if (resolverHttpModule === null) {
    resolverHttpModule = await import('@peac/resolver-http');
  }
  return resolverHttpModule;
}

export function resetShadowResolverForTests(): void {
  resolverHttpModule = null;
}
