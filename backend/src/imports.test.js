import test from 'node:test';
import assert from 'node:assert/strict';
import { inferMapping, normalizePhone, parseCsv, parseDate, transformRows } from './imports.js';

test('CSV keeps quoted commas and newlines', () => {
  assert.deepEqual(parseCsv('Name,Note\n"A, B","hello\nworld"'), [['Name', 'Note'], ['A, B', 'hello\nworld']]);
});

test('date validation rejects impossible dates', () => {
  assert.equal(parseDate('29/02/2024'), '2024-02-29');
  assert.equal(parseDate('29/02/2025'), null);
  assert.equal(parseDate('45292'), '2024-01-01');
});

test('10-digit numbers match the sample SMS API format by default', () => {
  assert.equal(normalizePhone('0000000000'), '0000000000');
  assert.equal(normalizePhone('0000000000', '91'), '910000000000');
});

test('dynamic rows retain extra columns and reject duplicate phones', () => {
  const result = transformRows({ headers: ['Name', 'Phone', 'Birthday', 'Team'], rows: [['A', '0000000000', '01/02/1990', 'Sales'], ['B', '0000000000', '01/02/1991', 'Ops']] }, { name: 'Name', phone: 'Phone', birthday: 'Birthday', dateFormat: 'DMY', countryCode: '91' });
  assert.equal(result.valid[0].data.Team, 'Sales');
  assert.equal(result.invalid[0].reasons[0], 'Duplicate phone in file');
});

test('automatically detects Contact and DOB while keeping extra columns', () => {
  const sheet = { headers: ['Name', 'Contact', 'Gender', 'DOB'], rows: [['Omkar', '7350036456', 'Male', '2003-09-15']] };
  const mapping = inferMapping(sheet);
  assert.deepEqual(mapping, { name: 'Name', phone: 'Contact', birthday: 'DOB', anniversary: '', dateFormat: 'DMY', countryCode: '' });
  assert.equal(transformRows(sheet, mapping).valid[0].data.Gender, 'Male');
});

test('automatically detects anniversary and month-first dates', () => {
  const sheet = { headers: ['Full Name', 'Mobile Number', 'Wedding Date'], rows: [['A', '9876543210', '12/25/2020']] };
  const mapping = inferMapping(sheet);
  assert.equal(mapping.anniversary, 'Wedding Date');
  assert.equal(mapping.dateFormat, 'MDY');
  assert.equal(transformRows(sheet, mapping).valid[0].anniversary, '2020-12-25');
  assert.equal(transformRows(sheet, mapping).valid[0].birth, null);
});

test('automatic import explains missing event columns', () => {
  assert.throws(() => inferMapping({ headers: ['Name', 'Phone'], rows: [['A', '9876543210']] }), /birthdate or anniversary column/i);
});
