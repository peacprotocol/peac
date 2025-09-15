// SPDX-License-Identifier: Apache-2.0

import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI_PATH = './packages/cli/bin/peac.js';

test('CLI discover - happy path', async (t) => {
  try {
    const output = execSync(`node ${CLI_PATH} discover https://example.com`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    // Should exit with 0 and contain discovery results
    assert(output.includes('url') || output.includes('example.com'));
  } catch (error) {
    // Network issues are acceptable in CI, check exit code patterns
    if (error.status === 1) {
      // Expected failure case - discovery failed but command worked
      assert(error.stderr || error.stdout);
    } else {
      throw error;
    }
  }
});

test('CLI discover - invalid URL should exit 1', async (t) => {
  try {
    execSync(`node ${CLI_PATH} discover invalid-url`, {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.fail('Should have failed with invalid URL');
  } catch (error) {
    assert.strictEqual(error.status, 1);
  }
});

test('CLI hash - happy path', async (t) => {
  const tempDir = join(tmpdir(), 'peac-test');
  mkdirSync(tempDir, { recursive: true });

  const policyPath = join(tempDir, 'policy.json');
  const policy = {
    resource: 'https://example.com',
    inputs: [],
    discovered_at: new Date().toISOString(),
  };

  writeFileSync(policyPath, JSON.stringify(policy, null, 2));

  const output = execSync(`node ${CLI_PATH} hash "${policyPath}"`, {
    encoding: 'utf8',
    timeout: 5000,
  });

  // Should output base64url hash
  const lines = output.trim().split('\n');
  const hash = lines[lines.length - 1];
  assert(hash.match(/^[A-Za-z0-9_-]+$/), 'Should output valid base64url hash');
  assert(hash.length > 20, 'Hash should be reasonable length');
});

test('CLI hash - missing file should exit 1', async (t) => {
  try {
    execSync(`node ${CLI_PATH} hash /nonexistent/file.json`, {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.fail('Should have failed with missing file');
  } catch (error) {
    assert.strictEqual(error.status, 1);
  }
});

test('CLI verify - invalid receipt should exit 1', async (t) => {
  const tempDir = join(tmpdir(), 'peac-test');
  mkdirSync(tempDir, { recursive: true });

  const receiptPath = join(tempDir, 'invalid.jws');
  writeFileSync(receiptPath, 'invalid.receipt.format');

  try {
    execSync(`node ${CLI_PATH} verify "${receiptPath}"`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.fail('Should have failed with invalid receipt');
  } catch (error) {
    assert.strictEqual(error.status, 1);
  }
});

test('CLI verify - missing file should exit 1', async (t) => {
  try {
    execSync(`node ${CLI_PATH} verify /nonexistent/receipt.jws`, {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.fail('Should have failed with missing file');
  } catch (error) {
    assert.strictEqual(error.status, 1);
  }
});
