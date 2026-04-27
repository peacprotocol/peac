// Fixture: throw new Error(...) without cause in a sensitive path -> BLOCKED
export function parseConfig(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch (err) {
    throw new Error('Config is not valid JSON');
  }
}
