/**
 * Vitest setup for @peac/pref: silences expected deprecation warnings so CI
 * output stays readable. The deprecation contract itself is covered by a
 * dedicated assertion test (`facade.test.ts` -> "fires PEAC_DEPRECATED_PREF
 * exactly once per process"). All other tests instantiate `PrefResolver`
 * for legitimate reasons and would otherwise flood CI logs with the
 * expected `PEAC_DEPRECATED_PREF` warning.
 *
 * Strategy: remove Node's default `warning` listener (which writes to
 * stderr) and install a filter that swallows `PEAC_DEPRECATED_PREF` and
 * `PEAC_LEGACY_PEAC_TXT_KEY_FIELD` warnings. Other warnings still reach
 * stderr via a fresh default-style listener, so unexpected warnings remain
 * visible.
 */

const EXPECTED_DEPRECATION_CODES = new Set([
  'PEAC_DEPRECATED_PREF',
  'PEAC_LEGACY_PEAC_TXT_KEY_FIELD',
]);

for (const listener of process.listeners('warning')) {
  process.off('warning', listener);
}

process.on('warning', (warning: NodeJS.ErrnoException & { code?: string }) => {
  if (warning.code && EXPECTED_DEPRECATION_CODES.has(warning.code)) {
    return; // swallowed in tests; behaviour is asserted elsewhere
  }
  // Preserve visibility of any unexpected warning.
  process.stderr.write(`(node:warning) ${warning.name}: ${warning.message}\n`);
});
