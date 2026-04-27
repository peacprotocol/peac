// Fixture: when classified under a skipped path this content is
// ignored entirely, even though it contains an empty catch.
export function bad(): void {
  try {
    JSON.parse('{');
  } catch {
    // empty
  }
}
