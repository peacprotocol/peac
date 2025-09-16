// SPDX-License-Identifier: Apache-2.0

import { test } from 'node:test';
import assert from 'node:assert';

test('SSRF protection - reject file: URLs', async () => {
  const { VerifierV13 } = await import('../../apps/api/src/verifier.js');
  const verifier = new VerifierV13();

  const request = {
    receipt: 'dummy.receipt.jws',
    resource: 'file:///etc/passwd',
  };

  const result = await verifier.verify(request);
  assert.strictEqual(result.status, 500);
  assert(result.body.detail.includes('URL not allowed'));
});

test('SSRF protection - reject data: URLs', async () => {
  const { VerifierV13 } = await import('../../apps/api/src/verifier.js');
  const verifier = new VerifierV13();

  const request = {
    receipt: 'dummy.receipt.jws',
    resource: 'data:text/html,<h1>test</h1>',
  };

  const result = await verifier.verify(request);
  assert.strictEqual(result.status, 500);
  assert(result.body.detail.includes('URL not allowed'));
});

test('SSRF protection - reject private IP addresses', async () => {
  const { VerifierV13 } = await import('../../apps/api/src/verifier.js');
  const verifier = new VerifierV13();

  const privateIPs = [
    'http://10.0.0.1/',
    'http://172.16.0.1/',
    'http://192.168.1.1/',
    'http://169.254.0.1/',
  ];

  for (const url of privateIPs) {
    const request = {
      receipt: 'dummy.receipt.jws',
      resource: url,
    };

    const result = await verifier.verify(request);
    assert.strictEqual(result.status, 500, `Should reject ${url}`);
    assert(result.body.detail.includes('URL not allowed'));
  }
});

test('SSRF protection - allow HTTPS URLs', async () => {
  const { VerifierV13 } = await import('../../apps/api/src/verifier.js');
  const verifier = new VerifierV13();

  const request = {
    receipt: 'invalid.jws.format',
    resource: 'https://example.com/',
  };

  const result = await verifier.verify(request);
  // Should not fail on SSRF but on invalid receipt format
  assert.strictEqual(result.status, 400);
  assert(result.body.detail.includes('receipt'));
});

test('SSRF protection - allow localhost HTTP', async () => {
  const { VerifierV13 } = await import('../../apps/api/src/verifier.js');
  const verifier = new VerifierV13();

  const request = {
    receipt: 'invalid.jws.format',
    resource: 'http://localhost:3000/',
  };

  const result = await verifier.verify(request);
  // Should not fail on SSRF but on invalid receipt format
  assert.strictEqual(result.status, 400);
  assert(result.body.detail.includes('receipt'));
});

test('SSRF protection - reject IPv6 ULA and link-local', async () => {
  const { VerifierV13 } = await import('../../apps/api/src/verifier.js');
  const verifier = new VerifierV13();

  const ipv6URLs = [
    'http://[fc00::1]/', // ULA fc00::/7
    'http://[fe80::1]/', // Link-local fe80::/10
  ];

  for (const url of ipv6URLs) {
    const request = {
      receipt: 'dummy.receipt.jws',
      resource: url,
    };

    const result = await verifier.verify(request);
    assert.strictEqual(result.status, 500, `Should reject ${url}`);
    assert(result.body.detail.includes('URL not allowed'));
  }
});

test('SSRF protection - reject non-loopback HTTP', async () => {
  const { VerifierV13 } = await import('../../apps/api/src/verifier.js');
  const verifier = new VerifierV13();

  const request = {
    receipt: 'dummy.receipt.jws',
    resource: 'http://example.com/', // Non-loopback HTTP should be rejected
  };

  const result = await verifier.verify(request);
  assert.strictEqual(result.status, 500);
  assert(result.body.detail.includes('URL not allowed'));
});

test('SSRF protection - enforce redirect limits', async () => {
  const { VerifierV13 } = await import('../../apps/api/src/verifier.js');
  const verifier = new VerifierV13();

  const request = {
    receipt: 'dummy.receipt.jws',
    resource: 'https://httpbin.org/redirect/4', // >3 redirects should be rejected
  };

  const result = await verifier.verify(request, { maxRedirects: 3 });
  assert.strictEqual(result.status, 500);
  assert(result.body.detail.includes('redirect') || result.body.detail.includes('limit'));
});

test('SSRF protection - enforce size limits', async () => {
  const { VerifierV13 } = await import('../../apps/api/src/verifier.js');
  const verifier = new VerifierV13();

  const request = {
    receipt: 'dummy.receipt.jws',
    resource: 'https://httpbin.org/bytes/300000', // >256 KiB should be rejected
  };

  const result = await verifier.verify(request, { maxInputSize: 256 * 1024 });
  assert.strictEqual(result.status, 500);
  assert(result.body.detail.includes('size') || result.body.detail.includes('limit'));
});

test('SSRF protection - enforce timeout limits', async () => {
  const { VerifierV13 } = await import('../../apps/api/src/verifier.js');
  const verifier = new VerifierV13();

  const request = {
    receipt: 'dummy.receipt.jws',
    resource: 'https://httpbin.org/delay/1', // 1s delay should exceed 250ms budget
  };

  const result = await verifier.verify(request, { timeout: 250 });
  assert.strictEqual(result.status, 500);
  assert(result.body.detail.includes('timeout') || result.body.detail.includes('limit'));
});
