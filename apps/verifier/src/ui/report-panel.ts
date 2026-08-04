/**
 * Deterministic report display and local export.
 *
 * Export uses a Blob object URL: entirely local, no network. Run metadata is shown separately and
 * is never part of the hashed core.
 *
 * OBJECT-URL LIFECYCLE. A Blob URL pins its Blob for the lifetime of the document -- the browser
 * cannot know the URL is dead just because the anchor was removed from the DOM. Verifying N records
 * in one session would therefore retain N report Blobs, each holding record-derived material, until
 * the tab closed. Every URL this module mints is tracked and revoked: on re-render, on teardown, and
 * shortly after a download is initiated.
 */
import type { VerificationReportCoreV1 } from '../lib/verifier-types.js';

/** Object URLs minted by this module and not yet revoked. */
const liveObjectUrls = new Set<string>();

function mintObjectUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  liveObjectUrls.add(url);
  return url;
}

function revoke(url: string): void {
  if (!liveObjectUrls.delete(url)) return;
  URL.revokeObjectURL(url);
}

/** Revoke every outstanding object URL. Idempotent. */
export function releaseReportObjectUrls(): void {
  for (const url of [...liveObjectUrls]) revoke(url);
}

/** Test-only accessor: how many object URLs this module is still holding. */
export function outstandingReportObjectUrlCount(): number {
  return liveObjectUrls.size;
}

export function renderReport(
  report: VerificationReportCoreV1 | undefined,
  container: HTMLElement
): void {
  // Revoke BEFORE replacing children: the anchors about to be discarded own the only references.
  releaseReportObjectUrls();
  container.replaceChildren();
  if (!report) return;

  const h = document.createElement('h3');
  h.textContent = 'Verification report';
  container.appendChild(h);

  const note = document.createElement('p');
  note.textContent =
    'This is an unsigned verifier output. Its hash makes the report reproducible and tamper-evident ' +
    'relative to a retained reference; it does not establish who generated it.';
  container.appendChild(note);

  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(report, null, 2);
  container.appendChild(pre);

  const a = document.createElement('a');
  a.textContent = 'Download report';
  a.download = 'peac-verification-report.json';
  const url = mintObjectUrl(
    new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  );
  a.href = url;
  // The download must have been handed to the browser before the URL dies, so release on the next
  // macrotask rather than synchronously in the click handler.
  a.addEventListener('click', () => {
    setTimeout(() => revoke(url), 0);
  });
  container.appendChild(a);
}
