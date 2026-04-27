#!/usr/bin/env node
/**
 * Error-path hygiene verifier.
 *
 * Inspects tracked TypeScript and JavaScript source for unambiguous
 * error-path defects and forbidden public wording, classifies findings
 * into BLOCKED / ALLOWED-WITH-RATIONALE / REPORT-ONLY, and exits non-zero
 * only on BLOCKED findings outside the allowlist.
 *
 * BLOCKED in production code (unambiguous AST patterns only):
 *   - empty catch blocks
 *   - catch blocks that throw a replacement error without { cause: ... }
 *   - catch blocks that log-and-continue in sensitive paths
 *     (protocol / security / network / payment)
 *   - catch blocks that return a silent default in sensitive paths
 *
 * BLOCKED in tracked public artifacts:
 *   - forbidden public vocabulary; the canonical pattern set is the
 *     FORBIDDEN_WORDS array below. The patterns are written as regex
 *     literals with character classes so the verifier source itself
 *     does not match.
 *
 * ALLOWED-WITH-RATIONALE: must appear in the allowlist
 *   (scripts/verify-error-path-hygiene.allowlist.json) with reason +
 *   category + (reviewAfter for debt categories).
 *
 * REPORT-ONLY (printed but never failing): ambiguous classifications,
 *   barrel density, directory fanout, duplicate test mock setup,
 *   legitimate compatibility pass-through wrappers.
 *
 * Walks tracked files via `git ls-files` so untracked content
 * (reference, paper, local scratch) is naturally excluded. Self-test
 * fixtures under scripts/tests/fixtures/ are excluded from the
 * production scan because they intentionally embed pattern triggers.
 *
 * Modes:
 *   default                human-readable report; non-zero on BLOCKED
 *   --json                 JSON report on stdout
 *   --report-only          print findings; never exit non-zero
 *   --self-test            run bundled fixtures; exit non-zero on
 *                          fixture mismatch
 *   --allowlist <path>     override allowlist path (for fixtures)
 *   --root <path>          override scan root (defaults to cwd)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REQUIRE = createRequire(import.meta.url);
const ts = REQUIRE('typescript');

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const DEFAULT_ALLOWLIST = resolve(SCRIPT_DIR, 'verify-error-path-hygiene.allowlist.json');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_FILE_PATTERNS = [/\.d\.ts$/, /\.generated\.[a-z]+$/, /\.js\.map$/];
const SKIP_DIR_PREFIXES = [
  'reference/',
  'paper/',
  '.claude/',
  'archive/',
  'dist/',
  'build/',
  'node_modules/',
  '.turbo/',
  // Self-test fixtures intentionally embed pattern triggers; they are
  // exercised through --self-test against per-case relPath classification,
  // not via the production scan.
  'scripts/tests/fixtures/',
];

const PRODUCTION_PREFIXES = ['packages/', 'apps/', 'surfaces/', 'sdks/'];

const PRODUCTION_SUBPATHS = ['/src/'];

const SENSITIVE_PREFIXES = [
  'packages/protocol/',
  'packages/crypto/',
  'packages/schema/',
  'packages/net/',
  'packages/mappings/paymentauth/',
  'packages/mappings/x402/',
  'packages/adapters/x402/',
  'packages/pay402/',
  'packages/mcp-server/',
  'apps/api/',
];

const FORBIDDEN_WORDS = [
  /\bAI[ -]slop\b/i,
  /\bvibe[ -]coded\b/i,
  /\bvibe coding\b/i,
  /\bgenerated[ -]code cleanup\b/i,
  /\bClaude cleanup\b/i,
  /\bLLM cleanup\b/i,
  /\bbot cleanup\b/i,
];

const FORBIDDEN_WORDS_SCAN_PATHS = [
  'README.md',
  'docs/',
  'examples/',
  'packages/',
  'apps/',
  'surfaces/',
  'sdks/',
  'scripts/',
  'CHANGELOG.md',
  'llms.txt',
];

const ALLOWED_CATEGORIES = new Set([
  'cleanup-only',
  'telemetry-only',
  'compat-shim',
  'package-root-barrel',
  'byte-identical-codec',
]);

const PERMANENT_DESIGN_CATEGORIES = new Set([
  'compat-shim',
  'package-root-barrel',
  'byte-identical-codec',
]);

const ALLOWED_RULES = new Set([
  'emptyCatch',
  'replacementErrorWithoutCause',
  'logAndContinue',
  'silentDefault',
  'compatWrapper',
  'packageRootBarrel',
]);

function parseArgs(argv) {
  const opts = {
    json: false,
    reportOnly: false,
    selfTest: false,
    allowlistPath: DEFAULT_ALLOWLIST,
    root: REPO_ROOT,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--report-only') opts.reportOnly = true;
    else if (a === '--self-test') opts.selfTest = true;
    else if (a === '--allowlist') opts.allowlistPath = resolve(argv[++i]);
    else if (a === '--root') opts.root = resolve(argv[++i]);
    else if (a === '-h' || a === '--help') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (a.startsWith('--')) {
      process.stderr.write(`unknown option: ${a}\n`);
      process.exit(2);
    }
  }
  return opts;
}

const USAGE = `usage: verify-error-path-hygiene [--json] [--report-only] [--self-test] [--allowlist <path>] [--root <dir>]\n`;

function listTrackedFiles(root) {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\0').filter(Boolean);
}

function isSourceFile(p) {
  if (SKIP_DIR_PREFIXES.some((prefix) => p.startsWith(prefix))) return false;
  if (SKIP_FILE_PATTERNS.some((re) => re.test(p))) return false;
  const dot = p.lastIndexOf('.');
  if (dot < 0) return false;
  return SOURCE_EXTENSIONS.has(p.slice(dot));
}

function isProductionPath(p) {
  if (!PRODUCTION_PREFIXES.some((prefix) => p.startsWith(prefix))) return false;
  return PRODUCTION_SUBPATHS.some((sub) => p.includes(sub));
}

function isSensitivePath(p) {
  if (!isProductionPath(p)) return false;
  return SENSITIVE_PREFIXES.some((prefix) => p.startsWith(prefix));
}

function loadAllowlist(allowlistPath) {
  if (!existsSync(allowlistPath)) {
    return { entries: [], errors: [] };
  }
  const raw = readFileSync(allowlistPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      entries: [],
      errors: [`allowlist parse failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
  const errors = [];
  const entries = [];
  if (!Array.isArray(parsed.entries)) {
    return { entries: [], errors: [`allowlist must contain "entries" array`] };
  }
  for (let i = 0; i < parsed.entries.length; i++) {
    const e = parsed.entries[i];
    const ctx = `entries[${i}]`;
    if (!e || typeof e !== 'object') {
      errors.push(`${ctx}: not an object`);
      continue;
    }
    if (!ALLOWED_RULES.has(e.rule)) {
      errors.push(`${ctx}: invalid rule "${e.rule}"`);
      continue;
    }
    if (typeof e.path !== 'string' || e.path.includes('*') || e.path.includes('**')) {
      errors.push(`${ctx}: path must be file-specific (no globs)`);
      continue;
    }
    if (e.path.startsWith('packages/net/node/') && !e.scoped) {
      errors.push(
        `${ctx}: packages/net/node/** entries must include "scoped": true with narrow reason`
      );
      continue;
    }
    if (typeof e.symbolHint !== 'string' && typeof e.lineHint !== 'string') {
      errors.push(`${ctx}: symbolHint or lineHint required`);
      continue;
    }
    if (typeof e.reason !== 'string' || e.reason.length < 8) {
      errors.push(`${ctx}: reason must be a non-trivial string`);
      continue;
    }
    if (!ALLOWED_CATEGORIES.has(e.category)) {
      errors.push(`${ctx}: invalid category "${e.category}"`);
      continue;
    }
    const isDebt = !PERMANENT_DESIGN_CATEGORIES.has(e.category);
    if (isDebt && typeof e.reviewAfter !== 'string') {
      errors.push(`${ctx}: reviewAfter required for debt category "${e.category}"`);
      continue;
    }
    entries.push(e);
  }
  return { entries, errors };
}

function findingMatchesAllowlist(finding, allowlistEntries) {
  for (const e of allowlistEntries) {
    if (e.rule !== finding.rule) continue;
    if (e.path !== finding.path) continue;
    if (typeof e.lineHint === 'number' || typeof e.lineHint === 'string') {
      const ln = Number(e.lineHint);
      if (Number.isFinite(ln) && Math.abs(ln - finding.line) > 6) continue;
    }
    if (typeof e.symbolHint === 'string' && finding.symbol) {
      if (!finding.symbol.includes(e.symbolHint)) continue;
    }
    return e;
  }
  return null;
}

function isOnlyConsoleCallStatement(stmt) {
  if (!ts.isExpressionStatement(stmt)) return false;
  const expr = stmt.expression;
  if (!ts.isCallExpression(expr)) return false;
  const callee = expr.expression;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  if (!ts.isIdentifier(callee.expression)) return false;
  return callee.expression.text === 'console';
}

function isControlFlowExitStatement(stmt) {
  return (
    ts.isReturnStatement(stmt) ||
    stmt.kind === ts.SyntaxKind.ContinueStatement ||
    stmt.kind === ts.SyntaxKind.BreakStatement
  );
}

function statementsContainThrow(statements) {
  for (const s of statements) {
    if (containsThrow(s)) return true;
  }
  return false;
}

function containsThrow(node) {
  if (!node) return false;
  if (ts.isThrowStatement(node)) return true;
  let found = false;
  node.forEachChild((child) => {
    if (found) return;
    if (containsThrow(child)) found = true;
  });
  return found;
}

function classifyCatchClause(catchClause, _sourceFile) {
  const block = catchClause.block;
  const stmts = block.statements;

  if (stmts.length === 0) {
    return { rule: 'emptyCatch', ambiguous: false };
  }

  if (statementsContainThrow(stmts)) {
    return classifyThrowingCatch(stmts);
  }

  // Filter out non-actionable statements (variable hoists, comments)
  const meaningful = stmts.filter(
    (s) => !ts.isVariableStatement(s) || s.declarationList.declarations.length > 0
  );
  const hasOnlyConsole =
    meaningful.length > 0 &&
    meaningful.every((s) => isOnlyConsoleCallStatement(s) || isControlFlowExitStatement(s));
  const hasConsole = meaningful.some(isOnlyConsoleCallStatement);
  const hasReturn = meaningful.some(ts.isReturnStatement);
  const hasContinueOrBreak = meaningful.some(
    (s) => s.kind === ts.SyntaxKind.ContinueStatement || s.kind === ts.SyntaxKind.BreakStatement
  );

  if (
    hasOnlyConsole &&
    hasConsole &&
    (hasReturn || hasContinueOrBreak || meaningful.every(isOnlyConsoleCallStatement))
  ) {
    return { rule: 'logAndContinue', ambiguous: false };
  }

  // Silent default: catch contains only a ReturnStatement returning a literal/identifier
  if (meaningful.length === 1 && ts.isReturnStatement(meaningful[0])) {
    const expr = meaningful[0].expression;
    if (!expr || isSimpleDefaultExpression(expr)) {
      return { rule: 'silentDefault', ambiguous: false };
    }
  }

  return { rule: null, ambiguous: true };
}

function isSimpleDefaultExpression(expr) {
  if (!expr) return true;
  if (ts.isIdentifier(expr) && (expr.text === 'undefined' || expr.text === 'null')) return true;
  if (expr.kind === ts.SyntaxKind.NullKeyword) return true;
  if (expr.kind === ts.SyntaxKind.UndefinedKeyword) return true;
  if (expr.kind === ts.SyntaxKind.FalseKeyword || expr.kind === ts.SyntaxKind.TrueKeyword)
    return true;
  if (ts.isNumericLiteral(expr) || ts.isStringLiteral(expr)) return true;
  if (ts.isArrayLiteralExpression(expr) && expr.elements.length === 0) return true;
  if (ts.isObjectLiteralExpression(expr) && expr.properties.length === 0) return true;
  return false;
}

function classifyThrowingCatch(stmts) {
  // Look at first throw statement
  for (const s of stmts) {
    if (ts.isThrowStatement(s)) {
      const arg = s.expression;
      if (!arg) return { rule: null, ambiguous: true };
      if (ts.isNewExpression(arg)) {
        const ctor = arg.expression;
        const ctorName = ts.isIdentifier(ctor) ? ctor.text : '';
        if (!/Error$/.test(ctorName)) {
          return { rule: null, ambiguous: true };
        }
        const args = arg.arguments ?? [];
        if (args.length < 2) {
          return { rule: 'replacementErrorWithoutCause', ambiguous: false };
        }
        // Check second arg for { cause: ... }
        const opts = args[1];
        if (ts.isObjectLiteralExpression(opts)) {
          const hasCause = opts.properties.some((p) => {
            if (!ts.isPropertyAssignment(p) && !ts.isShorthandPropertyAssignment(p)) return false;
            const name = p.name && ts.isIdentifier(p.name) ? p.name.text : '';
            return name === 'cause';
          });
          if (!hasCause) {
            return { rule: 'replacementErrorWithoutCause', ambiguous: false };
          }
          return { rule: null, ambiguous: false };
        }
        return { rule: null, ambiguous: true };
      }
      // Rethrow of caught variable: harmless.
      return { rule: null, ambiguous: false };
    }
  }
  return { rule: null, ambiguous: true };
}

function findEnclosingSymbol(node) {
  let n = node;
  while (n) {
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.text;
    if (ts.isMethodDeclaration(n) && n.name && ts.isIdentifier(n.name)) return n.name.text;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) return n.name.text;
    if (ts.isFunctionExpression(n) && n.name) return n.name.text;
    n = n.parent;
  }
  return undefined;
}

function scanCatchFindings(filePath, source) {
  const findings = [];
  let sourceFile;
  try {
    sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  } catch {
    return findings;
  }

  const visit = (node) => {
    if (ts.isCatchClause(node)) {
      const classification = classifyCatchClause(node, sourceFile);
      if (classification.rule) {
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        findings.push({
          rule: classification.rule,
          line: pos.line + 1,
          column: pos.character + 1,
          symbol: findEnclosingSymbol(node),
        });
      }
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return findings;
}

function scanForbiddenWords(filePath, source) {
  const findings = [];
  if (
    !FORBIDDEN_WORDS_SCAN_PATHS.some((prefix) => filePath.startsWith(prefix) || filePath === prefix)
  ) {
    return findings;
  }
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const re of FORBIDDEN_WORDS) {
      if (re.test(lines[i])) {
        findings.push({
          rule: 'forbiddenPublicWording',
          line: i + 1,
          column: 1,
          excerpt: lines[i].slice(0, 120),
        });
      }
    }
  }
  return findings;
}

function classifySeverity(finding, filePath) {
  if (finding.rule === 'forbiddenPublicWording') {
    return 'BLOCKED';
  }
  // emptyCatch: BLOCKED only in sensitive paths to avoid noise on
  // capability-detection / cleanup / telemetry hooks. Report-only in
  // other production code.
  if (finding.rule === 'emptyCatch') {
    return isSensitivePath(filePath) ? 'BLOCKED' : 'REPORT-ONLY';
  }
  // replacementErrorWithoutCause: BLOCKED only in sensitive paths
  // (protocol / security / network / payment). Preserving cause is
  // uncontroversial there. In other production paths the same pattern
  // is report-only so the first gate stays narrow.
  if (finding.rule === 'replacementErrorWithoutCause') {
    return isSensitivePath(filePath) ? 'BLOCKED' : 'REPORT-ONLY';
  }
  // logAndContinue: BLOCKED in sensitive paths.
  if (finding.rule === 'logAndContinue') {
    return isSensitivePath(filePath) ? 'BLOCKED' : 'REPORT-ONLY';
  }
  // silentDefault: ambiguous (predicate functions and try-parsers are
  // widespread). Report-only until a sharper classifier is proven.
  if (finding.rule === 'silentDefault') {
    return 'REPORT-ONLY';
  }
  return 'REPORT-ONLY';
}

function shouldScanFile(p) {
  return isSourceFile(p);
}

function shouldScanText(p) {
  if (p.endsWith('.md') || p === 'CHANGELOG.md' || p === 'llms.txt') return true;
  return shouldScanFile(p);
}

function scanRepository(root) {
  const tracked = listTrackedFiles(root);
  const findings = [];

  for (const rel of tracked) {
    const abs = join(root, rel);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    let source;
    try {
      source = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }

    if (shouldScanFile(rel)) {
      for (const f of scanCatchFindings(rel, source)) {
        findings.push({ ...f, path: rel });
      }
    }

    if (shouldScanText(rel)) {
      for (const f of scanForbiddenWords(rel, source)) {
        findings.push({ ...f, path: rel });
      }
    }
  }
  return findings;
}

function evaluate(findings, allowlistEntries) {
  const blocked = [];
  const reportOnly = [];
  const allowed = [];
  for (const f of findings) {
    const severity = classifySeverity(f, f.path);
    if (severity === 'REPORT-ONLY') {
      reportOnly.push({ ...f, severity });
      continue;
    }
    const match = findingMatchesAllowlist(f, allowlistEntries);
    if (match) {
      allowed.push({ ...f, severity, allowlistMatch: match });
    } else {
      blocked.push({ ...f, severity });
    }
  }
  return { blocked, allowed, reportOnly };
}

function formatHuman(result, allowlistErrors) {
  const lines = [];
  if (allowlistErrors.length) {
    lines.push('Allowlist errors:');
    for (const e of allowlistErrors) lines.push(`  - ${e}`);
    lines.push('');
  }
  if (result.blocked.length) {
    lines.push(`BLOCKED (${result.blocked.length}):`);
    for (const f of result.blocked) {
      lines.push(`  ${f.path}:${f.line}  ${f.rule}${f.symbol ? ` in ${f.symbol}` : ''}`);
    }
    lines.push('');
  }
  if (result.allowed.length) {
    lines.push(`ALLOWED (${result.allowed.length}):`);
    for (const f of result.allowed) {
      lines.push(
        `  ${f.path}:${f.line}  ${f.rule}  [${f.allowlistMatch.category}: ${f.allowlistMatch.reason}]`
      );
    }
    lines.push('');
  }
  if (result.reportOnly.length) {
    lines.push(`report-only (${result.reportOnly.length}):`);
    for (const f of result.reportOnly) {
      lines.push(`  ${f.path}:${f.line}  ${f.rule}${f.symbol ? ` in ${f.symbol}` : ''}`);
    }
  }
  if (!result.blocked.length && !result.allowed.length && !result.reportOnly.length) {
    lines.push('No findings.');
  }
  return lines.join('\n') + '\n';
}

async function runScan(opts) {
  const allowlist = loadAllowlist(opts.allowlistPath);
  const findings = scanRepository(opts.root);
  const result = evaluate(findings, allowlist.entries);

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          blocked: result.blocked,
          allowed: result.allowed,
          reportOnly: result.reportOnly,
          allowlistErrors: allowlist.errors,
        },
        null,
        2
      ) + '\n'
    );
  } else {
    process.stdout.write(formatHuman(result, allowlist.errors));
  }

  if (allowlist.errors.length) return 2;
  if (result.blocked.length && !opts.reportOnly) return 1;
  return 0;
}

async function runSelfTest() {
  const fixturesDir = resolve(SCRIPT_DIR, 'tests/fixtures/error-path');
  if (!existsSync(fixturesDir)) {
    process.stderr.write(`fixtures dir missing: ${fixturesDir}\n`);
    return 2;
  }
  const cases = JSON.parse(readFileSync(resolve(fixturesDir, 'cases.json'), 'utf8'));
  let passed = 0;
  let failed = 0;
  const failures = [];
  for (const c of cases) {
    const filePath = resolve(fixturesDir, c.file);
    if (!existsSync(filePath)) {
      failures.push(`missing fixture file: ${c.file}`);
      failed++;
      continue;
    }
    const source = readFileSync(filePath, 'utf8');
    const trackedRel = c.relPath || c.file;
    const fileFindings = [];
    if (shouldScanFile(trackedRel)) {
      for (const f of scanCatchFindings(trackedRel, source)) {
        fileFindings.push({ ...f, path: trackedRel });
      }
    }
    if (shouldScanText(trackedRel)) {
      for (const f of scanForbiddenWords(trackedRel, source)) {
        fileFindings.push({ ...f, path: trackedRel });
      }
    }
    const allowlistEntries = c.allowlist || [];
    const result = evaluate(fileFindings, allowlistEntries);
    const expectBlocked = c.expectBlocked ?? 0;
    const expectAllowed = c.expectAllowed ?? 0;
    const expectReport = c.expectReportOnly;
    const okBlocked = result.blocked.length === expectBlocked;
    const okAllowed = result.allowed.length === expectAllowed;
    const okReport = expectReport === undefined ? true : result.reportOnly.length === expectReport;
    if (okBlocked && okAllowed && okReport) {
      passed++;
    } else {
      failed++;
      failures.push(
        `${c.name}: blocked=${result.blocked.length}/${expectBlocked} allowed=${result.allowed.length}/${expectAllowed} reportOnly=${result.reportOnly.length}/${expectReport ?? '*'}`
      );
    }
  }
  process.stdout.write(`self-test: ${passed} passed, ${failed} failed\n`);
  for (const f of failures) process.stdout.write(`  - ${f}\n`);
  return failed === 0 ? 0 : 1;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const code = opts.selfTest ? await runSelfTest() : await runScan(opts);
  process.exit(code);
}

main().catch((err) => {
  process.stderr.write(
    `verify-error-path-hygiene: ${err instanceof Error ? err.stack || err.message : String(err)}\n`
  );
  process.exit(2);
});
