/**
 * Commands of the published `peac` bin (@peac/cli) that the user-facing docs
 * describe (packages/cli/README.md, docs/README_LONG.md, docs/START_HERE.md and
 * the CLI command table in docs/STABILITY-CONTRACT.md).
 *
 * Keys are top-level commands; each value lists the documented subcommands of
 * that command (empty when the command takes arguments directly).
 *
 * Consumers:
 *   - scripts/release/pack-install-smoke.mjs runs the bin installed from the
 *     packed tarball and checks that it lists every command here.
 *   - tests/tooling/cli-bin-surface.test.ts runs the same check against the
 *     built workspace bin.
 */

export const CLI_DOCUMENTED_COMMANDS = Object.freeze({
  verify: [],
  'validate-issuer': [],
  decode: [],
  policy: ['init', 'validate', 'explain', 'generate', 'list-profiles', 'show-profile'],
  conformance: ['run', 'list'],
  samples: ['list', 'show', 'generate'],
  reconcile: [],
  observe: ['command'],
  record: ['command'],
  emit: ['lifecycle'],
  doctor: [],
  discover: [],
  bundle: ['create', 'verify'],
});

/**
 * Extract command names from commander `--help` output.
 *
 * Reads the lines under the `Commands:` heading up to the next blank line.
 * A command line starts with exactly two spaces followed by the name; wrapped
 * description lines are indented further and are skipped. Aliases written as
 * `name|alias` yield both names.
 *
 * @param {string} helpText
 * @returns {string[]}
 */
export function parseHelpCommands(helpText) {
  const lines = String(helpText).split(/\r?\n/);
  const start = lines.findIndex((line) => /^Commands:\s*$/.test(line));
  if (start === -1) return [];
  const names = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') break;
    const match = /^ {2}([^\s[<]+)/.exec(line);
    if (!match) continue;
    names.push(...match[1].split('|'));
  }
  return names;
}

/**
 * Compare `--help` output against the documented command map.
 *
 * @param {(args: string[]) => string} runHelp returns the `--help` output for
 *   the given command path (an empty array means the top-level help)
 * @returns {string[]} documented commands missing from the help output, as
 *   space-separated command paths (empty when every command is listed)
 */
export function findMissingDocumentedCommands(runHelp) {
  const missing = [];
  const topLevel = new Set(parseHelpCommands(runHelp([])));
  for (const [command, subcommands] of Object.entries(CLI_DOCUMENTED_COMMANDS)) {
    if (!topLevel.has(command)) {
      missing.push(command);
      continue;
    }
    if (subcommands.length === 0) continue;
    const listed = new Set(parseHelpCommands(runHelp([command])));
    for (const sub of subcommands) {
      if (!listed.has(sub)) missing.push(`${command} ${sub}`);
    }
  }
  return missing;
}
