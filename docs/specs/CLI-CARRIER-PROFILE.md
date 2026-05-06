# CLI Carrier Profile

**Version:** 0.1
**Status:** Normative
**Package:** `@peac/cli`, `@peac/schema`
**Extension URI:** `org.peacprotocol/cli-execution`
**Record Type URI:** `org.peacprotocol/cli-command-execution`
**Depends on:** Evidence Carrier Contract (DD-124), Wire 0.2 Interaction Record (`interaction-record+jwt`)

This document specifies how PEAC records observational evidence of a local command execution wrapped by the `peac observe command` and `peac record command` subcommands. The carrier emits a single record type containing a structured observation of a child process: its program, argv, stdin/stdout/stderr digests, exit code, signal, timing, and capture policy.

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 (RFC 2119, RFC 8174) when, and only when, they appear in all capitals, as shown here.

## 1. Status, Scope, and Boundaries

PEAC command-execution records are an OBSERVER. They record what a child process did from outside, with a privacy-preserving default capture policy. They are NOT:

- a sandbox
- a permission system
- a process supervisor
- a malware containment mechanism
- a job scheduler
- a secret manager
- a runtime policy enforcement layer
- a shell orchestrator

Operators retain all responsibility for upstream authorization, sandboxing, secret handling, scheduling, and policy enforcement.

Environment-capture policy controls what PEAC RECORDS, not what environment the child process RECEIVES. By default the child inherits the parent process environment per Node's `child_process` spawn semantics. This profile introduces no execution-env mutation. Future profiles MAY define execution-env controls under a separate flag namespace.

PEAC NEVER synthesizes shell syntax. The command after `--` is spawned exactly as supplied via `child_process.spawn(prog, args, { shell: false })`. The `--shell-mode` flag is an acknowledgement that the user intentionally invoked a shell binary; it does NOT cause the wrapper to rewrite the command, prepend `<shell> -c`, or use `child_process.exec()`.

## 2. Subcommands

### 2.1 `peac observe command`

Wraps a child process and emits an UNSIGNED CLI execution observation as JSON to stdout (or `--output <file>`). The emitted JSON is the observation object as defined in §3 (the inner record body, not the Wire 0.2 envelope).

### 2.2 `peac record command`

Wraps a child process, builds the same observation as `observe command`, and emits a Wire 0.2 compact JWS (`typ: interaction-record+jwt`) with the observation placed under `payload.extensions["org.peacprotocol/cli-execution"]`. The Wire 0.2 envelope MUST carry:

- `payload.iss` set from `--issuer-id`
- `payload.kind = "evidence"`
- `payload.type = "org.peacprotocol/cli-command-execution"`
- `payload.extensions["org.peacprotocol/cli-execution"]` containing the observation object defined in §3

## 3. Observation Schema

The observation object is the value of `payload.extensions["org.peacprotocol/cli-execution"]` (record command) or the entire emitted JSON document (observe command). It MUST validate against `CliExecutionSchema` from `@peac/schema`.

### 3.1 Top-level fields

