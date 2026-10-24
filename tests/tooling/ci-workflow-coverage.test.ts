/**
 * CI coverage and publishing-default wiring.
 *
 * These assertions pin the wiring of the pull-request pipeline rather than the exact shape of
 * the workflow files, so unrelated edits do not break them:
 *
 *   - the application test suites (@peac/mcp-server, @peac/server) run on pull requests and
 *     block the required aggregate check without renaming it;
 *   - the Go workflow covers every Go module, the module set and `go.work` agree, and
 *     Dependabot watches every module directory;
 *   - the MCP Registry workflow defaults to a dry run, publishes only on an explicit opt-in,
 *     and installs a checksum-pinned release;
 *   - no workflow carries a step guarded solely by files that no longer exist;
 *   - one dependency-update tool (Dependabot) is configured.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

interface Step {
  name?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
}
interface Job {
  name?: string;
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  steps?: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
}
const workflow = (file: string): Workflow => parse(read(`.github/workflows/${file}`)) as Workflow;
const stepsOf = (job: Job): Step[] => job.steps ?? [];

/** Directories (relative to the repo root) that hold a Go module, discovered rather than listed. */
function goModuleDirs(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'go.mod') found.push(relative(ROOT, dir).split('\\').join('/'));
    }
  };
  walk(join(ROOT, 'sdks', 'go'));
  return found.sort();
}

