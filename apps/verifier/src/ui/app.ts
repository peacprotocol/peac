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

  button.addEventListener('click', () => {
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
        renderResults(result, results);
        renderReport(result.report, reportPanel);
      })
      .catch(() => {
        // verify() is a total boundary and should never reject. If it somehow does, the operator
        // must still see that the run failed rather than face a button that silently does nothing.
        results.replaceChildren();
        const p = document.createElement('p');
        p.textContent =
          'The verifier failed unexpectedly. No verification outcome was established.';
        results.appendChild(p);
        renderReport(undefined, reportPanel);
      });
  });
}
