# @peac/record-core

Workspace-private metadata package. Not published to npm.

## Why this package exists

The canonical codec and record-core implementation lives at
`packages/protocol/src/_internal/record-core/` and is imported via RELATIVE
paths from inside `@peac/protocol`'s own source tree. This package does NOT
duplicate that source.

This package exists for three reasons:

1. **Plan compliance**: the v0.13.1 plan lists `@peac/record-core` as a
   workspace-private package that must be absent from the publish manifest
   and from `pnpm publish --dry-run --recursive`.
2. **Invisibility-test denylist coverage**: `@peac/record-core` is one of
   the four reboot-package names on the workspace-private invisibility
   denylist enforced by `tests/tooling/internal-package-invisibility.test.ts`
   (since v0.13.0). The package needs to exist on disk so the denylist
   reference is anchored to a real workspace path.
3. **npm-name reservation drift**: a placeholder package prevents accidental
   external publication of the name during dev work.

## What this package does NOT do

- It does NOT contain the codec, the offline engine, the validator, or any
  runtime logic.
- It does NOT mirror or copy source from `packages/protocol/src/_internal/`.
- It does NOT expose any public API.

## How to import the canonical codec / record-core

Internal consumers (inside `@peac/protocol`'s own source) use relative paths:

```ts
import { defaultCodec } from './_internal/record-core/codec/jws-jwt.js';
```

Tests for the codec runtime path import via the same relative pattern from
the `__tests__/` directory:

```ts
import { defaultCodec } from '../../src/_internal/record-core/codec/jws-jwt.js';
```

External consumers MUST NOT depend on this package, and MUST NOT depend on
`@peac/protocol/src/_internal/**` (the `_internal/` source tree is implementation
detail and is not part of the public `exports` map).

## Version

Tracks the workspace-wide value enforced by `scripts/check-version-coherence.sh`.
The workspace-wide bump to v0.13.1 happens in the v0.13.1 release-prep PR.
