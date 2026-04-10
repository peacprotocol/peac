import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

const { createIssueV1Handler } = await import('../dist/index.js');

// Valid 32-byte seed as base64url (all zeros)
const VALID_SEED = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function buildApp(opts) {
  const app = new Hono();
  app.post('/v1/issue', createIssueV1Handler(opts));
  return app;
}

function issueReq(body, headers = {}) {
  return new Request('http://localhost/v1/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('hosted-issue', () => {
  test('disabled by default: returns 404 when enabled option is false', async () => {
    const app = buildApp({ enabled: false });
    const res = await app.fetch(
      issueReq({
        claims: { iss: 'https://example.com', kind: 'evidence', type: 'org.peacprotocol/test' },
        key_id: 'k1',
        private_key_seed: VALID_SEED,
      })
    );
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.ok(data.detail.includes('disabled'));
  });

  test('disabled by default when env unset and opts omitted', async () => {
    delete process.env.PEAC_HOSTED_ISSUE;
    const app = buildApp(undefined);
    const res = await app.fetch(
      issueReq({
        claims: { iss: 'https://example.com', kind: 'evidence', type: 'org.peacprotocol/test' },
        key_id: 'k1',
        private_key_seed: VALID_SEED,
      })
    );
    assert.strictEqual(res.status, 404, 'must be 404 when env is unset and no opts');
  });

  test('enabled explicitly: does not return 404', async () => {
    const app = buildApp({ enabled: true });
    const res = await app.fetch(
      issueReq({
        claims: { iss: 'https://example.com', kind: 'evidence', type: 'org.peacprotocol/test' },
        key_id: 'k1',
        private_key_seed: VALID_SEED,
      })
    );
    assert.notStrictEqual(res.status, 404);
  });

  test('rejects invalid JSON', async () => {
    const app = buildApp({ enabled: true });
    const res = await app.fetch(
      new Request('http://localhost/v1/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      })
    );
    assert.strictEqual(res.status, 400);
  });

  test('rejects missing claims', async () => {
    const app = buildApp({ enabled: true });
    const res = await app.fetch(issueReq({ key_id: 'k', private_key_seed: VALID_SEED }));
    assert.strictEqual(res.status, 422);
    const data = await res.json();
    assert.strictEqual(data.peac_error_code, 'E_CONSTRAINT_VIOLATION');
  });

  test('rejects invalid seed (wrong length)', async () => {
    const app = buildApp({ enabled: true });
    const res = await app.fetch(
      issueReq({
        claims: { iss: 'https://example.com', kind: 'evidence', type: 'org.peacprotocol/test' },
        key_id: 'k1',
        private_key_seed: 'dG9vc2hvcnQ',
      })
    );
    assert.strictEqual(res.status, 422);
  });

  test('rejects invalid pillar value', async () => {
    const app = buildApp({ enabled: true });
    const res = await app.fetch(
      issueReq({
        claims: {
          iss: 'https://example.com',
          kind: 'evidence',
          type: 'org.peacprotocol/test',
          pillars: ['invalid-pillar'],
        },
        key_id: 'k1',
        private_key_seed: VALID_SEED,
      })
    );
    assert.strictEqual(res.status, 422);
  });

  test('rejects oversized body (actual bytes, not just header)', async () => {
    const app = buildApp({ enabled: true });
    const bigBody =
      '{"claims":{"iss":"x","kind":"evidence","type":"t"},"key_id":"k","private_key_seed":"' +
      'A'.repeat(300000) +
      '"}';
    const res = await app.fetch(
      new Request('http://localhost/v1/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bigBody,
      })
    );
    assert.strictEqual(res.status, 413);
  });

  test('security headers on all responses', async () => {
    const app = buildApp({ enabled: true });
    const res = await app.fetch(issueReq({}));
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(res.headers.get('cache-control'), 'no-store');
  });

  test('error responses never contain key seed material', async () => {
    const app = buildApp({ enabled: true });
    const res = await app.fetch(
      issueReq({
        claims: { iss: 'http://bad-scheme', kind: 'evidence', type: 'test' },
        key_id: 'k',
        private_key_seed: VALID_SEED,
      })
    );
    const text = await res.text();
    assert.ok(!text.includes(VALID_SEED), 'response must not contain key seed');
  });

  test('uses application/problem+json for errors', async () => {
    const app = buildApp({ enabled: true });
    const res = await app.fetch(issueReq({}));
    assert.ok(
      res.headers.get('content-type')?.includes('application/problem+json'),
      'errors must use problem+json'
    );
  });

  test('no key seed material in console output during error path', async () => {
    const app = buildApp({ enabled: true });
    const captured = [];
    const origError = console.error;
    const origLog = console.log;
    const origWarn = console.warn;
    console.error = (...args) => captured.push(args.join(' '));
    console.log = (...args) => captured.push(args.join(' '));
    console.warn = (...args) => captured.push(args.join(' '));
    try {
      await app.fetch(
        issueReq({
          claims: { iss: 'http://bad', kind: 'evidence', type: 'test' },
          key_id: 'k',
          private_key_seed: VALID_SEED,
        })
      );
      const allOutput = captured.join('\n');
      assert.ok(!allOutput.includes(VALID_SEED), 'console output must not contain key seed');
    } finally {
      console.error = origError;
      console.log = origLog;
      console.warn = origWarn;
    }
  });
});