| Field                | Type              | Requirement | Notes                                                                                 |
| -------------------- | ----------------- | ----------- | ------------------------------------------------------------------------------------- |
| `type`               | string            | REQUIRED    | Always `"org.peacprotocol/cli-command-execution"`                                     |
| `surface`            | object            | REQUIRED    | `{ "kind": "cli" }`                                                                   |
| `command`            | object            | REQUIRED    | See §3.2                                                                              |
| `cwd`                | object            | REQUIRED    | See §3.3                                                                              |
| `binary`             | object            | REQUIRED    | See §3.4                                                                              |
| `stdin_ref`          | object            | REQUIRED    | See §3.5                                                                              |
| `stdout_ref`         | object            | REQUIRED    | See §3.6                                                                              |
| `stderr_ref`         | object            | REQUIRED    | See §3.6                                                                              |
| `env`                | object            | REQUIRED    | See §3.7                                                                              |
| `started_at`         | string (RFC 3339) | REQUIRED    | UTC timestamp at spawn                                                                |
| `finished_at`        | string (RFC 3339) | REQUIRED    | UTC timestamp after wait                                                              |
| `duration_ms`        | integer           | REQUIRED    | Non-negative integer                                                                  |
| `exit_code`          | integer           | REQUIRED    | Child exit code (POSIX `128+sig` for signal exits)                                    |
| `signal`             | string            | OPTIONAL    | OS-reported child exit signal                                                         |
| `timed_out`          | boolean           | REQUIRED    | true if the wrapper sent termination signals because `--timeout-ms` elapsed           |
| `timeout_ms`         | integer           | REQUIRED    | Configured wrapper timeout                                                            |
| `kill_grace_ms`      | integer           | REQUIRED    | Configured SIGTERM-to-SIGKILL grace                                                   |
| `termination_signal` | string            | OPTIONAL    | Signal sent BY THE WRAPPER after timeout (distinct from `signal`)                     |
| `exit_code_mode`     | enum              | REQUIRED    | `"child"` or `"record"`                                                               |
| `shell_mode`         | boolean           | REQUIRED    | true if `--shell-mode` was supplied                                                   |
| `execution_mode`     | enum              | REQUIRED    | One of `deterministic_script`, `templated_flow`, `agent_loop`, `human_step`, `hybrid` |
| `capture_policy`     | object            | REQUIRED    | See §3.8                                                                              |
| `platform`           | object            | REQUIRED    | `{ "os", "arch", "peac_cli_version" }`                                                |
| `policy_digest`      | string            | OPTIONAL    | `sha256:<64 hex>`                                                                     |
| `config_digest`      | string            | OPTIONAL    | `sha256:<64 hex>`                                                                     |
| `approval_ref`       | string            | OPTIONAL    | Opaque-reference grammar (`ref:` / `urn:` / `did:` / `sha256:` / `peac:` / `https:`)  |

### 3.2 `command`

Discriminated by `argv_mode`:

- `argv_mode = "hashed"` (default): `command.argv_sha256` (sha256 digest of the JSON-canonical argv array) is REQUIRED. `command.argv` MUST be absent.
- `argv_mode = "redacted"`: `command.argv` (array of strings) is REQUIRED. Only structural tokens are preserved (long-flag form `--flag-name`, short-flag form `-f`, GNU `--` end-of-options marker). All other tokens are replaced with `<redacted:N>` where `N` is the UTF-8 byte length. `--key=value` tokens preserve `--key=` and redact only the value portion.
- `argv_mode = "raw"`: `command.argv` (array of strings) is REQUIRED, capped at `--capture-argv-bytes` per token (raw mode hard-fails on oversized tokens with `cli.argv_token_too_long`; raw mode never silently truncates). Secret-scan suppression replaces token text with `<secret-suppressed:CATEGORY>`. Requires `--capture-mode raw` AND `--unsafe-allow-raw-capture`.

