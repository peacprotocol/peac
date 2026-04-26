// Workspace-private metadata package. NOT published.
//
// The canonical codec / record-core implementation lives at
// packages/protocol/src/_internal/record-core/ and is imported via
// RELATIVE paths from inside @peac/protocol's own source tree.
//
// This package intentionally has no runtime exports. It exists for:
//   1. plan compliance (success criterion: "@peac/record-core exists, private,
//      absent from publish-manifest, absent from pnpm publish --recursive");
//   2. workspace-private invisibility-test denylist coverage (the four-name
//      list since v0.13.0: @peac/record-core, @peac/resolver-http,
//      @peac/compat, @peac/registries);
//   3. preventing accidental npm-name reservation drift.
//
// Public consumers MUST NOT depend on this package. Internal tests for the
// codec / record-core runtime path import via relative paths from inside
// packages/protocol/src/_internal/record-core/, NOT from @peac/record-core.

export {};
