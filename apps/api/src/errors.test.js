/**
 * @peac/api/errors - Test RFC 9457 Problem Details error generation
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  ProblemError,
  createProblemDetails,
  handleVerifyError,
  validationError,
} from '../dist/errors.js';

test('ProblemError - creates RFC 9457 compliant structure', () => {
  const error = new ProblemError(
    400,
    'https://peac.dev/problems/test',
    'Test Problem',
    'This is a test problem',
    '/test/instance',
    { 'custom-field': 'value' }
  );

  const problemDetails = error.toProblemDetails();

  assert.strictEqual(problemDetails.type, 'https://peac.dev/problems/test');
  assert.strictEqual(problemDetails.title, 'Test Problem');
  assert.strictEqual(problemDetails.status, 400);
  assert.strictEqual(problemDetails.detail, 'This is a test problem');
  assert.strictEqual(problemDetails.instance, '/test/instance');
  assert.strictEqual(problemDetails['custom-field'], 'value');
});

test('createProblemDetails - maps error codes correctly', () => {
  const ctx = {
    code: 'invalid-jws-format',
    category: 'validation',
    details: ['Missing header part'],
  };

  const problem = createProblemDetails(ctx, '/api/verify');

  assert.strictEqual(problem.type, 'https://peac.dev/problems/invalid-jws-format');
  assert.strictEqual(problem.title, 'Invalid JWS Format');
  assert.strictEqual(problem.status, 400);
  assert.strictEqual(problem.instance, '/api/verify');
  assert.strictEqual(problem['peac-error-code'], 'invalid-jws-format');
  assert.deepStrictEqual(problem['validation-failures'], ['Missing header part']);
});

test('createProblemDetails - handles unknown error codes', () => {
  const ctx = {
    code: 'unknown-error',
    category: 'processing',
  };

  const problem = createProblemDetails(ctx);

  assert.strictEqual(problem.type, 'https://peac.dev/problems/unknown-error');
  assert.strictEqual(problem.title, 'Processing Error'); // Falls back to processing-error
  assert.strictEqual(problem.status, 500);
});

test('handleVerifyError - maps signature errors', () => {
  const error = new Error('Invalid signature verification failed');

  const result = handleVerifyError(error, '/api/verify');

  assert.strictEqual(result.status, 422);
  assert.strictEqual(result.body.type, 'https://peac.dev/problems/invalid-signature');
  assert.strictEqual(result.body.title, 'Invalid Signature');
});

test('handleVerifyError - maps JWS format errors', () => {
  const error = new Error('Invalid JWS format detected');

  const result = handleVerifyError(error);

  assert.strictEqual(result.status, 400);
  assert.strictEqual(result.body.type, 'https://peac.dev/problems/invalid-jws-format');
});

test('handleVerifyError - maps unknown key errors', () => {
  const error = new Error('Unknown key ID: missing-key');

  const result = handleVerifyError(error);

  assert.strictEqual(result.status, 422);
  assert.strictEqual(result.body.type, 'https://peac.dev/problems/unknown-key-id');
});

test('validationError - creates structured validation response', () => {
  const details = ['receipt is required', 'invalid format'];

  const result = validationError(details, '/test');

  assert.strictEqual(result.status, 422);
  assert.strictEqual(result.body.type, 'https://peac.dev/problems/schema-validation-failed');
  assert.deepStrictEqual(result.body['validation-failures'], details);
  assert.strictEqual(result.body.instance, '/test');
});

test('handleVerifyError - handles ProblemError instances', () => {
  const problemError = new ProblemError(
    403,
    'https://peac.dev/problems/forbidden',
    'Forbidden',
    'Access denied'
  );

  const result = handleVerifyError(problemError);

  assert.strictEqual(result.status, 403);
  assert.strictEqual(result.body.type, 'https://peac.dev/problems/forbidden');
  assert.strictEqual(result.body.title, 'Forbidden');
});
