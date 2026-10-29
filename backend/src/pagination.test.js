import test from 'node:test';
import assert from 'node:assert/strict';
import { createContactsCursor, readContactsCursor, validDatabaseId } from './pagination.js';

test('contact cursors keep the dataset and search attached to a page', () => {
  const cursor = createContactsCursor({ id: '987', datasetId: '12', search: 'Asha' });
  assert.equal(readContactsCursor(cursor, { datasetId: '12', search: 'Asha' }), '987');
  assert.throws(() => readContactsCursor(cursor, { datasetId: '13', search: 'Asha' }), { status: 409 });
  assert.throws(() => readContactsCursor(cursor, { datasetId: '12', search: 'Ash' }), { status: 409 });
});

test('contact cursors reject invalid and oversized IDs', () => {
  assert.equal(validDatabaseId('9223372036854775807'), true);
  assert.equal(validDatabaseId('9223372036854775808'), false);
  assert.equal(validDatabaseId('1.5'), false);
  assert.throws(() => readContactsCursor('not-a-valid-cursor', { datasetId: '1', search: '' }), { status: 400 });
});
