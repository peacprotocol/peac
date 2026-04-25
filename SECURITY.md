# Security Policy

Last reviewed: 2026-04-19

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

| Line                             | Status                            | Wire format                         | Security-fix window            |
| -------------------------------- | --------------------------------- | ----------------------------------- | ------------------------------ |
| `v0.12.x`                        | Active                            | Wire 0.2 (`interaction-record+jwt`) | Through the `v0.13.x` line     |
| `v0.11.x`                        | Maintenance (security fixes only) | Wire 0.1 (`peac-receipt/0.1`)       | 6 months after `v0.13.0` ships |
| `v0.10.x` and earlier            | End of life                       | Wire 0.1 and earlier                | No further updates             |
| `peac.receipt/0.9` archival path | Historical verify-only            | `peac.receipt/0.9`                  | Archived at `v0.13.0`          |

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
- External security review cadence: scope and artifact list are planned
  for a future release; execution is coordinated with an independent
  reviewer.

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

## Future carrier security controls (pre-doctrine)

Future execution-surface carriers (CLI execution evidence; observational
lifecycle records) are not shipped. Their security contract is
pre-declared so that future implementation MUST honor the rules on day
one:

- No raw secret capture by default; redaction or hashing defaults for
  `argv`, `stdin`, `stdout`, `stderr`.
- Hash-only default for stream captures unless a documented
  `capture_policy` enables raw capture.
- Environment-variable allowlist plus value hashing; no blanket
  environment dump.
- Explicit `argv_mode` for shell-string invocations; no hidden shell
  expansion.
- Bounded byte ceilings on command capture; truncation or hashing
  replaces silent drops.
- Lifecycle records observational-only; no implied PEAC decision, trust
  score, policy enforcement, or payment finality.

Each rule above becomes a named threat ID with a concrete test file when
the corresponding surface is implemented. Details in
[Threat model: future carrier surfaces](docs/THREAT_MODEL.md#future-carrier-surfaces-pre-doctrine).

## Contacts

- Security: [security@peacprotocol.org](mailto:security@peacprotocol.org).
- General: [contact@peacprotocol.org](mailto:contact@peacprotocol.org).
- GitHub Security Advisories: <https://github.com/peacprotocol/peac/security/advisories>.
