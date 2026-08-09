/**
 * Text-only local verification page.
 *
 * The page verifies a PEAC record in the browser and explains, in plain terms, what a successful
 * verification does and does not establish. It uses landmark and heading structure, associates
 * each input with its label, announces state changes through a live region, and moves focus to the
 * outcome once a run completes.
 *
 * A displayed result always describes the exact inputs submitted for that run. Verification and
 * file reads are both asynchronous, so a run is bound to a monotonic run token and to the input
 * revision captured at submission, and renders only while both remain current.
 */
import { initializeLocalVerifier, type LocalVerifier } from '../verify.js';
import { verifierBuildFromEnvironment } from '../lib/build-info.js';
import { renderInputs } from './inputs.js';
import { renderResults, INPUT_ERROR_MESSAGE_ID } from './results.js';
import { renderReport } from './report-panel.js';
import { DEFAULT_MAX_CLOCK_SKEW_SECONDS } from '../lib/limits.js';

/** What a successful cryptographic verification does, and does not, establish. */
const PROVES = [
  'the record was signed by the private key matching the public key you supplied',
  'the record has not changed since it was signed',
  'the record satisfied the checks this verifier performed, at the evaluation time shown',
];
const DOES_NOT_PROVE = [
  'that the key, or its holder, is one you should trust',
  'that the statements inside the record are factually true',
  'that any external event the record refers to actually occurred',
];

function fatalMessage(root: HTMLElement, status: HTMLElement, text: string): void {
  status.textContent = text;
  const p = document.createElement('p');
  p.textContent = text;
  root.appendChild(p);
}

