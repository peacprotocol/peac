// Fixture: throw new Error(...) with cause in a sensitive path -> not flagged
export function parseConfig(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch (err) {
    throw new Error('Config is not valid JSON', { cause: err });
  }
}
