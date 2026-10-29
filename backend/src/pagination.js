import { clientError } from './api-errors.js';

const MAX_BIGINT = 9223372036854775807n;

export function validDatabaseId(value) {
  return typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= MAX_BIGINT;
}

export function createContactsCursor({ id, datasetId, search }) {
  return Buffer.from(JSON.stringify({ id: String(id), datasetId: String(datasetId), search })).toString('base64url');
}

export function readContactsCursor(cursor, { datasetId, search }) {
  if (!cursor || cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw clientError('Invalid page cursor.');
  let value;
  try { value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); }
  catch { throw clientError('Invalid page cursor.'); }
  if (!value || !validDatabaseId(value.id) || !validDatabaseId(value.datasetId) || typeof value.search !== 'string') {
    throw clientError('Invalid page cursor.');
  }
  if (value.datasetId !== String(datasetId)) throw clientError('The contact dataset changed. Reloading the first page.', 409);
  if (value.search !== search) throw clientError('The search changed. Reloading the first page.', 409);
  return value.id;
}
