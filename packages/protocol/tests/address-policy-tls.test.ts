/**
 * Key fetches against a local TLS server.
 *
 * The address policy is narrowed so that 127.0.0.1 stands in for a global
 * address; every other address keeps the real policy.
 */

import { createSign, generateKeyPairSync, randomBytes, X509Certificate } from 'node:crypto';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import type { TLSSocket } from 'node:tls';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ssrfSafeFetch } from '../src/ssrf-safe-fetch';

const state = vi.hoisted(() => ({
  allow: new Set<string>(),
  answers: new Map<string, string[]>(),
  resolveCalls: [] as string[],
  ca: '',
}));

vi.mock('../src/_internal/address-policy.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/_internal/address-policy.js')>();
  return {
    ...actual,
    classifyAddress: (ip: string) =>
      state.allow.has(ip) ? { allowed: true } : actual.classifyAddress(ip),
  };
});

vi.mock('dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dns')>();
  const noData = (): NodeJS.ErrnoException =>
    Object.assign(new Error('no data'), { code: 'ENODATA' });
  const resolve4 = (
    hostname: string,
    callback: (err: NodeJS.ErrnoException | null, addresses: string[]) => void
  ): void => {
    state.resolveCalls.push(hostname);
    const answer = state.answers.get(hostname);
    if (answer === undefined) callback(noData(), []);
    else callback(null, answer);
  };
  const resolve6 = (
    _hostname: string,
    callback: (err: NodeJS.ErrnoException | null, addresses: string[]) => void
  ): void => {
    callback(noData(), []);
  };
  return { ...actual, default: { ...actual, resolve4, resolve6 }, resolve4, resolve6 };
});

vi.mock('https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('https')>();
  const request = ((url: URL, options: https.RequestOptions, callback: () => void) =>
    actual.request(url, { ...options, ca: state.ca }, callback)) as typeof actual.request;
  return { ...actual, default: { ...actual, request }, request };
});

// Minimal DER encoder for a self-signed test certificate.
function derLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  for (let n = length; n > 0; n = Math.floor(n / 256)) bytes.unshift(n % 256);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
function der(tag: number, ...content: Buffer[]): Buffer {
  const body = Buffer.concat(content);
  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
}
function oid(text: string): Buffer {
  const parts = text.split('.').map(Number);
  const bytes = [parts[0] * 40 + parts[1]];
  for (const part of parts.slice(2)) {
    const chunk: number[] = [part & 0x7f];
    for (let n = Math.floor(part / 128); n > 0; n = Math.floor(n / 128)) {
      chunk.unshift((n & 0x7f) | 0x80);
    }
    bytes.push(...chunk);
  }
  return der(0x06, Buffer.from(bytes));
}
function utcTime(date: Date): Buffer {
  const text = date.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z';
  return der(0x17, Buffer.from(text, 'ascii'));
}

