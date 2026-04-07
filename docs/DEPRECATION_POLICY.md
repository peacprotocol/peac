# Deprecation Policy

This document defines the lifecycle rules for PEAC Protocol surfaces.

## Surface States

| State            | Definition                                                          | Support level                                         |
| ---------------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| **default**      | Current recommended path. Wire 0.2 native.                          | Full: features, fixes, docs                           |
| **supported**    | Published, production-ready. May not be on default quickstart path. | Full: features, fixes, docs                           |
| **compat-only**  | Maintained for backward compatibility.                              | Security and correctness fixes only. No new features. |
| **deprecated**   | Marked for removal.                                                 | Security fixes only. Migration guidance required.     |
| **archived**     | Moved to `archive/`. Excluded from workspace, CI, release.          | None. Buildability not guaranteed.                    |
| **experimental** | Not yet stable.                                                     | Best-effort. API may change without notice.           |

## Deprecation Windows

- **Deprecated** surfaces must remain available for **at least 2 minor releases or 60 days**, whichever is longer, before removal.
- **Compat-only** surfaces receive security and correctness fixes only; no feature growth.
- **Archived** surfaces are non-default, non-marketed, excluded from release promises, and may be removed in any future minor.

## HTTP Deprecation Headers

Deprecated HTTP endpoints must signal deprecation using standard headers:

| Header        | Standard | Example                                                                  |
| ------------- | -------- | ------------------------------------------------------------------------ |
| `Sunset`      | RFC 8594 | `Sunset: Sat, 01 Nov 2026 00:00:00 GMT`                                  |
| `Deprecation` | Draft    | `Deprecation: true`                                                      |
| `Link`        | RFC 8288 | `Link: <https://www.peacprotocol.org/docs/migration>; rel="deprecation"` |

## Release Notes Requirements

Every release that changes a surface state must:

1. List the transition in the CHANGELOG (e.g., "`@peac/sdk`: supported -> archived")
2. Update `REPO_SURFACE_STATUS.json`
3. Update `docs/COMPATIBILITY_MATRIX.md`
4. Update website/docs if the surface is user-facing

## Promotion Rules

No surface may be promoted from `experimental` or `compat-only` to `supported` or `default` without:

1. A changelog note
2. `REPO_SURFACE_STATUS.json` update
3. Compatibility matrix update
4. Website/docs update if user-facing

## Current Deprecations

| Surface                   | State      | Deprecated since | Removal target           | Replacement                                                         |
| ------------------------- | ---------- | ---------------- | ------------------------ | ------------------------------------------------------------------- |
| `@peac/core`              | deprecated | v0.10.0          | v0.13.0                  | `@peac/kernel` + `@peac/schema` + `@peac/crypto` + `@peac/protocol` |
| `@peac/sdk`               | archived   | v0.12.7          | v0.13.0                  | `@peac/protocol`                                                    |
| `apps/bridge`             | archived   | v0.12.7          | v0.13.0                  | `@peac/protocol` or `/api/v1/verify`                                |
| API `/verify`             | deprecated | v0.12.7          | v0.13.0 (or Nov 1, 2026) | `/api/v1/verify`                                                    |
| Wire 0.1 default teaching | removed    | v0.12.7          | Immediate                | All defaults now Wire 0.2                                           |

## Archive Protocol

When archiving a package or app:

1. Move all tracked files to `archive/<name>/` via `git mv`
2. Ensure no `package.json` remains at the original path
3. Remove from publish manifest
4. Verify pnpm workspace no longer resolves the old path
5. Add `archive/<name>/README.md` with reason, last version, replacement, date
6. Ensure no CI, release, or doc surface references the old path as active
7. Archived code is excluded from workspace resolution, CI, release, and support. Buildability is not guaranteed.
8. Update `REPO_SURFACE_STATUS.json` with state `archived`
