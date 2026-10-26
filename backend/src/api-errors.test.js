import test from 'node:test';
import assert from 'node:assert/strict';
import { clientError, errorResponse } from './api-errors.js';

test('expected request errors keep a useful status and message', () => {
  assert.deepEqual(errorResponse(clientError('Invalid recipient.', 400)), {
    status: 400, error: 'Invalid recipient.',
  });
  assert.deepEqual(errorResponse(clientError('Send limit reached.', 429)), {
    status: 429, error: 'Send limit reached.',
  });
});

test('unexpected errors do not expose database or server details', () => {
  const result = errorResponse(new Error('relation private_table does not exist'));
  assert.equal(result.status, 500);
  assert.doesNotMatch(result.error, /private_table/);
});
