/**
 * Shared report-schema validator.
 *
 * The tracked snapshot at `contracts/v0164-verification-report.schema.json` is the authority every
 * report must satisfy. Validating an object's TypeScript shape proves nothing here: the schema is
 * what forbids impossible stage/result tuples, and only the schema catches a report whose fields are
 * individually well-typed but collectively incoherent.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalize } from '@peac/crypto';

const schema = JSON.parse(
  readFileSync(resolve(__dirname, '../../contracts/v0164-verification-report.schema.json'), 'utf8')
) as object;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateFn = ajv.compile(schema);

/** Throws with the full AJV error list, so a failure names the offending keyword and path. */
export function assertReportValid(report: unknown, label: string): void {
  if (!validateFn(report)) {
    const errs = (validateFn.errors ?? [])
      .map((e) => `${e.instancePath || '/'} ${e.keyword}: ${e.message}`)
      .join('\n    ');
    throw new Error(`report schema REJECTED the ${label} report:\n    ${errs}`);
  }
}

/** Recompute reportSha256 = SHA-256(JCS(core without reportSha256)) and compare. */
export function assertReportHash(report: Record<string, unknown>, label: string): void {
  const { reportSha256, ...core } = report;
  // The report records digests in prefixed `sha256:<hex>` form (see src/lib/report.ts).
  const recomputed = `sha256:${createHash('sha256').update(canonicalize(core)).digest('hex')}`;
  if (recomputed !== reportSha256) {
    throw new Error(
      `reportSha256 mismatch on the ${label} report: recorded ${String(reportSha256)}, recomputed ${recomputed}`
    );
  }
}
