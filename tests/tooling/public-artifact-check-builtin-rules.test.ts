/**
 * The public artifact linter and the commit-msg hook.
 *
 * A linter finding is reported as the rule id plus the location, never as the matched pattern or
 * the offending line. The commit message is resolved through git itself, so linked worktrees
 * (whose git directory is not `<root>/.git`) are checked rather than silently skipped.
 *
 * Both tools fail closed: an input they were asked to check but cannot read (a missing message
 * file, a missing or unreadable body file) is an error, never a pass.
 *
 * The cases run against throwaway repositories under the OS temp directory. Strings that match a
 * rule are assembled at run time so this file does not itself trip the linter.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-public-artifacts.mjs');
const HOOK = join(ROOT, '.githooks', 'commit-msg');

/** Marker placed on every offending line; it must never be echoed back. */
const LINE_MARKER = 'zzlinemarkerzz';

/** One entry per rule: its id and a line that triggers it (built at run time). */
const RULES: ReadonlyArray<{ id: string; line: string }> = [
  { id: 'hidden-unicode', line: `a${String.fromCharCode(0x200b)}b` },
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

describe('the commit message of a linked worktree is resolved through git', () => {
  it('the fixture really is a linked worktree', () => {
    expect(gitDirOf(linked)).toContain(join('.git', 'worktrees'));
    expect(gitDirOf(linked)).not.toBe(join(linked, '.git'));
  });

  it('the linter reads the worktree commit message and reports a violation', () => {
    writeMessage(`fix: update ${RULES[0].line}`);
    const r = linter('--no-staged');
    expect(r.status).toBe(1);
    expect(r.out).toContain('commit message:1: rule hidden-unicode');
  });

  it('the linter passes a clean worktree commit message', () => {
    writeMessage('fix: a clean technical message');
    const r = linter('--no-staged');
    expect(r.out).toContain('Public artifact check: OK');
    expect(r.status).toBe(0);
  });

  it('the hook reads the worktree commit message with and without a path argument', () => {
    const file = writeMessage('fix: a clean technical message');
    const withPath = hook(file);
    expect(withPath.out).toContain('[commit-msg] OK');
    expect(withPath.status).toBe(0);

    const withoutPath = hook();
    expect(withoutPath.out).toContain('[commit-msg] OK');
    expect(withoutPath.status).toBe(0);
  });
});

describe('a finding is reported as a rule id and a location, never as pattern text', () => {
  /** Fragments of the rule definitions that must not appear in any output. */
  const FORBIDDEN_FRAGMENTS = ['cryptographic', 'matched', 'u200'];

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
});

describe('both tools fail closed when an input cannot be read', () => {
  const missing = (name: string) => join(base, `does-not-exist-${name}`);

  it('the linter exits 2 for a missing body file and never reports OK', () => {
    const r = linter('--no-staged', '--no-commit-msg', '--body-file', missing('body.md'));
    expect(r.status).toBe(2);
    expect(r.out).toContain('cannot read body file');
    expect(r.out).not.toContain('Public artifact check: OK');
  });

  it('the linter exits 2 for a body file that is a directory', () => {
    const r = linter('--no-staged', '--no-commit-msg', '--body-file', base);
    expect(r.status).toBe(2);
    expect(r.out).not.toContain('Public artifact check: OK');
  });

  it('the linter exits 2 when --body-file or --text has no value', () => {
    for (const flag of ['--body-file', '--text']) {
      const r = linter('--no-staged', '--no-commit-msg', flag);
      expect(r.status, flag).toBe(2);
      expect(r.out, flag).toContain(`${flag} needs`);
      expect(r.out, flag).not.toContain('Public artifact check: OK');
    }
  });

  it('the linter still passes a readable clean body file', () => {
    const file = join(base, 'clean-body.md');
    writeFileSync(file, 'A clean technical body.\n');
    const r = linter('--no-staged', '--no-commit-msg', '--body-file', file);
    expect(r.status).toBe(0);
    expect(r.out).toContain('Public artifact check: OK');
  });

  it('the hook fails for a missing message file and never reports OK', () => {
    const r = hook(missing('message'));
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('rule message-file-unreadable');
    expect(r.out).not.toContain('[commit-msg] OK');
  });

  it('the hook fails when the message path is a directory', () => {
    const r = hook(base);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('rule message-file-unreadable');
    expect(r.out).not.toContain('[commit-msg] OK');
  });

  it('the hook fails on the no-argument path when the worktree has no message file', () => {
    rmSync(join(gitDirOf(linked), 'COMMIT_EDITMSG'), { force: true });
    const r = hook();
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('rule message-file-unreadable');
    expect(r.out).not.toContain('[commit-msg] OK');
  });

  it('the hook fails on the no-argument path outside a repository', () => {
    const outside = mkdtempSync(join(base, 'outside-'));
    const r = run('bash', [HOOK], outside);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('rule message-file-unreadable');
    expect(r.out).not.toContain('[commit-msg] OK');
  });
});
