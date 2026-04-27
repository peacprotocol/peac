// Fixture: empty catch in a sensitive production path -> BLOCKED
export async function readConfig(path: string): Promise<unknown> {
  try {
    return JSON.parse(path);
  } catch {
    // empty catch in protocol path
  }
  return null;
}
