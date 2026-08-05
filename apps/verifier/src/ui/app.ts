/**
 * Minimal text-only operability shim.
 *
 * Deliberately minimal rather than designed. This exists so the no-network,
 * no-persistence and CSP gates run against a built application that actually verifies, rather than
 * against an empty shell.
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

  /**
   * Monotonic run token.
   *
   * Verification is asynchronous, so two runs can be in flight and complete out of order. Rendering
   * whichever finishes last would show a verdict for inputs the operator has already replaced. Each
   * run captures the token it started with and renders only while that token is still current.
   */
  let runToken = 0;

  function showRunFailure(): void {
    results.replaceChildren();
    const p = document.createElement('p');
    p.textContent = 'The verifier failed unexpectedly. No verification outcome was established.';
    results.appendChild(p);
    // Clear any report from a previous run: leaving it visible beside a failure invites reading it
    // as the outcome of this one.
    renderReport(undefined, reportPanel);
  }

  button.addEventListener('click', () => {
    // A second submission while a run is active would start a concurrent verification whose result
    // races the first. The button is disabled for the duration and restored in `finally`.
    if (button.disabled) return;
    button.disabled = true;

    const token = ++runToken;
    const ctx = fields.contextDocument.value;

    void verifier
      .verify({
        record: fields.record.value,
        keyDocument: fields.keyDocument.value,
        ...(ctx.length > 0 ? { contextDocument: ctx } : {}),
        evaluationTimeUnixSeconds: Math.floor(Date.now() / 1000),
        maxClockSkewSeconds: DEFAULT_MAX_CLOCK_SKEW_SECONDS,
      })
      .then((result) => {
        if (token !== runToken) return;
        renderResults(result, results);
        renderReport(result.report, reportPanel);
      })
      .catch(() => {
        // verify() is a total boundary and should not reject. If it does, the operator must still
        // see that the run failed rather than face a control that silently does nothing.
        if (token !== runToken) return;
        showRunFailure();
      })
      .finally(() => {
        // Restored on every path, so a failure cannot leave the interface permanently inert.
        button.disabled = false;
      });
  });
}
