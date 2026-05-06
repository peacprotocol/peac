# cli-execution parity corpus

Six positive deterministic JSON observation payloads pinning the canonical CLI execution observation shapes that conformance MUST accept.

Every vector here is INTERNALLY VALID against `CliExecutionSchema` (exported from `@peac/schema`). Negative / semantic-rejection cases (path-leak, raw-without-unsafe, env-not-in-allowlist, stream-ref inconsistency, shell_mode without shell_ref, etc.) live in the schema validator tests at `packages/schema/__tests__/extensions/cli-execution.test.ts`. The corpus does not encode "invalid but accepted" cases.

| Vector                                 | Coverage                                                                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ce-001-minimal-hashed`                | CLI-EXEC-001: minimal hashed observation; canonical type URI; `surface.kind = cli`; child exit 0                                                                                  |
| `ce-002-non-zero-exit`                 | CLI-EXEC-002: child exits non-zero; record IS still emitted; `exit_code_mode = child` mirrors child exit                                                                          |
| `ce-003-timeout-emitted`               | CLI-EXEC-003: wrapper sent SIGTERM after `--timeout-ms` elapsed; record IS still emitted; `timed_out = true`; `termination_signal` recorded; POSIX `128 + signal-num` exit code   |
| `ce-004-shell-mode-acknowledged`       | CLI-EXEC-004: `shell_mode = true` + `binary.shell_ref = binary.path_sha256` (canonical-digest equivalence) + `binary.path_mode != none` (biconditional + path-mode preconditions) |
| `ce-005-raw-capture-secret-suppressed` | CLI-EXEC-005: raw capture is double-opted-in; secret-scan suppressed the stdout sample; `sample_suppressed_reason` + `matched_pattern_category` recorded; `sample_base64` absent  |
| `ce-006-env-allowlist-hashed`          | CLI-EXEC-006: env entry under hashed mode with `value_sha256` only; key is in `capture_policy.env_allowlist`; subset constraint satisfied                                         |

The full CLI subcommand contract is specified in [`docs/specs/CLI-CARRIER-PROFILE.md`](../../../../docs/specs/CLI-CARRIER-PROFILE.md).
