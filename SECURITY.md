# Security Policy

Last reviewed: 2026-06-24

This is the canonical security policy for the PEAC Protocol. It describes
how to report a vulnerability, which versions receive security fixes, what
supply-chain attestations the project ships, and where the broader
security and stability model is documented.

## Reporting a vulnerability

- Email: [security@peacprotocol.org](mailto:security@peacprotocol.org).
- GitHub security advisories may be opened privately at
  <https://github.com/peacprotocol/peac/security/advisories>.
- Do not open a public issue for a suspected vulnerability.
- Coordinated disclosure is preferred; details below.

Please include:

- Affected version(s), package(s), and reproducer.
- Expected versus observed behavior.
- Your assessment of impact and severity, if any.

### Coordinated disclosure timeline

| Severity | Acknowledgement | Patch target | Public disclosure              |
| -------- | --------------- | ------------ | ------------------------------ |
| Critical | 48 hours        | 30 days      | After a fix is available       |
| High     | 72 hours        | 60 days      | After a fix is available       |
| Medium   | 7 days          | 90 days      | After a fix is available       |
| Low      | 14 days         | Next release | With the corresponding release |

Timelines are targets and may flex for exceptional cases; the reporter is
kept in the loop and the disclosure calendar is coordinated.

## Supported versions

| Line                             | Status                                     | Wire format                         | Security-fix window                           |
| -------------------------------- | ------------------------------------------ | ----------------------------------- | --------------------------------------------- |
| `v0.15.x`                        | Active (current)                           | Wire 0.2 (`interaction-record+jwt`) | Through the next minor line                   |
| `v0.14.x`                        | Maintenance (security fixes only)          | Wire 0.2 (`interaction-record+jwt`) | Through 2026-12-01 (6 months after `v0.15.0`) |
| `v0.13.x`                        | Maintenance (security fixes only)          | Wire 0.2 (`interaction-record+jwt`) | 6 months after the next minor line ships      |
| `v0.12.x`                        | Maintenance (critical security fixes only) | Wire 0.2 (`interaction-record+jwt`) | Through 2026-11-03 (6 months after `v0.14.0`) |
| `v0.11.x`                        | Maintenance (security fixes only)          | Wire 0.1 (`peac-receipt/0.1`)       | Through 2026-10-25 (6 months after `v0.13.0`) |
| `v0.10.x` and earlier            | End of life                                | Wire 0.1 and earlier                | No further updates                            |
| `peac.receipt/0.9` archival path | Historical verify-only                     | `peac.receipt/0.9`                  | Archived at `v0.13.0`                         |

See [Compatibility matrix](docs/COMPATIBILITY_MATRIX.md) for full runtime
and wire-format compatibility, and [Security operations](docs/SECURITY-OPERATIONS.md)
for support-window definitions.

## Supply chain

- All published packages ship npm provenance attestations via GitHub
  Actions OIDC trusted publishing. Consumers can verify with
  `npm audit signatures @peac/protocol`.
- Build provenance follows SLSA v1.2; build inputs are attested per
  in-toto v1.0.
- SHA-pinned GitHub Actions; CodeQL and dependency review run on every
  pull request.
- Production-dependency audit must be clean on every release; the gate
  and allowlist quality bar are documented below.
- Full supply-chain controls: [Security operations](docs/SECURITY-OPERATIONS.md).

## Dependency audit policy

CI runs `scripts/audit-gate.mjs`, which enforces the following:

| Variable              | Effect                                                                    |
| --------------------- | ------------------------------------------------------------------------- |
| _(default)_           | Prod clean; full audit blocks CRITICAL, warns HIGH                        |
| `AUDIT_STRICT=1`      | Blocks HIGH in the full audit; rejects stale or invalid allowlist entries |
| `PEAC_AUDIT_STRICT=1` | Zero tolerance: blocks any production vulnerability (LOW or higher)       |

Recommended CI configuration:

