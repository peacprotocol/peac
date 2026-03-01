# PEAC Plugin Pack

Agent developer skills and IDE rules for working with PEAC Protocol receipts.

These are distribution artifacts (DD-139), not protocol code. They have zero runtime dependencies on `@peac/*` packages and are not published to npm.

## Claude Code

Copy the skill directory into your Claude Code configuration:

```bash
cp -r surfaces/plugin-pack/claude-code/peac ~/.claude/skills/peac
```

The skill provides receipt verification, issuance, inspection, and decode workflows via the PEAC MCP server.

Allowed tools: `Bash`, `Read` only (default-deny per DD-139).

## Cursor

Copy the rules file into your project's `.cursor/rules/` directory:

```bash
mkdir -p .cursor/rules
cp surfaces/plugin-pack/cursor/peac.mdc .cursor/rules/peac.mdc
```

The rules file provides import patterns, API usage examples, package layering guidance, and coding conventions for PEAC Protocol development.

## Continue.dev

Add the PEAC MCP server to your Continue config (`~/.continue/config.json`):

```json
{
  "mcpServers": [
    {
      "name": "peac",
      "command": "npx",
      "args": ["-y", "@peac/mcp-server"]
    }
  ]
}
```

A config snippet is available at `continue/peac.json`.

## Windsurf

Copy the rules file to your project root:

```bash
cp surfaces/plugin-pack/windsurf/peac.windsurfrules .windsurfrules
```

The rules file provides import patterns, API usage examples, package layering guidance, and coding conventions for PEAC Protocol development.

## OpenCode

Copy the config files to your project root:

```bash
cp surfaces/plugin-pack/opencode/opencode.jsonc opencode.jsonc
cp surfaces/plugin-pack/opencode/AGENTS.md AGENTS.md
```

The config registers the PEAC MCP server and provides agent context for receipt operations.

## What's Included

| File                                  | Purpose                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `claude-code/peac/SKILL.md`           | Claude Code skill: receipt operations (verify, issue, inspect, decode, bundle) |
| `claude-code/peac/verify-receipt.md`  | Claude Code skill: dedicated receipt verification workflow                     |
| `claude-code/peac/explain-receipt.md` | Claude Code skill: receipt decoding and explanation                            |
| `cursor/peac.mdc`                     | Cursor rules: import patterns, API examples, layering, conventions             |
| `continue/peac.json`                  | Continue.dev MCP server config snippet                                         |
| `windsurf/peac.windsurfrules`         | Windsurf rules: import patterns, API examples, layering, conventions           |
| `opencode/opencode.jsonc`             | OpenCode config: MCP server and agent setup                                    |
| `opencode/AGENTS.md`                  | OpenCode agent context: package layering, APIs, MCP tools                      |

## Security

- Skills use default-deny tool permissions (`Bash` and `Read` only).
- No `Write`, `WebFetch`, or execution tools are referenced.
- No vendor-specific names appear in skill or rule content.
- No credentials or API keys are embedded.

## References

- PEAC Protocol: https://www.peacprotocol.org
- GitHub: https://github.com/peacprotocol/peac
- MCP Server: `@peac/mcp-server` on npm
- Built by [Originary](https://www.originary.xyz)
