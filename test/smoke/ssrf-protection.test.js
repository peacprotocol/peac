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