- Default CI (pull requests): `node scripts/audit-gate.mjs`.
- Release CI: `AUDIT_STRICT=1 node scripts/audit-gate.mjs`.
- Enterprise CI: `PEAC_AUDIT_STRICT=1 node scripts/audit-gate.mjs`.

Allowlist quality bar (`security/audit-allowlist.json`): each entry
requires `advisory_id`, `package`, `reason`, `why_not_exploitable`,
`where_used`, `expires_at` (max 90 days dev, 30 days prod), `remediation`,
`issue_url`, `scope`, `dependency_chain`, `verified_by`, `owner`,
`added_at`. Entries missing required fields fail closed. Production-scope
entries may never allowlist HIGH or CRITICAL.

## Trojan Source protection

The repository runs a fail-closed invisible / bidi Unicode scan
(`scripts/find-invisible-unicode.mjs`) on every CI run and local
`guard.sh` invocation. The scanner rejects dangerous Unicode categories
(bidi overrides, zero-width characters, invisible formatters) in tracked
source files. GitHub's diff view may show a bidi banner even when the
scan is clean; the scan is the authoritative check.

## External review

- CodeQL `javascript-typescript` and `security-extended` queries run on
  pull requests, pushes to main, and weekly.
- Dependency review blocks CRITICAL advisories and denies GPL-3.0 /
  AGPL-3.0 introductions.
- Independent third-party security review has not been completed for this
  release. Current review coverage includes CodeQL, dependency review,
  provenance attestations, audit gating, threat-model coverage, and release
  verification. Any completed third-party review will be listed here with
  scope and date.

## Trust artifacts

Full trust documentation is organized in
[Trust artifacts](docs/TRUST-ARTIFACTS.md). Pointers:

- [Threat model](docs/THREAT_MODEL.md): consolidated threat catalog with
  per-threat test-coverage links.
- [Stability contract](docs/STABILITY-CONTRACT.md): classification of
  every public surface.
- [SLO](docs/SLO.md) and [Benchmark methodology](docs/BENCHMARK-METHODOLOGY.md).
- [Security operations](docs/SECURITY-OPERATIONS.md): operational detail.
- [Key custody and tenancy](docs/KEY-CUSTODY-AND-TENANCY.md): key
  custody, tenancy, procurement.
- [Security considerations spec](docs/specs/SECURITY-CONSIDERATIONS.md).
- [Verifier security model spec](docs/specs/VERIFIER-SECURITY-MODEL.md).
- [HTTP transport security](docs/security/HTTP-TRANSPORT-SECURITY.md).
- [OWASP ASI mapping](docs/security/OWASP-ASI-MAPPING.md).

## Carrier security controls

Execution, lifecycle, and provisioning carrier surfaces are shipped and
covered by their profile specifications:

- [CLI carrier profile](docs/specs/CLI-CARRIER-PROFILE.md)
- [Lifecycle observation profile](docs/specs/LIFECYCLE-OBSERVATION-PROFILE.md)
- [Provisioning lifecycle profile](docs/specs/PROVISIONING-LIFECYCLE-PROFILE.md)

The carrier security posture is:

- no raw secret capture by default;
- redaction or hashing defaults for `argv`, `stdin`, `stdout`, and `stderr`;
- hash-only default for stream captures unless an explicit capture policy enables raw capture;
- environment-variable allowlists plus value hashing, not blanket environment dumps;
- explicit `argv_mode` for shell-string invocations;
- bounded byte ceilings on command capture, with truncation or hashing instead of silent drops;
- lifecycle records are observational only and do not imply PEAC decisions, trust scores, policy enforcement, or payment finality.

Each rule is covered by the shipped profile specs and threat-model coverage.

## Contacts

- Security: [security@peacprotocol.org](mailto:security@peacprotocol.org).
- General: [contact@peacprotocol.org](mailto:contact@peacprotocol.org).
- GitHub Security Advisories: <https://github.com/peacprotocol/peac/security/advisories>.
