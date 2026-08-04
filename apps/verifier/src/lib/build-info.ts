/**
 * Build identifier.
 *
 * NOT user input: a caller must never be able to label a report with a build identifier unrelated
 * to the code that produced it. vite.config.ts resolves __PEAC_VERIFIER_BUILD__ from
 * PEAC_VERIFIER_BUILD or `git rev-parse HEAD`, and FAILS a production build if neither is
 * available -- so no silent "unknown" and no wall-clock value can enter a deterministic vector.
 */
declare const __PEAC_VERIFIER_BUILD__: string;

export function verifierBuildFromEnvironment(): string {
  return typeof __PEAC_VERIFIER_BUILD__ === 'string' ? __PEAC_VERIFIER_BUILD__ : '';
}
