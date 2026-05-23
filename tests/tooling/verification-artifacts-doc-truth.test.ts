/**
 * Doc-truth test for the public verification artifact conventions document.
 *
 * Asserts that the document exists and contains the required headings.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join as pathJoin, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = pathJoin(__dirname, '..', '..');
const FILE = pathJoin(ROOT, 'docs/governance/VERIFICATION-ARTIFACTS.md');

describe('Verification artifact conventions doc-truth', () => {
  it('exists at the expected path', () => {
    expect(existsSync(FILE), `Expected file at ${FILE}`).toBe(true);
  });

  it('declares the required headings', () => {
    const text = readFileSync(FILE, 'utf8');
    const required = [
      '## Scope',
      '## Artifact URLs',
      '## Fixture paths',
      '## Verification commands',
      '## Source references',
      '## Timestamp fields',
      '## Change history',
      '## Non-claims',
      '## Versioning',
    ];
    const missing = required.filter((heading) => !text.includes(heading));
    expect(missing, `Missing headings:\n${missing.join('\n')}`).toEqual([]);
  });
});