`command.program` MUST be the basename of the user-supplied program token (no `/` or `\`). Path disclosure is governed exclusively by `--capture-binary-path` and surfaces only under `binary.path_*`.

### 3.3 `cwd`

Discriminated by `cwd_mode`:

- `cwd_mode = "none"`: no cwd field other than the discriminator
- `cwd_mode = "hashed"` (default): `cwd_sha256` REQUIRED
- `cwd_mode = "basename"`: `cwd_basename` REQUIRED
- `cwd_mode = "absolute"`: `cwd_absolute` REQUIRED

### 3.4 `binary`

Discriminated by `path_mode`, plus optional stat metadata + content digest:

- `path_mode = "none"`: no path fields other than the discriminator
- `path_mode = "hashed"` (default): `path_sha256` REQUIRED
- `path_mode = "absolute"`: `path_absolute` REQUIRED

Stat metadata (`size_bytes`, `mode_octal`, `sha256` of binary content) MAY appear regardless of `path_mode` when the resolved path is a regular file. `version` (string ≤ 64 bytes) is OPTIONAL.

`shell_ref` MUST be a `Sha256DigestSchema` (sha256 digest); it MUST be present iff `shell_mode = true`. Under `path_mode = "hashed"`, `shell_ref` MUST equal `binary.path_sha256` so the shell reference has a single canonical digest with a well-defined input.

### 3.5 `stdin_ref`

Discriminated by `mode`:

- `mode = "none"` (default): no other fields. Child stdin is closed; the wrapper does not read parent stdin.
- `mode = "length-only"`: `length` (integer), `truncated` (boolean) REQUIRED.
- `mode = "hashed"`: `length` (integer), `sha256` (string), `truncated` (boolean) REQUIRED.

NEVER any stdin sample under any mode. NEVER a raw mode for stdin.

### 3.6 `stdout_ref` / `stderr_ref`

Always include `length`, `sha256`, `truncated`. Sample fields appear ONLY when raw capture is double-opted-in:

- `sample_base64` MUST be valid canonical base64 and decoded length MUST NOT exceed the matching `capture_policy.{stdout_max_bytes,stderr_max_bytes}` cap.
- `sample_base64` requires `capture_policy.raw_capture_unsafely_allowed = true`.
- `sample_base64` and `sample_suppressed_reason` are mutually exclusive.
- `matched_pattern_category` requires `sample_suppressed_reason` and vice versa.
- `sample_suppressed_reason = "secret_pattern_detected"` when the secret-scan suppresses an emitted sample.

### 3.7 `env`

`env.mode` is `"hashed"` (default) or `"raw"`. `env.entries` is a record keyed by env var name.

- `mode = "hashed"`: every entry MUST have `value_sha256` and MUST NOT have `value`.
- `mode = "raw"`: every entry MUST have `value` and MUST NOT have `value_sha256`. Requires `--env-mode raw` AND `--unsafe-allow-raw-env`.

`Object.keys(env.entries)` MUST be a subset of `capture_policy.env_allowlist`.

### 3.8 `capture_policy`

Records the exact capture configuration so downstream verifiers can audit the policy without re-running the child. Includes:

```text
stdout_max_bytes, stderr_max_bytes, argv_max_bytes, env_allowlist,
stdin_mode, cwd_mode, binary_path_mode,
secret_scan, raw_capture_unsafely_allowed, raw_env_unsafely_allowed,
secret_scan_disabled_unsafely,
timeout_ms, kill_grace_ms, exit_code_mode
```

Mode discriminators in `capture_policy` MUST equal the corresponding top-level discriminators (`stdin_mode`, `cwd_mode`, `binary_path_mode`, `exit_code_mode`).

## 4. Security Defaults (hard)

The wrapper enforces these defaults BEFORE the child runs and rejects unsafe combinations at preflight time:

- argv hashed by default
- stdout/stderr default to `length + sha256 + truncated` only; `sample_base64` is emitted only when `--capture-mode raw` AND `--unsafe-allow-raw-capture` are both set
- stdin defaults to `none`; raw stdin capture is not a supported mode
- env capture deny-by-default; values hashed unless `--env-mode raw` AND `--unsafe-allow-raw-env`
- cwd hashed-by-default; binary path hashed-by-default
- secret-scan ON by default; disabling under raw capture requires `--secret-scan off` AND `--unsafe-disable-secret-scan` (third unsafe flag)
- shell-binary detected (sh / bash / zsh / dash / fish / pwsh / cmd) without `--shell-mode` is a hard fail

## 5. Signing UX (`record command` only)

Required flags:

```text
--issuer-id <canonical issuer URL>
```

The issuer URL MUST be canonical (https:// ASCII origin or did: identifier). The wrapper preflights the canonical form using `isCanonicalIss` from `@peac/schema`; non-canonical issuer IDs hard-fail with `cli.issuer_id_invalid` BEFORE the child runs.

Exactly one signing input is REQUIRED:

```text
--issuer-key <env:VAR_NAME | file:/path>
--unsafe-ephemeral-key
```

The `--issuer-key` reference points at an Ed25519 private JWK:

```json
{
  "kty": "OKP",
  "crv": "Ed25519",
  "x": "<base64url public key>",
  "d": "<base64url private key>",
  "kid": "optional"
}
```

`kid` is extracted from the JWK if present; otherwise derived from the public key as `sha256(base64url(publicKey)).slice(0,16)`. The loader rejects malformed schemes, missing files, missing env vars, non-Ed25519 JWKs, malformed base64url in `x` or `d`, and JWKs whose `d` does not derive to `x`.

`--unsafe-ephemeral-key` generates an ephemeral local signing key. The public key is NOT published through normal issuer-key discovery; use only for local development and tests. `--issuer-id` is still REQUIRED in ephemeral mode because the record carries a canonical issuer identity regardless of key discoverability.

`--issuer-key` and `--unsafe-ephemeral-key` are mutually exclusive.

### 5.1 Issuer-key reference convention

The implementation reuses the existing PEAC issuer-key reference convention (`env:VAR_NAME` / `file:/path`) used by other PEAC tools. No new key-material interface or signing envelope is introduced; signing routes through `@peac/protocol.issue()` with `kind: "evidence"` and `type: CLI_COMMAND_EXECUTION_TYPE`. The loader lives in `@peac/cli/src/lib/issuer-key-loader.ts` so the CLI carries the convention without depending on any other workspace package.

## 6. Exit-code Behavior

`--exit-code-mode child` (default): the wrapper exits with the child's exit code (or `128 + signal-num` for POSIX signal exits). Wrapper validation, capture, key-load, output-write, and signing failures exit `2` regardless of mode and emit no record.

`--exit-code-mode record`: the wrapper exits `0` if and only if the record was emitted successfully. The child's exit code is preserved INSIDE the record under `exit_code`.

If the child exits non-zero but capture/signing succeed, the record is STILL emitted.

## 7. Output Discipline

`--output -` (default): emit the record (JSON for observe command; compact JWS for record command) to stdout.

`--output <file>`: write the record to `<file>`. The wrapper preflights writability BEFORE running the child via an open/close probe on the parent directory; an unwritable target hard-fails with `cli.output_write_failed` and the child does not run.

## 8. Resource Limits

See `docs/specs/RESOURCE-LIMITS.md` §"CLI capture limits" for the canonical caps. Summary:

| Cap                      | Default           | Max             |
| ------------------------ | ----------------- | --------------- |
| `--capture-stdout-bytes` | 16384             | 65536           |
| `--capture-stderr-bytes` | 16384             | 65536           |
| `--capture-argv-bytes`   | 4096              | 16384           |
| `--env-allow` entries    | (deny by default) | 32              |
| `--timeout-ms`           | 600000 (10 min)   | 86400000 (24 h) |
| `--kill-grace-ms`        | 5000 (5 s)        | 60000 (60 s)    |

All numeric flags reject `NaN` / non-integer / out-of-range with `cli.out_of_range`.

## 9. Errors

The CLI subcommands surface the following stable diagnostic codes via stderr (with non-zero exit). These are CLI wrapper diagnostics; they are NOT PEAC wire / protocol error codes (which use the `E_*` namespace and live in `specs/kernel/errors.json`).

| Code                                           | When emitted                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `cli.program_required`                         | No program supplied after `--`                                                                    |
| `cli.unsafe_flag_required`                     | A raw mode requested without its `--unsafe-*` companion                                           |
| `cli.secret_scan_disable_requires_unsafe_flag` | `--secret-scan off` under raw capture without `--unsafe-disable-secret-scan`                      |
| `cli.shell_mode_required`                      | Shell binary detected without `--shell-mode`, or `--shell-mode` with `--capture-binary-path none` |
| `cli.argv_token_too_long`                      | Raw argv token exceeds `--capture-argv-bytes`                                                     |
| `cli.out_of_range`                             | Numeric flag is `NaN` / non-integer / outside its range                                           |
| `cli.invalid_env_key`                          | `--env-allow` key fails the env-key grammar or byte cap                                           |
| `cli.invalid_policy_digest`                    | `--policy-digest` not in `sha256:<64 hex>` form                                                   |
| `cli.invalid_config_digest`                    | `--config-digest` not in `sha256:<64 hex>` form                                                   |
| `cli.invalid_approval_ref`                     | `--approval-ref` does not satisfy the opaque-reference grammar                                    |
| `cli.spawn_failed`                             | Child failed to spawn (ENOENT / EACCES / etc.)                                                    |
| `cli.output_write_failed`                      | `--output` target is unwritable (preflight) or write failed                                       |
| `cli.signing_input_required`                   | (record command) Missing both `--issuer-key` and `--unsafe-ephemeral-key`                         |
| `cli.signing_input_conflict`                   | (record command) Both `--issuer-key` and `--unsafe-ephemeral-key` supplied                        |
| `cli.issuer_id_required`                       | (record command) `--issuer-id` missing                                                            |
| `cli.issuer_id_invalid`                        | (record command) `--issuer-id` is not canonical (preflight)                                       |
| `cli.issuer_key_load_failed`                   | (record command) `--issuer-key` reference cannot be loaded                                        |
| `cli.issuer_key_invalid`                       | (record command) JWK structurally invalid (kty/crv/x/d, base64url, mismatched x/d)                |
| `cli.signing_failed`                           | (record command) `@peac/protocol.issue()` rejected the record                                     |

## 10. Platform Notes

This profile is POSIX-first. Windows behavior is NOT guaranteed by the current CLI carrier profile; future revisions MAY add Windows CI coverage and document any deviations.

## 11. Conformance

See `specs/conformance/parity-corpus/cli-execution/` for canonical positive and negative fixtures. Conformance Section 29 (`CLI-EXEC-001..006`) covers schema-shape semantics deterministically: fixtures are JSON observation objects evaluated by the validator-layer tests. Conformance does NOT require running real child processes.

## 12. Examples

### 12.1 Minimal hashed observation (observe command output)

```json
{
  "type": "org.peacprotocol/cli-command-execution",
  "surface": { "kind": "cli" },
  "command": {
    "program": "node",
    "argv_mode": "hashed",
    "argv_sha256": "sha256:...",
    "argv_token_count": 3
  },
  "cwd": { "cwd_mode": "hashed", "cwd_sha256": "sha256:..." },
  "binary": {
    "path_mode": "hashed",
    "path_sha256": "sha256:...",
    "size_bytes": 12345,
    "mode_octal": "0755",
    "sha256": "sha256:..."
  },
  "stdin_ref": { "mode": "none" },
  "stdout_ref": { "length": 5, "sha256": "sha256:...", "truncated": false },
  "stderr_ref": { "length": 0, "sha256": "sha256:...", "truncated": false },
  "env": { "mode": "hashed", "entries": {} },
  "started_at": "2026-01-01T00:00:00Z",
  "finished_at": "2026-01-01T00:00:01Z",
  "duration_ms": 1000,
  "exit_code": 0,
  "timed_out": false,
  "timeout_ms": 600000,
  "kill_grace_ms": 5000,
  "exit_code_mode": "child",
  "shell_mode": false,
  "execution_mode": "deterministic_script",
  "capture_policy": {
    "stdout_max_bytes": 16384,
    "stderr_max_bytes": 16384,
    "argv_max_bytes": 4096,
    "env_allowlist": [],
    "stdin_mode": "none",
    "cwd_mode": "hashed",
    "binary_path_mode": "hashed",
    "secret_scan": true,
    "raw_capture_unsafely_allowed": false,
    "raw_env_unsafely_allowed": false,
    "secret_scan_disabled_unsafely": false,
    "timeout_ms": 600000,
    "kill_grace_ms": 5000,
    "exit_code_mode": "child"
  },
  "platform": { "os": "linux", "arch": "x64", "peac_cli_version": "0.14.0" }
}
```

### 12.2 Signed record (record command output, decoded payload)

`record command` emits a compact JWS. The decoded payload places the same observation under `payload.extensions["org.peacprotocol/cli-execution"]`:

```json
{
  "iss": "https://issuer.example",
  "kind": "evidence",
  "type": "org.peacprotocol/cli-command-execution",
  "iat": 1735689600,
  "jti": "...",
  "extensions": {
    "org.peacprotocol/cli-execution": { "...": "...observation..." }
  }
}
```

JWS header:

```json
{ "alg": "EdDSA", "typ": "interaction-record+jwt", "kid": "..." }
```
