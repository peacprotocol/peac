// Fixture: log-and-continue in sensitive path -> BLOCKED
export async function fetchPolicy(url: string): Promise<unknown> {
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (err) {
    console.warn('fetchPolicy failed:', err);
    return null;
  }
}
