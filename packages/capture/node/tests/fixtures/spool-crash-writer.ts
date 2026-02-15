/**
 * Fixture: subprocess that writes entries to a spool store, commits some,
 * then signals readiness for the parent to SIGKILL it.
 *
 * Usage: tsx spool-crash-writer.ts <spoolPath> <commitCount> <uncommitCount>
 *
 * Protocol:
 *   1. Creates store, appends commitCount entries, calls commit()
 *   2. Appends uncommitCount more entries WITHOUT commit
 *   3. Writes "COMMITTED\n" to stdout (signals parent to kill)
 *   4. Sleeps forever (waiting to be killed)
 */

import { createFsSpoolStore } from '../../src/index.js';
import { GENESIS_DIGEST } from '@peac/capture-core';
import type { SpoolEntry } from '@peac/capture-core';

const [, , spoolPath, commitCountStr, uncommitCountStr] = process.argv;
const commitCount = parseInt(commitCountStr, 10);
const uncommitCount = parseInt(uncommitCountStr, 10);

function makeEntry(sequence: number, prevDigest: string): SpoolEntry {
  const digest = `entry_digest_${sequence}_${'a'.repeat(40)}`.slice(0, 64);
  return {
    captured_at: new Date().toISOString(),
    action: {
      id: `action-${sequence}`,
      kind: 'tool.call',
      platform: 'test',
      started_at: new Date().toISOString(),
    },
    prev_entry_digest: prevDigest,
    entry_digest: digest,
    sequence,
  };
}

async function main() {
  const store = await createFsSpoolStore({
    filePath: spoolPath,
    autoCommitIntervalMs: 0,
  });

  let prevDigest = GENESIS_DIGEST;

  // Append and commit
  for (let i = 1; i <= commitCount; i++) {
    const entry = makeEntry(i, prevDigest);
    await store.append(entry);
    prevDigest = entry.entry_digest;
  }
  await store.commit();

  // Append WITHOUT commit (vulnerable to kill)
  for (let i = commitCount + 1; i <= commitCount + uncommitCount; i++) {
    const entry = makeEntry(i, prevDigest);
    await store.append(entry);
    prevDigest = entry.entry_digest;
  }

  // Signal parent: committed entries are durable
  process.stdout.write('COMMITTED\n');

  // Sleep forever, waiting to be killed
  await new Promise(() => {});
}

main().catch((err) => {
  process.stderr.write(`Error: ${err}\n`);
  process.exit(1);
});