describe('the application test suites run on pull requests', () => {
  const ci = workflow('ci.yml');
  const job = ci.jobs['server-tests'];

  it('the required aggregate check keeps its name', () => {
    expect(ci.jobs.ci.name).toBe('Build, Lint, Test');
  });

  it('a dedicated, visible job runs both suites', () => {
    expect(job, 'the server-tests job is not defined').toBeDefined();
    expect(job.name).toBe('MCP Server and Server Tests');
    const commands = stepsOf(job)
      .map((s) => s.run ?? '')
      .join('\n');
    expect(commands).toContain('turbo run test');
    expect(commands).toContain('--filter=@peac/mcp-server');
    expect(commands).toContain('--filter=@peac/server');
  });

  it.each([
    ['packages/mcp-server/package.json', '@peac/mcp-server'],
    ['packages/server/package.json', '@peac/server'],
  ])('%s declares the package name and a test script the filter will run', (file, name) => {
    const pkg = JSON.parse(read(file)) as { name: string; scripts?: Record<string, string> };
    expect(pkg.name).toBe(name);
    expect(pkg.scripts?.test).toBeTruthy();
  });

  it('activates for source, CI and root-config changes and on main', () => {
    expect(job.if).toContain("github.ref == 'refs/heads/main'");
    for (const output of ['core', 'adapters', 'any_src', 'ci', 'root_config']) {
      expect(job.if).toContain(`needs.detect-changes.outputs.${output} == 'true'`);
    }
  });

  it('is a dependency of the required aggregate and its failure blocks it', () => {
    const needs = ci.jobs.ci.needs;
    expect(Array.isArray(needs) ? needs : [needs]).toContain('server-tests');
    const aggregate = stepsOf(ci.jobs.ci)
      .map((s) => s.run ?? '')
      .join('\n');
    // Being in `needs` is not sufficient: the aggregate runs with `if: always()` and decides per
    // lane, so a lane whose failure is not inspected would never block a merge.
    expect(aggregate).toMatch(
      /needs\.server-tests\.result.*==.*["']failure["'][\s\S]{0,200}exit 1/
    );
  });
});

describe('the Go workflow covers every module', () => {
  const modules = goModuleDirs();
  const goSdk = workflow('go-sdk.yml');
  const goMod = read('sdks/go/go.mod');
  const floor = /^go (\d+\.\d+)/m.exec(goMod)?.[1];
  /** The jobs that run every module: the floor toolchain and the newest supported release line. */
  const testJobs = ['test', 'test-newest-go'] as const;

  it('discovers the expected module set', () => {
    // The set is read from disk, never from this test. This guards the discovery itself: a
    // module that disappeared or was added without being noticed changes the count.
    expect(modules.length).toBeGreaterThanOrEqual(7);
    expect(modules).toContain('sdks/go');
    for (const dir of ['bench', 'middleware/chi', 'middleware/echo', 'middleware/gin']) {
      expect(modules).toContain(`sdks/go/${dir}`);
    }
    for (const dir of ['middleware/nethttp', 'middleware/paritytest']) {
      expect(modules).toContain(`sdks/go/${dir}`);
    }
  });

  it('go.work lists every module', () => {
    const work = read('sdks/go/go.work');
    const block = /use \(([\s\S]*?)\)/.exec(work)?.[1] ?? '';
    const listed = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => (l === '.' ? 'sdks/go' : `sdks/go/${l.replace(/^\.\//, '')}`))
      .sort();
    expect(listed).toEqual(modules);
  });

  it.each(['push', 'pull_request'])(
    'the %s path filter covers SDK and conformance data',
    (event) => {
      const paths = (goSdk.on[event] as { paths: string[] }).paths;
      expect(paths).toContain('sdks/go/**');
      expect(paths).toContain('specs/conformance/**');
      expect(paths).toContain('.github/workflows/go-sdk.yml');
    }
  );

  it.each(testJobs)(
    'job %s builds, vets and tests every module with workspace mode off',
    (name) => {
      const job = goSdk.jobs[name];
      expect(job, `the ${name} job is not defined`).toBeDefined();
      const step = stepsOf(job).find((s) => (s.run ?? '').includes('go vet ./...'));
      expect(step, 'no step vets the modules').toBeDefined();
      expect(String(step?.env?.GOWORK)).toBe('off');
      const script = step?.run ?? '';
      // Modules are discovered, so a new module is covered without a workflow edit.
      expect(script).toContain('find . -name go.mod');
      expect(script).toContain('go build ./...');
      expect(script).toContain('go test ./...');
      // The loop proves it visited every module.
      expect(script).toMatch(/test "\$\{count\}" -eq/);
    }
  );

  it.each(testJobs)('job %s checks in CI that go.work and the module set agree', (name) => {
    const script = stepsOf(goSdk.jobs[name])
      .map((s) => s.run ?? '')
      .join('\n');
    expect(script).toContain('go list -m');
  });

  it('tests the module floor and a newer supported Go release', () => {
    expect(floor, 'the go directive of sdks/go/go.mod was not found').toBeDefined();
    const setupOf = (name: string) =>
      stepsOf(goSdk.jobs[name]).find((s) => s.name === 'Setup Go') as unknown as {
        with: Record<string, string>;
      };
    // The floor job resolves its toolchain from the module's own `go` directive.
    expect(setupOf('test').with['go-version-file']).toBe('sdks/go/go.mod');
    // The second job pins a newer release line than the floor.
    const newer = String(setupOf('test-newest-go').with['go-version']);
    expect(newer).toMatch(/^\d+\.\d+$/);
    const minor = (v: string) => Number(v.split('.')[1]);
    expect(minor(newer)).toBeGreaterThan(minor(floor as string));
    expect(goSdk.jobs['test-newest-go'].needs).toBe('lint');
  });

  it('Dependabot watches every module directory', () => {
    const config = parse(read('.github/dependabot.yml')) as {
      updates: { 'package-ecosystem': string; directory: string }[];
    };
    const watched = config.updates
      .filter((u) => u['package-ecosystem'] === 'gomod')
      .map((u) => u.directory.replace(/^\//, ''))
      .sort();
    expect(watched).toEqual(modules);
  });
});

describe('the MCP Registry workflow defaults to a dry run', () => {
  const wf = workflow('publish-mcp-registry.yml');
  const job = wf.jobs['publish-mcp-registry'];
  const text = read('.github/workflows/publish-mcp-registry.yml');

  it('is dispatch-only and the dry_run input defaults to true', () => {
    expect(Object.keys(wf.on)).toEqual(['workflow_dispatch']);
    const input = (wf.on.workflow_dispatch as { inputs: { dry_run: Record<string, unknown> } })
      .inputs.dry_run;
    expect(input.type).toBe('boolean');
    expect(input.default).toBe(true);
  });

  it('logs in only on an explicit dry_run=false', () => {
    const login = stepsOf(job).find((s) => (s.run ?? '').includes('login github-oidc'));
    expect(login, 'the login step is missing').toBeDefined();
    expect(login?.if).toContain("github.event.inputs.dry_run == 'false'");
  });

  it('publishes only on an explicit dry_run=false', () => {
    const publish = stepsOf(job).find((s) => (s.run ?? '').includes('mcp-publisher publish'));
    expect(publish, 'the publish step is missing').toBeDefined();
    const script = publish?.run ?? '';
    expect(script).toMatch(
      /if \[ "\$DRY_RUN" = "false" \]; then\s+\.\.\/\.\.\/mcp-publisher publish/
    );
    expect(publish?.env?.DRY_RUN).toContain('github.event.inputs.dry_run');
  });

  it('installs a checksum-pinned publisher release that matches its labels', () => {
    const install = stepsOf(job).find((s) => (s.name ?? '').startsWith('Install mcp-publisher'));
    expect(install, 'the install step is missing').toBeDefined();
    const env = install?.env ?? {};
    const version = env.MCP_PUBLISHER_VERSION;
    expect(version).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(install?.name).toContain(`pinned to ${version}`);
    expect(text).toContain(`releases/tag/${version}`);
    expect(env.CHECKSUM_LINUX_AMD64).toMatch(/^[0-9a-f]{64}$/);
    expect(env.CHECKSUM_LINUX_ARM64).toMatch(/^[0-9a-f]{64}$/);
    expect(env.CHECKSUM_LINUX_AMD64).not.toBe(env.CHECKSUM_LINUX_ARM64);
    // The checksums are verified before extraction.
    const script = install?.run ?? '';
    expect(script.indexOf('sha256sum')).toBeGreaterThan(-1);
    expect(script.indexOf('sha256sum')).toBeLessThan(script.indexOf('tar xzf'));
  });

  it('keeps read-only defaults and elevates only the publishing job', () => {
    expect(wf.permissions).toEqual({ contents: 'read' });
    expect(job.permissions).toEqual({ 'id-token': 'write', contents: 'read' });
  });
});

describe('workflow hygiene for the files this wiring touches', () => {
  const files = readdirSync(join(ROOT, '.github', 'workflows')).filter((f) => f.endsWith('.yml'));

  it.each(['ci.yml', 'go-sdk.yml', 'nightly.yml', 'publish-mcp-registry.yml'])(
    '%s declares least-privilege default permissions',
    (file) => {
      expect(workflow(file).permissions).toEqual({ contents: 'read' });
    }
  );

  it('no workflow uses pull_request_target', () => {
    for (const file of files) {
      expect(workflow(file).on, file).not.toHaveProperty('pull_request_target');
    }
  });

  it('nightly.yml has no step guarded only by files that do not exist', () => {
    const text = read('.github/workflows/nightly.yml');
    const guarded = [...text.matchAll(/\[ -f "([^"$]+)" \]/g)].map((m) => m[1]);
    for (const path of guarded) {
      expect(existsSync(join(ROOT, path)), `${path} does not exist`).toBe(true);
    }
    expect(
      stepsOf(workflow('nightly.yml').jobs['full-test-suite']).map((s) => s.name)
    ).not.toContain('Integration checks');
  });
});

describe('one dependency-update tool is configured', () => {
  it('Dependabot is configured and the unused Renovate config is gone', () => {
    expect(existsSync(join(ROOT, '.github', 'dependabot.yml'))).toBe(true);
    expect(existsSync(join(ROOT, 'renovate.json'))).toBe(false);
    expect(read('.github/workflows/ci.yml')).not.toContain('renovate.json');
  });
});
