/**
 * Key-fetch address policy and connection target tests.
 *
 * The vector file is shared with @peac/net-node so both fetch paths apply
 * the same address policy.
 */

import { readFileSync } from 'node:fs';
import net, { isIP } from 'node:net';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isBlockedIP, ssrfSafeFetch } from '../src/ssrf-safe-fetch';

interface Vector {
  ip: string;
  note: string;
}

const vectors = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/address-policy/vectors.json'), 'utf8')
) as { blocked: Vector[]; allowed: Vector[] };

type LookupAddress = { address: string; family: number };
type LookupFn = (
  hostname: string,
  options: { all: true },
  callback: (err: Error | null, addresses: LookupAddress[]) => void
) => void;

const dnsState = vi.hoisted(() => ({
  resolve4Answers: [] as string[][],
  resolve6Answers: [] as string[][],
  resolve4Calls: 0,
  resolve6Calls: 0,
  realLookup: undefined as unknown,
}));

function nextAnswer(queue: string[][], call: number): string[] | undefined {
  if (queue.length === 0) return undefined;
  return queue[Math.min(call, queue.length - 1)];
}

vi.mock('dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dns')>();
  dnsState.realLookup = actual.lookup;
  const noData = (): NodeJS.ErrnoException =>
    Object.assign(new Error('no data'), { code: 'ENODATA' });
  const resolve4 = (
    _hostname: string,
    callback: (err: NodeJS.ErrnoException | null, addresses: string[]) => void
  ): void => {
    const answer = nextAnswer(dnsState.resolve4Answers, dnsState.resolve4Calls++);
    if (answer === undefined) callback(noData(), []);
    else callback(null, answer);
  };
  const resolve6 = (
    _hostname: string,
    callback: (err: NodeJS.ErrnoException | null, addresses: string[]) => void
  ): void => {
    const answer = nextAnswer(dnsState.resolve6Answers, dnsState.resolve6Calls++);
    if (answer === undefined) callback(noData(), []);
    else callback(null, answer);
  };
  return { ...actual, default: { ...actual, resolve4, resolve6 }, resolve4, resolve6 };
});

describe('isBlockedIP address policy vectors', () => {
  it.each(vectors.blocked)('blocks $ip ($note)', ({ ip }) => {
    expect(isBlockedIP(ip).blocked).toBe(true);
  });

  it.each(vectors.allowed)('allows $ip ($note)', ({ ip }) => {
    expect(isBlockedIP(ip).blocked).toBe(false);
  });

  it('keeps the specific reason for loopback and link-local forms', () => {
    expect(isBlockedIP('127.0.0.1')).toEqual({ blocked: true, reason: 'loopback' });
    expect(isBlockedIP('::1')).toEqual({ blocked: true, reason: 'loopback' });
    expect(isBlockedIP('::ffff:7f00:1')).toEqual({ blocked: true, reason: 'loopback' });
    expect(isBlockedIP('169.254.169.254')).toEqual({ blocked: true, reason: 'link_local' });
    expect(isBlockedIP('fe80::1')).toEqual({ blocked: true, reason: 'link_local' });
    expect(isBlockedIP('10.0.0.1')).toEqual({ blocked: true, reason: 'private_ip' });
  });
});

describe('key fetch connection target', () => {
  const VETTED_PUBLIC = '93.184.216.34';
  let attempts: string[][];
  let targets: Array<{ host: unknown; servername: unknown }>;
  let connectSpy: ReturnType<typeof vi.spyOn>;

  function resolveTarget(options: Record<string, unknown>): Promise<string[]> {
    const host = typeof options.host === 'string' ? options.host : 'localhost';
    if (isIP(host) !== 0) return Promise.resolve([host]);
    const lookup = (
      typeof options.lookup === 'function' ? options.lookup : dnsState.realLookup
    ) as LookupFn;
    return new Promise((resolve) => {
      lookup(host, { all: true }, (err, addresses) => {
        resolve(err ? [] : addresses.map((a) => a.address));
      });
    });
  }

  beforeEach(() => {
    dnsState.resolve4Answers = [];
    dnsState.resolve6Answers = [];
    dnsState.resolve4Calls = 0;
    dnsState.resolve6Calls = 0;
    attempts = [];
    targets = [];
    // Record the address every outgoing socket would reach, then fail it locally.
    connectSpy = vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (
      this: net.Socket,
      ...args: unknown[]
    ) {
      const first = args[0];
      const options =
        typeof first === 'object' && first !== null ? (first as Record<string, unknown>) : {};
      targets.push({ host: options.host, servername: options.servername });
      void resolveTarget(options).then((addresses) => {
        attempts.push(addresses);
        this.destroy(new Error('connection refused by test harness'));
      });
      return this;
    } as unknown as typeof net.Socket.prototype.connect);
  });

  afterEach(() => {
    connectSpy.mockRestore();
  });

  it('connects only to the address vetted at resolution time', async () => {
    // First resolution is public; any later resolution of the same name is loopback.
    dnsState.resolve4Answers = [[VETTED_PUBLIC], ['127.0.0.1']];

    const result = await ssrfSafeFetch('https://localhost/.well-known/jwks.json', {
      timeoutMs: 2000,
    });

    expect(result.ok).toBe(false);
    expect(attempts.length).toBeGreaterThan(0);
    const reached = attempts.flat();
    expect(reached).toContain(VETTED_PUBLIC);
    for (const address of reached) {
      expect(isBlockedIP(address).blocked).toBe(false);
    }
    // The URL host is kept for the Host header and TLS server name.
    for (const target of targets) {
      expect(target).toEqual({ host: 'localhost', servername: 'localhost' });
    }
  });

  it('fails closed on an empty DNS answer without connecting', async () => {
    dnsState.resolve4Answers = [[]];
    dnsState.resolve6Answers = [[]];

    const result = await ssrfSafeFetch('https://keys.example.com/jwks.json', { timeoutMs: 2000 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('dns_failure');
    expect(attempts).toEqual([]);
  });

  it('rejects a hex IPv4-mapped loopback answer without connecting', async () => {
    dnsState.resolve4Answers = [[VETTED_PUBLIC]];
    dnsState.resolve6Answers = [['::ffff:7f00:1']];

    const result = await ssrfSafeFetch('https://keys.example.com/jwks.json', { timeoutMs: 2000 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('loopback');
    expect(attempts).toEqual([]);
  });

  it('rejects a NAT64 answer without connecting', async () => {
    dnsState.resolve6Answers = [['64:ff9b::a9fe:a9fe']];

    const result = await ssrfSafeFetch('https://keys.example.com/jwks.json', { timeoutMs: 2000 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('private_ip');
    expect(attempts).toEqual([]);
  });
});
