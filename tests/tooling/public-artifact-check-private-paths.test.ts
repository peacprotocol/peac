/**
 * The public artifact linter and the commit-msg hook use built-in rules only.
 *
 * Neither tool may read a pattern file from a path inside this repository, because patterns kept
 * in a tracked or in-tree location are a disclosure risk. Neither may print a matched pattern or
 * the offending line: a finding is reported as the built-in rule id plus the location. The
 * commit message must be resolved through git itself so that linked worktrees (whose git
 * directory is not `<root>/.git`) are checked rather than silently skipped.
 *
 * The behavioural cases run both tools against throwaway repositories created under the OS temp
 * directory, so no state of the repository under test is read or modified. Strings that match a
 * built-in rule are assembled at run time so this file does not itself trip the linter.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-public-artifacts.mjs');
const HOOK = join(ROOT, '.githooks', 'commit-msg');

/** Fixture-only token used to prove an in-tree pattern file is ignored. */
const FIXTURE_TOKEN = 'zzfixturetokenzz';
/** The name of the pattern file the tools used to read; assembled so this file does not name it. */
const PATTERN_FILE = ['guard', 'denylist.txt'].join('-');
/** Marker placed on every offending line; it must never be echoed back. */
const LINE_MARKER = 'zzlinemarkerzz';

/** One entry per built-in rule: its id and a line that triggers it (built at run time). */
const RULES: ReadonlyArray<{ id: string; line: string }> = [
  {
    id: 'local-reference-path',
    line: `see ${['reference', '/', 'NOTES', '_LOCAL', '.md'].join('')}`,
  },
  { id: 'hidden-unicode', line: `a${String.fromCharCode(0x200b)}b` },
  { id: 'local-memory-file', line: `see ${['MEMORY', '.md'].join('')}` },
  {
    id: 'retired-tagline',
    line: ['cryptographic', 'receipts', 'for', 'agentic', 'commerce'].join(' '),
  },
];

let base: string;
let mainRepo: string;
let linked: string;
let env: Record<string, string>;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
}

/** The per-worktree git directory, computed independently of the code under test. */
function gitDirOf(cwd: string): string {
  return git(cwd, 'rev-parse', '--absolute-git-dir');
}

function run(
  cmd: string,
  args: string[],
  cwd: string
): { status: number; out: string; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8' });
  return {
    status: r.status ?? -1,
    out: `${r.stdout}${r.stderr}`,
    stdout: r.stdout,
    stderr: r.stderr,
  };
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'peac-artifact-check-'));
  // A clean environment: no inherited GIT_* variables (this suite can run inside a git hook) and
  // no global or system git configuration (so no machine-wide hook path applies to the fixtures).
  env = {
    PATH: process.env.PATH ?? '',
    HOME: base,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    LANG: 'C',
  };
  mainRepo = join(base, 'main');
  linked = join(base, 'linked');
  mkdirSync(mainRepo);
  git(mainRepo, 'init', '-q', '-b', 'main');
  git(
    mainRepo,
    '-c',
    'user.name=fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'fixture',
    '--no-gpg-sign'
  );
  git(mainRepo, 'worktree', 'add', '-q', '-b', 'fixture-branch', linked);
  // The linter locates its repository from its own path, so it is run from a copy that lives
  // inside the linked worktree.
  mkdirSync(join(linked, 'scripts'));
  copyFileSync(SCRIPT, join(linked, 'scripts', 'check-public-artifacts.mjs'));
  // An in-tree pattern file with a fixture-only token. A tool that reads it would act on it.
  mkdirSync(join(linked, 'reference'));
  writeFileSync(join(linked, 'reference', PATTERN_FILE), `${FIXTURE_TOKEN}\n`);
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

const linter = (...args: string[]) =>
  run(process.execPath, [join(linked, 'scripts', 'check-public-artifacts.mjs'), ...args], linked);
const hook = (...args: string[]) => run('bash', [HOOK, ...args], linked);

function writeMessage(text: string): string {
  const file = join(gitDirOf(linked), 'COMMIT_EDITMSG');
  writeFileSync(file, `${text}\n`);
  return file;
}

