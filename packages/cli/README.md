# @peac/cli

PEAC protocol command-line tools.

## Installation

```bash
pnpm add -g @peac/cli
# or
npx @peac/cli
```

## Commands

### `peac verify <receipt>`

Verify a PEAC receipt (JWS compact serialization).

```bash
peac verify eyJhbGciOiJFZERTQSIs...
```

### `peac conformance run`

Run conformance tests against PEAC schema validators.

```bash
peac conformance run                          # Standard level, text output
peac conformance run --level full             # Full level
peac conformance run --output json            # JSON output
peac conformance run --output markdown        # Markdown report
peac conformance run --category claims        # Filter by category
peac conformance run --fixtures ./my-vectors  # Custom fixtures path
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--level` | `standard` | Conformance level: `basic`, `standard`, `full` |
| `--output` | `text` | Output format: `text`, `json`, `markdown` |
| `--category` | all | Filter by category (e.g., `claims`, `signature`, `time`) |
| `--fixtures` | built-in | Path to custom conformance fixtures |
| `--verbose` | `false` | Show detailed test output |

### `peac conformance list`

List available conformance test fixtures.

```bash
peac conformance list
peac conformance list --category claims
```

### `peac samples list`

List available sample receipts.

```bash
peac samples list
peac samples list --category valid
```

### `peac samples show <id>`

Display details of a specific sample receipt.

```bash
peac samples show basic-receipt
```

### `peac samples generate`

Generate sample receipt files.

```bash
peac samples generate --output ./samples
peac samples generate --format json
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--output` | `stdout` | Output directory for generated files |
| `--format` | `jws` | Format: `jws`, `json` |

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