function makeCertificate(dnsNames: string[]): { key: string; cert: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const ecdsaWithSha256 = der(0x30, oid('1.2.840.10045.4.3.2'));
  const name = der(
    0x30,
    der(0x31, der(0x30, oid('2.5.4.3'), der(0x0c, Buffer.from('local test', 'utf8'))))
  );
  const serial = randomBytes(16);
  serial[0] = (serial[0] & 0x7f) | 0x40;
  const now = Date.now();
  const subjectAltName = der(
    0x30,
    oid('2.5.29.17'),
    der(0x04, der(0x30, ...dnsNames.map((n) => der(0x82, Buffer.from(n, 'ascii')))))
  );
  const basicConstraints = der(
    0x30,
    oid('2.5.29.19'),
    der(0x01, Buffer.from([0xff])),
    der(0x04, der(0x30, der(0x01, Buffer.from([0xff]))))
  );
  const tbs = der(
    0x30,
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, serial),
    ecdsaWithSha256,
    name,
    der(0x30, utcTime(new Date(now - 60_000)), utcTime(new Date(now + 3_600_000))),
    name,
    publicKey.export({ type: 'spki', format: 'der' }),
    der(0xa3, der(0x30, subjectAltName, basicConstraints))
  );
  const signer = createSign('sha256');
  signer.update(tbs);
  const signature = signer.sign(privateKey);
  const certificate = der(
    0x30,
    tbs,
    ecdsaWithSha256,
    der(0x03, Buffer.concat([Buffer.from([0]), signature]))
  );
  const lines = certificate.toString('base64').match(/.{1,64}/g) ?? [];
  const cert = `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
  return { key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), cert };
}

describe('key fetch over local TLS', () => {
  let server: https.Server;
  let port = 0;
  let connections = 0;
  const requests: Array<{ host?: string; servername: string | false; url?: string }> = [];

  beforeAll(async () => {
    const { key, cert } = makeCertificate(['keys.test', 'other.test']);
    expect(new X509Certificate(cert).checkHost('keys.test')).toBe('keys.test');
    state.ca = cert;
    server = https.createServer({ key, cert }, (req, res) => {
      requests.push({
        host: req.headers.host,
        servername: (req.socket as TLSSocket).servername,
        url: req.url,
      });
      if (req.url === '/redirect-other') {
        res.writeHead(302, { location: `https://other.test:${port}/ok` });
        res.end('moved');
        return;
      }
      if (req.url === '/redirect-private') {
        res.writeHead(302, { location: `https://internal.test:${port}/ok` });
        res.end('moved');
        return;
      }
      if (req.url === '/redirect-literal') {
        res.writeHead(302, { location: `https://[::1]:${port}/ok` });
        res.end('moved');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"keys":[]}');
    });
    server.on('connection', () => {
      connections++;
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    state.allow = new Set(['127.0.0.1']);
    state.answers = new Map([
      ['keys.test', ['127.0.0.1']],
      ['other.test', ['127.0.0.1']],
      ['wrong.test', ['127.0.0.1']],
      ['internal.test', ['10.0.0.1']],
    ]);
    state.resolveCalls = [];
    connections = 0;
    requests.length = 0;
  });

  it('fetches from the vetted address with the URL host as server name', async () => {
    const result = await ssrfSafeFetch(`https://keys.test:${port}/jwks`);

    expect(result).toMatchObject({ ok: true, status: 200, body: '{"keys":[]}' });
    expect(requests).toEqual([
      { host: `keys.test:${port}`, servername: 'keys.test', url: '/jwks' },
    ]);
    expect(state.resolveCalls).toEqual(['keys.test']);
  });

  it('refuses a certificate that does not name the URL host', async () => {
    const result = await ssrfSafeFetch(`https://wrong.test:${port}/jwks`);

    expect(result).toMatchObject({ ok: false, reason: 'network_error' });
    expect(requests).toEqual([]);
  });

  it('follows a redirect to a host that passes the check', async () => {
    const result = await ssrfSafeFetch(`https://keys.test:${port}/redirect-other`, {
      allowRedirects: true,
      maxRedirects: 1,
    });

    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(requests.map((r) => r.servername)).toEqual(['keys.test', 'other.test']);
    expect(state.resolveCalls).toEqual(['keys.test', 'other.test']);
  });

  it('refuses a redirect to a host that resolves to a private address', async () => {
    const result = await ssrfSafeFetch(`https://keys.test:${port}/redirect-private`, {
      allowRedirects: true,
      maxRedirects: 1,
    });

    expect(result).toMatchObject({ ok: false, reason: 'private_ip' });
    expect(connections).toBe(1);
  });

  it('refuses an IP-literal host outside global unicast without a lookup or connection', async () => {
    state.allow = new Set();
    state.answers.set('127.0.0.1', ['93.184.216.34']);

    const result = await ssrfSafeFetch(`https://127.0.0.1:${port}/jwks`);

    expect(result).toMatchObject({ ok: false, reason: 'loopback' });
    expect(state.resolveCalls).toEqual([]);
    expect(connections).toBe(0);
  });

  it('refuses a redirect to an IP-literal host outside global unicast', async () => {
    state.answers.set('[::1]', ['127.0.0.1']);

    const result = await ssrfSafeFetch(`https://keys.test:${port}/redirect-literal`, {
      allowRedirects: true,
      maxRedirects: 1,
    });

    expect(result).toMatchObject({ ok: false, reason: 'loopback' });
    expect(state.resolveCalls).toEqual(['keys.test']);
    expect(connections).toBe(1);
  });
});