export async function initApp(root: HTMLElement): Promise<void> {
  root.replaceChildren();

  const main = document.createElement('main');
  root.appendChild(main);

  const h1 = document.createElement('h1');
  h1.textContent = 'Verify a PEAC record locally';
  const intro = document.createElement('p');
  intro.textContent =
    'Paste a compact PEAC record and a public JWK or JWKS, and optionally a set of verification ' +
    'expectations. Verification runs in this browser. The application does not upload, resolve or ' +
    'store your inputs.';
  main.append(h1, intro);

  // A polite live region so assistive technology announces state changes without stealing focus.
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.className = 'sr-status';
  main.appendChild(status);

  const group = document.createElement('div');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'PEAC record verification');
  main.appendChild(group);
  const fields = renderInputs(group);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Verify';
  group.appendChild(button);

  const results = document.createElement('section');
  results.setAttribute('aria-label', 'Verification result');
  results.tabIndex = -1;
  const reportPanel = document.createElement('section');
  reportPanel.setAttribute('aria-label', 'Verification report');
  main.append(results, reportPanel);

  // Guidance: what verification proves and does not prove. Static, neutral, always available.
  const guidance = document.createElement('section');
  guidance.setAttribute('aria-label', 'What verification proves');
  const gh = document.createElement('h2');
  gh.textContent = 'What a successful verification means';
  guidance.appendChild(gh);
  for (const [heading, items] of [
    ['It establishes', PROVES],
    ['It does not establish', DOES_NOT_PROVE],
  ] as const) {
    const h3 = document.createElement('h3');
    h3.textContent = heading;
    const ul = document.createElement('ul');
    for (const item of items) {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    }
    guidance.append(h3, ul);
  }
  main.appendChild(guidance);

  // Footer: canonical project links. Sibling of main so it is the page contentinfo landmark.
  const footer = document.createElement('footer');
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'PEAC Protocol');
  for (const [text, href] of [
    ['PEAC Protocol', 'https://www.peacprotocol.org/'],
    ['Source', 'https://github.com/peacprotocol/peac'],
  ] as const) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    a.rel = 'noopener noreferrer';
    a.target = '_blank';
    a.setAttribute('aria-label', `${text} (opens in a new tab)`);
    nav.appendChild(a);
  }
  footer.appendChild(nav);
  root.appendChild(footer);

  let verifier: LocalVerifier;
  try {
    verifier = await initializeLocalVerifier({ verifierBuild: verifierBuildFromEnvironment() });
  } catch {
    fatalMessage(
      main,
      status,
      'The verifier could not start because its build identifier is missing.'
    );
    button.disabled = true;
    return;
  }

  if (!verifier.supported) {
    fatalMessage(
      main,
      status,
      'This browser cannot perform the Ed25519 verification profile required by PEAC. ' +
        'Use a current browser, or verify with the PEAC CLI.'
    );
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

  const inputTextareas = [fields.record, fields.keyDocument, fields.contextDocument];

  // Add or remove the input-error message id from a field's aria-describedby while preserving its
  // permanent hint id, so assistive technology reads the concrete error on the field it belongs to.
  function describeError(ta: HTMLTextAreaElement, on: boolean): void {
    const ids = (ta.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter((id) => id.length > 0 && id !== INPUT_ERROR_MESSAGE_ID);
    if (on) ids.push(INPUT_ERROR_MESSAGE_ID);
    ta.setAttribute('aria-describedby', ids.join(' '));
  }

  function clearFieldValidity(): void {
    for (const ta of inputTextareas) {
      ta.removeAttribute('aria-invalid');
      describeError(ta, false);
    }
  }

  // Bind an input-stage failure to the field the operator can act on, so assistive technology
  // reports the error on that control. Only pre-key-selection stages map to a field; later stages
  // are about the record's content or the supplied expectations, not a malformed input to correct.
  function markFieldValidity(result: Awaited<ReturnType<LocalVerifier['verify']>>): void {
    clearFieldValidity();
    if (result.ok || !('failureStage' in result)) return;
    if (result.failureStage !== 'input' && result.failureStage !== 'key_selection') return;
    const code = String(result.code);
    const target = code.startsWith('E_VERIFIER_RECORD_')
      ? fields.record
      : code.startsWith('E_VERIFIER_KEY_') ||
          code.startsWith('E_VERIFIER_JWKS_') ||
          code.startsWith('E_VERIFIER_PRIVATE_KEY_')
        ? fields.keyDocument
        : code.startsWith('E_VERIFIER_CONTEXT_')
          ? fields.contextDocument
          : undefined;
    if (target) {
      target.setAttribute('aria-invalid', 'true');
      describeError(target, true);
    }
  }

  function clearOutputs(): void {
    results.replaceChildren();
    renderReport(undefined, reportPanel);
    clearFieldValidity();
  }

  function showRunFailure(): void {
    results.replaceChildren();
    const p = document.createElement('p');
    p.textContent = 'The verifier failed unexpectedly. No verification outcome was established.';
    results.appendChild(p);
    status.textContent = 'The verifier failed unexpectedly.';
    // Clear any report from a previous run: leaving it visible beside a failure invites reading it
    // as the outcome of this one.
    renderReport(undefined, reportPanel);
    // An unexpected failure is not an input the operator can correct; do not flag a field.
    clearFieldValidity();
  }

  fields.onChange(() => {
    updateAvailability();
    // The inputs no longer match anything on screen.
    clearOutputs();
    status.textContent = '';
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
    status.textContent = 'Verifying.';

    void verifier
      .verify(input)
      .then((result) => {
        if (token !== runToken || revision !== fields.revision()) return;
        renderResults(result, results);
        renderReport(result.report, reportPanel);
        markFieldValidity(result);
        // Announce the outcome and move focus to the result region, so a keyboard or screen-reader
        // user lands on what changed rather than hunting for it. Focus moves only on a current run.
        status.textContent = result.ok ? 'Verification succeeded.' : 'Verification failed.';
        results.focus();
      })
      .catch(() => {
        // verify() is a total boundary and should not reject. If it does, the operator must still
        // see that the run failed rather than face a control that silently does nothing.
        if (token !== runToken || revision !== fields.revision()) return;
        showRunFailure();
        results.focus();
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
