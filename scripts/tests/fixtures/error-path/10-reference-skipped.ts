// Fixture: when classified under reference/ this content is skipped
// even though it contains an empty catch and forbidden wording.
//
// AI slop placeholder.
export function bad(): void {
  try {
    JSON.parse('{');
  } catch {
    // empty
  }
}
