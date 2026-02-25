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

## What's Included

| File                        | Purpose                                                                        |
| --------------------------- | ------------------------------------------------------------------------------ |
| `claude-code/peac/SKILL.md` | Claude Code skill: receipt operations (verify, issue, inspect, decode, bundle) |
| `cursor/peac.mdc`           | Cursor rules: import patterns, API examples, layering, conventions             |

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
