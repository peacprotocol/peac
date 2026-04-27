// Fixture: empty cleanup-only catch with allowlist entry -> ALLOWED
import { rm } from 'node:fs/promises';

export async function close(tempDir: string): Promise<void> {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}
