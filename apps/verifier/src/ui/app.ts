/**
 * Minimal text-only operability shim.
 *
 * Deliberately minimal rather than designed. This exists so the no-network,
 * no-persistence and CSP gates run against a built application that actually verifies, rather than
 * against an empty shell.
 *
 * A displayed result always describes the exact inputs submitted for that run. Verification and
 * file reads are both asynchronous, so a run is bound to a monotonic run token and to the input
 * revision captured at submission, and renders only while both remain current.
 */
import { initializeLocalVerifier, type LocalVerifier } from '../verify.js';
import { verifierBuildFromEnvironment } from '../lib/build-info.js';
import { renderInputs } from './inputs.js';
import { renderResults } from './results.js';
import { renderReport } from './report-panel.js';
import { DEFAULT_MAX_CLOCK_SKEW_SECONDS } from '../lib/limits.js';

export async function initApp(root: HTMLElement): Promise<void> {
  root.replaceChildren();

  const h1 = document.createElement('h1');
  h1.textContent = 'Verify a PEAC record locally';
  const intro = document.createElement('p');
  intro.textContent =
    'Paste a compact PEAC record and a public JWK or JWKS, and optionally a set of verification ' +
    'expectations. Verification runs in this browser. The application does not upload, resolve or ' +
    'store your inputs.';
  root.append(h1, intro);

  const form = document.createElement('div');
  root.appendChild(form);
  const fields = renderInputs(form);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Verify';
  root.appendChild(button);

  const results = document.createElement('section');
  const reportPanel = document.createElement('section');
  root.append(results, reportPanel);

  let verifier: LocalVerifier;
  try {
    verifier = await initializeLocalVerifier({ verifierBuild: verifierBuildFromEnvironment() });
  } catch {
    const p = document.createElement('p');
    p.textContent = 'The verifier could not start because its build identifier is missing.';
    root.appendChild(p);
    return;
  }

  if (!verifier.supported) {
    const p = document.createElement('p');
    p.textContent =
      'This browser cannot perform the Ed25519 verification profile required by PEAC. ' +
      'Use a current browser, or verify with the PEAC CLI.';
    root.appendChild(p);
    button.disabled = true;
    return;
  }

  let runToken = 0;
  let running = false;

  function updateAvailability(): void {
    // Unavailable while a run is active, and while any file read is unresolved: the field contents
    // are not yet settled, so a submission could carry a value the operator has not seen.
    button.disabled = running || fields.hasPendingRead();
  }

  function clearOutputs(): void {
    results.replaceChildren();
    renderReport(undefined, reportPanel);
  }

  function showRunFailure(): void {
    results.replaceChildren();
    const p = document.createElement('p');
    p.textContent = 'The verifier failed unexpectedly. No verification outcome was established.';
    results.appendChild(p);
    // Clear any report from a previous run: leaving it visible beside a failure invites reading it
    // as the outcome of this one.
    renderReport(undefined, reportPanel);
  }

  fields.onChange(() => {
    updateAvailability();
    // The inputs no longer match anything on screen.
    clearOutputs();
  });
  updateAvailability();

  button.addEventListener('click', () => {
    if (button.disabled) return;

    const token = ++runToken;
    const revision = fields.revision();
    const contextDocument = fields.contextDocument.value;
    // Captured once. Nothing read from the fields after this point reaches the verifier.
    const input = Object.freeze({
      record: fields.record.value,
      keyDocument: fields.keyDocument.value,
      ...(contextDocument.length > 0 ? { contextDocument } : {}),
      evaluationTimeUnixSeconds: Math.floor(Date.now() / 1000),
      maxClockSkewSeconds: DEFAULT_MAX_CLOCK_SKEW_SECONDS,
    });

    running = true;
    fields.setDisabled(true);
    updateAvailability();

    void verifier
      .verify(input)
      .then((result) => {
        if (token !== runToken || revision !== fields.revision()) return;
        renderResults(result, results);
        renderReport(result.report, reportPanel);
      })
      .catch(() => {
        // verify() is a total boundary and should not reject. If it does, the operator must still
        // see that the run failed rather than face a control that silently does nothing.
        if (token !== runToken || revision !== fields.revision()) return;
        showRunFailure();
      })
      .finally(() => {
        // A superseded run must not restore controls a newer run is holding.
        if (token !== runToken) return;
        running = false;
        fields.setDisabled(false);
        updateAvailability();
      });
  });
}
