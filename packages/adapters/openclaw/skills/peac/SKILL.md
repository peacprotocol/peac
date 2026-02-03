# PEAC Receipts Skills

Slash commands for working with PEAC cryptographic receipts.

## /peac-status

Show the current status of PEAC receipt generation.

**Usage:**
```
/peac-status
```

**Output includes:**
- Spool status (pending entries, total captured, duplicates skipped)
- Receipt count and output directory
- Last and oldest receipt timestamps
- Emitter status (total emitted, errors, key ID)

---

## /peac-export

Export receipts as an audit bundle for review or dispute resolution.

**Usage:**
```
/peac-export [options]
```

**Options:**
- `--workflow <id>` - Filter by workflow ID
- `--since <timestamp>` - Include receipts since RFC 3339 timestamp
- `--until <timestamp>` - Include receipts until RFC 3339 timestamp
- `--output <path>` - Output path for bundle (default: auto-generated)

**Examples:**
```
/peac-export
/peac-export --workflow wf_abc123
/peac-export --since 2024-02-01T00:00:00Z --until 2024-02-02T00:00:00Z
```

---

## /peac-verify

Verify a receipt or bundle for correctness and signature validity.

**Usage:**
```
/peac-verify <path> [options]
```

**Options:**
- `--jwks <path>` - Path to JWKS file for signature verification

**Examples:**
```
/peac-verify ./receipts/r_abc123.peac.json
/peac-verify ./bundles/peac-bundle-2024-02-01 --jwks ./keys.jwks.json
```

**Verification includes:**
- Structure validation (auth, evidence blocks)
- Interaction evidence validation (required fields, timing invariants)
- Signature verification (when JWKS provided)

---

## /peac-query

Query receipts by various criteria.

**Usage:**
```
/peac-query [options]
```

**Options:**
- `--workflow <id>` - Filter by workflow ID
- `--tool <name>` - Filter by tool name
- `--status <status>` - Filter by result status (ok, error, timeout, canceled)
- `--since <timestamp>` - Filter by start time
- `--until <timestamp>` - Filter by end time
- `--limit <n>` - Maximum results (default: 100)
- `--offset <n>` - Skip results (for pagination)

**Examples:**
```
/peac-query --tool web_search
/peac-query --workflow wf_abc123 --status error
/peac-query --since 2024-02-01T00:00:00Z --limit 10
```

---

## Configuration

PEAC receipts are configured in your OpenClaw gateway config:

```json
{
  "plugins": {
    "entries": {
      "peac-receipts": {
        "enabled": true,
        "config": {
          "output_dir": ".peac/receipts",
          "signing": {
            "key_ref": "env:PEAC_SIGNING_KEY",
            "issuer": "https://my-org.example.com"
          },
          "capture": {
            "mode": "hash_only"
          }
        }
      }
    }
  }
}
```

### Signing Key Reference Formats

- `env:VAR_NAME` - Load from environment variable (development)
- `keychain:key-name` - Load from OS keychain (recommended)
- `sidecar:unix:///path` - Use sidecar signing service (enterprise)
- `file:/path` - Load from file (development only)

### Capture Modes

- `hash_only` - Never capture plaintext (default, recommended)
- `allowlist` - Capture plaintext for specified tools only

---

## What PEAC Receipts Prove

Each receipt provides cryptographic proof of:
- A tool call was recorded at a specific time
- Input/output content hashes (for later verification)
- Policy context at execution time
- Workflow correlation (related tool calls)
- Outcome (success, error, timeout)

Receipts are signed with your configured key, enabling:
- Offline verification without network access
- Dispute resolution with third parties
- Compliance audit trails
- Forensic analysis of agent behavior
