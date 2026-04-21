/**
 * Root-level vitest setup: silence expected PEAC deprecation warnings.
 *
 * v0.12.14 introduces two deprecation codes that many tests legitimately
 * trigger (`PEAC_DEPRECATED_PREF` on every `PrefResolver` instantiation,
 * `PEAC_LEGACY_PEAC_TXT_KEY_FIELD` on every peac.txt parse that includes a
 * legacy key-discovery line). The behaviour itself is covered by dedicated
 * assertion tests that spy on `process.emitWarning`. Letting the warnings
 * flow to stderr across the other ~7,600 tests floods CI logs and buries
 * real warnings.
 *
 * This setup removes Node's default `warning` listener and installs a
 * filter that swallows the two expected PEAC codes. Any other warning
 * still reaches stderr.
 */

const EXPECTED_PEAC_DEPRECATION_CODES = new Set([
  'PEAC_DEPRECATED_PREF',
  'PEAC_LEGACY_PEAC_TXT_KEY_FIELD',
]);

for (const listener of process.listeners('warning')) {
  process.off('warning', listener);
}

process.on('warning', (warning: NodeJS.ErrnoException & { code?: string }) => {
  if (warning.code && EXPECTED_PEAC_DEPRECATION_CODES.has(warning.code)) {
    return;
  }
  process.stderr.write(`(node:warning) ${warning.name}: ${warning.message}\n`);
});