describe('no private path is referenced', () => {
  it.each([
    ['scripts/check-public-artifacts.mjs', SCRIPT],
    ['.githooks/commit-msg', HOOK],
  ])('%s names no pattern file and no external pattern source', (_name, file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).not.toContain(PATTERN_FILE.replace('.txt', ''));
    expect(source).not.toMatch(/denylist/i);
  });

  it('the linter ignores a pattern file placed inside the repository', () => {
    const r = linter('--no-staged', '--no-commit-msg', '--text', `a line with ${FIXTURE_TOKEN}`);
    expect(r.out).toContain('Public artifact check: OK');
    expect(r.status).toBe(0);
  });

  it('the hook ignores a pattern file placed inside the repository', () => {
    const file = writeMessage(`fix: a line with ${FIXTURE_TOKEN}`);
    const r = hook(file);
    expect(r.out).toContain('[commit-msg] OK');
    expect(r.status).toBe(0);
  });
});

describe('the commit message of a linked worktree is resolved through git', () => {
  it('the fixture really is a linked worktree', () => {
    expect(gitDirOf(linked)).toContain(join('.git', 'worktrees'));
    expect(gitDirOf(linked)).not.toBe(join(linked, '.git'));
  });

  it('the linter reads the worktree commit message and reports a violation', () => {
    writeMessage(`fix: update ${RULES[0].line}`);
    const r = linter('--no-staged');
    expect(r.status).toBe(1);
    expect(r.out).toContain('commit message:1: rule local-reference-path');
  });

  it('the linter passes a clean worktree commit message', () => {
    writeMessage('fix: a clean technical message');
    const r = linter('--no-staged');
    expect(r.out).toContain('Public artifact check: OK');
    expect(r.status).toBe(0);
  });

  it('the hook resolves the worktree commit message when no path is given', () => {
    writeMessage('fix: a clean technical message');
    const clean = hook();
    expect(clean.out).toContain('[commit-msg] OK');
    expect(clean.status).toBe(0);

    writeMessage(`fix: update ${RULES[0].line}`);
    const bad = hook();
    expect(bad.status).toBe(1);
    expect(bad.out).toContain('rule local-reference-path');
    expect(bad.out).toContain('COMMIT_EDITMSG');
  });
});

describe('a finding is reported as a rule id and a location, never as pattern text', () => {
  /** Fragments of the rule definitions that must not appear in any output. */
  const FORBIDDEN_FRAGMENTS = ['_LOCAL', 'MEMORY', 'cryptographic', 'matched /', 'u200', '\\/'];

  it.each(RULES)('linter, inline text, rule $id', ({ id, line }) => {
    const r = linter('--no-staged', '--no-commit-msg', '--text', `${line} ${LINE_MARKER}`);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`inline text:1: rule ${id}`);
    expect(r.out).not.toContain(LINE_MARKER);
    for (const fragment of FORBIDDEN_FRAGMENTS) expect(r.out).not.toContain(fragment);
  });

  it.each(RULES)('linter, body file, rule $id', ({ id, line }) => {
    const file = join(base, `body-${id}.md`);
    writeFileSync(file, `first line\n${line} ${LINE_MARKER}\n`);
    const r = linter('--no-staged', '--no-commit-msg', '--body-file', file);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`:2: rule ${id}`);
    expect(r.out).not.toContain(LINE_MARKER);
    for (const fragment of FORBIDDEN_FRAGMENTS) expect(r.out).not.toContain(fragment);
  });

  it('the hook reports the rule id and the message file, not the pattern or the line text', () => {
    const file = writeMessage(`fix: first\n${RULES[0].line} ${LINE_MARKER}`);
    const r = hook(file);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`rule local-reference-path in ${file}`);
    expect(r.out).not.toContain(LINE_MARKER);
    for (const fragment of FORBIDDEN_FRAGMENTS) expect(r.out).not.toContain(fragment);
  });

  it('the hook reports the planning-marker rule by id', () => {
    const marker = ['NEXT', '_STEPS'].join('');
    const file = writeMessage(`fix: see ${marker} ${LINE_MARKER}`);
    const r = hook(file);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`rule planning-marker in ${file}`);
    expect(r.out).not.toContain(marker);
    expect(r.out).not.toContain(LINE_MARKER);
  });
});
