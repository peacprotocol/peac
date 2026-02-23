# Security Policy

For vulnerability reporting, supported versions, and security practices, see the full security policy:

[`.github/SECURITY.md`](.github/SECURITY.md)

## Reporting a Vulnerability

Email: security@peacprotocol.org

Do not open a public issue for security vulnerabilities.

## Trojan Source Protection

This repository runs a fail-closed invisible/bidi Unicode scan (`scripts/find-invisible-unicode.mjs`)
on every CI run and local `guard.sh` invocation. The scanner rejects all dangerous Unicode categories
(bidi overrides, zero-width characters, invisible formatters) in tracked source files.

GitHub's diff view may show a "This file contains bidirectional Unicode text" banner on some files.
This is a heuristic warning and does not indicate a vulnerability when the repo's Trojan Source scan
passes. The scanner is the authoritative check.

## Dependency Audit Policy

Production dependency audit is clean (zero findings). The audit gate runs
in CI on every PR and enforces time-bounded, structured allowlist entries
for dev-only exceptions.

### Environment Variables

| Variable              | Effect                                                                 |
| --------------------- | ---------------------------------------------------------------------- |
| _(default)_           | Prod: block HIGH/CRITICAL. Full: block CRITICAL, warn HIGH.            |
| `AUDIT_STRICT=1`      | Block HIGH in full audit. Reject stale/invalid allowlist entries.      |
| `PEAC_AUDIT_STRICT=1` | Zero tolerance: block ANY prod vulnerability (LOW+). Enterprise CI.    |
| `PEAC_PERF_UPDATE=1`  | Opt-in: write perf baseline file (`tests/perf/baseline-results.json`). |

### Recommended CI Configuration

- **Default CI (PRs):** `node scripts/audit-gate.mjs`: prod must be clean, dev exceptions allowed.
- **Release/tag CI:** `AUDIT_STRICT=1 node scripts/audit-gate.mjs`: no known HIGHs anywhere.
- **Enterprise CI:** `PEAC_AUDIT_STRICT=1 node scripts/audit-gate.mjs`: zero prod findings.

### Allowlist Quality Bar

Every entry in `security/audit-allowlist.json` must include:

- `advisory_id`, `package`, `reason`, `why_not_exploitable`, `where_used`
- `expires_at` (max 90 days dev, 30 days prod), `remediation`, `issue_url`
- `scope` (`dev`/`examples`/`prod`), `dependency_chain`, `verified_by`
- `owner`, `added_at`
- `reviewed_at` (optional, recommended for renewals)

Entries missing required fields are rejected (fail-closed). Expired entries
reactivate the finding. Prod-scope entries may never allowlist HIGH/CRITICAL.
