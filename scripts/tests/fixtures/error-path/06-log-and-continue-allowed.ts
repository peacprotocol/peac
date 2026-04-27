// Fixture: log-and-continue in sensitive path with allowlist -> ALLOWED
export async function negotiate(rails: string[]): Promise<string[]> {
  const challenges: string[] = [];
  for (const rail of rails) {
    try {
      challenges.push(rail);
    } catch (err) {
      console.warn(`adapter ${rail} failed:`, err);
    }
  }
  return challenges;
}
