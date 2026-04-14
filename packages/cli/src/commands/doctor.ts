/**
 * `peac doctor`: installability diagnostics.
 *
 * Runs a fixed set of offline-first checks that flag common PEAC
 * installation problems (Node version, required package resolution,
 * tracked config presence). Remote checks (JWKS reachability, reference
 * verifier reachability) are opt-in via the --online flag; by default
 * the command performs zero network calls.
 *
 * Each check reports green / yellow / red. Exit code is 0 when all
 * required checks are green or yellow; 1 when any required check is
 * red.
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const requireFrom = createRequire(path.join(process.cwd(), 'package.json'));

type Status = 'green' | 'yellow' | 'red';

interface CheckResult {
  name: string;
  status: Status;
  detail: string;
}

function paint(status: Status, msg: string): string {
  const labels: Record<Status, string> = {
    green: 'PASS',
    yellow: 'WARN',
    red: 'FAIL',
  };
  return `[${labels[status]}] ${msg}`;
}

function parseMajor(nodeVersion: string): number {
  // process.version is e.g. "v22.19.0"
  const m = /^v(\d+)\./.exec(nodeVersion);
  return m ? parseInt(m[1]!, 10) : 0;
}

function checkNodeVersion(): CheckResult {
  const major = parseMajor(process.version);
  if (major >= 22) {
    return {
      name: 'Node version',
      status: 'green',
      detail: `${process.version} (>= 22 required)`,
    };
  }
  return {
    name: 'Node version',
    status: 'red',
    detail: `${process.version} is below the required Node >= 22`,
  };
}

function checkPackageResolution(): CheckResult {
  const required = ['@peac/protocol', '@peac/crypto', '@peac/schema', '@peac/kernel'];
  const missing: string[] = [];
  for (const pkg of required) {
    try {
      requireFrom.resolve(pkg);
    } catch {
      missing.push(pkg);
    }
  }
  if (missing.length === 0) {
    return {
      name: 'Package resolution',
      status: 'green',
      detail: `${required.length} required packages resolvable`,
    };
  }
  return {
    name: 'Package resolution',
    status: 'red',
    detail: `${missing.length} missing: ${missing.join(', ')}`,
  };
}

function checkKeyMaterial(cwd: string): CheckResult {
  const env = process.env.PEAC_ISSUER_KEY || '';
  if (env) {
    if (env.startsWith('env:') || env.startsWith('file:')) {
      return {
        name: 'Issuer key material',
        status: 'green',
        detail: `PEAC_ISSUER_KEY set via ${env.split(':')[0]}:... scheme`,
      };
    }
    return {
      name: 'Issuer key material',
      status: 'yellow',
      detail: 'PEAC_ISSUER_KEY set but not using env: or file: scheme',
    };
  }
  // Also look for a conventional ed25519 JWK file at the project root.
  const candidatePaths = [
    path.join(cwd, 'issuer.jwk.json'),
    path.join(cwd, '.peac/issuer.jwk.json'),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return {
        name: 'Issuer key material',
        status: 'yellow',
        detail: `found ${path.relative(cwd, p)}; prefer PEAC_ISSUER_KEY env var`,
      };
    }
  }
  return {
    name: 'Issuer key material',
    status: 'yellow',
    detail: 'not found (issuance disabled; read-only tools still work)',
  };
}

function checkPeacTxt(cwd: string): CheckResult {
  const p = path.join(cwd, '.well-known/peac.txt');
  if (fs.existsSync(p)) {
    return {
      name: 'peac.txt presence',
      status: 'green',
      detail: `.well-known/peac.txt present at ${p}`,
    };
  }
  return {
    name: 'peac.txt presence',
    status: 'yellow',
    detail: 'no .well-known/peac.txt (discovery-layer check; optional for tool callers)',
  };
}

async function checkOnlineJwks(issuerUrl: string, timeoutMs: number): Promise<CheckResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const cfgUrl = new URL('/.well-known/peac-issuer.json', issuerUrl).toString();
    const res = await fetch(cfgUrl, { signal: ctrl.signal });
    if (res.status !== 200) {
      return {
        name: 'Issuer configuration',
        status: 'red',
        detail: `${cfgUrl} returned ${res.status}`,
      };
    }
    const cfg = (await res.json()) as { jwks_uri?: string };
    const jwksUri = cfg.jwks_uri;
    if (!jwksUri) {
      return {
        name: 'Issuer configuration',
        status: 'red',
        detail: `${cfgUrl} missing jwks_uri`,
      };
    }
    const jwksRes = await fetch(jwksUri, { signal: ctrl.signal });
    if (jwksRes.status !== 200) {
      return {
        name: 'Issuer configuration',
        status: 'red',
        detail: `jwks_uri ${jwksUri} returned ${jwksRes.status}`,
      };
    }
    const jwks = (await jwksRes.json()) as { keys?: unknown[] };
    const keyCount = Array.isArray(jwks.keys) ? jwks.keys.length : 0;
    if (keyCount === 0) {
      return {
        name: 'Issuer configuration',
        status: 'red',
        detail: `jwks_uri ${jwksUri} returned empty keys array`,
      };
    }
    return {
      name: 'Issuer configuration',
      status: 'green',
      detail: `${cfgUrl} + jwks_uri resolvable with ${keyCount} key(s)`,
    };
  } catch (err: unknown) {
    return {
      name: 'Issuer configuration',
      status: 'red',
      detail: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runDoctor(options: {
  online: boolean;
  issuer?: string;
  timeout: number;
  cwd: string;
}): Promise<number> {
  const results: CheckResult[] = [];
  results.push(checkNodeVersion());
  results.push(checkPackageResolution());
  results.push(checkKeyMaterial(options.cwd));
  results.push(checkPeacTxt(options.cwd));

  if (options.online) {
    if (!options.issuer) {
      results.push({
        name: 'Issuer configuration',
        status: 'yellow',
        detail: '--online set but --issuer <url> not provided; skipping remote check',
      });
    } else {
      results.push(await checkOnlineJwks(options.issuer, options.timeout));
    }
  } else {
    results.push({
      name: 'Issuer configuration',
      status: 'yellow',
      detail: 'offline mode (default); pass --online --issuer <url> to enable remote check',
    });
  }

  console.log('\npeac doctor');
  console.log('-----------');
  for (const r of results) {
    console.log(paint(r.status, `${r.name}: ${r.detail}`));
  }

  const hasRed = results.some((r) => r.status === 'red');
  console.log(hasRed ? '\nFAIL: one or more checks are red.' : '\nOK: no red checks.');
  return hasRed ? 1 : 0;
}

export function doctor(program: Command): void {
  program
    .command('doctor')
    .description('Run PEAC installability diagnostics (offline by default)')
    .option('--online', 'enable remote checks (issuer configuration, JWKS)', false)
    .option('--issuer <url>', 'issuer URL for --online checks (https://...)')
    .option(
      '--timeout <ms>',
      'timeout for remote checks in milliseconds',
      (v) => parseInt(v, 10),
      5000
    )
    .action(async (opts: { online: boolean; issuer?: string; timeout: number }) => {
      const exitCode = await runDoctor({
        online: !!opts.online,
        issuer: opts.issuer,
        timeout: opts.timeout,
        cwd: process.cwd(),
      });
      process.exit(exitCode);
    });
}
